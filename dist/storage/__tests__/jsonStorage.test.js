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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const jsonStorage_1 = require("../jsonStorage");
(0, node_test_1.describe)('JsonStorage - table lifecycle DDL', () => {
    let baseDir;
    let storage;
    (0, node_test_1.beforeEach)(async () => {
        baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsondb-storage-test-'));
        storage = new jsonStorage_1.JsonStorage(baseDir);
        await storage.createDatabase('testdb');
        await storage.createTable('testdb', 'users', [
            { name: 'id', type: 'INT', autoIncrement: true },
            { name: 'name', type: 'STRING' }
        ]);
        await storage.writeRows('testdb', 'users', [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
        ]);
        const schema = await storage.readSchema('testdb', 'users');
        schema.autoIncrementSequence = 4;
        await storage.writeSchema('testdb', schema);
    });
    (0, node_test_1.afterEach)(async () => {
        await fs.rm(baseDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)('trunca uma tabela, reinicia o auto-incremento e rejeita tabelas ausentes', async () => {
        await storage.truncateTable('testdb', 'users');
        node_assert_1.default.deepStrictEqual(await storage.readRows('testdb', 'users'), []);
        node_assert_1.default.strictEqual((await storage.readSchema('testdb', 'users')).autoIncrementSequence, 0);
        await node_assert_1.default.rejects(storage.truncateTable('testdb', 'missing'), /Table "missing" does not exist/);
    });
    (0, node_test_1.it)('adiciona colunas preenchendo linhas existentes com default, null e auto-incremento', async () => {
        await storage.addColumn('testdb', 'users', {
            name: 'active',
            type: 'BOOLEAN',
            defaultValue: true
        });
        await storage.addColumn('testdb', 'users', {
            name: 'nickname',
            type: 'STRING',
            nullable: true
        });
        await storage.addColumn('testdb', 'users', {
            name: 'sequence',
            type: 'INT',
            autoIncrement: true,
            primaryKey: true
        });
        node_assert_1.default.deepStrictEqual(await storage.readRows('testdb', 'users'), [
            { id: 1, name: 'Alice', active: true, nickname: null, sequence: 5 },
            { id: 2, name: 'Bob', active: true, nickname: null, sequence: 6 }
        ]);
        const schema = await storage.readSchema('testdb', 'users');
        node_assert_1.default.strictEqual(schema.columns.at(-1)?.name, 'sequence');
        node_assert_1.default.strictEqual(schema.autoIncrementSequence, 6);
    });
    (0, node_test_1.it)('rejeita adições inválidas sem alterar schema ou dados', async () => {
        await node_assert_1.default.rejects(storage.addColumn('testdb', 'users', { name: 'required', type: 'STRING' }), /Cannot add NOT NULL column "required"/);
        await node_assert_1.default.rejects(storage.addColumn('testdb', 'users', { name: 'name', type: 'STRING', nullable: true }), /Column "name" already exists/);
        await node_assert_1.default.rejects(storage.addColumn('testdb', 'missing', { name: 'extra', type: 'STRING', nullable: true }), /Table "missing" does not exist/);
        await node_assert_1.default.rejects(storage.addColumn('testdb', 'users', { name: 'invalid-name', type: 'STRING', nullable: true }), /Invalid identifier/);
        await node_assert_1.default.rejects(storage.addColumn('testdb', 'users', {
            name: 'duplicate_key',
            type: 'INT',
            primaryKey: true,
            defaultValue: 1
        }), /Existing rows cannot satisfy primary key constraint/);
        node_assert_1.default.deepStrictEqual(await storage.readRows('testdb', 'users'), [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
        ]);
        node_assert_1.default.deepStrictEqual((await storage.readSchema('testdb', 'users')).columns.map((column) => column.name), ['id', 'name']);
    });
    (0, node_test_1.it)('remove uma coluna dos dados e impede remover a última coluna', async () => {
        await node_assert_1.default.rejects(storage.dropColumn('testdb', 'users', 'missing'), /Column "missing" does not exist/);
        await node_assert_1.default.rejects(storage.dropColumn('testdb', 'missing', 'name'), /Table "missing" does not exist/);
        await storage.dropColumn('testdb', 'users', 'name');
        node_assert_1.default.deepStrictEqual(await storage.readRows('testdb', 'users'), [
            { id: 1 },
            { id: 2 }
        ]);
        node_assert_1.default.deepStrictEqual((await storage.readSchema('testdb', 'users')).columns.map((column) => column.name), ['id']);
        await node_assert_1.default.rejects(storage.dropColumn('testdb', 'users', 'id'), /Cannot drop the last column/);
    });
    (0, node_test_1.it)('renomeia uma coluna no schema e nas linhas e rejeita conflitos', async () => {
        await node_assert_1.default.rejects(storage.renameColumn('testdb', 'users', 'missing', 'username'), /Column "missing" does not exist/);
        await node_assert_1.default.rejects(storage.renameColumn('testdb', 'users', 'name', 'id'), /Column "id" already exists/);
        await node_assert_1.default.rejects(storage.renameColumn('testdb', 'missing', 'name', 'username'), /Table "missing" does not exist/);
        await node_assert_1.default.rejects(storage.renameColumn('testdb', 'users', 'name', 'invalid-name'), /Invalid identifier/);
        await storage.renameColumn('testdb', 'users', 'name', 'username');
        node_assert_1.default.deepStrictEqual(await storage.readRows('testdb', 'users'), [
            { id: 1, username: 'Alice' },
            { id: 2, username: 'Bob' }
        ]);
        node_assert_1.default.deepStrictEqual((await storage.readSchema('testdb', 'users')).columns.map((column) => column.name), ['id', 'username']);
    });
});
