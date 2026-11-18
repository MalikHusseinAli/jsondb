# jsondb 🔪

A lightweight, educational, embedded SQL database engine built in TypeScript/Node.js for rapid prototyping, MVPs, and API testing. It stores data locally using atomic JSON files (`.schema.json` and `.data.json`) managed through a real SQL parser and a clean modular architecture.

## Basic Usage

```javascript
const { DatabaseEngine } = require('./dist/engine/databaseEngine');

const db = new DatabaseEngine();

async function main() {
  await db.query('CREATE DATABASE mydb;');
  await db.query('USE mydb;');
  await db.query('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name STRING);');
  await db.query("INSERT INTO users (name) VALUES ('Alice');");
  
  const result = await db.query('SELECT * FROM users;');
  console.log(result.data);
}

main();
```

## Roadmap & Future Developments

* Express API layer & Pug-based SQL Playground UI
* Index support (`.index.json`) for optimized query performance
* Relational JOIN operations (`INNER JOIN`)

## Author & Contact

**Edvaldo Silva de Almeida Júnior**
* Email: edvaldoajunior@gmail.com
* Phone / WhatsApp: +55 (41) 99929-6340 / +55 (47) 99220-0078
