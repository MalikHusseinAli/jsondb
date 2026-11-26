import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SqlParser } from '../sqlParser';
import { WhereExpression } from '../ast';

describe('SqlParser', () => {
  const parser = new SqlParser();

  it('deve fazer o parse correto de um comando CREATE DATABASE', () => {
    const ast = parser.parse('CREATE DATABASE teste_db;');
    assert.deepStrictEqual(ast, {
      type: 'CREATE_DATABASE',
      databaseName: 'teste_db'
    });
  });

  it('deve fazer o parse correto de um comando CREATE TABLE com restrições', () => {
    const sql = `
      CREATE TABLE usuarios (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email STRING NOT NULL,
        idade INT DEFAULT 18
      );
    `;
    const ast = parser.parse(sql);

    assert.strictEqual(ast.type, 'CREATE_TABLE');
    if (ast.type === 'CREATE_TABLE') {
      assert.strictEqual(ast.tableName, 'usuarios');
      assert.strictEqual(ast.columns.length, 3);
      assert.strictEqual(ast.columns[0].primaryKey, true);
      assert.strictEqual(ast.columns[0].autoIncrement, true);
      assert.strictEqual(ast.columns[1].nullable, false);
      assert.strictEqual(ast.columns[2].defaultValue, 18);
    }
  });

  it('deve fazer o parse de TRUNCATE TABLE e das operações ALTER TABLE', () => {
    assert.deepStrictEqual(parser.parse('TRUNCATE TABLE users;'), {
      type: 'TRUNCATE_TABLE',
      tableName: 'users'
    });
    assert.deepStrictEqual(parser.parse('ALTER TABLE users ADD COLUMN age INT DEFAULT 18;'), {
      type: 'ALTER_TABLE',
      tableName: 'users',
      action: 'ADD_COLUMN',
      column: { name: 'age', type: 'INT', defaultValue: 18 }
    });
    assert.deepStrictEqual(parser.parse('ALTER TABLE users DROP COLUMN age;'), {
      type: 'ALTER_TABLE',
      tableName: 'users',
      action: 'DROP_COLUMN',
      columnName: 'age'
    });
    assert.deepStrictEqual(parser.parse('ALTER TABLE users RENAME COLUMN age TO years;'), {
      type: 'ALTER_TABLE',
      tableName: 'users',
      action: 'RENAME_COLUMN',
      columnName: 'age',
      newColumnName: 'years'
    });
  });

  it('deve rejeitar sintaxe incompleta ou inválida nos comandos de lifecycle', () => {
    assert.throws(() => parser.parse('TRUNCATE users;'), /Expected keyword "TABLE"/);
    assert.throws(() => parser.parse('ALTER TABLE users ADD COLUMN age;'), /Expected column type/);
    assert.throws(() => parser.parse('ALTER TABLE users DROP COLUMN;'), /Expected identifier/);
    assert.throws(
      () => parser.parse('ALTER TABLE users RENAME COLUMN age years;'),
      /Expected keyword "TO"/
    );
    assert.throws(
      () => parser.parse('ALTER TABLE users CHANGE age years;'),
      /Expected ADD, DROP, or RENAME/
    );
  });

  it('deve fazer o parse correto de um SELECT com WHERE e ORDER BY', () => {
    const sql = "SELECT nome, idade FROM clientes WHERE idade > 25 ORDER BY idade DESC LIMIT 10;";
    const ast = parser.parse(sql);

    assert.strictEqual(ast.type, 'SELECT');
    if (ast.type === 'SELECT') {
      assert.strictEqual(ast.tableName, 'clientes');
      assert.deepStrictEqual(ast.columns, ['nome', 'idade']);
      assert.deepStrictEqual(ast.where?.conditions, [
        { column: 'idade', operator: '>', value: 25 }
      ]);
      assert.deepStrictEqual(ast.orderBy, { column: 'idade', direction: 'DESC' });
      assert.strictEqual(ast.limit, 10);
    }
  });

  it('deve lançar erro em sintaxe SQL inválida', () => {
    assert.throws(() => {
      parser.parse('INVALID SQL COMMAND;');
    }, /Unsupported SQL command/);
  });

  it('deve fazer o parse de DISTINCT, aliases, OFFSET e ordenação múltipla', () => {
    const ast = parser.parse(
      'SELECT DISTINCT name AS username, age FROM users AS u ORDER BY age DESC, name ASC LIMIT 10 OFFSET 5;'
    );

    assert.strictEqual(ast.type, 'SELECT');
    if (ast.type === 'SELECT') {
      assert.strictEqual(ast.tableName, 'users');
      assert.strictEqual(ast.tableAlias, 'u');
      assert.strictEqual(ast.distinct, true);
      assert.deepStrictEqual(ast.columns, ['name', 'age']);
      assert.deepStrictEqual(ast.aliases, { name: 'username' });
      assert.deepStrictEqual(ast.orderBy, [
        { column: 'age', direction: 'DESC' },
        { column: 'name', direction: 'ASC' }
      ]);
      assert.strictEqual(ast.limit, 10);
      assert.strictEqual(ast.offset, 5);
    }
  });

  describe('Extended WHERE Operators (Issue #1)', () => {
    const parseWhereExpr = (whereSql: string): WhereExpression => {
      const ast = parser.parse(`SELECT * FROM t WHERE ${whereSql};`);
      assert.strictEqual(ast.type, 'SELECT');
      const expr = (ast as any).where?.expression as WhereExpression;
      assert.ok(expr, 'Expression should be defined');
      return expr;
    };

    it('deve fazer o parse de IN', () => {
      const expr = parseWhereExpr('id IN (1, 2, 3)');
      assert.strictEqual(expr.type, 'IN');
      if (expr.type === 'IN') {
        assert.strictEqual(expr.column, 'id');
        assert.deepStrictEqual(expr.values, [1, 2, 3]);
        assert.strictEqual(expr.negate, false);
      }
    });

    it('deve fazer o parse de NOT IN', () => {
      const expr = parseWhereExpr("status NOT IN ('a', 'b')");
      assert.strictEqual(expr.type, 'IN');
      if (expr.type === 'IN') {
        assert.strictEqual(expr.column, 'status');
        assert.deepStrictEqual(expr.values, ['a', 'b']);
        assert.strictEqual(expr.negate, true);
      }
    });

    it('deve fazer o parse de LIKE', () => {
      const expr = parseWhereExpr("name LIKE 'A%'");
      assert.strictEqual(expr.type, 'LIKE');
      if (expr.type === 'LIKE') {
        assert.strictEqual(expr.column, 'name');
        assert.strictEqual(expr.pattern, 'A%');
        assert.strictEqual(expr.caseInsensitive, false);
        assert.strictEqual(expr.negate, false);
      }
    });

    it('deve fazer o parse de ILIKE', () => {
      const expr = parseWhereExpr("name ILIKE 'a%'");
      assert.strictEqual(expr.type, 'LIKE');
      if (expr.type === 'LIKE') {
        assert.strictEqual(expr.column, 'name');
        assert.strictEqual(expr.pattern, 'a%');
        assert.strictEqual(expr.caseInsensitive, true);
        assert.strictEqual(expr.negate, false);
      }
    });

    it('deve fazer o parse de NOT LIKE', () => {
      const expr = parseWhereExpr("name NOT LIKE 'A%'");
      assert.strictEqual(expr.type, 'LIKE');
      if (expr.type === 'LIKE') {
        assert.strictEqual(expr.negate, true);
      }
    });

    it('deve fazer o parse de BETWEEN', () => {
      const expr = parseWhereExpr('age BETWEEN 18 AND 65');
      assert.strictEqual(expr.type, 'BETWEEN');
      if (expr.type === 'BETWEEN') {
        assert.strictEqual(expr.column, 'age');
        assert.strictEqual(expr.low, 18);
        assert.strictEqual(expr.high, 65);
        assert.strictEqual(expr.negate, false);
      }
    });

    it('deve fazer o parse de NOT BETWEEN', () => {
      const expr = parseWhereExpr('age NOT BETWEEN 18 AND 65');
      assert.strictEqual(expr.type, 'BETWEEN');
      if (expr.type === 'BETWEEN') {
        assert.strictEqual(expr.negate, true);
      }
    });

    it('deve fazer o parse de IS NULL', () => {
      const expr = parseWhereExpr('email IS NULL');
      assert.strictEqual(expr.type, 'IS_NULL');
      if (expr.type === 'IS_NULL') {
        assert.strictEqual(expr.column, 'email');
        assert.strictEqual(expr.negate, false);
      }
    });

    it('deve fazer o parse de IS NOT NULL', () => {
      const expr = parseWhereExpr('email IS NOT NULL');
      assert.strictEqual(expr.type, 'IS_NULL');
      if (expr.type === 'IS_NULL') {
        assert.strictEqual(expr.negate, true);
      }
    });

    it('deve respeitar precedência de AND sobre OR', () => {
      const expr = parseWhereExpr('a = 1 OR b = 2 AND c = 3');
      assert.strictEqual(expr.type, 'OR');
      if (expr.type === 'OR') {
        assert.strictEqual(expr.left.type, 'BINARY');
        assert.strictEqual(expr.right.type, 'AND');
      }
    });

    it('deve respeitar parênteses explícitos', () => {
      const expr = parseWhereExpr('(a = 1 OR b = 2) AND c = 3');
      assert.strictEqual(expr.type, 'AND');
      if (expr.type === 'AND') {
        assert.strictEqual(expr.left.type, 'GROUP');
        if (expr.left.type === 'GROUP') {
          assert.strictEqual(expr.left.inner.type, 'OR');
        }
        assert.strictEqual(expr.right.type, 'BINARY');
      }
    });

    it('deve fazer o parse do NOT unário aplicado a um grupo', () => {
      const expr = parseWhereExpr('NOT (a = 1 OR b = 2)');
      assert.strictEqual(expr.type, 'NOT');
      if (expr.type === 'NOT') {
        assert.strictEqual(expr.operand.type, 'GROUP');
      }
    });
  });
});