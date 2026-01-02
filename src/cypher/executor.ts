/**
 * LiteGraph - Cypher Query Executor
 * 
 * The executor is the final stage of query processing. It takes the parsed
 * AST from the parser and executes it against the graph database.
 * 
 * The execution process:
 * 1. Receives a Cypher query string
 * 2. Parses it into an AST using the Parser
 * 3. Executes each clause in sequence, maintaining variable bindings
 * 4. Returns a QueryResult with records and mutation summary
 * 
 * **Key Concept: Bindings**
 * 
 * As queries execute, variables get bound to graph elements. For example:
 * ```cypher
 * MATCH (n:Person) WHERE n.age > 21 RETURN n
 * ```
 * 
 * After MATCH: bindings might be [{n: Node1}, {n: Node2}, {n: Node3}]
 * After WHERE: bindings filtered to [{n: Node2}, {n: Node3}]  
 * RETURN: outputs the values of n for each binding
 * 
 * Each "row" of results is a separate Bindings map.
 * 
 * @module cypher/executor
 */

import { Graph } from '../core/storage';
import { Node, Relationship, QueryResult } from '../core/graph';
import { Parser } from './parser';
import {
    QueryNode, Clause, MatchClause, WhereClause, ReturnClause, CreateClause,
    SetClause, DeleteClause, PatternNode, NodePattern, RelationshipPattern,
    Expression, Literal, Identifier, PropertyAccess, BinaryExpression, PatternElement
} from './ast';
import { validateQueryLength, createSafeError } from '../utils/security';

/**
 * Represents a single row of variable bindings during query execution.
 * Maps variable names (from the query) to graph elements (nodes/relationships).
 * 
 * Example: { "n" -> Node(id=1), "r" -> Relationship(id=1), "m" -> Node(id=2) }
 */
type Bindings = Map<string, Node | Relationship>;

/**
 * Cypher query executor.
 * 
 * Takes query strings, parses them, and executes them against a graph.
 * 
 * @example
 * ```typescript
 * const graph = new Graph();
 * const executor = new Executor(graph);
 * 
 * // Execute a query
 * const result = executor.execute('CREATE (n:Person {name: "Alice"})');
 * console.log(result.summary.nodesCreated); // 1
 * 
 * // Query with results
 * const result2 = executor.execute('MATCH (n:Person) RETURN n.name');
 * console.log(result2.records); // [{n.name: "Alice"}]
 * ```
 */
export class Executor {
    /** Reference to the graph database to execute against */
    private graph: Graph;

    /** Parser instance for converting query strings to AST */
    private parser: Parser;

    /**
     * Create a new Executor for the given graph.
     * 
     * @param graph - The graph database to execute queries against
     */
    constructor(graph: Graph) {
        this.graph = graph;
        this.parser = new Parser();
    }

    /**
     * Execute a Cypher query string.
     * 
     * This is the main entry point. It parses the query and executes
     * all clauses, returning the results and a summary of any mutations.
     * 
     * @param query - The Cypher query string to execute
     * @returns QueryResult with records and mutation summary
     */
    execute(query: string): QueryResult {
        // Validate query length to prevent DoS attacks
        validateQueryLength(query);

        // Parse the query into an AST
        const ast = this.parser.parse(query);
        // Execute the AST against the graph
        return this.executeQuery(ast);
    }

    /**
     * Execute a parsed query AST.
     * 
     * Processes each clause in order, maintaining bindings between clauses.
     * Clauses can:
     * - Add bindings (MATCH, CREATE)
     * - Filter bindings (WHERE)
     * - Modify graph (CREATE, SET, DELETE)
     * - Produce output (RETURN)
     * 
     * @param query - The parsed QueryNode AST
     * @returns QueryResult with records and mutation summary
     */
    private executeQuery(query: QueryNode): QueryResult {
        // Start with a single empty binding (no variables bound yet)
        let bindings: Bindings[] = [new Map()];

        // Track the RETURN clause to process at the end
        let returnItems: ReturnClause | undefined;

        // Initialize mutation counters
        const summary = {
            nodesCreated: 0,
            nodesDeleted: 0,
            relationshipsCreated: 0,
            relationshipsDeleted: 0,
            propertiesSet: 0
        };

        // Execute each clause in sequence
        for (const clause of query.clauses) {
            switch (clause.type) {
                case 'Match':
                    // MATCH: Find patterns in the graph, expand bindings
                    bindings = this.executeMatch(clause, bindings);
                    break;

                case 'Where':
                    // WHERE: Filter bindings based on condition
                    bindings = this.executeWhere(clause, bindings);
                    break;

                case 'Create':
                    // CREATE: Add nodes/relationships, expand bindings
                    const createResult = this.executeCreate(clause, bindings);
                    bindings = createResult.bindings;
                    summary.nodesCreated += createResult.nodesCreated;
                    summary.relationshipsCreated += createResult.relationshipsCreated;
                    break;

                case 'Set':
                    // SET: Update properties on existing elements
                    summary.propertiesSet += this.executeSet(clause, bindings);
                    break;

                case 'Delete':
                    // DELETE: Remove nodes/relationships from graph
                    const deleteResult = this.executeDelete(clause, bindings);
                    summary.nodesDeleted += deleteResult.nodesDeleted;
                    summary.relationshipsDeleted += deleteResult.relationshipsDeleted;
                    break;

                case 'Return':
                    // RETURN: Save for processing after all other clauses
                    returnItems = clause;
                    break;
            }
        }

        // Execute RETURN to produce output records
        const records = returnItems ? this.executeReturn(returnItems, bindings) : [];
        return { records, summary };
    }

    // ==================== MATCH Execution ====================

    /**
     * Execute a MATCH clause.
     * 
     * MATCH finds all subgraphs matching the pattern and binds variables.
     * Each match produces a new row of bindings.
     * 
     * @param clause - The MatchClause to execute
     * @param existingBindings - Current bindings from previous clauses
     * @returns Expanded bindings with matched elements
     */
    private executeMatch(clause: MatchClause, existingBindings: Bindings[]): Bindings[] {
        const results: Bindings[] = [];

        // For each existing binding row, find all matching patterns
        for (const bindings of existingBindings) {
            const matchResults = this.matchPattern(clause.pattern, bindings);
            results.push(...matchResults);
        }

        return results;
    }

    /**
     * Match a pattern against the graph, starting from given bindings.
     * 
     * This is the core pattern matching algorithm:
     * 1. Match the first node pattern
     * 2. For each matched node, follow relationships to the next node
     * 3. Continue until the entire pattern is matched
     * 
     * @param pattern - The pattern to match
     * @param bindings - Starting bindings (may have pre-bound variables)
     * @returns All binding rows that match the pattern
     */
    private matchPattern(pattern: PatternNode, bindings: Bindings): Bindings[] {
        const elements = pattern.elements;
        if (elements.length === 0) return [bindings];

        // Start by matching the first node in the pattern
        const firstNode = elements[0] as NodePattern;
        const startNodes = this.findMatchingNodes(firstNode, bindings);

        // Create initial bindings for each matching start node
        let currentBindings: Bindings[] = startNodes.map(node => {
            const newBindings = new Map(bindings);
            if (firstNode.variable) {
                newBindings.set(firstNode.variable, node);
            }
            return newBindings;
        });

        // Process alternating relationships and nodes
        // Pattern: [node, rel, node, rel, node, ...]
        // Indexes:   0     1     2     3     4
        for (let i = 1; i < elements.length; i += 2) {
            const relPattern = elements[i] as RelationshipPattern;
            const nodePattern = elements[i + 1] as NodePattern;
            currentBindings = this.expandRelationships(currentBindings, relPattern, nodePattern);
        }

        return currentBindings;
    }

    /**
     * Find all nodes matching a node pattern.
     * 
     * Uses label indexes for efficient lookup when labels are specified.
     * Falls back to scanning all nodes if no labels given.
     * 
     * @param pattern - The node pattern to match
     * @param bindings - Current bindings (may pre-bind the variable)
     * @returns Array of matching nodes
     */
    private findMatchingNodes(pattern: NodePattern, bindings: Bindings): Node[] {
        // If the variable is already bound, just check if it matches
        if (pattern.variable && bindings.has(pattern.variable)) {
            const bound = bindings.get(pattern.variable);
            if (bound instanceof Node && this.nodeMatchesPattern(bound, pattern)) {
                return [bound];
            }
            return [];
        }

        // Find candidate nodes using label index if available
        let candidates: Node[];

        if (pattern.labels.length > 0) {
            // Start with nodes having the first label (uses index)
            candidates = this.graph.getNodesByLabel(pattern.labels[0]);
            // Filter for additional labels
            for (let i = 1; i < pattern.labels.length; i++) {
                candidates = candidates.filter(n => n.hasLabel(pattern.labels[i]));
            }
        } else {
            // No labels specified - must scan all nodes
            candidates = this.graph.getAllNodes();
        }

        // Filter by property matches
        if (pattern.properties) {
            candidates = candidates.filter(n => this.matchProperties(n.properties, pattern.properties!));
        }

        return candidates;
    }

    /**
     * Check if a node matches a node pattern.
     * 
     * @param node - The node to check
     * @param pattern - The pattern to match against
     * @returns True if the node matches
     */
    private nodeMatchesPattern(node: Node, pattern: NodePattern): boolean {
        // Check all required labels
        for (const label of pattern.labels) {
            if (!node.hasLabel(label)) return false;
        }
        // Check all required properties
        if (pattern.properties && !this.matchProperties(node.properties, pattern.properties)) {
            return false;
        }
        return true;
    }

    /**
     * Check if node properties match pattern properties.
     * 
     * All properties in the pattern must exist with matching values.
     * Extra properties on the node are allowed.
     * 
     * @param nodeProps - The node's properties
     * @param patternProps - Required property values
     * @returns True if all pattern properties match
     */
    private matchProperties(nodeProps: Map<string, any>, patternProps: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(patternProps)) {
            if (nodeProps.get(key) !== value) return false;
        }
        return true;
    }

    /**
     * Expand bindings by following relationship patterns.
     * 
     * For each current binding:
     * 1. Get the last matched node
     * 2. Find its relationships (filtered by type and direction)
     * 3. Check if the other node matches the next node pattern
     * 4. Create new bindings with the relationship and next node
     * 
     * @param bindingsList - Current bindings to expand
     * @param relPattern - The relationship pattern to follow
     * @param nodePattern - The next node pattern to match
     * @returns Expanded bindings
     */
    private expandRelationships(
        bindingsList: Bindings[],
        relPattern: RelationshipPattern,
        nodePattern: NodePattern
    ): Bindings[] {
        const results: Bindings[] = [];

        for (const bindings of bindingsList) {
            // Get the last node we matched (the one we're traversing from)
            const lastVar = this.getLastNodeVar(bindings);
            if (!lastVar) continue;

            const lastNode = bindings.get(lastVar) as Node;

            // Get relationships based on specified direction
            let rels: Relationship[];
            if (relPattern.direction === 'outgoing') {
                rels = lastNode.getOutgoingRelationships(relPattern.relType);
            } else if (relPattern.direction === 'incoming') {
                rels = lastNode.getIncomingRelationships(relPattern.relType);
            } else {
                // 'both' direction - get all relationships
                rels = [...lastNode.getOutgoingRelationships(relPattern.relType),
                ...lastNode.getIncomingRelationships(relPattern.relType)];
            }

            // For each matching relationship, check the other node
            for (const rel of rels) {
                const otherNode = rel.getOtherNode(lastNode);

                // Check if the other node matches the next pattern
                if (!this.nodeMatchesPattern(otherNode, nodePattern)) continue;

                // Check if the next node is already bound to something else
                if (nodePattern.variable && bindings.has(nodePattern.variable)) {
                    if (bindings.get(nodePattern.variable) !== otherNode) continue;
                }

                // Create new bindings with the relationship and node
                const newBindings = new Map(bindings);
                if (relPattern.variable) {
                    newBindings.set(relPattern.variable, rel);
                }
                if (nodePattern.variable) {
                    newBindings.set(nodePattern.variable, otherNode);
                }
                results.push(newBindings);
            }
        }

        return results;
    }

    /**
     * Get the variable name of the last bound node.
     * Used to determine which node to traverse from.
     * 
     * @param bindings - Current bindings
     * @returns Variable name of last node, or undefined
     */
    private getLastNodeVar(bindings: Bindings): string | undefined {
        let lastVar: string | undefined;
        for (const [key, value] of bindings) {
            if (value instanceof Node) lastVar = key;
        }
        return lastVar;
    }

    // ==================== WHERE Execution ====================

    /**
     * Execute a WHERE clause.
     * 
     * Filters bindings to only those where the expression evaluates to true.
     * 
     * @param clause - The WhereClause to execute
     * @param bindings - Current bindings to filter
     * @returns Filtered bindings
     */
    private executeWhere(clause: WhereClause, bindings: Bindings[]): Bindings[] {
        return bindings.filter(b => this.evaluateExpression(clause.expression, b) === true);
    }

    /**
     * Evaluate an expression in the context of a binding row.
     * 
     * Handles:
     * - Literals: Return the value directly
     * - Identifiers: Look up in bindings
     * - Property access: Get property from bound element
     * - Binary expressions: Evaluate both sides and apply operator
     * 
     * @param expr - The expression to evaluate
     * @param bindings - Current binding context
     * @returns The evaluated value
     */
    private evaluateExpression(expr: Expression, bindings: Bindings): any {
        switch (expr.type) {
            case 'Literal':
                // Return literal value directly
                return expr.value;

            case 'Identifier':
                // Look up variable in bindings
                return bindings.get(expr.name);

            case 'PropertyAccess':
                // Evaluate the object, then get its property
                const obj = this.evaluateExpression(expr.object, bindings);
                if (obj instanceof Node || obj instanceof Relationship) {
                    return obj.get(expr.property);
                }
                return undefined;

            case 'BinaryExpression':
                return this.evaluateBinaryExpression(expr, bindings);

            default:
                return undefined;
        }
    }

    /**
     * Evaluate a binary expression (a op b).
     * 
     * @param expr - The binary expression
     * @param bindings - Current binding context
     * @returns The result of applying the operator
     */
    private evaluateBinaryExpression(expr: BinaryExpression, bindings: Bindings): any {
        const left = this.evaluateExpression(expr.left, bindings);
        const right = this.evaluateExpression(expr.right, bindings);

        switch (expr.operator) {
            case '=': return left === right;
            case '<>': return left !== right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
            case 'AND': return left && right;
            case 'OR': return left || right;
            case '+': return left + right;
            default: return undefined;
        }
    }

    // ==================== CREATE Execution ====================

    /**
     * Execute a CREATE clause.
     * 
     * Creates new nodes and relationships as specified by the pattern.
     * If a variable is already bound, uses that node instead of creating.
     * 
     * @param clause - The CreateClause to execute
     * @param bindings - Current bindings
     * @returns New bindings and creation counts
     */
    private executeCreate(
        clause: CreateClause,
        bindings: Bindings[]
    ): { bindings: Bindings[]; nodesCreated: number; relationshipsCreated: number } {
        let nodesCreated = 0;
        let relationshipsCreated = 0;
        const newBindings: Bindings[] = [];

        // Execute CREATE for each binding row
        for (const binding of bindings) {
            const result = this.createPattern(clause.pattern, binding);
            newBindings.push(result.bindings);
            nodesCreated += result.nodesCreated;
            relationshipsCreated += result.relationshipsCreated;
        }

        return { bindings: newBindings.length > 0 ? newBindings : [new Map()], nodesCreated, relationshipsCreated };
    }

    /**
     * Create nodes and relationships from a pattern.
     * 
     * Walks through the pattern:
     * - For nodes: Create new or use existing if variable is bound
     * - For relationships: Create between current and next node
     * 
     * @param pattern - The pattern to create
     * @param bindings - Current bindings (may have pre-bound variables)
     * @returns Updated bindings and creation counts
     */
    private createPattern(
        pattern: PatternNode,
        bindings: Bindings
    ): { bindings: Bindings; nodesCreated: number; relationshipsCreated: number } {
        const newBindings = new Map(bindings);
        let nodesCreated = 0;
        let relationshipsCreated = 0;

        let lastNode: Node | undefined;

        for (let i = 0; i < pattern.elements.length; i++) {
            const element = pattern.elements[i];

            if (element.type === 'NodePattern') {
                // Check if variable is already bound to an existing node
                if (element.variable && newBindings.has(element.variable)) {
                    lastNode = newBindings.get(element.variable) as Node;
                } else {
                    // Create a new node
                    const node = this.graph.createNode(element.labels, element.properties || {});
                    nodesCreated++;
                    if (element.variable) {
                        newBindings.set(element.variable, node);
                    }
                    lastNode = node;
                }
            } else if (element.type === 'RelationshipPattern' && lastNode) {
                // Get or create the next node
                const nextElement = pattern.elements[i + 1] as NodePattern;
                let nextNode: Node;

                if (nextElement.variable && newBindings.has(nextElement.variable)) {
                    nextNode = newBindings.get(nextElement.variable) as Node;
                } else {
                    nextNode = this.graph.createNode(nextElement.labels, nextElement.properties || {});
                    nodesCreated++;
                    if (nextElement.variable) {
                        newBindings.set(nextElement.variable, nextNode);
                    }
                }

                // Create the relationship
                const relType = element.relType || 'RELATED';
                let rel: Relationship;

                // Respect relationship direction
                if (element.direction === 'incoming') {
                    rel = this.graph.createRelationship(nextNode, lastNode, relType, element.properties || {});
                } else {
                    rel = this.graph.createRelationship(lastNode, nextNode, relType, element.properties || {});
                }

                relationshipsCreated++;
                if (element.variable) {
                    newBindings.set(element.variable, rel);
                }

                lastNode = nextNode;
                i++; // Skip the next node since we already processed it
            }
        }

        return { bindings: newBindings, nodesCreated, relationshipsCreated };
    }

    // ==================== SET Execution ====================

    /**
     * Execute a SET clause.
     * 
     * Updates properties on matched nodes/relationships.
     * 
     * @param clause - The SetClause to execute
     * @param bindings - Current bindings with target elements
     * @returns Number of properties set
     */
    private executeSet(clause: SetClause, bindings: Bindings[]): number {
        let propertiesSet = 0;

        for (const binding of bindings) {
            for (const item of clause.items) {
                // Get the target node/relationship
                const target = this.evaluateExpression(item.target.object, binding);
                if (target instanceof Node || target instanceof Relationship) {
                    // Evaluate and set the new value
                    const value = this.evaluateExpression(item.value, binding);
                    target.set(item.target.property, value);
                    propertiesSet++;
                }
            }
        }

        return propertiesSet;
    }

    // ==================== DELETE Execution ====================

    /**
     * Execute a DELETE clause.
     * 
     * Collects all unique elements to delete, then deletes them.
     * Using a Set prevents double-deletion if the same element
     * appears in multiple binding rows.
     * 
     * @param clause - The DeleteClause to execute
     * @param bindings - Current bindings with elements to delete
     * @returns Deletion counts
     */
    private executeDelete(
        clause: DeleteClause,
        bindings: Bindings[]
    ): { nodesDeleted: number; relationshipsDeleted: number } {
        let nodesDeleted = 0;
        let relationshipsDeleted = 0;

        // Collect all unique elements to delete
        const toDelete = new Set<Node | Relationship>();

        for (const binding of bindings) {
            for (const expr of clause.expressions) {
                const target = this.evaluateExpression(expr, binding);
                if (target instanceof Node || target instanceof Relationship) {
                    toDelete.add(target);
                }
            }
        }

        // Delete each element
        for (const item of toDelete) {
            if (item instanceof Node) {
                if (this.graph.deleteNode(item)) nodesDeleted++;
            } else {
                if (this.graph.deleteRelationship(item)) relationshipsDeleted++;
            }
        }

        return { nodesDeleted, relationshipsDeleted };
    }

    // ==================== RETURN Execution ====================

    /**
     * Execute a RETURN clause.
     * 
     * Produces output records by evaluating return expressions
     * for each binding row.
     * 
     * @param clause - The ReturnClause to execute
     * @param bindings - Current bindings to return from
     * @returns Array of output records
     */
    private executeReturn(clause: ReturnClause, bindings: Bindings[]): Record<string, any>[] {
        return bindings.map(binding => {
            const record: Record<string, any> = {};

            for (const item of clause.items) {
                // Determine the key for this return item
                const key = item.alias || this.expressionToString(item.expression);

                // Special case: RETURN * returns all bound variables
                if (item.expression.type === 'Identifier' && item.expression.name === '*') {
                    for (const [varName, value] of binding) {
                        if (value instanceof Node) {
                            record[varName] = value.toJSON();
                        } else if (value instanceof Relationship) {
                            record[varName] = value.toJSON();
                        }
                    }
                } else {
                    // Evaluate the expression and add to record
                    const value = this.evaluateExpression(item.expression, binding);
                    if (value instanceof Node) {
                        record[key] = value.toJSON();
                    } else if (value instanceof Relationship) {
                        record[key] = value.toJSON();
                    } else {
                        record[key] = value;
                    }
                }
            }

            return record;
        });
    }

    /**
     * Convert an expression to a string for use as a result key.
     * 
     * Used when no alias is provided in RETURN.
     * 
     * @param expr - The expression to stringify
     * @returns String representation
     */
    private expressionToString(expr: Expression): string {
        switch (expr.type) {
            case 'Identifier':
                return expr.name;
            case 'PropertyAccess':
                return `${this.expressionToString(expr.object)}.${expr.property}`;
            default:
                return 'expr';
        }
    }
}
