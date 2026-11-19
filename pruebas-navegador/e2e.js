/* Prueba de punta a punta en Chromium con los Excel reales. Uso: node e2e.js <carpeta_archivos> <carpeta_salida> */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
const f = re => path.join(dir, fs.readdirSync(dir).find(n => re.test(n)));
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const log = (...a) => console.log(...a);

async function calc(page, accion) {
  const n = await page.evaluate(() => Number(document.body.dataset.calculos || 0));
  await accion();
  await page.waitForFunction(n => Number(document.body.dataset.calculos || 0) > n, n, { timeout: 180000 });
}
async function cargar(page, archivos) {
  const n = await page.evaluate(() => Number(document.body.dataset.lecturas || 0));
  await page.setInputFiles('#file', archivos);
  await page.waitForFunction(n => Number(document.body.dataset.lecturas || 0) > n, n, { timeout: 180000 });
}
const kpis = page => page.$$eval('#previa .kpi', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const bajadas = []; page.on('download', d => bajadas.push(d));
  async function confirmarYBajar(pref) {
    const n0 = bajadas.length; await page.click('#confirmar');
    await page.waitForFunction(() => /confirmado|Indicá/.test(document.querySelector('#hecho').innerText), null, { timeout: 120000 });
    const t0 = Date.now(); while (bajadas.length < n0 + 2 && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 200));
    const rutas = [];
    for (const d of bajadas.slice(n0)) { const r = path.join(out, pref + d.suggestedFilename()); await d.saveAs(r); rutas.push(r); }
    return rutas;
  }
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  /* A) Cruz del Eje: primer cierre desde los reportes */
  await page.goto(APP);
  let t = Date.now();
  await cargar(page, [f(/STOCK_CRA_CRUZ/), f(/CRUZ_DEL_EJE_REMISIONES/), f(/CRUZ_DEL_EJE_-_RESOLUCIONES/), f(/CRUZ_DEL_EJE_AVOCAMIENTOS/), f(/C_digos_EN_GRAL/)]);
  log('A) lectura', ((Date.now() - t) / 1000).toFixed(1), 's · sede elegida:', await page.$eval('#sede', s => s.value));
  await page.selectOption('#sede', 'cruz-del-eje');
  log('   reconocidos:', await page.$$eval('#piezas tr td:first-child', tds => tds.map(x => x.innerText).filter(Boolean)));
  log('   control:', await page.$eval('#checklist', e => e.innerText.replace(/\s+/g, ' ')));
  t = Date.now(); await calc(page, () => page.click('#calcular'));
  log('   cálculo', ((Date.now() - t) / 1000).toFixed(1), 's · corte', await page.$eval('#corte', e => e.value), '·', (await kpis(page)).join(' | '));
  await page.screenshot({ path: path.join(out, 'e2e_cde_previa.png'), fullPage: false });
  await page.fill('#autor', 'Prueba automática');
  const rA = await confirmarYBajar('e2e_'); const baseCdE = rA.find(r => /Base_/.test(r));
  log('   descargas:', rA.map(r => path.basename(r)), '·', await page.$eval('#hecho', e => e.innerText));

  /* B) San Francisco: mes siguiente sobre la base inicial (mismos reportes del 03/11) */
  await page.goto(APP);
  await cargar(page, [path.resolve(process.env.BASE_SF || 'Base_San_Francisco_2026-11-03.xlsx'), f(/stock_completo/), f(/REMISIONES_A_LA_CRA/), f(/^.*410abf5e-RESOLUCIONES/), f(/AVOCAMIENTO_Y_AVC/)]);
  log('B) sede elegida por la base:', await page.$eval('#sede', s => s.value), '·', await page.$eval('#baseInfo', e => e.innerText.replace(/\s+/g, ' ')));
  await calc(page, () => page.click('#calcular'));
  log('   con la fecha sugerida:', await page.$eval('#errores', e => e.innerText.replace(/\s+/g, ' ')));
  await calc(page, () => page.fill('#corte', '2026-11-30').then(() => page.click('#calcular')));
  log('   corte 30/11:', (await kpis(page)).join(' | '));
  // anotar un expediente desde la ficha
  await page.fill('#buscar', '2761232'); await page.click('#btnBuscar');
  log('   ficha 2761232:', await page.$eval('#ficha', e => e.innerText.replace(/\s+/g, ' ').slice(0, 400)));
  await page.fill('#aObs', 'Nota de prueba'); await calc(page, () => page.click('#aGuardar'));
  await page.waitForSelector('#ficha table');
  log('   observación en la ficha:', await page.$eval('#aObs', e => e.value));
  log('   tras anotar:', await page.$eval('#previa', e => (e.innerText.match(/\d+ anotación\(es\)[^\n]*/) || [''])[0]));
  await page.screenshot({ path: path.join(out, 'e2e_sf_previa.png'), fullPage: true });
  await page.click('#confirmar');
  log('   sin autor:', await page.$eval('#hecho', e => e.innerText));
  await page.fill('#autor', 'Prueba automática');
  const rB = await confirmarYBajar('e2e_'); const baseSF2 = rB.find(r => /Base_/.test(r));
  log('   descargas:', rB.map(r => path.basename(r)));

  /* C) Volver a cargar la base vieja: debe avisar que no es la última */
  await page.goto(APP);
  await cargar(page, [path.resolve(process.env.BASE_SF || 'Base_San_Francisco_2026-11-03.xlsx')]);
  log('C) base vieja:', await page.$eval('#baseInfo', e => e.innerText.replace(/\s+/g, ' ')));

  /* D) Celular */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(APP); log('D) ancho de página en 390px:', await m.evaluate(() => document.documentElement.scrollWidth));
  // E) Leer la base del cierre 2 con el código de la app y verificar la anotación
  log('Errores de la página:', errs.length ? errs : 'ninguno');
  await browser.close();
  fs.writeFileSync(path.join(out, 'e2e_paths.json'), JSON.stringify({ baseCdE, baseSF2 }));
})().catch(e => { console.error(e); process.exit(1); });
