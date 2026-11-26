import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseEngine } from '../databaseEngine';

describe('DatabaseEngine Integration Tests', () => {
  const testDir = path.resolve(process.cwd(), 'data_test');
  let db: DatabaseEngine;

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    db = new DatabaseEngine(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('deve executar o ciclo de vida completo de DDL e DML', async () => {
    // 1. Criar banco e selecionar
    const createDbRes = await db.query('CREATE DATABASE loja;');
    assert.deepStrictEqual(createDbRes.data, { message: 'Database "loja" created successfully.' });

    const useRes = await db.query('USE loja;');
    assert.deepStrictEqual(useRes.data, { message: 'Database changed to "loja"' });

    // 2. Criar tabela
    const createTableRes = await db.query(`
      CREATE TABLE produtos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        titulo STRING NOT NULL,
        preco FLOAT,
        ativo BOOLEAN DEFAULT true
      );
    `);
    assert.strictEqual((createTableRes.data as any).message, 'Table "produtos" created successfully.');

    // 3. Inserir registros
    const ins1 = await db.query("INSERT INTO produtos (titulo, preco) VALUES ('Teclado Mecânico', 250.50);");
    assert.strictEqual((ins1.data as any).insertedRow.id, 1);
    assert.strictEqual((ins1.data as any).insertedRow.ativo, true);

    await db.query("INSERT INTO produtos (titulo, preco, ativo) VALUES ('Mouse Gamer', 120.00, false);");

    // 4. Consultar com SELECT e WHERE
    const selectRes = (await db.query("SELECT titulo, preco FROM produtos WHERE preco > 150 ORDER BY preco ASC;")).data as any;
    assert.strictEqual(selectRes.count, 1);
    assert.strictEqual(selectRes.rows[0].titulo, 'Teclado Mecânico');

    // 5. Atualizar registros
    const updateRes = (await db.query("UPDATE produtos SET preco = 230.00 WHERE titulo = 'Teclado Mecânico';")).data as any;
    assert.strictEqual(updateRes.message, '1 row(s) updated successfully.');

    // 6. Deletar registros
    const deleteRes = (await db.query("DELETE FROM produtos WHERE ativo = false;")).data as any;
    assert.strictEqual(deleteRes.message, '1 row(s) deleted successfully.');

    // 7. Validar estado final com SELECT *
    const finalSelect = (await db.query("SELECT * FROM produtos;")).data as any;
    assert.strictEqual(finalSelect.count, 1);
    assert.strictEqual(finalSelect.rows[0].preco, 230.00);
  });

  it('deve alterar, truncar e remover tabelas e bancos', async () => {
    await db.query('CREATE DATABASE loja;');
    await db.query('USE loja;');
    await db.query('CREATE TABLE produtos (id INT PRIMARY KEY AUTO_INCREMENT, nome STRING);');
    await db.query("INSERT INTO produtos (nome) VALUES ('Teclado');");

    const addColumn = await db.query("ALTER TABLE produtos ADD COLUMN ativo BOOLEAN DEFAULT true;");
    assert.deepStrictEqual(addColumn.data, {
      message: 'Column "ativo" added to table "produtos" successfully.'
    });
    let result = (await db.query('SELECT * FROM produtos;')).data as any;
    assert.deepStrictEqual(result.rows, [{ id: 1, nome: 'Teclado', ativo: true }]);

    const renameColumn = await db.query('ALTER TABLE produtos RENAME COLUMN nome TO titulo;');
    assert.deepStrictEqual(renameColumn.data, {
      message: 'Column "nome" renamed to "titulo" successfully.'
    });
    result = (await db.query('SELECT * FROM produtos;')).data as any;
    assert.deepStrictEqual(result.rows, [{ id: 1, ativo: true, titulo: 'Teclado' }]);

    const dropColumn = await db.query('ALTER TABLE produtos DROP COLUMN ativo;');
    assert.deepStrictEqual(dropColumn.data, {
      message: 'Column "ativo" dropped from table "produtos" successfully.'
    });
    const truncate = await db.query('TRUNCATE TABLE produtos;');
    assert.deepStrictEqual(truncate.data, {
      message: 'Table "produtos" truncated successfully.'
    });
    result = (await db.query('SELECT * FROM produtos;')).data as any;
    assert.deepStrictEqual(result.rows, []);
    await db.query("INSERT INTO produtos (titulo) VALUES ('Mouse');");
    result = (await db.query('SELECT * FROM produtos;')).data as any;
    assert.strictEqual(result.rows[0].id, 1);

    await db.query('DROP TABLE produtos;');
    assert.deepStrictEqual((await db.query('SHOW TABLES;')).data, { tables: [] });
    await db.query('DROP DATABASE loja;');
    assert.strictEqual(db.getCurrentDatabase(), null);
    assert.deepStrictEqual((await db.query('SHOW DATABASES;')).data, { databases: [] });
    await assert.rejects(() => db.query('SHOW TABLES;'), /No database selected/);
  });

  it('enforces UNIQUE, CHECK, NOT NULL, and DEFAULT constraints on writes', async () => {
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

    const first = await db.query(
      'INSERT INTO accounts (email, team) VALUES (NULL, 1);'
    );
    assert.strictEqual((first.data as any).insertedRow.age, 18);
    await db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 19, 1);');
    await db.query(
      "INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 20, 2);"
    );

    await assert.rejects(
      () => db.query("INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 21, 3);"),
      /UNIQUE constraint failed/
    );
    await assert.rejects(
      () => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 18, 1);'),
      /UNIQUE constraint failed/
    );
    await assert.rejects(
      () => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 17, 2);'),
      /CHECK constraint failed/
    );
    await assert.rejects(
      () => db.query('INSERT INTO accounts (email, age, team) VALUES (NULL, 100, 2);'),
      /CHECK constraint failed/
    );
    await assert.rejects(
      () => db.query("INSERT INTO accounts (email, age, team) VALUES ('invalid', 20, 4);"),
      /CHECK constraint failed/
    );
    await assert.rejects(
      () => db.query("INSERT INTO accounts (email, age, team) VALUES ('taken@example.com', 20, 2);"),
      /UNIQUE constraint failed/
    );
    await assert.rejects(
      () => db.query("INSERT INTO accounts (email, age, team) VALUES ('required@example.com', 20, NULL);"),
      /cannot be null/
    );
    await assert.rejects(
      () => db.query('UPDATE accounts SET age = 17 WHERE id = 1;'),
      /CHECK constraint failed/
    );
    await assert.rejects(
      () => db.query("UPDATE accounts SET email = 'taken@example.com' WHERE id = 1;"),
      /UNIQUE constraint failed/
    );

    const rows = (await db.query('SELECT * FROM accounts;')).data as any;
    assert.deepStrictEqual(rows.rows.map((row: any) => row.age), [18, 19, 20]);
  });

  it('rejects DEFAULT values incompatible with column constraints', async () => {
    await db.query('CREATE DATABASE defaults;');
    await db.query('USE defaults;');

    await assert.rejects(
      () => db.query("CREATE TABLE invalid_type (count INT DEFAULT 'many');"),
      /Type mismatch on default/
    );
    await assert.rejects(
      () => db.query('CREATE TABLE invalid_null (required STRING NOT NULL DEFAULT NULL);'),
      /Default value .* cannot be NULL/
    );
    await assert.rejects(
      () => db.query('CREATE TABLE invalid_primary (id INT PRIMARY KEY NULL);'),
      /Primary key column .* cannot be nullable/
    );

    await db.query('CREATE TABLE populated (id INT PRIMARY KEY AUTO_INCREMENT);');
    await db.query('INSERT INTO populated (id) VALUES (10);');
    await assert.rejects(
      () => db.query("ALTER TABLE populated ADD COLUMN score INT DEFAULT 'bad';"),
      /Type mismatch/
    );
    await assert.rejects(
      () => db.query('ALTER TABLE populated ADD COLUMN score INT DEFAULT 0 CHECK (score > 0);'),
      /CHECK constraint failed/
    );
    const populated = (await db.query('SELECT * FROM populated;')).data as any;
    assert.deepStrictEqual(populated.rows, [{ id: 1 }]);
  });
});