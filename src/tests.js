/* Pruebas de aceptación del motor (Especificación v2, §13) + casos multifuero.
   Ejecutar: node tests.js */
'use strict';
const E = require('./engine.js');
const { CATALOGO } = require('./config.js');

let ok = 0, fallas = 0;
const resultados = [];
function prueba(nombre, fn) {
  try { fn(); ok++; resultados.push(['OK', nombre]); }
  catch (e) { fallas++; resultados.push(['FALLA', nombre, e.message]); }
}
function igual(real, esperado, msg) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${msg || ''} → esperado ${b}, obtenido ${a}`);
}
function verdad(cond, msg) { if (!cond) throw new Error(msg); }

/* ---------- Escenario sintético ---------- */
const DEP = 'CAMARA DEL TRABAJO - PRUEBA';
const SEDE = { id: 'prueba', nombre: 'Prueba', tipo: 'especializada', dependencias: { [DEP]: 'Cámara' },
  gruposLaborales: ['CAMARAS DEL TRABAJO - PRUEBA'], causalElevacion: 'ELEVACION A JUICIO', resolucionesExtra: [] };
const TABLAS = { equivalencias: { 'ORDINARIO - DESPIDO': 'Ordinario', 'ORDINARIO - ACCIDENTE': 'Ordinario', 'AMPARO': 'Especiales', 'BENEFICIO': 'Otros' },
  materias: { 'ORDINARIO - DESPIDO': 'Laboral', 'ORDINARIO - ACCIDENTE': 'Laboral', 'AMPARO': 'Comun', 'DESALOJO': 'Civil' } };
const FILTRO_RES_COMPLETO = 'Filtros aplicados:\nTipo de Operacion es ' + CATALOGO.resolucionesAdmitidas.slice(0, -1).join(', ') + ' o ' + CATALOGO.resolucionesAdmitidas.slice(-1)[0];

const F = (exp, estado = 'ACTIVO', tipoJuicio = 'ORDINARIO - DESPIDO', extra = {}) =>
  Object.assign({ exp, estado, tipoJuicio, ubicacion: 'CASILLERO', grupo: 'CAMARAS DEL TRABAJO - PRUEBA', dependencia: DEP, fechaInicio: '2020-01-01', principalAnexo: 'Principal' }, extra);
const R = (exp, fecha, tipoRemision = 'ELEVACION A JUICIO', dep = DEP) => ({ exp, fecha, tipoRemision, dependenciaDestino: dep, tipoJuicio: 'ORDINARIO - DESPIDO', grupoDestino: 'CAMARAS DEL TRABAJO - PRUEBA' });
const O = (exp, fecha, tipoOperacion, dep = DEP) => ({ exp, fecha, tipoOperacion, dependencia: dep, tipoJuicio: 'ORDINARIO - DESPIDO', grupo: 'CAMARAS DEL TRABAJO - PRUEBA' });

function correr({ foto = [], rem = [], res = [], avc = [], base = null, fechaCorte, filtrosRes = FILTRO_RES_COMPLETO, filtrosFoto = 'Filtros aplicados:', sede = SEDE, tablas = TABLAS, extras = [] }) {
  const cargas = [
    { tipo: 'foto', archivo: 'foto.xlsx', filtros: filtrosFoto, filas: foto },
    { tipo: 'remisiones', archivo: 'remisiones.xlsx', filtros: '', filas: rem },
    { tipo: 'resoluciones', archivo: 'resoluciones.xlsx', filtros: filtrosRes, filas: res },
    { tipo: 'avocamiento', archivo: 'avoc.xlsx', filtros: '', filas: avc }
  ].concat(extras);
  return E.procesar({ sede, catalogo: CATALOGO, tablas, base, cargas, fechaCorte });
}
const fila = (b, exp) => b.consolidado.find(r => r.exp === String(exp));
const tieneAviso = (b, tipo, exp) => b.avisos.some(a => a.tipo === tipo && (exp === undefined || a.exp === String(exp)));

/* ---------- 1–17 ---------- */

prueba('1. Varias resoluciones admitidas: elige la más reciente', () => {
  const b = correr({ foto: [F(1)], res: [O(1, '2026-03-01', 'Sentencia'), O(1, '2026-05-10', 'Acuerdo (Sentencia Homologación)'), O(1, '2026-04-01', 'Sentencia')], fechaCorte: '2026-06-30' });
  igual([fila(b, 1).resolucionTipo, fila(b, 1).resolucionFecha], ['Acuerdo (Sentencia Homologación)', '2026-05-10']);
  igual(fila(b, 1).enStock, 'No');
});

prueba('2. Operación no admitida posterior (auto) no se toma como resolución', () => {
  const b = correr({ foto: [F(2)], res: [O(2, '2026-02-01', 'Sentencia'), O(2, '2026-05-01', 'Acuerdo (Auto que lo homologa)')], fechaCorte: '2026-06-30' });
  igual([fila(b, 2).resolucionTipo, fila(b, 2).resolucionFecha], ['Sentencia', '2026-02-01']);
  // Decisión 14/11: solo un auto → "Resuelta con operación Auto", sale del stock, aviso permanente
  const b2 = correr({ foto: [F(3)], res: [O(3, '2026-05-01', 'Acuerdo (Auto que lo homologa)')], fechaCorte: '2026-06-30' });
  igual([fila(b2, 3).situacion, fila(b2, 3).enStock], ['Resuelta con operación Auto', 'No']);
  verdad(tieneAviso(b2, 'Resuelta con operación Auto', 3), 'falta aviso para cargar la sentencia');
  // Con la política desactivada, el auto no resuelve
  const sinPolitica = Object.assign({}, CATALOGO, { autosCierran: false });
  const b3 = E.procesar({ sede: SEDE, catalogo: sinPolitica, tablas: TABLAS, fechaCorte: '2026-06-30', cargas: [
    { tipo: 'foto', filtros: '', filas: [F(3)] }, { tipo: 'resoluciones', filtros: FILTRO_RES_COMPLETO, filas: [O(3, '2026-05-01', 'Acuerdo (Auto que lo homologa)')] }] });
  igual(fila(b3, 3).enStock, 'Sí', 'sin política sigue pendiente');
  verdad(tieneAviso(b3, 'Auto homologatorio en causa pendiente', 3), 'falta aviso de auto');
  // Si después se carga la Sentencia, prevalece la Sentencia
  const b4 = correr({ foto: [F(3)], res: [O(3, '2026-05-01', 'Acuerdo (Auto que lo homologa)'), O(3, '2026-06-02', 'Sentencia')], fechaCorte: '2026-06-30' });
  igual([fila(b4, 3).situacion, fila(b4, 3).resolucionTipo], ['Resuelta', 'Sentencia']);
});

prueba('2b. Reclasificación manual: prevalece sobre la tabla, persiste y se avisa cada mes', () => {
  const b1 = correr({ foto: [F(5), F(6)], rem: [R(5, '2020-06-03'), R(6, '2020-06-03')], fechaCorte: '2026-05-31' });
  let base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  base = E.anotar(base, 5, 'tipoProcesoManual', 'Recurso de apelación', 'Fede', 'Planilla');
  base = E.anotar(base, 5, 'motivoReclasificacion', 'Remitida con causal ELEVACION A JUICIO; la causal correcta es RECURSO DE APELACION.', 'Fede');
  const b2 = correr({ base, foto: [F(5), F(6)], fechaCorte: '2026-06-30' });
  igual([fila(b2, 5).tipoProceso, fila(b2, 5).tipoProcesoTabla, fila(b2, 5).enStock], ['Recurso de apelación', 'Ordinario', 'No']);
  igual(b2.movimientos, [{ exp: '5', movimiento: 'Sale', motivo: 'Reclasificación manual: Recurso de apelación' }]);
  const base2 = E.confirmar(base, b2, { fecha: '2026-07-01' });
  const b3 = correr({ base: base2, foto: [F(5), F(6)], fechaCorte: '2026-07-31' });
  verdad(tieneAviso(b3, 'Reclasificación manual', 5) && fila(b3, 5).reclasificacion.includes('RECURSO DE APELACION'), 'la aclaración no persiste');
});

prueba('3. Varias elevaciones: elige la más antigua y su año', () => {
  const b = correr({ foto: [F(4)], rem: [R(4, '2024-08-01'), R(4, '2023-02-15'), R(4, '2025-01-01'), R(4, '2022-01-01', 'VISTA/TRASLADO')], fechaCorte: '2026-06-30' });
  igual([fila(b, 4).fechaElevacion, fila(b, 4).anioElevacion], ['2023-02-15', '2023']);
});

prueba('4. Clasificación de avocamiento: ninguno / solo avoc. / solo AVC / ambos', () => {
  const b = correr({ foto: [F(10), F(11), F(12), F(13)], fechaCorte: '2026-06-30', avc: [
    O(11, '2026-01-10', 'Avocamiento'),
    O(12, '2026-02-10', 'Audiencia de Vista de la Causa (decreto que la fija)'),
    O(13, '2026-01-05', 'Avocamiento'), O(13, '2026-03-01', 'Audiencia de Vista de la Causa - Acta')] });
  igual(['10', '11', '12', '13'].map(e => fila(b, e).clasificacion),
    ['Sin avocamiento', 'Avocada sin operación de AVC', 'Avocada con operación de AVC', 'Avocada con operación de AVC']);
  igual([fila(b, 13).ultimoAvocamiento, fila(b, 13).ultimaAvcFecha], ['2026-01-05', '2026-03-01']);
});

prueba('5. Empates de fecha: conserva ambos tipos y avisa', () => {
  const b = correr({ foto: [F(20)], fechaCorte: '2026-06-30', avc: [
    O(20, '2026-04-01', 'Audiencia de Vista de la Causa (decreto que la fija)'), O(20, '2026-04-01', 'Audiencia de Vista de la Causa - Acta')] });
  igual(fila(b, 20).ultimaAvcTipo, 'Audiencia de Vista de la Causa (decreto que la fija) | Audiencia de Vista de la Causa - Acta');
  igual(fila(b, 20).ultimaAvcFecha, '2026-04-01');
  verdad(tieneAviso(b, 'Empate de fecha', 20), 'falta aviso de empate');
});

prueba('6. Paralizada que pasa a activa (reactivación) y activa sin antecedente', () => {
  const b1 = correr({ foto: [F(30), F(31, 'PARALIZADO')], rem: [R(30, '2025-01-01')], fechaCorte: '2026-05-31' });
  verdad(!fila(b1, 31), 'la paralizada no entra a la foto inicial');
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const b2 = correr({ base, foto: [F(30), F(31), F(32)], rem: [R(30, '2025-01-01')], fechaCorte: '2026-06-30' });
  igual(fila(b2, 31).motivoIngreso, 'Reactivación');
  igual(fila(b2, 32).motivoIngreso, 'Activa sin antecedente');
  verdad(tieneAviso(b2, 'Antecedente insuficiente', 32), 'falta aviso de antecedente');
  igual(b2.movimientos.filter(m => m.movimiento === 'Entra').map(m => m.motivo), ['Reactivación', 'Activa sin antecedente']);
  verdad(b2.conciliacion.cierra, 'la conciliación no cierra');
});

prueba('7. Activa que pasa a paralizada sin resolución; causa ausente del corte', () => {
  const b1 = correr({ foto: [F(40), F(41), F(42)], rem: [R(40, '2025-01-01'), R(41, '2025-01-01'), R(42, '2025-01-01')], fechaCorte: '2026-05-31' });
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const b2 = correr({ base, foto: [F(40, 'PARALIZADO'), F(42)], fechaCorte: '2026-06-30' });
  igual([fila(b2, 40).situacion, fila(b2, 40).enStock], ['Pendiente', 'No'], 'paralizada no es resuelta');
  igual([fila(b2, 41).presente, fila(b2, 41).estado], ['No', 'ACTIVO'], 'conserva el último estado');
  verdad(tieneAviso(b2, 'No encontrada en el corte actual', 41), 'falta aviso de no encontrada');
  igual(b2.movimientos.map(m => m.motivo), ['Cambio de estado: PARALIZADO', 'No encontrada en el corte actual']);
  igual(b2.conciliacion, { corteAnterior: '2026-05-31', stockAnterior: 3, sale: 2, entra: 0, stockActual: 1, cierra: true });
});

prueba('8. Mismo expediente en varias fuentes sin duplicación', () => {
  const ev = O(50, '2026-03-01', 'Sentencia');
  const b = correr({ foto: [F(50), F(50)], res: [ev, ev], avc: [ev, O(50, '2026-01-01', 'Avocamiento')], fechaCorte: '2026-06-30' });
  igual(b._estado.eventos.filter(e => e.exp === '50').length, 2, 'sentencia una vez + avocamiento');
  igual(b.consolidado.filter(r => r.exp === '50').length, 1);
  verdad(tieneAviso(b, 'Duplicado en la foto', 50), 'falta aviso de duplicado');
});

prueba('9. Claves numéricas, de texto, con ceros iniciales e inválidas', () => {
  const b = correr({ foto: [F(123)], res: [O('000123', '2026-01-01', 'Sentencia'), O('123.0', '2026-02-01', 'Sentencia'), O(' 123 ', '2026-03-01', 'Sentencia'),
    O('12a', '2026-01-01', 'Sentencia'), O('', '2026-01-01', 'Sentencia'), O('1.2E+5', '2026-01-01', 'Sentencia'), O(12.5, '2026-01-01', 'Sentencia')], fechaCorte: '2026-06-30' });
  igual(fila(b, 123).resolucionFecha, '2026-03-01');
  igual(b.revision.map(r => r.motivo), ['Clave con texto', 'Clave vacía', 'Clave en notación científica', 'Clave con decimales']);
});

prueba('10. Fechas faltantes, en formato dd/mm/aaaa y posteriores al corte', () => {
  const b = correr({ foto: [F(60), F(61)], res: [O(60, '', 'Sentencia'), O(61, '03/04/2026', 'Sentencia'), O(60, '2026-08-01', 'Sentencia'), O(60, 46000, 'Avocamiento')], fechaCorte: '2026-06-30' });
  igual(b.revision.map(r => r.motivo), ['Fecha vacía o inválida']);
  igual(fila(b, 61).resolucionFecha, '2026-04-03', 'dd/mm/aaaa');
  igual([fila(b, 60).situacion, fila(b, 60).enStock], ['Pendiente', 'Sí'], 'la sentencia posterior al corte no cuenta');
  verdad(tieneAviso(b, 'Evento posterior al corte', 60), 'falta aviso de evento posterior');
  igual(fila(b, 60).ultimoAvocamiento, '2025-12-09', 'serial de Excel');
  igual(E.normalizarFecha('31/02/2026'), null, 'fecha imposible');
});

prueba('11. Reimportación y cambio de orden de filas no alteran el resultado', () => {
  const foto = [F(70), F(71), F(72, 'PARALIZADO'), F(73)];
  const res = [O(70, '2026-01-01', 'Sentencia'), O(71, '2026-02-01', 'Avocamiento'), O(73, '2026-02-01', 'Sentencia'), O(73, '2026-02-01', 'Acuerdo (Sentencia Homologación)')];
  const rem = [R(71, '2024-01-01'), R(73, '2023-01-01'), R(71, '2022-05-05')];
  const a = correr({ foto, res, rem, fechaCorte: '2026-06-30' });
  const b = correr({ foto: foto.slice().reverse(), res: res.slice().reverse().concat(res), rem: rem.slice().reverse(), fechaCorte: '2026-06-30' });
  igual(b.consolidado, a.consolidado);
  const base = E.confirmar(null, a, { fecha: '2026-07-01' });
  const c = correr({ base, foto, res, rem, fechaCorte: '2026-07-31' });
  igual(c._estado.eventos.length, a._estado.eventos.length, 'reimportar no duplica eventos');
});

prueba('12. Resolución y elevación posterior: la resolución prevalece y se avisa (decisión 18/11)', () => {
  // Primer cierre con el patrón de Río Cuarto: elevación, resolución y nueva elevación
  const b0 = correr({ foto: [F(79)], rem: [R(79, '2018-05-21'), R(79, '2018-06-26')], res: [O(79, '2018-06-07', 'Acuerdo (Sentencia Homologación)')], fechaCorte: '2026-05-31' });
  igual([fila(b0, 79).situacion, fila(b0, 79).enStock, fila(b0, 79).fechaElevacion], ['Resuelta', 'No', '2018-05-21']);
  verdad(tieneAviso(b0, 'A revisar: elevación posterior a la resolución', 79), 'falta el aviso');
  verdad(fila(b0, 79).revisar.includes('2018-06-26') && fila(b0, 79).revisarFecha === '2018-06-26', 'falta el dato para la hoja Causas a revisar');
  // Mes siguiente: una resolución vieja cargada tarde cierra la causa; una nueva elevación no reabre
  const b1 = correr({ foto: [F(80), F(81)], rem: [R(80, '2024-01-01'), R(81, '2024-01-01')], res: [O(81, '2025-01-01', 'Sentencia')], fechaCorte: '2026-05-31' });
  igual([fila(b1, 80).situacion, fila(b1, 81).situacion], ['Pendiente', 'Resuelta']);
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const b2 = correr({ base, foto: [F(80), F(81)], res: [O(80, '2023-06-01', 'Sentencia')], rem: [R(81, '2026-06-10')], fechaCorte: '2026-06-30' });
  igual([fila(b2, 80).situacion, fila(b2, 80).conflicto], ['Resuelta', 'Sí'], 'la resolución cargada tarde cierra');
  igual([fila(b2, 81).situacion, fila(b2, 81).conflicto], ['Resuelta', 'Sí'], 'la nueva elevación no reabre');
  verdad(tieneAviso(b2, 'A revisar: elevación posterior a la resolución', 80) && tieneAviso(b2, 'A revisar: elevación posterior a la resolución', 81), 'faltan avisos');
  igual(b2.movimientos, [{ exp: '80', movimiento: 'Sale', motivo: 'Resuelta: Sentencia (2023-06-01)' }]);
});

prueba('13. Preservación de campos manuales', () => {
  const b1 = correr({ foto: [F(90)], fechaCorte: '2026-05-31' });
  let base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  base = E.anotar(base, '90', 'vocal', 'Vocal M', 'Fede');
  base = E.anotar(base, 90, 'observacion', 'Pericia pendiente', 'Fede');
  const b2 = correr({ base, foto: [F(90)], fechaCorte: '2026-06-30' });
  const base2 = E.confirmar(base, b2, { fecha: '2026-07-01' });
  const b3 = correr({ base: base2, foto: [F(90)], fechaCorte: '2026-07-31' });
  igual([fila(b3, 90).vocal, fila(b3, 90).observacion], ['Vocal M', 'Pericia pendiente']);
  igual(base2.auditoria.length, 2);
});

prueba('14. Carga tardía: no modifica en silencio el cierre anterior', () => {
  const b1 = correr({ foto: [F(100)], fechaCorte: '2026-05-31' });
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const copia = JSON.stringify(base);
  const b2 = correr({ base, foto: [F(100)], res: [O(100, '2026-05-15', 'Sentencia')], fechaCorte: '2026-05-31' });
  verdad(!b2.ok && /no es posterior al último cierre/.test(b2.errores.join()), 'debía rechazar el corte');
  igual(JSON.stringify(base), copia, 'la base cambió');
  igual(base.consolidados[1].find(r => r.exp === '100').situacion, 'Pendiente', 'el cierre 1 conserva su valor');
});

prueba('15. Reversión de una carga (quitar un archivo antes de confirmar)', () => {
  const b1 = correr({ foto: [F(110)], fechaCorte: '2026-05-31' });
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const copia = JSON.stringify(base);
  const conExtra = correr({ base, foto: [F(110)], fechaCorte: '2026-06-30', extras: [{ tipo: 'resoluciones', archivo: 'equivocado.xlsx', filtros: FILTRO_RES_COMPLETO, filas: [O(110, '2026-06-10', 'Sentencia')] }] });
  igual(fila(conExtra, 110).situacion, 'Resuelta');
  const sinExtra = correr({ base, foto: [F(110)], fechaCorte: '2026-06-30' });
  igual(fila(sinExtra, 110).situacion, 'Pendiente');
  igual(JSON.stringify(base), copia, 'procesar no debe tocar la base');
});

prueba('16b. Equivalencia aprobada fuera de la tabla (RECURSO DE QUEJA = Otros), con su origen; la tabla manda', () => {
  const b = correr({ foto: [F(121, 'ACTIVO', 'RECURSO DE QUEJA')], fechaCorte: '2026-06-30' });
  igual([fila(b, 121).tipoProceso, fila(b, 121).enStock, fila(b, 121).equivalenciaOrigen], ['Otros', 'No', 'Aprobada por Fede el 18/11/2026']);
  verdad(!tieneAviso(b, 'Tipo de juicio sin equivalencia'), 'no debía avisar sin equivalencia');
  const t2 = { equivalencias: Object.assign({ 'RECURSO DE QUEJA': 'Especiales' }, TABLAS.equivalencias), materias: TABLAS.materias };
  const b2 = correr({ foto: [F(121, 'ACTIVO', 'RECURSO DE QUEJA')], fechaCorte: '2026-06-30', tablas: t2 });
  igual([fila(b2, 121).tipoProceso, fila(b2, 121).equivalenciaOrigen], ['Especiales', undefined], 'si la tabla la trae, manda la tabla');
});

prueba('16. Tipo de juicio sin equivalencia: va a avisos y no se inventa', () => {
  const b = correr({ foto: [F(120, 'ACTIVO', 'JUICIO NUEVO')], fechaCorte: '2026-06-30' });
  igual([fila(b, 120).tipoProceso, fila(b, 120).enStock], ['Sin equivalencia', 'No']);
  verdad(b.avisos.some(a => a.tipo === 'Tipo de juicio sin equivalencia' && a.detalle.includes('JUICIO NUEVO')), 'falta aviso');
});

prueba('17. Reporte de resoluciones sin un tipo admitido en su filtro: aviso de cobertura', () => {
  const sinDesist = 'Filtros aplicados:\nTipo de Operacion es ' + CATALOGO.resolucionesAdmitidas.filter(t => t !== 'Desistimiento de la Acción y Derecho (Sentencia Homologación)').join(', ');
  const b = correr({ foto: [F(130)], fechaCorte: '2026-06-30', filtrosRes: sinDesist });
  const cob = b.avisos.filter(a => a.tipo === 'Cobertura');
  igual(cob.length, 1);
  verdad(cob[0].detalle.includes('Desistimiento de la Acción y Derecho (Sentencia Homologación)'), 'el aviso no nombra el tipo faltante');
  const b2 = correr({ foto: [F(130)], fechaCorte: '2026-06-30' });
  igual(b2.avisos.filter(a => a.tipo === 'Cobertura').length, 0, 'filtro completo sin aviso');
});

/* ---------- Prueba de 5 meses ---------- */
prueba('Prueba de 5 meses: avocamiento → AVC → resolución, cada cierre conserva sus valores', () => {
  const foto = [F(200)];
  const meses = [
    ['2026-01-31', [], []],
    ['2026-02-28', [O(200, '2026-02-10', 'Avocamiento')], []],
    ['2026-03-31', [O(200, '2026-03-12', 'Audiencia de Vista de la Causa (decreto que la fija)')], []],
    ['2026-04-30', [], [O(200, '2026-04-20', 'Sentencia')]],
    ['2026-05-31', [], []]
  ];
  let base = null;
  const esperado = [
    ['Sin avocamiento', 'Pendiente', 'Sí'], ['Avocada sin operación de AVC', 'Pendiente', 'Sí'],
    ['Avocada con operación de AVC', 'Pendiente', 'Sí'], ['Avocada con operación de AVC', 'Resuelta', 'No'],
    ['Avocada con operación de AVC', 'Resuelta', 'No']];
  meses.forEach(([corte, avc, res], i) => {
    const b = correr({ base, foto, avc, res, rem: [R(200, '2025-12-01')], fechaCorte: corte }); // sin repetir eventos previos
    const f = fila(b, 200);
    igual([f.clasificacion, f.situacion, f.enStock], esperado[i], `mes ${i + 1}`);
    if (i === 2) igual(f.ultimoAvocamiento, '2026-02-10', 'el avocamiento del mes 2 persiste');
    base = E.confirmar(base, b, { fecha: corte });
  });
  igual(base.cierres.length, 5);
  igual([1, 2, 3, 4, 5].map(n => base.consolidados[n][0].situacion), ['Pendiente', 'Pendiente', 'Pendiente', 'Resuelta', 'Resuelta']);
  verdad(base.cierres.every((c, i) => i === 0 || c.huellaAnterior === base.cierres[i - 1].huella), 'cadena de huellas rota');
});

/* ---------- Multifuero ---------- */
const DEP_LAB = 'CAMARA MIXTA S. LAB - PRUEBA', DEP_CIV = 'CAMARA MIXTA S. CIV - PRUEBA';
const SEDE_MF = { id: 'mixta', nombre: 'Mixta', tipo: 'multifuero', dependencias: { [DEP_LAB]: 'SEC. LABORAL', [DEP_CIV]: 'SEC. CIVIL' },
  gruposLaborales: ['CAMARAS DEL TRABAJO - PRUEBA'], causalElevacion: 'ELEVACION A JUICIO', resolucionesExtra: [] };
const TABLAS_MF = { equivalencias: Object.assign({ 'DESALOJO': 'Ordinario' }, TABLAS.equivalencias), materias: TABLAS.materias };
const FL = (exp, tipoJuicio = 'ORDINARIO - DESPIDO', estado = 'ACTIVO') => F(exp, estado, tipoJuicio, { dependencia: DEP_LAB, grupo: 'CAMARAS DEL TRABAJO - PRUEBA' });
const FC = (exp, tipoJuicio) => F(exp, 'ACTIVO', tipoJuicio, { dependencia: DEP_CIV, grupo: 'CAMARAS APEL.CIV.COM.FLIA - PRUEBA' });

prueba('M1. Multifuero: grupo laboral cuenta; materia laboral en grupo civil cuenta con aviso; civil queda fuera', () => {
  const b = E.procesar({ sede: SEDE_MF, catalogo: CATALOGO, tablas: TABLAS_MF, fechaCorte: '2026-06-30', cargas: [
    { tipo: 'foto', archivo: 'foto', filtros: '', filas: [FL(300), FC(301, 'ORDINARIO - ACCIDENTE'), FC(302, 'DESALOJO'), FL(303, 'AMPARO'),
      F(304, 'ACTIVO', 'ORDINARIO - DESPIDO', { dependencia: 'OTRA CAMARA - OTRA LOCALIDAD' })] }] });
  igual(b.consolidado.map(r => [r.exp, r.criterio, r.enStock]), [
    ['300', 'Grupo laboral', 'Sí'], ['301', 'Materia laboral en grupo no laboral', 'Sí'], ['303', 'Grupo laboral', 'No']]);
  verdad(tieneAviso(b, 'Materia laboral en grupo no laboral', 301), 'falta aviso multifuero');
  igual(b.resumen.porSecretaria, { 'SEC. LABORAL': 1, 'SEC. CIVIL': 1 });
  igual(b.infoCargas[0].fueraDeSede, 1, 'R0: otra dependencia queda afuera');
});

prueba('M2. Multifuero: causa laboral que pasa a grupo no laboral sale con motivo', () => {
  const b1 = E.procesar({ sede: SEDE_MF, catalogo: CATALOGO, tablas: TABLAS_MF, fechaCorte: '2026-05-31', cargas: [{ tipo: 'foto', filtros: '', filas: [FL(310)] }] });
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const b2 = E.procesar({ sede: SEDE_MF, catalogo: CATALOGO, tablas: TABLAS_MF, base, fechaCorte: '2026-06-30', cargas: [{ tipo: 'foto', filtros: '', filas: [FC(310, 'DESALOJO')] }] });
  igual(b2.movimientos, [{ exp: '310', movimiento: 'Sale', motivo: 'Pasó a un grupo no laboral' }]);
  verdad(b2.conciliacion.cierra, 'no cierra');
});

prueba('M3. Foto solo de activas: aviso de cobertura', () => {
  const b = correr({ foto: [F(320)], fechaCorte: '2026-06-30', filtrosFoto: "Filtros aplicados:\n'vwExpedientes'[Localidad] es X\nEstado Expediente es ACTIVO" });
  verdad(tieneAviso(b, 'Cobertura'), 'falta aviso de foto parcial');
});

prueba('M4. Base de otra sede: se rechaza', () => {
  const b1 = correr({ foto: [F(330)], fechaCorte: '2026-05-31' });
  const base = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const b2 = E.procesar({ sede: SEDE_MF, catalogo: CATALOGO, tablas: TABLAS_MF, base, fechaCorte: '2026-06-30', cargas: [{ tipo: 'foto', filtros: '', filas: [] }] });
  verdad(!b2.ok && /es de la sede/.test(b2.errores.join()), 'debía rechazar la base');
});

prueba('M5. Denominación nueva con "Sentencia": candidata, no se admite sola', () => {
  const b = correr({ foto: [F(340)], res: [O(340, '2026-03-01', 'Sentencia Interlocutoria Nueva')], fechaCorte: '2026-06-30' });
  igual(fila(b, 340).enStock, 'Sí');
  verdad(tieneAviso(b, 'Denominación candidata'), 'falta aviso de candidata');
  const sedeConExtra = Object.assign({}, SEDE, { resolucionesExtra: ['Sentencia Interlocutoria Nueva'] });
  const b2 = correr({ sede: sedeConExtra, foto: [F(340)], res: [O(340, '2026-03-01', 'Sentencia Interlocutoria Nueva')], fechaCorte: '2026-06-30' });
  igual(fila(b2, 340).situacion, 'Resuelta', 'aprobada en la configuración de la sede');
});

prueba('M6. Fecha de corte sugerida = evento más reciente', () => {
  const b = correr({ foto: [F(350)], res: [O(350, '2026-10-30', 'Avocamiento')], rem: [R(350, '2026-11-03')] });
  igual(b.fechaCorte, '2026-11-03');
});

/* ---------- Compatibilidad con bases guardadas por versiones anteriores ---------- */
prueba('C1. Una base de la versión anterior se lee completa y sin aviso de modificación', () => {
  const fs = require('fs'), XLSX = require('xlsx'), IO = require('./io.js');
  // Se arma una base "vieja": sin las columnas agregadas después
  const b1 = correr({ foto: [F(400), F(401)], rem: [R(400, '2024-01-01')], res: [O(401, '2025-01-01', 'Sentencia')], fechaCorte: '2026-05-31' });
  const nb = E.confirmar(null, b1, { fecha: '2026-06-01' });
  const wb = IO.escribirBase(nb, TABLAS, SEDE);
  const ws = wb.Sheets.Consolidados, aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const quitar = ['revisar', 'revisarFecha', 'equivalenciaOrigen'].map(c => aoa[0].indexOf(c));
  const viejoAoa = aoa.map(r => r.filter((_, i) => !quitar.includes(i)));
  wb.Sheets.Consolidados = XLSX.utils.aoa_to_sheet(viejoAoa);
  // Huella como la calculaba la versión anterior (sobre las columnas que tenía)
  const E2 = require('./engine.js');
  const otras = Object.keys(IO.COLS).map(k => k + ':' + JSON.stringify(k === 'Consolidados' ? viejoAoa.slice(1).map(r => r.map(String))
    : XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, defval: '' }).slice(1).map(r => r.map(String)))).join('\n');
  const info = XLSX.utils.sheet_to_json(wb.Sheets.Info, { header: 1 }); info.find(r => r[0] === 'huellaContenido')[1] = E2.huella(otras);
  wb.Sheets.Info = XLSX.utils.aoa_to_sheet(info);
  const L = IO.leerBase(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
  igual(L.avisos, [], 'no debe avisar modificación');
  igual(L.base.consolidados[1].map(r => [r.exp, r.situacion, r.revisar]), [['400', 'Pendiente', ''], ['401', 'Resuelta', '']]);
  const b2 = correr({ base: L.base, foto: [F(400), F(401)], fechaCorte: '2026-06-30' });
  verdad(b2.ok && b2.conciliacion.cierra, 'el mes siguiente sobre la base vieja no cierra');
});

/* ---------- Informe ---------- */
resultados.forEach(r => console.log(r[0].padEnd(6), r[1], r[2] ? `\n       ${r[2]}` : ''));
console.log(`\n${ok} OK · ${fallas} con falla · ${ok + fallas} en total`);
process.exitCode = fallas ? 1 : 0;
