/**
 * LiteGraph - GraphML Compatibility
 * Import/export graphs in GraphML format for compatibility with Neo4j and other tools.
 */

import { Graph } from '../core/storage';
import { Node, Relationship } from '../core/graph';
import * as fs from 'fs';

export class GraphMLCompat {
    private graph: Graph;

    constructor(graph: Graph) {
        this.graph = graph;
    }

    // ==================== Export ====================

    /** Export graph to GraphML XML string */
    exportToString(): string {
        const nodes = this.graph.getAllNodes();
        const relationships = this.graph.getAllRelationships();

        // Collect all property keys
        const nodeKeys = new Set<string>();
        const edgeKeys = new Set<string>();

        for (const node of nodes) {
            for (const key of node.properties.keys()) {
                nodeKeys.add(key);
            }
        }
        for (const rel of relationships) {
            for (const key of rel.properties.keys()) {
                edgeKeys.add(key);
            }
        }

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns
         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
`;

        // Define keys for node properties
        xml += `  <key id="labels" for="node" attr.name="labels" attr.type="string"/>\n`;
        for (const key of nodeKeys) {
            xml += `  <key id="node_${key}" for="node" attr.name="${this.escapeXml(key)}" attr.type="string"/>\n`;
        }

        // Define keys for edge properties
        xml += `  <key id="relationship_type" for="edge" attr.name="relationship_type" attr.type="string"/>\n`;
        for (const key of edgeKeys) {
            xml += `  <key id="edge_${key}" for="edge" attr.name="${this.escapeXml(key)}" attr.type="string"/>\n`;
        }

        xml += `  <graph id="G" edgedefault="directed">\n`;

        // Export nodes
        for (const node of nodes) {
            xml += `    <node id="n${node.id}">\n`;
            xml += `      <data key="labels">${this.escapeXml(Array.from(node.labels).join(':'))}</data>\n`;
            for (const [key, value] of node.properties) {
                xml += `      <data key="node_${key}">${this.escapeXml(String(value))}</data>\n`;
            }
            xml += `    </node>\n`;
        }

        // Export relationships
        for (const rel of relationships) {
            xml += `    <edge id="e${rel.id}" source="n${rel.startNode.id}" target="n${rel.endNode.id}">\n`;
            xml += `      <data key="relationship_type">${this.escapeXml(rel.type)}</data>\n`;
            for (const [key, value] of rel.properties) {
                xml += `      <data key="edge_${key}">${this.escapeXml(String(value))}</data>\n`;
            }
            xml += `    </edge>\n`;
        }

        xml += `  </graph>\n</graphml>`;
        return xml;
    }

    /** Export graph to a file */
    exportToFile(path: string): void {
        fs.writeFileSync(path, this.exportToString(), 'utf-8');
    }

    // ==================== Import ====================

    /** Import graph from GraphML XML string */
    importFromString(xml: string, clearExisting: boolean = true): void {
        if (clearExisting) {
            this.graph.clear();
        }

        const nodeIdMap = new Map<string, Node>();

        // Extract keys
        const keyDefs = new Map<string, { for: string; name: string }>();
        const keyRegex = /<key\s+id="([^"]+)"\s+for="([^"]+)"\s+attr\.name="([^"]+)"/g;
        let keyMatch;
        while ((keyMatch = keyRegex.exec(xml)) !== null) {
            keyDefs.set(keyMatch[1], { for: keyMatch[2], name: keyMatch[3] });
        }

        // Extract nodes
        const nodeRegex = /<node\s+id="([^"]+)">([\s\S]*?)<\/node>/g;
        const dataRegex = /<data\s+key="([^"]+)">([^<]*)<\/data>/g;
        let nodeMatch;

        while ((nodeMatch = nodeRegex.exec(xml)) !== null) {
            const nodeId = nodeMatch[1];
            const nodeContent = nodeMatch[2];

            let labels: string[] = [];
            const properties: Record<string, any> = {};

            let dataMatch;
            dataRegex.lastIndex = 0;
            while ((dataMatch = dataRegex.exec(nodeContent)) !== null) {
                const keyId = dataMatch[1];
                const value = this.unescapeXml(dataMatch[2]);

                if (keyId === 'labels') {
                    labels = value.split(':').filter(l => l);
                } else if (keyId.startsWith('node_')) {
                    properties[keyId.substring(5)] = value;
                } else {
                    const keyDef = keyDefs.get(keyId);
                    if (keyDef && keyDef.for === 'node') {
                        properties[keyDef.name] = value;
                    }
                }
            }

            const node = this.graph.createNode(labels, properties);
            nodeIdMap.set(nodeId, node);
        }

        // Extract edges
        const edgeRegex = /<edge\s+id="([^"]+)"\s+source="([^"]+)"\s+target="([^"]+)">([\s\S]*?)<\/edge>/g;
        let edgeMatch;

        while ((edgeMatch = edgeRegex.exec(xml)) !== null) {
            const sourceId = edgeMatch[2];
            const targetId = edgeMatch[3];
            const edgeContent = edgeMatch[4];

            const startNode = nodeIdMap.get(sourceId);
            const endNode = nodeIdMap.get(targetId);

            if (!startNode || !endNode) {
                console.warn(`Skipping edge: missing node ${sourceId} or ${targetId}`);
                continue;
            }

            let relType = 'RELATED';
            const properties: Record<string, any> = {};

            let dataMatch;
            dataRegex.lastIndex = 0;
            while ((dataMatch = dataRegex.exec(edgeContent)) !== null) {
                const keyId = dataMatch[1];
                const value = this.unescapeXml(dataMatch[2]);

                if (keyId === 'relationship_type') {
                    relType = value;
                } else if (keyId.startsWith('edge_')) {
                    properties[keyId.substring(5)] = value;
                } else {
                    const keyDef = keyDefs.get(keyId);
                    if (keyDef && keyDef.for === 'edge') {
                        properties[keyDef.name] = value;
                    }
                }
            }

            this.graph.createRelationship(startNode, endNode, relType, properties);
        }
    }

    /** Import graph from a file */
    importFromFile(path: string, clearExisting: boolean = true): void {
        const xml = fs.readFileSync(path, 'utf-8');
        this.importFromString(xml, clearExisting);
    }

    // ==================== Helpers ====================

    private escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private unescapeXml(str: string): string {
        return str
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }
}
