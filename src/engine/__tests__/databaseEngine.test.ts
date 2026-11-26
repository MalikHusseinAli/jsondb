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
});