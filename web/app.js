/**
 * LiteGraph Web Console - Application Logic
 * 
 * This is a lightweight browser-based interface for LiteGraph.
 * It provides query execution, result display, and import/export functionality.
 */

// ==================== Debug Logging ====================
console.log('🚀 LiteGraph app.js loading...');

window.onerror = function (msg, url, line, col, error) {
    console.error('❌ Global error:', msg, 'at', url, 'line', line);
    return false;
};

// Helper to safely add event listeners
function safeAddEventListener(element, event, handler, name) {
    if (element) {
        element.addEventListener(event, handler);
        console.log(`✅ Event listener added: ${name}`);
    } else {
        console.warn(`⚠️ Element not found for: ${name}`);
    }
}

// ==================== LiteGraph Browser Bundle ====================
// Since we're running in the browser without bundling, we need a browser-compatible version.
// This is a simplified in-browser implementation of LiteGraph.

class Node {
    constructor(id, labels = [], properties = {}) {
        this.id = id;
        this.labels = new Set(labels);
        this.properties = new Map(Object.entries(properties));
        this.relationships = [];
    }

    hasLabel(label) { return this.labels.has(label); }
    get(key) { return this.properties.get(key); }
    set(key, value) { this.properties.set(key, value); }

    getOutgoingRelationships(type) {
        return this.relationships.filter(r => r.startNode === this && (!type || r.type === type));
    }

    getIncomingRelationships(type) {
        return this.relationships.filter(r => r.endNode === this && (!type || r.type === type));
    }

    toJSON() {
        return {
            id: this.id,
            labels: Array.from(this.labels),
            properties: Object.fromEntries(this.properties)
        };
    }
}

class Relationship {
    constructor(id, type, startNode, endNode, properties = {}) {
        this.id = id;
        this.type = type;
        this.startNode = startNode;
        this.endNode = endNode;
        this.properties = new Map(Object.entries(properties));
    }

    get(key) { return this.properties.get(key); }
    set(key, value) { this.properties.set(key, value); }
    getOtherNode(node) { return this.startNode === node ? this.endNode : this.startNode; }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            startNode: this.startNode.id,
            endNode: this.endNode.id,
            properties: Object.fromEntries(this.properties)
        };
    }
}

class Graph {
    constructor() {
        this.nodes = new Map();
        this.relationships = new Map();
        this.nextNodeId = 1;
        this.nextRelationshipId = 1;
        this.labelIndex = new Map();
        this.typeIndex = new Map();
    }

    createNode(labels = [], properties = {}) {
        const node = new Node(this.nextNodeId++, labels, properties);
        this.nodes.set(node.id, node);
        for (const label of labels) {
            if (!this.labelIndex.has(label)) this.labelIndex.set(label, new Set());
            this.labelIndex.get(label).add(node.id);
        }
        return node;
    }

    getNode(id) { return this.nodes.get(id); }
    getAllNodes() { return Array.from(this.nodes.values()); }

    getNodesByLabel(label) {
        const nodeIds = this.labelIndex.get(label);
        if (!nodeIds) return [];
        return Array.from(nodeIds).map(id => this.nodes.get(id));
    }

    deleteNode(node) {
        if (!this.nodes.has(node.id)) return false;
        for (const rel of [...node.relationships]) this.deleteRelationship(rel);
        for (const label of node.labels) this.labelIndex.get(label)?.delete(node.id);
        this.nodes.delete(node.id);
        return true;
    }

    createRelationship(startNode, endNode, type, properties = {}) {
        const rel = new Relationship(this.nextRelationshipId++, type, startNode, endNode, properties);
        this.relationships.set(rel.id, rel);
        startNode.relationships.push(rel);
        endNode.relationships.push(rel);
        if (!this.typeIndex.has(type)) this.typeIndex.set(type, new Set());
        this.typeIndex.get(type).add(rel.id);
        return rel;
    }

    getAllRelationships() { return Array.from(this.relationships.values()); }

    deleteRelationship(rel) {
        if (!this.relationships.has(rel.id)) return false;
        const startIdx = rel.startNode.relationships.indexOf(rel);
        if (startIdx !== -1) rel.startNode.relationships.splice(startIdx, 1);
        const endIdx = rel.endNode.relationships.indexOf(rel);
        if (endIdx !== -1) rel.endNode.relationships.splice(endIdx, 1);
        this.typeIndex.get(rel.type)?.delete(rel.id);
        this.relationships.delete(rel.id);
        return true;
    }

    getStats() {
        return {
            nodeCount: this.nodes.size,
            relationshipCount: this.relationships.size,
            labels: Array.from(this.labelIndex.keys()),
            types: Array.from(this.typeIndex.keys())
        };
    }

    clear() {
        this.nodes.clear();
        this.relationships.clear();
        this.labelIndex.clear();
        this.typeIndex.clear();
        this.nextNodeId = 1;
        this.nextRelationshipId = 1;
    }

    toJSON() {
        return {
            nodes: this.getAllNodes().map(n => n.toJSON()),
            relationships: this.getAllRelationships().map(r => r.toJSON())
        };
    }

    fromJSON(data) {
        this.clear();
        const nodeMap = new Map();
        for (const n of data.nodes) {
            const node = this.createNode(n.labels, n.properties);
            nodeMap.set(n.id, node);
        }
        for (const r of data.relationships) {
            const startNode = nodeMap.get(r.startNode);
            const endNode = nodeMap.get(r.endNode);
            if (startNode && endNode) {
                this.createRelationship(startNode, endNode, r.type, r.properties || {});
            }
        }
    }
}

// ==================== Simplified Cypher Parser & Executor ====================

class CypherEngine {
    constructor(graph) {
        this.graph = graph;
    }

    execute(query) {
        const summary = { nodesCreated: 0, nodesDeleted: 0, relationshipsCreated: 0, relationshipsDeleted: 0, propertiesSet: 0 };
        const records = [];

        // Normalize query
        query = query.trim();

        // Split into clauses
        const clauses = this.splitClauses(query);
        let bindings = [new Map()];
        let returnClause = null;

        for (const clause of clauses) {
            const type = clause.type.toUpperCase();

            if (type === 'CREATE') {
                const result = this.executeCreate(clause.content, bindings);
                bindings = result.bindings;
                summary.nodesCreated += result.nodesCreated;
                summary.relationshipsCreated += result.relationshipsCreated;
            } else if (type === 'MATCH') {
                bindings = this.executeMatch(clause.content, bindings);
            } else if (type === 'WHERE') {
                bindings = this.executeWhere(clause.content, bindings);
            } else if (type === 'SET') {
                summary.propertiesSet += this.executeSet(clause.content, bindings);
            } else if (type === 'DELETE') {
                const result = this.executeDelete(clause.content, bindings);
                summary.nodesDeleted += result.nodesDeleted;
                summary.relationshipsDeleted += result.relationshipsDeleted;
            } else if (type === 'RETURN') {
                returnClause = clause.content;
            }
        }

        if (returnClause) {
            return { records: this.executeReturn(returnClause, bindings), summary };
        }

        return { records: [], summary };
    }

    splitClauses(query) {
        const keywords = ['MATCH', 'WHERE', 'RETURN', 'CREATE', 'SET', 'DELETE'];
        const clauses = [];
        let remaining = query;

        while (remaining.length > 0) {
            remaining = remaining.trim();
            let foundKeyword = null;
            let keywordPos = remaining.length;

            for (const kw of keywords) {
                const regex = new RegExp(`^${kw}\\b`, 'i');
                if (regex.test(remaining)) {
                    foundKeyword = kw;
                    break;
                }
            }

            if (!foundKeyword) break;

            // Find the next keyword
            let nextPos = remaining.length;
            for (const kw of keywords) {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                let match;
                regex.lastIndex = foundKeyword.length;
                if ((match = regex.exec(remaining)) !== null) {
                    if (match.index < nextPos) nextPos = match.index;
                }
            }

            const content = remaining.substring(foundKeyword.length, nextPos).trim();
            clauses.push({ type: foundKeyword, content });
            remaining = remaining.substring(nextPos);
        }

        return clauses;
    }

    // Parse a node pattern like (n:Person {name: "Alice"})
    parseNodePattern(pattern) {
        const match = pattern.match(/^\(([a-zA-Z_][\w]*)?(?::([a-zA-Z_][\w]*))?(?:\s*\{([^}]*)\})?\)$/);
        if (!match) return null;

        const variable = match[1] || null;
        const label = match[2] || null;
        const propsStr = match[3] || '';
        const properties = this.parseProperties(propsStr);

        return { variable, labels: label ? [label] : [], properties };
    }

    parseProperties(propsStr) {
        const props = {};
        if (!propsStr.trim()) return props;

        const regex = /(\w+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?)|(\w+))/g;
        let match;
        while ((match = regex.exec(propsStr)) !== null) {
            const key = match[1];
            if (match[2] !== undefined) props[key] = match[2];
            else if (match[3] !== undefined) props[key] = match[3];
            else if (match[4] !== undefined) props[key] = parseFloat(match[4]);
            else if (match[5] !== undefined) {
                if (match[5] === 'true') props[key] = true;
                else if (match[5] === 'false') props[key] = false;
                else if (match[5] === 'null') props[key] = null;
            }
        }
        return props;
    }

    executeCreate(content, bindings) {
        let nodesCreated = 0;
        let relationshipsCreated = 0;
        const newBindings = [];

        for (const binding of bindings) {
            const newBinding = new Map(binding);

            // Parse the pattern - simple version for nodes and relationships
            // Match pattern like (a:Person {name: "Alice"})-[:KNOWS]->(b:Person {name: "Bob"})
            const relationshipMatch = content.match(/\(([^)]+)\)\s*-\[(?::(\w+))?(?:\s*\{([^}]*)\})?\]->\s*\(([^)]+)\)/);

            if (relationshipMatch) {
                // Create relationship pattern
                const startPattern = this.parseNodePattern(`(${relationshipMatch[1]})`);
                const relType = relationshipMatch[2] || 'RELATED';
                const relProps = this.parseProperties(relationshipMatch[3] || '');
                const endPattern = this.parseNodePattern(`(${relationshipMatch[4]})`);

                let startNode, endNode;

                // Get or create start node
                if (startPattern.variable && newBinding.has(startPattern.variable)) {
                    startNode = newBinding.get(startPattern.variable);
                } else {
                    startNode = this.graph.createNode(startPattern.labels, startPattern.properties);
                    nodesCreated++;
                    if (startPattern.variable) newBinding.set(startPattern.variable, startNode);
                }

                // Get or create end node
                if (endPattern.variable && newBinding.has(endPattern.variable)) {
                    endNode = newBinding.get(endPattern.variable);
                } else {
                    endNode = this.graph.createNode(endPattern.labels, endPattern.properties);
                    nodesCreated++;
                    if (endPattern.variable) newBinding.set(endPattern.variable, endNode);
                }

                // Create the relationship
                this.graph.createRelationship(startNode, endNode, relType, relProps);
                relationshipsCreated++;
            } else {
                // Try simple node pattern
                const nodeMatch = content.match(/\(([^)]+)\)/);
                if (nodeMatch) {
                    const pattern = this.parseNodePattern(`(${nodeMatch[1]})`);
                    if (pattern) {
                        const node = this.graph.createNode(pattern.labels, pattern.properties);
                        nodesCreated++;
                        if (pattern.variable) newBinding.set(pattern.variable, node);
                    }
                }
            }

            newBindings.push(newBinding);
        }

        return { bindings: newBindings.length > 0 ? newBindings : [new Map()], nodesCreated, relationshipsCreated };
    }

    executeMatch(content, existingBindings) {
        const results = [];

        for (const binding of existingBindings) {
            // Check for relationship pattern
            const relMatch = content.match(/\(([^)]*)\)\s*-\[(?:(\w+))?(?::(\w+))?\]->\s*\(([^)]*)\)/);

            if (relMatch) {
                const startPattern = this.parseNodePattern(`(${relMatch[1]})`);
                const relVar = relMatch[2] || null;
                const relType = relMatch[3] || null;
                const endPattern = this.parseNodePattern(`(${relMatch[4]})`);

                // Find matching start nodes
                const startNodes = this.findMatchingNodes(startPattern, binding);

                for (const startNode of startNodes) {
                    const rels = startNode.getOutgoingRelationships(relType);
                    for (const rel of rels) {
                        const endNode = rel.endNode;
                        if (this.nodeMatchesPattern(endNode, endPattern)) {
                            const newBinding = new Map(binding);
                            if (startPattern.variable) newBinding.set(startPattern.variable, startNode);
                            if (relVar) newBinding.set(relVar, rel);
                            if (endPattern.variable) newBinding.set(endPattern.variable, endNode);
                            results.push(newBinding);
                        }
                    }
                }
            } else {
                // Simple node pattern
                const nodeMatch = content.match(/\(([^)]+)\)/);
                if (nodeMatch) {
                    const pattern = this.parseNodePattern(`(${nodeMatch[1]})`);
                    if (pattern) {
                        const nodes = this.findMatchingNodes(pattern, binding);
                        for (const node of nodes) {
                            const newBinding = new Map(binding);
                            if (pattern.variable) newBinding.set(pattern.variable, node);
                            results.push(newBinding);
                        }
                    }
                }
            }
        }

        return results;
    }

    findMatchingNodes(pattern, binding) {
        if (pattern.variable && binding.has(pattern.variable)) {
            const node = binding.get(pattern.variable);
            return this.nodeMatchesPattern(node, pattern) ? [node] : [];
        }

        let candidates = pattern.labels.length > 0
            ? this.graph.getNodesByLabel(pattern.labels[0])
            : this.graph.getAllNodes();

        // Filter by additional labels
        for (let i = 1; i < pattern.labels.length; i++) {
            candidates = candidates.filter(n => n.hasLabel(pattern.labels[i]));
        }

        // Filter by properties
        if (Object.keys(pattern.properties).length > 0) {
            candidates = candidates.filter(n => {
                for (const [key, value] of Object.entries(pattern.properties)) {
                    if (n.get(key) !== value) return false;
                }
                return true;
            });
        }

        return candidates;
    }

    nodeMatchesPattern(node, pattern) {
        for (const label of pattern.labels) {
            if (!node.hasLabel(label)) return false;
        }
        for (const [key, value] of Object.entries(pattern.properties)) {
            if (node.get(key) !== value) return false;
        }
        return true;
    }

    executeWhere(content, bindings) {
        return bindings.filter(binding => this.evaluateCondition(content, binding));
    }

    evaluateCondition(content, binding) {
        // Handle AND
        if (content.toUpperCase().includes(' AND ')) {
            const parts = content.split(/\s+AND\s+/i);
            return parts.every(part => this.evaluateCondition(part.trim(), binding));
        }

        // Handle OR
        if (content.toUpperCase().includes(' OR ')) {
            const parts = content.split(/\s+OR\s+/i);
            return parts.some(part => this.evaluateCondition(part.trim(), binding));
        }

        // Parse comparison: n.age > 21
        const match = content.match(/(\w+)\.(\w+)\s*(=|<>|<|>|<=|>=)\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?))/);
        if (match) {
            const varName = match[1];
            const propName = match[2];
            const operator = match[3];
            let value = match[4] !== undefined ? match[4] :
                match[5] !== undefined ? match[5] :
                    parseFloat(match[6]);

            const node = binding.get(varName);
            if (!node) return false;

            const propValue = node.get(propName);

            switch (operator) {
                case '=': return propValue === value;
                case '<>': return propValue !== value;
                case '<': return propValue < value;
                case '>': return propValue > value;
                case '<=': return propValue <= value;
                case '>=': return propValue >= value;
            }
        }

        return true;
    }

    executeSet(content, bindings) {
        let propertiesSet = 0;
        const items = content.split(',');

        for (const item of items) {
            const match = item.trim().match(/(\w+)\.(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?))/);
            if (match) {
                const varName = match[1];
                const propName = match[2];
                let value = match[3] !== undefined ? match[3] :
                    match[4] !== undefined ? match[4] :
                        parseFloat(match[5]);

                for (const binding of bindings) {
                    const node = binding.get(varName);
                    if (node) {
                        node.set(propName, value);
                        propertiesSet++;
                    }
                }
            }
        }

        return propertiesSet;
    }

    executeDelete(content, bindings) {
        let nodesDeleted = 0;
        let relationshipsDeleted = 0;
        const toDelete = new Set();

        const varNames = content.split(',').map(s => s.trim());

        for (const binding of bindings) {
            for (const varName of varNames) {
                const item = binding.get(varName);
                if (item) toDelete.add(item);
            }
        }

        for (const item of toDelete) {
            if (item instanceof Node) {
                if (this.graph.deleteNode(item)) nodesDeleted++;
            } else if (item instanceof Relationship) {
                if (this.graph.deleteRelationship(item)) relationshipsDeleted++;
            }
        }

        return { nodesDeleted, relationshipsDeleted };
    }

    executeReturn(content, bindings) {
        const items = content.split(',').map(s => s.trim());

        return bindings.map(binding => {
            const record = {};

            for (const item of items) {
                // Handle alias: expr AS alias
                const aliasMatch = item.match(/(.+?)\s+AS\s+(\w+)/i);
                let expr = aliasMatch ? aliasMatch[1].trim() : item;
                let alias = aliasMatch ? aliasMatch[2] : item;

                // Handle property access: n.name
                if (expr.includes('.')) {
                    const [varName, propName] = expr.split('.');
                    const node = binding.get(varName);
                    record[alias] = node ? node.get(propName) : undefined;
                } else if (expr === '*') {
                    // Return all bindings
                    for (const [varName, value] of binding) {
                        record[varName] = value.toJSON();
                    }
                } else {
                    // Return whole node/relationship
                    const value = binding.get(expr);
                    record[alias] = value ? value.toJSON() : undefined;
                }
            }

            return record;
        });
    }
}

// ==================== Application State ====================
const graph = new Graph();
const engine = new CypherEngine(graph);

// Sample queries
const SAMPLE_QUERIES = {
    'create-sample': `CREATE (a:Person {name: "Alice", age: 30})
CREATE (b:Person {name: "Bob", age: 25})
CREATE (c:Person {name: "Charlie", age: 35})
CREATE (a)-[:KNOWS {since: 2020}]->(b)
CREATE (b)-[:KNOWS {since: 2021}]->(c)`,

    'match-all': 'MATCH (n) RETURN n',

    'match-rel': 'MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name, b.name'
};

// ==================== DOM Elements ====================
const elements = {
    queryInput: document.getElementById('query-input'),
    runBtn: document.getElementById('run-btn'),
    clearBtn: document.getElementById('clear-btn'),
    results: document.getElementById('results'),
    resultInfo: document.getElementById('result-info'),
    nodeCount: document.getElementById('node-count'),
    relCount: document.getElementById('rel-count'),
    labelCount: document.getElementById('label-count'),
    importBtn: document.getElementById('import-btn'),
    exportBtn: document.getElementById('export-btn'),
    loadSampleBtn: document.getElementById('load-sample-btn'),
    clearGraphBtn: document.getElementById('clear-graph-btn'),
    fileInput: document.getElementById('file-input'),
    toast: document.getElementById('toast')
};

// ==================== Functions ====================

function updateStats() {
    const stats = graph.getStats();
    elements.nodeCount.textContent = stats.nodeCount;
    elements.relCount.textContent = stats.relationshipCount;
    elements.labelCount.textContent = stats.labels.length;
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function runQuery() {
    const query = elements.queryInput.value.trim();
    if (!query) return;

    try {
        const startTime = performance.now();
        const result = engine.execute(query);
        const duration = (performance.now() - startTime).toFixed(2);

        displayResults(result, duration);
        updateStats();
        updateGraphViz();
    } catch (error) {
        displayError(error);
    }
}

function displayResults(result, duration) {
    const { records, summary } = result;

    // Build summary HTML
    let html = '<div class="result-summary">';
    if (summary.nodesCreated > 0) {
        html += `<span class="summary-item created">+${summary.nodesCreated} nodes</span>`;
    }
    if (summary.relationshipsCreated > 0) {
        html += `<span class="summary-item created">+${summary.relationshipsCreated} relationships</span>`;
    }
    if (summary.nodesDeleted > 0) {
        html += `<span class="summary-item deleted">-${summary.nodesDeleted} nodes</span>`;
    }
    if (summary.relationshipsDeleted > 0) {
        html += `<span class="summary-item deleted">-${summary.relationshipsDeleted} relationships</span>`;
    }
    if (summary.propertiesSet > 0) {
        html += `<span class="summary-item updated">${summary.propertiesSet} properties set</span>`;
    }
    html += '</div>';

    // Build table if we have records
    if (records.length > 0) {
        const keys = Object.keys(records[0]);

        html += '<table class="result-table"><thead><tr>';
        for (const key of keys) {
            html += `<th>${escapeHtml(key)}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (const record of records) {
            html += '<tr>';
            for (const key of keys) {
                const value = record[key];
                const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
                html += `<td>${escapeHtml(display)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
    } else if (summary.nodesCreated === 0 && summary.relationshipsCreated === 0 &&
        summary.nodesDeleted === 0 && summary.propertiesSet === 0) {
        html += '<div class="empty-state"><p>No results</p></div>';
    }

    elements.results.innerHTML = html;
    elements.resultInfo.textContent = `${records.length} records • ${duration}ms`;
}

function displayError(error) {
    elements.results.innerHTML = `
        <div class="error-display">
            <div class="error-title">⚠ Query Error</div>
            <div class="error-message">${escapeHtml(error.message)}</div>
        </div>
    `;
    elements.resultInfo.textContent = 'Error';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function exportJSON() {
    const data = JSON.stringify(graph.toJSON(), null, 2);
    downloadFile(data, 'graph.json', 'application/json');
    showToast('Graph exported as JSON');
}

function exportGraphML() {
    const nodes = graph.getAllNodes();
    const relationships = graph.getAllRelationships();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="labels" for="node" attr.name="labels" attr.type="string"/>
  <key id="properties" for="node" attr.name="properties" attr.type="string"/>
  <key id="relationship_type" for="edge" attr.name="relationship_type" attr.type="string"/>
  <graph id="G" edgedefault="directed">
`;

    for (const node of nodes) {
        xml += `    <node id="n${node.id}">
      <data key="labels">${Array.from(node.labels).join(':')}</data>
      <data key="properties">${escapeXml(JSON.stringify(Object.fromEntries(node.properties)))}</data>
    </node>\n`;
    }

    for (const rel of relationships) {
        xml += `    <edge id="e${rel.id}" source="n${rel.startNode.id}" target="n${rel.endNode.id}">
      <data key="relationship_type">${rel.type}</data>
    </edge>\n`;
    }

    xml += '  </graph>\n</graphml>';

    downloadFile(xml, 'graph.graphml', 'application/xml');
    showToast('Graph exported as GraphML');
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function importFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            graph.fromJSON(data);
            updateStats();
            updateGraphViz();
            showToast(`Imported ${data.nodes.length} nodes, ${data.relationships.length} relationships`);
        } catch (error) {
            showToast('Failed to import file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

function loadSampleData() {
    const sampleData = {
        nodes: [
            { id: 1, labels: ['Person'], properties: { name: 'Alice', age: 30 } },
            { id: 2, labels: ['Person'], properties: { name: 'Bob', age: 25 } },
            { id: 3, labels: ['Person'], properties: { name: 'Charlie', age: 35 } },
            { id: 4, labels: ['Company'], properties: { name: 'TechCorp', employees: 500 } }
        ],
        relationships: [
            { id: 1, type: 'KNOWS', startNode: 1, endNode: 2, properties: { since: 2020 } },
            { id: 2, type: 'KNOWS', startNode: 2, endNode: 3, properties: { since: 2021 } },
            { id: 3, type: 'WORKS_FOR', startNode: 1, endNode: 4, properties: {} }
        ]
    };

    graph.fromJSON(sampleData);
    updateStats();
    updateGraphViz();
    showToast('Sample data loaded');
}

// ==================== Event Listeners ====================
console.log('📌 Setting up event listeners...');
console.log('Elements found:', Object.keys(elements).map(k => `${k}: ${elements[k] ? '✅' : '❌'}`).join(', '));

safeAddEventListener(elements.runBtn, 'click', () => {
    console.log('🔵 Run button clicked');
    runQuery();
}, 'runBtn');

safeAddEventListener(elements.clearBtn, 'click', () => {
    console.log('🔵 Clear query button clicked');
    elements.queryInput.value = '';
    elements.queryInput.focus();
}, 'clearBtn');

safeAddEventListener(elements.queryInput, 'keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        console.log('🔵 Ctrl+Enter pressed');
        runQuery();
    }
}, 'queryInput keydown');

document.querySelectorAll('[data-query]').forEach((btn, i) => {
    btn.addEventListener('click', () => {
        const queryKey = btn.dataset.query;
        console.log('🔵 Sample query button clicked:', queryKey);
        elements.queryInput.value = SAMPLE_QUERIES[queryKey];
    });
    console.log(`✅ Sample query button ${i} wired`);
});

safeAddEventListener(elements.importBtn, 'click', () => {
    console.log('🔵 Import button clicked');
    elements.fileInput.click();
}, 'importBtn');

safeAddEventListener(elements.fileInput, 'change', (e) => {
    console.log('🔵 File selected');
    if (e.target.files[0]) importFile(e.target.files[0]);
}, 'fileInput');

safeAddEventListener(elements.exportBtn, 'click', () => {
    console.log('🔵 Export button clicked');
    exportJSON();
}, 'exportBtn');

safeAddEventListener(elements.loadSampleBtn, 'click', () => {
    console.log('🔵 Load Sample button clicked');
    loadSampleData();
}, 'loadSampleBtn');

safeAddEventListener(elements.clearGraphBtn, 'click', () => {
    console.log('🔵 Clear Graph button clicked');
    if (confirm('Clear all data from the graph?')) {
        graph.clear();
        updateStats();
        updateGraphViz();
        showToast('Graph cleared');
    }
}, 'clearGraphBtn');

console.log('✅ Event listeners setup complete');

// ==================== Graph Visualizer ====================
let graphViz = null;

function initGraphViz() {
    const canvas = document.getElementById('graph-canvas');
    if (canvas && window.GraphVisualizer) {
        graphViz = new GraphVisualizer(canvas);

        // Wire up zoom buttons
        document.getElementById('zoom-in-btn')?.addEventListener('click', () => graphViz.zoomIn());
        document.getElementById('zoom-out-btn')?.addEventListener('click', () => graphViz.zoomOut());
        document.getElementById('recenter-btn')?.addEventListener('click', () => graphViz.recenter());
    }
}

function updateGraphViz() {
    if (graphViz) {
        graphViz.setData(graph.getAllNodes(), graph.getAllRelationships());
    }
}

// Initialize graph visualizer
initGraphViz();

// Initial stats update
updateStats();

console.log('LiteGraph Web Console loaded with Graph Visualization');

