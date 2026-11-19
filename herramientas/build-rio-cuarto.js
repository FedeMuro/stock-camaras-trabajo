/* Base inicial de Río Cuarto desde sus reportes, con la configuración guardada en la base anterior.
   Uso: node build-rio-cuarto.js <carpeta_archivos> <base_con_config> <carpeta_salida> */
'use strict';
const fs = require('fs'), path = require('path'), XLSX = require('xlsx');
const E = require('../src/engine.js'), C = require('../src/config.js'), IO = require('../src/io.js');
const [dir, baseCfg, out] = process.argv.slice(2);
const sede = IO.leerBase(XLSX.read(fs.readFileSync(baseCfg))).sede;
let tablas; const cargas = [];
['CRA_RIO_4_-_Stock', 'CRA_RIO_IV._-_SENTENCIAS', 'CRA_RIO_IV._-AVOC__AVC', 'CRA_RIO_IV._-ELEVACIONES', 'C_digos_EN_GRAL'].forEach(n => {
  const f = fs.readdirSync(dir).find(x => x.includes(n));
  IO.reconocer(f.replace(/^[0-9a-f]{8}-/, ''), fs.readFileSync(path.join(dir, f)), C.CATALOGO).piezas
    .forEach(p => { if (p.tipo === 'tablas') tablas = p; else cargas.push(IO.aCarga(p, 'c' + (cargas.length + 1))); });
});
const b = E.procesar({ sede, catalogo: C.CATALOGO, tablas, cargas });
if (!b.ok) throw new Error(b.errores.join('\n'));
const nb = E.confirmar(null, b, { fecha: '2026-11-18', autor: 'Base inicial (reportes SAC al 30/10)' });
fs.writeFileSync(path.join(out, `Base_Rio_Cuarto_${b.fechaCorte}_cierre1.xlsx`), IO.aBytes(IO.escribirBase(nb, tablas, sede)));
fs.writeFileSync(path.join(out, `Informe_Rio_Cuarto_${b.fechaCorte}.xlsx`), IO.aBytes(IO.armarInforme(b, sede, { numeroCierre: 1, autor: 'Base inicial', tablasOrigen: tablas.archivo })));
fs.writeFileSync(path.join(out, '_r4.json'), JSON.stringify({ stock: b.resumen.stock, sec: b.resumen.porSecretaria, ids: b.stock.map(x => x.exp),
  aviso: b.avisos.filter(a => a.tipo === 'Elevación posterior a la resolución').map(a => a.exp) }));
console.log('Río Cuarto', b.fechaCorte, b.resumen.stock, JSON.stringify(b.resumen.porSecretaria));
