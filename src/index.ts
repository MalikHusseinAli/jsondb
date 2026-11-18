import { DatabaseEngine } from './engine/databaseEngine';

async function main() {
  const db = new DatabaseEngine();

  console.log('--- 1. Criando e listando Bancos de Dados ---');
  console.log(await db.query('CREATE DATABASE escola;'));
  console.log(await db.query('SHOW DATABASES;'));

  console.log('\n--- 2. Selecionando o Banco e Criando Tabela ---');
  console.log(await db.query('USE escola;'));
  console.log(
    await db.query(`
      CREATE TABLE alunos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        nome STRING NOT NULL,
        idade INT,
        ativo BOOLEAN DEFAULT true
      );
    `)
  );
  console.log(await db.query('SHOW TABLES;'));

  console.log('\n--- 3. Inserindo Registros ---');
  console.log(
    await db.query(
      "INSERT INTO alunos (nome, idade, ativo) VALUES ('Edvaldo', 58, true);"
    )
  );
  console.log(
    await db.query(
      "INSERT INTO alunos (nome, idade, ativo) VALUES ('Maria', 30, true);"
    )
  );
  console.log(
    await db.query(
      "INSERT INTO alunos (nome, idade, ativo) VALUES ('Carlos', 22, false);"
    )
  );

  console.log('\n--- 4. Consultando com SELECT, WHERE e ORDER BY ---');
  console.log(
    await db.query('SELECT nome, idade FROM alunos WHERE idade >= 30 ORDER BY idade DESC;')
  );

  console.log('\n--- 5. Atualizando Dados ---');
  console.log(
    await db.query("UPDATE alunos SET idade = 59 WHERE nome = 'Edvaldo';")
  );
  console.log(await db.query('SELECT * FROM alunos WHERE nome = \'Edvaldo\';'));

  console.log('\n--- 6. Deletando Registros ---');
  console.log(await db.query('DELETE FROM alunos WHERE ativo = false;'));
  console.log(await db.query('SELECT * FROM alunos;'));
}

main().catch((err) => {
  console.error('Erro na execução:', err.message);
});