import { FifoQueue, QueueResult } from '../queue/fifoQueue';
import { JsonStorage } from '../storage/jsonStorage';
import { SqlParser } from '../parser/sqlParser';
import { SqlExecutor } from './executor';

export class DatabaseEngine {
  private queue: FifoQueue;
  private storage: JsonStorage;
  private parser: SqlParser;
  private executor: SqlExecutor;
  private currentDatabase: string | null = null;

  constructor(baseDir?: string) {
    this.queue = new FifoQueue();
    this.storage = new JsonStorage(baseDir);
    this.parser = new SqlParser();
    this.executor = new SqlExecutor(this.storage);
  }

  public async query(sql: string, metadata: Record<string, unknown> = {}): Promise<QueueResult<unknown>> {
    return this.queue.enqueue(async () => {
      const trimmed = sql.trim();
      const upper = trimmed.toUpperCase();

      // Handle USE <database> locally in engine session
      if (upper.startsWith('USE ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) {
          throw new Error('Invalid USE statement syntax. Use: USE <database_name>');
        }
        const dbName = parts[1].replace(/;$/, '').toLowerCase();
        if (!(await this.storage.databaseExists(dbName))) {
          throw new Error(`Database "${dbName}" does not exist`);
        }
        this.currentDatabase = dbName;
        return { message: `Database changed to "${dbName}"` };
      }

      const statement = this.parser.parse(sql);

      // Global statements that don't need a current database context
      if (statement.type === 'CREATE_DATABASE' || statement.type === 'DROP_DATABASE' || statement.type === 'SHOW_DATABASES') {
        return await this.executor.execute(statement);
      }

      // Database-scoped statements
      if (!this.currentDatabase) {
        throw new Error('No database selected. Use "USE <database>;" before executing table queries.');
      }

      return await this.executor.executeInContext(this.currentDatabase, statement);
    }, metadata);
  }

  public getCurrentDatabase(): string | null {
    return this.currentDatabase;
  }
}