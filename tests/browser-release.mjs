import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mount = '/Inventario_Sistema/';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
// Servidor de prueba del build: sin fallback de SPA ni acceso al código fuente.
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(mount)) { response.writeHead(404).end(); return; }
    const file = path.resolve(dist, pathname.slice(mount.length) || 'index.html');
    if (file !== path.join(dist, 'index.html') && !file.startsWith(`${dist}${path.sep}`)) { response.writeHead(404).end(); return; }
    const content = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${mount}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const errors = []; const requests = []; const failedResources = []; const contexts = [context];
context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
context.on('response', response => { if (response.status() >= 400) failedResources.push(response.url()); });
const output = process.env.QA_ARTIFACTS || '.test-build/release'; await fs.mkdir(output, { recursive: true });
const button = (p, name) => p.getByRole('button', { name, exact: true });
const dialog = p => p.getByRole('dialog');
const dButton = (p, name) => dialog(p).getByRole('button', { name, exact: true });
const text = async (locator, content) => locator.filter({ hasText: content }).first().waitFor();
const close = async p => { await dButton(p, 'Cerrar ventana').click(); await dialog(p).waitFor({ state: 'hidden' }); };
const login = async p => p.getByRole('button', { name: /^Administrador/ }).click();
const route = async (p, name) => { await p.goto(`${base}#/${name}`); await p.getByRole('heading', { level: 1 }).waitFor(); if (await p.getByRole('button', { name: /^Administrador/ }).count()) await login(p); await p.getByRole('heading', { level: 1, name: { panel: 'Todo listo para crear.', inventario: 'Inventario', compras: 'Compras', movimientos: 'Movimientos', conteos: 'Conteos físicos', proveedores: 'Proveedores' }[name], exact: true }).waitFor(); };
const dbName = 'miga-y-cacao-inventario-demo-v1';
async function stored(p) { return p.evaluate(async name => { const db = await new Promise((resolve, reject) => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); const value = await new Promise((resolve, reject) => { const r = db.transaction('demo').objectStore('demo').get('current'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close(); return value; }, dbName); }
async function capture(p, amount) { await button(p, 'Ver Harina de trigo').click(); await dButton(p, 'Registrar consumo').click(); await p.getByLabel('Cantidad de Harina de trigo').fill(amount); await p.getByLabel('Motivo (opcional)', { exact: true }).fill('QA de publicación: consumo ficticio'); await dButton(p, 'Revisar consumo').click(); }
let passed = 0;
async function test(name, action) { await action(); passed++; console.log(`OK ${passed}: ${name}`); }
try {
  await test('Build bajo ruta de repositorio: recursos, credenciales y enlaces directos', async () => {
    await page.goto(`${base}#/compras`); await page.getByLabel('Correo de demostración').fill('admin@reposteria.example'); await page.getByLabel('Contraseña de demostración').fill('Demo2026!'); await button(page, 'Entrar al taller').click();
    await page.getByRole('heading', { name: 'Compras', exact: true }).waitFor(); await page.reload(); await login(page); await text(page.getByRole('row'), 'OC-0041');
    assert.ok(requests.some(url => url.includes(`${mount}assets/`) && url.endsWith('.js')));
    assert.ok(requests.some(url => url.includes(`${mount}assets/`) && url.endsWith('.css')));
    assert.equal(failedResources.length, 0, failedResources.join('\n'));
    assert.equal((await page.request.get(`${base}tests/storage.html`)).status(), 404);
    assert.equal((await page.request.get(`${base}src/main.tsx`)).status(), 404);
  });
  await test('Compra parcial en producción incorpora inventario y enlace al comprobante', async () => {
    await page.getByRole('row').filter({ hasText: 'OC-0041' }).getByRole('button', { name: 'Ver orden', exact: true }).click(); await dButton(page, 'Registrar recepción').click();
    await page.getByLabel('Recibido de Mantequilla sin sal').fill('500'); await dButton(page, 'Revisar recepción').click(); await text(dialog(page), '2,300 g'); await dButton(page, 'Confirmar recepción').click(); await text(dialog(page), 'REC-0003');
    await dButton(page, 'Ver movimientos').click(); await dButton(page, 'Ver comprobante REC-0003').click(); await text(dialog(page), 'REC-0003'); await close(page);
    const state = await stored(page); assert.equal(state.receipts.filter(r => r.folio === 'REC-0003').length, 1);
  });
  await test('Dos pestañas: un conflicto conserva la captura y exige nueva revisión', async () => {
    await route(page, 'inventario'); await capture(page, '100'); const second = await context.newPage(); await route(second, 'inventario'); await capture(second, '50'); await dButton(second, 'Confirmar registro').click(); await dialog(second).waitFor({ state: 'hidden' });
    await dButton(page, 'Confirmar registro').click(); await text(dialog(page).getByRole('alert'), /cambiaron|cambió|revisa/i); await dButton(page, 'Revisar otra vez').click(); assert.equal(await page.getByLabel('Cantidad de Harina de trigo').inputValue(), '100');
    await dButton(page, 'Revisar consumo').click(); await text(dialog(page), '450 g'); await dButton(page, 'Confirmar registro').click(); await dialog(page).waitFor({ state: 'hidden' }); await second.close();
    await button(page, 'Ver Harina de trigo').click(); await text(dialog(page), '450 g'); await close(page);
  });
  await test('Una escritura abortada conserva datos y formulario y permite reintentar', async () => {
    const before = await stored(page); await capture(page, '10');
    await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { const result = put.apply(this, args); this.transaction.abort(); IDBObjectStore.prototype.put = put; return result; }; });
    await dButton(page, 'Confirmar registro').click(); await text(dialog(page).getByRole('alert'), /No se pudo guardar/); const after = await stored(page); assert.equal(after.revision, before.revision); assert.equal(after.movements.length, before.movements.length);
    await dButton(page, 'Confirmar registro').click(); await dialog(page).waitFor({ state: 'hidden' }); await button(page, 'Ver Harina de trigo').click(); await text(dialog(page), '440 g'); await close(page);
  });
  await test('CSV del build se descarga localmente con unidades y marca de demo', async () => {
    const downloadPromise = page.waitForEvent('download'); await button(page, 'Exportar inventario').click(); const download = await downloadPromise; const file = await download.path(); const content = await fs.readFile(file, 'utf8'); assert.ok(content.includes('DEMO PÚBLICA')); assert.ok(content.includes('Unidad')); await download.saveAs(`${output}/${download.suggestedFilename()}`);
  });
  await test('Perfil independiente: los cambios de una demo no alteran otra', async () => {
    const independent = await browser.newContext(); contexts.push(independent); const other = await independent.newPage(); await route(other, 'inventario'); await button(other, 'Ver Harina de trigo').click(); await text(dialog(other), '600 g'); await close(other);
    await page.reload(); await login(page); await button(page, 'Ver Harina de trigo').click(); await text(dialog(page), '440 g'); await close(page);
  });
  await test('Fechas futuras mantienen útiles los ejemplos iniciales y los atrasos', async () => {
    const futureContext = await browser.newContext(); contexts.push(futureContext); const future = await futureContext.newPage(); await future.clock.setFixedTime(new Date('2027-02-15T18:00:00Z')); await route(future, 'panel');
    await text(future.locator('.metric-card').filter({ hasText: 'Compras por recibir' }), '1 con fecha vencida'); const state = await stored(future); assert.equal(state.seededAt.slice(0, 10), '2027-02-15'); assert.ok(state.orders.some(o => o.expectedOn < '2027-02-15' && o.status === 'sent')); await text(future.locator('.purchase-period-card'), '2');
  });
  await test('Un estado corrupto muestra recuperación explícita y se conserva al recargar', async () => {
    const corruptContext = await browser.newContext(); contexts.push(corruptContext); const corrupt = await corruptContext.newPage(); await route(corrupt, 'inventario');
    await corrupt.evaluate(async name => { const db = await new Promise(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); }); await new Promise((resolve, reject) => { const t = db.transaction('demo', 'readwrite'); t.objectStore('demo').put({ schemaVersion: 2, qaMarker: 'conservar-estado-corrupto' }, 'current'); t.oncomplete = resolve; t.onabort = reject; }); db.close(); }, dbName);
    await corrupt.reload(); await corrupt.getByRole('heading', { name: 'No pudimos cargar la demo' }).waitFor(); assert.equal((await stored(corrupt)).qaMarker, 'conservar-estado-corrupto'); await button(corrupt, 'Volver a intentar').click(); await corrupt.getByRole('heading', { name: 'No pudimos cargar la demo' }).waitFor(); assert.equal((await stored(corrupt)).qaMarker, 'conservar-estado-corrupto');
    corrupt.once('dialog', d => d.dismiss()); await button(corrupt, 'Restablecer con confirmación').click(); assert.equal((await stored(corrupt)).qaMarker, 'conservar-estado-corrupto');
    corrupt.once('dialog', d => d.accept()); await button(corrupt, 'Restablecer con confirmación').click(); await login(corrupt); assert.equal((await stored(corrupt)).schemaVersion, 2); assert.equal((await stored(corrupt)).qaMarker, undefined);
  });
  await test('Una merma con varias partidas cuenta una operación; revertirla retira su indicador', async () => {
    await route(page, 'panel'); const metric = page.locator('.metric-card').filter({ hasText: 'Mermas esta semana' }); assert.equal(await metric.locator('strong').innerText(), '01');
    await button(page, 'Registrar merma').click(); await page.getByLabel('Cantidad de Harina de trigo').fill('10'); await dButton(page, 'Agregar insumo').click(); await dialog(page).getByRole('combobox', { name: /^Insumo/ }).nth(1).selectOption('huevos'); await page.getByLabel('Cantidad de Huevos').fill('1'); await page.getByLabel('Motivo obligatorio', { exact: true }).fill('QA merma agrupada'); await dButton(page, 'Revisar merma').click(); await dButton(page, 'Confirmar registro').click(); await dialog(page).waitFor({ state: 'hidden' }); assert.equal(await metric.locator('strong').innerText(), '02');
    await route(page, 'movimientos'); await page.getByLabel('Buscar movimientos').fill('QA merma agrupada'); await button(page, 'Ver operación').first().click(); await dButton(page, 'Corregir mediante reversión').click(); await page.getByLabel('Motivo obligatorio de la reversión').fill('QA: corrección de la merma'); await dButton(page, 'Confirmar reversión').click(); await text(dialog(page), 'Original conservado.'); await close(page);
    await route(page, 'panel'); assert.equal(await metric.locator('strong').innerText(), '01');
  });
  await test('Pantallas del build a 320, 390, 768 y 1366 px; sin errores ni peticiones externas', async () => {
    for (const width of [320, 390, 768, 1366]) { await page.setViewportSize({ width, height: 900 }); for (const name of ['panel', 'inventario', 'compras', 'conteos', 'proveedores']) { await route(page, name); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: desbordamiento a ${width}`); } if (width === 390) await page.screenshot({ path: `${output}/proveedores-movil.png`, fullPage: true }); }
    await route(page, 'panel'); await page.screenshot({ path: `${output}/panel-release.png`, fullPage: true });
    assert.equal(errors.length, 0, errors.join('\n')); assert.equal(requests.filter(url => !url.startsWith(base) && !url.startsWith('blob:') && !url.startsWith('data:')).length, 0, 'La demo solicitó un recurso externo'); assert.equal(failedResources.length, 0, failedResources.join('\n'));
  });
} finally {
  await fs.writeFile(`${output}/release.json`, JSON.stringify({ passed, errors, requests, failedResources, mount }, null, 2));
  await Promise.all(contexts.map(c => c.close())); await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(`${passed} pruebas del build estático aprobadas. No se publicó el sitio.`);
