import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SqlParser } from '../sqlParser';

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
});