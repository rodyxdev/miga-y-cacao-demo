import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.DEMO_URL || 'https://miga-y-cacao-demo.vercel.app';
const fixture = process.env.UPGRADE_FIXTURE || '.test-build/security-upgrade-0.5.0.json';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(15000);
async function stored(write) { return page.evaluate(async write => { const db = await new Promise((resolve, reject) => { const r = indexedDB.open('miga-y-cacao-inventario-demo-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); try { return await new Promise((resolve, reject) => { const tx = db.transaction('demo', write === undefined ? 'readonly' : 'readwrite'); const r = write === undefined ? tx.objectStore('demo').get('current') : tx.objectStore('demo').put(write, 'current'); let result; r.onsuccess = () => { result = r.result; }; tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }, write); }
const dialog = () => page.getByRole('dialog');
const button = name => dialog().getByRole('button', { name, exact: true });
try {
  const response = await page.goto(base); assert.equal(response.status(), 200); await page.getByRole('button', { name: /^Administrador/ }).waitFor();
  if (process.argv.includes('--prepare')) {
    assert.ok((await response.text()).includes('index-CzAL6zLA.js'), 'Preparar la muestra contra el build público original 0.5.0');
    await page.getByRole('button', { name: /^Administrador/ }).click(); await page.goto(`${base}/#/inventario`);
    await page.getByRole('button', { name: 'Ver Harina de trigo', exact: true }).click(); await button('Registrar consumo').click(); await page.getByLabel('Cantidad de Harina de trigo').fill('20'); await button('Revisar consumo').click(); await button('Confirmar registro').click(); await dialog().waitFor({ state: 'hidden' });
    await page.goto(`${base}/#/compras`); await page.getByRole('row').filter({ hasText: 'OC-0041' }).getByRole('button', { name: 'Ver orden', exact: true }).click(); await button('Registrar recepción').click(); await page.getByLabel('Recibido de Mantequilla sin sal').fill('100'); await button('Revisar recepción').click(); await button('Confirmar recepción').click(); await dialog().filter({ hasText: 'REC-0003' }).waitFor();
    const state = await stored(); await fs.writeFile(fixture, JSON.stringify({ sourceVersion: '0.5.0', checkedAt: new Date().toISOString(), state }, null, 2));
    console.log('Muestra de la producción 0.5.0 guardada: consumo de 20 g y recepción de 100 g en un perfil aislado.');
  } else {
    const { state: original } = JSON.parse(await fs.readFile(fixture, 'utf8')); await stored(original); await page.reload(); await page.getByRole('button', { name: /^Administrador/ }).click();
    const upgraded = await stored(); assert.equal(upgraded.generation, original.generation); assert.equal(upgraded.revision, original.revision + 1); for (const key of ['items','operations','movements','orders','receipts','suppliers','applied']) assert.deepEqual(upgraded[key], original[key], key);
    assert.notDeepEqual(upgraded.counts, original.counts); assert.equal(upgraded.audit.filter(e => e.action === 'Corregir documento de ejemplo').length, 1);
    await page.goto(`${base}/#/inventario`); await page.getByRole('button', { name: 'Ver Harina de trigo', exact: true }).click(); await dialog().filter({ hasText: '580 g' }).waitFor(); await button('Cerrar ventana').click(); await page.getByRole('button', { name: 'Ver Mantequilla sin sal', exact: true }).click(); await dialog().filter({ hasText: '1,900 g' }).waitFor(); await button('Cerrar ventana').click();
    await page.reload(); await page.getByRole('button', { name: /^Administrador/ }).click(); assert.deepEqual(await stored(), upgraded);
    console.log('Actualización 0.5.0 → 0.5.1 aprobada: catálogo, saldos, movimientos, órdenes y recepciones intactos; reparación del conteo trazable y aplicada una sola vez.');
  }
} finally { await context.close(); await browser.close(); }
