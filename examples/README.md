# LiteGraph Sample Data

This folder contains sample graph files to demonstrate LiteGraph's import capabilities.

## JSON Files (Neo4j APOC compatible)

### social-network.json
A social network with 5 people connected via `KNOWS` and `FOLLOWS` relationships.
```typescript
db.loadFromFile('examples/social-network.json');
db.query('MATCH (p:Person)-[:KNOWS]->(friend) RETURN p.name, friend.name');
```

### movies.json
A movie database with actors, directors, and films (similar to Neo4j's example dataset).
```typescript
db.loadFromFile('examples/movies.json');
db.query('MATCH (a:Person)-[:ACTED_IN]->(m:Movie) RETURN a.name, m.title');
```

### org-chart.json
A corporate organization with departments, employees, and projects.
```typescript
db.loadFromFile('examples/org-chart.json');
db.query('MATCH (e:Employee)-[:MANAGES]->(sub) RETURN e.name, sub.name');
```

## GraphML Files

### cities.graphml
West coast cities connected by routes with distances in miles.
```typescript
db.loadFromGraphML('examples/cities.graphml');
db.query('MATCH (a:City)-[r:CONNECTED_TO]->(b:City) RETURN a.name, b.name');
```

## Usage

```typescript
import { LiteGraph } from '../src';

const db = new LiteGraph();

// Load JSON
db.loadFromFile('examples/movies.json');

// Load GraphML
db.loadFromGraphML('examples/cities.graphml');

// Query the loaded data
const actors = db.query('MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name, m.title');
console.log(actors.records);
```
