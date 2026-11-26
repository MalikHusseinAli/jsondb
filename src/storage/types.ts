import type { WhereExpression } from '../parser/ast';

export const COLUMN_DATA_TYPES = [
  'INT',
  'FLOAT',
  'STRING',
  'BOOLEAN',
  'DATE'
] as const;

export type ColumnDataType = (typeof COLUMN_DATA_TYPES)[number];

export type CellValue = string | number | boolean | null;

export interface ColumnDefinition {
  name: string;
  type: ColumnDataType;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  nullable?: boolean;
  defaultValue?: CellValue;
  unique?: boolean;
  check?: WhereExpression;
}

export function validateColumnValue(
  column: ColumnDefinition,
  value: CellValue,
  context: 'value' | 'default' = 'value'
): void {
  if (value === null) {
    if (column.nullable !== true || column.primaryKey) {
      if (context === 'default') {
        throw new Error(`Default value for column "${column.name}" cannot be NULL`);
      }
      throw new Error(`Column "${column.name}" cannot be null`);
    }
    return;
  }

  const valid =
    (column.type === 'INT' && typeof value === 'number' && Number.isInteger(value)) ||
    (column.type === 'FLOAT' && typeof value === 'number') ||
    ((column.type === 'STRING' || column.type === 'DATE') && typeof value === 'string') ||
    (column.type === 'BOOLEAN' && typeof value === 'boolean');
  if (!valid) {
    if (context === 'default') {
      throw new Error(`Type mismatch on default for column "${column.name}": expected ${column.type}`);
    }
    throw new Error(
      `Type mismatch on column "${column.name}": expected ${column.type}, got ${typeof value}`
    );
  }
}

export type TableConstraint =
  | { type: 'UNIQUE'; columns: string[] }
  | { type: 'CHECK'; expression: WhereExpression };

export interface TableSchema {
  tableName: string;
  createdAt: string;
  updatedAt: string;
  autoIncrementSequence: number;
  columns: ColumnDefinition[];
  constraints?: TableConstraint[];
}

export type TableRow = Record<string, CellValue>;

export interface TableData {
  tableName: string;
  rows: TableRow[];
}