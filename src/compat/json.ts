/**
 * LiteGraph - Neo4j JSON Compatibility
 * Import/export graphs in Neo4j APOC-compatible JSON format.
 */

import { Graph } from '../core/storage';
import { Node, Relationship } from '../core/graph';
import * as fs from 'fs';

/** Neo4j APOC export format */
export interface Neo4jJsonFormat {
    nodes: Neo4jNodeJson[];
    relationships: Neo4jRelationshipJson[];
}

export interface Neo4jNodeJson {
    id: string | number;
    labels: string[];
    properties: Record<string, any>;
}

export interface Neo4jRelationshipJson {
    id: string | number;
    type: string;
    startNode: string | number;
    endNode: string | number;
    properties: Record<string, any>;
}

export class JsonCompat {
    private graph: Graph;

    constructor(graph: Graph) {
        this.graph = graph;
    }

    // ==================== Export ====================

    /** Export graph to Neo4j-compatible JSON object */
    exportToObject(): Neo4jJsonFormat {
        const nodes = this.graph.getAllNodes().map(node => ({
            id: node.id,
            labels: Array.from(node.labels),
            properties: Object.fromEntries(node.properties)
        }));

        const relationships = this.graph.getAllRelationships().map(rel => ({
            id: rel.id,
            type: rel.type,
            startNode: rel.startNode.id,
            endNode: rel.endNode.id,
            properties: Object.fromEntries(rel.properties)
        }));

        return { nodes, relationships };
    }

    /** Export graph to JSON string */
    exportToString(pretty: boolean = true): string {
        return JSON.stringify(this.exportToObject(), null, pretty ? 2 : 0);
    }

    /** Export graph to a file */
    exportToFile(path: string, pretty: boolean = true): void {
        fs.writeFileSync(path, this.exportToString(pretty), 'utf-8');
    }

    // ==================== Import ====================

    /** Import graph from Neo4j-compatible JSON object */
    importFromObject(data: Neo4jJsonFormat, clearExisting: boolean = true): void {
        if (clearExisting) {
            this.graph.clear();
        }

        const nodeIdMap = new Map<string | number, Node>();

        // Create nodes
        for (const nodeData of data.nodes) {
            const node = this.graph.createNode(nodeData.labels, nodeData.properties || {});
            nodeIdMap.set(nodeData.id, node);
        }

        // Create relationships
        for (const relData of data.relationships) {
            const startNode = nodeIdMap.get(relData.startNode);
            const endNode = nodeIdMap.get(relData.endNode);

            if (startNode && endNode) {
                this.graph.createRelationship(
                    startNode,
                    endNode,
                    relData.type,
                    relData.properties || {}
                );
            } else {
                console.warn(`Skipping relationship ${relData.id}: missing start or end node`);
            }
        }
    }

    /** Import graph from JSON string */
    importFromString(json: string, clearExisting: boolean = true): void {
        const data = JSON.parse(json) as Neo4jJsonFormat;
        this.importFromObject(data, clearExisting);
    }

    /** Import graph from a file */
    importFromFile(path: string, clearExisting: boolean = true): void {
        const json = fs.readFileSync(path, 'utf-8');
        this.importFromString(json, clearExisting);
    }

    // ==================== JSONL Format (Neo4j export format) ====================

    /** Import from Neo4j JSONL format (one JSON object per line) */
    importFromJsonLines(content: string, clearExisting: boolean = true): void {
        if (clearExisting) {
            this.graph.clear();
        }

        const lines = content.split('\n').filter(line => line.trim());
        const nodeIdMap = new Map<string | number, Node>();
        const pendingRels: Neo4jRelationshipJson[] = [];

        for (const line of lines) {
            try {
                const obj = JSON.parse(line);

                // Detect if it's a node or relationship
                if (obj.type && obj.startNode !== undefined && obj.endNode !== undefined) {
                    // It's a relationship - save for later
                    pendingRels.push(obj);
                } else if (obj.labels || obj.id !== undefined) {
                    // It's a node
                    const node = this.graph.createNode(
                        obj.labels || [],
                        obj.properties || {}
                    );
                    nodeIdMap.set(obj.id, node);
                }
            } catch (e) {
                console.warn(`Skipping invalid JSON line: ${line.substring(0, 50)}...`);
            }
        }

        // Now create relationships
        for (const relData of pendingRels) {
            const startNode = nodeIdMap.get(relData.startNode);
            const endNode = nodeIdMap.get(relData.endNode);

            if (startNode && endNode) {
                this.graph.createRelationship(
                    startNode,
                    endNode,
                    relData.type,
                    relData.properties || {}
                );
            }
        }
    }
}
