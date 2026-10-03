import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = (process.env.DEMO_URL || 'https://miga-y-cacao-demo.vercel.app').replace(/\/$/, '');
const output = process.env.QA_ARTIFACTS || '.test-build/public';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const dialog = () => page.getByRole('dialog');
const dbtn = name => dialog().getByRole('button', { name, exact: true });
const waitText = text => dialog().filter({ hasText: text }).waitFor();
async function close() { await dbtn('Cerrar ventana').click(); await dialog().waitFor({ state: 'hidden' }); }
async function route(name) { await page.evaluate(name => { location.hash = `/${name}`; }, name); await page.getByRole('heading', { level: 1, name: { panel: 'Todo listo para crear.', inventario: 'Inventario', compras: 'Compras', movimientos: 'Movimientos', conteos: 'Conteos físicos', proveedores: 'Proveedores', configuracion: 'Configuración' }[name], exact: true }).waitFor(); }
async function order() { await route('compras'); await page.getByRole('row').filter({ hasText: 'OC-0041' }).getByRole('button', { name: 'Ver orden', exact: true }).click(); }
async function check(name, action) { await action(); checks.push(name); console.log(`OK ${checks.length}: ${name}`); }
try {
  await check('Acceso HTTPS anónimo sin sesión de Vercel', async () => { const response = await page.goto(`${base}/#/compras`); assert.equal(response.status(), 200); assert.equal(new URL(page.url()).origin, base); await page.getByRole('button', { name: /^Administrador/ }).waitFor(); assert.ok((await page.title()).includes('Miga y Cacao')); });
  await check('Acceso de administrador y recursos de producción', async () => { await page.getByRole('button', { name: /^Administrador/ }).click(); await route('panel'); for (const asset of await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(elements => elements.map(el => el.src || el.href))) { const response = await context.request.get(asset); assert.equal(response.status(), 200); } await page.screenshot({ path: `${output}/panel-publico.png`, fullPage: true }); });
  await check('Recepción parcial como encargado y restricciones del rol', async () => { await page.getByLabel('Cambiar rol simulado').selectOption('inventory'); await order(); assert.equal(await dbtn('Cerrar saldo pendiente').count(), 0); await dbtn('Registrar recepción').click(); await page.getByLabel('Recibido de Mantequilla sin sal').fill('500'); await dbtn('Revisar recepción').click(); await dbtn('Confirmar recepción').click(); await waitText('REC-0003'); assert.equal(await dbtn('Corregir recepción').count(), 0); });
  await check('Trazabilidad entre comprobante y movimientos', async () => { await dbtn('Ver movimientos').click(); await dbtn('Ver comprobante REC-0003').click(); await waitText('REC-0003'); await close(); });
  await check('Existencias y recepción persisten tras recargar', async () => { await page.reload(); await page.getByRole('button', { name: /^Administrador/ }).click(); await route('inventario'); await page.getByRole('button', { name: 'Ver Mantequilla sin sal', exact: true }).click(); await waitText('2,300 g'); await close(); await order(); await waitText('REC-0003'); await close(); });
  await check('Exportaciones CSV de inventario, movimientos y compras', async () => { for (const [name, label, marker] of [['inventario', 'Exportar inventario', 'Existencia'], ['movimientos', 'Exportar movimientos', 'Revierte movimiento'], ['compras', 'Exportar compras', 'Total MXN (por orden)']]) { await route(name); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: label, exact: true }).click(); const download = await pending; const contents = await fs.readFile(await download.path(), 'utf8'); assert.ok(contents.includes('DEMO PÚBLICA')); assert.ok(contents.includes(marker)); await download.saveAs(`${output}/${download.suggestedFilename()}`); } });
  await check('Documento de orden listo para impresión desde producción', async () => { await order(); await dbtn('Imprimir orden / PDF').click(); await page.frameLocator('iframe').locator('body').filter({ hasText: 'Orden de compra OC-0041' }).waitFor(); assert.ok((await page.frameLocator('iframe').locator('body').innerText()).includes('Sin validez fiscal')); await page.locator('iframe').evaluate(el => el.remove()); await close(); });
  await check('Pantallas adaptadas a 320, 390, 768 y 1366 píxeles', async () => { for (const width of [320, 390, 768, 1366]) { await page.setViewportSize({ width, height: width < 768 ? 844 : 900 }); for (const name of ['panel', 'inventario', 'compras', 'movimientos', 'conteos', 'proveedores', 'configuracion']) { await route(name); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: ${width}px`); } if (width === 390) { await route('compras'); await page.screenshot({ path: `${output}/compras-publicas-movil.png`, fullPage: true }); } } });
  await check('Perfil independiente conserva los ejemplos iniciales', async () => { const independent = await browser.newContext(); try { const fresh = await independent.newPage(); await fresh.goto(`${base}/#/inventario`); await fresh.getByRole('button', { name: /^Administrador/ }).click(); await fresh.getByRole('button', { name: 'Ver Mantequilla sin sal', exact: true }).click(); await fresh.getByRole('dialog').filter({ hasText: '1,800 g' }).waitFor(); } finally { await independent.close(); } });
  await check('Recorrido sin errores de JavaScript', async () => { assert.deepEqual(errors, []); });
} catch (error) {
  console.error(await page.locator('body').innerText());
  await page.screenshot({ path: `${output}/fallo-publico.png`, fullPage: true });
  throw error;
} finally {
  await fs.writeFile(`${output}/public.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, errors }, null, 2));
  await context.close(); await browser.close();
}
console.log(`${checks.length} comprobaciones públicas aprobadas.`);
