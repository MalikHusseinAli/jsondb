export type ColumnDataType = 'INT' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'DATE';

export type CellValue = string | number | boolean | null;

export interface ColumnDefinition {
  name: string;
  type: ColumnDataType;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  nullable?: boolean;
  defaultValue?: CellValue;
}

export interface TableSchema {
  tableName: string;
  createdAt: string;
  updatedAt: string;
  autoIncrementSequence: number;
  columns: ColumnDefinition[];
}

export type TableRow = Record<string, CellValue>;

export interface TableData {
  tableName: string;
  rows: TableRow[];
}