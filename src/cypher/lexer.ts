/**
 * LiteGraph - Cypher Lexer (Tokenizer)
 * 
 * The lexer is the first stage of parsing a Cypher query. It converts raw
 * query text into a stream of tokens that the parser can understand.
 * 
 * For example, the query:
 *   MATCH (n:Person {name: "Alice"}) RETURN n.name
 * 
 * Becomes tokens:
 *   [MATCH] [(] [n] [:] [Person] [{] [name] [:] ["Alice"] [}] [)] [RETURN] [n] [.] [name]
 * 
 * The lexer handles:
 * - Keywords (MATCH, WHERE, RETURN, CREATE, SET, DELETE, etc.)
 * - Symbols (parentheses, brackets, braces, colons, commas)
 * - Operators (=, <>, <, >, <=, >=, ->, <-)
 * - String literals ("text" or 'text')
 * - Numbers (integers and decimals)
 * - Identifiers (variable and property names)
 * 
 * @module cypher/lexer
 */

/**
 * Enum of all possible token types.
 * 
 * Tokens are categorized into:
 * - Keywords: Reserved words in Cypher (MATCH, WHERE, etc.)
 * - Symbols: Punctuation and structural characters
 * - Operators: Comparison and arithmetic operators
 * - Literals: Values like strings, numbers, identifiers
 * - Special: EOF (end of file/query)
 */
export enum TokenType {
    // ==================== Keywords ====================
    /** MATCH clause - for pattern matching */
    MATCH = 'MATCH',
    /** WHERE clause - for filtering results */
    WHERE = 'WHERE',
    /** RETURN clause - for specifying output */
    RETURN = 'RETURN',
    /** CREATE clause - for creating nodes/relationships */
    CREATE = 'CREATE',
    /** SET clause - for updating properties */
    SET = 'SET',
    /** DELETE clause - for removing nodes/relationships */
    DELETE = 'DELETE',
    /** MERGE clause - create if not exists */
    MERGE = 'MERGE',
    /** REMOVE clause - for removing properties/labels */
    REMOVE = 'REMOVE',
    /** AND boolean operator */
    AND = 'AND',
    /** OR boolean operator */
    OR = 'OR',
    /** NOT boolean operator */
    NOT = 'NOT',
    /** AS keyword for aliasing in RETURN */
    AS = 'AS',
    /** TRUE boolean literal */
    TRUE = 'TRUE',
    /** FALSE boolean literal */
    FALSE = 'FALSE',
    /** NULL literal */
    NULL = 'NULL',

    // ==================== Symbols ====================
    /** Left parenthesis ( - starts node patterns */
    LPAREN = 'LPAREN',
    /** Right parenthesis ) - ends node patterns */
    RPAREN = 'RPAREN',
    /** Left bracket [ - starts relationship details */
    LBRACKET = 'LBRACKET',
    /** Right bracket ] - ends relationship details */
    RBRACKET = 'RBRACKET',
    /** Left brace { - starts property maps */
    LBRACE = 'LBRACE',
    /** Right brace } - ends property maps */
    RBRACE = 'RBRACE',
    /** Colon : - separates labels and property keys */
    COLON = 'COLON',
    /** Comma , - separates list items */
    COMMA = 'COMMA',
    /** Dot . - property access */
    DOT = 'DOT',
    /** Right arrow -> - outgoing relationship direction */
    ARROW_RIGHT = 'ARROW_RIGHT',
    /** Left arrow <- - incoming relationship direction */
    ARROW_LEFT = 'ARROW_LEFT',
    /** Dash - - relationship connector */
    DASH = 'DASH',
    /** Pipe | - used in relationship type alternatives */
    PIPE = 'PIPE',

    // ==================== Operators ====================
    /** Equals = - assignment or comparison */
    EQ = 'EQ',
    /** Not equals <> */
    NEQ = 'NEQ',
    /** Less than < */
    LT = 'LT',
    /** Greater than > */
    GT = 'GT',
    /** Less than or equal <= */
    LTE = 'LTE',
    /** Greater than or equal >= */
    GTE = 'GTE',
    /** Plus + - addition */
    PLUS = 'PLUS',
    /** Asterisk * - multiplication or "return all" */
    STAR = 'STAR',

    // ==================== Literals ====================
    /** Variable or property name */
    IDENTIFIER = 'IDENTIFIER',
    /** String literal (quoted text) */
    STRING = 'STRING',
    /** Numeric literal (integer or decimal) */
    NUMBER = 'NUMBER',

    // ==================== Special ====================
    /** End of file/query marker */
    EOF = 'EOF',
}

/**
 * Represents a single token in the token stream.
 */
export interface Token {
    /** The type of this token */
    type: TokenType;
    /** The string value of this token */
    value: string;
    /** Character position in the original query (for error messages) */
    position: number;
}

/**
 * Mapping of uppercase keyword strings to their TokenType.
 * Used to distinguish keywords from regular identifiers.
 */
const KEYWORDS: Record<string, TokenType> = {
    'MATCH': TokenType.MATCH,
    'WHERE': TokenType.WHERE,
    'RETURN': TokenType.RETURN,
    'CREATE': TokenType.CREATE,
    'SET': TokenType.SET,
    'DELETE': TokenType.DELETE,
    'MERGE': TokenType.MERGE,
    'REMOVE': TokenType.REMOVE,
    'AND': TokenType.AND,
    'OR': TokenType.OR,
    'NOT': TokenType.NOT,
    'AS': TokenType.AS,
    'TRUE': TokenType.TRUE,
    'FALSE': TokenType.FALSE,
    'NULL': TokenType.NULL,
};

/**
 * Lexer class that tokenizes Cypher queries.
 * 
 * The lexer scans through the input string character by character,
 * identifying tokens and their types. It maintains a position pointer
 * and builds up a list of tokens.
 * 
 * @example
 * ```typescript
 * const lexer = new Lexer('MATCH (n) RETURN n');
 * const tokens = lexer.tokenize();
 * // [
 * //   { type: 'MATCH', value: 'MATCH', position: 0 },
 * //   { type: 'LPAREN', value: '(', position: 6 },
 * //   { type: 'IDENTIFIER', value: 'n', position: 7 },
 * //   { type: 'RPAREN', value: ')', position: 8 },
 * //   { type: 'RETURN', value: 'RETURN', position: 10 },
 * //   { type: 'IDENTIFIER', value: 'n', position: 17 },
 * //   { type: 'EOF', value: '', position: 18 }
 * // ]
 * ```
 */
export class Lexer {
    /** The input query string */
    private input: string;

    /** Current position in the input string */
    private position: number = 0;

    /** Accumulated list of tokens */
    private tokens: Token[] = [];

    /**
     * Create a new Lexer for the given input query.
     * 
     * @param input - The Cypher query string to tokenize
     */
    constructor(input: string) {
        this.input = input;
    }

    /**
     * Tokenize the input query into an array of tokens.
     * 
     * This is the main entry point for the lexer. It scans through
     * the entire input and returns all tokens, ending with an EOF token.
     * 
     * @returns Array of tokens representing the query
     * @throws Error if an unexpected character is encountered
     */
    tokenize(): Token[] {
        while (this.position < this.input.length) {
            // Skip any whitespace between tokens
            this.skipWhitespace();
            if (this.position >= this.input.length) break;

            const char = this.input[this.position];

            // ==================== Single Character Tokens ====================
            if (char === '(') { this.addToken(TokenType.LPAREN, char); continue; }
            if (char === ')') { this.addToken(TokenType.RPAREN, char); continue; }
            if (char === '[') { this.addToken(TokenType.LBRACKET, char); continue; }
            if (char === ']') { this.addToken(TokenType.RBRACKET, char); continue; }
            if (char === '{') { this.addToken(TokenType.LBRACE, char); continue; }
            if (char === '}') { this.addToken(TokenType.RBRACE, char); continue; }
            if (char === ':') { this.addToken(TokenType.COLON, char); continue; }
            if (char === ',') { this.addToken(TokenType.COMMA, char); continue; }
            if (char === '.') { this.addToken(TokenType.DOT, char); continue; }
            if (char === '+') { this.addToken(TokenType.PLUS, char); continue; }
            if (char === '*') { this.addToken(TokenType.STAR, char); continue; }
            if (char === '|') { this.addToken(TokenType.PIPE, char); continue; }

            // ==================== Multi-Character Tokens ====================

            // Dash can be part of -> or standalone -
            if (char === '-') {
                if (this.peek(1) === '>') {
                    this.addToken(TokenType.ARROW_RIGHT, '->', 2);
                } else {
                    this.addToken(TokenType.DASH, char);
                }
                continue;
            }

            // Less-than can be <-, <>, <=, or standalone <
            if (char === '<') {
                if (this.peek(1) === '-') {
                    this.addToken(TokenType.ARROW_LEFT, '<-', 2);
                } else if (this.peek(1) === '>') {
                    this.addToken(TokenType.NEQ, '<>', 2);
                } else if (this.peek(1) === '=') {
                    this.addToken(TokenType.LTE, '<=', 2);
                } else {
                    this.addToken(TokenType.LT, char);
                }
                continue;
            }

            // Greater-than can be >= or standalone >
            if (char === '>') {
                if (this.peek(1) === '=') {
                    this.addToken(TokenType.GTE, '>=', 2);
                } else {
                    this.addToken(TokenType.GT, char);
                }
                continue;
            }

            // Equals sign (used for assignment and comparison)
            if (char === '=') {
                this.addToken(TokenType.EQ, char);
                continue;
            }

            // ==================== Complex Tokens ====================

            // String literals (double or single quoted)
            if (char === '"' || char === "'") {
                this.readString(char);
                continue;
            }

            // Numeric literals
            if (this.isDigit(char)) {
                this.readNumber();
                continue;
            }

            // Identifiers and keywords (start with letter or underscore)
            if (this.isAlpha(char) || char === '_') {
                this.readIdentifier();
                continue;
            }

            // If we get here, it's an unexpected character
            throw new Error(`Unexpected character '${char}' at position ${this.position}`);
        }

        // Add the EOF token to signal end of input
        this.tokens.push({ type: TokenType.EOF, value: '', position: this.position });
        return this.tokens;
    }

    /**
     * Skip over any whitespace characters (spaces, tabs, newlines).
     */
    private skipWhitespace(): void {
        while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
            this.position++;
        }
    }

    /**
     * Peek ahead in the input without advancing position.
     * 
     * @param offset - Number of characters to look ahead (0 = current char)
     * @returns The character at the offset, or empty string if past end
     */
    private peek(offset: number = 0): string {
        return this.input[this.position + offset] || '';
    }

    /**
     * Add a token to the token list and advance position.
     * 
     * @param type - The token type
     * @param value - The string value
     * @param length - How far to advance (default 1)
     */
    private addToken(type: TokenType, value: string, length: number = 1): void {
        this.tokens.push({ type, value, position: this.position });
        this.position += length;
    }

    /**
     * Read a string literal, handling escape sequences.
     * 
     * Supports escape sequences: \n, \t, \r, \\, \", \'
     * 
     * @param quote - The opening quote character (" or ')
     * @throws Error if the string is not terminated
     */
    private readString(quote: string): void {
        const start = this.position;
        this.position++; // Skip opening quote
        let value = '';

        while (this.position < this.input.length && this.input[this.position] !== quote) {
            // Handle escape sequences
            if (this.input[this.position] === '\\') {
                this.position++;
                if (this.position < this.input.length) {
                    const escaped = this.input[this.position];
                    if (escaped === 'n') value += '\n';
                    else if (escaped === 't') value += '\t';
                    else if (escaped === 'r') value += '\r';
                    else value += escaped; // For \\, \", \' just use the character
                }
            } else {
                value += this.input[this.position];
            }
            this.position++;
        }

        // Check for unterminated string
        if (this.position >= this.input.length) {
            throw new Error(`Unterminated string at position ${start}`);
        }

        this.position++; // Skip closing quote
        this.tokens.push({ type: TokenType.STRING, value, position: start });
    }

    /**
     * Read a numeric literal (integer or decimal).
     * 
     * Examples: 42, 3.14, 0.5
     */
    private readNumber(): void {
        const start = this.position;
        while (this.position < this.input.length && (this.isDigit(this.input[this.position]) || this.input[this.position] === '.')) {
            this.position++;
        }
        const value = this.input.slice(start, this.position);
        this.tokens.push({ type: TokenType.NUMBER, value, position: start });
    }

    /**
     * Read an identifier or keyword.
     * 
     * If the identifier matches a keyword (case-insensitive), 
     * it's classified as that keyword. Otherwise, it's an identifier.
     */
    private readIdentifier(): void {
        const start = this.position;
        while (this.position < this.input.length && (this.isAlphaNumeric(this.input[this.position]) || this.input[this.position] === '_')) {
            this.position++;
        }
        const value = this.input.slice(start, this.position);
        const upperValue = value.toUpperCase();

        // Check if it's a keyword (case-insensitive)
        const type = KEYWORDS[upperValue] || TokenType.IDENTIFIER;

        // For keywords, use uppercase; for identifiers, preserve case
        this.tokens.push({ type, value: type === TokenType.IDENTIFIER ? value : upperValue, position: start });
    }

    /** Check if a character is a digit 0-9 */
    private isDigit(char: string): boolean {
        return /[0-9]/.test(char);
    }

    /** Check if a character is a letter a-z or A-Z */
    private isAlpha(char: string): boolean {
        return /[a-zA-Z]/.test(char);
    }

    /** Check if a character is alphanumeric */
    private isAlphaNumeric(char: string): boolean {
        return /[a-zA-Z0-9]/.test(char);
    }
}
