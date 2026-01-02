/**
 * LiteGraph - Security Utilities
 * 
 * Centralized security functions for input validation, sanitization,
 * and protection against common vulnerabilities.
 * 
 * @module utils/security
 */

import * as path from 'path';

// ==================== Configuration ====================

/** Maximum allowed query length in characters (100KB default) */
export const MAX_QUERY_LENGTH = 100000;

/** Maximum allowed JSON input length in characters (10MB default) */
export const MAX_JSON_LENGTH = 10 * 1024 * 1024;

/** Maximum allowed XML input length in characters (10MB default) */
export const MAX_XML_LENGTH = 10 * 1024 * 1024;

/** Properties that could be used for prototype pollution attacks */
const DANGEROUS_PROPERTIES = ['__proto__', 'constructor', 'prototype'];

// ==================== Path Validation ====================

/**
 * Validate and sanitize a file path to prevent path traversal attacks.
 * 
 * @param inputPath - The path to validate
 * @param allowedBaseDir - Optional base directory to restrict access to.
 *                         If provided, the resolved path must be within this directory.
 * @returns The normalized, validated path
 * @throws Error if the path attempts directory traversal or is outside allowed directory
 * 
 * @example
 * ```typescript
 * // With base directory restriction
 * sanitizePath('./data/graph.json', './data'); // OK
 * sanitizePath('../etc/passwd', './data');     // Throws Error
 * 
 * // Without restriction (still normalizes and validates)
 * sanitizePath('./graph.json'); // OK
 * ```
 */
export function sanitizePath(inputPath: string, allowedBaseDir?: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
        throw new Error('Invalid file path');
    }

    // Normalize the path to resolve . and .. segments
    const normalizedPath = path.normalize(inputPath);

    // Check for obvious traversal patterns in the original input
    if (inputPath.includes('..') && !allowedBaseDir) {
        // Even without a base dir restriction, warn about traversal attempts
        console.warn('Path traversal pattern detected:', inputPath);
    }

    // If a base directory is specified, ensure the resolved path is within it
    if (allowedBaseDir) {
        const resolvedBase = path.resolve(allowedBaseDir);
        const resolvedPath = path.resolve(allowedBaseDir, normalizedPath);

        // Ensure the resolved path starts with the base directory
        if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
            throw new Error('Access denied: path outside allowed directory');
        }

        return resolvedPath;
    }

    return path.resolve(normalizedPath);
}

// ==================== Property Sanitization ====================

/**
 * Sanitize an object's properties to prevent prototype pollution attacks.
 * Removes dangerous keys like __proto__, constructor, and prototype.
 * 
 * @param props - The properties object to sanitize
 * @returns A new object with dangerous properties removed
 * 
 * @example
 * ```typescript
 * const malicious = { name: 'Alice', __proto__: { admin: true } };
 * const safe = sanitizeProperties(malicious);
 * // safe = { name: 'Alice' }
 * ```
 */
export function sanitizeProperties(props: Record<string, any>): Record<string, any> {
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
        return {};
    }

    const sanitized: Record<string, any> = {};

    for (const key of Object.keys(props)) {
        // Skip dangerous property names
        if (DANGEROUS_PROPERTIES.includes(key.toLowerCase())) {
            console.warn(`Blocked potentially dangerous property: ${key}`);
            continue;
        }

        const value = props[key];

        // Recursively sanitize nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            sanitized[key] = sanitizeProperties(value);
        } else if (Array.isArray(value)) {
            // Sanitize arrays of objects
            sanitized[key] = value.map(item =>
                item && typeof item === 'object' ? sanitizeProperties(item) : item
            );
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

// ==================== Input Length Validation ====================

/**
 * Validate that a query string doesn't exceed the maximum allowed length.
 * 
 * @param query - The query string to validate
 * @param maxLength - Maximum allowed length (defaults to MAX_QUERY_LENGTH)
 * @throws Error if the query exceeds the maximum length
 */
export function validateQueryLength(query: string, maxLength: number = MAX_QUERY_LENGTH): void {
    if (!query || typeof query !== 'string') {
        return; // Empty queries are handled elsewhere
    }

    if (query.length > maxLength) {
        throw new Error(`Query exceeds maximum allowed length of ${maxLength} characters`);
    }
}

/**
 * Validate that JSON input doesn't exceed the maximum allowed length.
 * 
 * @param json - The JSON string to validate
 * @param maxLength - Maximum allowed length (defaults to MAX_JSON_LENGTH)
 * @throws Error if the JSON exceeds the maximum length
 */
export function validateJsonLength(json: string, maxLength: number = MAX_JSON_LENGTH): void {
    if (json && json.length > maxLength) {
        throw new Error(`JSON input exceeds maximum allowed length of ${maxLength} characters`);
    }
}

/**
 * Validate that XML input doesn't exceed the maximum allowed length.
 * 
 * @param xml - The XML string to validate
 * @param maxLength - Maximum allowed length (defaults to MAX_XML_LENGTH)
 * @throws Error if the XML exceeds the maximum length
 */
export function validateXmlLength(xml: string, maxLength: number = MAX_XML_LENGTH): void {
    if (xml && xml.length > maxLength) {
        throw new Error(`XML input exceeds maximum allowed length of ${maxLength} characters`);
    }
}

// ==================== Safe JSON Parsing ====================

/**
 * Safely parse JSON with prototype pollution protection.
 * 
 * @param json - The JSON string to parse
 * @returns The parsed and sanitized object
 * @throws Error if JSON is invalid or too large
 * 
 * @example
 * ```typescript
 * const data = safeJsonParse<MyType>('{"name": "Alice"}');
 * ```
 */
export function safeJsonParse<T>(json: string): T {
    validateJsonLength(json);

    const parsed = JSON.parse(json);

    // For objects, sanitize properties
    if (parsed && typeof parsed === 'object') {
        return sanitizeObject(parsed) as T;
    }

    return parsed;
}

/**
 * Recursively sanitize an object and all nested objects.
 */
function sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
        const sanitized: Record<string, any> = {};

        for (const key of Object.keys(obj)) {
            if (DANGEROUS_PROPERTIES.includes(key.toLowerCase())) {
                console.warn(`Blocked potentially dangerous property in JSON: ${key}`);
                continue;
            }
            sanitized[key] = sanitizeObject(obj[key]);
        }

        return sanitized;
    }

    return obj;
}

// ==================== Character Validation ====================

/**
 * Validate that a string contains only printable ASCII characters and common whitespace.
 * 
 * @param input - The string to validate
 * @param allowedChars - Optional regex pattern for additional allowed characters
 * @returns true if the string is valid
 */
export function validatePrintableAscii(input: string, allowedChars?: RegExp): boolean {
    if (!input || typeof input !== 'string') {
        return true;
    }

    // Allow printable ASCII (0x20-0x7E), newlines, tabs, and carriage returns
    const basePattern = /^[\x20-\x7E\n\r\t]*$/;

    if (allowedChars) {
        // If additional chars are allowed, check both patterns
        return basePattern.test(input) || allowedChars.test(input);
    }

    return basePattern.test(input);
}

// ==================== Error Sanitization ====================

/**
 * Create a user-safe error message that doesn't expose internal details.
 * Logs the full error internally for debugging.
 * 
 * @param internalMessage - The detailed internal error message
 * @param userMessage - The sanitized message to show users
 * @param context - Optional context for logging
 * @returns An Error with the user-safe message
 */
export function createSafeError(
    internalMessage: string,
    userMessage: string = 'An error occurred',
    context?: string
): Error {
    // Log the detailed error internally
    if (context) {
        console.error(`[${context}] ${internalMessage}`);
    } else {
        console.error(internalMessage);
    }

    // Return a sanitized error for users
    return new Error(userMessage);
}
