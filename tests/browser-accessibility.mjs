import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const axePath = process.env.AXE_SOURCE_PATH || require.resolve('axe-core/axe.min.js');
const axeSource = await fs.readFile(axePath, 'utf8');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const base = process.env.DEMO_URL || 'http://127.0.0.1:5173';
const output = process.env.QA_ARTIFACTS || '.test-build/accessibility';
await fs.mkdir(output, { recursive: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const scans = []; const checks = [];
const button = name => page.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog');
async function scan(name) {
  // Instrumentación mediante el depurador en el perfil de prueba; no relaja la CSP del sitio.
  if (!await page.evaluate(() => Boolean(window.axe))) await page.evaluate(axeSource);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  scans.push({ name, engine: result.testEngine, violations: result.violations, incomplete: result.incomplete, passes: result.passes.map(r => r.id) });
  console.log(`${result.violations.length ? 'REVISAR' : 'OK'}: ${name} · ${result.violations.length} reglas con incidencias`);
}
async function route(name) { await page.evaluate(name => { location.hash = `/${name}`; }, name); await page.getByRole('heading', { level: 1, name: { panel: 'Todo listo para crear.', inventario: 'Inventario', compras: 'Compras', movimientos: 'Movimientos', conteos: 'Conteos físicos', proveedores: 'Proveedores', configuracion: 'Configuración' }[name], exact: true }).waitFor(); }
async function close() { await dialog().getByRole('button', { name: 'Cerrar ventana', exact: true }).click(); }
async function keyboardCheck(name, action) { await action(); checks.push(name); console.log(`OK teclado: ${name}`); }
try {
  await page.goto(base); await page.getByRole('button', { name: /^Administrador/ }).waitFor(); await scan('Acceso');
  await page.getByRole('button', { name: /^Administrador/ }).click();
  for (const name of ['panel', 'inventario', 'compras', 'movimientos', 'conteos', 'proveedores', 'configuracion']) { await route(name); await scan(`Administrador · ${name}`); }
  await route('inventario'); await button('Nuevo insumo').click(); await scan('Nuevo insumo'); await close();
  await route('proveedores'); await button('Nuevo proveedor').click(); await scan('Nuevo proveedor'); await close();
  await route('compras'); await button('Nueva orden').click(); await scan('Nueva orden'); await close();
  await page.getByRole('row').filter({ hasText: 'OC-0041' }).getByRole('button', { name: 'Ver orden', exact: true }).click();
  await scan('Orden parcial'); await dialog().getByRole('button', { name: 'Registrar recepción', exact: true }).click(); await scan('Captura de recepción'); await close();
  await route('conteos'); await page.getByRole('button', { name: 'Ver resumen', exact: true }).first().click(); await scan('Conteo físico'); await close();
  await route('movimientos'); await page.getByRole('button', { name: 'Registrar consumo', exact: true }).click(); await scan('Captura de consumo'); await close();
  await route('compras'); await page.getByRole('tab', { name: /Lista sugerida/ }).click(); await scan('Sugerencias');
  await keyboardCheck('Pestañas de compras con flechas', async () => { await page.getByRole('tab', { name: /Lista sugerida/ }).focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.getByRole('tab', { name: /Órdenes/ }).getAttribute('aria-selected'), 'true'); });
  await route('inventario'); const itemButton = page.getByRole('button', { name: /^Ver Harina de trigo$/ });
  await keyboardCheck('Abrir y cerrar detalle con teclado; foco vuelve al origen', async () => { await itemButton.focus(); await page.keyboard.press('Enter'); await dialog().waitFor(); await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))); await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' }); assert.ok(await itemButton.evaluate(el => el === document.activeElement)); });
  await keyboardCheck('Saltar al contenido', async () => { await page.getByRole('link', { name: 'Saltar al contenido' }).focus(); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content'); });
  await page.setViewportSize({ width: 320, height: 800 }); await scan('Inventario móvil 320');
  await keyboardCheck('Menú móvil contiene el foco y permite salir con Escape', async () => { await button('Abrir menú').click(); await scan('Menú móvil abierto'); for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.querySelector('aside').contains(document.activeElement))); } await page.keyboard.press('Escape'); assert.equal(await button('Abrir menú').getAttribute('aria-expanded'), 'false'); assert.ok(await button('Abrir menú').evaluate(el => el === document.activeElement)); });
  await page.getByLabel('Cambiar rol simulado').selectOption('inventory');
  for (const name of ['panel', 'inventario', 'compras', 'movimientos', 'conteos', 'proveedores', 'configuracion']) { await route(name); await scan(`Encargado móvil · ${name}`); }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await scan('Movimiento reducido');
  await page.getByLabel('Cambiar rol simulado').selectOption('admin'); await route('movimientos'); await button('Registrar consumo').click(); await page.getByLabel('Cantidad de Harina de trigo').fill('700'); await dialog().getByRole('button', { name: 'Revisar consumo', exact: true }).click(); await dialog().getByRole('alert').waitFor(); await scan('Error de captura'); await close();
  await page.evaluate(async () => { const db = await new Promise(resolve => { const request = indexedDB.open('miga-y-cacao-inventario-demo-v1', 1); request.onsuccess = () => resolve(request.result); }); await new Promise(resolve => { const transaction = db.transaction('demo', 'readwrite'); transaction.objectStore('demo').put({ schemaVersion: 2, qaMarker: 'conservar' }, 'current'); transaction.oncomplete = resolve; }); db.close(); });
  await page.reload(); await page.getByRole('heading', { name: 'No pudimos cargar la demo' }).waitFor(); await scan('Recuperación de almacenamiento');
} finally {
  await fs.writeFile(`${output}/accessibility.json`, JSON.stringify({ scans, checks, errors }, null, 2));
  await context.close(); await browser.close();
}
const failures = scans.flatMap(s => s.violations.map(v => ({ pantalla: s.name, regla: v.id, impacto: v.impact, elementos: v.nodes.length, ejemplos: v.nodes.slice(0, 4).map(n => ({ target: n.target, reason: n.failureSummary })) })));
if (failures.length) console.log(JSON.stringify(failures, null, 2));
assert.equal(errors.length, 0, errors.join('\n'));
assert.equal(failures.length, 0, 'Resolver las incidencias antes de entregar');
console.log(`${scans.length} vistas sin incidencias automáticas; ${checks.length} comprobaciones de teclado aprobadas. La revisión automática no certifica cumplimiento completo.`);
