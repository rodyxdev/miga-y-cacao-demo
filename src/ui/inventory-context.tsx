import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react';
import { IndexedStore } from '../storage/indexed-store';
import { stockOf } from '../domain/inventory';
import { DomainError, type Actor, type Command, type DemoState, type MovementKind, type Supplier } from '../domain/model';
import { incomingOf, receivedOf } from '../domain/purchases';
import { businessDate } from '../seed/state';
import { type Ingredient, type Movement as PreviewMovement, type Purchase } from '../seed/prototype';

export interface Baseline { generation: string; revision: number }
export interface LiveIngredient extends Ingredient { active: boolean; notes: string; presentationCount: number }
interface InventoryContext {
  state: DemoState; busy: boolean; error: string; clearError: () => void;
  items: LiveIngredient[]; allItems: LiveIngredient[]; categories: string[]; movements: PreviewMovement[];
  suppliers: Supplier[]; orders: Purchase[]; incoming: (id: string) => number;
  findItem: (id: string) => LiveIngredient;
  run: (command: Command, actor: Actor, baseline?: Baseline, id?: string) => Promise<DemoState>;
  reset: (baseline?: Baseline) => Promise<void>;
}
const Context = createContext<InventoryContext | null>(null);
const labels: Record<MovementKind, PreviewMovement['type']> = { initial: 'Entrada inicial', purchase: 'Compra', consumption: 'Consumo', waste: 'Merma', adjustment: 'Ajuste', reversal: 'Reversión' };
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'La operación no pudo completarse. La captura se conserva.';

export function InventoryProvider({ children }: { children: ReactNode }) {
  const store = useRef(new IndexedStore()); const stateRef = useRef<DemoState | null>(null); const busyRef = useRef(false);
  const [state, setState] = useState<DemoState | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [bootError, setBootError] = useState('');
  const channel = useRef<BroadcastChannel | null>(null);
  const publish = (next: DemoState) => { if (!stateRef.current || next.generation !== stateRef.current.generation || next.revision >= stateRef.current.revision) { stateRef.current = next; setState(next); } };
  const load = async () => { try { publish(await store.current.load()); setBootError(''); } catch (failure) { if (stateRef.current) setError(messageOf(failure)); else setBootError(messageOf(failure)); } };
  useEffect(() => {
    void load();
    if (typeof BroadcastChannel !== 'undefined') { channel.current = new BroadcastChannel('miga-y-cacao-inventario'); channel.current.onmessage = () => { void load(); }; }
    const focus = () => { void load(); }; window.addEventListener('focus', focus);
    return () => { channel.current?.close(); channel.current = null; window.removeEventListener('focus', focus); };
  }, []);
  async function run(command: Command, actor: Actor, baseline?: Baseline, id: string = crypto.randomUUID()) {
    if (busyRef.current) throw new DomainError('BUSY', 'Otra operación está terminando. Espera antes de confirmar otra vez.');
    const current = stateRef.current; if (!current) throw new DomainError('STORAGE', 'Los datos todavía no están disponibles.');
    busyRef.current = true; setBusy(true); setError('');
    try { const next = await store.current.run({ id, generation: baseline?.generation ?? current.generation, revision: baseline?.revision ?? current.revision, command, actor, now: new Date().toISOString() }); publish(next); channel.current?.postMessage({ generation: next.generation, revision: next.revision }); return next; }
    catch (failure) { setError(messageOf(failure)); if (failure instanceof DomainError && failure.code === 'CONFLICT') await load(); throw failure; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function reset(baseline?: Baseline) {
    if (busyRef.current) throw new DomainError('BUSY', 'Espera a que termine la operación actual.');
    busyRef.current = true; setBusy(true); setError('');
    try { const next = await store.current.reset(crypto.randomUUID(), new Date().toISOString(), baseline); publish(next); setBootError(''); channel.current?.postMessage({ generation: next.generation, revision: next.revision }); }
    catch (failure) { setError(messageOf(failure)); if (!stateRef.current) setBootError(messageOf(failure)); throw failure; }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (!state) return <main className="boot-screen"><div className="boot-content" role={bootError ? 'alert' : 'status'}>{bootError ? <><CircleAlert size={36}/><h1>No pudimos cargar la demo</h1><p>{bootError}</p><button className="button button-primary" onClick={() => void load()}>Volver a intentar</button><button className="button button-secondary" disabled={busy} onClick={() => { if (window.confirm('Restablecer reemplazará únicamente los datos locales de Miga y Cacao por los ejemplos iniciales. ¿Confirmas?')) void reset().catch(() => {}); }}><RotateCcw size={16}/>Restablecer con confirmación</button></> : <><LoaderCircle className="loading-spinner" size={30}/><p>Preparando tu taller…</p></>}</div></main>;
  const allItems: LiveIngredient[] = state.items.map(i => { const primary = i.presentations[0]; return { id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, stock: Number(stockOf(state, i.id)), minimum: Number(i.minimum), target: Number(i.target), supplier: primary.supplier, location: i.location, presentation: primary.name, content: Number(primary.content), price: Number(primary.price), tone: i.tone, active: i.active, notes: i.notes, presentationCount: i.presentations.length }; });
  const today = new Date(`${businessDate(new Date().toISOString())}T12:00:00Z`).getTime();
  const movements: PreviewMovement[] = [...state.movements].reverse().map(m => ({ id: `MOV-${String(m.sequence).padStart(4, '0')}`, operationId: m.operationId, ingredient: m.itemId, type: labels[m.kind], quantity: Number(m.quantity), days: Math.round((new Date(`${m.occurredOn}T12:00:00Z`).getTime() - today) / 86400000), time: new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(m.createdAt)), person: m.actor.name, reference: `${m.reference}${m.reason ? ` · ${m.reason}` : ''}` }));
  const orders: Purchase[] = state.orders.map(o => ({ id:o.id, supplier:o.supplier.name, status:o.status, created:businessDate(o.createdAt), expected:o.expectedOn, shipping:Number(o.shipping), shippingTax:Number(o.shippingTax), notes:o.notes, lines:o.lines.map(l => ({ ingredient:l.itemId, quantity:Number(l.quantity), received:receivedOf(state,o.id,l.id).div(l.content).toNumber(), discount:Number(l.discount), tax:Number(l.tax), unitPrice:Number(l.price), content:Number(l.content), name:l.name, presentation:l.presentation, unit:l.unit })) }));
  return <Context.Provider value={{ state, busy, error, clearError: () => setError(''), items: allItems.filter(i => i.active), allItems, categories: state.categories, movements, suppliers:state.suppliers, orders, incoming:id => incomingOf(state,id).toNumber(), findItem: id => { const item = allItems.find(i => i.id === id); if (!item) throw new DomainError('ITEM', 'No encontramos este insumo.'); return item; }, run, reset }}>{children}</Context.Provider>;
}
export function useInventory() { const value = useContext(Context); if (!value) throw new Error('Falta el proveedor de inventario.'); return value; }
export const baselineOf = (state: DemoState): Baseline => ({ generation: state.generation, revision: state.revision });
export const actorOf = (role: 'admin' | 'inventory'): Actor => ({ role, name: role === 'admin' ? 'Renata Salas' : 'Lucía Herrera' });
