import { items, orders, suppliers } from './prototype';
import type { DemoState, OrderLine } from '../domain/model';
import { businessDate } from '../domain/dates';
import { receiptTotal, syncPending } from '../domain/purchases';

export function seedPurchases(state: DemoState) {
  state.suppliers = suppliers.map((s, index) => ({ ...s, id: `supplier-${index + 1}`, active: true, tone: s.tone as DemoState['items'][number]['tone'] }));
  for (const name of new Set(state.items.flatMap(i => i.presentations.map(p => p.supplier)))) if (!state.suppliers.some(s => s.name === name)) state.suppliers.push({ id:`supplier-${state.suppliers.length + 1}`, name, contact:'', email:'', phone:'', notes:'Proveedor conservado de la fase 3.', active:true, tone:'green' });
  const offsets: Record<string, [number, number]> = { 'OC-0042':[-5,-2], 'OC-0041':[-4,1], 'OC-0040':[-2,2], 'OC-0039':[-1,4], 'OC-0038':[-8,-5] };
  state.orders = orders.map(order => ({ id: order.id, folio: order.id, supplierId: state.suppliers.find(s => s.name === order.supplier)!.id, supplier: { ...state.suppliers.find(s => s.name === order.supplier)! }, status: order.status, createdAt: `${businessDate(state.seededAt, offsets[order.id][0])}T18:00:00.000Z`, expectedOn: businessDate(state.seededAt, offsets[order.id][1]), shipping: order.shipping.toFixed(2), shippingTax: String(order.shippingTax), notes: order.notes, lines: order.lines.map((line, index): OrderLine => { const item = items.find(i => i.id === line.ingredient)!; return { id:`${order.id}:line:${index}`, itemId:item.id, presentationId:`${item.id}:presentation`, name:item.name, code:item.code, unit:item.unit, presentation:line.presentation!, content:String(line.content), quantity:String(line.quantity), price:line.unitPrice!.toFixed(2), discount:String(line.discount), tax:String(line.tax), closed:'0' }; }), events:[{ id:`${order.id}:created`, action:order.status === 'draft' ? 'Crear borrador' : 'Enviar · simulación', createdAt:`${businessDate(state.seededAt, offsets[order.id][0])}T18:00:00.000Z`, actor:{ role:'admin', name:'Renata Salas' }, reason:'Ejemplo ficticio conservado de la demo.' }] }));
  state.receipts = [];
  for (const [orderId, operationId] of [['OC-0038','MOV-0081'],['OC-0041','MOV-0084']]) {
    const order = state.orders.find(o => o.id === orderId)!; const operation = state.operations.find(o => o.id === operationId);
    if (!operation) continue;
    const id = `seed-receipt-${orderId}`; const receipt = { id, folio:`REC-${String(state.receipts.length + 1).padStart(4,'0')}`, orderId, operationId, occurredOn:operation.occurredOn, createdAt:operation.createdAt, actor:operation.actor, reason:operation.reason, notes:'Comprobante inicial ficticio.', bookedTotal:'0.00', lines:state.movements.filter(m => m.operationId === operationId && m.kind === 'purchase').map(m => ({ lineId:order.lines.find(l => l.itemId === m.itemId)!.id, quantity:m.quantity })) };
    state.receipts.push(receipt); order.events.push({ id, action:'Registrar recepción', createdAt:receipt.createdAt, actor:receipt.actor, reason:receipt.reason, receiptId:id });
  }
  for (const receipt of state.receipts) receipt.bookedTotal = receiptTotal(state,receipt).toFixed(2);
  syncPending(state);
}
