import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SqlExecutor } from '../executor';
import { SqlParser } from '../../parser/sqlParser';
import { TableRow } from '../../storage/types';

class MockStorage {
  public rows: TableRow[] = [];
  public schema: any = {
    tableName: 'users',
    columns: [
      { name: 'id', type: 'INT', primaryKey: true },
      { name: 'name', type: 'STRING' },
      { name: 'age', type: 'INT' },
      { name: 'email', type: 'STRING', nullable: true }
    ],
    autoIncrementSequence: 4
  };

  async readRows() { return this.rows; }
  async readSchema() { return this.schema; }
  async writeRows(_db: string, _table: string, rows: TableRow[]) { this.rows = rows; }
  async writeSchema() {}
  async createTable() { return this.schema; }
  async dropTable() {}
  async listTables() { return ['users']; }
}

describe('SqlExecutor - WHERE Extensions (Issue #1)', () => {
  let storage: MockStorage;
  let executor: SqlExecutor;
  let parser: SqlParser;

  const executeQuery = async (sql: string) => {
    const ast = parser.parse(sql);
    return await executor.executeInContext('mydb', ast) as { rows: TableRow[], count: number };
  };

  const getIds = (rows: TableRow[]) => rows.map(r => r.id);

  beforeEach(() => {
    storage = new MockStorage();
    executor = new SqlExecutor(storage as any);
    parser = new SqlParser();
    storage.rows = [
      { id: 1, name: 'Alice', age: 30, email: 'alice@x.com' },
      { id: 2, name: 'bob', age: 17, email: null },
      { id: 3, name: 'ALICIA', age: 65, email: 'a@y.com' },
      { id: 4, name: 'Carol', age: 40, email: null }
    ];
  });

  it('deve filtrar com IN', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE id IN (1, 3);');
    assert.deepStrictEqual(getIds(res.rows), [1, 3]);
  });

  it('deve filtrar com NOT IN', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE id NOT IN (1, 3);');
    assert.deepStrictEqual(getIds(res.rows), [2, 4]);
  });

  it('deve filtrar com LIKE (case-sensitive)', async () => {
    const res = await executeQuery("SELECT * FROM users WHERE name LIKE 'A%';");
    assert.deepStrictEqual(getIds(res.rows), [1, 3]);
  });

  it('deve filtrar com ILIKE (case-insensitive)', async () => {
    const res = await executeQuery("SELECT * FROM users WHERE name ILIKE 'a%';");
    assert.deepStrictEqual(getIds(res.rows), [1, 3]);
  });

  it('deve filtrar com NOT LIKE', async () => {
    const res = await executeQuery("SELECT * FROM users WHERE name NOT LIKE 'A%';");
    assert.deepStrictEqual(getIds(res.rows), [2, 4]);
  });

  it('deve filtrar com BETWEEN (inclusivo)', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE age BETWEEN 30 AND 65;');
    assert.deepStrictEqual(getIds(res.rows), [1, 3, 4]);
  });

  it('deve filtrar com NOT BETWEEN', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE age NOT BETWEEN 30 AND 65;');
    assert.deepStrictEqual(getIds(res.rows), [2]);
  });

  it('deve filtrar com IS NULL (pegando null e undefined)', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE email IS NULL;');
    assert.deepStrictEqual(getIds(res.rows), [2, 4]);
  });

  it('deve filtrar com IS NOT NULL', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE email IS NOT NULL;');
    assert.deepStrictEqual(getIds(res.rows), [1, 3]);
  });

  it('deve respeitar precedência AND > OR', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE id = 1 OR id = 2 AND age = 17;');
    assert.deepStrictEqual(getIds(res.rows), [1, 2]);
  });

  it('deve respeitar parênteses explícitos', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE (id = 1 OR id = 2) AND age = 17;');
    assert.deepStrictEqual(getIds(res.rows), [2]);
  });

  it('deve respeitar NOT unário com parênteses', async () => {
    const res = await executeQuery('SELECT * FROM users WHERE NOT (id = 1 OR id = 2);');
    assert.deepStrictEqual(getIds(res.rows), [3, 4]);
  });

  it('deve combinar operadores estendidos com lógica', async () => {
    const res = await executeQuery("SELECT * FROM users WHERE (name ILIKE 'a%' OR age < 20) AND email IS NOT NULL;");
    assert.deepStrictEqual(getIds(res.rows), [1, 3]);
  });
});

describe('SqlExecutor - Result Features (Issue #2)', () => {
  let storage: MockStorage;
  let executor: SqlExecutor;
  let parser: SqlParser;

  beforeEach(() => {
    storage = new MockStorage();
    executor = new SqlExecutor(storage as any);
    parser = new SqlParser();
    storage.rows = [
      { id: 1, name: 'Alice', age: 30, email: null },
      { id: 2, name: 'Bob', age: 30, email: null },
      { id: 3, name: 'Carol', age: 40, email: null },
      { id: 4, name: 'Alice', age: 40, email: null }
    ];
  });

  const executeQuery = async (sql: string) => {
    const ast = parser.parse(sql);
    return await executor.executeInContext('mydb', ast) as { rows: TableRow[], count: number };
  };

  it('deve aplicar DISTINCT antes da projeção', async () => {
    const res = await executeQuery('SELECT DISTINCT age FROM users;');
    assert.deepStrictEqual(res.rows, [{ age: 30 }, { age: 40 }]);
  });

  it('deve suportar alias de coluna', async () => {
    const res = await executeQuery('SELECT name AS username FROM users WHERE id = 1;');
    assert.deepStrictEqual(res.rows, [{ username: 'Alice' }]);
  });

  it('deve suportar alias de tabela', async () => {
    const res = await executeQuery('SELECT u.name FROM users AS u WHERE u.id = 2;');
    assert.deepStrictEqual(res.rows, [{ name: 'Bob' }]);
  });

  it('deve aplicar LIMIT e OFFSET em sequência', async () => {
    const res = await executeQuery('SELECT id FROM users ORDER BY id ASC LIMIT 2 OFFSET 1;');
    assert.deepStrictEqual(res.rows, [{ id: 2 }, { id: 3 }]);
  });

  it('deve ordenar por várias colunas', async () => {
    const res = await executeQuery('SELECT id, name, age FROM users ORDER BY age ASC, name DESC;');
    assert.deepStrictEqual(res.rows.map((row) => row.id), [2, 1, 3, 4]);
  });
});

describe('SqlExecutor - table lifecycle DDL context', () => {
  const executor = new SqlExecutor({} as any);
  const parser = new SqlParser();

  it('exige um banco selecionado para TRUNCATE TABLE e ALTER TABLE', async () => {
    for (const sql of [
      'TRUNCATE TABLE users;',
      'ALTER TABLE users ADD COLUMN age INT;'
    ]) {
      await assert.rejects(
        executor.execute(parser.parse(sql)),
        /USE <database> first or specify database context/
      );
    }
  });
});