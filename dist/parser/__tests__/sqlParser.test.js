"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const sqlParser_1 = require("../sqlParser");
(0, node_test_1.describe)('SqlParser', () => {
    const parser = new sqlParser_1.SqlParser();
    (0, node_test_1.it)('deve fazer o parse correto de um comando CREATE DATABASE', () => {
        const ast = parser.parse('CREATE DATABASE teste_db;');
        node_assert_1.default.deepStrictEqual(ast, {
            type: 'CREATE_DATABASE',
            databaseName: 'teste_db'
        });
    });
    (0, node_test_1.it)('deve fazer o parse correto de um comando CREATE TABLE com restrições', () => {
        const sql = `
      CREATE TABLE usuarios (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email STRING NOT NULL,
        idade INT DEFAULT 18
      );
    `;
        const ast = parser.parse(sql);
        node_assert_1.default.strictEqual(ast.type, 'CREATE_TABLE');
        if (ast.type === 'CREATE_TABLE') {
            node_assert_1.default.strictEqual(ast.tableName, 'usuarios');
            node_assert_1.default.strictEqual(ast.columns.length, 3);
            node_assert_1.default.strictEqual(ast.columns[0].primaryKey, true);
            node_assert_1.default.strictEqual(ast.columns[0].autoIncrement, true);
            node_assert_1.default.strictEqual(ast.columns[1].nullable, false);
            node_assert_1.default.strictEqual(ast.columns[2].defaultValue, 18);
        }
    });
    (0, node_test_1.it)('deve fazer o parse correto de um SELECT com WHERE e ORDER BY', () => {
        const sql = "SELECT nome, idade FROM clientes WHERE idade > 25 ORDER BY idade DESC LIMIT 10;";
        const ast = parser.parse(sql);
        node_assert_1.default.strictEqual(ast.type, 'SELECT');
        if (ast.type === 'SELECT') {
            node_assert_1.default.strictEqual(ast.tableName, 'clientes');
            node_assert_1.default.deepStrictEqual(ast.columns, ['nome', 'idade']);
            node_assert_1.default.deepStrictEqual(ast.where?.conditions, [
                { column: 'idade', operator: '>', value: 25 }
            ]);
            node_assert_1.default.deepStrictEqual(ast.orderBy, { column: 'idade', direction: 'DESC' });
            node_assert_1.default.strictEqual(ast.limit, 10);
        }
    });
    (0, node_test_1.it)('deve lançar erro em sintaxe SQL inválida', () => {
        node_assert_1.default.throws(() => {
            parser.parse('INVALID SQL COMMAND;');
        }, /Unsupported SQL command/);
    });
});
