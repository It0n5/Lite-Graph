/**
 * LiteGraph - Abstract Syntax Tree (AST) Node Types
 * 
 * The AST is the output of the parser. It represents the structure of a
 * Cypher query as a tree of nodes that the executor can traverse and execute.
 * 
 * For example, the query:
 *   MATCH (n:Person) WHERE n.age > 21 RETURN n.name
 * 
 * Becomes an AST like:
 * ```
 * QueryNode
 * ├── MatchClause
 * │   └── PatternNode
 * │       └── NodePattern { variable: "n", labels: ["Person"] }
 * ├── WhereClause
 * │   └── BinaryExpression { operator: ">", left: n.age, right: 21 }
 * └── ReturnClause
 *     └── ReturnItem
 *         └── PropertyAccess { object: n, property: "name" }
 * ```
 * 
 * The AST types are designed to:
 * 1. Faithfully represent all Cypher constructs we support
 * 2. Be easy for the executor to traverse and evaluate
 * 3. Use TypeScript discriminated unions for type safety
 * 
 * @module cypher/ast
 */

// ==================== Base Types ====================

/**
 * Union type of all AST node types.
 * Used for generic AST manipulation functions.
 */
export type ASTNode =
    | QueryNode
    | MatchClause
    | WhereClause
    | ReturnClause
    | CreateClause
    | SetClause
    | DeleteClause
    | PatternNode
    | NodePattern
    | RelationshipPattern
    | Expression;

// ==================== Query Structure ====================

/**
 * Root node of the AST representing an entire Cypher query.
 * 
 * A query is simply a sequence of clauses executed in order.
 * For example: MATCH ... WHERE ... RETURN ...
 */
export interface QueryNode {
    type: 'Query';
    /** Ordered list of clauses in this query */
    clauses: Clause[];
}

/**
 * Union of all clause types.
 * Clauses are the main building blocks of a Cypher query.
 */
export type Clause = MatchClause | WhereClause | ReturnClause | CreateClause | SetClause | DeleteClause;

/**
 * MATCH clause - used for pattern matching.
 * 
 * Syntax: MATCH (pattern)
 * 
 * MATCH finds all subgraphs in the database that match the given pattern.
 * Each match creates a row of variable bindings.
 */
export interface MatchClause {
    type: 'Match';
    /** The pattern to match against the graph */
    pattern: PatternNode;
}

/**
 * WHERE clause - used for filtering.
 * 
 * Syntax: WHERE expression
 * 
 * WHERE filters the current rows, keeping only those where the
 * expression evaluates to true.
 */
export interface WhereClause {
    type: 'Where';
    /** Boolean expression that must evaluate to true */
    expression: Expression;
}

/**
 * RETURN clause - specifies query output.
 * 
 * Syntax: RETURN expression [AS alias], ...
 * 
 * RETURN specifies what values to return from the query.
 * Without RETURN, a query returns no data (only side effects).
 */
export interface ReturnClause {
    type: 'Return';
    /** List of items to return */
    items: ReturnItem[];
    /** If true, eliminate duplicate rows (RETURN DISTINCT) */
    distinct?: boolean;
}

/**
 * A single item in a RETURN clause.
 * Each item is an expression, optionally with an alias.
 */
export interface ReturnItem {
    /** The expression to evaluate and return */
    expression: Expression;
    /** Optional alias for this return value (AS alias) */
    alias?: string;
}

/**
 * CREATE clause - creates new nodes and relationships.
 * 
 * Syntax: CREATE (pattern)
 * 
 * CREATE adds new nodes and relationships matching the given pattern.
 * Variables in the pattern can be referenced later in the query.
 */
export interface CreateClause {
    type: 'Create';
    /** The pattern describing what to create */
    pattern: PatternNode;
}

/**
 * SET clause - updates properties.
 * 
 * Syntax: SET property = value, ...
 * 
 * SET updates properties on nodes or relationships that have been
 * matched or created earlier in the query.
 */
export interface SetClause {
    type: 'Set';
    /** List of property assignments */
    items: SetItem[];
}

/**
 * A single property assignment in a SET clause.
 */
export interface SetItem {
    /** The property to set (e.g., n.age) */
    target: PropertyAccess;
    /** The value to assign */
    value: Expression;
}

/**
 * DELETE clause - removes nodes and relationships.
 * 
 * Syntax: DELETE expression, ...
 * 
 * DELETE removes the specified nodes or relationships.
 * When deleting a node, all its relationships are also deleted.
 */
export interface DeleteClause {
    type: 'Delete';
    /** Expressions that evaluate to nodes/relationships to delete */
    expressions: Expression[];
    /** If true, use DETACH DELETE (explicitly delete relationships first) */
    detach?: boolean;
}

// ==================== Pattern Matching ====================

/**
 * A pattern consisting of nodes and relationships.
 * 
 * Patterns describe the structure of subgraphs to match or create.
 * They alternate between node patterns and relationship patterns:
 * (node)-[rel]->(node)-[rel]->(node)
 * 
 * The elements array contains these in order:
 * [NodePattern, RelationshipPattern, NodePattern, RelationshipPattern, NodePattern]
 */
export interface PatternNode {
    type: 'Pattern';
    /** Alternating node and relationship patterns */
    elements: PatternElement[];
}

/**
 * Either a node pattern or relationship pattern.
 */
export type PatternElement = NodePattern | RelationshipPattern;

/**
 * Pattern for matching or creating a node.
 * 
 * Syntax: (variable:Label1:Label2 {key: value, ...})
 * 
 * All parts are optional:
 * - () matches any node
 * - (n) matches any node, binds to variable n
 * - (:Person) matches nodes with Person label
 * - (n:Person {name: "Alice"}) matches Person nodes named Alice
 */
export interface NodePattern {
    type: 'NodePattern';
    /** Variable name to bind this node to */
    variable?: string;
    /** Labels the node must have */
    labels: string[];
    /** Properties the node must have (for MATCH) or will have (for CREATE) */
    properties?: Record<string, any>;
}

/**
 * Pattern for matching or creating a relationship.
 * 
 * Syntax: -[variable:TYPE {props}]->
 * 
 * Direction indicators:
 * - --> outgoing (from left node to right node)
 * - <-- incoming (from right node to left node)
 * - -- no direction (matches either direction)
 */
export interface RelationshipPattern {
    type: 'RelationshipPattern';
    /** Variable name to bind this relationship to */
    variable?: string;
    /** Relationship type (e.g., "KNOWS", "WORKS_FOR") */
    relType?: string;
    /** Direction: outgoing (->), incoming (<-), or both (--) */
    direction: 'outgoing' | 'incoming' | 'both';
    /** Properties on the relationship */
    properties?: Record<string, any>;
    /** Minimum hops for variable-length paths */
    minHops?: number;
    /** Maximum hops for variable-length paths */
    maxHops?: number;
}

// ==================== Expressions ====================

/**
 * Union of all expression types.
 * 
 * Expressions are values that can be evaluated. They appear in:
 * - WHERE clauses (boolean conditions)
 * - RETURN clauses (values to output)
 * - SET clauses (values to assign)
 * - Property maps (values in {key: value})
 */
export type Expression =
    | Literal
    | Identifier
    | PropertyAccess
    | BinaryExpression
    | UnaryExpression
    | FunctionCall
    | ListExpression;

/**
 * A literal value (string, number, boolean, or null).
 * 
 * Examples: "hello", 42, 3.14, true, false, null
 */
export interface Literal {
    type: 'Literal';
    value: string | number | boolean | null;
}

/**
 * A variable reference.
 * 
 * Identifiers refer to variables bound by MATCH or CREATE patterns.
 * Examples: n, person, r
 */
export interface Identifier {
    type: 'Identifier';
    /** The variable name */
    name: string;
}

/**
 * Property access on a node or relationship.
 * 
 * Syntax: object.property
 * Examples: n.name, person.age, r.since
 */
export interface PropertyAccess {
    type: 'PropertyAccess';
    /** The object (usually an Identifier) */
    object: Expression;
    /** The property name to access */
    property: string;
}

/**
 * Binary expression with two operands.
 * 
 * Used for comparisons (=, <>, <, >, <=, >=),
 * boolean logic (AND, OR), and arithmetic (+, -, *, /).
 */
export interface BinaryExpression {
    type: 'BinaryExpression';
    /** The operator */
    operator: '=' | '<>' | '<' | '>' | '<=' | '>=' | 'AND' | 'OR' | '+' | '-' | '*' | '/';
    /** Left operand */
    left: Expression;
    /** Right operand */
    right: Expression;
}

/**
 * Unary expression with one operand.
 * 
 * Used for NOT (boolean negation) and - (numeric negation).
 */
export interface UnaryExpression {
    type: 'UnaryExpression';
    operator: 'NOT' | '-';
    operand: Expression;
}

/**
 * Function call expression.
 * 
 * Syntax: functionName(arg1, arg2, ...)
 * Examples: count(*), sum(n.value), toUpper(n.name)
 */
export interface FunctionCall {
    type: 'FunctionCall';
    /** Function name */
    name: string;
    /** Function arguments */
    arguments: Expression[];
}

/**
 * List literal expression.
 * 
 * Syntax: [element1, element2, ...]
 * Examples: [1, 2, 3], ["a", "b"], []
 */
export interface ListExpression {
    type: 'ListExpression';
    elements: Expression[];
}
