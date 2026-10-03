import Decimal from 'decimal.js';
import { items, type Ingredient, type Purchase } from '../seed/prototype';

// Solo desgloses de lectura en el prototipo. Las operaciones se implementan en fases 3–4.
const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function purchaseTotals(order: Purchase, catalog: Ingredient[] = items) {
  const lines = order.lines.map(line => {
    const source = catalog.find(item => item.id === line.ingredient);
    if (!source) throw new Error('El insumo de la orden no está disponible.');
    const item = { ...source, price: line.unitPrice ?? source.price, content: line.content ?? source.content, name: line.name ?? source.name, presentation: line.presentation ?? source.presentation, unit: line.unit ?? source.unit };
    const gross = cents(new Decimal(line.quantity).times(item.price));
    const discount = cents(gross.times(line.discount).div(100));
    const base = gross.minus(discount);
    const tax = cents(base.times(line.tax).div(100));
    return { ...line, item, gross, discountAmount: discount, base, taxAmount: tax, total: base.plus(tax) };
  });
  const sum = (key: 'gross' | 'discountAmount' | 'base' | 'taxAmount') => lines.reduce((total, line) => total.plus(line[key]), new Decimal(0));
  const shipping = new Decimal(order.shipping);
  const shippingTax = cents(shipping.times(order.shippingTax).div(100));
  return { lines, gross: sum('gross'), discount: sum('discountAmount'), base: sum('base'), tax: sum('taxAmount'), shipping, shippingTax, total: sum('base').plus(sum('taxAmount')).plus(shipping).plus(shippingTax) };
}
