import type { DemoState } from './model';
import { decimal } from './inventory';

// Solo el conteo ficticio original usó por error saldos posteriores a su ajuste.
// Reconstruir su documento conserva todos los movimientos y saldos del visitante.
export function repairSeedCountSnapshot(state: DemoState): boolean {
  const count = state.counts.find(c => c.id === 'seed-count' && c.operationId === 'MOV-0082' && c.status === 'confirmed');
  const operation = state.operations.find(o => o.id === 'MOV-0082' && o.kind === 'adjustment');
  if (!count || !operation) return false;
  const adjustments = state.movements.filter(m => m.operationId === operation.id);
  if (!adjustments.length) return false;
  const firstSequence = Math.min(...adjustments.map(m => m.sequence));
  const lines = count.lines.map(line => {
    const previous = state.movements.filter(m => m.itemId === line.itemId && m.sequence < firstSequence);
    const before = previous.reduce((total, m) => total.plus(m.quantity), decimal(0));
    const delta = adjustments.filter(m => m.itemId === line.itemId).reduce((total, m) => total.plus(m.quantity), decimal(0));
    const sequence = previous.at(-1)?.sequence || 0;
    return { ...line, initialStock: before.toFixed(), initialSequence: sequence, reviewStock: before.toFixed(), reviewSequence: sequence, counted: before.plus(delta).toFixed() };
  });
  if (JSON.stringify(lines) === JSON.stringify(count.lines)) return false;
  count.lines = lines; return true;
}
