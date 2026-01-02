/**
 * LiteGraph - Cypher Parser
 * 
 * The parser is the second stage of query processing. It takes the token
 * stream from the lexer and builds an Abstract Syntax Tree (AST).
 * 
 * This is a **recursive descent parser**, meaning:
 * - Each grammar rule has a corresponding parse method
 * - Methods call each other recursively to build the tree
 * - It reads tokens from left to right, building the tree top-down
 * 
 * The parsing flow:
 * 1. Parser receives a query string
 * 2. Uses Lexer to tokenize it
 * 3. Parses clauses (MATCH, WHERE, RETURN, etc.) in sequence
 * 4. Each clause method parses its specific grammar
 * 5. Returns a complete QueryNode AST
 * 
 * Grammar supported (simplified EBNF):
 * ```
 * Query     := Clause+
 * Clause    := Match | Where | Return | Create | Set | Delete
 * Match     := 'MATCH' Pattern
 * Where     := 'WHERE' Expression
 * Return    := 'RETURN' ReturnItem (',' ReturnItem)*
 * Create    := 'CREATE' Pattern
 * Set       := 'SET' SetItem (',' SetItem)*
 * Delete    := 'DELETE' Expression (',' Expression)*
 * Pattern   := NodePattern (RelPattern NodePattern)*
 * NodePattern := '(' Variable? Label* Properties? ')'
 * ```
 * 
 * @module cypher/parser
 */

import { Token, TokenType, Lexer } from './lexer';
import {
    QueryNode, Clause, MatchClause, WhereClause, ReturnClause, CreateClause,
    SetClause, DeleteClause, PatternNode, NodePattern, RelationshipPattern,
    Expression, Literal, Identifier, PropertyAccess, BinaryExpression,
    ReturnItem, SetItem, PatternElement
} from './ast';

/**
 * Recursive descent parser for Cypher queries.
 * 
 * @example
 * ```typescript
 * const parser = new Parser();
 * const ast = parser.parse('MATCH (n:Person) WHERE n.age > 21 RETURN n.name');
 * // Returns a QueryNode with Match, Where, and Return clauses
 * ```
 */
export class Parser {
    /** The token stream from the lexer */
    private tokens: Token[] = [];

    /** Current position in the token stream */
    private current: number = 0;

    /**
     * Parse a Cypher query string into an AST.
     * 
     * This is the main entry point. It:
     * 1. Tokenizes the input using the Lexer
     * 2. Parses all clauses in sequence
     * 3. Returns the complete AST
     * 
     * @param input - The Cypher query string
     * @returns The parsed QueryNode AST
     * @throws Error if the query has syntax errors
     */
    parse(input: string): QueryNode {
        // Step 1: Tokenize the input
        const lexer = new Lexer(input);
        this.tokens = lexer.tokenize();
        this.current = 0;

        // Step 2: Parse clauses until we reach EOF
        const clauses: Clause[] = [];
        while (!this.isAtEnd()) {
            const clause = this.parseClause();
            if (clause) clauses.push(clause);
        }

        // Step 3: Return the complete query AST
        return { type: 'Query', clauses };
    }

    // ==================== Clause Parsing ====================

    /**
     * Parse the next clause based on the current token.
     * 
     * Cypher queries consist of multiple clauses in sequence:
     * MATCH ... WHERE ... RETURN ...
     * 
     * This method identifies which clause type is next and delegates
     * to the appropriate parser method.
     * 
     * @returns The parsed clause, or null if at end of input
     */
    private parseClause(): Clause | null {
        // Check which clause keyword we're at and parse accordingly
        if (this.match(TokenType.MATCH)) return this.parseMatch();
        if (this.match(TokenType.WHERE)) return this.parseWhere();
        if (this.match(TokenType.RETURN)) return this.parseReturn();
        if (this.match(TokenType.CREATE)) return this.parseCreate();
        if (this.match(TokenType.SET)) return this.parseSet();
        if (this.match(TokenType.DELETE)) return this.parseDelete();

        // If we're at the end, return null (normal termination)
        if (this.isAtEnd()) return null;

        // If we get an unexpected token, throw an error
        throw this.error(`Unexpected token: ${this.peek().value}`);
    }

    /**
     * Parse a MATCH clause.
     * 
     * Grammar: MATCH Pattern
     * 
     * The MATCH keyword has already been consumed by parseClause().
     * We just need to parse the pattern.
     */
    private parseMatch(): MatchClause {
        const pattern = this.parsePattern();
        return { type: 'Match', pattern };
    }

    /**
     * Parse a WHERE clause.
     * 
     * Grammar: WHERE Expression
     * 
     * WHERE filters results based on a boolean expression.
     */
    private parseWhere(): WhereClause {
        const expression = this.parseExpression();
        return { type: 'Where', expression };
    }

    /**
     * Parse a RETURN clause.
     * 
     * Grammar: RETURN ReturnItem (',' ReturnItem)*
     * ReturnItem: Expression ('AS' Identifier)?
     * 
     * RETURN specifies what to output from the query.
     * Items are comma-separated and can have aliases.
     */
    private parseReturn(): ReturnClause {
        const items: ReturnItem[] = [];

        do {
            // Special case: RETURN * means return all variables
            if (this.check(TokenType.STAR)) {
                this.advance();
                items.push({ expression: { type: 'Identifier', name: '*' } });
            } else {
                // Parse the expression to return
                const expression = this.parseExpression();
                let alias: string | undefined;

                // Check for optional AS alias
                if (this.match(TokenType.AS)) {
                    alias = this.consume(TokenType.IDENTIFIER, 'Expected alias after AS').value;
                }

                items.push({ expression, alias });
            }
        } while (this.match(TokenType.COMMA)); // Continue if comma-separated

        return { type: 'Return', items };
    }

    /**
     * Parse a CREATE clause.
     * 
     * Grammar: CREATE Pattern
     * 
     * CREATE adds new nodes and relationships to the graph.
     */
    private parseCreate(): CreateClause {
        const pattern = this.parsePattern();
        return { type: 'Create', pattern };
    }

    /**
     * Parse a SET clause.
     * 
     * Grammar: SET SetItem (',' SetItem)*
     * SetItem: PropertyAccess '=' Expression
     * 
     * SET updates property values on existing nodes/relationships.
     */
    private parseSet(): SetClause {
        const items: SetItem[] = [];

        do {
            // Parse the property to set (e.g., n.name)
            const target = this.parsePropertyAccess();
            // Expect equals sign
            this.consume(TokenType.EQ, 'Expected = in SET');
            // Parse the value to assign
            const value = this.parseExpression();
            items.push({ target: target as PropertyAccess, value });
        } while (this.match(TokenType.COMMA)); // Continue if comma-separated

        return { type: 'Set', items };
    }

    /**
     * Parse a DELETE clause.
     * 
     * Grammar: DELETE Expression (',' Expression)*
     * 
     * DELETE removes nodes or relationships from the graph.
     */
    private parseDelete(): DeleteClause {
        const expressions: Expression[] = [];

        do {
            expressions.push(this.parseExpression());
        } while (this.match(TokenType.COMMA)); // Continue if comma-separated

        return { type: 'Delete', expressions };
    }

    // ==================== Pattern Parsing ====================

    /**
     * Parse a graph pattern.
     * 
     * Grammar: NodePattern (RelPattern NodePattern)*
     * 
     * Patterns describe paths in the graph, alternating between
     * nodes and relationships:
     * (a)-[:KNOWS]->(b)-[:WORKS_FOR]->(c)
     */
    private parsePattern(): PatternNode {
        const elements: PatternElement[] = [];

        // Parse the first node (required)
        elements.push(this.parseNodePattern());

        // Parse alternating relationships and nodes
        // Continue while we see relationship starters (- or <-)
        while (this.check(TokenType.DASH) || this.check(TokenType.ARROW_LEFT)) {
            elements.push(this.parseRelationshipPattern());
            elements.push(this.parseNodePattern());
        }

        return { type: 'Pattern', elements };
    }

    /**
     * Parse a node pattern.
     * 
     * Grammar: '(' Variable? Label* Properties? ')'
     * 
     * Examples:
     * - ()                     Any node
     * - (n)                    Any node, bind to n
     * - (:Person)              Node with Person label
     * - (n:Person {name: "x"}) Named Person with properties
     */
    private parseNodePattern(): NodePattern {
        // Consume opening parenthesis
        this.consume(TokenType.LPAREN, 'Expected (');

        let variable: string | undefined;
        const labels: string[] = [];
        let properties: Record<string, any> | undefined;

        // Parse optional variable name
        if (this.check(TokenType.IDENTIFIER)) {
            variable = this.advance().value;
        }

        // Parse zero or more labels (each starts with :)
        while (this.match(TokenType.COLON)) {
            labels.push(this.consume(TokenType.IDENTIFIER, 'Expected label after :').value);
        }

        // Parse optional properties map
        if (this.check(TokenType.LBRACE)) {
            properties = this.parseProperties();
        }

        // Consume closing parenthesis
        this.consume(TokenType.RPAREN, 'Expected )');

        return { type: 'NodePattern', variable, labels, properties };
    }

    /**
     * Parse a relationship pattern.
     * 
     * Grammar: ('<-' | '-') '[' Variable? ':' Type? Properties? ']'? ('-' | '->')
     * 
     * Examples:
     * - --              Any relationship, any direction
     * - -->             Outgoing relationship
     * - <--             Incoming relationship
     * - -[:KNOWS]->     Outgoing KNOWS relationship
     * - -[r:KNOWS {since: 2020}]->   Named relationship with properties
     */
    private parseRelationshipPattern(): RelationshipPattern {
        let direction: 'outgoing' | 'incoming' | 'both' = 'both';

        // Check for left arrow (incoming relationship)
        if (this.match(TokenType.ARROW_LEFT)) {
            direction = 'incoming';
        } else {
            // Must have a dash to start
            this.consume(TokenType.DASH, 'Expected -');
        }

        let variable: string | undefined;
        let relType: string | undefined;
        let properties: Record<string, any> | undefined;

        // Check for optional relationship details in brackets [...]
        if (this.match(TokenType.LBRACKET)) {
            // Optional variable name
            if (this.check(TokenType.IDENTIFIER)) {
                variable = this.advance().value;
            }

            // Optional relationship type (starts with :)
            if (this.match(TokenType.COLON)) {
                relType = this.consume(TokenType.IDENTIFIER, 'Expected relationship type').value;
            }

            // Optional properties
            if (this.check(TokenType.LBRACE)) {
                properties = this.parseProperties();
            }

            // Close brackets
            this.consume(TokenType.RBRACKET, 'Expected ]');
        }

        // Check direction at the end
        if (direction === 'incoming') {
            // For <-, expect trailing -
            this.consume(TokenType.DASH, 'Expected - after <-');
        } else if (this.match(TokenType.ARROW_RIGHT)) {
            // For ->, direction is outgoing
            direction = 'outgoing';
        } else {
            // Otherwise expect trailing - (undirected)
            this.consume(TokenType.DASH, 'Expected - or ->');
        }

        return { type: 'RelationshipPattern', variable, relType, direction, properties };
    }

    /**
     * Parse a properties map.
     * 
     * Grammar: '{' (Key ':' Literal (',' Key ':' Literal)*)? '}'
     * 
     * Examples:
     * - {}
     * - {name: "Alice"}
     * - {name: "Alice", age: 30, active: true}
     */
    private parseProperties(): Record<string, any> {
        this.consume(TokenType.LBRACE, 'Expected {');
        const props: Record<string, any> = {};

        // Parse property key-value pairs until we hit }
        if (!this.check(TokenType.RBRACE)) {
            do {
                // Parse key: value
                const key = this.consume(TokenType.IDENTIFIER, 'Expected property key').value;
                this.consume(TokenType.COLON, 'Expected :');
                const value = this.parseLiteral();
                props[key] = (value as Literal).value;
            } while (this.match(TokenType.COMMA)); // Continue if comma-separated
        }

        this.consume(TokenType.RBRACE, 'Expected }');
        return props;
    }

    // ==================== Expression Parsing ====================
    // 
    // Expressions are parsed using precedence climbing:
    // Lowest precedence (parsed first, evaluated last):
    //   OR
    //   AND
    //   Comparison (=, <>, <, >, <=, >=)
    //   Primary (literals, identifiers, property access)
    // Highest precedence (parsed last, evaluated first)

    /**
     * Parse an expression (entry point).
     * Starts with the lowest precedence operator (OR).
     */
    private parseExpression(): Expression {
        return this.parseOr();
    }

    /**
     * Parse OR expressions.
     * 
     * Grammar: AndExpr ('OR' AndExpr)*
     * 
     * OR has the lowest precedence.
     */
    private parseOr(): Expression {
        let left = this.parseAnd();

        while (this.match(TokenType.OR)) {
            const right = this.parseAnd();
            left = { type: 'BinaryExpression', operator: 'OR', left, right };
        }

        return left;
    }

    /**
     * Parse AND expressions.
     * 
     * Grammar: CompareExpr ('AND' CompareExpr)*
     * 
     * AND has higher precedence than OR.
     */
    private parseAnd(): Expression {
        let left = this.parseComparison();

        while (this.match(TokenType.AND)) {
            const right = this.parseComparison();
            left = { type: 'BinaryExpression', operator: 'AND', left, right };
        }

        return left;
    }

    /**
     * Parse comparison expressions.
     * 
     * Grammar: Primary (CompareOp Primary)*
     * CompareOp: '=' | '<>' | '<' | '>' | '<=' | '>='
     */
    private parseComparison(): Expression {
        let left = this.parsePrimary();

        while (true) {
            let operator: '=' | '<>' | '<' | '>' | '<=' | '>=' | undefined;

            // Check for comparison operators
            if (this.match(TokenType.EQ)) operator = '=';
            else if (this.match(TokenType.NEQ)) operator = '<>';
            else if (this.match(TokenType.LT)) operator = '<';
            else if (this.match(TokenType.GT)) operator = '>';
            else if (this.match(TokenType.LTE)) operator = '<=';
            else if (this.match(TokenType.GTE)) operator = '>=';

            if (!operator) break;

            const right = this.parsePrimary();
            left = { type: 'BinaryExpression', operator, left, right };
        }

        return left;
    }

    /**
     * Parse primary expressions (highest precedence).
     * 
     * Primary expressions are:
     * - Literals (numbers, strings, booleans, null)
     * - Identifiers (variable references)
     * - Property access (n.name)
     * - Parenthesized expressions ((a + b))
     */
    private parsePrimary(): Expression {
        // Check for literals
        if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
            this.check(TokenType.TRUE) || this.check(TokenType.FALSE) ||
            this.check(TokenType.NULL)) {
            return this.parseLiteral();
        }

        // Check for identifier (possibly with property access)
        if (this.check(TokenType.IDENTIFIER)) {
            return this.parsePropertyAccess();
        }

        // Check for parenthesized expression
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RPAREN, 'Expected )');
            return expr;
        }

        // No valid primary expression found
        throw this.error(`Unexpected token in expression: ${this.peek().value}`);
    }

    /**
     * Parse a literal value.
     * 
     * Literals: numbers, strings, booleans, null
     */
    private parseLiteral(): Literal {
        // Numbers (integers and decimals)
        if (this.match(TokenType.NUMBER)) {
            const value = this.previous().value;
            return { type: 'Literal', value: value.includes('.') ? parseFloat(value) : parseInt(value, 10) };
        }
        // Strings
        if (this.match(TokenType.STRING)) {
            return { type: 'Literal', value: this.previous().value };
        }
        // Booleans
        if (this.match(TokenType.TRUE)) {
            return { type: 'Literal', value: true };
        }
        if (this.match(TokenType.FALSE)) {
            return { type: 'Literal', value: false };
        }
        // Null
        if (this.match(TokenType.NULL)) {
            return { type: 'Literal', value: null };
        }
        throw this.error('Expected literal value');
    }

    /**
     * Parse an identifier, possibly followed by property access.
     * 
     * Grammar: Identifier ('.' Identifier)*
     * 
     * Examples:
     * - n           Just an identifier
     * - n.name      Property access
     * - n.address.city   Nested property access
     */
    private parsePropertyAccess(): Expression {
        // Start with the identifier
        let expr: Expression = {
            type: 'Identifier',
            name: this.consume(TokenType.IDENTIFIER, 'Expected identifier').value
        };

        // Check for property access (can be chained)
        while (this.match(TokenType.DOT)) {
            const property = this.consume(TokenType.IDENTIFIER, 'Expected property name').value;
            expr = { type: 'PropertyAccess', object: expr, property };
        }

        return expr;
    }

    // ==================== Token Navigation Helpers ====================

    /**
     * Check if the current token matches any of the given types.
     * If it matches, consume the token and return true.
     * 
     * @param types - Token types to check for
     * @returns True if a match was found and consumed
     */
    private match(...types: TokenType[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    /**
     * Check if the current token is of the given type.
     * Does NOT consume the token.
     * 
     * @param type - Token type to check
     * @returns True if current token matches
     */
    private check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    /**
     * Consume the current token and advance to the next.
     * 
     * @returns The consumed token
     */
    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    /**
     * Check if we've reached the end of the token stream.
     * 
     * @returns True if current token is EOF
     */
    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    /**
     * Get the current token without consuming it.
     * 
     * @returns The current token
     */
    private peek(): Token {
        return this.tokens[this.current];
    }

    /**
     * Get the previously consumed token.
     * 
     * @returns The previous token
     */
    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    /**
     * Consume a token of the expected type, or throw an error.
     * 
     * @param type - Expected token type
     * @param message - Error message if token doesn't match
     * @returns The consumed token
     * @throws Error if token doesn't match expected type
     */
    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        throw this.error(message);
    }

    /**
     * Create a parse error with position information.
     * 
     * @param message - Error message
     * @returns Error object with position info
     */
    private error(message: string): Error {
        const token = this.peek();
        return new Error(`Parse error at position ${token.position}: ${message}`);
    }
}
