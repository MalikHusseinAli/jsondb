## **In the name of Allah, the Entirely Merciful, the Especially Merciful.**

# jsondb 🔪

A lightweight, educational, embedded SQL database engine built in TypeScript/Node.js for rapid prototyping, MVPs, and API testing. It stores data locally using atomic JSON files (`.schema.json` and `.data.json`) managed through a real SQL parser and a clean modular architecture.

Pronounced "Jason", like the Friday the 13th villain. The database doesn't chase anyone — it just persists your data.

## Installation

Not published on npm. Install directly from the Git tag:

```
npm install github:MalikHusseinAli/jsondb#v0.1.3
```

The `dist/` folder is already compiled in the tag — no build step needed after install.

## Basic Usage

```
const { DatabaseEngine } = require('jsondb');

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

## Where data is stored

By default, databases live under `jsondb/data/` at the root of the consuming project:

```
<project-root>/
└── jsondb/
    └── data/
        └── mydb/
            ├── users.schema.json
            └── users.data.json
```

This keeps jsondb files isolated from other systems that may use a `data/` folder. The folder is created automatically on the first `CREATE DATABASE`.

You can override the location by passing a path to the constructor:

```
const db = new DatabaseEngine('/custom/path/to/data');
```

## Supported SQL

- `CREATE DATABASE`, `USE`, `SHOW DATABASES`, `DROP DATABASE`
- `CREATE TABLE` with types (`INT`, `FLOAT`, `STRING`, `BOOLEAN`, `DATE`), `PRIMARY KEY`, `AUTO_INCREMENT`, `NOT NULL`, `NULL`, `DEFAULT`
- `DROP TABLE`, `TRUNCATE TABLE`, and `SHOW TABLES`
- `ALTER TABLE` with `ADD COLUMN`, `DROP COLUMN`, and `RENAME COLUMN`
- `INSERT INTO ... VALUES`
- `SELECT` with `WHERE`, `ORDER BY`, `LIMIT`
- `UPDATE` and `DELETE`

### WHERE Operators

The `WHERE` clause supports standard comparison operators (`=`, `!=`, `>`, `<`, `>=`, `<=`) as well as:

- **`IN` / `NOT IN`**: Matches against a list of values.
  ```
  SELECT * FROM users WHERE status IN ('active', 'pending');
  SELECT * FROM users WHERE role NOT IN ('guest', 'banned');
  ```
- **`LIKE` / `ILIKE`**: Pattern matching. `%` matches any sequence of characters, `_` matches any single character. `ILIKE` is case-insensitive.
  ```
  SELECT * FROM users WHERE name LIKE 'A%';
  SELECT * FROM users WHERE email ILIKE '%@gmail.com';
  ```
- **`BETWEEN` / `NOT BETWEEN`**: Inclusive range checks.
  ```
  SELECT * FROM products WHERE price BETWEEN 10.0 AND 50.0;
  SELECT * FROM users WHERE age NOT BETWEEN 18 AND 65;
  ```
- **`IS NULL` / `IS NOT NULL`**: Checks for the presence of a value.
  ```
  SELECT * FROM users WHERE last_login IS NULL;
  SELECT * FROM users WHERE email IS NOT NULL;
  ```
- **Logical precedence and parentheses**: `AND` takes precedence over `OR`. Use parentheses to explicitly group conditions.
  ```
  SELECT * FROM users WHERE a = 1 OR b = 2 AND c = 3;
  SELECT * FROM users WHERE (a = 1 OR b = 2) AND c = 3;
  ```

## Running Tests

The project uses the Node.js native test runner (`node:test`) with `tsx` for direct TypeScript execution.

```
npm test
```

## Roadmap & Future Developments

The development roadmap is divided into phases, organized by technical dependency and architectural maturity. The `#n` references represent the specific tracking issues on GitHub.

- **Phase 1: Core DML & Basic Structure**
  - Result Pagination & Filtering (`#2`)
  - Database & Table Lifecycle DDL (`#3`)
  - Data Constraints (`#4`)

- **Phase 2: Performance & Relationships**
  - Indexing System (`#5`)
  - Table Joins (`#6`)
  - Aggregations & Grouping (`#7`)

- **Phase 3: Integrity & Transactions**
  - Foreign Keys & Referential Integrity (`#8`)
  - Explicit Transactions (`#9`)
  - Savepoints & Concurrency Control (`#10`)

- **Phase 4: Advanced SQL**
  - Conditional Expressions & Scalar Functions (`#11`)
  - Subqueries (`#12`)
  - Set Operations & CTEs (`#13`)

- **Phase 5: Database Objects**
  - Views & Triggers (`#14`)

For a detailed breakdown of each feature, ongoing discussions, and the current status of these implementations, please refer to the [GitHub Issues page](https://github.com/MalikHusseinAli/jsondb/issues).

## Versioning

- `v0.1.3` — current. Added extended `WHERE` operators (`IN`, `LIKE`, `BETWEEN`, `IS NULL`) and logical precedence.
- `v0.1.2` — Data stored under `jsondb/data/`.
- `v0.1.1` — deprecated and removed. Data was stored under `data/` at the project root.

## Author & Contact

**Malik Hussein Ali** is the muslim name adopted by **Edvaldo Silva de Almeida Júnior** after his reversion to Islam. 

- Email: edvaldoajunior@gmail.com
- Phone / WhatsApp: +55 (41) 99929-6340 / +55 (47) 99220-0078