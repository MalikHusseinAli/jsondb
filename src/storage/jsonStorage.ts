import * as fs from 'fs/promises';
import * as path from 'path';
import { ColumnDefinition, TableData, TableRow, TableSchema } from './types';

export class JsonStorage {
  private readonly baseDir: string;

  constructor(baseDir: string = path.resolve(process.cwd(), 'data')) {
    this.baseDir = baseDir;
  }

  private sanitizeIdentifier(name: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid identifier: "${name}"`);
    }
    return name.toLowerCase();
  }

  private getDatabasePath(dbName: string): string {
    const safeDb = this.sanitizeIdentifier(dbName);
    return path.join(this.baseDir, safeDb);
  }

  private getSchemaFilePath(dbName: string, tableName: string): string {
    const dbPath = this.getDatabasePath(dbName);
    const safeTable = this.sanitizeIdentifier(tableName);
    return path.join(dbPath, `${safeTable}.schema.json`);
  }

  private getDataFilePath(dbName: string, tableName: string): string {
    const dbPath = this.getDatabasePath(dbName);
    const safeTable = this.sanitizeIdentifier(tableName);
    return path.join(dbPath, `${safeTable}.data.json`);
  }

  private async writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(tempPath, serialized, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  public async databaseExists(dbName: string): Promise<boolean> {
    const dbPath = this.getDatabasePath(dbName);
    return this.exists(dbPath);
  }

  public async createDatabase(dbName: string): Promise<void> {
    await this.init();
    const dbPath = this.getDatabasePath(dbName);

    if (await this.exists(dbPath)) {
      throw new Error(`Database "${dbName}" already exists`);
    }

    await fs.mkdir(dbPath);
  }

  public async dropDatabase(dbName: string): Promise<void> {
    const dbPath = this.getDatabasePath(dbName);

    if (!(await this.exists(dbPath))) {
      throw new Error(`Database "${dbName}" does not exist`);
    }

    await fs.rm(dbPath, { recursive: true, force: true });
  }

  public async listDatabases(): Promise<string[]> {
    await this.init();
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  public async tableExists(dbName: string, tableName: string): Promise<boolean> {
    const schemaPath = this.getSchemaFilePath(dbName, tableName);
    const dataPath = this.getDataFilePath(dbName, tableName);
    const [hasSchema, hasData] = await Promise.all([
      this.exists(schemaPath),
      this.exists(dataPath)
    ]);
    return hasSchema && hasData;
  }

  public async createTable(
    dbName: string,
    tableName: string,
    columns: ColumnDefinition[]
  ): Promise<TableSchema> {
    if (!(await this.databaseExists(dbName))) {
      throw new Error(`Database "${dbName}" does not exist`);
    }

    if (await this.tableExists(dbName, tableName)) {
      throw new Error(`Table "${tableName}" already exists in database "${dbName}"`);
    }

    if (columns.length === 0) {
      throw new Error(`Table "${tableName}" must have at least one column`);
    }

    const safeTable = this.sanitizeIdentifier(tableName);
    const now = new Date().toISOString();

    const schema: TableSchema = {
      tableName: safeTable,
      createdAt: now,
      updatedAt: now,
      autoIncrementSequence: 0,
      columns
    };

    const data: TableData = {
      tableName: safeTable,
      rows: []
    };

    await Promise.all([
      this.writeJsonAtomic(this.getSchemaFilePath(dbName, safeTable), schema),
      this.writeJsonAtomic(this.getDataFilePath(dbName, safeTable), data)
    ]);

    return schema;
  }

  public async dropTable(dbName: string, tableName: string): Promise<void> {
    if (!(await this.tableExists(dbName, tableName))) {
      throw new Error(`Table "${tableName}" does not exist in database "${dbName}"`);
    }

    await Promise.all([
      fs.unlink(this.getSchemaFilePath(dbName, tableName)),
      fs.unlink(this.getDataFilePath(dbName, tableName))
    ]);
  }

  public async listTables(dbName: string): Promise<string[]> {
    if (!(await this.databaseExists(dbName))) {
      throw new Error(`Database "${dbName}" does not exist`);
    }

    const dbPath = this.getDatabasePath(dbName);
    const files = await fs.readdir(dbPath);
    const suffix = '.schema.json';

    return files
      .filter((file) => file.endsWith(suffix))
      .map((file) => file.slice(0, -suffix.length));
  }

  public async readSchema(dbName: string, tableName: string): Promise<TableSchema> {
    const schemaPath = this.getSchemaFilePath(dbName, tableName);

    if (!(await this.exists(schemaPath))) {
      throw new Error(`Schema for table "${tableName}" not found in "${dbName}"`);
    }

    const raw = await fs.readFile(schemaPath, 'utf-8');
    return JSON.parse(raw) as TableSchema;
  }

  public async writeSchema(dbName: string, schema: TableSchema): Promise<void> {
    schema.updatedAt = new Date().toISOString();
    const schemaPath = this.getSchemaFilePath(dbName, schema.tableName);
    await this.writeJsonAtomic(schemaPath, schema);
  }

  public async readRows(dbName: string, tableName: string): Promise<TableRow[]> {
    const dataPath = this.getDataFilePath(dbName, tableName);

    if (!(await this.exists(dataPath))) {
      throw new Error(`Data file for table "${tableName}" not found in "${dbName}"`);
    }

    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw) as TableData;
    return parsed.rows;
  }

  public async writeRows(
    dbName: string,
    tableName: string,
    rows: TableRow[]
  ): Promise<void> {
    const safeTable = this.sanitizeIdentifier(tableName);
    const dataPath = this.getDataFilePath(dbName, safeTable);
    const payload: TableData = {
      tableName: safeTable,
      rows
    };
    await this.writeJsonAtomic(dataPath, payload);
  }
}