"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseEngine = void 0;
const fifoQueue_1 = require("../queue/fifoQueue");
const jsonStorage_1 = require("../storage/jsonStorage");
const sqlParser_1 = require("../parser/sqlParser");
const executor_1 = require("./executor");
class DatabaseEngine {
    queue;
    storage;
    parser;
    executor;
    currentDatabase = null;
    constructor(baseDir) {
        this.queue = new fifoQueue_1.FifoQueue();
        this.storage = new jsonStorage_1.JsonStorage(baseDir);
        this.parser = new sqlParser_1.SqlParser();
        this.executor = new executor_1.SqlExecutor(this.storage);
    }
    async query(sql, metadata = {}) {
        return this.queue.enqueue(async () => {
            const trimmed = sql.trim();
            const upper = trimmed.toUpperCase();
            // Handle USE <database> locally in engine session
            if (upper.startsWith('USE ')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length < 2) {
                    throw new Error('Invalid USE statement syntax. Use: USE <database_name>');
                }
                const dbName = parts[1].replace(/;$/, '').toLowerCase();
                if (!(await this.storage.databaseExists(dbName))) {
                    throw new Error(`Database "${dbName}" does not exist`);
                }
                this.currentDatabase = dbName;
                return { message: `Database changed to "${dbName}"` };
            }
            const statement = this.parser.parse(sql);
            // Global statements that don't need a current database context
            if (statement.type === 'CREATE_DATABASE' || statement.type === 'DROP_DATABASE' || statement.type === 'SHOW_DATABASES') {
                const result = await this.executor.execute(statement);
                if (statement.type === 'DROP_DATABASE' && this.currentDatabase === statement.databaseName) {
                    this.currentDatabase = null;
                }
                return result;
            }
            // Database-scoped statements
            if (!this.currentDatabase) {
                throw new Error('No database selected. Use "USE <database>;" before executing table queries.');
            }
            return await this.executor.executeInContext(this.currentDatabase, statement);
        }, metadata);
    }
    getCurrentDatabase() {
        return this.currentDatabase;
    }
}
exports.DatabaseEngine = DatabaseEngine;
