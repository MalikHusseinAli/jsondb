import { JsonStorage } from '../storage/jsonStorage';
import {
  CellValue,
  ColumnDefinition,
  TableSchema,
  validateColumnValue
} from '../storage/types';
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

      case 'TRUNCATE_TABLE':
        throw new Error('USE <database> first or specify database context for table operations.');

      case 'ALTER_TABLE':
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
          statement.columns,
          statement.constraints
        );
        return { message: `Table "${statement.tableName}" created successfully.`, schema };
      }

      case 'DROP_TABLE':
        await this.storage.dropTable(dbName, statement.tableName);
        return { message: `Table "${statement.tableName}" dropped successfully.` };

      case 'TRUNCATE_TABLE':
        await this.storage.truncateTable(dbName, statement.tableName);
        return { message: `Table "${statement.tableName}" truncated successfully.` };

      case 'ALTER_TABLE':
        switch (statement.action) {
          case 'ADD_COLUMN': {
            if (!(await this.storage.tableExists(dbName, statement.tableName))) {
              throw new Error(`Table "${statement.tableName}" does not exist in database "${dbName}"`);
            }
            const schema = await this.storage.readSchema(dbName, statement.tableName);
            const rows = await this.storage.readRows(dbName, statement.tableName);
            const column = statement.column;
            if (schema.columns.some((existing) => existing.name === column.name)) {
              throw new Error(`Column "${column.name}" already exists in table "${statement.tableName}"`);
            }

            let sequence = schema.autoIncrementSequence;
            const candidateRows = rows.map((row) => {
              let value: CellValue;
              if (column.autoIncrement) {
                sequence++;
                value = sequence;
              } else if (column.defaultValue !== undefined) {
                value = column.defaultValue;
              } else if (column.nullable) {
                value = null;
              } else {
                throw new Error(
                  `Cannot add NOT NULL column "${column.name}" without a default value to a non-empty table`
                );
              }
              return { ...row, [column.name]: value };
            });
            if (column.defaultValue !== undefined) {
              validateColumnValue(column, column.defaultValue, 'default');
            }
            this.validateTableRows(
              { ...schema, columns: [...schema.columns, column] },
              candidateRows
            );
            await this.storage.addColumn(dbName, statement.tableName, column);
            return {
              message: `Column "${column.name}" added to table "${statement.tableName}" successfully.`
            };
          }
          case 'DROP_COLUMN':
            await this.storage.dropColumn(dbName, statement.tableName, statement.columnName);
            return {
              message: `Column "${statement.columnName}" dropped from table "${statement.tableName}" successfully.`
            };
          case 'RENAME_COLUMN':
            await this.storage.renameColumn(
              dbName,
              statement.tableName,
              statement.columnName,
              statement.newColumnName
            );
            return {
              message: `Column "${statement.columnName}" renamed to "${statement.newColumnName}" successfully.`
            };
        }

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
        if (new Set(providedCols).size !== providedCols.length) {
          throw new Error('INSERT cannot specify a column more than once');
        }
        for (const providedCol of providedCols) {
          if (!schema.columns.some((column) => column.name === providedCol)) {
            throw new Error(`Column "${providedCol}" does not exist in table "${statement.tableName}"`);
          }
        }

        let newAutoIncSeq = schema.autoIncrementSequence;

        for (const col of schema.columns) {
          const indexInProvided = providedCols.indexOf(col.name);

          if (col.autoIncrement) {
            newAutoIncSeq++;
            newRow[col.name] = newAutoIncSeq;
          } else if (indexInProvided !== -1) {
            const val = statement.values[indexInProvided];
            validateColumnValue(col, val);
            newRow[col.name] = val;
          } else if (col.defaultValue !== undefined) {
            validateColumnValue(col, col.defaultValue, 'default');
            newRow[col.name] = col.defaultValue;
          } else if (col.nullable) {
            newRow[col.name] = null;
          } else {
            throw new Error(`Field "${col.name}" doesn't have a default value and cannot be null`);
          }
        }

        const candidateRows = [...rows, newRow];
        this.validateTableRows(schema, candidateRows);

        if (newAutoIncSeq !== schema.autoIncrementSequence) {
          schema.autoIncrementSequence = newAutoIncSeq;
          await this.storage.writeSchema(dbName, schema);
        }

        await this.storage.writeRows(dbName, statement.tableName, candidateRows);
        return { message: '1 row inserted successfully.', insertedRow: newRow };
      }

      case 'SELECT': {
        const rows = await this.storage.readRows(dbName, statement.tableName);
        const schema = await this.storage.readSchema(dbName, statement.tableName);

        let filtered = rows.filter((row) => this.evaluateWhere(row, statement.where));

        if (statement.distinct) {
          const seen = new Set<string>();
          filtered = filtered.filter((row) => {
            const keyRow: Record<string, CellValue> =
              statement.columns === '*'
                ? row
                : this.projectDistinctRow(row, statement.columns, statement.aliases);
            const key = JSON.stringify(keyRow);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        if (statement.orderBy) {
          const orderClauses = Array.isArray(statement.orderBy)
            ? statement.orderBy
            : [statement.orderBy];
          filtered.sort((a, b) => {
            for (const { column, direction } of orderClauses) {
              const sourceColumn = statement.aliases
                ? Object.entries(statement.aliases).find(([, alias]) => alias === column)?.[0] ?? column
                : column;
              const valA = this.getRowColumn(a, sourceColumn);
              const valB = this.getRowColumn(b, sourceColumn);
              if (valA === valB) continue;
              if (valA === null || valA === undefined) return 1;
              if (valB === null || valB === undefined) return -1;
              const comp = valA < valB ? -1 : 1;
              return direction === 'ASC' ? comp : -comp;
            }
            return 0;
          });
        }

        const offset = statement.offset ?? 0;
        if (offset > 0) {
          filtered = filtered.slice(offset);
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
            const value = this.getRowColumn(row, col);
            if (value === undefined) {
              throw new Error(`Column "${col}" does not exist in table "${statement.tableName}"`);
            }
            projRow[statement.aliases?.[col] ?? col] = value;
          }
          return projRow;
        });

        return { rows: projected, count: projected.length };
      }

      case 'UPDATE': {
        const rows = await this.storage.readRows(dbName, statement.tableName);
        const schema = await this.storage.readSchema(dbName, statement.tableName);

        let updatedCount = 0;
        const candidateRows = rows.map((row) => ({ ...row }));
        for (const row of candidateRows) {
          if (this.evaluateWhere(row, statement.where)) {
            for (const [colName, val] of Object.entries(statement.assignments)) {
              const colDef = schema.columns.find((c) => c.name === colName);
              if (!colDef) {
                throw new Error(`Column "${colName}" not found in table "${statement.tableName}"`);
              }
              validateColumnValue(colDef, val);
              row[colName] = val;
            }
            updatedCount++;
          }
        }

        this.validateTableRows(schema, candidateRows);
        await this.storage.writeRows(dbName, statement.tableName, candidateRows);
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

  private validateTableRows(schema: TableSchema, rows: Record<string, CellValue>[]): void {
    for (const row of rows) {
      for (const column of schema.columns) {
        const value = row[column.name];
        if (value === undefined) {
          if (column.nullable !== true || column.primaryKey) {
            throw new Error(`Column "${column.name}" cannot be null`);
          }
        } else {
          validateColumnValue(column, value);
        }

        if (column.primaryKey && (value === null || value === undefined)) {
          throw new Error(`Column "${column.name}" cannot be null`);
        }
        if (column.check && this.evaluateCheckExpression(row, column.check) === false) {
          throw new Error(`CHECK constraint failed for column "${column.name}"`);
        }
      }
      for (const constraint of schema.constraints ?? []) {
        if (
          constraint.type === 'CHECK' &&
          this.evaluateCheckExpression(row, constraint.expression) === false
        ) {
          throw new Error('CHECK constraint failed');
        }
      }
    }

    const uniqueKeys = [
      ...schema.columns
        .filter((column) => column.unique || column.primaryKey)
        .map((column) => ({
          columns: [column.name],
          primaryKey: column.primaryKey === true
        })),
      ...(schema.constraints ?? [])
        .filter((constraint) => constraint.type === 'UNIQUE')
        .map((constraint) => ({ columns: constraint.columns, primaryKey: false }))
    ];

    for (const key of uniqueKeys) {
      for (let i = 0; i < rows.length; i++) {
        const values = key.columns.map((column) => rows[i][column]);
        if (key.primaryKey && values.some((value) => value === null || value === undefined)) {
          throw new Error(`Primary key constraint failed for column "${key.columns.join(', ')}"`);
        }
        if (!key.primaryKey && values.some((value) => value === null || value === undefined)) {
          continue;
        }
        const duplicate = rows.slice(0, i).some((previous) =>
          key.columns.every((column, index) => previous[column] === values[index])
        );
        if (duplicate) {
          throw new Error(
            `${key.primaryKey ? 'Primary key' : 'UNIQUE'} constraint failed for column(s) "${key.columns.join(', ')}"`
          );
        }
      }
    }
  }

  private evaluateCheckExpression(
    row: Record<string, CellValue>,
    expr: WhereExpression
  ): boolean | null {
    switch (expr.type) {
      case 'BINARY': {
        const rowValue = this.getRowColumn(row, expr.column);
        if (rowValue == null || expr.value === null) return null;
        return this.evaluateBinary(row, expr.column, expr.operator, expr.value);
      }
      case 'AND': {
        const left = this.evaluateCheckExpression(row, expr.left);
        const right = this.evaluateCheckExpression(row, expr.right);
        if (left === false || right === false) return false;
        return left === null || right === null ? null : true;
      }
      case 'OR': {
        const left = this.evaluateCheckExpression(row, expr.left);
        const right = this.evaluateCheckExpression(row, expr.right);
        if (left === true || right === true) return true;
        return left === null || right === null ? null : false;
      }
      case 'NOT': {
        const value = this.evaluateCheckExpression(row, expr.operand);
        return value === null ? null : !value;
      }
      case 'GROUP':
        return this.evaluateCheckExpression(row, expr.inner);
      case 'IN': {
        const rowValue = this.getRowColumn(row, expr.column);
        if (rowValue == null) return null;
        const found = expr.values.some((value) => value === rowValue);
        const hasNull = expr.values.some((value) => value === null);
        if (!found && hasNull) return null;
        return expr.negate ? !found : found;
      }
      case 'LIKE': {
        const rowValue = this.getRowColumn(row, expr.column);
        if (rowValue == null) return null;
        const matched = this.sqlLikeToRegex(expr.pattern, expr.caseInsensitive).test(String(rowValue));
        return expr.negate ? !matched : matched;
      }
      case 'BETWEEN': {
        const rowValue = this.getRowColumn(row, expr.column);
        if (rowValue == null || expr.low === null || expr.high === null) return null;
        const inRange = rowValue >= expr.low && rowValue <= expr.high;
        return expr.negate ? !inRange : inRange;
      }
      case 'IS_NULL': {
        const value = this.getRowColumn(row, expr.column);
        const isNull = value === null || value === undefined;
        return expr.negate ? !isNull : isNull;
      }
      default: {
        const exhaustive: never = expr;
        return exhaustive;
      }
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
        const rowVal = this.getRowColumn(row, expr.column);
        const found = expr.values.some((v) => v === rowVal);
        return expr.negate ? !found : found;
      }

      case 'LIKE': {
        const rowVal = this.getRowColumn(row, expr.column);
        if (rowVal === null || rowVal === undefined) return false;
        const re = this.sqlLikeToRegex(expr.pattern, expr.caseInsensitive);
        const matched = re.test(String(rowVal));
        return expr.negate ? !matched : matched;
      }

      case 'BETWEEN': {
        const rowVal = this.getRowColumn(row, expr.column);
        if (rowVal === null || rowVal === undefined) return false;
        if (expr.low === null || expr.high === null) return false;
        const inRange = rowVal >= expr.low && rowVal <= expr.high;
        return expr.negate ? !inRange : inRange;
      }

      case 'IS_NULL': {
        const rowVal = this.getRowColumn(row, expr.column);
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
    const rowVal = this.getRowColumn(row, column);
    switch (operator) {
      case '=':
        return rowVal === targetVal;
      case '!=':
        return rowVal !== targetVal;
      case '>':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal > targetVal;
      case '<':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal < targetVal;
      case '>=':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal >= targetVal;
      case '<=':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal <= targetVal;
      default:
        return false;
    }
  }

  private evaluateCondition(
    row: Record<string, CellValue>,
    cond: { column: string; operator: string; value: CellValue }
  ): boolean {
    const rowVal = this.getRowColumn(row, cond.column);
    const targetVal = cond.value;

    switch (cond.operator) {
      case '=':
        return rowVal === targetVal;
      case '!=':
        return rowVal !== targetVal;
      case '>':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal > targetVal;
      case '<':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal < targetVal;
      case '>=':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal >= targetVal;
      case '<=':
        return rowVal !== null && rowVal !== undefined && targetVal !== null && rowVal <= targetVal;
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

  private getRowColumn(
    row: Record<string, CellValue>,
    column: string
  ): CellValue | undefined {
    if (column.includes('.')) {
      const qualifiedColumn = column.split('.', 2)[1];
      return row[qualifiedColumn];
    }
    return row[column];
  }

  private projectDistinctRow(
    row: Record<string, CellValue>,
    columns: string[],
    aliases?: Record<string, string>
  ): Record<string, CellValue> {
    const projected: Record<string, CellValue> = {};
    for (const column of columns) {
      const value = this.getRowColumn(row, column);
      if (value === undefined) {
        throw new Error(`Column "${column}" does not exist`);
      }
      projected[aliases?.[column] ?? column] = value;
    }
    return projected;
  }
}