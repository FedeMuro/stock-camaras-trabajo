/* Arma el HTML único con todo incluido (funciona sin internet) y le agrega la política de seguridad.
   Uso: node build-html.js [salida]   (por defecto: entregas/App_Stock_Camaras_del_Trabajo.html) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const aqui = f => path.join(__dirname, f);
const leer = f => fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script');
const xlsx = (() => { try { return require.resolve('xlsx/dist/xlsx.full.min.js', { paths: [__dirname, process.cwd()] }); } catch (e) { return aqui('node_modules/xlsx/dist/xlsx.full.min.js'); } })();
let html = fs.readFileSync(aqui('app.src.html'), 'utf8');
const partes = { XLSX: xlsx, CONFIG: aqui('config.js'), ENGINE: aqui('engine.js'), IO: aqui('io.js'), UI: aqui('ui.js') };
for (const [k, f] of Object.entries(partes)) html = html.replace(`/*@@${k}@@*/`, () => leer(f));

// Anti-incrustación: la app no funciona dentro de un marco de otra página.
const antiMarco = "if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) {} document.documentElement.style.display = 'none'; }";
html = html.replace('<head>', `<head>\n<script>${antiMarco}</script>`);

// Política de seguridad: solo corren los scripts de este archivo (por su huella) y la página no puede
// conectarse a ningún servidor, enviar formularios ni cargar recursos externos.
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
const csp = ["default-src 'none'", `script-src ${hashes.join(' ')}`, "style-src 'unsafe-inline'", 'img-src data: blob:',
  "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "manifest-src 'none'"].join('; ');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="no-referrer">`);

const salida = process.argv[2] || aqui('entregas/App_Stock_Camaras_del_Trabajo.html');
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, html);
console.log('OK', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB ·', hashes.length, 'scripts autorizados →', path.relative(process.cwd(), salida));
