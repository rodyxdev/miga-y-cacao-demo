import { applyCommand } from '../domain/inventory';
import { DomainError, type DemoState, type Request } from '../domain/model';
import { createSeed } from '../seed/state';
import { assertState } from './validate';
import { readState } from './migrate';

const DATABASE = 'miga-y-cacao-inventario-demo-v1';
const STORE = 'demo';
const KEY = 'current';
export class IndexedStore {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(private factory: IDBFactory = globalThis.indexedDB, private name = DATABASE, private seed = createSeed) {}
  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new DomainError('STORAGE', 'El almacenamiento local no está disponible en este navegador. No se guardarán operaciones en memoria como si fueran persistentes.'));
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1); let rejected = false;
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onblocked = () => { rejected = true; reject(new DomainError('STORAGE', 'Otra pestaña está bloqueando el almacenamiento. Ciérrala o recarga antes de volver a intentar.')); };
      request.onerror = () => { rejected = true; reject(new DomainError('STORAGE', 'No se pudo abrir el almacenamiento local. Tus registros anteriores no se han restablecido.')); };
      request.onsuccess = () => { const database = request.result; if (rejected) { database.close(); return; } database.onversionchange = () => { database.close(); this.connection = null; }; database.onclose = () => { this.connection = null; }; resolve(database); };
    });
    this.connection.catch(() => { this.connection = null; }); return this.connection;
  }
  private async transaction(transform: (raw: unknown) => DemoState): Promise<DemoState> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let result: DemoState; let failure: unknown; let transaction: IDBTransaction;
      try { transaction = database.transaction(STORE, 'readwrite'); } catch { this.connection = null; reject(new DomainError('STORAGE', 'El almacenamiento se cerró. Recarga e intenta otra vez; la operación no se guardó.')); return; }
      const store = transaction.objectStore(STORE); const request = store.get(KEY);
      request.onsuccess = () => { try { result = transform(request.result); assertState(result); if (result !== request.result) store.put(result, KEY); } catch (error) { failure = error; transaction.abort(); } };
      transaction.oncomplete = () => resolve(result!);
      transaction.onabort = () => reject(failure || new DomainError('STORAGE', 'No se pudo guardar la operación, por falta de espacio o una interrupción del navegador. Tus datos anteriores y la captura se conservan.'));
      transaction.onerror = () => { /* onabort comunica el fallo sin anunciar éxito. */ };
    });
  }
  load(): Promise<DemoState> { return this.transaction(raw => { if (raw === undefined) return this.seed(); return readState(raw); }); }
  run(request: Request): Promise<DemoState> { return this.transaction(raw => { const state = readState(raw); return applyCommand(state, request); }); }
  reset(id: string, now: string, expected?: { generation: string; revision: number }): Promise<DemoState> {
    return this.transaction(raw => {
      let previous: DemoState | null = null;
      try { assertState(raw); previous = raw; } catch (error) { if (expected) throw error; }
      if (expected && (!previous || previous.generation !== expected.generation || previous.revision !== expected.revision)) throw new DomainError('CONFLICT', 'Los datos cambiaron antes del restablecimiento. Revisa el estado actual y confirma otra vez.');
      if (previous?.applied.includes(id)) return previous;
      const next = this.seed(now); next.revision = (previous?.revision || 0) + 1; next.applied = [id];
      next.audit.push({ id, createdAt: now, actor: { role: 'admin', name: 'Visitante de la demo' }, action: 'Restablecer demo', reference: 'Datos iniciales', description: 'Restablecimiento confirmado por el visitante.' }); return next;
    });
  }
  async close() { const database = await this.connection; database?.close(); this.connection = null; }
}
