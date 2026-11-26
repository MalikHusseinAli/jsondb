import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { JsonStorage } from '../jsonStorage';

describe('JsonStorage - table lifecycle DDL', () => {
  let baseDir: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsondb-storage-test-'));
    storage = new JsonStorage(baseDir);
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

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('trunca uma tabela, reinicia o auto-incremento e rejeita tabelas ausentes', async () => {
    await storage.truncateTable('testdb', 'users');

    assert.deepStrictEqual(await storage.readRows('testdb', 'users'), []);
    assert.strictEqual((await storage.readSchema('testdb', 'users')).autoIncrementSequence, 0);
    await assert.rejects(
      storage.truncateTable('testdb', 'missing'),
      /Table "missing" does not exist/
    );
  });

  it('adiciona colunas preenchendo linhas existentes com default, null e auto-incremento', async () => {
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

    assert.deepStrictEqual(await storage.readRows('testdb', 'users'), [
      { id: 1, name: 'Alice', active: true, nickname: null, sequence: 5 },
      { id: 2, name: 'Bob', active: true, nickname: null, sequence: 6 }
    ]);
    const schema = await storage.readSchema('testdb', 'users');
    assert.strictEqual(schema.columns.at(-1)?.name, 'sequence');
    assert.strictEqual(schema.autoIncrementSequence, 6);
  });

  it('rejeita adições inválidas sem alterar schema ou dados', async () => {
    await assert.rejects(
      storage.addColumn('testdb', 'users', { name: 'required', type: 'STRING' }),
      /Cannot add NOT NULL column "required"/
    );
    await assert.rejects(
      storage.addColumn('testdb', 'users', { name: 'name', type: 'STRING', nullable: true }),
      /Column "name" already exists/
    );
    await assert.rejects(
      storage.addColumn('testdb', 'missing', { name: 'extra', type: 'STRING', nullable: true }),
      /Table "missing" does not exist/
    );
    await assert.rejects(
      storage.addColumn('testdb', 'users', { name: 'invalid-name', type: 'STRING', nullable: true }),
      /Invalid identifier/
    );
    await assert.rejects(
      storage.addColumn('testdb', 'users', {
        name: 'duplicate_key',
        type: 'INT',
        primaryKey: true,
        defaultValue: 1
      }),
      /Existing rows cannot satisfy primary key constraint/
    );

    assert.deepStrictEqual(await storage.readRows('testdb', 'users'), [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]);
    assert.deepStrictEqual(
      (await storage.readSchema('testdb', 'users')).columns.map((column) => column.name),
      ['id', 'name']
    );
  });

  it('remove uma coluna dos dados e impede remover a última coluna', async () => {
    await assert.rejects(
      storage.dropColumn('testdb', 'users', 'missing'),
      /Column "missing" does not exist/
    );
    await assert.rejects(
      storage.dropColumn('testdb', 'missing', 'name'),
      /Table "missing" does not exist/
    );

    await storage.dropColumn('testdb', 'users', 'name');
    assert.deepStrictEqual(await storage.readRows('testdb', 'users'), [
      { id: 1 },
      { id: 2 }
    ]);
    assert.deepStrictEqual(
      (await storage.readSchema('testdb', 'users')).columns.map((column) => column.name),
      ['id']
    );
    await assert.rejects(
      storage.dropColumn('testdb', 'users', 'id'),
      /Cannot drop the last column/
    );
  });

  it('renomeia uma coluna no schema e nas linhas e rejeita conflitos', async () => {
    await assert.rejects(
      storage.renameColumn('testdb', 'users', 'missing', 'username'),
      /Column "missing" does not exist/
    );
    await assert.rejects(
      storage.renameColumn('testdb', 'users', 'name', 'id'),
      /Column "id" already exists/
    );
    await assert.rejects(
      storage.renameColumn('testdb', 'missing', 'name', 'username'),
      /Table "missing" does not exist/
    );
    await assert.rejects(
      storage.renameColumn('testdb', 'users', 'name', 'invalid-name'),
      /Invalid identifier/
    );

    await storage.renameColumn('testdb', 'users', 'name', 'username');
    assert.deepStrictEqual(await storage.readRows('testdb', 'users'), [
      { id: 1, username: 'Alice' },
      { id: 2, username: 'Bob' }
    ]);
    assert.deepStrictEqual(
      (await storage.readSchema('testdb', 'users')).columns.map((column) => column.name),
      ['id', 'username']
    );
  });
});
