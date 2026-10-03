import { items as previewItems, orders as previewOrders, movements as previewMovements } from './prototype';
import { stockOf } from '../domain/inventory';
import { repairSeedCountSnapshot } from '../domain/seed-count-snapshot';
import type { DemoState, MovementKind, Actor } from '../domain/model';
import { seedPurchases } from './purchases';

import { businessDate } from '../domain/dates';
export { businessDate } from '../domain/dates';
export function createSeed(now = new Date().toISOString(), generation: string = crypto.randomUUID()): DemoState {
  const state: DemoState = { schemaVersion: 2, suppliers: [], orders: [], receipts: [], seedVersion: 1, generation, revision: 0, sequence: 0, seededAt: now, items: previewItems.map(i => ({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, minimum: String(i.minimum), target: String(i.target), location: i.location, notes: 'Insumo ficticio para explorar la demo de repostería.', active: true, tone: i.tone, presentations: [{ id: `${i.id}:presentation`, name: i.presentation, content: String(i.content), price: i.price.toFixed(2), supplier: i.supplier }] })), operations: [], movements: [], counts: [], categories: [...new Set(previewItems.map(i => i.category))], applied: [], audit: [], openPurchases: previewOrders.filter(o => o.status === 'sent' || o.status === 'partial').flatMap(o => o.lines.map(l => ({ folio: o.id, itemId: l.ingredient, pending: String((l.quantity - l.received) * previewItems.find(i => i.id === l.ingredient)!.content) }))) };
  const actor: Actor = { role: 'inventory', name: 'Lucía Herrera' };
  const opening: Record<string, number> = { harina: 1400, mantequilla: 2000, azucar: 4600, chocolate: 2200, blanco: 500, huevos: 96, leche: 12000, crema: 1000, levadura: 80, vainilla: 750, cajas: 0, capacillos: 100 };
  function append(id: string, kind: MovementKind, days: number, reason: string, lines: { itemId: string; quantity: number }[], reference = '') {
    const occurredOn = businessDate(now, days); const createdAt = `${occurredOn}T18:00:00.000Z`; const folio = `OP-${String(state.operations.length + 1).padStart(4, '0')}`;
    state.operations.push({ id, folio, kind, occurredOn, createdAt, actor: kind === 'initial' ? { role: 'admin', name: 'Renata Salas' } : actor, reason, notes: 'Datos iniciales ficticios.' });
    lines.forEach((line, index) => { state.sequence++; state.movements.push({ id: `${id}:${index}`, operationId: id, itemId: line.itemId, quantity: String(line.quantity), kind, occurredOn, createdAt, sequence: state.sequence, actor: kind === 'initial' ? { role: 'admin', name: 'Renata Salas' } : actor, reason, reference: reference || folio }); });
  }
  append('seed-initial', 'initial', -14, 'Existencias iniciales del taller', state.items.filter(i => opening[i.id] > 0).map(i => ({ itemId: i.id, quantity: opening[i.id] })));
  const records = previewMovements.map(m => ({ id: m.id, itemId: m.ingredient, kind: ({ Consumo: 'consumption', Compra: 'purchase', Merma: 'waste', Ajuste: 'adjustment', 'Entrada inicial': 'initial', 'Reversión': 'reversal' } as const)[m.type], days: m.days, quantity: m.quantity, reason: m.reference }));
  records.push({ id: 'seed-cajas-consumo', itemId: 'cajas', kind: 'consumption', days: -3, quantity: -30, reason: 'Empaque de pasteles para entrega' }, { id: 'seed-capacillos-consumo', itemId: 'capacillos', kind: 'consumption', days: -3, quantity: -100, reason: 'Producción de cupcakes' }, { id: 'seed-blanco-consumo', itemId: 'blanco', kind: 'consumption', days: -2, quantity: -500, reason: 'Decoración de pasteles' }, { id: 'seed-mantequilla-consumo', itemId: 'mantequilla', kind: 'consumption', days: 0, quantity: -3200, reason: 'Producción de galletas de mantequilla' });
  records.sort((a, b) => a.days - b.days);
  const production = records.filter(r => r.reason === 'Producción · panqués de naranja');
  for (const record of records.filter(r => !production.includes(r))) append(record.id, record.kind, record.days, record.reason, [{ itemId: record.itemId, quantity: record.quantity }], record.reason.startsWith('OC-') ? record.reason.split(' · ')[0] : record.id === 'MOV-0082' ? 'CF-0001' : '');
  append('seed-produccion-panque', 'consumption', 0, 'Producción · panqués de naranja', production.map(r => ({ itemId: r.itemId, quantity: r.quantity })));
  const adjustment = state.operations.find(o => o.id === 'MOV-0082')!;
  state.counts.push({ id: 'seed-count', folio: 'CF-0001', title: 'Conteo de alacena', createdAt: adjustment.createdAt, actor, status: 'confirmed', reason: 'Diferencia detectada en el conteo de alacena', lines: ['azucar', 'chocolate', 'vainilla'].map(id => ({ itemId: id, initialStock: id === 'azucar' ? '4600' : stockOf(state, id), initialSequence: 1, counted: stockOf(state, id), reviewStock: id === 'azucar' ? '4600' : stockOf(state, id), reviewSequence: 1 })), reviewedAt: adjustment.createdAt, confirmedAt: adjustment.createdAt, operationId: adjustment.id });
  state.audit.push({ id: 'seed-created', createdAt: now, actor: { role: 'admin', name: 'Renata Salas' }, action: 'Preparar demo', reference: 'Datos iniciales', description: 'Datos ficticios, fechas relativas y movimientos trazables.' });
  repairSeedCountSnapshot(state); seedPurchases(state); return state;
}
