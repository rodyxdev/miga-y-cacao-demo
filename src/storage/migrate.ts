import { DomainError, type DemoState } from '../domain/model';
import { assertLegacy, assertState } from './validate';
import { seedPurchases } from '../seed/purchases';
import { repairSeedCountSnapshot } from '../domain/seed-count-snapshot';

function repairExample(state: DemoState): DemoState {
  const candidate = { ...state, counts: state.counts.map(count => ({ ...count })) };
  if (!repairSeedCountSnapshot(candidate)) return state;
  const next = structuredClone(candidate);
  next.revision++;
  next.audit.push({ id: `seed-count-snapshot-${next.generation}`, createdAt: new Date().toISOString(), actor: { role: 'admin', name: 'Demo' }, action: 'Corregir documento de ejemplo', reference: 'CF-0001', description: 'Se reconstruyó el conteo ficticio inicial a partir de sus movimientos históricos, sin cambiar existencias, compras ni movimientos.' });
  assertState(next); return next;
}

export function readState(raw: unknown): DemoState {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion === 1) {
    assertLegacy(raw); const state = structuredClone(raw) as DemoState; state.schemaVersion = 2;
    seedPurchases(state); state.revision++;
    state.audit.push({ id:`migration-2-${state.generation}`, createdAt:new Date().toISOString(), actor:{role:'admin',name:'Demo'}, action:'Actualizar a fase 4', reference:'Compras y proveedores', description:'Se conservaron insumos, movimientos, conteos y generación de la fase 3. Se enlazaron las compras de ejemplo con sus entradas originales.' });
    assertState(state); return repairExample(state);
  }
  assertState(raw); return repairExample(raw);
}
