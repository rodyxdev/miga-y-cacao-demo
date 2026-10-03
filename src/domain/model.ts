export type Unit = 'g' | 'ml' | 'pzas';
export type PurchaseUnit = Unit | 'kg' | 'l';
export type Role = 'admin' | 'inventory';
export type MovementKind = 'initial' | 'purchase' | 'consumption' | 'waste' | 'adjustment' | 'reversal';
export type Tone = 'wheat' | 'cream' | 'cocoa' | 'green' | 'pink';
export interface Actor { role: Role; name: string }
export interface Presentation { id: string; name: string; content: string; supplier: string; price: string }
export interface StockItem {
  id: string; code: string; name: string; category: string; unit: Unit;
  minimum: string; target: string; location: string; notes: string; active: boolean;
  tone: Tone; presentations: Presentation[];
}
export interface Movement {
  id: string; operationId: string; itemId: string; quantity: string; kind: MovementKind;
  occurredOn: string; createdAt: string; sequence: number; actor: Actor;
  reason: string; reference: string; reversedMovementId?: string;
}
export interface Operation {
  id: string; folio: string; kind: MovementKind; occurredOn: string; createdAt: string;
  actor: Actor; reason: string; notes: string; reversesOperationId?: string;
}
export interface CountLine { itemId: string; initialStock: string; initialSequence: number; counted: string | null; reviewStock: string | null; reviewSequence: number | null }
export interface PhysicalCount { id: string; folio: string; title: string; createdAt: string; actor: Actor; status: 'open' | 'confirmed' | 'cancelled'; reason: string; lines: CountLine[]; reviewedAt: string | null; confirmedAt: string | null; operationId: string | null }
export interface AuditEvent { id: string; createdAt: string; actor: Actor; action: string; reference: string; description: string; before?: StockItem; after?: StockItem }
export interface Supplier { id: string; name: string; contact: string; email: string; phone: string; notes: string; active: boolean; tone: Tone }
export type OrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled' | 'closed';
export interface OrderLine { id: string; itemId: string; presentationId: string; name: string; code: string; unit: Unit; presentation: string; content: string; quantity: string; price: string; discount: string; tax: string; closed: string }
export interface OrderEvent { id: string; action: string; createdAt: string; actor: Actor; reason: string; receiptId?: string }
export interface PurchaseOrder { id: string; folio: string; supplierId: string; supplier: Pick<Supplier, 'name' | 'contact' | 'email' | 'phone'>; status: OrderStatus; createdAt: string; expectedOn: string; shipping: string; shippingTax: string; notes: string; lines: OrderLine[]; events: OrderEvent[] }
export interface Receipt { id: string; folio: string; orderId: string; operationId: string; occurredOn: string; createdAt: string; actor: Actor; reason: string; notes: string; bookedTotal: string; lines: { lineId: string; quantity: string }[]; replacesId?: string; replacedBy?: string }
export interface OrderInput { id?: string; supplierId: string; expectedOn: string; shipping: string; shippingTax: string; notes: string; lines: { id?: string; itemId: string; presentationId: string; quantity: string; price: string; discount: string; tax: string }[] }
export interface DemoState {
  schemaVersion: 2; seedVersion: 1; generation: string; revision: number; sequence: number;
  seededAt: string; items: StockItem[]; operations: Operation[]; movements: Movement[];
  counts: PhysicalCount[]; categories: string[]; audit: AuditEvent[]; applied: string[];
  // Referencias de las compras de ejemplo. Las compras editables corresponden a la fase 4.
  openPurchases: { folio: string; itemId: string; pending: string }[];
  suppliers: Supplier[]; orders: PurchaseOrder[]; receipts: Receipt[];
}
export interface PresentationInput { id?: string; name: string; amount: string; unit: PurchaseUnit; supplier: string; price: string }
export interface ItemInput { id?: string; code: string; name: string; category: string; unit: Unit; minimum: string; target: string; location: string; notes: string; presentations: PresentationInput[] }
export type Command =
  | { type: 'supplier.save'; supplier: Omit<Supplier, 'active' | 'tone' | 'id'> & { id?: string } }
  | { type: 'supplier.archive'; supplierId: string; active: boolean }
  | { type: 'order.save'; order: OrderInput }
  | { type: 'order.send'; orderId: string }
  | { type: 'order.close'; orderId: string; reason: string }
  | { type: 'receipt.record'; orderId: string; occurredOn: string; reason: string; notes: string; lines: { lineId: string; quantity: string }[] }
  | { type: 'receipt.correct'; receiptId: string; reason: string; notes: string; lines: { lineId: string; quantity: string }[] }
  | { type: 'item.save'; item: ItemInput }
  | { type: 'item.archive'; itemId: string; active: boolean }
  | { type: 'movement.record'; kind: 'initial' | 'consumption' | 'waste'; occurredOn: string; reason: string; notes: string; lines: { itemId: string; quantity: string }[] }
  | { type: 'operation.reverse'; operationId: string; reason: string }
  | { type: 'count.start'; title: string; itemIds: string[] }
  | { type: 'count.capture'; countId: string; values: Record<string, string>; reason: string }
  | { type: 'count.review'; countId: string; acknowledgeChanges: boolean }
  | { type: 'count.confirm'; countId: string }
  | { type: 'count.cancel'; countId: string; reason: string };
export interface Request { id: string; generation: string; revision: number; actor: Actor; now: string; command: Command }

export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; }
}
