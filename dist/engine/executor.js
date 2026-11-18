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
                // Process columns, auto-increment, and defaults
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
                // Check primary keys uniqueness
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
                // Filter WHERE
                let filtered = rows.filter((row) => this.evaluateWhere(row, statement.where));
                // Order By
                if (statement.orderBy) {
                    const { column, direction } = statement.orderBy;
                    filtered.sort((a, b) => {
                        const valA = a[column];
                        const valB = b[column];
                        if (valA === valB)
                            return 0;
                        if (valA === null)
                            return 1;
                        if (valB === null)
                            return -1;
                        const comp = valA < valB ? -1 : 1;
                        return direction === 'ASC' ? comp : -comp;
                    });
                }
                // Limit
                if (statement.limit !== undefined) {
                    filtered = filtered.slice(0, statement.limit);
                }
                // Project columns
                const projected = filtered.map((row) => {
                    if (statement.columns === '*') {
                        return row;
                    }
                    const projRow = {};
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
                throw new Error(`Unsupported statement in database context: ${statement.type}`);
        }
    }
    validateColumnType(colName, expectedType, value) {
        if (value === null)
            return; // Nullability check handled separately
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
        if (!where || where.conditions.length === 0) {
            return true;
        }
        let result = this.evaluateCondition(row, where.conditions[0]);
        for (let i = 0; i < where.connectors.length; i++) {
            const connector = where.connectors[i];
            const nextCondRes = this.evaluateCondition(row, where.conditions[i + 1]);
            if (connector === 'AND') {
                result = result && nextCondRes;
            }
            else if (connector === 'OR') {
                result = result || nextCondRes;
            }
        }
        return result;
    }
    evaluateCondition(row, cond) {
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
}
exports.SqlExecutor = SqlExecutor;
