import Decimal from 'decimal.js';
import { businessDate } from './dates';
import { isActor, isDate, isId, isInstant, isRecord, isText } from './validation';
import { applyPurchasing, syncPending } from './purchases';
import { DomainError, type DemoState, type StockItem, type Unit, type PurchaseUnit, type Request, type MovementKind, type Actor, type PhysicalCount } from './model';

const fail = (code: string, message: string): never => { throw new DomainError(code, message); };
export const decimal = (value: string | number) => new Decimal(value);
const MAX_QUANTITY = '999999999.999';
export function validateQuantity(raw: string, unit: Unit, allowZero = true): string {
  if (typeof raw !== 'string' || raw.length > 32 || !['g', 'ml', 'pzas'].includes(unit) || !/^\d+(\.\d{1,3})?$/.test(raw)) return fail('QUANTITY', 'Usa una cantidad positiva con hasta tres decimales, sin separadores de miles.');
  const value = decimal(raw);
  if (unit === 'pzas' && !value.isInteger()) return fail('QUANTITY', 'Las piezas deben ser enteras.');
  if ((!allowZero && value.isZero()) || value.gt(MAX_QUANTITY)) return fail('QUANTITY', 'La cantidad debe ser mayor que cero y estar dentro del límite de la demo.');
  return value.toFixed();
}
export function convertPresentation(amount: string, from: PurchaseUnit, to: Unit): string {
  const compatible = to === 'g' ? ['g', 'kg'] : to === 'ml' ? ['ml', 'l'] : ['pzas'];
  if (!compatible.includes(from)) return fail('UNIT', 'La unidad de compra y la unidad del inventario deben ser de la misma magnitud.');
  const value = decimal(validateQuantity(amount, from === 'kg' ? 'g' : from === 'l' ? 'ml' : from, false)).times(from === 'kg' || from === 'l' ? 1000 : 1);
  return validateQuantity(value.toFixed(), to, false);
}
export function validatePrice(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 32 || !/^\d+(\.\d{1,2})?$/.test(raw) || decimal(raw).gt('9999999.99')) return fail('PRICE', 'El precio debe ser un importe no negativo, con hasta dos decimales.');
  return decimal(raw).toFixed(2);
}
export function stockOf(state: DemoState, itemId: string): string {
  return state.movements.filter(m => m.itemId === itemId).reduce((sum, m) => sum.plus(m.quantity), decimal(0)).toFixed();
}
export function lastSequence(state: DemoState, itemId: string): number { return state.movements.filter(m => m.itemId === itemId).reduce((max, m) => Math.max(max, m.sequence), 0); }
export function countHasChanges(state: DemoState, count: PhysicalCount): boolean { return count.lines.some(l => lastSequence(state, l.itemId) !== (l.reviewSequence ?? l.initialSequence)); }
export function itemOf(state: DemoState, id: string, active = true): StockItem { const item = state.items.find(i => i.id === id); if (!item) return fail('ITEM', 'No encontramos este insumo.'); if (active && !item.active) return fail('ARCHIVED', 'Restaura el insumo archivado antes de registrar nuevas operaciones.'); return item; }
function text(value: string, label: string, required = false, maximum = 500): string { if (!isText(value, maximum, required)) return fail('TEXT', `${label}: completa el campo y respeta el máximo de ${maximum} caracteres.`); return value.trim(); }
function date(value: string): string { if (!isDate(value)) return fail('DATE', 'Selecciona una fecha válida.'); return value; }
function admin(actor: Actor) { if (actor.role !== 'admin') fail('ROLE', 'Esta acción está disponible para el administrador en la demo.'); }
function countOf(state: DemoState, id: string): PhysicalCount { const count = state.counts.find(c => c.id === id); if (!count) return fail('COUNT', 'No encontramos este conteo.'); if (count.status !== 'open') return fail('COUNT_CLOSED', 'Este conteo ya está cerrado; sus ajustes no se aplicarán otra vez.'); return count; }
function audit(state: DemoState, request: Request, action: string, reference: string, description: string) { state.audit.push({ id: request.id, createdAt: request.now, actor: request.actor, action, reference, description }); }
export function appendOperation(state: DemoState, request: Request, kind: MovementKind, occurredOn: string, reason: string, notes: string, lines: { itemId: string; quantity: string; reversedMovementId?: string; kind?: MovementKind }[], reference?: string, reversesOperationId?: string) {
  const grouped = new Map<string, Decimal>(); for (const line of lines) grouped.set(line.itemId, (grouped.get(line.itemId) || decimal(0)).plus(line.quantity));
  for (const [id, delta] of grouped) { const resulting = decimal(stockOf(state, id)).plus(delta); if (resulting.isNegative()) fail('NEGATIVE', 'La operación dejaría existencias negativas.'); validateQuantity(resulting.toFixed(), itemOf(state, id, false).unit); }
  const folio = `OP-${String(state.operations.length + 1).padStart(4, '0')}`;
  state.operations.push({ id: request.id, folio, kind, occurredOn, createdAt: request.now, actor: request.actor, reason, notes, reversesOperationId });
  lines.forEach((line, index) => { state.sequence++; state.movements.push({ id: `${request.id}:${index}`, operationId: request.id, itemId: line.itemId, quantity: line.quantity, kind: line.kind || kind, occurredOn, createdAt: request.now, sequence: state.sequence, actor: request.actor, reason, reference: reference || folio, reversedMovementId: line.reversedMovementId }); });
  audit(state, request, kind, reference || folio, reason || 'Operación de inventario');
}

export function applyCommand(current: DemoState, request: Request): DemoState {
  if (!isRecord(request) || !isId(request.id) || !isId(request.generation) || !Number.isSafeInteger(request.revision) || request.revision < 0 || !isInstant(request.now) || !isActor(request.actor) || !isRecord(request.command) || typeof request.command.type !== 'string') return fail('REQUEST', 'La operación no tiene una referencia o responsable válido.');
  const candidate = request.command;
  if ((candidate.type === 'item.save' && (!isRecord(candidate.item) || !Array.isArray(candidate.item.presentations) || candidate.item.presentations.some(p => !isRecord(p)))) || (candidate.type === 'supplier.save' && !isRecord(candidate.supplier)) || (candidate.type === 'order.save' && (!isRecord(candidate.order) || !Array.isArray(candidate.order.lines) || candidate.order.lines.some(l => !isRecord(l)))) || ((candidate.type === 'movement.record' || candidate.type === 'receipt.record' || candidate.type === 'receipt.correct') && (!Array.isArray(candidate.lines) || candidate.lines.some(l => !isRecord(l))))) return fail('REQUEST', 'La captura no tiene un formato válido.');
  // Consultar idempotencia antes de la revisión permite recuperar un resultado ya guardado.
  if (current.generation !== request.generation) return fail('CONFLICT', 'La demo fue restablecida. Abre de nuevo el formulario antes de confirmar.');
  if (current.applied.includes(request.id)) return current;
  if (current.revision !== request.revision) return fail('CONFLICT', 'Los datos cambiaron en otra operación o pestaña. Tu captura se conserva: revisa las existencias actualizadas antes de volver a confirmar.');
  const state = structuredClone(current); const command = request.command;
  if (command.type === 'supplier.save' || command.type === 'supplier.archive' || command.type === 'order.save' || command.type === 'order.send' || command.type === 'order.close' || command.type === 'receipt.record' || command.type === 'receipt.correct') {
    applyPurchasing(state, request);
  } else if (command.type === 'item.save') {
    admin(request.actor); const input = command.item; const existing = input.id ? itemOf(state, input.id, false) : null;
    const code = text(input.code, 'Código', true, 30).toUpperCase();
    if (state.items.some(i => i.id !== input.id && i.code.toUpperCase() === code)) return fail('CODE', 'Este código ya existe, incluso si el insumo está archivado.');
    if (!['g', 'ml', 'pzas'].includes(input.unit)) return fail('UNIT', 'Selecciona gramo, mililitro o pieza como unidad base.');
    if (existing && existing.unit !== input.unit && (state.movements.some(m => m.itemId === existing.id) || state.counts.some(c => c.lines.some(l => l.itemId === existing.id)) || state.orders.some(o => o.lines.some(l => l.itemId === existing.id)))) return fail('UNIT_LOCKED', 'La unidad base no puede cambiar después de registrar movimientos, conteos o compras.');
    const minimum = validateQuantity(input.minimum, input.unit); const target = validateQuantity(input.target, input.unit);
    if (decimal(target).lt(minimum)) return fail('TARGET', 'La existencia objetivo debe ser igual o mayor al mínimo.');
    if (!Array.isArray(input.presentations) || !input.presentations.length || input.presentations.length > 20) return fail('PRESENTATION', 'Agrega al menos una presentación de compra, hasta un máximo de 20.');
    const presentations = input.presentations.map((p, index) => ({ id: existing?.presentations.some(old => old.id === p.id) ? p.id! : `${request.id}:presentation:${index}`, name: text(p.name, 'Presentación', true, 100), content: convertPresentation(p.amount, p.unit, input.unit), supplier: text(p.supplier, 'Proveedor', true, 100), price: validatePrice(p.price) }));
    if (new Set(presentations.map(p => p.id)).size !== presentations.length) return fail('PRESENTATION', 'Las presentaciones deben tener referencias distintas.');
    for (const p of presentations) if (!state.suppliers.some(s => s.name === p.supplier && (s.active || existing?.presentations.some(old => old.id === p.id && old.supplier === s.name)))) return fail('SUPPLIER', 'Selecciona un proveedor activo para cada presentación nueva.');
    const item: StockItem = { id: existing?.id || request.id, code, name: text(input.name, 'Nombre', true, 100), category: text(input.category, 'Categoría', true, 60), unit: input.unit, minimum, target, location: text(input.location, 'Ubicación', false, 100), notes: text(input.notes, 'Notas'), active: existing?.active ?? true, tone: existing?.tone || 'wheat', presentations };
    if (existing) state.items[state.items.findIndex(i => i.id === existing.id)] = item; else state.items.push(item);
    if (!state.categories.includes(item.category)) state.categories.push(item.category);
    audit(state, request, existing ? 'Editar insumo' : 'Crear insumo', code, item.name);
    const event = state.audit.at(-1)!; event.before = existing ? structuredClone(existing) : undefined; event.after = structuredClone(item);
  } else if (command.type === 'item.archive') {
    admin(request.actor); const item = itemOf(state, command.itemId, false);
    if (!command.active && state.openPurchases.some(o => o.itemId === item.id && decimal(o.pending).gt(0))) return fail('PENDING_PURCHASE', 'Este insumo tiene una compra pendiente. Podrás archivarlo después de recibir o cerrar su saldo.');
    if (typeof command.active !== 'boolean') return fail('REQUEST', 'Selecciona un estado válido para el insumo.');
    item.active = command.active; audit(state, request, command.active ? 'Restaurar insumo' : 'Archivar insumo', item.code, item.name);
  } else if (command.type === 'movement.record') {
    if (command.kind === 'initial') admin(request.actor);
    if (!['initial', 'consumption', 'waste'].includes(command.kind)) return fail('MOVEMENT', 'Tipo de movimiento manual no permitido.');
    if (!Array.isArray(command.lines) || !command.lines.length || command.lines.length > 100) return fail('LINES', 'Agrega entre 1 y 100 partidas.');
    const grouped = new Map<string, Decimal>();
    for (const line of command.lines) { const item = itemOf(state, line.itemId); const value = decimal(validateQuantity(line.quantity, item.unit, false)); grouped.set(item.id, (grouped.get(item.id) || decimal(0)).plus(value)); }
    const lines = [...grouped].map(([itemId, amount]) => { const item = itemOf(state, itemId); validateQuantity(amount.toFixed(), item.unit, false); const delta = command.kind === 'initial' ? amount : amount.negated(); if (decimal(stockOf(state, itemId)).plus(delta).lt(0)) return fail('NEGATIVE_STOCK', `${item.name}: la salida total supera la existencia disponible (${stockOf(state, itemId)} ${item.unit}).`); return { itemId, quantity: delta.toFixed() }; });
    appendOperation(state, request, command.kind, date(command.occurredOn), text(command.reason, 'Motivo', command.kind === 'waste'), text(command.notes, 'Observaciones'), lines);
  } else if (command.type === 'operation.reverse') {
    admin(request.actor); const original = state.operations.find(o => o.id === command.operationId);
    if (!original) return fail('OPERATION', 'No encontramos la operación original.');
    if (original.kind === 'reversal') return fail('REVERSAL', 'Una reversión no puede revertirse de nuevo. Registra una operación nueva con su motivo.');
    if (original.kind === 'purchase') return fail('PURCHASE_CORRECTION', 'Las entradas de compra se corrigen desde su comprobante de recepción.');
    if (state.operations.some(o => o.reversesOperationId === original.id)) return fail('ALREADY_REVERSED', 'La operación ya fue revertida. El original y su corrección se conservan.');
    const lines = state.movements.filter(m => m.operationId === original.id).map(m => ({ itemId: m.itemId, quantity: decimal(m.quantity).negated().toFixed(), reversedMovementId: m.id }));
    for (const line of lines) { const item = itemOf(state, line.itemId); if (decimal(stockOf(state, item.id)).plus(line.quantity).lt(0)) return fail('NEGATIVE_STOCK', `${item.name}: revertir esta entrada produciría existencias negativas.`); }
    if (!lines.length) return fail('REVERSAL', 'Esta operación no generó cambios de existencia.');
    appendOperation(state, request, 'reversal', businessDate(request.now), text(command.reason, 'Motivo de reversión', true), '', lines, original.folio, original.id);
  } else if (command.type === 'count.start') {
    if (!Array.isArray(command.itemIds) || !command.itemIds.length || command.itemIds.length > 1000 || new Set(command.itemIds).size !== command.itemIds.length) return fail('COUNT_ITEMS', 'Selecciona hasta 1000 insumos distintos para iniciar el conteo.');
    const lines = command.itemIds.map(id => { itemOf(state, id); return { itemId: id, initialStock: stockOf(state, id), initialSequence: lastSequence(state, id), counted: null, reviewStock: null, reviewSequence: null }; });
    const count: PhysicalCount = { id: request.id, folio: `CF-${String(state.counts.length + 1).padStart(4, '0')}`, title: text(command.title, 'Nombre del conteo', true, 100), createdAt: request.now, actor: request.actor, status: 'open', reason: '', lines, reviewedAt: null, confirmedAt: null, operationId: null };
    state.counts.push(count); audit(state, request, 'Iniciar conteo', count.folio, count.title);
  } else if (command.type === 'count.capture') {
    const count = countOf(state, command.countId);
    if (!isRecord(command.values)) return fail('COUNT_ITEMS', 'La captura del conteo no tiene un formato válido.');
    if (Object.keys(command.values).some(id => !count.lines.some(l => l.itemId === id))) return fail('COUNT_ITEMS', 'La captura incluye insumos que no pertenecen al conteo.');
    for (const line of count.lines) { const item = itemOf(state, line.itemId); const raw = command.values[line.itemId]; if (raw !== undefined) { if (typeof raw !== 'string') return fail('QUANTITY', 'La cantidad contada debe tener un formato decimal válido.'); line.counted = raw.trim() === '' ? null : validateQuantity(raw, item.unit); } line.reviewStock = null; line.reviewSequence = null; }
    count.reason = text(command.reason, 'Motivo'); count.reviewedAt = null;
    audit(state, request, 'Guardar captura de conteo', count.folio, count.title);
  } else if (command.type === 'count.review') {
    const count = countOf(state, command.countId);
    if (typeof command.acknowledgeChanges !== 'boolean') return fail('REQUEST', 'Confirma explícitamente la revisión de existencias.');
    if (count.lines.some(l => l.counted === null)) return fail('COUNT_INCOMPLETE', 'Captura todas las cantidades contadas antes de revisar diferencias.');
    text(count.reason, 'Motivo del ajuste', true);
    if (countHasChanges(state, count) && !command.acknowledgeChanges) return fail('COUNT_CHANGED', 'Hubo movimientos desde el inicio o la última revisión. Revisa las existencias actuales y marca la confirmación de revisión.');
    for (const line of count.lines) { itemOf(state, line.itemId); line.reviewStock = stockOf(state, line.itemId); line.reviewSequence = lastSequence(state, line.itemId); }
    count.reviewedAt = request.now; audit(state, request, 'Revisar conteo', count.folio, count.title);
  } else if (command.type === 'count.confirm') {
    const count = countOf(state, command.countId);
    if (!count.reviewedAt || count.lines.some(l => l.reviewStock === null || l.counted === null)) return fail('COUNT_NOT_REVIEWED', 'Revisa las diferencias antes de confirmar el conteo.');
    if (countHasChanges(state, count)) return fail('COUNT_CHANGED', 'Hubo nuevos movimientos después de revisar. Revisa otra vez las diferencias antes de aplicar ajustes.');
    const reason = text(count.reason, 'Motivo del ajuste', true);
    const lines = count.lines.map(l => { itemOf(state, l.itemId); return { itemId: l.itemId, quantity: decimal(l.counted!).minus(l.reviewStock!).toFixed() }; }).filter(l => !decimal(l.quantity).isZero());
    appendOperation(state, request, 'adjustment', businessDate(request.now), reason, '', lines, count.folio);
    count.status = 'confirmed'; count.confirmedAt = request.now; count.operationId = request.id;
  } else if (command.type === 'count.cancel') {
    const count = countOf(state, command.countId); count.status = 'cancelled'; count.reason = text(command.reason, 'Motivo de cancelación', true); count.reviewedAt = null; audit(state, request, 'Cancelar conteo', count.folio, count.reason);
  } else { return fail('COMMAND', 'La operación solicitada no está disponible.'); }
  syncPending(state); state.applied.push(request.id); state.revision++;
  return state;
}
