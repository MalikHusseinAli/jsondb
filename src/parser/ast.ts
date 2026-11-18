import { CellValue, ColumnDefinition } from '../storage/types';

export const COMPARISON_OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<='
] as const;

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export interface WhereCondition {
  column: string;
  operator: ComparisonOperator;
  value: CellValue;
}

export interface WhereClause {
  conditions: WhereCondition[];
  connectors: ('AND' | 'OR')[];
}

export interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface CreateDatabaseStatement {
  type: 'CREATE_DATABASE';
  databaseName: string;
}

export interface DropDatabaseStatement {
  type: 'DROP_DATABASE';
  databaseName: string;
}

export interface ShowDatabasesStatement {
  type: 'SHOW_DATABASES';
}

export interface CreateTableStatement {
  type: 'CREATE_TABLE';
  tableName: string;
  columns: ColumnDefinition[];
}

export interface DropTableStatement {
  type: 'DROP_TABLE';
  tableName: string;
}

export interface ShowTablesStatement {
  type: 'SHOW_TABLES';
}

export interface InsertStatement {
  type: 'INSERT';
  tableName: string;
  columns?: string[];
  values: CellValue[];
}

export interface SelectStatement {
  type: 'SELECT';
  tableName: string;
  columns: string[] | '*';
  where?: WhereClause;
  orderBy?: OrderByClause;
  limit?: number;
}

export interface UpdateStatement {
  type: 'UPDATE';
  tableName: string;
  assignments: Record<string, CellValue>;
  where?: WhereClause;
}

export interface DeleteStatement {
  type: 'DELETE';
  tableName: string;
  where?: WhereClause;
}

export type SqlStatement =
  | CreateDatabaseStatement
  | DropDatabaseStatement
  | ShowDatabasesStatement
  | CreateTableStatement
  | DropTableStatement
  | ShowTablesStatement
  | InsertStatement
  | SelectStatement
  | UpdateStatement
  | DeleteStatement;