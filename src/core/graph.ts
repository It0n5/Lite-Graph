/**
 * LiteGraph - Core Graph Model
 * 
 * This module defines the fundamental data structures for the graph database:
 * - Node: Represents entities in the graph (like vertices)
 * - Relationship: Represents connections between nodes (like edges)
 * - QueryResult: The return type for Cypher query execution
 * 
 * The design follows Neo4j's property graph model where:
 * - Nodes can have multiple labels (categories) and properties (key-value pairs)
 * - Relationships have a type, direction, and can also have properties
 * - Both nodes and relationships are first-class citizens with their own identities
 * 
 * @module core/graph
 */

/**
 * Represents a node (vertex) in the graph.
 * 
 * Nodes are the primary entities in a graph database. Each node can:
 * - Have zero or more labels (like "Person", "Company", "Product")
 * - Store properties as key-value pairs (like {name: "Alice", age: 30})
 * - Maintain direct references to its relationships (index-free adjacency)
 * 
 * Index-free adjacency means each node stores pointers to its relationships,
 * allowing O(1) traversal to neighbors without needing index lookups.
 * 
 * @example
 * ```typescript
 * const node = new Node(1, ['Person'], { name: 'Alice', age: 30 });
 * node.hasLabel('Person'); // true
 * node.get('name');        // 'Alice'
 * node.set('city', 'NYC'); // Add new property
 * ```
 */
export class Node {
    /** Unique identifier for this node (auto-incremented by Graph) */
    public readonly id: number;

    /** Set of labels categorizing this node (e.g., "Person", "Company") */
    public labels: Set<string>;

    /** Key-value properties stored on this node */
    public properties: Map<string, any>;

    /** 
     * Direct references to all relationships connected to this node.
     * This enables index-free adjacency for O(1) neighbor traversal.
     */
    public relationships: Relationship[] = [];

    /**
     * Create a new Node instance.
     * 
     * @param id - Unique identifier for the node
     * @param labels - Array of labels/categories for the node
     * @param properties - Initial properties as a plain object
     */
    constructor(id: number, labels: string[] = [], properties: Record<string, any> = {}) {
        this.id = id;
        this.labels = new Set(labels);
        this.properties = new Map(Object.entries(properties));
    }

    /**
     * Check if this node has a specific label.
     * 
     * @param label - The label to check for
     * @returns True if the node has this label
     * 
     * @example
     * ```typescript
     * node.hasLabel('Person'); // true or false
     * ```
     */
    hasLabel(label: string): boolean {
        return this.labels.has(label);
    }

    /**
     * Get a property value by key.
     * 
     * @param key - The property key to retrieve
     * @returns The property value, or undefined if not found
     */
    get(key: string): any {
        return this.properties.get(key);
    }

    /**
     * Set a property value.
     * 
     * @param key - The property key
     * @param value - The value to set
     */
    set(key: string, value: any): void {
        this.properties.set(key, value);
    }

    /**
     * Remove a property from this node.
     * 
     * @param key - The property key to remove
     * @returns True if the property existed and was removed
     */
    remove(key: string): boolean {
        return this.properties.delete(key);
    }

    /**
     * Get all outgoing relationships from this node.
     * Outgoing means this node is the startNode of the relationship.
     * 
     * @param type - Optional: filter by relationship type
     * @returns Array of outgoing relationships
     * 
     * @example
     * ```typescript
     * // Get all outgoing KNOWS relationships
     * node.getOutgoingRelationships('KNOWS');
     * ```
     */
    getOutgoingRelationships(type?: string): Relationship[] {
        return this.relationships.filter(r =>
            r.startNode === this && (!type || r.type === type)
        );
    }

    /**
     * Get all incoming relationships to this node.
     * Incoming means this node is the endNode of the relationship.
     * 
     * @param type - Optional: filter by relationship type
     * @returns Array of incoming relationships
     */
    getIncomingRelationships(type?: string): Relationship[] {
        return this.relationships.filter(r =>
            r.endNode === this && (!type || r.type === type)
        );
    }

    /**
     * Convert this node to a plain JSON object for serialization.
     * Used when exporting the graph or returning query results.
     * 
     * @returns Plain object representation of this node
     */
    toJSON(): object {
        return {
            id: this.id,
            labels: Array.from(this.labels),
            properties: Object.fromEntries(this.properties)
        };
    }
}

/**
 * Represents a relationship (edge) between two nodes.
 * 
 * Relationships connect exactly two nodes and have:
 * - A type (like "KNOWS", "WORKS_FOR", "ACTED_IN")
 * - A direction (from startNode to endNode)
 * - Optional properties (like {since: 2020, weight: 0.8})
 * 
 * In Neo4j/Cypher, relationships are written as:
 * (a)-[:KNOWS {since: 2020}]->(b)
 * 
 * @example
 * ```typescript
 * const rel = new Relationship(1, 'KNOWS', alice, bob, { since: 2020 });
 * rel.type;                    // 'KNOWS'
 * rel.get('since');            // 2020
 * rel.getOtherNode(alice);     // bob
 * ```
 */
export class Relationship {
    /** Unique identifier for this relationship */
    public readonly id: number;

    /** The type/label of this relationship (e.g., "KNOWS", "WORKS_FOR") */
    public readonly type: string;

    /** The node where this relationship originates */
    public readonly startNode: Node;

    /** The node where this relationship points to */
    public readonly endNode: Node;

    /** Key-value properties stored on this relationship */
    public properties: Map<string, any>;

    /**
     * Create a new Relationship instance.
     * 
     * @param id - Unique identifier for the relationship
     * @param type - The relationship type (e.g., "KNOWS")
     * @param startNode - The source node
     * @param endNode - The target node
     * @param properties - Initial properties as a plain object
     */
    constructor(
        id: number,
        type: string,
        startNode: Node,
        endNode: Node,
        properties: Record<string, any> = {}
    ) {
        this.id = id;
        this.type = type;
        this.startNode = startNode;
        this.endNode = endNode;
        this.properties = new Map(Object.entries(properties));
    }

    /**
     * Get a property value by key.
     * 
     * @param key - The property key to retrieve
     * @returns The property value, or undefined if not found
     */
    get(key: string): any {
        return this.properties.get(key);
    }

    /**
     * Set a property value.
     * 
     * @param key - The property key
     * @param value - The value to set
     */
    set(key: string, value: any): void {
        this.properties.set(key, value);
    }

    /**
     * Given one node in this relationship, get the other node.
     * Useful for graph traversal when you have the relationship but need the neighbor.
     * 
     * @param node - One of the nodes in this relationship
     * @returns The other node in this relationship
     */
    getOtherNode(node: Node): Node {
        return this.startNode === node ? this.endNode : this.startNode;
    }

    /**
     * Convert this relationship to a plain JSON object for serialization.
     * Note: Nodes are represented by their IDs to avoid circular references.
     * 
     * @returns Plain object representation of this relationship
     */
    toJSON(): object {
        return {
            id: this.id,
            type: this.type,
            startNode: this.startNode.id,
            endNode: this.endNode.id,
            properties: Object.fromEntries(this.properties)
        };
    }
}

/**
 * Result type returned by Cypher query execution.
 * 
 * Contains both the query results (records) and a summary of
 * any mutations that occurred during query execution.
 */
export interface QueryResult {
    /** 
     * Array of result records, where each record is a map of 
     * variable names to their values from the RETURN clause.
     */
    records: Record<string, any>[];

    /** Summary of mutations performed by this query */
    summary: {
        /** Number of nodes created by CREATE clauses */
        nodesCreated: number;
        /** Number of nodes deleted by DELETE clauses */
        nodesDeleted: number;
        /** Number of relationships created */
        relationshipsCreated: number;
        /** Number of relationships deleted */
        relationshipsDeleted: number;
        /** Number of property SET operations */
        propertiesSet: number;
    };
}
