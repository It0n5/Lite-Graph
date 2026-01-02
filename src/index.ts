/**
 * LiteGraph - Lightweight Neo4j-Compatible Graph Database
 * 
 * A minimal, fast graph database with Cypher query support.
 * Compatible with Neo4j export formats (JSON, GraphML).
 * 
 * @example
 * ```typescript
 * import { LiteGraph } from 'litegraph';
 * 
 * const db = new LiteGraph();
 * 
 * // Create data with Cypher
 * db.query('CREATE (a:Person {name: "Alice", age: 30})');
 * db.query('CREATE (b:Person {name: "Bob", age: 25})');
 * db.query(`
 *   MATCH (a:Person {name: "Alice"}), (b:Person {name: "Bob"})
 *   CREATE (a)-[:KNOWS {since: 2020}]->(b)
 * `);
 * 
 * // Query data
 * const result = db.query('MATCH (p:Person) WHERE p.age > 20 RETURN p.name, p.age');
 * console.log(result.records);
 * 
 * // Export for LLM context (GraphRAG)
 * console.log(db.toNaturalLanguage());
 * // "Alice knows Bob since 2020."
 * 
 * // Save to file
 * db.saveToFile('my-graph.json');
 * ```
 */

import { Graph } from './core/storage';
import { Node, Relationship, QueryResult } from './core/graph';
import { Executor } from './cypher/executor';
import { JsonCompat } from './compat/json';
import { GraphMLCompat } from './compat/graphml';
import * as GraphRAG from './compat/graphrag';
import * as fs from 'fs';

export { Node, Relationship, QueryResult } from './core/graph';
export { Graph } from './core/storage';
export * as GraphRAG from './compat/graphrag';

/** Main LiteGraph database class */
export class LiteGraph {
    private graph: Graph;
    private executor: Executor;
    private jsonCompat: JsonCompat;
    private graphmlCompat: GraphMLCompat;

    constructor() {
        this.graph = new Graph();
        this.executor = new Executor(this.graph);
        this.jsonCompat = new JsonCompat(this.graph);
        this.graphmlCompat = new GraphMLCompat(this.graph);
    }

    // ==================== Cypher Query Interface ====================

    /** Execute a Cypher query */
    query(cypher: string): QueryResult {
        return this.executor.execute(cypher);
    }

    // ==================== Direct Graph Access ====================

    /** Create a node directly (without Cypher) */
    createNode(labels: string[] = [], properties: Record<string, any> = {}): Node {
        return this.graph.createNode(labels, properties);
    }

    /** Create a relationship directly (without Cypher) */
    createRelationship(
        startNode: Node,
        endNode: Node,
        type: string,
        properties: Record<string, any> = {}
    ): Relationship {
        return this.graph.createRelationship(startNode, endNode, type, properties);
    }

    /** Get a node by ID */
    getNode(id: number): Node | undefined {
        return this.graph.getNode(id);
    }

    /** Get all nodes */
    getAllNodes(): Node[] {
        return this.graph.getAllNodes();
    }

    /** Get nodes by label */
    getNodesByLabel(label: string): Node[] {
        return this.graph.getNodesByLabel(label);
    }

    /** Get all relationships */
    getAllRelationships(): Relationship[] {
        return this.graph.getAllRelationships();
    }

    /** Delete a node and its relationships */
    deleteNode(node: Node): boolean {
        return this.graph.deleteNode(node);
    }

    /** Delete a relationship */
    deleteRelationship(rel: Relationship): boolean {
        return this.graph.deleteRelationship(rel);
    }

    /** Clear the entire graph */
    clear(): void {
        this.graph.clear();
    }

    /** Get graph statistics */
    getStats(): { nodeCount: number; relationshipCount: number; labels: string[]; types: string[] } {
        return this.graph.getStats();
    }

    // ==================== GraphRAG / LLM Context ====================

    /**
     * Convert graph to triple format: (Subject)-[Predicate]->(Object)
     * Compact format that's easy for LLMs to parse.
     */
    toTriples(options?: GraphRAG.SerializationOptions): string {
        return GraphRAG.toTriples(this.graph, options);
    }

    /**
     * Convert graph to natural language sentences.
     * Most readable format for humans and LLMs.
     * @example "Alice knows Bob since 2020."
     */
    toNaturalLanguage(options?: GraphRAG.SerializationOptions): string {
        return GraphRAG.toNaturalLanguage(this.graph, options);
    }

    /**
     * Convert graph to Markdown tables.
     * Great for structured display.
     */
    toMarkdownTables(options?: GraphRAG.SerializationOptions): string {
        return GraphRAG.toMarkdown(this.graph, options);
    }

    /**
     * Describe the graph schema (labels, relationship types, counts).
     * Useful for helping LLMs understand graph structure.
     */
    describeSchema(): string {
        return GraphRAG.describeSchema(this.graph);
    }

    /**
     * Extract context around a specific node (N-hop neighborhood).
     * The most useful function for GraphRAG - extracts relevant
     * context around an entity for inclusion in LLM prompts.
     */
    extractContext(
        nodeId: number,
        hops: number = 2,
        format: 'triples' | 'natural' | 'markdown' = 'natural'
    ): string {
        return GraphRAG.extractContext(this.graph, nodeId, hops, format);
    }

    /**
     * Generate a complete LLM context block.
     * Combines schema + relevant context for prompt insertion.
     */
    generateLLMContext(focusNodeIds?: number[], hops: number = 2): string {
        return GraphRAG.generateLLMContext(this.graph, focusNodeIds, hops);
    }

    // ==================== Persistence ====================

    /** Save graph to JSON file */
    saveToFile(path: string, pretty: boolean = true): void {
        this.jsonCompat.exportToFile(path, pretty);
    }

    /** Load graph from JSON file */
    loadFromFile(path: string, clearExisting: boolean = true): void {
        this.jsonCompat.importFromFile(path, clearExisting);
    }

    /** Export graph to JSON string */
    toJSON(pretty: boolean = true): string {
        return this.jsonCompat.exportToString(pretty);
    }

    /** Import graph from JSON string */
    fromJSON(json: string, clearExisting: boolean = true): void {
        this.jsonCompat.importFromString(json, clearExisting);
    }

    // ==================== Neo4j Compatibility ====================

    /** Export to GraphML format */
    exportGraphML(): string {
        return this.graphmlCompat.exportToString();
    }

    /** Save to GraphML file */
    saveToGraphML(path: string): void {
        this.graphmlCompat.exportToFile(path);
    }

    /** Import from GraphML string */
    importGraphML(xml: string, clearExisting: boolean = true): void {
        this.graphmlCompat.importFromString(xml, clearExisting);
    }

    /** Load from GraphML file */
    loadFromGraphML(path: string, clearExisting: boolean = true): void {
        this.graphmlCompat.importFromFile(path, clearExisting);
    }

    /** Import from Neo4j JSONL export format */
    importNeo4jJsonLines(content: string, clearExisting: boolean = true): void {
        this.jsonCompat.importFromJsonLines(content, clearExisting);
    }
}

// Default export
export default LiteGraph;

