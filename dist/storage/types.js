"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLUMN_DATA_TYPES = void 0;
exports.validateColumnValue = validateColumnValue;
exports.COLUMN_DATA_TYPES = [
    'INT',
    'FLOAT',
    'STRING',
    'BOOLEAN',
    'DATE'
];
function validateColumnValue(column, value, context = 'value') {
    if (value === null) {
        if (column.nullable !== true || column.primaryKey) {
            if (context === 'default') {
                throw new Error(`Default value for column "${column.name}" cannot be NULL`);
            }
            throw new Error(`Column "${column.name}" cannot be null`);
        }
        return;
    }
    const valid = (column.type === 'INT' && typeof value === 'number' && Number.isInteger(value)) ||
        (column.type === 'FLOAT' && typeof value === 'number') ||
        ((column.type === 'STRING' || column.type === 'DATE') && typeof value === 'string') ||
        (column.type === 'BOOLEAN' && typeof value === 'boolean');
    if (!valid) {
        if (context === 'default') {
            throw new Error(`Type mismatch on default for column "${column.name}": expected ${column.type}`);
        }
        throw new Error(`Type mismatch on column "${column.name}": expected ${column.type}, got ${typeof value}`);
    }
}
