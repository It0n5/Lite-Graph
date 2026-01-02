/**
 * LiteGraph - Graph Core Tests
 */

import { Graph } from '../src/core/storage';
import { Node, Relationship } from '../src/core/graph';

describe('Graph Core', () => {
    let graph: Graph;

    beforeEach(() => {
        graph = new Graph();
    });

    describe('Node Operations', () => {
        test('should create a node with labels and properties', () => {
            const node = graph.createNode(['Person'], { name: 'Alice', age: 30 });

            expect(node.id).toBe(1);
            expect(node.hasLabel('Person')).toBe(true);
            expect(node.get('name')).toBe('Alice');
            expect(node.get('age')).toBe(30);
        });

        test('should create multiple nodes with incrementing IDs', () => {
            const node1 = graph.createNode(['Person'], { name: 'Alice' });
            const node2 = graph.createNode(['Person'], { name: 'Bob' });

            expect(node1.id).toBe(1);
            expect(node2.id).toBe(2);
        });

        test('should get node by ID', () => {
            const created = graph.createNode(['Person'], { name: 'Alice' });
            const fetched = graph.getNode(1);

            expect(fetched).toBe(created);
        });

        test('should get nodes by label', () => {
            graph.createNode(['Person'], { name: 'Alice' });
            graph.createNode(['Person'], { name: 'Bob' });
            graph.createNode(['Company'], { name: 'Acme' });

            const people = graph.getNodesByLabel('Person');

            expect(people).toHaveLength(2);
            expect(people.map(n => n.get('name'))).toContain('Alice');
            expect(people.map(n => n.get('name'))).toContain('Bob');
        });

        test('should delete node', () => {
            const node = graph.createNode(['Person'], { name: 'Alice' });

            expect(graph.deleteNode(node)).toBe(true);
            expect(graph.getNode(1)).toBeUndefined();
        });

        test('should update node properties', () => {
            const node = graph.createNode(['Person'], { name: 'Alice' });

            node.set('age', 30);
            node.set('name', 'Alice Smith');

            expect(node.get('age')).toBe(30);
            expect(node.get('name')).toBe('Alice Smith');
        });
    });

    describe('Relationship Operations', () => {
        test('should create a relationship between nodes', () => {
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });

            const knows = graph.createRelationship(alice, bob, 'KNOWS', { since: 2020 });

            expect(knows.id).toBe(1);
            expect(knows.type).toBe('KNOWS');
            expect(knows.startNode).toBe(alice);
            expect(knows.endNode).toBe(bob);
            expect(knows.get('since')).toBe(2020);
        });

        test('should add relationship to both nodes (index-free adjacency)', () => {
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });

            const knows = graph.createRelationship(alice, bob, 'KNOWS');

            expect(alice.relationships).toContain(knows);
            expect(bob.relationships).toContain(knows);
        });

        test('should get outgoing and incoming relationships', () => {
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });

            graph.createRelationship(alice, bob, 'KNOWS');

            expect(alice.getOutgoingRelationships('KNOWS')).toHaveLength(1);
            expect(alice.getIncomingRelationships('KNOWS')).toHaveLength(0);
            expect(bob.getOutgoingRelationships('KNOWS')).toHaveLength(0);
            expect(bob.getIncomingRelationships('KNOWS')).toHaveLength(1);
        });

        test('should delete relationships when node is deleted', () => {
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });

            graph.createRelationship(alice, bob, 'KNOWS');

            graph.deleteNode(alice);

            expect(bob.relationships).toHaveLength(0);
            expect(graph.getAllRelationships()).toHaveLength(0);
        });
    });

    describe('Serialization', () => {
        test('should export graph to JSON', () => {
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });
            graph.createRelationship(alice, bob, 'KNOWS');

            const json = graph.toJSON() as any;

            expect(json.nodes).toHaveLength(2);
            expect(json.relationships).toHaveLength(1);
            expect(json.relationships[0].type).toBe('KNOWS');
        });

        test('should import graph from JSON', () => {
            const data = {
                nodes: [
                    { id: 1, labels: ['Person'], properties: { name: 'Alice' } },
                    { id: 2, labels: ['Person'], properties: { name: 'Bob' } }
                ],
                relationships: [
                    { id: 1, type: 'KNOWS', startNode: 1, endNode: 2, properties: {} }
                ]
            };

            graph.fromJSON(data);

            expect(graph.getAllNodes()).toHaveLength(2);
            expect(graph.getAllRelationships()).toHaveLength(1);
        });
    });

    describe('Statistics', () => {
        test('should return correct stats', () => {
            graph.createNode(['Person'], { name: 'Alice' });
            graph.createNode(['Person'], { name: 'Bob' });
            graph.createNode(['Company'], { name: 'Acme' });

            const stats = graph.getStats();

            expect(stats.nodeCount).toBe(3);
            expect(stats.labels).toContain('Person');
            expect(stats.labels).toContain('Company');
        });
    });
});
