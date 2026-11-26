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
    (0, node_test_1.it)('faz parse de UNIQUE e CHECK no nível da coluna e da tabela', () => {
        const ast = parser.parse(`
      CREATE TABLE accounts (
        email STRING UNIQUE NULL CHECK (email IS NULL OR email LIKE '%@%'),
        age INT DEFAULT 18 CHECK (age >= 18 AND age < 100),
        UNIQUE (email, age),
        CHECK (age != 0)
      );
    `);
        node_assert_1.default.strictEqual(ast.type, 'CREATE_TABLE');
        if (ast.type === 'CREATE_TABLE') {
            node_assert_1.default.strictEqual(ast.columns[0].unique, true);
            node_assert_1.default.deepStrictEqual(ast.columns[0].check, {
                type: 'OR',
                left: { type: 'IS_NULL', column: 'email', negate: false },
                right: {
                    type: 'LIKE',
                    column: 'email',
                    pattern: '%@%',
                    caseInsensitive: false,
                    negate: false
                }
            });
            node_assert_1.default.deepStrictEqual(ast.constraints, [
                { type: 'UNIQUE', columns: ['email', 'age'] },
                {
                    type: 'CHECK',
                    expression: { type: 'BINARY', column: 'age', operator: '!=', value: 0 }
                }
            ]);
        }
    });
    (0, node_test_1.it)('deve fazer o parse de TRUNCATE TABLE e das operações ALTER TABLE', () => {
        node_assert_1.default.deepStrictEqual(parser.parse('TRUNCATE TABLE users;'), {
            type: 'TRUNCATE_TABLE',
            tableName: 'users'
        });
        node_assert_1.default.deepStrictEqual(parser.parse('ALTER TABLE users ADD COLUMN age INT DEFAULT 18;'), {
            type: 'ALTER_TABLE',
            tableName: 'users',
            action: 'ADD_COLUMN',
            column: { name: 'age', type: 'INT', defaultValue: 18 }
        });
        node_assert_1.default.deepStrictEqual(parser.parse('ALTER TABLE users DROP COLUMN age;'), {
            type: 'ALTER_TABLE',
            tableName: 'users',
            action: 'DROP_COLUMN',
            columnName: 'age'
        });
        node_assert_1.default.deepStrictEqual(parser.parse('ALTER TABLE users RENAME COLUMN age TO years;'), {
            type: 'ALTER_TABLE',
            tableName: 'users',
            action: 'RENAME_COLUMN',
            columnName: 'age',
            newColumnName: 'years'
        });
    });
    (0, node_test_1.it)('deve rejeitar sintaxe incompleta ou inválida nos comandos de lifecycle', () => {
        node_assert_1.default.throws(() => parser.parse('TRUNCATE users;'), /Expected keyword "TABLE"/);
        node_assert_1.default.throws(() => parser.parse('ALTER TABLE users ADD COLUMN age;'), /Expected column type/);
        node_assert_1.default.throws(() => parser.parse('ALTER TABLE users DROP COLUMN;'), /Expected identifier/);
        node_assert_1.default.throws(() => parser.parse('ALTER TABLE users RENAME COLUMN age years;'), /Expected keyword "TO"/);
        node_assert_1.default.throws(() => parser.parse('ALTER TABLE users CHANGE age years;'), /Expected ADD, DROP, or RENAME/);
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
    (0, node_test_1.it)('deve fazer o parse de DISTINCT, aliases, OFFSET e ordenação múltipla', () => {
        const ast = parser.parse('SELECT DISTINCT name AS username, age FROM users AS u ORDER BY age DESC, name ASC LIMIT 10 OFFSET 5;');
        node_assert_1.default.strictEqual(ast.type, 'SELECT');
        if (ast.type === 'SELECT') {
            node_assert_1.default.strictEqual(ast.tableName, 'users');
            node_assert_1.default.strictEqual(ast.tableAlias, 'u');
            node_assert_1.default.strictEqual(ast.distinct, true);
            node_assert_1.default.deepStrictEqual(ast.columns, ['name', 'age']);
            node_assert_1.default.deepStrictEqual(ast.aliases, { name: 'username' });
            node_assert_1.default.deepStrictEqual(ast.orderBy, [
                { column: 'age', direction: 'DESC' },
                { column: 'name', direction: 'ASC' }
            ]);
            node_assert_1.default.strictEqual(ast.limit, 10);
            node_assert_1.default.strictEqual(ast.offset, 5);
        }
    });
    (0, node_test_1.describe)('Extended WHERE Operators (Issue #1)', () => {
        const parseWhereExpr = (whereSql) => {
            const ast = parser.parse(`SELECT * FROM t WHERE ${whereSql};`);
            node_assert_1.default.strictEqual(ast.type, 'SELECT');
            const expr = ast.where?.expression;
            node_assert_1.default.ok(expr, 'Expression should be defined');
            return expr;
        };
        (0, node_test_1.it)('deve fazer o parse de IN', () => {
            const expr = parseWhereExpr('id IN (1, 2, 3)');
            node_assert_1.default.strictEqual(expr.type, 'IN');
            if (expr.type === 'IN') {
                node_assert_1.default.strictEqual(expr.column, 'id');
                node_assert_1.default.deepStrictEqual(expr.values, [1, 2, 3]);
                node_assert_1.default.strictEqual(expr.negate, false);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de NOT IN', () => {
            const expr = parseWhereExpr("status NOT IN ('a', 'b')");
            node_assert_1.default.strictEqual(expr.type, 'IN');
            if (expr.type === 'IN') {
                node_assert_1.default.strictEqual(expr.column, 'status');
                node_assert_1.default.deepStrictEqual(expr.values, ['a', 'b']);
                node_assert_1.default.strictEqual(expr.negate, true);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de LIKE', () => {
            const expr = parseWhereExpr("name LIKE 'A%'");
            node_assert_1.default.strictEqual(expr.type, 'LIKE');
            if (expr.type === 'LIKE') {
                node_assert_1.default.strictEqual(expr.column, 'name');
                node_assert_1.default.strictEqual(expr.pattern, 'A%');
                node_assert_1.default.strictEqual(expr.caseInsensitive, false);
                node_assert_1.default.strictEqual(expr.negate, false);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de ILIKE', () => {
            const expr = parseWhereExpr("name ILIKE 'a%'");
            node_assert_1.default.strictEqual(expr.type, 'LIKE');
            if (expr.type === 'LIKE') {
                node_assert_1.default.strictEqual(expr.column, 'name');
                node_assert_1.default.strictEqual(expr.pattern, 'a%');
                node_assert_1.default.strictEqual(expr.caseInsensitive, true);
                node_assert_1.default.strictEqual(expr.negate, false);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de NOT LIKE', () => {
            const expr = parseWhereExpr("name NOT LIKE 'A%'");
            node_assert_1.default.strictEqual(expr.type, 'LIKE');
            if (expr.type === 'LIKE') {
                node_assert_1.default.strictEqual(expr.negate, true);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de BETWEEN', () => {
            const expr = parseWhereExpr('age BETWEEN 18 AND 65');
            node_assert_1.default.strictEqual(expr.type, 'BETWEEN');
            if (expr.type === 'BETWEEN') {
                node_assert_1.default.strictEqual(expr.column, 'age');
                node_assert_1.default.strictEqual(expr.low, 18);
                node_assert_1.default.strictEqual(expr.high, 65);
                node_assert_1.default.strictEqual(expr.negate, false);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de NOT BETWEEN', () => {
            const expr = parseWhereExpr('age NOT BETWEEN 18 AND 65');
            node_assert_1.default.strictEqual(expr.type, 'BETWEEN');
            if (expr.type === 'BETWEEN') {
                node_assert_1.default.strictEqual(expr.negate, true);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de IS NULL', () => {
            const expr = parseWhereExpr('email IS NULL');
            node_assert_1.default.strictEqual(expr.type, 'IS_NULL');
            if (expr.type === 'IS_NULL') {
                node_assert_1.default.strictEqual(expr.column, 'email');
                node_assert_1.default.strictEqual(expr.negate, false);
            }
        });
        (0, node_test_1.it)('deve fazer o parse de IS NOT NULL', () => {
            const expr = parseWhereExpr('email IS NOT NULL');
            node_assert_1.default.strictEqual(expr.type, 'IS_NULL');
            if (expr.type === 'IS_NULL') {
                node_assert_1.default.strictEqual(expr.negate, true);
            }
        });
        (0, node_test_1.it)('deve respeitar precedência de AND sobre OR', () => {
            const expr = parseWhereExpr('a = 1 OR b = 2 AND c = 3');
            node_assert_1.default.strictEqual(expr.type, 'OR');
            if (expr.type === 'OR') {
                node_assert_1.default.strictEqual(expr.left.type, 'BINARY');
                node_assert_1.default.strictEqual(expr.right.type, 'AND');
            }
        });
        (0, node_test_1.it)('deve respeitar parênteses explícitos', () => {
            const expr = parseWhereExpr('(a = 1 OR b = 2) AND c = 3');
            node_assert_1.default.strictEqual(expr.type, 'AND');
            if (expr.type === 'AND') {
                node_assert_1.default.strictEqual(expr.left.type, 'GROUP');
                if (expr.left.type === 'GROUP') {
                    node_assert_1.default.strictEqual(expr.left.inner.type, 'OR');
                }
                node_assert_1.default.strictEqual(expr.right.type, 'BINARY');
            }
        });
        (0, node_test_1.it)('deve fazer o parse do NOT unário aplicado a um grupo', () => {
            const expr = parseWhereExpr('NOT (a = 1 OR b = 2)');
            node_assert_1.default.strictEqual(expr.type, 'NOT');
            if (expr.type === 'NOT') {
                node_assert_1.default.strictEqual(expr.operand.type, 'GROUP');
            }
        });
    });
});
