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
const path = __importStar(require("path"));
const databaseEngine_1 = require("../databaseEngine");
(0, node_test_1.describe)('DatabaseEngine Integration Tests', () => {
    const testDir = path.resolve(process.cwd(), 'data_test');
    let db;
    (0, node_test_1.beforeEach)(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        db = new databaseEngine_1.DatabaseEngine(testDir);
    });
    (0, node_test_1.afterEach)(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)('deve executar o ciclo de vida completo de DDL e DML', async () => {
        // 1. Criar banco e selecionar
        const createDbRes = await db.query('CREATE DATABASE loja;');
        node_assert_1.default.deepStrictEqual(createDbRes.data, { message: 'Database "loja" created successfully.' });
        const useRes = await db.query('USE loja;');
        node_assert_1.default.deepStrictEqual(useRes.data, { message: 'Database changed to "loja"' });
        // 2. Criar tabela
        const createTableRes = await db.query(`
      CREATE TABLE produtos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        titulo STRING NOT NULL,
        preco FLOAT,
        ativo BOOLEAN DEFAULT true
      );
    `);
        node_assert_1.default.strictEqual(createTableRes.data.message, 'Table "produtos" created successfully.');
        // 3. Inserir registros
        const ins1 = await db.query("INSERT INTO produtos (titulo, preco) VALUES ('Teclado Mecânico', 250.50);");
        node_assert_1.default.strictEqual(ins1.data.insertedRow.id, 1);
        node_assert_1.default.strictEqual(ins1.data.insertedRow.ativo, true);
        await db.query("INSERT INTO produtos (titulo, preco, ativo) VALUES ('Mouse Gamer', 120.00, false);");
        // 4. Consultar com SELECT e WHERE
        const selectRes = (await db.query("SELECT titulo, preco FROM produtos WHERE preco > 150 ORDER BY preco ASC;")).data;
        node_assert_1.default.strictEqual(selectRes.count, 1);
        node_assert_1.default.strictEqual(selectRes.rows[0].titulo, 'Teclado Mecânico');
        // 5. Atualizar registros
        const updateRes = (await db.query("UPDATE produtos SET preco = 230.00 WHERE titulo = 'Teclado Mecânico';")).data;
        node_assert_1.default.strictEqual(updateRes.message, '1 row(s) updated successfully.');
        // 6. Deletar registros
        const deleteRes = (await db.query("DELETE FROM produtos WHERE ativo = false;")).data;
        node_assert_1.default.strictEqual(deleteRes.message, '1 row(s) deleted successfully.');
        // 7. Validar estado final com SELECT *
        const finalSelect = (await db.query("SELECT * FROM produtos;")).data;
        node_assert_1.default.strictEqual(finalSelect.count, 1);
        node_assert_1.default.strictEqual(finalSelect.rows[0].preco, 230.00);
    });
    (0, node_test_1.it)('deve alterar, truncar e remover tabelas e bancos', async () => {
        await db.query('CREATE DATABASE loja;');
        await db.query('USE loja;');
        await db.query('CREATE TABLE produtos (id INT PRIMARY KEY AUTO_INCREMENT, nome STRING);');
        await db.query("INSERT INTO produtos (nome) VALUES ('Teclado');");
        const addColumn = await db.query("ALTER TABLE produtos ADD COLUMN ativo BOOLEAN DEFAULT true;");
        node_assert_1.default.deepStrictEqual(addColumn.data, {
            message: 'Column "ativo" added to table "produtos" successfully.'
        });
        let result = (await db.query('SELECT * FROM produtos;')).data;
        node_assert_1.default.deepStrictEqual(result.rows, [{ id: 1, nome: 'Teclado', ativo: true }]);
        const renameColumn = await db.query('ALTER TABLE produtos RENAME COLUMN nome TO titulo;');
        node_assert_1.default.deepStrictEqual(renameColumn.data, {
            message: 'Column "nome" renamed to "titulo" successfully.'
        });
        result = (await db.query('SELECT * FROM produtos;')).data;
        node_assert_1.default.deepStrictEqual(result.rows, [{ id: 1, ativo: true, titulo: 'Teclado' }]);
        const dropColumn = await db.query('ALTER TABLE produtos DROP COLUMN ativo;');
        node_assert_1.default.deepStrictEqual(dropColumn.data, {
            message: 'Column "ativo" dropped from table "produtos" successfully.'
        });
        const truncate = await db.query('TRUNCATE TABLE produtos;');
        node_assert_1.default.deepStrictEqual(truncate.data, {
            message: 'Table "produtos" truncated successfully.'
        });
        result = (await db.query('SELECT * FROM produtos;')).data;
        node_assert_1.default.deepStrictEqual(result.rows, []);
        await db.query("INSERT INTO produtos (titulo) VALUES ('Mouse');");
        result = (await db.query('SELECT * FROM produtos;')).data;
        node_assert_1.default.strictEqual(result.rows[0].id, 1);
        await db.query('DROP TABLE produtos;');
        node_assert_1.default.deepStrictEqual((await db.query('SHOW TABLES;')).data, { tables: [] });
        await db.query('DROP DATABASE loja;');
        node_assert_1.default.strictEqual(db.getCurrentDatabase(), null);
        node_assert_1.default.deepStrictEqual((await db.query('SHOW DATABASES;')).data, { databases: [] });
        await node_assert_1.default.rejects(() => db.query('SHOW TABLES;'), /No database selected/);
    });
    (0, node_test_1.it)('enforces UNIQUE, CHECK, NOT NULL, and DEFAULT constraints on writes', async () => {
        await db.query('CREATE DATABASE constraints;');
        await db.query('USE constraints;');
        await db.query(`
      CREATE TABLE accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email STRING UNIQUE NULL CHECK (email LIKE '%@%'),
        age INT DEFAULT 18 CHECK (age >= 18),
        team INT NOT NULL,
        UNIQUE (team, age),
        CHECK (age < 100)
      );
    `);
        const first = await db.query('INSERT INTO accounts (email, team) VALUES (NULL, 1);');
        node_assert_1.default.strictEqual(first.data.insertedRow.age, 18);
        await db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 19, 1);');
        await db.query("INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 20, 2);");
        await node_assert_1.default.rejects(() => db.query("INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 21, 3);"), /UNIQUE constraint failed/);
        await node_assert_1.default.rejects(() => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 18, 1);'), /UNIQUE constraint failed/);
        await node_assert_1.default.rejects(() => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 17, 2);'), /CHECK constraint failed/);
        await node_assert_1.default.rejects(() => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 100, 2);'), /CHECK constraint failed/);
        await node_assert_1.default.rejects(() => db.query("INSERT INTO accounts (email, age, team) VALUES ('invalid', 20, 4);"), /CHECK constraint failed/);
        await node_assert_1.default.rejects(() => db.query("INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 20, 2);"), /UNIQUE constraint failed/);
        await node_assert_1.default.rejects(() => db.query("INSERT INTO accounts (email, age, team) VALUES ('required@example.com', 20, NULL);"), /cannot be null/);
        await node_assert_1.default.rejects(() => db.query('UPDATE accounts SET age = 17 WHERE id = 1;'), /CHECK constraint failed/);
        await node_assert_1.default.rejects(() => db.query("UPDATE accounts SET email = 'taken@example.com' WHERE id = 1;"), /UNIQUE constraint failed/);
        const rows = (await db.query('SELECT * FROM accounts;')).data;
        node_assert_1.default.deepStrictEqual(rows.rows.map((row) => row.age), [18, 19, 20]);
    });
    (0, node_test_1.it)('rejects DEFAULT values incompatible with column constraints', async () => {
        await db.query('CREATE DATABASE defaults;');
        await db.query('USE defaults;');
        await node_assert_1.default.rejects(() => db.query("CREATE TABLE invalid_type (count INT DEFAULT 'many');"), /Type mismatch on default/);
        await node_assert_1.default.rejects(() => db.query('CREATE TABLE invalid_null (required STRING NOT NULL DEFAULT NULL);'), /Default value .* cannot be NULL/);
        await node_assert_1.default.rejects(() => db.query('CREATE TABLE invalid_primary (id INT PRIMARY KEY NULL);'), /Primary key column .* cannot be nullable/);
        await db.query('CREATE TABLE populated (id INT PRIMARY KEY AUTO_INCREMENT);');
        await db.query('INSERT INTO populated (id) VALUES (10);');
        await node_assert_1.default.rejects(() => db.query("ALTER TABLE populated ADD COLUMN score INT DEFAULT 'bad';"), /Type mismatch/);
        await node_assert_1.default.rejects(() => db.query('ALTER TABLE populated ADD COLUMN score INT DEFAULT 0 CHECK (score > 0);'), /CHECK constraint failed/);
        const populated = (await db.query('SELECT * FROM populated;')).data;
        node_assert_1.default.deepStrictEqual(populated.rows, [{ id: 1 }]);
    });
});
