"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlExecutor = void 0;
class SqlExecutor {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async execute(statement) {
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
                throw new Error(`Unsupported statement type: ${statement.type}`);
        }
    }
    async executeInContext(dbName, statement) {
        switch (statement.type) {
            case 'CREATE_TABLE': {
                const schema = await this.storage.createTable(dbName, statement.tableName, statement.columns);
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
                    case 'ADD_COLUMN':
                        await this.storage.addColumn(dbName, statement.tableName, statement.column);
                        return {
                            message: `Column "${statement.column.name}" added to table "${statement.tableName}" successfully.`
                        };
                    case 'DROP_COLUMN':
                        await this.storage.dropColumn(dbName, statement.tableName, statement.columnName);
                        return {
                            message: `Column "${statement.columnName}" dropped from table "${statement.tableName}" successfully.`
                        };
                    case 'RENAME_COLUMN':
                        await this.storage.renameColumn(dbName, statement.tableName, statement.columnName, statement.newColumnName);
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
                const newRow = {};
                const providedCols = statement.columns ?? schema.columns.map((c) => c.name);
                if (providedCols.length !== statement.values.length) {
                    throw new Error(`Column count (${providedCols.length}) does not match value count (${statement.values.length})`);
                }
                let newAutoIncSeq = schema.autoIncrementSequence;
                for (const col of schema.columns) {
                    const indexInProvided = providedCols.indexOf(col.name);
                    if (col.autoIncrement) {
                        newAutoIncSeq++;
                        newRow[col.name] = newAutoIncSeq;
                    }
                    else if (indexInProvided !== -1) {
                        const val = statement.values[indexInProvided];
                        this.validateColumnType(col.name, col.type, val);
                        newRow[col.name] = val;
                    }
                    else if (col.defaultValue !== undefined) {
                        newRow[col.name] = col.defaultValue;
                    }
                    else if (col.nullable) {
                        newRow[col.name] = null;
                    }
                    else {
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
                if (statement.distinct) {
                    const seen = new Set();
                    filtered = filtered.filter((row) => {
                        const keyRow = statement.columns === '*'
                            ? row
                            : this.projectDistinctRow(row, statement.columns, statement.aliases);
                        const key = JSON.stringify(keyRow);
                        if (seen.has(key))
                            return false;
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
                            if (valA === valB)
                                continue;
                            if (valA === null || valA === undefined)
                                return 1;
                            if (valB === null || valB === undefined)
                                return -1;
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
                    const projRow = {};
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
                throw new Error(`Unsupported statement in database context: ${statement.type}`);
        }
    }
    validateColumnType(colName, expectedType, value) {
        if (value === null)
            return;
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
    evaluateWhere(row, where) {
        if (!where)
            return true;
        if (where.expression) {
            return this.evaluateExpression(row, where.expression);
        }
        if (where.conditions.length === 0)
            return true;
        let result = this.evaluateCondition(row, where.conditions[0]);
        for (let i = 0; i < where.connectors.length; i++) {
            const next = this.evaluateCondition(row, where.conditions[i + 1]);
            result = where.connectors[i] === 'AND' ? result && next : result || next;
        }
        return result;
    }
    evaluateExpression(row, expr) {
        switch (expr.type) {
            case 'BINARY':
                return this.evaluateBinary(row, expr.column, expr.operator, expr.value);
            case 'AND':
                return (this.evaluateExpression(row, expr.left) &&
                    this.evaluateExpression(row, expr.right));
            case 'OR':
                return (this.evaluateExpression(row, expr.left) ||
                    this.evaluateExpression(row, expr.right));
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
                if (rowVal === null || rowVal === undefined)
                    return false;
                const re = this.sqlLikeToRegex(expr.pattern, expr.caseInsensitive);
                const matched = re.test(String(rowVal));
                return expr.negate ? !matched : matched;
            }
            case 'BETWEEN': {
                const rowVal = this.getRowColumn(row, expr.column);
                if (rowVal === null || rowVal === undefined)
                    return false;
                if (expr.low === null || expr.high === null)
                    return false;
                const inRange = rowVal >= expr.low && rowVal <= expr.high;
                return expr.negate ? !inRange : inRange;
            }
            case 'IS_NULL': {
                const rowVal = this.getRowColumn(row, expr.column);
                const isNull = rowVal === null || rowVal === undefined;
                return expr.negate ? !isNull : isNull;
            }
            default: {
                const _exhaustive = expr;
                void _exhaustive;
                return false;
            }
        }
    }
    evaluateBinary(row, column, operator, targetVal) {
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
    evaluateCondition(row, cond) {
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
    sqlLikeToRegex(pattern, caseInsensitive) {
        let out = '^';
        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];
            if (ch === '\\' && i + 1 < pattern.length) {
                out += this.escapeRegexChar(pattern[i + 1]);
                i++;
            }
            else if (ch === '%') {
                out += '.*';
            }
            else if (ch === '_') {
                out += '.';
            }
            else {
                out += this.escapeRegexChar(ch);
            }
        }
        out += '$';
        return new RegExp(out, caseInsensitive ? 'i' : '');
    }
    escapeRegexChar(ch) {
        return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    }
    getRowColumn(row, column) {
        if (column.includes('.')) {
            const qualifiedColumn = column.split('.', 2)[1];
            return row[qualifiedColumn];
        }
        return row[column];
    }
    projectDistinctRow(row, columns, aliases) {
        const projected = {};
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
exports.SqlExecutor = SqlExecutor;
