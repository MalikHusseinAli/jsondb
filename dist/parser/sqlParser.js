"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlParser = void 0;
const types_1 = require("../storage/types");
const ast_1 = require("./ast");
const VALID_DATA_TYPES = new Set(types_1.COLUMN_DATA_TYPES);
const COMPARISON_OPERATORS_SET = new Set(ast_1.COMPARISON_OPERATORS);
class SqlParser {
    tokens = [];
    cursor = 0;
    parse(sql) {
        const cleaned = sql.trim().replace(/;+\s*$/, '');
        if (!cleaned) {
            throw new Error('Empty SQL statement');
        }
        this.tokens = this.tokenize(cleaned);
        this.cursor = 0;
        const first = this.peek();
        if (!first || first.type !== 'WORD') {
            throw new Error(`Unexpected token at start of query: "${first?.value ?? ''}"`);
        }
        const keyword = first.value.toUpperCase();
        switch (keyword) {
            case 'CREATE':
                return this.parseCreate();
            case 'DROP':
                return this.parseDrop();
            case 'TRUNCATE':
                return this.parseTruncate();
            case 'ALTER':
                return this.parseAlter();
            case 'SHOW':
                return this.parseShow();
            case 'INSERT':
                return this.parseInsert();
            case 'SELECT':
                return this.parseSelect();
            case 'UPDATE':
                return this.parseUpdate();
            case 'DELETE':
                return this.parseDelete();
            default:
                throw new Error(`Unsupported SQL command: "${first.value}"`);
        }
    }
    tokenize(input) {
        const tokens = [];
        let i = 0;
        while (i < input.length) {
            const char = input[i];
            if (/\s/.test(char)) {
                i++;
                continue;
            }
            if (char === "'") {
                let value = '';
                i++;
                let closed = false;
                while (i < input.length) {
                    if (input[i] === "'" && input[i + 1] === "'") {
                        value += "'";
                        i += 2;
                    }
                    else if (input[i] === "'") {
                        closed = true;
                        i++;
                        break;
                    }
                    else {
                        value += input[i];
                        i++;
                    }
                }
                if (!closed) {
                    throw new Error('Unterminated string literal in SQL query');
                }
                tokens.push({ type: 'STRING', value });
                continue;
            }
            if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
                let numStr = char;
                i++;
                while (i < input.length && /[0-9.]/.test(input[i])) {
                    numStr += input[i];
                    i++;
                }
                if (Number.isNaN(Number(numStr))) {
                    throw new Error(`Invalid numeric literal: "${numStr}"`);
                }
                tokens.push({ type: 'NUMBER', value: numStr });
                continue;
            }
            const twoChar = input.slice(i, i + 2);
            if (twoChar === '!=' || twoChar === '<>' || twoChar === '>=' || twoChar === '<=') {
                tokens.push({
                    type: 'OPERATOR',
                    value: twoChar === '<>' ? '!=' : twoChar
                });
                i += 2;
                continue;
            }
            if (char === '=' || char === '>' || char === '<') {
                tokens.push({ type: 'OPERATOR', value: char });
                i++;
                continue;
            }
            if (char === '(' || char === ')' || char === ',' || char === '*' || char === '.') {
                tokens.push({ type: 'PUNCTUATION', value: char });
                i++;
                continue;
            }
            if (/[a-zA-Z_]/.test(char)) {
                let word = char;
                i++;
                while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
                    word += input[i];
                    i++;
                }
                tokens.push({ type: 'WORD', value: word });
                continue;
            }
            throw new Error(`Unexpected character in SQL query: "${char}"`);
        }
        return tokens;
    }
    peek(offset = 0) {
        return this.tokens[this.cursor + offset];
    }
    consume() {
        const token = this.tokens[this.cursor];
        if (!token) {
            throw new Error('Unexpected end of SQL query');
        }
        this.cursor++;
        return token;
    }
    matchKeyword(keyword) {
        const token = this.peek();
        if (token && token.type === 'WORD' && token.value.toUpperCase() === keyword) {
            this.cursor++;
            return true;
        }
        return false;
    }
    expectKeyword(keyword) {
        if (!this.matchKeyword(keyword)) {
            const found = this.peek()?.value ?? 'EOF';
            throw new Error(`Expected keyword "${keyword}", found "${found}"`);
        }
    }
    expectPunctuation(symbol) {
        const token = this.peek();
        if (!token || token.type !== 'PUNCTUATION' || token.value !== symbol) {
            throw new Error(`Expected "${symbol}", found "${token?.value ?? 'EOF'}"`);
        }
        this.cursor++;
    }
    expectIdentifier() {
        const token = this.peek();
        if (!token || token.type !== 'WORD') {
            throw new Error(`Expected identifier, found "${token?.value ?? 'EOF'}"`);
        }
        this.cursor++;
        return token.value.toLowerCase();
    }
    expectEnd() {
        if (this.cursor < this.tokens.length) {
            throw new Error(`Unexpected trailing token: "${this.tokens[this.cursor].value}"`);
        }
    }
    parseLiteral() {
        const token = this.consume();
        if (token.type === 'STRING') {
            return token.value;
        }
        if (token.type === 'NUMBER') {
            return Number(token.value);
        }
        if (token.type === 'WORD') {
            const upper = token.value.toUpperCase();
            if (upper === 'TRUE')
                return true;
            if (upper === 'FALSE')
                return false;
            if (upper === 'NULL')
                return null;
        }
        throw new Error(`Expected literal value, found "${token.value}"`);
    }
    parseCreate() {
        this.expectKeyword('CREATE');
        if (this.matchKeyword('DATABASE')) {
            const databaseName = this.expectIdentifier();
            this.expectEnd();
            return { type: 'CREATE_DATABASE', databaseName };
        }
        if (this.matchKeyword('TABLE')) {
            const tableName = this.expectIdentifier();
            this.expectPunctuation('(');
            const columns = [];
            while (true) {
                columns.push(this.parseColumnDefinition());
                const next = this.peek();
                if (next && next.type === 'PUNCTUATION' && next.value === ',') {
                    this.consume();
                    continue;
                }
                break;
            }
            this.expectPunctuation(')');
            this.expectEnd();
            return { type: 'CREATE_TABLE', tableName, columns };
        }
        throw new Error(`Expected DATABASE or TABLE after CREATE, found "${this.peek()?.value ?? 'EOF'}"`);
    }
    parseColumnDefinition() {
        const name = this.expectIdentifier();
        const typeToken = this.peek();
        if (!typeToken || typeToken.type !== 'WORD') {
            throw new Error(`Expected column type for "${name}"`);
        }
        const rawType = this.consume().value.toUpperCase();
        if (!VALID_DATA_TYPES.has(rawType)) {
            throw new Error(`Unsupported column type "${rawType}" on column "${name}"`);
        }
        const definition = {
            name,
            type: rawType
        };
        while (this.peek() && this.peek().type === 'WORD') {
            const constraint = this.peek().value.toUpperCase();
            if (constraint === 'PRIMARY') {
                this.consume();
                this.expectKeyword('KEY');
                definition.primaryKey = true;
            }
            else if (constraint === 'AUTO_INCREMENT') {
                this.consume();
                definition.autoIncrement = true;
            }
            else if (constraint === 'NOT') {
                this.consume();
                this.expectKeyword('NULL');
                definition.nullable = false;
            }
            else if (constraint === 'NULL') {
                this.consume();
                definition.nullable = true;
            }
            else if (constraint === 'DEFAULT') {
                this.consume();
                definition.defaultValue = this.parseLiteral();
            }
            else {
                throw new Error(`Unknown column constraint "${constraint}" on column "${name}"`);
            }
        }
        return definition;
    }
    parseDrop() {
        this.expectKeyword('DROP');
        if (this.matchKeyword('DATABASE')) {
            const databaseName = this.expectIdentifier();
            this.expectEnd();
            return { type: 'DROP_DATABASE', databaseName };
        }
        if (this.matchKeyword('TABLE')) {
            const tableName = this.expectIdentifier();
            this.expectEnd();
            return { type: 'DROP_TABLE', tableName };
        }
        throw new Error(`Expected DATABASE or TABLE after DROP, found "${this.peek()?.value ?? 'EOF'}"`);
    }
    parseTruncate() {
        this.expectKeyword('TRUNCATE');
        this.expectKeyword('TABLE');
        const tableName = this.expectIdentifier();
        this.expectEnd();
        return { type: 'TRUNCATE_TABLE', tableName };
    }
    parseAlter() {
        this.expectKeyword('ALTER');
        this.expectKeyword('TABLE');
        const tableName = this.expectIdentifier();
        if (this.matchKeyword('ADD')) {
            this.matchKeyword('COLUMN');
            const column = this.parseColumnDefinition();
            this.expectEnd();
            return { type: 'ALTER_TABLE', tableName, action: 'ADD_COLUMN', column };
        }
        if (this.matchKeyword('DROP')) {
            this.matchKeyword('COLUMN');
            const columnName = this.expectIdentifier();
            this.expectEnd();
            return { type: 'ALTER_TABLE', tableName, action: 'DROP_COLUMN', columnName };
        }
        if (this.matchKeyword('RENAME')) {
            this.expectKeyword('COLUMN');
            const columnName = this.expectIdentifier();
            this.expectKeyword('TO');
            const newColumnName = this.expectIdentifier();
            this.expectEnd();
            return {
                type: 'ALTER_TABLE',
                tableName,
                action: 'RENAME_COLUMN',
                columnName,
                newColumnName
            };
        }
        throw new Error(`Expected ADD, DROP, or RENAME after ALTER TABLE, found "${this.peek()?.value ?? 'EOF'}"`);
    }
    parseShow() {
        this.expectKeyword('SHOW');
        if (this.matchKeyword('DATABASES')) {
            this.expectEnd();
            return { type: 'SHOW_DATABASES' };
        }
        if (this.matchKeyword('TABLES')) {
            this.expectEnd();
            return { type: 'SHOW_TABLES' };
        }
        throw new Error(`Expected DATABASES or TABLES after SHOW, found "${this.peek()?.value ?? 'EOF'}"`);
    }
    parseInsert() {
        this.expectKeyword('INSERT');
        this.expectKeyword('INTO');
        const tableName = this.expectIdentifier();
        let columns;
        if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '(') {
            this.consume();
            columns = [];
            while (true) {
                columns.push(this.expectIdentifier());
                if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                    this.consume();
                    continue;
                }
                break;
            }
            this.expectPunctuation(')');
        }
        this.expectKeyword('VALUES');
        this.expectPunctuation('(');
        const values = [];
        while (true) {
            values.push(this.parseLiteral());
            if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                this.consume();
                continue;
            }
            break;
        }
        this.expectPunctuation(')');
        this.expectEnd();
        return {
            type: 'INSERT',
            tableName,
            columns,
            values
        };
    }
    parseSelect() {
        this.expectKeyword('SELECT');
        const distinct = this.matchKeyword('DISTINCT');
        let columns;
        const aliases = {};
        if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '*') {
            this.consume();
            columns = '*';
        }
        else {
            columns = [];
            while (true) {
                let column = this.expectIdentifier();
                if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '.') {
                    this.consume();
                    column = this.expectIdentifier();
                }
                columns.push(column);
                if (this.matchKeyword('AS')) {
                    aliases[column] = this.expectIdentifier();
                }
                else {
                    const next = this.peek();
                    if (next?.type === 'WORD' && !['FROM', 'WHERE', 'ORDER', 'LIMIT', 'OFFSET'].includes(next.value.toUpperCase())) {
                        aliases[column] = this.expectIdentifier();
                    }
                }
                if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                    this.consume();
                    continue;
                }
                break;
            }
        }
        this.expectKeyword('FROM');
        const tableName = this.expectIdentifier();
        let tableAlias;
        if (this.matchKeyword('AS')) {
            tableAlias = this.expectIdentifier();
        }
        else {
            const next = this.peek();
            if (next?.type === 'WORD' && !['WHERE', 'ORDER', 'LIMIT', 'OFFSET'].includes(next.value.toUpperCase())) {
                tableAlias = this.expectIdentifier();
            }
        }
        const statement = {
            type: 'SELECT',
            tableName,
            columns
        };
        if (tableAlias)
            statement.tableAlias = tableAlias;
        if (distinct)
            statement.distinct = true;
        if (Object.keys(aliases).length > 0)
            statement.aliases = aliases;
        if (this.matchKeyword('WHERE')) {
            statement.where = this.parseWhere();
        }
        if (this.matchKeyword('ORDER')) {
            this.expectKeyword('BY');
            statement.orderBy = this.parseOrderBy();
        }
        if (this.matchKeyword('LIMIT')) {
            const limitToken = this.consume();
            if (limitToken.type !== 'NUMBER' || !Number.isInteger(Number(limitToken.value)) || Number(limitToken.value) < 0) {
                throw new Error(`LIMIT requires a non-negative integer, found "${limitToken.value}"`);
            }
            statement.limit = Number(limitToken.value);
        }
        if (this.matchKeyword('OFFSET')) {
            const offsetToken = this.consume();
            if (offsetToken.type !== 'NUMBER' || !Number.isInteger(Number(offsetToken.value)) || Number(offsetToken.value) < 0) {
                throw new Error(`OFFSET requires a non-negative integer, found "${offsetToken.value}"`);
            }
            statement.offset = Number(offsetToken.value);
        }
        this.expectEnd();
        return statement;
    }
    parseUpdate() {
        this.expectKeyword('UPDATE');
        const tableName = this.expectIdentifier();
        this.expectKeyword('SET');
        const assignments = {};
        while (true) {
            const col = this.expectIdentifier();
            const op = this.consume();
            if (op.type !== 'OPERATOR' || op.value !== '=') {
                throw new Error(`Expected "=" in SET clause, found "${op.value}"`);
            }
            assignments[col] = this.parseLiteral();
            if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                this.consume();
                continue;
            }
            break;
        }
        const statement = {
            type: 'UPDATE',
            tableName,
            assignments
        };
        if (this.matchKeyword('WHERE')) {
            statement.where = this.parseWhere();
        }
        this.expectEnd();
        return statement;
    }
    parseDelete() {
        this.expectKeyword('DELETE');
        this.expectKeyword('FROM');
        const tableName = this.expectIdentifier();
        const statement = {
            type: 'DELETE',
            tableName
        };
        if (this.matchKeyword('WHERE')) {
            statement.where = this.parseWhere();
        }
        this.expectEnd();
        return statement;
    }
    parseWhere() {
        const expression = this.parseOrExpression();
        const { conditions, connectors } = this.flattenForCompat(expression);
        return { conditions, connectors, expression };
    }
    parseOrExpression() {
        let left = this.parseAndExpression();
        while (this.matchKeyword('OR')) {
            const right = this.parseAndExpression();
            left = { type: 'OR', left, right };
        }
        return left;
    }
    parseAndExpression() {
        let left = this.parseNotExpression();
        while (this.matchKeyword('AND')) {
            const right = this.parseNotExpression();
            left = { type: 'AND', left, right };
        }
        return left;
    }
    parseNotExpression() {
        if (this.matchKeyword('NOT')) {
            return { type: 'NOT', operand: this.parseNotExpression() };
        }
        return this.parsePrimaryExpression();
    }
    parsePrimaryExpression() {
        const token = this.peek();
        if (token && token.type === 'PUNCTUATION' && token.value === '(') {
            this.consume();
            const inner = this.parseOrExpression();
            this.expectPunctuation(')');
            return { type: 'GROUP', inner };
        }
        return this.parsePredicate();
    }
    parsePredicate() {
        let column = this.expectIdentifier();
        if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '.') {
            this.consume();
            column = this.expectIdentifier();
        }
        const next = this.peek();
        if (!next) {
            throw new Error(`Unexpected end of WHERE clause after column "${column}"`);
        }
        let negate = false;
        if (next.type === 'WORD' && next.value.toUpperCase() === 'NOT') {
            const after = this.peek(1);
            const kw = after?.type === 'WORD' ? after.value.toUpperCase() : '';
            if (kw === 'IN' || kw === 'LIKE' || kw === 'ILIKE' || kw === 'BETWEEN') {
                this.consume();
                negate = true;
            }
        }
        const head = this.peek();
        if (!head) {
            throw new Error(`Unexpected end of WHERE clause after "${column}"`);
        }
        const upper = head.type === 'WORD' ? head.value.toUpperCase() : '';
        if (upper === 'IN') {
            this.consume();
            this.expectPunctuation('(');
            const values = [];
            if (!(this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ')')) {
                while (true) {
                    values.push(this.parseLiteral());
                    if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                        this.consume();
                        continue;
                    }
                    break;
                }
            }
            this.expectPunctuation(')');
            return { type: 'IN', column, values, negate };
        }
        if (upper === 'LIKE' || upper === 'ILIKE') {
            this.consume();
            const pattern = this.parseLiteral();
            if (typeof pattern !== 'string') {
                throw new Error(`LIKE/ILIKE requires a string pattern, found ${typeof pattern}`);
            }
            return {
                type: 'LIKE',
                column,
                pattern,
                caseInsensitive: upper === 'ILIKE',
                negate
            };
        }
        if (upper === 'BETWEEN') {
            this.consume();
            const low = this.parseLiteral();
            this.expectKeyword('AND');
            const high = this.parseLiteral();
            return { type: 'BETWEEN', column, low, high, negate };
        }
        if (upper === 'IS') {
            this.consume();
            const isNeg = this.matchKeyword('NOT');
            this.expectKeyword('NULL');
            return { type: 'IS_NULL', column, negate: isNeg };
        }
        const opToken = this.consume();
        if (opToken.type !== 'OPERATOR' || !COMPARISON_OPERATORS_SET.has(opToken.value)) {
            throw new Error(`Invalid comparison operator "${opToken.value}" in WHERE clause`);
        }
        const value = this.parseLiteral();
        return {
            type: 'BINARY',
            column,
            operator: opToken.value,
            value
        };
    }
    flattenForCompat(expr) {
        const conditions = [];
        const connectors = [];
        const visit = (node) => {
            if (node.type === 'BINARY') {
                conditions.push({
                    column: node.column,
                    operator: node.operator,
                    value: node.value
                });
                return true;
            }
            if (node.type === 'AND' || node.type === 'OR') {
                if (!visit(node.left))
                    return false;
                connectors.push(node.type);
                if (!visit(node.right))
                    return false;
                return true;
            }
            return false;
        };
        if (!visit(expr)) {
            return { conditions: [], connectors: [] };
        }
        return { conditions, connectors };
    }
    parseOrderBy() {
        const clauses = [];
        while (true) {
            let column = this.expectIdentifier();
            if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '.') {
                this.consume();
                column = this.expectIdentifier();
            }
            let direction = 'ASC';
            if (this.matchKeyword('ASC')) {
                direction = 'ASC';
            }
            else if (this.matchKeyword('DESC')) {
                direction = 'DESC';
            }
            clauses.push({ column, direction });
            if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
                this.consume();
                continue;
            }
            break;
        }
        return clauses.length === 1 ? clauses[0] : clauses;
    }
}
exports.SqlParser = SqlParser;
