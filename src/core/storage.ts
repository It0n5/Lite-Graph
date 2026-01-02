/**
 * LiteGraph - In-Memory Storage Layer
 * 
 * This module provides the main Graph class that serves as the container
 * for all nodes and relationships. It handles:
 * - Creating, reading, updating, and deleting nodes and relationships
 * - Maintaining indexes for fast lookups by label and relationship type
 * - Serialization to/from JSON for persistence
 * 
 * The storage is entirely in-memory for simplicity and performance.
 * For persistence, use the toJSON/fromJSON methods or the compatibility
 * layer in the compat/ folder.
 * 
 * @module core/storage
 */

import { Node, Relationship, QueryResult } from './graph';

/**
 * Main graph database container class.
 * 
 * The Graph class is the core of LiteGraph. It stores all nodes and
 * relationships and provides methods to manipulate them. Key features:
 * 
 * - **Auto-incrementing IDs**: Nodes and relationships get unique IDs automatically
 * - **Label indexing**: Fast lookup of nodes by their labels
 * - **Type indexing**: Fast lookup of relationships by their type
 * - **Index-free adjacency**: Nodes store direct references to their relationships
 * 
 * @example
 * ```typescript
 * const graph = new Graph();
 * 
 * // Create nodes
 * const alice = graph.createNode(['Person'], { name: 'Alice' });
 * const bob = graph.createNode(['Person'], { name: 'Bob' });
 * 
 * // Create relationship
 * graph.createRelationship(alice, bob, 'KNOWS', { since: 2020 });
 * 
 * // Query by label
 * const people = graph.getNodesByLabel('Person');
 * 
 * // Save to JSON
 * const json = graph.toJSON();
 * ```
 */
export class Graph {
    // ==================== Private Storage ====================

    /** Map of node ID to Node instance for O(1) lookup */
    private nodes: Map<number, Node> = new Map();

    /** Map of relationship ID to Relationship instance for O(1) lookup */
    private relationships: Map<number, Relationship> = new Map();

    /** Counter for auto-generating unique node IDs */
    private nextNodeId: number = 1;

    /** Counter for auto-generating unique relationship IDs */
    private nextRelationshipId: number = 1;

    // ==================== Indexes ====================

    /** 
     * Index mapping labels to sets of node IDs.
     * Enables fast getNodesByLabel() queries.
     * Example: { "Person" -> Set(1, 2, 3), "Company" -> Set(4, 5) }
     */
    private labelIndex: Map<string, Set<number>> = new Map();

    /** 
     * Index mapping relationship types to sets of relationship IDs.
     * Enables fast getRelationshipsByType() queries.
     * Example: { "KNOWS" -> Set(1, 2), "WORKS_FOR" -> Set(3) }
     */
    private typeIndex: Map<string, Set<number>> = new Map();

    // ==================== Node Operations ====================

    /**
     * Create a new node in the graph.
     * 
     * The node is automatically assigned a unique ID and added to the
     * label index for each of its labels.
     * 
     * @param labels - Array of labels to assign to the node
     * @param properties - Initial properties as a plain object
     * @returns The newly created Node instance
     * 
     * @example
     * ```typescript
     * const person = graph.createNode(['Person', 'Employee'], { 
     *   name: 'Alice', 
     *   age: 30 
     * });
     * ```
     */
    createNode(labels: string[] = [], properties: Record<string, any> = {}): Node {
        // Create node with auto-incremented ID
        const node = new Node(this.nextNodeId++, labels, properties);
        this.nodes.set(node.id, node);

        // Update label index for fast lookups
        for (const label of labels) {
            if (!this.labelIndex.has(label)) {
                this.labelIndex.set(label, new Set());
            }
            this.labelIndex.get(label)!.add(node.id);
        }

        return node;
    }

    /**
     * Get a node by its unique ID.
     * 
     * @param id - The node ID to look up
     * @returns The Node if found, undefined otherwise
     */
    getNode(id: number): Node | undefined {
        return this.nodes.get(id);
    }

    /**
     * Get all nodes in the graph.
     * 
     * @returns Array of all Node instances
     */
    getAllNodes(): Node[] {
        return Array.from(this.nodes.values());
    }

    /**
     * Get all nodes with a specific label.
     * Uses the label index for O(1) lookup of matching node IDs.
     * 
     * @param label - The label to search for
     * @returns Array of nodes with this label
     * 
     * @example
     * ```typescript
     * const people = graph.getNodesByLabel('Person');
     * ```
     */
    getNodesByLabel(label: string): Node[] {
        const nodeIds = this.labelIndex.get(label);
        if (!nodeIds) return [];
        return Array.from(nodeIds).map(id => this.nodes.get(id)!);
    }

    /**
     * Delete a node and all its relationships from the graph.
     * 
     * This method:
     * 1. Deletes all relationships connected to this node
     * 2. Removes the node from all label indexes
     * 3. Removes the node from the graph
     * 
     * @param node - The node to delete
     * @returns True if the node existed and was deleted
     */
    deleteNode(node: Node): boolean {
        if (!this.nodes.has(node.id)) return false;

        // Delete all relationships connected to this node first
        // We spread to array to avoid modifying while iterating
        for (const rel of [...node.relationships]) {
            this.deleteRelationship(rel);
        }

        // Remove from all label indexes
        for (const label of node.labels) {
            this.labelIndex.get(label)?.delete(node.id);
        }

        // Remove from main storage
        this.nodes.delete(node.id);
        return true;
    }

    /**
     * Add a label to an existing node.
     * Updates the label index accordingly.
     * 
     * @param node - The node to add the label to
     * @param label - The label to add
     */
    addLabel(node: Node, label: string): void {
        if (!node.labels.has(label)) {
            node.labels.add(label);
            if (!this.labelIndex.has(label)) {
                this.labelIndex.set(label, new Set());
            }
            this.labelIndex.get(label)!.add(node.id);
        }
    }

    /**
     * Remove a label from a node.
     * Updates the label index accordingly.
     * 
     * @param node - The node to remove the label from
     * @param label - The label to remove
     */
    removeLabel(node: Node, label: string): void {
        if (node.labels.delete(label)) {
            this.labelIndex.get(label)?.delete(node.id);
        }
    }

    // ==================== Relationship Operations ====================

    /**
     * Create a relationship between two nodes.
     * 
     * This method:
     * 1. Creates the relationship with an auto-incremented ID
     * 2. Adds the relationship to both nodes' relationship lists (index-free adjacency)
     * 3. Updates the type index for fast type-based lookups
     * 
     * @param startNode - The source node (relationship points from here)
     * @param endNode - The target node (relationship points to here)
     * @param type - The relationship type (e.g., "KNOWS", "WORKS_FOR")
     * @param properties - Initial properties as a plain object
     * @returns The newly created Relationship instance
     * 
     * @example
     * ```typescript
     * const knows = graph.createRelationship(alice, bob, 'KNOWS', { since: 2020 });
     * ```
     */
    createRelationship(
        startNode: Node,
        endNode: Node,
        type: string,
        properties: Record<string, any> = {}
    ): Relationship {
        // Create relationship with auto-incremented ID
        const rel = new Relationship(this.nextRelationshipId++, type, startNode, endNode, properties);
        this.relationships.set(rel.id, rel);

        // Add to both nodes' relationship lists (enables index-free adjacency)
        startNode.relationships.push(rel);
        endNode.relationships.push(rel);

        // Update type index for fast type-based lookups
        if (!this.typeIndex.has(type)) {
            this.typeIndex.set(type, new Set());
        }
        this.typeIndex.get(type)!.add(rel.id);

        return rel;
    }

    /**
     * Get a relationship by its unique ID.
     * 
     * @param id - The relationship ID to look up
     * @returns The Relationship if found, undefined otherwise
     */
    getRelationship(id: number): Relationship | undefined {
        return this.relationships.get(id);
    }

    /**
     * Get all relationships in the graph.
     * 
     * @returns Array of all Relationship instances
     */
    getAllRelationships(): Relationship[] {
        return Array.from(this.relationships.values());
    }

    /**
     * Get all relationships of a specific type.
     * Uses the type index for O(1) lookup of matching relationship IDs.
     * 
     * @param type - The relationship type to search for
     * @returns Array of relationships with this type
     */
    getRelationshipsByType(type: string): Relationship[] {
        const relIds = this.typeIndex.get(type);
        if (!relIds) return [];
        return Array.from(relIds).map(id => this.relationships.get(id)!);
    }

    /**
     * Delete a relationship from the graph.
     * 
     * This method:
     * 1. Removes the relationship from both connected nodes' lists
     * 2. Removes the relationship from the type index
     * 3. Removes the relationship from the graph
     * 
     * @param rel - The relationship to delete
     * @returns True if the relationship existed and was deleted
     */
    deleteRelationship(rel: Relationship): boolean {
        if (!this.relationships.has(rel.id)) return false;

        // Remove from start node's relationship list
        const startIdx = rel.startNode.relationships.indexOf(rel);
        if (startIdx !== -1) rel.startNode.relationships.splice(startIdx, 1);

        // Remove from end node's relationship list
        const endIdx = rel.endNode.relationships.indexOf(rel);
        if (endIdx !== -1) rel.endNode.relationships.splice(endIdx, 1);

        // Remove from type index
        this.typeIndex.get(rel.type)?.delete(rel.id);

        // Remove from main storage
        this.relationships.delete(rel.id);
        return true;
    }

    // ==================== Statistics ====================

    /**
     * Get statistics about the current graph.
     * 
     * @returns Object containing node count, relationship count, and lists of labels/types
     */
    getStats(): { nodeCount: number; relationshipCount: number; labels: string[]; types: string[] } {
        return {
            nodeCount: this.nodes.size,
            relationshipCount: this.relationships.size,
            labels: Array.from(this.labelIndex.keys()),
            types: Array.from(this.typeIndex.keys())
        };
    }

    /**
     * Clear the entire graph, removing all nodes, relationships, and indexes.
     * Also resets the ID counters back to 1.
     */
    clear(): void {
        this.nodes.clear();
        this.relationships.clear();
        this.labelIndex.clear();
        this.typeIndex.clear();
        this.nextNodeId = 1;
        this.nextRelationshipId = 1;
    }

    // ==================== Serialization ====================

    /**
     * Export the entire graph to a JSON-serializable object.
     * 
     * The format is compatible with Neo4j's APOC JSON export format:
     * ```json
     * {
     *   "nodes": [{ id, labels, properties }, ...],
     *   "relationships": [{ id, type, startNode, endNode, properties }, ...]
     * }
     * ```
     * 
     * @returns Plain object that can be JSON.stringify'd
     */
    toJSON(): object {
        return {
            nodes: this.getAllNodes().map(n => n.toJSON()),
            relationships: this.getAllRelationships().map(r => r.toJSON())
        };
    }

    /**
     * Import a graph from a JSON object, replacing all existing data.
     * 
     * Expects the same format as toJSON() output:
     * ```json
     * {
     *   "nodes": [{ id, labels, properties }, ...],
     *   "relationships": [{ id, type, startNode, endNode, properties }, ...]
     * }
     * ```
     * 
     * Note: Node IDs in the input are used only for relationship mapping.
     * Nodes will get new IDs in the imported graph.
     * 
     * @param data - The JSON object to import
     */
    fromJSON(data: { nodes: any[]; relationships: any[] }): void {
        this.clear();

        // Map old node IDs to new Node instances
        const nodeMap = new Map<number, Node>();

        // Create nodes first
        for (const n of data.nodes) {
            const node = this.createNode(n.labels, n.properties);
            nodeMap.set(n.id, node);
        }

        // Then create relationships (need nodes to exist first)
        for (const r of data.relationships) {
            const startNode = nodeMap.get(r.startNode);
            const endNode = nodeMap.get(r.endNode);
            if (startNode && endNode) {
                this.createRelationship(startNode, endNode, r.type, r.properties);
            }
        }
    }
}
