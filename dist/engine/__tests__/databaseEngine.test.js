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
});
