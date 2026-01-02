/**
 * GraphRAG Text Serialization for LiteGraph
 * 
 * Provides LLM-friendly text output formats for graph data.
 * These formats are designed to be included in LLM prompts as context.
 * 
 * @module compat/graphrag
 */

import { Graph } from '../core/storage';
import { Node, Relationship } from '../core/graph';

/**
 * Configuration options for text serialization
 */
export interface SerializationOptions {
    /** Include property values in output */
    includeProperties?: boolean;
    /** Maximum string length for property values */
    maxPropertyLength?: number;
    /** Separator between items */
    separator?: string;
}

const DEFAULT_OPTIONS: SerializationOptions = {
    includeProperties: true,
    maxPropertyLength: 100,
    separator: '\n'
};

/**
 * Format a node's properties as a compact string
 */
function formatProperties(props: Map<string, any>, maxLength: number): string {
    if (props.size === 0) return '';

    const pairs: string[] = [];
    for (const [key, value] of props) {
        let strValue = typeof value === 'string' ? `"${value}"` : String(value);
        if (strValue.length > maxLength) {
            strValue = strValue.substring(0, maxLength - 3) + '...';
        }
        pairs.push(`${key}: ${strValue}`);
    }
    return pairs.join(', ');
}

/**
 * Get a display name for a node (uses 'name' property or first label + ID)
 */
function getNodeName(node: Node): string {
    const name = node.get('name') || node.get('title') || node.get('id');
    if (name) return String(name);

    const label = Array.from(node.labels)[0] || 'Node';
    return `${label}_${node.id}`;
}

/**
 * Convert a graph to triple format: (Subject)-[Predicate]->(Object)
 * 
 * This format is compact and easy for LLMs to parse.
 * 
 * @example
 * "(Alice)-[KNOWS {since: 2020}]->(Bob)"
 * "(Alice)-[WORKS_FOR]->(TechCorp)"
 */
export function toTriples(graph: Graph, options: SerializationOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines: string[] = [];

    for (const rel of graph.getAllRelationships()) {
        const startName = getNodeName(rel.startNode);
        const endName = getNodeName(rel.endNode);

        let relStr = rel.type;
        if (opts.includeProperties && rel.properties.size > 0) {
            const props = formatProperties(rel.properties, opts.maxPropertyLength!);
            relStr = `${rel.type} {${props}}`;
        }

        lines.push(`(${startName})-[${relStr}]->(${endName})`);
    }

    // Also include orphan nodes (no relationships)
    const connectedNodeIds = new Set<number>();
    for (const rel of graph.getAllRelationships()) {
        connectedNodeIds.add(rel.startNode.id);
        connectedNodeIds.add(rel.endNode.id);
    }

    for (const node of graph.getAllNodes()) {
        if (!connectedNodeIds.has(node.id)) {
            const labels = Array.from(node.labels).join(':');
            const name = getNodeName(node);
            lines.push(`(${name}:${labels})`);
        }
    }

    return lines.join(opts.separator);
}

/**
 * Convert a graph to natural language sentences
 * 
 * This format is most readable for humans and LLMs.
 * 
 * @example
 * "Alice knows Bob since 2020."
 * "Alice works for TechCorp."
 */
export function toNaturalLanguage(graph: Graph, options: SerializationOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const sentences: string[] = [];

    // Relationship type to verb mapping
    const verbMap: Record<string, string> = {
        'KNOWS': 'knows',
        'KNOWS_ABOUT': 'knows about',
        'WORKS_FOR': 'works for',
        'WORKS_AT': 'works at',
        'LIVES_IN': 'lives in',
        'LOCATED_IN': 'is located in',
        'BELONGS_TO': 'belongs to',
        'OWNS': 'owns',
        'CREATED': 'created',
        'CREATED_BY': 'was created by',
        'WROTE': 'wrote',
        'DIRECTED': 'directed',
        'ACTED_IN': 'acted in',
        'FRIENDS_WITH': 'is friends with',
        'MARRIED_TO': 'is married to',
        'PARENT_OF': 'is parent of',
        'CHILD_OF': 'is child of',
        'MANAGES': 'manages',
        'REPORTS_TO': 'reports to',
        'MEMBER_OF': 'is a member of',
        'PART_OF': 'is part of',
        'CONTAINS': 'contains',
        'CONNECTS_TO': 'connects to',
        'FOLLOWS': 'follows',
        'LIKES': 'likes',
        'MENTIONS': 'mentions',
        'REFERENCES': 'references',
        'RELATED_TO': 'is related to'
    };

    for (const rel of graph.getAllRelationships()) {
        const subject = getNodeName(rel.startNode);
        const object = getNodeName(rel.endNode);

        // Convert relationship type to verb
        const verb = verbMap[rel.type] || rel.type.toLowerCase().replace(/_/g, ' ');

        // Build the sentence
        let sentence = `${subject} ${verb} ${object}`;

        // Add key properties if present
        if (opts.includeProperties && rel.properties.size > 0) {
            const propParts: string[] = [];
            for (const [key, value] of rel.properties) {
                if (key === 'since' || key === 'year') {
                    propParts.push(`since ${value}`);
                } else if (key === 'role' || key === 'as') {
                    propParts.push(`as ${value}`);
                } else if (key === 'weight' || key === 'strength') {
                    propParts.push(`(strength: ${value})`);
                } else {
                    propParts.push(`${key}: ${value}`);
                }
            }
            if (propParts.length > 0) {
                sentence += ` (${propParts.join(', ')})`;
            }
        }

        sentences.push(sentence + '.');
    }

    return sentences.join(opts.separator);
}

/**
 * Convert a graph to a Markdown table
 * 
 * Great for structured display of relationships.
 */
export function toMarkdown(graph: Graph, options: SerializationOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines: string[] = [];

    // Node table
    lines.push('## Nodes');
    lines.push('| ID | Labels | Name | Properties |');
    lines.push('|---|---|---|---|');

    for (const node of graph.getAllNodes()) {
        const labels = Array.from(node.labels).join(', ');
        const name = getNodeName(node);
        const props = opts.includeProperties ? formatProperties(node.properties, opts.maxPropertyLength!) : '';
        lines.push(`| ${node.id} | ${labels} | ${name} | ${props} |`);
    }

    lines.push('');

    // Relationship table
    lines.push('## Relationships');
    lines.push('| From | Type | To | Properties |');
    lines.push('|---|---|---|---|');

    for (const rel of graph.getAllRelationships()) {
        const from = getNodeName(rel.startNode);
        const to = getNodeName(rel.endNode);
        const props = opts.includeProperties ? formatProperties(rel.properties, opts.maxPropertyLength!) : '';
        lines.push(`| ${from} | ${rel.type} | ${to} | ${props} |`);
    }

    return lines.join('\n');
}

/**
 * Describe the graph schema (labels and relationship types)
 * 
 * Useful for helping LLMs understand what's in the graph.
 */
export function describeSchema(graph: Graph): string {
    const stats = graph.getStats();
    const lines: string[] = [];

    lines.push('## Graph Schema');
    lines.push(`- Total nodes: ${stats.nodeCount}`);
    lines.push(`- Total relationships: ${stats.relationshipCount}`);
    lines.push('');

    if (stats.labels.length > 0) {
        lines.push('### Node Labels');
        for (const label of stats.labels) {
            const count = graph.getNodesByLabel(label).length;
            lines.push(`- **${label}** (${count} nodes)`);
        }
        lines.push('');
    }

    if (stats.types.length > 0) {
        lines.push('### Relationship Types');
        for (const type of stats.types) {
            // Count relationships of this type
            const count = graph.getAllRelationships().filter(r => r.type === type).length;
            lines.push(`- **${type}** (${count} relationships)`);
        }
    }

    return lines.join('\n');
}

/**
 * Extract context around a specific node (N-hop neighborhood)
 * 
 * This is the most useful function for GraphRAG - it extracts
 * relevant context around an entity for inclusion in LLM prompts.
 * 
 * @param graph - The graph to extract from
 * @param nodeId - The central node ID
 * @param hops - How many hops to traverse (default: 2)
 * @param format - Output format: 'triples' | 'natural' | 'markdown'
 */
export function extractContext(
    graph: Graph,
    nodeId: number,
    hops: number = 2,
    format: 'triples' | 'natural' | 'markdown' = 'natural'
): string {
    const centralNode = graph.getNode(nodeId);
    if (!centralNode) {
        return `Node ${nodeId} not found.`;
    }

    // BFS to find all nodes within N hops
    const visited = new Set<number>();
    const queue: Array<{ node: Node; depth: number }> = [{ node: centralNode, depth: 0 }];
    const relevantNodes = new Set<Node>();
    const relevantRels = new Set<Relationship>();

    while (queue.length > 0) {
        const { node, depth } = queue.shift()!;

        if (visited.has(node.id)) continue;
        visited.add(node.id);
        relevantNodes.add(node);

        if (depth < hops) {
            for (const rel of node.relationships) {
                relevantRels.add(rel);
                const otherNode = rel.getOtherNode(node);
                if (!visited.has(otherNode.id)) {
                    queue.push({ node: otherNode, depth: depth + 1 });
                }
            }
        }
    }

    // Create a subgraph with just the relevant nodes/relationships
    const subgraph = new Graph();
    const nodeMap = new Map<number, Node>();

    for (const node of relevantNodes) {
        const newNode = subgraph.createNode(
            Array.from(node.labels),
            Object.fromEntries(node.properties)
        );
        nodeMap.set(node.id, newNode);
    }

    for (const rel of relevantRels) {
        const startNode = nodeMap.get(rel.startNode.id);
        const endNode = nodeMap.get(rel.endNode.id);
        if (startNode && endNode) {
            subgraph.createRelationship(
                startNode,
                endNode,
                rel.type,
                Object.fromEntries(rel.properties)
            );
        }
    }

    // Build context header
    const lines: string[] = [];
    lines.push(`## Context for: ${getNodeName(centralNode)}`);
    lines.push(`Extracted ${relevantNodes.size} nodes and ${relevantRels.size} relationships within ${hops} hops.`);
    lines.push('');

    // Add formatted content
    switch (format) {
        case 'triples':
            lines.push(toTriples(subgraph));
            break;
        case 'natural':
            lines.push(toNaturalLanguage(subgraph));
            break;
        case 'markdown':
            lines.push(toMarkdown(subgraph));
            break;
    }

    return lines.join('\n');
}

/**
 * Generate a complete LLM context block
 * 
 * This combines schema description + relevant context into a single
 * block that can be inserted into an LLM prompt.
 */
export function generateLLMContext(
    graph: Graph,
    focusNodeIds?: number[],
    hops: number = 2
): string {
    const sections: string[] = [];

    // Schema overview
    sections.push(describeSchema(graph));
    sections.push('');

    // If specific nodes are in focus, extract their context
    if (focusNodeIds && focusNodeIds.length > 0) {
        for (const nodeId of focusNodeIds) {
            sections.push(extractContext(graph, nodeId, hops, 'natural'));
            sections.push('');
        }
    } else {
        // Otherwise, provide a general overview
        sections.push('## All Relationships');
        sections.push(toNaturalLanguage(graph));
    }

    return sections.join('\n');
}
