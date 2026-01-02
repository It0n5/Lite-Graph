# LiteGraph

<div align="center">

**A lightweight, Neo4j-compatible graph database with Cypher query support**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-28%20passing-brightgreen.svg)](#testing)

</div>

---

## 🚀 Features

- **🔷 Property Graph Model** - Nodes with labels, relationships with types, and properties on both
- **📝 Cypher Query Language** - Industry-standard graph query language (subset)
- **⚡ In-Memory Storage** - Fast operations with O(1) lookups via index-free adjacency
- **🔄 Neo4j Compatible** - Import/export JSON and GraphML formats
- **🌐 Web Console** - Interactive UI with graph visualization
- **📦 Zero Dependencies** - Lightweight core with no external runtime dependencies
- **🧪 Well Tested** - 28 tests covering all core functionality

---

## 📦 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd litegraph

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

---

## 🌐 Web Console

LiteGraph includes a beautiful web-based console for interacting with your graph database.

### Starting the Console

```bash
npm start
# Opens http://localhost:3000 in your browser
```

Or manually:
```bash
npm run serve
# Then open http://localhost:3000
```

### Console Features

| Feature | Description |
|---------|-------------|
| **Query Editor** | Write and execute Cypher queries with sample buttons |
| **Graph Visualizer** | Interactive force-directed graph view |
| **Results Panel** | Table view of query results with error display |
| **Import/Export** | Load and save graphs as JSON or GraphML |
| **Live Stats** | Real-time node and relationship counts |

### Graph Visualization Controls

| Action | How To |
|--------|--------|
| **Drag nodes** | Click and drag any node to reposition |
| **Zoom** | Mouse wheel or +/- buttons |
| **Pan** | Click and drag on empty canvas |
| **Recenter** | Click ◎ button or double-click canvas |

### Sample Workflow

1. **Click "Load Sample"** to add sample data (people and relationships)
2. **View the graph** in the center panel - nodes auto-arrange
3. **Run a query** like `MATCH (n:Person) RETURN n.name, n.age`
4. **See results** in the right panel table
5. **Export your graph** using the Export JSON button

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run current query |

---

## 🎯 Quick Start (TypeScript API)

```typescript
import { LiteGraph } from './src';

// Create a new graph database
const db = new LiteGraph();

// Create nodes with Cypher
db.query('CREATE (a:Person {name: "Alice", age: 30})');
db.query('CREATE (b:Person {name: "Bob", age: 25})');
db.query('CREATE (c:Company {name: "TechCorp"})');

// Create relationships
db.query(`
  MATCH (a:Person {name: "Alice"}), (b:Person {name: "Bob"})
  CREATE (a)-[:KNOWS {since: 2020}]->(b)
`);

// Query the graph
const friends = db.query(`
  MATCH (p:Person)-[:KNOWS]->(friend:Person)
  RETURN p.name, friend.name
`);
console.log(friends.records);
// [{ "p.name": "Alice", "friend.name": "Bob" }]

// Update properties
db.query('MATCH (p:Person {name: "Alice"}) SET p.age = 31');

// Delete nodes
db.query('MATCH (p:Person {name: "Bob"}) DELETE p');

// Save to file
db.saveToFile('my-graph.json');
```

---

## 📖 Cypher Query Language Support

LiteGraph supports a subset of the Cypher query language:

### Supported Clauses

| Clause | Description | Example |
|--------|-------------|---------|
| `CREATE` | Create nodes and relationships | `CREATE (n:Person {name: "Alice"})` |
| `MATCH` | Find patterns in the graph | `MATCH (n:Person) WHERE n.age > 21` |
| `WHERE` | Filter matched results | `WHERE n.name = "Alice" AND n.age > 20` |
| `RETURN` | Specify what to output | `RETURN n.name AS personName` |
| `SET` | Update properties | `SET n.age = 31` |
| `DELETE` | Remove nodes/relationships | `DELETE n` |

### Pattern Syntax

```cypher
-- Nodes
()                           -- Any node
(n)                          -- Any node, bound to variable n
(:Person)                    -- Node with Person label
(n:Person)                   -- Person node bound to n
(n:Person {name: "Alice"})   -- Person named Alice

-- Relationships
-[r]-                        -- Any relationship (either direction)
-[r:KNOWS]->                 -- Outgoing KNOWS relationship
<-[r:KNOWS]-                 -- Incoming KNOWS relationship
-[:KNOWS {since: 2020}]->    -- Relationship with properties
```

### Expression Operators

| Category | Operators |
|----------|-----------|
| Comparison | `=`, `<>`, `<`, `>`, `<=`, `>=` |
| Boolean | `AND`, `OR`, `NOT` |
| Arithmetic | `+` |

---

## 🔧 API Reference

### LiteGraph Class

The main class for interacting with the database.

#### Query Methods

```typescript
// Execute a Cypher query
const result = db.query('MATCH (n) RETURN n');
// Returns: { records: [...], summary: { nodesCreated: 0, ... } }
```

#### Direct Graph Access

```typescript
// Create nodes directly (without Cypher)
const alice = db.createNode(['Person'], { name: 'Alice', age: 30 });
const bob = db.createNode(['Person'], { name: 'Bob' });

// Create relationships directly
const rel = db.createRelationship(alice, bob, 'KNOWS', { since: 2020 });

// Get nodes
const node = db.getNode(1);              // By ID
const people = db.getNodesByLabel('Person');  // By label
const all = db.getAllNodes();            // All nodes

// Get relationships
const rels = db.getAllRelationships();

// Delete
db.deleteNode(alice);       // Also deletes connected relationships
db.deleteRelationship(rel);

// Statistics
const stats = db.getStats();
// { nodeCount: 5, relationshipCount: 3, labels: ['Person'], types: ['KNOWS'] }

// Clear everything
db.clear();
```

#### Persistence

```typescript
// Save to JSON file
db.saveToFile('graph.json');

// Load from JSON file
db.loadFromFile('graph.json');

// GraphML format
db.saveToGraphML('graph.graphml');
db.loadFromGraphML('graph.graphml');
```

#### GraphRAG / LLM Context

Export graph data in LLM-friendly text formats for use in RAG pipelines:

```typescript
// Triple format - compact, parseable
db.toTriples()
// "(Alice)-[KNOWS {since: 2020}]->(Bob)"
// "(Alice)-[WORKS_FOR]->(TechCorp)"

// Natural language - most readable
db.toNaturalLanguage()
// "Alice knows Bob (since: 2020)."
// "Alice works for TechCorp."

// Schema description
db.describeSchema()
// "## Graph Schema
//  - Node labels: Person (2), Company (1)
//  - Relationship types: KNOWS (1), WORKS_FOR (1)"

// Extract N-hop context around a node
db.extractContext(nodeId, 2, 'natural')
// Returns all nodes and relationships within 2 hops

// Complete LLM context block
db.generateLLMContext([nodeId1, nodeId2])
// Combines schema + focused context for prompt insertion
```

---

## 📁 Project Structure

```
litegraph/
├── src/                    # TypeScript source code
│   ├── index.ts            # Main LiteGraph API class
│   ├── core/
│   │   ├── graph.ts        # Node & Relationship classes
│   │   └── storage.ts      # In-memory graph storage
│   ├── cypher/
│   │   ├── lexer.ts        # Query tokenizer
│   │   ├── ast.ts          # AST node definitions
│   │   ├── parser.ts       # Recursive descent parser
│   │   └── executor.ts     # Query execution engine
│   └── compat/
│       ├── json.ts         # Neo4j JSON import/export
│       └── graphml.ts      # GraphML import/export
├── web/                    # Web console
│   ├── index.html          # Main HTML page
│   ├── styles.css          # Dark theme styles
│   ├── app.js              # Application logic
│   └── graph-viz.js        # Force-directed graph visualizer
├── tests/
│   ├── graph.test.ts       # Core graph tests (15 tests)
│   └── cypher.test.ts      # Cypher query tests (13 tests)
├── examples/               # Sample graph files
│   ├── social-network.json
│   ├── movies.json
│   ├── org-chart.json
│   └── cities.graphml
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cypher Query                              │
│            MATCH (n:Person)-[:KNOWS]->(m) RETURN n, m           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          LEXER                                   │
│   Converts text into tokens: [MATCH] [(] [n] [:] [Person] ...   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          PARSER                                  │
│   Builds Abstract Syntax Tree (AST) from tokens                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         EXECUTOR                                 │
│   Traverses AST and executes against the graph storage          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GRAPH STORAGE                               │
│   In-memory nodes & relationships with label/type indexes       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Index-Free Adjacency**: Each node stores direct references to its relationships, enabling O(1) neighbor traversal.

2. **Hand-Written Parser**: Instead of using heavy parser generators, we use a clean recursive descent parser (~300 lines) for full control and minimal dependencies.

3. **In-Memory Storage**: Prioritizes speed and simplicity. Persistence is handled via JSON export/import.

4. **Neo4j Compatibility**: Export formats match Neo4j's APOC library output for easy migration.

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📊 Sample Data

The `examples/` folder contains sample graphs you can load:

| File | Description |
|------|-------------|
| `social-network.json` | 5 people with KNOWS/FOLLOWS relationships |
| `movies.json` | Actors, directors, and films (like Neo4j's sample) |
| `org-chart.json` | Company structure with departments and employees |
| `cities.graphml` | West coast cities with route distances |

---

## 🔮 Future Enhancements

- [ ] `MERGE` clause (create if not exists)
- [ ] `ORDER BY`, `SKIP`, `LIMIT`
- [ ] Variable-length paths `(a)-[:KNOWS*1..3]->(b)`
- [ ] Aggregation functions (`count()`, `sum()`, `avg()`)
- [ ] Full-text search indexing

---

## 📄 License

MIT License - feel free to use in personal and commercial projects.

---

## 🙏 Acknowledgments

- Inspired by [Neo4j](https://neo4j.com/) and the [openCypher](https://opencypher.org/) project
- Built with TypeScript and Jest
