import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, stockOf, convertPresentation, validateQuantity, validatePrice, countHasChanges } from '../.test-build/domain/inventory.js';
import { createSeed, businessDate } from '../.test-build/seed/state.js';
import { assertState } from '../.test-build/storage/validate.js';

const clock = '2026-10-02T18:00:00.000Z';
let sequence = 0;
const seed = () => createSeed(clock, 'test-generation');
function request(state, command, role = 'admin', id = `test-${++sequence}`) { return { id, generation: state.generation, revision: state.revision, now: clock, actor: { role, name: role === 'admin' ? 'Renata Salas' : 'Lucía Herrera' }, command }; }
const apply = (state, command, role = 'admin') => applyCommand(state, request(state, command, role));
const consume = (itemId, quantity, kind = 'consumption') => ({ type: 'movement.record', kind, occurredOn: '2026-10-02', reason: kind === 'waste' ? 'Derrame ficticio' : 'Producción ficticia', notes: '', lines: [{ itemId, quantity }] });
function input(state, id = 'harina') { const item = state.items.find(i => i.id === id); return { ...item, presentations: item.presentations.map(p => ({ ...p, amount: p.content, unit: item.unit })) }; }

test('la semilla tiene existencias trazables y nunca atraviesa un saldo negativo', () => {
  const state = seed(); assertState(state);
  const running = new Map();
  for (const movement of state.movements) { const total = (running.get(movement.itemId) || 0) + Number(movement.quantity); assert.ok(total >= 0, movement.itemId); running.set(movement.itemId, total); }
  assert.equal(stockOf(state, 'harina'), '600'); assert.equal(stockOf(state, 'mantequilla'), '1800'); assert.equal(stockOf(state, 'cajas'), '120'); assert.equal(stockOf(state, 'capacillos'), '0');
});
test('conversiones exactas de kilogramos y litros a unidades base', () => {
  assert.equal(convertPresentation('1.25', 'kg', 'g'), '1250'); assert.equal(convertPresentation('12', 'l', 'ml'), '12000'); assert.equal(convertPresentation('30', 'pzas', 'pzas'), '30');
});
test('se rechazan magnitudes incompatibles y piezas fraccionarias', () => {
  assert.throws(() => convertPresentation('1', 'kg', 'ml'), /misma magnitud/); assert.throws(() => validateQuantity('1.5', 'pzas'), /enteras/); assert.throws(() => validateQuantity('0.0001', 'g'), /decimales/);
});
test('cantidades y precios no aceptan infinito, notación exponencial ni exceso de precisión', () => {
  for (const value of ['Infinity', 'NaN', '1e3', '-1', '1,000']) assert.throws(() => validateQuantity(value, 'g'));
  assert.equal(validatePrice('32.5'), '32.50'); assert.throws(() => validatePrice('32.501'));
});
test('consumos decimales repetidos conservan precisión', () => {
  let state = seed(); for (let index = 0; index < 10; index++) state = apply(state, consume('harina', '0.1'));
  assert.equal(stockOf(state, 'harina'), '599'); assertState(state);
});
test('salidas de varias partidas son indivisibles y acumulan insumos repetidos', () => {
  const state = seed(); const before = structuredClone(state);
  const command = { ...consume('harina', '350'), lines: [{ itemId: 'harina', quantity: '350' }, { itemId: 'harina', quantity: '300' }, { itemId: 'azucar', quantity: '50' }] };
  assert.throws(() => apply(state, command), /salida total/); assert.deepEqual(state, before);
});
test('una operación idempotente no genera dos movimientos', () => {
  const state = seed(); const req = request(state, consume('harina', '100'), 'inventory', 'same-id'); const next = applyCommand(state, req); const repeated = applyCommand(next, req);
  assert.strictEqual(next, repeated); assert.equal(stockOf(repeated, 'harina'), '500'); assert.equal(repeated.movements.length, state.movements.length + 1);
});
test('mermas exigen motivo y permiten capturar varios insumos juntos', () => {
  const state = seed(); assert.throws(() => apply(state, { ...consume('harina', '10', 'waste'), reason: ' ' }), /Motivo/);
  const next = apply(state, { ...consume('harina', '10', 'waste'), lines: [{ itemId: 'harina', quantity: '10' }, { itemId: 'azucar', quantity: '20' }] }, 'inventory');
  assert.equal(stockOf(next, 'harina'), '590'); assert.equal(stockOf(next, 'azucar'), '4480');
});
test('el encargado no puede editar catálogo, registrar entradas iniciales ni revertir', () => {
  const state = seed(); assert.throws(() => apply(state, { type: 'item.save', item: input(state) }, 'inventory'), /administrador/);
  assert.throws(() => apply(state, consume('harina', '1', 'initial'), 'inventory'), /administrador/);
  assert.throws(() => apply(state, { type: 'operation.reverse', operationId: 'seed-produccion-panque', reason: 'Corrección' }, 'inventory'), /administrador/);
});
test('revertir conserva el original y corrige toda la operación agrupada', () => {
  const state = seed(); const originals = state.movements.filter(m => m.operationId === 'seed-produccion-panque'); const next = apply(state, { type: 'operation.reverse', operationId: 'seed-produccion-panque', reason: 'Captura duplicada ficticia' });
  assert.equal(stockOf(next, 'harina'), '1400'); assert.equal(stockOf(next, 'huevos'), '96'); assert.deepEqual(next.movements.filter(m => m.operationId === 'seed-produccion-panque'), originals); assert.equal(next.movements.filter(m => m.reversedMovementId).length, 2);
  assert.throws(() => apply(next, { type: 'operation.reverse', operationId: 'seed-produccion-panque', reason: 'Otra vez' }), /ya fue revertida/); assertState(next);
});
test('no se revierte una entrada si produce negativo ni una compra fuera de su recepción', () => {
  const state = seed(); assert.throws(() => apply(state, { type: 'operation.reverse', operationId: 'seed-initial', reason: 'Error' }), /negativas/);
  assert.throws(() => apply(state, { type: 'operation.reverse', operationId: 'MOV-0084', reason: 'Error' }), /recepción/);
});
test('catálogo exige código único y bloquea unidad base con movimientos', () => {
  const state = seed(); const duplicate = { ...input(state), id: undefined, code: 'ins-001' }; assert.throws(() => apply(state, { type: 'item.save', item: duplicate }), /código ya existe/);
  const modified = { ...input(state), unit: 'ml' }; assert.throws(() => apply(state, { type: 'item.save', item: modified }), /unidad base/);
});
test('crear un insumo empieza en cero y conserva varias presentaciones', () => {
  const state = seed(); const item = { ...input(state), id: undefined, name: 'Avena ficticia', code: 'INS-013', presentations: [{ name: 'Bolsa chica', amount: '0.5', unit: 'kg', supplier: 'La Espiga', price: '25.50' }, { name: 'Bolsa grande', amount: '2', unit: 'kg', supplier: 'La Espiga', price: '90' }] };
  const next = apply(state, { type: 'item.save', item }); const created = next.items.at(-1); assert.equal(stockOf(next, created.id), '0'); assert.deepEqual(created.presentations.map(p => p.content), ['500', '2000']); assertState(next);
});
test('archivar conserva historial, bloquea nuevas operaciones y permite restaurar', () => {
  let state = seed(); const before = structuredClone(state.movements); state = apply(state, { type: 'item.archive', itemId: 'blanco', active: false }); assert.deepEqual(state.movements, before);
  assert.throws(() => apply(state, consume('blanco', '1', 'initial')), /archivado/); state = apply(state, { type: 'item.archive', itemId: 'blanco', active: true }); assert.equal(stockOf(state, 'blanco'), '0');
});
test('no se archiva un insumo con compras pendientes', () => {
  assert.throws(() => apply(seed(), { type: 'item.archive', itemId: 'harina', active: false }), /compra pendiente/);
});
function startCount(state, ids = ['harina']) { const next = apply(state, { type: 'count.start', title: 'Conteo ficticio', itemIds: ids }, 'inventory'); return { state: next, id: next.counts.at(-1).id }; }
test('conteo exige captura completa, motivo y revisión previa', () => {
  const started = startCount(seed(), ['harina', 'azucar']); let state = started.state; const id = started.id;
  state = apply(state, { type: 'count.capture', countId: id, values: { harina: '550' }, reason: 'Cierre' }, 'inventory'); assert.throws(() => apply(state, { type: 'count.review', countId: id, acknowledgeChanges: false }, 'inventory'), /todas las cantidades/);
  assert.throws(() => apply(state, { type: 'count.confirm', countId: id }, 'inventory'), /Revisa/);
});
test('movimientos durante el conteo exigen revisión explícita de la diferencia vigente', () => {
  const started = startCount(seed()); const id = started.id; let state = apply(started.state, { type: 'count.capture', countId: id, values: { harina: '700' }, reason: 'Diferencia de conteo' }, 'inventory');
  state = apply(state, consume('harina', '100')); assert.ok(countHasChanges(state, state.counts.find(c => c.id === id)));
  assert.throws(() => apply(state, { type: 'count.review', countId: id, acknowledgeChanges: false }), /movimientos/);
  state = apply(state, { type: 'count.review', countId: id, acknowledgeChanges: true }); assert.equal(state.counts.find(c => c.id === id).lines[0].reviewStock, '500');
  state = apply(state, { type: 'count.confirm', countId: id }); assert.equal(stockOf(state, 'harina'), '700'); assert.equal(state.movements.at(-1).quantity, '200'); assertState(state);
});
test('un movimiento posterior a la revisión impide aplicar un ajuste desactualizado', () => {
  const started = startCount(seed()); const id = started.id; let state = apply(started.state, { type: 'count.capture', countId: id, values: { harina: '550' }, reason: 'Cierre' });
  state = apply(state, { type: 'count.review', countId: id, acknowledgeChanges: false }); state = apply(state, consume('harina', '50'));
  assert.throws(() => apply(state, { type: 'count.confirm', countId: id }), /nuevos movimientos/); assert.equal(stockOf(state, 'harina'), '550');
});
test('un conteo confirmado no se aplica otra vez y conserva movimientos verificables', () => {
  const started = startCount(seed()); const id = started.id; let state = apply(started.state, { type: 'count.capture', countId: id, values: { harina: '0' }, reason: 'Agotado en conteo' });
  state = apply(state, { type: 'count.review', countId: id, acknowledgeChanges: false }); const req = request(state, { type: 'count.confirm', countId: id }); state = applyCommand(state, req); const repeated = applyCommand(state, req);
  assert.equal(stockOf(repeated, 'harina'), '0'); assert.equal(repeated.movements.length, state.movements.length); assert.throws(() => apply(repeated, { type: 'count.confirm', countId: id }), /cerrado/);
});
test('cambios ajenos a los insumos contados no invalidan la referencia del conteo', () => {
  const started = startCount(seed()); const id = started.id; let state = apply(started.state, { type: 'count.capture', countId: id, values: { harina: '600' }, reason: 'Sin diferencias' }); state = apply(state, { type: 'count.review', countId: id, acknowledgeChanges: false }); state = apply(state, consume('azucar', '50')); state = apply(state, { type: 'count.confirm', countId: id });
  assert.equal(stockOf(state, 'harina'), '600'); assert.equal(state.movements.filter(m => m.operationId === state.counts.at(-1).operationId).length, 0);
});
test('revisiones y generaciones antiguas no sobrescriben datos', () => {
  const state = seed(); const old = request(state, consume('harina', '50')); const next = apply(state, consume('harina', '100'));
  assert.throws(() => applyCommand(next, old), /datos cambiaron/); assert.throws(() => applyCommand(next, { ...old, generation: 'old-generation' }), /restablecida/);
});
test('la semilla de restablecimiento reproduce stocks y actualiza sus fechas', () => {
  const first = seed(); const second = createSeed('2026-12-20T18:00:00.000Z', 'another-generation');
  assert.notEqual(first.generation, second.generation); for (const item of first.items) assert.equal(stockOf(first, item.id), stockOf(second, item.id)); assert.equal(second.movements.at(-1).occurredOn, '2026-12-20'); assertState(second);
});
test('datos corruptos o de otra versión se rechazan sin modificarlos', () => {
  const state = seed(); const bad = structuredClone(state); bad.movements[0].quantity = 'Infinity'; const before = structuredClone(bad); assert.throws(() => assertState(bad), /formato válido/); assert.deepEqual(bad, before);
  assert.throws(() => assertState({ ...state, schemaVersion: 99 }), /compatible/);
});
test('la fecha operativa automática respeta la zona de Ciudad de México', () => {
  assert.equal(businessDate('2026-10-03T02:00:00.000Z'), '2026-10-02');
});
