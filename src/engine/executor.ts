import { JsonStorage } from '../storage/jsonStorage';
import { CellValue, TableSchema } from '../storage/types';
import {
  SqlStatement,
  WhereClause,
  WhereExpression,
  ComparisonOperator
} from '../parser/ast';

export class SqlExecutor {
  constructor(private storage: JsonStorage) {}

  public async execute(statement: SqlStatement): Promise<unknown> {
    switch (statement.type) {
      case 'CREATE_DATABASE':
        await this.storage.createDatabase(statement.databaseName);
        return { message: `Database "${statement.databaseName}" created successfully.` };

      case 'DROP_DATABASE':
        await this.storage.dropDatabase(statement.databaseName);
        return { message: `Database "${statement.databaseName}" dropped successfully.` };

      case 'SHOW_DATABASES': {
        const databases = await this.storage.listDatabases();
        return { databases };
      }

      case 'CREATE_TABLE':
        throw new Error('USE <database> first or specify database context for table operations.');

      case 'DROP_TABLE':
        throw new Error('USE <database> first or specify database context for table operations.');

      case 'SHOW_TABLES':
        throw new Error('USE <database> first or specify database context for table operations.');

      default:
        throw new Error(`Unsupported statement type: ${(statement as SqlStatement).type}`);
    }
  }

  public async executeInContext(dbName: string, statement: SqlStatement): Promise<unknown> {
    switch (statement.type) {
      case 'CREATE_TABLE': {
        const schema = await this.storage.createTable(
          dbName,
          statement.tableName,
          statement.columns
        );
        return { message: `Table "${statement.tableName}" created successfully.`, schema };
      }

      case 'DROP_TABLE':
        await this.storage.dropTable(dbName, statement.tableName);
        return { message: `Table "${statement.tableName}" dropped successfully.` };

      case 'SHOW_TABLES': {
        const tables = await this.storage.listTables(dbName);
        return { tables };
      }

      case 'INSERT': {
        const schema = await this.storage.readSchema(dbName, statement.tableName);
        const rows = await this.storage.readRows(dbName, statement.tableName);

        const newRow: Record<string, CellValue> = {};
        const providedCols = statement.columns ?? schema.columns.map((c) => c.name);

        if (providedCols.length !== statement.values.length) {
          throw new Error(
            `Column count (${providedCols.length}) does not match value count (${statement.values.length})`
          );
        }

        let newAutoIncSeq = schema.autoIncrementSequence;

        for (const col of schema.columns) {
          const indexInProvided = providedCols.indexOf(col.name);

          if (col.autoIncrement) {
            newAutoIncSeq++;
            newRow[col.name] = newAutoIncSeq;
          } else if (indexInProvided !== -1) {
            const val = statement.values[indexInProvided];
            this.validateColumnType(col.name, col.type, val);
            newRow[col.name] = val;
          } else if (col.defaultValue !== undefined) {
            newRow[col.name] = col.defaultValue;
          } else if (col.nullable) {
            newRow[col.name] = null;
          } else {
            throw new Error(`Field "${col.name}" doesn't have a default value and cannot be null`);
          }
        }

        const pkCols = schema.columns.filter((c) => c.primaryKey).map((c) => c.name);
        for (const pk of pkCols) {
          const exists = rows.some((r) => r[pk] === newRow[pk]);
          if (exists) {
            throw new Error(`Duplicate entry for primary key "${pk}" = "${newRow[pk]}"`);
          }
        }

        rows.push(newRow);

        if (newAutoIncSeq !== schema.autoIncrementSequence) {
          schema.autoIncrementSequence = newAutoIncSeq;
          await this.storage.writeSchema(dbName, schema);
        }

        await this.storage.writeRows(dbName, statement.tableName, rows);
        return { message: '1 row inserted successfully.', insertedRow: newRow };
      }

      case 'SELECT': {
        const rows = await this.storage.readRows(dbName, statement.tableName);
        const schema = await this.storage.readSchema(dbName, statement.tableName);

        let filtered = rows.filter((row) => this.evaluateWhere(row, statement.where));

        if (statement.orderBy) {
          const { column, direction } = statement.orderBy;
          filtered.sort((a, b) => {
            const valA = a[column];
            const valB = b[column];
            if (valA === valB) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;
            const comp = valA < valB ? -1 : 1;
            return direction === 'ASC' ? comp : -comp;
          });
        }

        if (statement.limit !== undefined) {
          filtered = filtered.slice(0, statement.limit);
        }

        const projected = filtered.map((row) => {
          if (statement.columns === '*') {
            return row;
          }
          const projRow: Record<string, CellValue> = {};
          for (const col of statement.columns) {
            if (!(col in row)) {
              throw new Error(`Column "${col}" does not exist in table "${statement.tableName}"`);
            }
            projRow[col] = row[col];
          }
          return projRow;
        });

        return { rows: projected, count: projected.length };
      }

      case 'UPDATE': {
        const rows = await this.storage.readRows(dbName, statement.tableName);
        const schema = await this.storage.readSchema(dbName, statement.tableName);

        let updatedCount = 0;
        for (const row of rows) {
          if (this.evaluateWhere(row, statement.where)) {
            for (const [colName, val] of Object.entries(statement.assignments)) {
              const colDef = schema.columns.find((c) => c.name === colName);
              if (!colDef) {
                throw new Error(`Column "${colName}" not found in table "${statement.tableName}"`);
              }
              this.validateColumnType(colName, colDef.type, val);
              row[colName] = val;
            }
            updatedCount++;
          }
        }

        await this.storage.writeRows(dbName, statement.tableName, rows);
        return { message: `${updatedCount} row(s) updated successfully.` };
      }

      case 'DELETE': {
        const rows = await this.storage.readRows(dbName, statement.tableName);
        const initialLen = rows.length;

        const remaining = rows.filter((row) => !this.evaluateWhere(row, statement.where));
        const deletedCount = initialLen - remaining.length;

        await this.storage.writeRows(dbName, statement.tableName, remaining);
        return { message: `${deletedCount} row(s) deleted successfully.` };
      }

      default:
        throw new Error(`Unsupported statement in database context: ${(statement as SqlStatement).type}`);
    }
  }

  private validateColumnType(colName: string, expectedType: string, value: CellValue): void {
    if (value === null) return;

    const actualTypeOf = typeof value;
    let isValid = false;

    switch (expectedType) {
      case 'INT':
        isValid = Number.isInteger(value);
        break;
      case 'FLOAT':
        isValid = actualTypeOf === 'number';
        break;
      case 'STRING':
      case 'DATE':
        isValid = actualTypeOf === 'string';
        break;
      case 'BOOLEAN':
        isValid = actualTypeOf === 'boolean';
        break;
    }

    if (!isValid) {
      throw new Error(`Type mismatch on column "${colName}": expected ${expectedType}, got ${actualTypeOf}`);
    }
  }

  private evaluateWhere(row: Record<string, CellValue>, where?: WhereClause): boolean {
    if (!where) return true;

    if (where.expression) {
      return this.evaluateExpression(row, where.expression);
    }

    if (where.conditions.length === 0) return true;

    let result = this.evaluateCondition(row, where.conditions[0]);
    for (let i = 0; i < where.connectors.length; i++) {
      const next = this.evaluateCondition(row, where.conditions[i + 1]);
      result = where.connectors[i] === 'AND' ? result && next : result || next;
    }
    return result;
  }

  private evaluateExpression(
    row: Record<string, CellValue>,
    expr: WhereExpression
  ): boolean {
    switch (expr.type) {
      case 'BINARY':
        return this.evaluateBinary(row, expr.column, expr.operator, expr.value);

      case 'AND':
        return (
          this.evaluateExpression(row, expr.left) &&
          this.evaluateExpression(row, expr.right)
        );

      case 'OR':
        return (
          this.evaluateExpression(row, expr.left) ||
          this.evaluateExpression(row, expr.right)
        );

      case 'NOT':
        return !this.evaluateExpression(row, expr.operand);

      case 'GROUP':
        return this.evaluateExpression(row, expr.inner);

      case 'IN': {
        const rowVal = row[expr.column];
        const found = expr.values.some((v) => v === rowVal);
        return expr.negate ? !found : found;
      }

      case 'LIKE': {
        const rowVal = row[expr.column];
        if (rowVal === null || rowVal === undefined) return false;
        const re = this.sqlLikeToRegex(expr.pattern, expr.caseInsensitive);
        const matched = re.test(String(rowVal));
        return expr.negate ? !matched : matched;
      }

      case 'BETWEEN': {
        const rowVal = row[expr.column];
        if (rowVal === null || rowVal === undefined) return false;
        if (expr.low === null || expr.high === null) return false;
        const inRange = rowVal >= expr.low && rowVal <= expr.high;
        return expr.negate ? !inRange : inRange;
      }

      case 'IS_NULL': {
        const rowVal = row[expr.column];
        const isNull = rowVal === null || rowVal === undefined;
        return expr.negate ? !isNull : isNull;
      }

      default: {
        const _exhaustive: never = expr;
        void _exhaustive;
        return false;
      }
    }
  }

  private evaluateBinary(
    row: Record<string, CellValue>,
    column: string,
    operator: ComparisonOperator,
    targetVal: CellValue
  ): boolean {
    const rowVal = row[column];
    switch (operator) {
      case '=':
        return rowVal === targetVal;
      case '!=':
        return rowVal !== targetVal;
      case '>':
        return rowVal !== null && targetVal !== null && rowVal > targetVal;
      case '<':
        return rowVal !== null && targetVal !== null && rowVal < targetVal;
      case '>=':
        return rowVal !== null && targetVal !== null && rowVal >= targetVal;
      case '<=':
        return rowVal !== null && targetVal !== null && rowVal <= targetVal;
      default:
        return false;
    }
  }

  private evaluateCondition(
    row: Record<string, CellValue>,
    cond: { column: string; operator: string; value: CellValue }
  ): boolean {
    const rowVal = row[cond.column];
    const targetVal = cond.value;

    switch (cond.operator) {
      case '=':
        return rowVal === targetVal;
      case '!=':
        return rowVal !== targetVal;
      case '>':
        return rowVal !== null && targetVal !== null && rowVal > targetVal;
      case '<':
        return rowVal !== null && targetVal !== null && rowVal < targetVal;
      case '>=':
        return rowVal !== null && targetVal !== null && rowVal >= targetVal;
      case '<=':
        return rowVal !== null && targetVal !== null && rowVal <= targetVal;
      default:
        return false;
    }
  }

  private sqlLikeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
    let out = '^';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '\\' && i + 1 < pattern.length) {
        out += this.escapeRegexChar(pattern[i + 1]);
        i++;
      } else if (ch === '%') {
        out += '.*';
      } else if (ch === '_') {
        out += '.';
      } else {
        out += this.escapeRegexChar(ch);
      }
    }
    out += '$';
    return new RegExp(out, caseInsensitive ? 'i' : '');
  }

  private escapeRegexChar(ch: string): string {
    return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }
}