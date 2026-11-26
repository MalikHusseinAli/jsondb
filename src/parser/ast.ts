import { CellValue, ColumnDefinition, TableConstraint } from '../storage/types';

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

export interface BinaryExpression {
  type: 'BINARY';
  column: string;
  operator: ComparisonOperator;
  value: CellValue;
}

export interface InExpression {
  type: 'IN';
  column: string;
  values: CellValue[];
  negate: boolean;
}

export interface LikeExpression {
  type: 'LIKE';
  column: string;
  pattern: string;
  caseInsensitive: boolean;
  negate: boolean;
}

export interface BetweenExpression {
  type: 'BETWEEN';
  column: string;
  low: CellValue;
  high: CellValue;
  negate: boolean;
}

export interface IsNullExpression {
  type: 'IS_NULL';
  column: string;
  negate: boolean;
}

export interface LogicalExpression {
  type: 'AND' | 'OR';
  left: WhereExpression;
  right: WhereExpression;
}

export interface NotExpression {
  type: 'NOT';
  operand: WhereExpression;
}

export interface GroupExpression {
  type: 'GROUP';
  inner: WhereExpression;
}

export type WhereExpression =
  | BinaryExpression
  | InExpression
  | LikeExpression
  | BetweenExpression
  | IsNullExpression
  | LogicalExpression
  | NotExpression
  | GroupExpression;

export interface WhereClause {
  conditions: WhereCondition[];
  connectors: ('AND' | 'OR')[];
  expression?: WhereExpression;
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
  constraints?: TableConstraint[];
}

export interface DropTableStatement {
  type: 'DROP_TABLE';
  tableName: string;
}

export interface TruncateTableStatement {
  type: 'TRUNCATE_TABLE';
  tableName: string;
}

export interface AlterTableAddColumnStatement {
  type: 'ALTER_TABLE';
  tableName: string;
  action: 'ADD_COLUMN';
  column: ColumnDefinition;
}

export interface AlterTableDropColumnStatement {
  type: 'ALTER_TABLE';
  tableName: string;
  action: 'DROP_COLUMN';
  columnName: string;
}

export interface AlterTableRenameColumnStatement {
  type: 'ALTER_TABLE';
  tableName: string;
  action: 'RENAME_COLUMN';
  columnName: string;
  newColumnName: string;
}

export type AlterTableStatement =
  | AlterTableAddColumnStatement
  | AlterTableDropColumnStatement
  | AlterTableRenameColumnStatement;

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
  tableAlias?: string;
  aliases?: Record<string, string>;
  distinct?: boolean;
  where?: WhereClause;
  orderBy?: OrderByClause | OrderByClause[];
  limit?: number;
  offset?: number;
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
  | TruncateTableStatement
  | AlterTableStatement
  | ShowTablesStatement
  | InsertStatement
  | SelectStatement
  | UpdateStatement
  | DeleteStatement;