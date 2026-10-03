import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.DEMO_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.QA_ARTIFACTS || '.test-build/browser'; await fs.mkdir(artifacts, { recursive: true });
const dialog = () => page.getByRole('dialog');
const button = name => page.getByRole('button', { name, exact: true });
const dButton = name => dialog().getByRole('button', { name, exact: true });
const close = async () => { await dButton('Cerrar ventana').click(); await dialog().waitFor({ state: 'hidden' }); };
let passed = 0;
async function test(name, action) { await action(); passed++; console.log(`OK ${passed}: ${name}`); }
async function expectText(locator, text) { await locator.filter({ hasText: text }).first().waitFor(); }
async function route(path) { await page.goto(`${base}/#/${path}`); await page.getByRole('button', { name: /^Administrador/ }).click(); }
try {
  await test('IndexedDB real: transacciones, persistencia, conflictos, abortos y restablecimiento', async () => {
    await page.goto(`${base}/tests/storage.html`); await button('Ejecutar pruebas de almacenamiento').click();
    await page.getByRole('status').filter({ hasText: '13 de 13 pruebas aprobadas.' }).waitFor({ timeout: 20000 });
    assert.equal(await page.locator('#error').innerText(), '');
  });
  await test('Credenciales públicas y entrada simulada', async () => {
    await page.goto(base); await page.getByLabel('Correo de demostración').fill('admin@reposteria.example');
    await page.getByLabel('Contraseña de demostración').fill('Demo2026!'); await button('Entrar al taller').click();
    await page.getByRole('heading', { name: 'Todo listo para crear.' }).waitFor();
    await page.screenshot({ path: `${artifacts}/panel-escritorio.png`, fullPage: true });
  });
  await test('Una salida excesiva se rechaza y una salida válida actualiza existencias', async () => {
    await button('Registrar consumo').click(); await page.getByLabel('Cantidad de Harina de trigo').fill('700'); await dButton('Revisar consumo').click();
    await expectText(dialog().getByRole('alert'), /negativas|disponible|existencias/i);
    await page.getByLabel('Cantidad de Harina de trigo').fill('0.1'); await page.getByLabel('Motivo (opcional)', { exact: true }).fill('Prueba de navegador');
    await dButton('Revisar consumo').click(); await dButton('Confirmar registro').click(); await dialog().waitFor({ state: 'hidden' });
    await page.goto(`${base}/#/inventario`); await page.getByRole('heading', { name: 'Inventario', exact: true }).waitFor();
    await button('Ver Harina de trigo').click(); await expectText(dialog(), '599.9 g'); await close();
  });
  await test('Persistencia después de recargar', async () => {
    await page.reload(); await page.getByRole('button', { name: /^Administrador/ }).click(); await button('Ver Harina de trigo').click(); await expectText(dialog(), '599.9 g'); await close();
  });
  await test('Alta de insumo con dos presentaciones y conversión exacta', async () => {
    await button('Nuevo insumo').click(); await dialog().getByLabel('Nombre', { exact: true }).fill('Avena de demostración'); await dialog().getByLabel('Código único').fill('QA-AVENA');
    await dialog().getByLabel('Precio de referencia (MXN)', { exact: true }).fill('42.50'); await dButton('Agregar presentación').click();
    await dialog().getByLabel('Nombre de presentación', { exact: true }).nth(1).fill('Saco de 5 kg');
    await dialog().getByLabel('Contenido', { exact: true }).nth(1).fill('5'); await dialog().getByLabel(/^Unidad del contenido/).nth(1).selectOption('kg');
    await dButton('Revisar datos').click(); await expectText(dialog(), '5,000 g'); await dButton('Crear insumo').click(); await dialog().waitFor({ state: 'hidden' });
    await button('Ver Avena de demostración').click(); assert.equal(await dialog().locator('.presentation-card').count(), 2); await expectText(dialog(), 'Saco de 5 kg');
    await dButton('Entrada inicial').click(); await page.getByLabel('Cantidad de Avena de demostración').fill('1000'); await dButton('Revisar entrada').click(); await dButton('Confirmar registro').click(); await dialog().waitFor({ state: 'hidden' });
    await button('Ver Avena de demostración').click(); await dButton('Editar insumo').click(); assert.equal(await dialog().getByLabel(/^Unidad base/).isDisabled(), true); await close();
  });
  await test('Conteo guardado, revisión de diferencias y ajuste confirmado', async () => {
    await page.goto(`${base}/#/conteos`); await button('Nuevo conteo').click(); await dButton('Quitar selección').click();
    await dialog().getByLabel(/Avena de demostración/).check(); await dButton('Iniciar conteo').click();
    await page.getByLabel('Contado de Avena de demostración').fill('950'); await page.getByLabel('Motivo de los ajustes').fill('Conteo ficticio de verificación');
    await dButton('Guardar captura').click(); await expectText(dialog().getByRole('status'), 'Captura guardada');
    await dButton('Revisar diferencias').click(); await dButton('Confirmar ajustes').click(); await expectText(dialog(), 'Conteo confirmado.'); await close();
    await page.goto(`${base}/#/inventario`); await button('Ver Avena de demostración').click(); await expectText(dialog(), '950 g'); await close();
  });
  await test('Archivado y restauración conservan existencias e historial', async () => {
    await button('Ver Avena de demostración').click(); await dButton('Archivar').click(); await dButton('Confirmar archivado').click(); await dialog().waitFor({ state: 'hidden' });
    await page.getByLabel('Estado del catálogo').selectOption('archived'); await button('Ver Avena de demostración').click(); await expectText(dialog(), '950 g');
    await dButton('Restaurar').click(); await dButton('Restaurar insumo').click(); await dialog().waitFor({ state: 'hidden' }); await page.getByLabel('Estado del catálogo').selectOption('active');
  });
  await test('La reversión conserva el original y recupera la existencia', async () => {
    await page.goto(`${base}/#/movimientos`); await page.getByLabel('Buscar movimientos').fill('Prueba de navegador');
    await button('Ver operación').click(); await dButton('Corregir mediante reversión').click();
    await page.getByLabel('Motivo obligatorio de la reversión').fill('Corrección ficticia de prueba'); await dButton('Confirmar reversión').click();
    await expectText(dialog(), 'Original conservado.'); assert.equal(await dButton('Corregir mediante reversión').count(), 0); await close();
    await page.goto(`${base}/#/inventario`); await button('Ver Harina de trigo').click(); await expectText(dialog(), '600 g'); await close();
  });
  await test('Un conteo advierte un consumo posterior y exige volver a revisar', async () => {
    await page.goto(`${base}/#/conteos`); await button('Nuevo conteo').click(); await page.getByLabel('Nombre del conteo').fill('QA conteo simultáneo'); await dButton('Quitar selección').click();
    await dialog().getByLabel(/Avena de demostración/).check(); await dButton('Iniciar conteo').click();
    await page.getByLabel('Contado de Avena de demostración').fill('900'); await page.getByLabel('Motivo de los ajustes').fill('Comparación ficticia con movimientos posteriores');
    await dButton('Guardar captura').click(); await expectText(dialog().getByRole('status'), 'Captura guardada'); await close();
    await page.goto(`${base}/#/inventario`); await button('Ver Avena de demostración').click(); await dButton('Registrar consumo').click();
    await page.getByLabel('Cantidad de Avena de demostración').fill('25'); await dButton('Revisar consumo').click(); await dButton('Confirmar registro').click(); await dialog().waitFor({ state:'hidden' });
    await page.goto(`${base}/#/conteos`); await page.getByRole('row').filter({hasText:'QA conteo simultáneo'}).getByRole('button',{name:'Continuar'}).click();
    await expectText(dialog(), 'Hubo movimientos después'); await dButton('Revisar diferencias').click(); await expectText(dialog().getByRole('alert'), /revisa|revisión/i);
    await dialog().getByLabel('Revisé los movimientos y las existencias actuales.').check(); await dButton('Revisar diferencias').click(); await dButton('Confirmar ajustes').click();
    await expectText(dialog(), 'Conteo confirmado.'); await close();
  });
  await test('El encargado puede capturar y consultar, con acciones de administración ocultas', async () => {
    await page.getByLabel('Cambiar rol simulado').selectOption('inventory'); await page.goto(`${base}/#/inventario`);
    assert.equal(await button('Nuevo insumo').count(), 0); await button('Ver Avena de demostración').click();
    assert.equal(await dButton('Editar insumo').count(), 0); assert.equal(await dButton('Entrada inicial').count(), 0); await dButton('Registrar consumo').waitFor(); await close();
    await page.getByLabel('Cambiar rol simulado').selectOption('admin');
  });
  await test('El restablecimiento requiere confirmación y devuelve únicamente la demo de este contexto', async () => {
    await page.goto(`${base}/#/configuracion`); await button('Restablecer demo').click(); assert.equal(await dButton('Confirmar restablecimiento').isDisabled(), true);
    await dButton('Conservar mis datos').click(); await button('Restablecer demo').click(); await dialog().getByRole('checkbox').check(); await dButton('Confirmar restablecimiento').click(); await dialog().waitFor({state:'hidden'});
    await page.goto(`${base}/#/inventario`); assert.equal(await button('Ver Avena de demostración').count(), 0); await button('Ver Harina de trigo').click(); await expectText(dialog(), '600 g'); await close();
  });
  await test('Revisión adaptable en escritorio, tableta y móvil sin desbordamiento de página', async () => {
    for (const viewport of [{ width:1366, height:900 }, { width:768, height:1024 }, { width:390, height:844 }, { width:320, height:740 }]) {
      await page.setViewportSize(viewport);
      for (const path of ['panel', 'inventario', 'movimientos', 'conteos', 'configuracion']) {
        await page.goto(`${base}/#/${path}`); await page.getByRole('heading', { level: 1, name: { panel: 'Todo listo para crear.', inventario: 'Inventario', movimientos: 'Movimientos', conteos: 'Conteos físicos', configuracion: 'Configuración' }[path], exact: true }).waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        if (width.document > width.viewport + 1) console.log(await page.evaluate(() => ({scrollX, body:document.body.getBoundingClientRect().toJSON(), bodyOverflow:getComputedStyle(document.body).overflow, tables:[...document.querySelectorAll('.card,.table-scroll,table,dialog')].map(el => ({tag:el.tagName,class:el.className,r:el.getBoundingClientRect().toJSON(),scrollWidth:el.scrollWidth,scrollLeft:el.scrollLeft,overflow:getComputedStyle(el).overflow})),outside:[...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && !el.closest('.table-scroll') && !el.closest('dialog'); }).map(el => ({ tag:el.tagName, class:el.className, right:el.getBoundingClientRect().right, width:el.getBoundingClientRect().width })) })));
        assert.ok(width.document <= width.viewport + 1, `${path} desborda a ${viewport.width}px: ${JSON.stringify(width)}`);
      }
      if (viewport.width === 390) { await page.goto(`${base}/#/panel`); await page.screenshot({ path: `${artifacts}/panel-movil.png`, fullPage:true }); }
    }
  });
  assert.deepEqual(errors, []); console.log(`${passed} pruebas de navegador aprobadas; sin errores de JavaScript.`);
} catch (error) { await page.screenshot({ path: `${artifacts}/fallo.png`, fullPage:true }); console.error(await page.locator('body').innerText()); throw error; }
finally { await context.close(); await browser.close(); }
