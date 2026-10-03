// Fixtures de presentación para la fase 2. No representan el almacén persistente.
export type Unit = 'g' | 'ml' | 'pzas';
export type Role = 'admin' | 'inventory';
export type StockStatus = 'healthy' | 'low' | 'empty';
export type Page = 'panel' | 'inventario' | 'compras' | 'movimientos' | 'conteos' | 'proveedores' | 'configuracion';
export interface Ingredient {
  id: string; code: string; name: string; category: string; unit: Unit;
  stock: number; minimum: number; target: number; supplier: string;
  location: string; presentation: string; content: number; price: number;
  tone: 'wheat' | 'cream' | 'cocoa' | 'green' | 'pink';
}
export interface PurchaseLine { ingredient: string; quantity: number; received: number; discount: number; tax: number; unitPrice?: number; content?: number; name?: string; presentation?: string; unit?: Unit }
export interface Purchase {
  id: string; supplier: string; status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled' | 'closed';
  created: string; expected: string; shipping: number; shippingTax: number;
  lines: PurchaseLine[]; notes: string;
}
export interface Movement { id: string; ingredient: string; type: 'Consumo' | 'Compra' | 'Merma' | 'Ajuste' | 'Entrada inicial' | 'Reversión'; operationId?: string; quantity: number; days: number; time: string; person: string; reference: string }

export const items: Ingredient[] = [
  { id: 'harina', code: 'INS-001', name: 'Harina de trigo', category: 'Harinas y secos', unit: 'g', stock: 600, minimum: 2000, target: 8000, supplier: 'La Espiga', location: 'Alacena · A1', presentation: 'Bolsa de 1 kg', content: 1000, price: 32, tone: 'wheat' },
  { id: 'mantequilla', code: 'INS-002', name: 'Mantequilla sin sal', category: 'Lácteos', unit: 'g', stock: 1800, minimum: 3000, target: 6000, supplier: 'Lácteos del Valle', location: 'Refrigerador · R1', presentation: 'Barra de 1 kg', content: 1000, price: 185, tone: 'cream' },
  { id: 'azucar', code: 'INS-003', name: 'Azúcar refinada', category: 'Harinas y secos', unit: 'g', stock: 4500, minimum: 2000, target: 8000, supplier: 'La Espiga', location: 'Alacena · A2', presentation: 'Bolsa de 1 kg', content: 1000, price: 29, tone: 'wheat' },
  { id: 'chocolate', code: 'INS-004', name: 'Chocolate semiamargo', category: 'Chocolates', unit: 'g', stock: 2200, minimum: 1000, target: 4000, supplier: 'Casa Cacao', location: 'Alacena · B1', presentation: 'Bolsa de 1 kg', content: 1000, price: 245, tone: 'cocoa' },
  { id: 'blanco', code: 'INS-005', name: 'Chocolate blanco', category: 'Chocolates', unit: 'g', stock: 0, minimum: 500, target: 2000, supplier: 'Casa Cacao', location: 'Alacena · B2', presentation: 'Bolsa de 500 g', content: 500, price: 145, tone: 'pink' },
  { id: 'huevos', code: 'INS-006', name: 'Huevos', category: 'Frescos', unit: 'pzas', stock: 84, minimum: 30, target: 150, supplier: 'La Espiga', location: 'Refrigerador · R2', presentation: 'Caja de 30 piezas', content: 30, price: 95, tone: 'cream' },
  { id: 'leche', code: 'INS-007', name: 'Leche entera', category: 'Lácteos', unit: 'ml', stock: 12000, minimum: 4000, target: 24000, supplier: 'Lácteos del Valle', location: 'Refrigerador · R1', presentation: 'Caja de 12 × 1 l', content: 12000, price: 310, tone: 'green' },
  { id: 'crema', code: 'INS-008', name: 'Crema para batir', category: 'Lácteos', unit: 'ml', stock: 600, minimum: 2000, target: 6000, supplier: 'Lácteos del Valle', location: 'Refrigerador · R1', presentation: 'Envase de 1 l', content: 1000, price: 98, tone: 'cream' },
  { id: 'levadura', code: 'INS-009', name: 'Levadura seca', category: 'Harinas y secos', unit: 'g', stock: 80, minimum: 100, target: 500, supplier: 'La Espiga', location: 'Alacena · A3', presentation: 'Sobre de 100 g', content: 100, price: 22, tone: 'wheat' },
  { id: 'vainilla', code: 'INS-010', name: 'Extracto de vainilla', category: 'Esencias', unit: 'ml', stock: 750, minimum: 250, target: 1000, supplier: 'Casa Cacao', location: 'Alacena · B3', presentation: 'Botella de 250 ml', content: 250, price: 85, tone: 'cocoa' },
  { id: 'cajas', code: 'INS-011', name: 'Cajas para pastel', category: 'Empaques', unit: 'pzas', stock: 120, minimum: 40, target: 200, supplier: 'Empaques Papelito', location: 'Estante · E1', presentation: 'Paquete de 50 piezas', content: 50, price: 325, tone: 'green' },
  { id: 'capacillos', code: 'INS-012', name: 'Capacillos para cupcake', category: 'Empaques', unit: 'pzas', stock: 0, minimum: 100, target: 500, supplier: 'Empaques Papelito', location: 'Estante · E2', presentation: 'Paquete de 100 piezas', content: 100, price: 45, tone: 'pink' },
];
export const categories = [...new Set(items.map(i => i.category))];
export const suppliers = [
  { name: 'La Espiga', initials: 'LE', contact: 'Andrea Luna', email: 'ventas@laespiga.example', phone: 'Teléfono ficticio · 000 000 0101', tone: 'wheat', notes: 'Harinas, básicos y frescos para el taller.' },
  { name: 'Lácteos del Valle', initials: 'LV', contact: 'Mateo Ríos', email: 'pedidos@delvalle.example', phone: 'Teléfono ficticio · 000 000 0102', tone: 'green', notes: 'Entregas de lácteos y productos refrigerados.' },
  { name: 'Casa Cacao', initials: 'CC', contact: 'Sofía Oliva', email: 'hola@casacacao.example', phone: 'Teléfono ficticio · 000 000 0103', tone: 'cocoa', notes: 'Chocolates y esencias para repostería.' },
  { name: 'Empaques Papelito', initials: 'EP', contact: 'Diego Sol', email: 'ventas@papelito.example', phone: 'Teléfono ficticio · 000 000 0104', tone: 'pink', notes: 'Cajas y empaques para compartir algo dulce.' },
];
export const relativeDate = (offset = 0) => {
  const now = new Date();
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${local}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const exampleOrders: Purchase[] = [
  { id: 'OC-0042', supplier: 'Lácteos del Valle', status: 'sent', created: relativeDate(-5), expected: relativeDate(-2), shipping: 60, shippingTax: 16, lines: [{ ingredient: 'crema', quantity: 6, received: 0, discount: 5, tax: 16 }], notes: 'Recepción en refrigerador. Orden de demostración.' },
  { id: 'OC-0041', supplier: 'Lácteos del Valle', status: 'partial', created: relativeDate(-4), expected: relativeDate(1), shipping: 0, shippingTax: 0, lines: [{ ingredient: 'mantequilla', quantity: 6, received: 3, discount: 0, tax: 16 }], notes: 'Llegaron 3 de las 6 barras solicitadas.' },
  { id: 'OC-0040', supplier: 'La Espiga', status: 'sent', created: relativeDate(-2), expected: relativeDate(2), shipping: 40, shippingTax: 16, lines: [{ ingredient: 'harina', quantity: 5, received: 0, discount: 0, tax: 0 }], notes: 'Harina para la producción de la semana.' },
  { id: 'OC-0039', supplier: 'Casa Cacao', status: 'draft', created: relativeDate(-1), expected: relativeDate(4), shipping: 80, shippingTax: 16, lines: [{ ingredient: 'blanco', quantity: 4, received: 0, discount: 10, tax: 16 }], notes: 'Propuesta de reposición; todavía no está enviada.' },
  { id: 'OC-0038', supplier: 'Empaques Papelito', status: 'received', created: relativeDate(-8), expected: relativeDate(-5), shipping: 0, shippingTax: 0, lines: [{ ingredient: 'cajas', quantity: 3, received: 3, discount: 0, tax: 16 }], notes: 'Recepción completa de 150 cajas.' },
];
export const orders: Purchase[] = exampleOrders.map(order => ({ ...order, lines: order.lines.map(line => { const item = items.find(i => i.id === line.ingredient)!; return { ...line, unitPrice: item.price, content: item.content, name: item.name, presentation: item.presentation, unit: item.unit }; }) }));
export const movements: Movement[] = [
  { id: 'MOV-0086', ingredient: 'harina', type: 'Consumo', quantity: -800, days: 0, time: '10:35', person: 'Lucía Herrera', reference: 'Producción · panqués de naranja' },
  { id: 'MOV-0085', ingredient: 'huevos', type: 'Consumo', quantity: -12, days: 0, time: '10:35', person: 'Lucía Herrera', reference: 'Producción · panqués de naranja' },
  { id: 'MOV-0084', ingredient: 'mantequilla', type: 'Compra', quantity: 3000, days: -1, time: '14:20', person: 'Lucía Herrera', reference: 'OC-0041 · recepción parcial' },
  { id: 'MOV-0083', ingredient: 'crema', type: 'Merma', quantity: -400, days: -1, time: '12:10', person: 'Lucía Herrera', reference: 'Derrame durante preparación' },
  { id: 'MOV-0082', ingredient: 'azucar', type: 'Ajuste', quantity: -100, days: -2, time: '17:40', person: 'Lucía Herrera', reference: 'CF-0007 · diferencia de conteo' },
  { id: 'MOV-0081', ingredient: 'cajas', type: 'Compra', quantity: 150, days: -5, time: '09:15', person: 'Lucía Herrera', reference: 'OC-0038 · recepción completa' },
];
export const statusOf = (item: Ingredient): StockStatus => item.stock === 0 ? 'empty' : item.stock < item.minimum ? 'low' : 'healthy';
export const statusText = { healthy: 'Suficiente', low: 'Bajo mínimo', empty: 'Agotado' };
export const orderText = { draft: 'Borrador', sent: 'Enviada', partial: 'Recepción parcial', received: 'Recibida', cancelled: 'Cancelada', closed: 'Cerrada · saldo cancelado' };
export const number = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(value);
export const quantity = (value: number, unit: Unit) => `${number(value)} ${unit}`;
export const money = (value: number | string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
export const dateLabel = (date: string) => !date ? 'Sin fecha' : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));
export const findItem = (id: string) => items.find(i => i.id === id)!;
export const incoming = (id: string) => orders.filter(o => o.status === 'sent' || o.status === 'partial').flatMap(o => o.lines).filter(l => l.ingredient === id).reduce((sum, l) => sum + (l.quantity - l.received) * findItem(id).content, 0);
export const suggestions = items.filter(i => i.stock + incoming(i.id) < i.minimum).map(i => ({ item: i, incoming: incoming(i.id), packs: Math.ceil((i.target - i.stock - incoming(i.id)) / i.content) }));
