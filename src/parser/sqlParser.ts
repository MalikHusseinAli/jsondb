import { CellValue, ColumnDataType, ColumnDefinition, COLUMN_DATA_TYPES } from '../storage/types';
import {
  ComparisonOperator,
  CreateDatabaseStatement,
  CreateTableStatement,
  DeleteStatement,
  DropDatabaseStatement,
  DropTableStatement,
  InsertStatement,
  OrderByClause,
  SelectStatement,
  SqlStatement,
  UpdateStatement,
  WhereClause,
  WhereCondition,
  WhereExpression,
  COMPARISON_OPERATORS
} from './ast';

type TokenType = 'WORD' | 'STRING' | 'NUMBER' | 'OPERATOR' | 'PUNCTUATION';

interface Token {
  type: TokenType;
  value: string;
}

const VALID_DATA_TYPES: ReadonlySet<string> = new Set<string>(COLUMN_DATA_TYPES);
const COMPARISON_OPERATORS_SET: ReadonlySet<string> = new Set<string>(COMPARISON_OPERATORS);

export class SqlParser {
  private tokens: Token[] = [];
  private cursor: number = 0;

  public parse(sql: string): SqlStatement {
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

  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
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
          } else if (input[i] === "'") {
            closed = true;
            i++;
            break;
          } else {
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

      if (char === '(' || char === ')' || char === ',' || char === '*') {
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

  private peek(offset: number = 0): Token | undefined {
    return this.tokens[this.cursor + offset];
  }

  private consume(): Token {
    const token = this.tokens[this.cursor];
    if (!token) {
      throw new Error('Unexpected end of SQL query');
    }
    this.cursor++;
    return token;
  }

  private matchKeyword(keyword: string): boolean {
    const token = this.peek();
    if (token && token.type === 'WORD' && token.value.toUpperCase() === keyword) {
      this.cursor++;
      return true;
    }
    return false;
  }

  private expectKeyword(keyword: string): void {
    if (!this.matchKeyword(keyword)) {
      const found = this.peek()?.value ?? 'EOF';
      throw new Error(`Expected keyword "${keyword}", found "${found}"`);
    }
  }

  private expectPunctuation(symbol: string): void {
    const token = this.peek();
    if (!token || token.type !== 'PUNCTUATION' || token.value !== symbol) {
      throw new Error(`Expected "${symbol}", found "${token?.value ?? 'EOF'}"`);
    }
    this.cursor++;
  }

  private expectIdentifier(): string {
    const token = this.peek();
    if (!token || token.type !== 'WORD') {
      throw new Error(`Expected identifier, found "${token?.value ?? 'EOF'}"`);
    }
    this.cursor++;
    return token.value.toLowerCase();
  }

  private expectEnd(): void {
    if (this.cursor < this.tokens.length) {
      throw new Error(`Unexpected trailing token: "${this.tokens[this.cursor].value}"`);
    }
  }

  private parseLiteral(): CellValue {
    const token = this.consume();

    if (token.type === 'STRING') {
      return token.value;
    }

    if (token.type === 'NUMBER') {
      return Number(token.value);
    }

    if (token.type === 'WORD') {
      const upper = token.value.toUpperCase();
      if (upper === 'TRUE') return true;
      if (upper === 'FALSE') return false;
      if (upper === 'NULL') return null;
    }

    throw new Error(`Expected literal value, found "${token.value}"`);
  }

  private parseCreate(): CreateDatabaseStatement | CreateTableStatement {
    this.expectKeyword('CREATE');

    if (this.matchKeyword('DATABASE')) {
      const databaseName = this.expectIdentifier();
      this.expectEnd();
      return { type: 'CREATE_DATABASE', databaseName };
    }

    if (this.matchKeyword('TABLE')) {
      const tableName = this.expectIdentifier();
      this.expectPunctuation('(');

      const columns: ColumnDefinition[] = [];
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

  private parseColumnDefinition(): ColumnDefinition {
    const name = this.expectIdentifier();
    const typeToken = this.peek();

    if (!typeToken || typeToken.type !== 'WORD') {
      throw new Error(`Expected column type for "${name}"`);
    }

    const rawType = this.consume().value.toUpperCase();
    if (!VALID_DATA_TYPES.has(rawType)) {
      throw new Error(`Unsupported column type "${rawType}" on column "${name}"`);
    }

    const definition: ColumnDefinition = {
      name,
      type: rawType as ColumnDataType
    };

    while (this.peek() && this.peek()!.type === 'WORD') {
      const constraint = this.peek()!.value.toUpperCase();

      if (constraint === 'PRIMARY') {
        this.consume();
        this.expectKeyword('KEY');
        definition.primaryKey = true;
      } else if (constraint === 'AUTO_INCREMENT') {
        this.consume();
        definition.autoIncrement = true;
      } else if (constraint === 'NOT') {
        this.consume();
        this.expectKeyword('NULL');
        definition.nullable = false;
      } else if (constraint === 'NULL') {
        this.consume();
        definition.nullable = true;
      } else if (constraint === 'DEFAULT') {
        this.consume();
        definition.defaultValue = this.parseLiteral();
      } else {
        throw new Error(`Unknown column constraint "${constraint}" on column "${name}"`);
      }
    }

    return definition;
  }

  private parseDrop(): DropDatabaseStatement | DropTableStatement {
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

  private parseShow(): SqlStatement {
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

  private parseInsert(): InsertStatement {
    this.expectKeyword('INSERT');
    this.expectKeyword('INTO');
    const tableName = this.expectIdentifier();

    let columns: string[] | undefined;
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

    const values: CellValue[] = [];
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

  private parseSelect(): SelectStatement {
    this.expectKeyword('SELECT');

    let columns: string[] | '*';
    if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === '*') {
      this.consume();
      columns = '*';
    } else {
      columns = [];
      while (true) {
        columns.push(this.expectIdentifier());
        if (this.peek()?.type === 'PUNCTUATION' && this.peek()?.value === ',') {
          this.consume();
          continue;
        }
        break;
      }
    }

    this.expectKeyword('FROM');
    const tableName = this.expectIdentifier();

    const statement: SelectStatement = {
      type: 'SELECT',
      tableName,
      columns
    };

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

    this.expectEnd();
    return statement;
  }

  private parseUpdate(): UpdateStatement {
    this.expectKeyword('UPDATE');
    const tableName = this.expectIdentifier();
    this.expectKeyword('SET');

    const assignments: Record<string, CellValue> = {};
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

    const statement: UpdateStatement = {
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

  private parseDelete(): DeleteStatement {
    this.expectKeyword('DELETE');
    this.expectKeyword('FROM');
    const tableName = this.expectIdentifier();

    const statement: DeleteStatement = {
      type: 'DELETE',
      tableName
    };

    if (this.matchKeyword('WHERE')) {
      statement.where = this.parseWhere();
    }

    this.expectEnd();
    return statement;
  }

  private parseWhere(): WhereClause {
    const expression = this.parseOrExpression();
    const { conditions, connectors } = this.flattenForCompat(expression);
    return { conditions, connectors, expression };
  }

  private parseOrExpression(): WhereExpression {
    let left = this.parseAndExpression();
    while (this.matchKeyword('OR')) {
      const right = this.parseAndExpression();
      left = { type: 'OR', left, right };
    }
    return left;
  }

  private parseAndExpression(): WhereExpression {
    let left = this.parseNotExpression();
    while (this.matchKeyword('AND')) {
      const right = this.parseNotExpression();
      left = { type: 'AND', left, right };
    }
    return left;
  }

  private parseNotExpression(): WhereExpression {
    if (this.matchKeyword('NOT')) {
      return { type: 'NOT', operand: this.parseNotExpression() };
    }
    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): WhereExpression {
    const token = this.peek();
    if (token && token.type === 'PUNCTUATION' && token.value === '(') {
      this.consume();
      const inner = this.parseOrExpression();
      this.expectPunctuation(')');
      return { type: 'GROUP', inner };
    }
    return this.parsePredicate();
  }

  private parsePredicate(): WhereExpression {
    const column = this.expectIdentifier();
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
      const values: CellValue[] = [];
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
      operator: opToken.value as ComparisonOperator,
      value
    };
  }

  private flattenForCompat(expr: WhereExpression): {
    conditions: WhereCondition[];
    connectors: ('AND' | 'OR')[];
  } {
    const conditions: WhereCondition[] = [];
    const connectors: ('AND' | 'OR')[] = [];

    const visit = (node: WhereExpression): boolean => {
      if (node.type === 'BINARY') {
        conditions.push({
          column: node.column,
          operator: node.operator,
          value: node.value
        });
        return true;
      }
      if (node.type === 'AND' || node.type === 'OR') {
        if (!visit(node.left)) return false;
        connectors.push(node.type);
        if (!visit(node.right)) return false;
        return true;
      }
      return false;
    };

    if (!visit(expr)) {
      return { conditions: [], connectors: [] };
    }
    return { conditions, connectors };
  }

  private parseOrderBy(): OrderByClause {
    const column = this.expectIdentifier();
    let direction: 'ASC' | 'DESC' = 'ASC';

    if (this.matchKeyword('ASC')) {
      direction = 'ASC';
    } else if (this.matchKeyword('DESC')) {
      direction = 'DESC';
    }

    return { column, direction };
  }
}