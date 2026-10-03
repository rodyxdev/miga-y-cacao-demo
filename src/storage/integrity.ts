import { DomainError, type DemoState, type StockItem } from '../domain/model';
import { isActor, isDate, isId, isInstant, isRecord, isText } from '../domain/validation';
import { decimal, validateQuantity } from '../domain/inventory';
import { pendingOf, receivedOf, requestedOf } from '../domain/purchases';

const corrupt = (): never => { throw new DomainError('CORRUPT', 'Los datos locales no tienen un formato válido o contienen registros incoherentes. Se conservaron sin sobrescribirlos.'); };
const safeSequence = (value: unknown, maximum: number) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const sameActor = (a: DemoState['operations'][number]['actor'], b: typeof a) => a.role === b.role && a.name === b.name;
function itemMetadata(item: StockItem) {
  if (!isRecord(item) || !isId(item.id) || !isText(item.name, 100, true) || !isText(item.code, 30, true) || !isText(item.category, 60, true) || !isText(item.location, 100) || !isText(item.notes) || !Array.isArray(item.presentations) || !item.presentations.length || item.presentations.length > 20) corrupt();
  for (const p of item.presentations) if (!isRecord(p) || !isId(p.id) || !isText(p.name, 100, true) || !isText(p.supplier, 100, true)) corrupt();
}

export function assertBaseIntegrity(state: DemoState) {
  if (!isId(state.generation) || !isInstant(state.seededAt) || !Number.isSafeInteger(state.revision) || !Number.isSafeInteger(state.sequence)) corrupt();
  for (const item of state.items) itemMetadata(item);
  if (!state.categories.every(c => isText(c, 60, true)) || !state.applied.every(isId) || new Set(state.applied).size !== state.applied.length) corrupt();
  for (const operation of state.operations) if (!isRecord(operation) || !isId(operation.id) || !isText(operation.folio, 30, true) || !isActor(operation.actor) || !isInstant(operation.createdAt) || !isDate(operation.occurredOn) || !isText(operation.reason) || !isText(operation.notes) || (operation.reversesOperationId !== undefined && !isId(operation.reversesOperationId))) corrupt();
  if (new Set(state.operations.map(o => o.folio)).size !== state.operations.length) corrupt();
  for (const operation of state.operations) if ((['waste', 'reversal'].includes(operation.kind) && !isText(operation.reason, 500, true)) || (['initial', 'reversal'].includes(operation.kind) && operation.actor.role !== 'admin')) corrupt();
  const operations = new Map(state.operations.map((o, index) => [o.id, { operation: o, index }]));
  const movements = new Map(state.movements.map(m => [m?.id, m]));
  const reversed = new Set<string>();
  const deltas = new Map<string, Map<string, string>>();
  for (const m of state.movements) {
    if (!isRecord(m) || !isId(m.id) || !isId(m.itemId) || !isId(m.operationId) || !isActor(m.actor) || !isDate(m.occurredOn) || !isInstant(m.createdAt) || !isText(m.reason) || !isText(m.reference, 200) || !safeSequence(m.sequence, state.sequence) || typeof m.quantity !== 'string' || m.quantity.length > 33 || !/^-?\d+(\.\d{1,3})?$/.test(m.quantity)) corrupt();
    const parent = operations.get(m.operationId)?.operation; if (!parent) corrupt();
    if (m.createdAt !== parent!.createdAt || m.occurredOn !== parent!.occurredOn || !sameActor(m.actor, parent!.actor) || m.reason !== parent!.reason) corrupt();
    if (m.kind !== parent!.kind && !(parent!.kind === 'purchase' && m.kind === 'reversal')) corrupt();
    const quantity = decimal(m.quantity);
    if (quantity.isZero() || (['initial', 'purchase'].includes(m.kind) && quantity.isNegative()) || (['consumption', 'waste'].includes(m.kind) && !quantity.isNegative())) corrupt();
    if (m.kind === 'reversal') {
      if (!isId(m.reversedMovementId)) corrupt();
      const original = movements.get(m.reversedMovementId!);
      if (!original || original.sequence >= m.sequence || original.itemId !== m.itemId || reversed.has(original.id) || parent!.reversesOperationId !== original.operationId || !quantity.eq(decimal(original.quantity).negated())) corrupt();
      reversed.add(original!.id);
    } else if (m.reversedMovementId !== undefined) corrupt();
    const group = deltas.get(m.operationId) || new Map<string, string>();
    group.set(m.itemId, decimal(group.get(m.itemId) || 0).plus(quantity).toFixed()); deltas.set(m.operationId, group);
  }
  const balances = new Map<string, string>();
  for (const [index, operation] of state.operations.entries()) {
    if (operation.reversesOperationId !== undefined) {
      const original = operations.get(operation.reversesOperationId);
      if (!original || original.index >= index || original.operation.kind === 'reversal' || !['purchase', 'reversal'].includes(operation.kind) || (operation.kind === 'purchase') !== (original.operation.kind === 'purchase')) corrupt();
      const originals = state.movements.filter(m => m.operationId === operation.reversesOperationId && (operation.kind !== 'purchase' || m.kind === 'purchase'));
      const inverses = state.movements.filter(m => m.operationId === operation.id && m.kind === 'reversal');
      if (originals.length !== inverses.length || originals.some(m => !inverses.some(r => r.reversedMovementId === m.id))) corrupt();
    } else if (operation.kind === 'reversal') corrupt();
    // Las correcciones se evalúan por su efecto neto dentro de una operación atómica.
    for (const [itemId, delta] of deltas.get(operation.id) || []) {
      const item = state.items.find(i => i.id === itemId); if (!item) corrupt();
      const balance = decimal(balances.get(itemId) || 0).plus(delta).toFixed(); validateQuantity(balance, item!.unit); balances.set(itemId, balance);
    }
  }
  if (state.sequence !== (state.movements.at(-1)?.sequence || 0)) corrupt();
  if (new Set(state.counts.map(c => c.folio)).size !== state.counts.length) corrupt();
  const confirmed = state.counts.filter(c => c.status === 'confirmed');
  if (new Set(confirmed.map(c => c.operationId)).size !== confirmed.length) corrupt();
  for (const count of state.counts) {
    if (!isRecord(count) || !isId(count.id) || !isText(count.folio, 30, true) || !isText(count.title, 100, true) || !isActor(count.actor) || !isText(count.reason) || !isInstant(count.createdAt) || (count.reviewedAt !== null && !isInstant(count.reviewedAt)) || (count.confirmedAt !== null && !isInstant(count.confirmedAt)) || !Array.isArray(count.lines) || count.lines.length > 1000) corrupt();
    for (const line of count.lines) if (!isRecord(line) || !isId(line.itemId) || !safeSequence(line.initialSequence, state.sequence) || (line.reviewSequence !== null && !safeSequence(line.reviewSequence, state.sequence)) || (line.reviewStock === null) !== (line.reviewSequence === null)) corrupt();
    if (count.status === 'confirmed') {
      if (!isId(count.operationId) || !count.reviewedAt || !count.confirmedAt || !isText(count.reason, 500, true) || operations.get(count.operationId)?.operation.kind !== 'adjustment' || count.lines.some(l => l.counted === null || l.reviewStock === null)) corrupt();
      const adjusted = state.movements.filter(m => m.operationId === count.operationId);
      if (adjusted.some(m => !count.lines.some(l => l.itemId === m.itemId))) corrupt();
      if (!(count.id === 'seed-count' && count.operationId === 'MOV-0082')) {
        for (const line of count.lines) if (!decimal(line.counted!).minus(line.reviewStock!).eq(adjusted.filter(m => m.itemId === line.itemId).reduce((total, m) => total.plus(m.quantity), decimal(0)))) corrupt();
      }
    } else if (count.operationId !== null || count.confirmedAt !== null || (count.status === 'cancelled' && !isText(count.reason, 500, true))) corrupt();
  }
  for (const event of state.audit) {
    if (!isRecord(event) || !isId(event.id) || !isActor(event.actor) || !isInstant(event.createdAt) || !isText(event.action, 100, true) || !isText(event.reference, 200, true) || !isText(event.description)) corrupt();
    if (event.before !== undefined) itemMetadata(event.before); if (event.after !== undefined) itemMetadata(event.after);
  }
  for (const pending of state.openPurchases) if (!isRecord(pending) || !isId(pending.itemId) || !isText(pending.folio, 30, true)) corrupt();
}

export function assertPurchasingIntegrity(state: DemoState) {
  for (const supplier of state.suppliers) if (!isRecord(supplier) || !isId(supplier.id) || !isText(supplier.name, 100, true) || !isText(supplier.contact, 100) || !isText(supplier.email, 150) || (supplier.email && !/^[^\s@]+@[^\s@]+\.example$/i.test(supplier.email)) || !isText(supplier.phone, 60) || !isText(supplier.notes) || !['wheat', 'cream', 'cocoa', 'green', 'pink'].includes(supplier.tone)) corrupt();
  for (const order of state.orders) {
    if (!isRecord(order) || !isId(order.id) || !isId(order.supplierId) || !isText(order.folio, 30, true) || !isInstant(order.createdAt) || !isText(order.notes) || (order.expectedOn !== '' && !isDate(order.expectedOn)) || !isRecord(order.supplier) || !isText(order.supplier.name, 100, true) || !isText(order.supplier.contact, 100) || !isText(order.supplier.email, 150) || !isText(order.supplier.phone, 60) || !Array.isArray(order.lines) || !order.lines.length || order.lines.length > 100 || !Array.isArray(order.events)) corrupt();
    for (const line of order.lines) if (!isRecord(line) || !isId(line.id) || !isId(line.itemId) || !isId(line.presentationId) || !isText(line.name, 100, true) || !isText(line.code, 30, true) || !isText(line.presentation, 100, true)) corrupt();
    if (new Set(order.events.map(e => e.id)).size !== order.events.length) corrupt();
    for (const event of order.events) if (!isRecord(event) || !isId(event.id) || !isActor(event.actor) || !isInstant(event.createdAt) || !isText(event.action, 100, true) || !isText(event.reason) || (event.receiptId !== undefined && (!isId(event.receiptId) || !state.receipts.some(r => r.id === event.receiptId && r.orderId === order.id)))) corrupt();
  }
  const receiptOperations = new Set<string>();
  for (const receipt of state.receipts) {
    if (!isRecord(receipt) || !isId(receipt.id) || !isText(receipt.folio, 30, true) || !isId(receipt.orderId) || !isId(receipt.operationId) || receiptOperations.has(receipt.operationId) || !isActor(receipt.actor) || !isInstant(receipt.createdAt) || !isDate(receipt.occurredOn) || !isText(receipt.reason) || !isText(receipt.notes) || typeof receipt.bookedTotal !== 'string' || receipt.bookedTotal.length > 32 || !Array.isArray(receipt.lines) || !receipt.lines.length) corrupt();
    receiptOperations.add(receipt.operationId);
    const order = state.orders.find(o => o.id === receipt.orderId); const operation = state.operations.find(o => o.id === receipt.operationId);
    if (!order || !operation || operation.kind !== 'purchase' || operation.createdAt !== receipt.createdAt || !sameActor(operation.actor, receipt.actor) || receipt.lines.length > order.lines.length) corrupt();
    for (const line of receipt.lines) { const original = order!.lines.find(l => l.id === line?.lineId); if (!isRecord(line) || !isId(line.lineId) || !original) corrupt(); validateQuantity(line.quantity, original!.unit); }
    const original = receipt.replacesId === undefined ? undefined : state.receipts.find(r => r.id === receipt.replacesId);
    if (receipt.replacesId !== undefined && (!isId(receipt.replacesId) || receipt.replacesId === receipt.id || !original || original.orderId !== receipt.orderId || original.replacedBy !== receipt.id || operation!.reversesOperationId !== original.operationId || receipt.occurredOn !== original.occurredOn || receipt.actor.role !== 'admin' || !isText(receipt.reason, 500, true))) corrupt();
    if (!original && (operation!.reversesOperationId !== undefined || receipt.occurredOn !== operation!.occurredOn || receipt.lines.every(l => decimal(l.quantity).isZero()))) corrupt();
    if (receipt.replacedBy !== undefined && (!isId(receipt.replacedBy) || receipt.replacedBy === receipt.id)) corrupt();
    const visited = new Set<string>([receipt.id]); let previous = receipt.id; let next = receipt.replacedBy;
    while (next) { if (visited.has(next)) corrupt(); visited.add(next); const replacement = state.receipts.find(r => r.id === next); if (!replacement || replacement.orderId !== receipt.orderId || replacement.replacesId !== previous) corrupt(); previous = next; next = replacement!.replacedBy; }
    for (const movement of state.movements.filter(m => m.operationId === receipt.operationId && m.kind === 'purchase')) if (!receipt.lines.some(l => order!.lines.find(line => line.id === l.lineId)?.itemId === movement.itemId)) corrupt();
  }
  if (state.operations.some(o => o.kind === 'purchase' && !receiptOperations.has(o.id))) corrupt();
  for (const order of state.orders) {
    for (const line of order.lines) {
      validateQuantity(line.quantity, 'pzas', false); validateQuantity(requestedOf(line).toFixed(), line.unit, false); if (decimal(line.quantity).gt(1000000)) corrupt();
      if (!['closed', 'cancelled'].includes(order.status) && !decimal(line.closed).isZero()) corrupt();
    }
    const received = order.lines.map(l => receivedOf(state, order.id, l.id)); const pending = order.lines.map(l => pendingOf(state, order, l));
    if ((order.status === 'sent' && received.some(q => !q.isZero())) || (order.status === 'partial' && (!received.some(q => q.gt(0)) || !pending.some(q => q.gt(0)))) || (order.status === 'cancelled' && received.some(q => !q.isZero()))) corrupt();
  }
  const expected = state.orders.filter(o => ['sent', 'partial'].includes(o.status)).flatMap(o => o.lines.map(l => ({ folio: o.folio, itemId: l.itemId, pending: pendingOf(state, o, l).toFixed() }))).filter(p => decimal(p.pending).gt(0));
  const keys = (values: typeof expected) => values.map(p => JSON.stringify([p.folio, p.itemId, decimal(p.pending).toFixed()])).sort();
  if (JSON.stringify(keys(expected)) !== JSON.stringify(keys(state.openPurchases))) corrupt();
}
