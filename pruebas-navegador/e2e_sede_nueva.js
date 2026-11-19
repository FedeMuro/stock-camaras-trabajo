'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
const f = re => path.join(dir, fs.readdirSync(dir).find(n => re.test(n)));
const APP = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const bajadas = []; page.on('download', d => bajadas.push(d));
  const cargar = async files => { const n = await page.evaluate(() => +(document.body.dataset.lecturas || 0)); await page.setInputFiles('#file', files); await page.waitForFunction(n => +(document.body.dataset.lecturas || 0) > n, n, { timeout: 180000 }); };
  const calc = async () => { const n = await page.evaluate(() => +(document.body.dataset.calculos || 0)); await page.click('#calcular'); await page.waitForFunction(n => +(document.body.dataset.calculos || 0) > n, n, { timeout: 180000 }); };
  const txt = sel => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());

  await page.goto(APP);
  console.log('opciones:', await page.$$eval('#sede option', o => o.map(x => x.textContent)));
  // 1) Elegir una sede equivocada y cargar los reportes de SF → debe avisar
  await page.selectOption('#sede', 'cruz-del-eje');
  await cargar([f(/stock_completo/), f(/REMISIONES_A_LA_CRA/), f(/410abf5e-RESOLUCIONES/), f(/AVOCAMIENTO_Y_AVC/), f(/C_digos_EN_GRAL/)]);
  console.log('1) aviso sede equivocada:', (await txt('#checklist')).slice(0, 200));
  // 2) Ir a sede nueva desde el aviso
  await page.click('#irNueva');
  await page.waitForSelector('#nGuardar');
  console.log('2) panel:', (await txt('#nueva')).slice(0, 420));
  console.log('   p3 bloqueado:', await page.$eval('#p3', e => e.classList.contains('inactivo')));
  // 3) Nombre corto que choca con una sede existente
  await page.click('#nGuardar');
  console.log('3) choque:', await txt('#nMsg'));
  // 4) Configurar con otro nombre
  await page.fill('#nNombre', 'Cámara del Trabajo - Prueba nueva'); await page.fill('#nCorto', 'Prueba nueva');
  await page.click('#nGuardar');
  console.log('4) sede:', await page.$eval('#sede', s => s.value), '·', await txt('#sedeInfo'));
  await calc();
  const stock = await page.evaluate(() => window.__stockApp.borrador.resumen.stock);
  console.log('   stock con la sede nueva:', stock, '·', (await page.$$eval('#previa .kpi', e => e.map(x => x.innerText.replace(/\s+/g, ' ')))).join(' | '));
  await page.screenshot({ path: path.join(out, 'nueva_panel.png'), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1000 } });
  await page.fill('#autor', 'Prueba');
  await page.click('#confirmar');
  const t0 = Date.now(); while (bajadas.length < 2 && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 200));
  const base = path.join(out, bajadas[0].suggestedFilename()); await bajadas[0].saveAs(base);
  console.log('   descargó:', bajadas.map(d => d.suggestedFilename()));
  // 5) Otra "PC": contexto nuevo sin almacenamiento, cargar solo la base → la sede vuelve sola
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(APP);
  const n = await p2.evaluate(() => +(document.body.dataset.lecturas || 0));
  await p2.setInputFiles('#file', [base]); await p2.waitForFunction(n => +(document.body.dataset.lecturas || 0) > n, n);
  console.log('5) otra PC:', await p2.$eval('#sede', s => s.value), '·', (await p2.$eval('#sedeInfo', e => e.innerText.replace(/\s+/g, ' '))).slice(0, 200));
  console.log('   ¿editar disponible con cierres?', !!(await p2.$('#editarSede')));
  // 6) Celular
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); await m.goto(APP); await m.selectOption('#sede', '__nueva');
  console.log('6) ancho 390:', await m.evaluate(() => document.documentElement.scrollWidth));
  console.log('Errores:', errs.length ? errs : 'ninguno');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
