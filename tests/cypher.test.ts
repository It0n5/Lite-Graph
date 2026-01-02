/**
 * LiteGraph - Cypher Query Tests
 */

import { LiteGraph } from '../src/index';

describe('Cypher Queries', () => {
    let db: LiteGraph;

    beforeEach(() => {
        db = new LiteGraph();
    });

    describe('CREATE', () => {
        test('should create a node with labels and properties', () => {
            const result = db.query('CREATE (p:Person {name: "Alice", age: 30})');

            expect(result.summary.nodesCreated).toBe(1);

            const nodes = db.getNodesByLabel('Person');
            expect(nodes).toHaveLength(1);
            expect(nodes[0].get('name')).toBe('Alice');
            expect(nodes[0].get('age')).toBe(30);
        });

        test('should create multiple nodes', () => {
            db.query('CREATE (a:Person {name: "Alice"})');
            db.query('CREATE (b:Person {name: "Bob"})');

            expect(db.getNodesByLabel('Person')).toHaveLength(2);
        });

        test('should create a relationship', () => {
            db.query('CREATE (a:Person {name: "Alice"})-[:KNOWS]->(b:Person {name: "Bob"})');

            const result = db.getStats();
            expect(result.nodeCount).toBe(2);
            expect(result.relationshipCount).toBe(1);
            expect(result.types).toContain('KNOWS');
        });
    });

    describe('MATCH', () => {
        beforeEach(() => {
            db.query('CREATE (a:Person {name: "Alice", age: 30})');
            db.query('CREATE (b:Person {name: "Bob", age: 25})');
            db.query('CREATE (c:Company {name: "Acme"})');
        });

        test('should match all nodes', () => {
            const result = db.query('MATCH (n) RETURN n');
            expect(result.records).toHaveLength(3);
        });

        test('should match nodes by label', () => {
            const result = db.query('MATCH (p:Person) RETURN p');
            expect(result.records).toHaveLength(2);
        });

        test('should match nodes by property', () => {
            const result = db.query('MATCH (p:Person {name: "Alice"}) RETURN p');
            expect(result.records).toHaveLength(1);
            expect(result.records[0].p.properties.name).toBe('Alice');
        });
    });

    describe('WHERE', () => {
        beforeEach(() => {
            db.query('CREATE (a:Person {name: "Alice", age: 30})');
            db.query('CREATE (b:Person {name: "Bob", age: 25})');
            db.query('CREATE (c:Person {name: "Charlie", age: 35})');
        });

        test('should filter by equality', () => {
            const result = db.query('MATCH (p:Person) WHERE p.name = "Alice" RETURN p');
            expect(result.records).toHaveLength(1);
            expect(result.records[0].p.properties.name).toBe('Alice');
        });

        test('should filter by comparison', () => {
            const result = db.query('MATCH (p:Person) WHERE p.age > 28 RETURN p.name');
            expect(result.records).toHaveLength(2);
            expect(result.records.map(r => r['p.name'])).toContain('Alice');
            expect(result.records.map(r => r['p.name'])).toContain('Charlie');
        });

        test('should filter with AND', () => {
            const result = db.query('MATCH (p:Person) WHERE p.age > 25 AND p.age < 35 RETURN p.name');
            expect(result.records).toHaveLength(1);
            expect(result.records[0]['p.name']).toBe('Alice');
        });
    });

    describe('RETURN', () => {
        beforeEach(() => {
            db.query('CREATE (p:Person {name: "Alice", age: 30})');
        });

        test('should return specific properties', () => {
            const result = db.query('MATCH (p:Person) RETURN p.name, p.age');
            expect(result.records[0]['p.name']).toBe('Alice');
            expect(result.records[0]['p.age']).toBe(30);
        });

        test('should return with alias', () => {
            const result = db.query('MATCH (p:Person) RETURN p.name AS personName');
            expect(result.records[0]).toHaveProperty('personName', 'Alice');
        });
    });

    describe('SET', () => {
        test('should update node properties', () => {
            db.query('CREATE (p:Person {name: "Alice", age: 30})');
            db.query('MATCH (p:Person {name: "Alice"}) SET p.age = 31');

            const result = db.query('MATCH (p:Person {name: "Alice"}) RETURN p.age');
            expect(result.records[0]['p.age']).toBe(31);
        });
    });

    describe('DELETE', () => {
        test('should delete nodes', () => {
            db.query('CREATE (p:Person {name: "Alice"})');
            expect(db.getStats().nodeCount).toBe(1);

            db.query('MATCH (p:Person {name: "Alice"}) DELETE p');
            expect(db.getStats().nodeCount).toBe(0);
        });
    });

    describe('Relationship Patterns', () => {
        beforeEach(() => {
            db.query('CREATE (a:Person {name: "Alice"})-[:KNOWS]->(b:Person {name: "Bob"})');
        });

        test('should match outgoing relationship', () => {
            const result = db.query('MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name, b.name');
            expect(result.records).toHaveLength(1);
            expect(result.records[0]['a.name']).toBe('Alice');
            expect(result.records[0]['b.name']).toBe('Bob');
        });

        test('should match incoming relationship', () => {
            const result = db.query('MATCH (a:Person)<-[:KNOWS]-(b:Person) RETURN a.name, b.name');
            expect(result.records).toHaveLength(1);
            expect(result.records[0]['a.name']).toBe('Bob');
            expect(result.records[0]['b.name']).toBe('Alice');
        });
    });
});
