/* Arma las bases iniciales de San Francisco (desde la planilla + reportes del 03/11)
   y de Cruz del Eje (foto inicial desde sus reportes), con el mismo código de la app.
   Uso: node build-bases.js <carpeta_de_archivos> <carpeta_salida> */
'use strict';
const fs = require('fs'), path = require('path');
const XLSX = require('xlsx');
const E = require('../src/engine.js'), C = require('../src/config.js'), IO = require('../src/io.js');
const [dir, out] = process.argv.slice(2);
const buscar = re => { const f = fs.readdirSync(dir).find(n => re.test(n)); if (!f) throw new Error('No encontré ' + re); return f; };
const leer = re => { const f = buscar(re); return IO.reconocer(f.replace(/^[0-9a-f]{8}-/, ''), fs.readFileSync(path.join(dir, f)), C.CATALOGO); };
const informe = {};

function tablasDe(r) { const t = r.piezas.find(p => p.tipo === 'tablas'); return { equivalencias: t.equivalencias, materias: t.materias, archivo: t.archivo, conflictos: t.conflictos }; }
const tablas = tablasDe(leer(/C_digos_EN_GRAL/));
informe.tablas = { equivalencias: Object.keys(tablas.equivalencias).length, materias: Object.keys(tablas.materias).length, conflictos: tablas.conflictos.length };

function cargasDe(lecturas) {
  const cargas = [];
  lecturas.forEach(r => r.piezas.filter(p => p.tipo !== 'tablas' && p.tipo !== 'base').forEach(p => {
    const falta = IO.faltantes(p);
    if (falta.length) throw new Error(`${p.archivo} › ${p.hoja}: faltan ${falta.join(', ')}`);
    cargas.push(IO.aCarga(p, 'c' + (cargas.length + 1)));
  }));
  return cargas;
}

/* ---------- San Francisco ---------- */
{
  const sede = C.SEDES['san-francisco'];
  const sac = [/stock_completo/, /REMISIONES_A_LA_CRA/, /^410abf5e-RESOLUCIONES/, /AVOCAMIENTO_Y_AVC/].map(leer);
  const cargas = cargasDe(sac);
  // Planilla: hojas de operaciones (Resoluciones, Avocamientos, AVC). Su hoja "SAC" no se usa: la foto es la del 03/11.
  const pl = leer(/Stock_de_causas_activas/);
  pl.piezas.filter(p => ['resoluciones', 'avocamiento'].includes(p.tipo)).forEach(p => {
    const c = IO.aCarga(p, 'c' + (cargas.length + 1)); c.archivo = 'Planilla 01/11 › ' + p.hoja; c.filtros = 'Hoja de la planilla de stock (sin fila de filtros)'; cargas.push(c);
  });
  // LISTADO: datos cargados a mano
  const wbP = XLSX.read(fs.readFileSync(path.join(dir, buscar(/Stock_de_causas_activas/))), { cellDates: false });
  const L = XLSX.utils.sheet_to_json(wbP.Sheets.LISTADO, { header: 1, raw: true, defval: null }).slice(2);
  const H = L[0].map(String), ix = n => H.indexOf(n), rows = L.slice(1).filter(r => r[0] !== null);
  const DEP = Object.keys(sede.dependencias)[0], GR = sede.gruposLaborales[0];
  const fx = v => E.normalizarFecha(v);
  const manRes = rows.filter(r => r[ix('Tipo de resolución')]).map((r, i) => ({ _fila: i + 4, exp: r[0], fecha: r[ix('Fecha Resolución')], tipoOperacion: r[ix('Tipo de resolución')], tipoJuicio: r[ix('Tipo de Juicio')], dependencia: DEP, grupo: GR }));
  const manElev = rows.filter(r => fx(r[ix('Fecha de elev. a juicio')])).map((r, i) => ({ _fila: i + 4, exp: r[0], fecha: r[ix('Fecha de elev. a juicio')], tipoRemision: sede.causalElevacion, tipoJuicio: r[ix('Tipo de Juicio')], dependenciaDestino: DEP, grupoDestino: GR }));
  const filtroCat = 'Datos manuales de la planilla. Tipo de Operacion es ' + C.CATALOGO.resolucionesAdmitidas.join(', ');
  cargas.push({ id: 'c' + (cargas.length + 1), tipo: 'resoluciones', archivo: 'Planilla 01/11 › LISTADO (Tipo y Fecha de resolución)', filtros: filtroCat, filas: manRes });
  cargas.push({ id: 'c' + (cargas.length + 1), tipo: 'remisiones', archivo: 'Planilla 01/11 › LISTADO (Fecha de elev. a juicio)', filtros: 'Datos manuales de la planilla', filas: manElev });

  // Base de partida: el universo y el último estado de la planilla, más sus campos manuales
  let base = E.baseVacia(sede);
  const fotoIdx = new Set(cargas[0].filas.map(f => E.normalizarClave(f.exp).clave));
  let reclas = 0, notas = 0;
  rows.forEach(r => {
    const k = E.normalizarClave(r[0]); if (!k.ok) return;
    base.expedientes[k.clave] = { exp: k.clave, motivoIngreso: 'Planilla 01/11/2026', corteIngreso: '2026-11-01' };
    base.ultimos[k.clave] = { corte: '2026-11-01', estado: String(r[ix('Estado en SAC al 01/11/2026')] || '').toUpperCase(), ubicacion: r[ix('Ubicación en SAC al 01/11/2026')] || '',
      tipoJuicio: r[ix('Tipo de Juicio')] || '', grupo: GR, dependencia: DEP, fechaInicio: null, principalAnexo: '', criterio: 'Sede especializada' };
  });
  const anot = (exp, campo, valor, motivo) => { base = E.anotar(base, exp, campo, valor, 'Importación planilla 01/11', motivo); notas++; };
  rows.forEach(r => {
    const exp = r[0];
    const car = r[ix('Carátula')], obs = r[ix('Observación de la causa')], voc = r[ix('Vocal pre-asignado')];
    if (car) anot(exp, 'caratula', String(car)); if (obs) anot(exp, 'observacion', String(obs)); if (voc) anot(exp, 'vocal', String(voc));
    const tram = r[ix('Tipo de trámite')], tj = String(r[ix('Tipo de Juicio')] || '').trim();
    if (tram === 'Recurso de apelación' && tablas.equivalencias[tj] === 'Ordinario') {
      anot(exp, 'tipoProcesoManual', 'Recurso de apelación', 'Reclasificado a mano en la planilla');
      anot(exp, 'motivoReclasificacion', 'Reclasificada a mano en la planilla (dato del SAC). Si figura remitida con causal ELEVACION A JUICIO está mal remitida: la causal correcta es RECURSO DE APELACION.');
      reclas++;
    }
  });
  const b = E.procesar({ sede, catalogo: C.CATALOGO, tablas, base, cargas, fechaCorte: '2026-11-03' });
  if (!b.ok) throw new Error(b.errores.join('\n'));
  const nb = E.confirmar(base, b, { fecha: '2026-11-14', autor: 'Base inicial (planilla 01/11 + reportes SAC 03/11)' });
  const wb = IO.escribirBase(nb, tablas, sede);
  fs.writeFileSync(path.join(out, 'Base_San_Francisco_2026-11-03.xlsx'), IO.aBytes(wb));
  fs.writeFileSync(path.join(out, 'Informe_San_Francisco_2026-11-03.xlsx'), IO.aBytes(IO.armarInforme(b, sede, { numeroCierre: 1, autor: 'Base inicial', tablasOrigen: tablas.archivo })));
  const cu = {}; b.avisos.forEach(a => cu[a.tipo] = (cu[a.tipo] || 0) + 1);
  informe.sf = { stock: b.resumen.stock, universo: b.resumen.universo, porSituacion: b.resumen.porSituacion, sinFecha: b.resumen.porAnio['Sin fecha'], reclas, notas, avisos: cu,
    cargas: b.infoCargas.map(c => `${c.archivo}: ${c.recibidas} filas, ${c.aceptadas} aceptadas, ${c.fueraDeSede} de otra dep., ${c.fueraDeAlcance} fuera de alcance, ${c.observadas} observadas`),
    stockIds: b.stock.map(x => x.exp) };
}

/* ---------- Cruz del Eje ---------- */
{
  const sede = C.SEDES['cruz-del-eje'];
  const lect = [/STOCK_CRA_CRUZ/, /CRUZ_DEL_EJE_REMISIONES/, /CRUZ_DEL_EJE_-_RESOLUCIONES/, /CRUZ_DEL_EJE_AVOCAMIENTOS/].map(leer);
  const ign = lect.map(r => r.ignoradas);
  const cargas = cargasDe(lect);
  const b = E.procesar({ sede, catalogo: C.CATALOGO, tablas, cargas });
  if (!b.ok) throw new Error(b.errores.join('\n'));
  const nb = E.confirmar(null, b, { fecha: '2026-11-14', autor: 'Base inicial (foto de activos)' });
  fs.writeFileSync(path.join(out, `Base_Cruz_del_Eje_${b.fechaCorte}.xlsx`), IO.aBytes(IO.escribirBase(nb, tablas, sede)));
  fs.writeFileSync(path.join(out, `Informe_Cruz_del_Eje_${b.fechaCorte}.xlsx`), IO.aBytes(IO.armarInforme(b, sede, { numeroCierre: 1, autor: 'Base inicial', tablasOrigen: tablas.archivo })));
  const cu = {}; b.avisos.forEach(a => cu[a.tipo] = (cu[a.tipo] || 0) + 1);
  informe.cde = { corte: b.fechaCorte, stock: b.resumen.stock, porSecretaria: b.resumen.porSecretaria, porCriterio: b.resumen.porCriterio, porClasificacion: b.resumen.porClasificacion,
    sinFecha: b.resumen.porAnio['Sin fecha'], avisos: cu, ignoradas: ign, cobertura: b.avisos.filter(a => a.tipo === 'Cobertura').map(a => a.detalle),
    cargas: b.infoCargas.map(c => `${c.archivo}: ${c.recibidas} filas, ${c.aceptadas} aceptadas, ${c.fueraDeSede} de otra dep., ${c.fueraDeAlcance} fuera de alcance, ${c.observadas} observadas`),
    stock_: b.stock.map(x => [x.exp, x.secretaria, x.criterio, x.anioElevacion, x.clasificacion]) };
}
fs.writeFileSync(path.join(out, '_informe_build.json'), JSON.stringify(informe));
const { stockIds, ...sf } = informe.sf; const { stock_, ...cde } = informe.cde;
console.log(JSON.stringify({ tablas: informe.tablas, sf, cde }, null, 1));
