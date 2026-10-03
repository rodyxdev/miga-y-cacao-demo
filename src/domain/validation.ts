export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
}
export function isText(value: unknown, maximum = 500, required = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (!required || Boolean(value.trim())) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export const isId = (value: unknown): value is string => isText(value, 200, true) && !['__proto__', 'constructor', 'prototype'].includes(value);
export function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}
export function isActor(value: unknown): boolean {
  return isRecord(value) && typeof value.role === 'string' && ['admin', 'inventory'].includes(value.role) && isText(value.name, 100, true);
}
