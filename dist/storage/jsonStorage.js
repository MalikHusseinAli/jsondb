"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStorage = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("./types");
class JsonStorage {
    baseDir;
    constructor(baseDir = path.resolve(process.cwd(), 'jsondb', 'data')) {
        this.baseDir = baseDir;
    }
    sanitizeIdentifier(name) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new Error(`Invalid identifier: "${name}"`);
        }
        return name.toLowerCase();
    }
    getDatabasePath(dbName) {
        const safeDb = this.sanitizeIdentifier(dbName);
        return path.join(this.baseDir, safeDb);
    }
    getSchemaFilePath(dbName, tableName) {
        const dbPath = this.getDatabasePath(dbName);
        const safeTable = this.sanitizeIdentifier(tableName);
        return path.join(dbPath, `${safeTable}.schema.json`);
    }
    getDataFilePath(dbName, tableName) {
        const dbPath = this.getDatabasePath(dbName);
        const safeTable = this.sanitizeIdentifier(tableName);
        return path.join(dbPath, `${safeTable}.data.json`);
    }
    async writeJsonAtomic(filePath, payload) {
        const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        const serialized = JSON.stringify(payload, null, 2);
        await fs.writeFile(tempPath, serialized, 'utf-8');
        await fs.rename(tempPath, filePath);
    }
    async exists(targetPath) {
        try {
            await fs.access(targetPath);
            return true;
        }
        catch {
            return false;
        }
    }
    validateColumnDefinition(column) {
        if (column.defaultValue !== undefined) {
            (0, types_1.validateColumnValue)(column, column.defaultValue, 'default');
        }
    }
    getCheckColumns(expression) {
        switch (expression.type) {
            case 'BINARY':
            case 'IN':
            case 'LIKE':
            case 'BETWEEN':
            case 'IS_NULL':
                return [expression.column];
            case 'AND':
            case 'OR':
                return [
                    ...this.getCheckColumns(expression.left),
                    ...this.getCheckColumns(expression.right)
                ];
            case 'NOT':
                return this.getCheckColumns(expression.operand);
            case 'GROUP':
                return this.getCheckColumns(expression.inner);
        }
    }
    renameCheckColumn(expression, oldName, newName) {
        switch (expression.type) {
            case 'BINARY':
            case 'IN':
            case 'LIKE':
            case 'BETWEEN':
            case 'IS_NULL':
                return {
                    ...expression,
                    column: expression.column === oldName ? newName : expression.column
                };
            case 'AND':
            case 'OR':
                return {
                    ...expression,
                    left: this.renameCheckColumn(expression.left, oldName, newName),
                    right: this.renameCheckColumn(expression.right, oldName, newName)
                };
            case 'NOT':
                return {
                    ...expression,
                    operand: this.renameCheckColumn(expression.operand, oldName, newName)
                };
            case 'GROUP':
                return {
                    ...expression,
                    inner: this.renameCheckColumn(expression.inner, oldName, newName)
                };
        }
    }
    validateConstraints(columns, constraints = []) {
        const columnNames = new Set(columns.map((column) => column.name));
        if (columnNames.size !== columns.length) {
            throw new Error('Duplicate column names are not allowed');
        }
        for (const column of columns) {
            this.validateColumnDefinition(column);
            if (column.primaryKey && column.nullable === true) {
                throw new Error(`Primary key column "${column.name}" cannot be nullable`);
            }
            if (column.check) {
                for (const referencedColumn of this.getCheckColumns(column.check)) {
                    if (!columnNames.has(referencedColumn)) {
                        throw new Error(`CHECK constraint references unknown column "${referencedColumn}"`);
                    }
                }
            }
        }
        for (const constraint of constraints) {
            if (constraint.type === 'UNIQUE') {
                if (constraint.columns.length === 0) {
                    throw new Error('UNIQUE constraint must include at least one column');
                }
                if (new Set(constraint.columns).size !== constraint.columns.length) {
                    throw new Error('UNIQUE constraint cannot contain duplicate columns');
                }
                for (const columnName of constraint.columns) {
                    if (!columnNames.has(columnName)) {
                        throw new Error(`UNIQUE constraint references unknown column "${columnName}"`);
                    }
                }
            }
            else {
                for (const referencedColumn of this.getCheckColumns(constraint.expression)) {
                    if (!columnNames.has(referencedColumn)) {
                        throw new Error(`CHECK constraint references unknown column "${referencedColumn}"`);
                    }
                }
            }
        }
    }
    async init() {
        await fs.mkdir(this.baseDir, { recursive: true });
    }
    async databaseExists(dbName) {
        const dbPath = this.getDatabasePath(dbName);
        return this.exists(dbPath);
    }
    async createDatabase(dbName) {
        await this.init();
        const dbPath = this.getDatabasePath(dbName);
        if (await this.exists(dbPath)) {
            throw new Error(`Database "${dbName}" already exists`);
        }
        await fs.mkdir(dbPath);
    }
    async dropDatabase(dbName) {
        const dbPath = this.getDatabasePath(dbName);
        if (!(await this.exists(dbPath))) {
            throw new Error(`Database "${dbName}" does not exist`);
        }
        await fs.rm(dbPath, { recursive: true, force: true });
    }
    async listDatabases() {
        await this.init();
        const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    }
    async tableExists(dbName, tableName) {
        const schemaPath = this.getSchemaFilePath(dbName, tableName);
        const dataPath = this.getDataFilePath(dbName, tableName);
        const [hasSchema, hasData] = await Promise.all([
            this.exists(schemaPath),
            this.exists(dataPath)
        ]);
        return hasSchema && hasData;
    }
    async createTable(dbName, tableName, columns, constraints = []) {
        if (!(await this.databaseExists(dbName))) {
            throw new Error(`Database "${dbName}" does not exist`);
        }
        if (await this.tableExists(dbName, tableName)) {
            throw new Error(`Table "${tableName}" already exists in database "${dbName}"`);
        }
        if (columns.length === 0) {
            throw new Error(`Table "${tableName}" must have at least one column`);
        }
        this.validateConstraints(columns, constraints);
        const safeTable = this.sanitizeIdentifier(tableName);
        const now = new Date().toISOString();
        const schema = {
            tableName: safeTable,
            createdAt: now,
            updatedAt: now,
            autoIncrementSequence: 0,
            columns,
            ...(constraints.length > 0 ? { constraints } : {})
        };
        const data = {
            tableName: safeTable,
            rows: []
        };
        await Promise.all([
            this.writeJsonAtomic(this.getSchemaFilePath(dbName, safeTable), schema),
            this.writeJsonAtomic(this.getDataFilePath(dbName, safeTable), data)
        ]);
        return schema;
    }
    async dropTable(dbName, tableName) {
        if (!(await this.tableExists(dbName, tableName))) {
            throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
        }
        await Promise.all([
            fs.unlink(this.getSchemaFilePath(dbName, tableName)),
            fs.unlink(this.getDataFilePath(dbName, tableName))
        ]);
    }
    async truncateTable(dbName, tableName) {
        if (!(await this.tableExists(dbName, tableName))) {
            throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
        }
        const schema = await this.readSchema(dbName, tableName);
        schema.autoIncrementSequence = 0;
        await Promise.all([
            this.writeSchema(dbName, schema),
            this.writeRows(dbName, tableName, [])
        ]);
    }
    async addColumn(dbName, tableName, column) {
        if (!(await this.tableExists(dbName, tableName))) {
            throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
        }
        const safeColumnName = this.sanitizeIdentifier(column.name);
        const schema = await this.readSchema(dbName, tableName);
        if (schema.columns.some((existing) => existing.name === safeColumnName)) {
            throw new Error(`Column "${safeColumnName}" already exists in table "${tableName}"`);
        }
        const normalizedColumn = { ...column, name: safeColumnName };
        this.validateConstraints([...schema.columns, normalizedColumn], schema.constraints);
        const rows = await this.readRows(dbName, tableName);
        let sequence = schema.autoIncrementSequence;
        const values = rows.map(() => {
            if (column.autoIncrement) {
                sequence++;
                return sequence;
            }
            if (column.defaultValue !== undefined) {
                (0, types_1.validateColumnValue)(normalizedColumn, column.defaultValue, 'default');
                return column.defaultValue;
            }
            if (column.nullable)
                return null;
            throw new Error(`Cannot add NOT NULL column "${safeColumnName}" without a default value to a non-empty table`);
        });
        values.forEach((value) => (0, types_1.validateColumnValue)(normalizedColumn, value));
        if (column.primaryKey || column.unique) {
            const uniqueValues = new Set(values);
            if (values.some((value) => value === null) && column.primaryKey ||
                column.primaryKey && uniqueValues.size !== values.length) {
                throw new Error(`Existing rows cannot satisfy primary key constraint for column "${safeColumnName}"`);
            }
            if (column.unique && !column.primaryKey) {
                const nonNullValues = values.filter((value) => value !== null);
                if (new Set(nonNullValues).size !== nonNullValues.length) {
                    throw new Error(`Existing rows cannot satisfy unique constraint for column "${safeColumnName}"`);
                }
            }
        }
        rows.forEach((row, index) => {
            row[safeColumnName] = values[index];
        });
        schema.columns.push(normalizedColumn);
        schema.autoIncrementSequence = sequence;
        await Promise.all([
            this.writeSchema(dbName, schema),
            this.writeRows(dbName, tableName, rows)
        ]);
    }
    async dropColumn(dbName, tableName, columnName) {
        if (!(await this.tableExists(dbName, tableName))) {
            throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
        }
        const safeColumnName = this.sanitizeIdentifier(columnName);
        const schema = await this.readSchema(dbName, tableName);
        if (!schema.columns.some((column) => column.name === safeColumnName)) {
            throw new Error(`Column "${safeColumnName}" does not exist in table "${tableName}"`);
        }
        if (schema.columns.length === 1) {
            throw new Error(`Cannot drop the last column from table "${tableName}"`);
        }
        const referencedByTableConstraint = (schema.constraints ?? []).some((constraint) => constraint.type === 'UNIQUE'
            ? constraint.columns.includes(safeColumnName)
            : this.getCheckColumns(constraint.expression).includes(safeColumnName));
        const referencedByColumnCheck = schema.columns.some((column) => column.name !== safeColumnName &&
            column.check &&
            this.getCheckColumns(column.check).includes(safeColumnName));
        if (referencedByTableConstraint || referencedByColumnCheck) {
            throw new Error(`Cannot drop column "${safeColumnName}" referenced by a constraint`);
        }
        const rows = await this.readRows(dbName, tableName);
        for (const row of rows) {
            delete row[safeColumnName];
        }
        schema.columns = schema.columns.filter((column) => column.name !== safeColumnName);
        await Promise.all([
            this.writeSchema(dbName, schema),
            this.writeRows(dbName, tableName, rows)
        ]);
    }
    async renameColumn(dbName, tableName, columnName, newColumnName) {
        if (!(await this.tableExists(dbName, tableName))) {
            throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
        }
        const safeColumnName = this.sanitizeIdentifier(columnName);
        const safeNewColumnName = this.sanitizeIdentifier(newColumnName);
        const schema = await this.readSchema(dbName, tableName);
        if (!schema.columns.some((column) => column.name === safeColumnName)) {
            throw new Error(`Column "${safeColumnName}" does not exist in table "${tableName}"`);
        }
        if (schema.columns.some((column) => column.name === safeNewColumnName)) {
            throw new Error(`Column "${safeNewColumnName}" already exists in table "${tableName}"`);
        }
        const rows = await this.readRows(dbName, tableName);
        for (const row of rows) {
            row[safeNewColumnName] = row[safeColumnName];
            delete row[safeColumnName];
        }
        schema.columns = schema.columns.map((column) => ({
            ...column,
            name: column.name === safeColumnName ? safeNewColumnName : column.name,
            ...(column.check
                ? { check: this.renameCheckColumn(column.check, safeColumnName, safeNewColumnName) }
                : {})
        }));
        schema.constraints = schema.constraints?.map((constraint) => constraint.type === 'UNIQUE'
            ? {
                ...constraint,
                columns: constraint.columns.map((name) => name === safeColumnName ? safeNewColumnName : name)
            }
            : {
                ...constraint,
                expression: this.renameCheckColumn(constraint.expression, safeColumnName, safeNewColumnName)
            });
        await Promise.all([
            this.writeSchema(dbName, schema),
            this.writeRows(dbName, tableName, rows)
        ]);
    }
    async listTables(dbName) {
        if (!(await this.databaseExists(dbName))) {
            throw new Error(`Database "${dbName}" does not exist`);
        }
        const dbPath = this.getDatabasePath(dbName);
        const files = await fs.readdir(dbPath);
        const suffix = '.schema.json';
        return files
            .filter((file) => file.endsWith(suffix))
            .map((file) => file.slice(0, -suffix.length));
    }
    async readSchema(dbName, tableName) {
        const schemaPath = this.getSchemaFilePath(dbName, tableName);
        if (!(await this.exists(schemaPath))) {
            throw new Error(`Schema for table "${tableName}" not found in "${dbName}"`);
        }
        const raw = await fs.readFile(schemaPath, 'utf-8');
        return JSON.parse(raw);
    }
    async writeSchema(dbName, schema) {
        schema.updatedAt = new Date().toISOString();
        const schemaPath = this.getSchemaFilePath(dbName, schema.tableName);
        await this.writeJsonAtomic(schemaPath, schema);
    }
    async readRows(dbName, tableName) {
        const dataPath = this.getDataFilePath(dbName, tableName);
        if (!(await this.exists(dataPath))) {
            throw new Error(`Data file for table "${tableName}" not found in "${dbName}"`);
        }
        const raw = await fs.readFile(dataPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed.rows;
    }
    async writeRows(dbName, tableName, rows) {
        const safeTable = this.sanitizeIdentifier(tableName);
        const dataPath = this.getDataFilePath(dbName, safeTable);
        const payload = {
            tableName: safeTable,
            rows
        };
        await this.writeJsonAtomic(dataPath, payload);
    }
}
exports.JsonStorage = JsonStorage;
