import { DomainError, type DemoState } from '../domain/model';
import { decimal, stockOf, validateQuantity, validatePrice } from '../domain/inventory';
import { pendingOf, requestedOf, receivedOf, orderTotals, percent } from '../domain/purchases';
import { assertBaseIntegrity, assertPurchasingIntegrity } from './integrity';

function assertBase(value: unknown): asserts value is DemoState {
  const invalid = () => { throw new DomainError('CORRUPT', 'Los datos locales no tienen un formato válido. Se conservaron sin sobrescribirlos. Puedes restablecer la demo con confirmación.'); };
  if (!value || typeof value !== 'object') return invalid();
  const state = value as DemoState;
  if (![1,2].includes(Number(state.schemaVersion))) throw new DomainError('VERSION', 'Esta versión de los datos locales no es compatible. No se ha modificado ni restablecido automáticamente.');
  if (state.seedVersion !== 1 || typeof state.generation !== 'string' || !state.generation || !Number.isInteger(state.revision) || state.revision < 0 || !Number.isInteger(state.sequence) || state.sequence < 0 || !Number.isFinite(Date.parse(state.seededAt))) return invalid();
  for (const key of ['items', 'operations', 'movements', 'counts', 'categories', 'audit', 'applied', 'openPurchases'] as const) if (!Array.isArray(state[key])) return invalid();
  try {
    assertBaseIntegrity(state);
    if (new Set(state.items.map(i => i.id)).size !== state.items.length || new Set(state.items.map(i => i.code.toUpperCase())).size !== state.items.length || new Set(state.movements.map(m => m.id)).size !== state.movements.length || new Set(state.operations.map(o => o.id)).size !== state.operations.length) return invalid();
    if (!state.categories.every(c => typeof c === 'string' && c.trim()) || !state.applied.every(id => typeof id === 'string')) return invalid();
    for (const item of state.items) {
      if (!item.id || !item.name || !item.code || typeof item.active !== 'boolean' || !['g', 'ml', 'pzas'].includes(item.unit) || !['wheat', 'cream', 'cocoa', 'green', 'pink'].includes(item.tone) || !state.categories.includes(item.category) || typeof item.notes !== 'string' || typeof item.location !== 'string' || !Array.isArray(item.presentations) || !item.presentations.length) return invalid();
      validateQuantity(item.minimum, item.unit); validateQuantity(item.target, item.unit);
      if (decimal(item.target).lt(item.minimum)) return invalid();
      if (new Set(item.presentations.map(p => p.id)).size !== item.presentations.length) return invalid();
      for (const p of item.presentations) { if (!p.id || !p.name || !p.supplier) return invalid(); validateQuantity(p.content, item.unit, false); validatePrice(p.price); }
    }
    const operationIds = new Set(state.operations.map(o => o.id)); const movementIds = new Set(state.movements.map(m => m.id)); const itemIds = new Set(state.items.map(i => i.id));
    for (const operation of state.operations) if (!operation.folio || !['initial', 'purchase', 'consumption', 'waste', 'adjustment', 'reversal'].includes(operation.kind) || !['admin', 'inventory'].includes(operation.actor.role) || !operation.actor.name || !Number.isFinite(Date.parse(operation.createdAt))) return invalid();
    let sequence = 0;
    for (const movement of state.movements) {
      const item = state.items.find(i => i.id === movement.itemId);
      if (!item || !operationIds.has(movement.operationId) || !['initial', 'purchase', 'consumption', 'waste', 'adjustment', 'reversal'].includes(movement.kind) || !Number.isInteger(movement.sequence) || movement.sequence <= sequence || movement.sequence > state.sequence || !Number.isFinite(Date.parse(movement.createdAt)) || !movement.actor.name || !['admin', 'inventory'].includes(movement.actor.role) || typeof movement.reason !== 'string' || typeof movement.reference !== 'string') return invalid();
      validateQuantity(decimal(movement.quantity).abs().toFixed(), item.unit);
      if (movement.reversedMovementId && !movementIds.has(movement.reversedMovementId)) return invalid();
      sequence = movement.sequence;
    }
    for (const item of state.items) validateQuantity(stockOf(state, item.id), item.unit);
    if (new Set(state.counts.map(c => c.id)).size !== state.counts.length) return invalid();
    for (const count of state.counts) {
      if (!count.id || !count.folio || !count.title || !['open', 'confirmed', 'cancelled'].includes(count.status) || !Array.isArray(count.lines) || !count.lines.length || new Set(count.lines.map(l => l.itemId)).size !== count.lines.length || typeof count.reason !== 'string' || !Number.isFinite(Date.parse(count.createdAt))) return invalid();
      for (const line of count.lines) { const item = state.items.find(i => i.id === line.itemId); if (!item || !Number.isInteger(line.initialSequence)) return invalid(); validateQuantity(line.initialStock, item.unit); if (line.counted !== null) validateQuantity(line.counted, item.unit); if (line.reviewStock !== null) validateQuantity(line.reviewStock, item.unit); if (line.reviewSequence !== null && !Number.isInteger(line.reviewSequence)) return invalid(); }
      if (count.operationId && !operationIds.has(count.operationId)) return invalid();
    }
    for (const order of state.openPurchases) { const item = state.items.find(i => i.id === order.itemId); if (!item || !order.folio) return invalid(); validateQuantity(order.pending, item.unit); }
    for (const event of state.audit) if (!event.id || !event.action || !event.reference || typeof event.description !== 'string' || !Number.isFinite(Date.parse(event.createdAt)) || !['admin', 'inventory'].includes(event.actor.role)) return invalid();
  } catch (error) { if (error instanceof DomainError && error.code === 'CORRUPT') throw error; return invalid(); }
}

export function assertLegacy(value: unknown): asserts value is DemoState { assertBase(value); if (Number(value.schemaVersion) !== 1) throw new DomainError('VERSION', 'No es una versión anterior compatible.'); }
export function assertState(value: unknown): asserts value is DemoState {
  assertBase(value); const state = value;
  const invalid = (): never => { throw new DomainError('CORRUPT', 'Los registros de compras no tienen un formato coherente. Se conservaron sin sobrescribirlos.'); };
  if (state.schemaVersion !== 2) throw new DomainError('VERSION', 'La versión necesita una actualización antes de guardar.');
  try {
    for (const key of ['suppliers','orders','receipts'] as const) if (!Array.isArray(state[key])) invalid();
    assertPurchasingIntegrity(state);
    for (const collection of [state.suppliers,state.orders,state.receipts]) if (new Set(collection.map(i => i.id)).size !== collection.length) invalid();
    if (new Set(state.suppliers.map(s => s.name.toLocaleLowerCase('es-MX'))).size !== state.suppliers.length || new Set(state.orders.map(o => o.folio)).size !== state.orders.length || new Set(state.receipts.map(r => r.folio)).size !== state.receipts.length) invalid();
    for (const supplier of state.suppliers) if (!supplier.id || !supplier.name || typeof supplier.active !== 'boolean' || !['contact','email','phone','notes'].every(k => typeof supplier[k as 'contact'] === 'string')) invalid();
    const lineIds = new Set<string>();
    for (const order of state.orders) {
      if (!order.id || !order.folio || !state.suppliers.some(s => s.id === order.supplierId) || !order.supplier.name || !['draft','sent','partial','received','closed','cancelled'].includes(order.status) || !Array.isArray(order.lines) || !order.lines.length || !Array.isArray(order.events) || !Number.isFinite(Date.parse(order.createdAt))) invalid();
      validatePrice(order.shipping); percent(order.shippingTax);
      if (order.expectedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(order.expectedOn) || !Number.isFinite(Date.parse(`${order.expectedOn}T12:00:00Z`)))) invalid();
      for (const line of order.lines) {
        const item = state.items.find(i => i.id === line.itemId); if (!item || !line.id || lineIds.has(line.id) || item.unit !== line.unit || !line.name || !line.presentation || !line.code) invalid(); lineIds.add(line.id);
        validateQuantity(line.content,line.unit,false); validateQuantity(line.quantity,'pzas',false); validatePrice(line.price); percent(line.discount); percent(line.tax); validateQuantity(line.closed,line.unit);
        const received = receivedOf(state,order.id,line.id); validateQuantity(received.toFixed(),line.unit); if (pendingOf(state,order,line).isNegative()) invalid();
        if (['closed','cancelled'].includes(order.status) && !pendingOf(state,order,line).isZero()) invalid();
        if (order.status === 'draft' && (!received.isZero() || !decimal(line.closed).isZero())) invalid();
      }
      if (orderTotals(order).total.gt('999999999.99')) invalid();
      for (const e of order.events) if (!e.id || !e.action || !Number.isFinite(Date.parse(e.createdAt)) || typeof e.reason !== 'string') invalid();
      if (order.status === 'received' && order.lines.some(l => !receivedOf(state,order.id,l.id).eq(requestedOf(l)))) invalid();
    }
    for (const receipt of state.receipts) {
      const order = state.orders.find(o => o.id === receipt.orderId); if (!order || !state.operations.some(o => o.id === receipt.operationId && o.kind === 'purchase') || !Array.isArray(receipt.lines) || new Set(receipt.lines.map(l => l.lineId)).size !== receipt.lines.length || !Number.isFinite(Date.parse(receipt.createdAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.occurredOn)) invalid();
      if (!/^\d+(\.\d{1,2})?$/.test(receipt.bookedTotal) || decimal(receipt.bookedTotal).isNegative() || decimal(receipt.bookedTotal).gt('999999999.99')) invalid();
      for (const line of receipt.lines) { const original = order!.lines.find(l => l.id === line.lineId); if (!original) invalid(); validateQuantity(line.quantity,original!.unit); }
      if (receipt.replacedBy && !state.receipts.some(r => r.id === receipt.replacedBy && r.replacesId === receipt.id && r.orderId === receipt.orderId)) invalid();
      if (receipt.replacesId && !state.receipts.some(r => r.id === receipt.replacesId && r.replacedBy === receipt.id && r.orderId === receipt.orderId)) invalid();
      const quantities = new Map<string,string>(); for (const l of receipt.lines) { const id = order!.lines.find(line => line.id === l.lineId)!.itemId; quantities.set(id,decimal(quantities.get(id) || 0).plus(l.quantity).toFixed()); }
      for (const [id, amount] of quantities) { const total = state.movements.filter(m => m.operationId === receipt.operationId && m.itemId === id && m.kind === 'purchase').reduce((sum,m) => sum.plus(m.quantity),decimal(0)); if (!total.eq(amount)) invalid(); }
    }
  } catch (error) { if (error instanceof DomainError && error.code === 'CORRUPT') throw error; invalid(); }
}
