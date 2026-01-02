/**
 * LiteGraph - Security Tests
 * 
 * Tests to verify security mitigations are working correctly.
 * These tests should be run as part of the CI/CD pipeline.
 */

import {
    sanitizePath,
    sanitizeProperties,
    validateQueryLength,
    validateJsonLength,
    validateXmlLength,
    safeJsonParse,
    createSafeError,
    MAX_QUERY_LENGTH
} from '../src/utils/security';
import { Graph } from '../src/core/storage';
import { LiteGraph } from '../src/index';
import * as path from 'path';

describe('Security Utilities', () => {

    // ==================== Path Sanitization Tests ====================

    describe('sanitizePath', () => {
        it('should normalize paths correctly', () => {
            const result = sanitizePath('./data/test.json');
            expect(result).toBeDefined();
            expect(path.isAbsolute(result)).toBe(true);
        });

        it('should block path traversal attempts with base directory', () => {
            expect(() => {
                sanitizePath('../../../etc/passwd', './data');
            }).toThrow('Access denied: path outside allowed directory');
        });

        it('should block parent directory traversal', () => {
            expect(() => {
                sanitizePath('../../secret.json', './allowed');
            }).toThrow('Access denied: path outside allowed directory');
        });

        it('should allow paths within base directory', () => {
            const baseDir = process.cwd();
            const result = sanitizePath('test.json', baseDir);
            expect(result.startsWith(baseDir)).toBe(true);
        });

        it('should reject empty paths', () => {
            expect(() => {
                sanitizePath('');
            }).toThrow('Invalid file path');
        });

        it('should reject null/undefined paths', () => {
            expect(() => {
                sanitizePath(null as any);
            }).toThrow('Invalid file path');
        });
    });

    // ==================== Property Sanitization Tests ====================

    describe('sanitizeProperties', () => {
        it('should remove __proto__ property', () => {
            const malicious = { name: 'Alice', __proto__: { admin: true } };
            const safe = sanitizeProperties(malicious);
            expect(safe).toEqual({ name: 'Alice' });
            expect(Object.prototype.hasOwnProperty.call(safe, '__proto__')).toBe(false);
        });

        it('should remove constructor property', () => {
            const malicious = { name: 'Bob', constructor: 'malicious' };
            const safe = sanitizeProperties(malicious);
            expect(safe).toEqual({ name: 'Bob' });
        });

        it('should remove prototype property', () => {
            const malicious = { name: 'Charlie', prototype: { evil: true } };
            const safe = sanitizeProperties(malicious);
            expect(safe).toEqual({ name: 'Charlie' });
        });

        it('should sanitize nested objects', () => {
            const malicious = {
                user: {
                    name: 'Alice',
                    __proto__: { admin: true }
                }
            };
            const safe = sanitizeProperties(malicious);
            expect(safe.user).toEqual({ name: 'Alice' });
        });

        it('should handle arrays of objects', () => {
            const malicious = {
                users: [
                    { name: 'Alice', __proto__: {} },
                    { name: 'Bob' }
                ]
            };
            const safe = sanitizeProperties(malicious);
            expect(safe.users).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
        });

        it('should preserve safe properties', () => {
            const safe = { name: 'Alice', age: 30, active: true };
            expect(sanitizeProperties(safe)).toEqual(safe);
        });

        it('should handle empty objects', () => {
            expect(sanitizeProperties({})).toEqual({});
        });

        it('should handle null/undefined gracefully', () => {
            expect(sanitizeProperties(null as any)).toEqual({});
            expect(sanitizeProperties(undefined as any)).toEqual({});
        });
    });

    // ==================== Input Length Validation Tests ====================

    describe('validateQueryLength', () => {
        it('should pass for queries under the limit', () => {
            expect(() => {
                validateQueryLength('MATCH (n) RETURN n');
            }).not.toThrow();
        });

        it('should throw for queries over the limit', () => {
            const oversizedQuery = 'MATCH ' + 'n'.repeat(MAX_QUERY_LENGTH + 1);
            expect(() => {
                validateQueryLength(oversizedQuery);
            }).toThrow(/exceeds maximum allowed length/);
        });

        it('should accept custom max length', () => {
            expect(() => {
                validateQueryLength('12345', 3);
            }).toThrow(/exceeds maximum allowed length/);
        });

        it('should handle empty queries', () => {
            expect(() => {
                validateQueryLength('');
            }).not.toThrow();
        });
    });

    describe('validateJsonLength', () => {
        it('should pass for small JSON', () => {
            expect(() => {
                validateJsonLength('{"name": "Alice"}');
            }).not.toThrow();
        });

        it('should throw for oversized JSON', () => {
            const oversizedJson = '{"data": "' + 'x'.repeat(11 * 1024 * 1024) + '"}';
            expect(() => {
                validateJsonLength(oversizedJson);
            }).toThrow(/exceeds maximum allowed length/);
        });
    });

    // ==================== Safe JSON Parsing Tests ====================

    describe('safeJsonParse', () => {
        it('should parse valid JSON correctly', () => {
            const result = safeJsonParse<{ name: string }>('{"name": "Alice"}');
            expect(result).toEqual({ name: 'Alice' });
        });

        it('should sanitize __proto__ from parsed JSON', () => {
            const maliciousJson = '{"name": "Alice", "__proto__": {"admin": true}}';
            const result = safeJsonParse<{ name: string }>(maliciousJson);
            expect(result).toEqual({ name: 'Alice' });
            expect((Object as any).prototype.admin).toBeUndefined();
        });

        it('should sanitize nested dangerous properties', () => {
            const maliciousJson = '{"user": {"name": "Alice", "constructor": "evil"}}';
            const result = safeJsonParse<any>(maliciousJson);
            expect(result.user).toEqual({ name: 'Alice' });
        });

        it('should throw for invalid JSON', () => {
            expect(() => {
                safeJsonParse('not valid json');
            }).toThrow();
        });

        it('should handle arrays correctly', () => {
            const result = safeJsonParse<string[]>('["a", "b", "c"]');
            expect(result).toEqual(['a', 'b', 'c']);
        });
    });

    // ==================== Error Sanitization Tests ====================

    describe('createSafeError', () => {
        it('should return error with user-safe message', () => {
            const error = createSafeError(
                'Detailed internal error at position 42',
                'An error occurred'
            );
            expect(error.message).toBe('An error occurred');
        });

        it('should not expose internal details in error message', () => {
            const error = createSafeError(
                'SQL injection attempt detected: SELECT * FROM users',
                'Invalid input'
            );
            expect(error.message).not.toContain('SQL');
            expect(error.message).not.toContain('SELECT');
        });
    });
});

// ==================== Integration Tests ====================

describe('Security Integration Tests', () => {

    describe('Graph Storage Protection', () => {
        it('should sanitize properties when creating nodes', () => {
            const graph = new Graph();
            const node = graph.createNode(['Person'], {
                name: 'Alice',
                __proto__: { admin: true }
            } as any);

            expect(node.get('name')).toBe('Alice');
            expect(node.get('__proto__')).toBeUndefined();
            expect((Object as any).prototype.admin).toBeUndefined();
        });

        it('should sanitize properties when creating relationships', () => {
            const graph = new Graph();
            const alice = graph.createNode(['Person'], { name: 'Alice' });
            const bob = graph.createNode(['Person'], { name: 'Bob' });

            const rel = graph.createRelationship(alice, bob, 'KNOWS', {
                since: 2020,
                constructor: 'evil'
            } as any);

            expect(rel.get('since')).toBe(2020);
            expect(rel.get('constructor')).toBeUndefined();
        });
    });

    describe('LiteGraph Query Validation', () => {
        it('should reject oversized queries', () => {
            const db = new LiteGraph();
            const oversizedQuery = 'MATCH ' + 'n'.repeat(MAX_QUERY_LENGTH + 1);

            expect(() => {
                db.query(oversizedQuery);
            }).toThrow(/exceeds maximum allowed length/);
        });

        it('should execute normal queries successfully', () => {
            const db = new LiteGraph();
            const result = db.query('CREATE (n:Person {name: "Alice"})');
            expect(result.summary.nodesCreated).toBe(1);
        });
    });
});
