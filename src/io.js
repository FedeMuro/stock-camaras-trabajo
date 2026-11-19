/* Entrada y salida en Excel — App de stock de causas.
   Reconoce los reportes del SAC, lee y escribe el archivo de base y arma el informe.
   Requiere SheetJS (XLSX) y el motor (StockEngine). */
(function (root) {
  'use strict';
  const XLSX = root.XLSX || (typeof require !== 'undefined' ? require('xlsx') : null);
  const E = root.StockEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const APP_VERSION = '1.4';

  /* ---------- Encabezados ---------- */

  // "'vwDependencias'[Dependencia]" → "dependencia"; "N° de SAC" → "n de sac"
  function normEncabezado(h) {
    let s = String(h === null || h === undefined ? '' : h);
    const b = s.match(/\[([^\]]+)\]/);
    if (b) s = b[1];
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  const CAMPOS = {
    exp: ['nro expediente', 'n de sac', 'nro de expediente', 'idexpediente', 'n sac'],
    fechaInicio: ['fecha inicio', 'fecha de inicio del expediente', 'fecha de inicio'],
    tipoJuicio: ['tipo de juicio', 'tipo juicio'],
    tipoExpediente: ['tipo de expediente', 'tipo expediente'],
    principalAnexo: ['principal anexo'],
    estado: ['estado', 'estado expediente'],
    ubicacion: ['ubicacion', 'ubicacion expediente'],
    grupo: ['grupo'],
    dependencia: ['dependencia'],
    fecha: ['fecha de operacion', 'fecha'],
    tipoRemision: ['tipo remision', 'tipo de remision'],
    grupoDestino: ['grupo destino'],
    dependenciaDestino: ['dependencia destino'],
    tipoOperacion: ['tipo operacion', 'tipo de operacion'],
    localidad: ['localidad', 'descriplocalidad']
  };
  const NOMBRES = { exp: 'Nro. Expediente', fechaInicio: 'Fecha Inicio', tipoJuicio: 'Tipo de Juicio', tipoExpediente: 'Tipo de Expediente',
    principalAnexo: 'Principal - Anexo', estado: 'Estado', ubicacion: 'Ubicacion', grupo: 'Grupo', dependencia: 'Dependencia',
    fecha: 'Fecha', tipoRemision: 'Tipo Remision', grupoDestino: 'Grupo Destino', dependenciaDestino: 'Dependencia Destino', tipoOperacion: 'Tipo Operacion', localidad: 'Localidad' };
  const REQUERIDOS = {
    foto: ['exp', 'estado', 'tipoJuicio', 'grupo', 'dependencia'],
    remisiones: ['exp', 'fecha', 'tipoRemision', 'dependenciaDestino'],
    resoluciones: ['exp', 'fecha', 'tipoOperacion', 'dependencia'],
    avocamiento: ['exp', 'fecha', 'tipoOperacion', 'dependencia']
  };
  const OPCIONALES = {
    foto: ['fechaInicio', 'tipoExpediente', 'principalAnexo', 'ubicacion', 'localidad'],
    remisiones: ['tipoJuicio', 'grupoDestino', 'localidad'],
    resoluciones: ['tipoJuicio', 'grupo'],
    avocamiento: ['tipoJuicio', 'grupo']
  };
  const ETIQUETA = { foto: 'Foto SAC', remisiones: 'Remisiones', resoluciones: 'Resoluciones', avocamiento: 'Avocamiento y AVC',
    tablas: 'Tabla de equivalencias', base: 'Archivo de base' };

  function mapearColumnas(encabezados) {
    const n = encabezados.map(normEncabezado);
    const mapa = {};
    Object.keys(CAMPOS).forEach(campo => {
      for (const alias of CAMPOS[campo]) { const i = n.indexOf(alias); if (i >= 0) { mapa[campo] = i; break; } }
    });
    return mapa;
  }

  function filas(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }); }

  /* ---------- Reconocimiento ---------- */

  function tipoOperaciones(filtros, rows, desde, iTipo, catalogo) {
    const f = String(filtros || '');
    if (/Tipo Caracter es Sentencias|Sentencia s\/fondo|Acuerdo \(Sentencia/i.test(f)) return 'resoluciones';
    if (/Tipo Caracter es Decretos|Avocamiento|Vista de la Causa/i.test(f)) return 'avocamiento';
    let res = 0, avc = 0;
    for (let i = desde; i < rows.length && i < desde + 3000; i++) {
      const t = String(rows[i][iTipo] || '').trim();
      if (catalogo.avocamiento[t]) avc++; else if (t) res++;
    }
    return avc > res ? 'avocamiento' : 'resoluciones';
  }

  // Devuelve una lista de "piezas" reconocidas (una por hoja útil) y las hojas ignoradas.
  function reconocer(nombreArchivo, data, catalogo) {
    const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false });
    const piezas = [], ignoradas = [];
    if (wb.Sheets.Info && wb.Sheets.Eventos) {
      return { piezas: [{ archivo: nombreArchivo, hoja: 'Info', tipo: 'base', wb }], ignoradas: [] };
    }
    let tablas = null;
    wb.SheetNames.forEach(hoja => {
      const rows = filas(wb.Sheets[hoja]);
      if (!rows.length) { ignoradas.push(hoja); return; }
      // Tabla de equivalencias (CODIGOS) y de materias (JUICIOS GRAL)
      const h0 = (rows[0] || []).map(normEncabezado);
      const iTj = h0.indexOf('tipo de juicio'), iTp = h0.indexOf('tipo de proceso');
      if (iTj >= 0 && iTp >= 0) {
        tablas = tablas || { archivo: nombreArchivo, tipo: 'tablas', hoja, equivalencias: {}, materias: {}, conflictos: [] };
        rows.slice(1).forEach(r => {
          const tj = r[iTj] === null ? '' : String(r[iTj]).trim(), tp = r[iTp] === null ? '' : String(r[iTp]).trim();
          if (!tj || !tp) return;
          if (tablas.equivalencias[tj] && tablas.equivalencias[tj] !== tp) tablas.conflictos.push(`${tj}: ${tablas.equivalencias[tj]} / ${tp}`);
          else tablas.equivalencias[tj] = tp;
        });
        return;
      }
      const iMat = h0.indexOf('materia');
      const iTj2 = h0.findIndex(h => h.startsWith('tipo de juicio'));
      if (iMat >= 0 && iTj2 >= 0) {
        tablas = tablas || { archivo: nombreArchivo, tipo: 'tablas', hoja, equivalencias: {}, materias: {}, conflictos: [] };
        rows.slice(1).forEach(r => { const tj = r[iTj2] === null ? '' : String(r[iTj2]).trim(); if (tj && r[iMat]) tablas.materias[tj] = String(r[iMat]).trim(); });
        tablas.hojaMaterias = hoja;
        return;
      }
      // Reportes del SAC: buscar la fila de encabezados en las primeras 6
      let ih = -1, mapa = null;
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const m = mapearColumnas(rows[i] || []);
        if (m.exp !== undefined && Object.keys(m).length >= 4) { ih = i; mapa = m; break; }
      }
      if (ih < 0) { ignoradas.push(hoja); return; }
      const c0 = rows[0] && rows[0][0];
      const filtros = (typeof c0 === 'string' && /^Filtros aplicados/i.test(c0)) ? c0 : '';
      let tipo = null;
      if (mapa.tipoRemision !== undefined) tipo = 'remisiones';
      else if (mapa.tipoOperacion !== undefined) tipo = tipoOperaciones(filtros, rows, ih + 1, mapa.tipoOperacion, catalogo);
      else if (mapa.estado !== undefined && mapa.ubicacion !== undefined) tipo = 'foto';
      if (!tipo) { ignoradas.push(hoja); return; }
      piezas.push({ archivo: nombreArchivo, hoja, tipo, filtros, encabezados: rows[ih].map(v => v === null ? '' : String(v)),
        filaEncabezado: ih + 1, mapa, rows, desde: ih + 1 });
    });
    if (tablas) piezas.unshift(tablas);
    return { piezas, ignoradas };
  }

  function faltantes(pieza) {
    return (REQUERIDOS[pieza.tipo] || []).filter(c => pieza.mapa[c] === undefined);
  }

  // Convierte una pieza reconocida en una carga para el motor.
  function aCarga(pieza, id) {
    const campos = REQUERIDOS[pieza.tipo].concat(OPCIONALES[pieza.tipo]);
    const out = [];
    for (let i = pieza.desde; i < pieza.rows.length; i++) {
      const r = pieza.rows[i];
      if (!r || r.every(v => v === null || v === '')) continue;
      const f = { _fila: i + 1 };
      campos.forEach(c => { if (pieza.mapa[c] !== undefined) f[c] = r[pieza.mapa[c]]; });
      out.push(f);
    }
    return { id, tipo: pieza.tipo, archivo: `${pieza.archivo} › ${pieza.hoja}`, filtros: pieza.filtros, filas: out };
  }

  /* ---------- Archivo de base ---------- */

  const COLS = {
    Cierres: ['numero', 'fechaCorte', 'confirmado', 'autor', 'estado', 'reglasVersion', 'huellaAnterior', 'huella', 'stock'],
    Universo: ['exp', 'motivoIngreso', 'corteIngreso'],
    Ultimos: ['exp', 'corte', 'estado', 'ubicacion', 'tipoJuicio', 'grupo', 'dependencia', 'fechaInicio', 'principalAnexo', 'criterio'],
    Eventos: ['huella', 'exp', 'familia', 'tipo', 'fecha', 'funcional', 'tipoJuicio', 'grupo', 'dependencia', 'fuente', 'cargaId'],
    Consolidados: ['cierre', 'exp', 'enStock', 'situacion', 'tipoProceso', 'tipoProcesoTabla', 'reclasificacion', 'criterio', 'secretaria', 'presente', 'estado', 'ubicacion',
      'tipoJuicio', 'grupo', 'dependencia', 'fechaInicio', 'principalAnexo', 'corteEstado', 'fechaElevacion', 'anioElevacion', 'clasificacion',
      'ultimoAvocamiento', 'ultimaAvcTipo', 'ultimaAvcFecha', 'resolucionTipo', 'resolucionFecha', 'resolucionFuente', 'autoTipo', 'autoFecha',
      'conflicto', 'revisar', 'revisarFecha', 'equivalenciaOrigen', 'motivoIngreso', 'corteIngreso', 'observacion', 'caratula', 'vocal', 'avisos'],
    Anotaciones: ['exp', 'campo', 'valor'],
    Auditoria: ['exp', 'campo', 'anterior', 'nuevo', 'autor', 'motivo', 'fecha'],
    Cargas: ['cierre', 'corte', 'id', 'archivo', 'tipo', 'recibidas', 'aceptadas', 'fueraDeSede', 'fueraDeAlcance', 'observadas', 'filtros'],
    Equivalencias: ['tipoJuicio', 'tipoProceso', 'materia']
  };
  // Columnas agregadas después de la v1.0: una base vieja que no las tiene se sigue leyendo.
  const AGREGADAS = { Consolidados: ['revisar', 'revisarFecha', 'equivalenciaOrigen'] };
  const s = v => (v === null || v === undefined) ? '' : String(v);

  function tablasBase(base, tablas) {
    const t = {};
    t.Cierres = base.cierres.map(c => COLS.Cierres.map(k => s(c[k])));
    t.Universo = Object.keys(base.expedientes).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => COLS.Universo.map(c => s(base.expedientes[k][c])));
    t.Ultimos = Object.keys(base.ultimos).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => [k].concat(COLS.Ultimos.slice(1).map(c => s(base.ultimos[k][c]))));
    t.Eventos = base.eventos.map(e => COLS.Eventos.map(c => s(e[c])));
    t.Consolidados = [];
    Object.keys(base.consolidados).map(Number).sort((a, b) => a - b).forEach(n => base.consolidados[n].forEach(r => t.Consolidados.push(COLS.Consolidados.map(c => c === 'cierre' ? String(n) : s(r[c])))));
    t.Anotaciones = [];
    Object.keys(base.anotaciones).forEach(exp => Object.keys(base.anotaciones[exp]).forEach(campo => { if (s(base.anotaciones[exp][campo]) !== '') t.Anotaciones.push([exp, campo, s(base.anotaciones[exp][campo])]); }));
    t.Auditoria = base.auditoria.map(a => COLS.Auditoria.map(c => s(a[c])));
    t.Cargas = base.cargas.map(a => COLS.Cargas.map(c => s(a[c])));
    const eq = tablas.equivalencias || {}, mat = tablas.materias || {};
    t.Equivalencias = Array.from(new Set(Object.keys(eq).concat(Object.keys(mat)))).sort().map(k => [k, s(eq[k]), s(mat[k])]);
    return t;
  }

  function huellaTablas(t) {
    return E.huella(Object.keys(COLS).map(k => k + ':' + JSON.stringify(t[k])).join('\n'));
  }

  function escribirBase(base, tablas, sede) {
    const t = tablasBase(base, tablas);
    const h = huellaTablas(t);
    const ult = base.cierres[base.cierres.length - 1] || {};
    const wb = XLSX.utils.book_new();
    const info = [['Clave', 'Valor'], ['formato', 'stock-base'], ['versionApp', APP_VERSION], ['reglasVersion', s(base.reglasVersion)],
      ['sedeId', base.sedeId], ['sede', sede ? sede.nombre : ''], ['cierres', String(base.cierres.length)], ['ultimoCorte', s(ult.fechaCorte)],
      ['huellaUltimoCierre', s(ult.huella)], ['huellaContenido', h], ['generado', new Date().toISOString()],
      ['configuracionSede', sede ? JSON.stringify(sede) : ''],
      ['aviso', 'Archivo generado por la App de stock. No editar a mano: la app detecta cambios por la huella.']];
    const wsInfo = XLSX.utils.aoa_to_sheet(info); wsInfo['!cols'] = [{ wch: 22 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
    Object.keys(COLS).forEach(k => {
      const ws = XLSX.utils.aoa_to_sheet([COLS[k]].concat(t[k]));
      XLSX.utils.book_append_sheet(wb, ws, k);
    });
    return wb;
  }

  function leerBase(wb) {
    const info = {};
    filas(wb.Sheets.Info).slice(1).forEach(r => { if (r[0]) info[r[0]] = r[1] === null ? '' : String(r[1]); });
    if (info.formato !== 'stock-base') throw new Error('El archivo no es una base de la App de stock.');
    const t = {}, crudo = {};
    Object.keys(COLS).forEach(k => {
      const ws = wb.Sheets[k];
      if (!ws) throw new Error(`A la base le falta la hoja "${k}".`);
      const rows = filas(ws);
      const enc = (rows[0] || []).map(v => v === null ? '' : String(v));
      // Las columnas agregadas en versiones posteriores pueden faltar en bases viejas: quedan vacías.
      const idx = COLS[k].map(c => enc.indexOf(c));
      const faltan = COLS[k].filter((c, i) => idx[i] < 0 && !(AGREGADAS[k] || []).includes(c));
      if (faltan.length) throw new Error(`La hoja "${k}" de la base no tiene las columnas esperadas (faltan: ${faltan.join(', ')}).`);
      t[k] = rows.slice(1).map(r => idx.map(i => i < 0 ? '' : s(r[i])));
      // La huella se calcula sobre las columnas tal como están en el archivo (sirve para bases de cualquier versión).
      crudo[k] = rows.slice(1).map(r => enc.map((_, i) => s(r[i])));
    });
    const avisos = [];
    if (huellaTablas(crudo) !== info.huellaContenido) avisos.push('La base fue modificada fuera de la app (la huella no coincide). Se puede usar, pero conviene partir del archivo original.');
    const obj = (cols, r) => { const o = {}; cols.forEach((c, i) => { if (r[i] !== '') o[c] = r[i]; }); return o; };
    const base = E.baseVacia({ id: info.sedeId });
    base.reglasVersion = info.reglasVersion;
    base.cierres = t.Cierres.map(r => { const o = obj(COLS.Cierres, r); o.numero = Number(o.numero); o.stock = Number(o.stock); o.huellaAnterior = o.huellaAnterior || ''; return o; });
    t.Universo.forEach(r => { base.expedientes[r[0]] = obj(COLS.Universo, r); });
    t.Ultimos.forEach(r => { const o = obj(COLS.Ultimos, r); delete o.exp; base.ultimos[r[0]] = o; });
    base.eventos = t.Eventos.map(r => obj(COLS.Eventos, r));
    t.Consolidados.forEach(r => { const o = obj(COLS.Consolidados, r); const n = Number(o.cierre); delete o.cierre;
      COLS.Consolidados.forEach(c => { if (c !== 'cierre' && o[c] === undefined) o[c] = c === 'fechaElevacion' || c === 'fechaInicio' ? null : ''; });
      (base.consolidados[n] = base.consolidados[n] || []).push(o); });
    t.Anotaciones.forEach(r => { (base.anotaciones[r[0]] = base.anotaciones[r[0]] || {})[r[1]] = r[2]; });
    base.auditoria = t.Auditoria.map(r => obj(COLS.Auditoria, r));
    base.cargas = t.Cargas.map(r => obj(COLS.Cargas, r));
    const tablas = { equivalencias: {}, materias: {} };
    t.Equivalencias.forEach(r => { if (r[1]) tablas.equivalencias[r[0]] = r[1]; if (r[2]) tablas.materias[r[0]] = r[2]; });
    // Integridad de la cadena de cierres
    base.cierres.forEach((c, i) => { if (i && c.huellaAnterior !== base.cierres[i - 1].huella) avisos.push(`La cadena de cierres está rota en el cierre ${c.numero}.`); });
    let sede = null; try { sede = info.configuracionSede ? JSON.parse(info.configuracionSede) : null; } catch (e) { /* se ignora */ }
    return { base, tablas, info, avisos, sede };
  }

  /* ---------- Informe ---------- */

  const ENC = {
    exp: 'N° de SAC', enStock: 'En stock', situacion: 'Situación', tipoProceso: 'Tipo de proceso', tipoProcesoTabla: 'Tipo de proceso (tabla)',
    reclasificacion: 'Reclasificación manual', criterio: 'Universo laboral', secretaria: 'Secretaría', presente: 'En la foto actual', estado: 'Estado SAC',
    ubicacion: 'Ubicación SAC', tipoJuicio: 'Tipo de juicio', grupo: 'Grupo', dependencia: 'Dependencia', fechaInicio: 'Fecha de inicio',
    principalAnexo: 'Principal/Anexo', corteEstado: 'Estado al corte', fechaElevacion: 'Fecha de elevación', anioElevacion: 'Año de elevación',
    clasificacion: 'Avocamiento', ultimoAvocamiento: 'Último avocamiento', ultimaAvcTipo: 'Última operación de AVC', ultimaAvcFecha: 'Fecha última AVC',
    resolucionTipo: 'Resolución', resolucionFecha: 'Fecha de resolución', resolucionFuente: 'Fuente de la resolución', autoTipo: 'Auto', autoFecha: 'Fecha del auto',
    conflicto: 'Elevación o reactivación posterior a la resolución', revisar: 'A revisar', revisarFecha: 'Fecha del movimiento a revisar',
    equivalenciaOrigen: 'Equivalencia aprobada fuera de la tabla', motivoIngreso: 'Motivo de ingreso', corteIngreso: 'Corte de ingreso', observacion: 'Observación', caratula: 'Carátula', vocal: 'Vocal', avisos: 'Avisos'
  };
  const COLS_CONS = Object.keys(ENC);
  const COLS_STOCK = ['exp', 'secretaria', 'criterio', 'tipoJuicio', 'fechaElevacion', 'anioElevacion', 'clasificacion', 'ultimoAvocamiento', 'ultimaAvcTipo', 'ultimaAvcFecha',
    'estado', 'ubicacion', 'autoTipo', 'autoFecha', 'observacion', 'caratula', 'vocal', 'avisos'];
  const CLASIF = ['Sin avocamiento', 'Avocada sin operación de AVC', 'Avocada con operación de AVC'];

  const celda = v => { if (v === null || v === undefined) return ''; if (Array.isArray(v)) return v.join(' · '); return v; };
  const fmtF = iso => iso ? iso.split('-').reverse().join('/') : '';
  const colLetra = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function hoja(aoa, anchos) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
    return ws;
  }

  function armarInforme(borrador, sede, opciones) {
    const o = opciones || {};
    const wb = XLSX.utils.book_new();
    const r = borrador.resumen;
    const multifuero = sede.tipo === 'multifuero';
    const cob = borrador.avisos.filter(a => a.tipo === 'Cobertura');
    const cuentaAvisos = {};
    borrador.avisos.forEach(a => { cuentaAvisos[a.tipo] = (cuentaAvisos[a.tipo] || 0) + 1; });

    // Portada
    const p = [
      ['Stock de causas pendientes de resolución'], [sede.nombre], [],
      ['Fecha de corte', fmtF(borrador.fechaCorte)],
      ['Corte anterior', borrador.corteAnterior ? fmtF(borrador.corteAnterior) : 'Primer cierre (foto inicial)'],
      ['Cierre N°', o.numeroCierre || ''], ['Generado', o.generado || new Date().toLocaleString('es-AR')], ['Autor', o.autor || ''],
      ['Stock pendiente', r.stock], [],
      ['Definiciones'],
      ['Stock pendiente', multifuero
        ? 'Causa del universo laboral (grupo del trabajo o tipo de juicio de materia laboral), de tipo de proceso Ordinario, presente en la foto del SAC al corte, en estado ACTIVO y sin resolución.'
        : 'Causa de tipo de proceso Ordinario, presente en la foto del SAC al corte, en estado ACTIVO y sin resolución.'],
      ['Resolución', 'Operación del catálogo de resoluciones admitidas, la más reciente hasta la fecha de corte.'],
      ['Resuelta con operación Auto', 'La causa tiene un auto (p. ej. "Acuerdo (Auto que lo homologa)") y ninguna sentencia: se da por resuelta y queda un aviso para cargar la Sentencia.'],
      ['Elevación', 'La primera remisión con causal ' + sede.causalElevacion + ' a la sede; el año de elevación es el de esa fecha.'],
      ['Avocamiento', 'Sin avocamiento / Avocada sin operación de AVC / Avocada con operación de AVC.'],
      ['Estado SAC', 'ACTIVO no significa pendiente; PARALIZADO o archivado no significa resuelto.'], [],
      ['Avisos de cobertura de los reportes']
    ];
    if (cob.length) cob.forEach(a => p.push(['', a.detalle])); else p.push(['', 'Sin avisos de cobertura.']);
    const aRevisar = borrador.consolidado.filter(f => f.revisar);
    p.push([], ['Causas a revisar', `${aRevisar.length} causa(s) resuelta(s) con un movimiento posterior que no corresponde. Se cuentan como resueltas; el detalle está en la hoja "Causas a revisar" para corregir el SAC antes de la próxima foto.`]);
    p.push([], ['Resumen de avisos (detalle en la hoja Avisos)']);
    Object.keys(cuentaAvisos).sort().forEach(k => p.push([k, cuentaAvisos[k]]));
    XLSX.utils.book_append_sheet(wb, hoja(p, [34, 120]), 'Portada');

    // Stock pendiente (se arma antes para que el Resumen la referencie)
    const stockAoa = [COLS_STOCK.map(c => ENC[c])].concat(borrador.stock.map(f => COLS_STOCK.map(c => celda(f[c]))));
    const nS = borrador.stock.length + 1;
    const cAnio = colLetra(COLS_STOCK.indexOf('anioElevacion')), cCla = colLetra(COLS_STOCK.indexOf('clasificacion')), cSec = colLetra(COLS_STOCK.indexOf('secretaria'));
    const rng = c => `'Stock pendiente'!$${c}$2:$${c}$${Math.max(nS, 2)}`;

    // Resumen con fórmulas: año de elevación × avocamiento
    const anios = Object.keys(r.porAnio).sort((a, b) => (a === 'Sin fecha') - (b === 'Sin fecha') || (a < b ? -1 : 1));
    const res = [['Stock pendiente por año de elevación y avocamiento'], [`Corte: ${fmtF(borrador.fechaCorte)}`], [],
      ['Año de elevación'].concat(CLASIF, ['Total'])];
    const f0 = res.length + 1;
    anios.forEach((a, i) => {
      const fila = res.length + 1;
      const row = [{ t: 's', v: a }];
      CLASIF.forEach(cl => {
        const v = borrador.stock.filter(x => x.anioElevacion === a && x.clasificacion === cl).length;
        row.push({ t: 'n', v, f: `COUNTIFS(${rng(cAnio)},"${a}",${rng(cCla)},"${cl}")` });
      });
      row.push({ t: 'n', v: r.porAnio[a], f: `SUM(B${fila}:D${fila})` });
      res.push(row);
    });
    const fT = res.length + 1, fU = res.length;
    res.push([{ t: 's', v: 'Total' }].concat(['B', 'C', 'D', 'E'].map((c, i) => ({ t: 'n', v: i < 3 ? (r.porClasificacion[CLASIF[i]] || 0) : r.stock, f: `SUM(${c}${f0}:${c}${fU})` }))));
    res.push([], ['Control: el total coincide con las filas de "Stock pendiente"', { t: 'n', v: r.stock, f: `COUNTA(${rng('A')})` }]);
    if (multifuero || Object.keys(sede.dependencias).length > 1) {
      res.push([], ['Apertura por secretaría'], ['Secretaría', 'Stock']);
      Object.keys(r.porSecretaria).sort().forEach(k => res.push([k, { t: 'n', v: r.porSecretaria[k], f: `COUNTIF(${rng(cSec)},"${k}")` }]));
    }
    if (multifuero) {
      res.push([], ['Apertura por criterio de ingreso al universo laboral'], ['Criterio', 'Stock']);
      const cCri = colLetra(COLS_STOCK.indexOf('criterio'));
      Object.keys(r.porCriterio).sort().forEach(k => res.push([k, { t: 'n', v: r.porCriterio[k], f: `COUNTIF(${rng(cCri)},"${k}")` }]));
    }
    res.push([], ['Ordinarios del universo por situación'], ['Situación', 'Causas']);
    Object.keys(r.porSituacion || {}).sort().forEach(k => res.push([k, r.porSituacion[k]]));
    if (borrador.conciliacion) {
      const c = borrador.conciliacion;
      res.push([], ['Conciliación con el corte anterior'], ['Stock al ' + fmtF(c.corteAnterior), c.stockAnterior], ['− Salen', c.sale], ['+ Entran', c.entra],
        ['Stock al ' + fmtF(borrador.fechaCorte), c.stockActual], ['¿Cierra?', c.cierra ? 'Sí' : 'NO: revisar Movimientos']);
    }
    XLSX.utils.book_append_sheet(wb, hoja(res, [52, 18, 28, 28, 10]), 'Resumen');

    // Consolidado
    const cons = [COLS_CONS.map(c => ENC[c])].concat(borrador.consolidado.map(f => COLS_CONS.map(c => celda(f[c]))));
    XLSX.utils.book_append_sheet(wb, hoja(cons, COLS_CONS.map(c => c === 'avisos' || c === 'caratula' ? 50 : c === 'tipoJuicio' || c === 'resolucionTipo' || c === 'ultimaAvcTipo' ? 36 : 16)), 'Consolidado');
    XLSX.utils.book_append_sheet(wb, hoja(stockAoa, COLS_STOCK.map(c => c === 'avisos' || c === 'caratula' ? 50 : c === 'tipoJuicio' || c === 'ultimaAvcTipo' ? 36 : 16)), 'Stock pendiente');

    // Movimientos
    const mov = [];
    if (borrador.conciliacion) {
      const c = borrador.conciliacion;
      mov.push(['Conciliación'], ['Stock anterior (' + fmtF(c.corteAnterior) + ')', c.stockAnterior], ['Salen', c.sale], ['Entran', c.entra], ['Stock actual', c.stockActual], ['¿Cierra?', c.cierra ? 'Sí' : 'NO'], []);
    } else mov.push(['Primer cierre: no hay corte anterior para conciliar.'], []);
    mov.push(['N° de SAC', 'Movimiento', 'Motivo']);
    borrador.movimientos.forEach(m => mov.push([m.exp, m.movimiento, m.motivo]));
    XLSX.utils.book_append_sheet(wb, hoja(mov, [30, 12, 70]), 'Movimientos');

    // Causas a revisar: resueltas con un movimiento posterior (elevación o reactivación)
    const rv = [['N° de SAC', 'Secretaría', 'Tipo de juicio', 'Resolución', 'Fecha de resolución', 'Fecha del movimiento a revisar', 'Estado SAC', 'Ubicación SAC', 'Qué revisar']];
    borrador.consolidado.filter(f => f.revisar).forEach(f => rv.push([f.exp, f.secretaria, f.tipoJuicio, f.resolucionTipo, f.resolucionFecha, f.revisarFecha, f.estado, f.ubicacion, f.revisar]));
    if (rv.length === 1) rv.push(['Sin causas a revisar.']);
    XLSX.utils.book_append_sheet(wb, hoja(rv, [12, 16, 34, 40, 12, 14, 12, 16, 90]), 'Causas a revisar');

    // Avisos
    const av = [['Tipo', 'N° de SAC', 'Detalle']].concat(borrador.avisos.slice().sort((a, b) => a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0).map(a => [a.tipo, a.exp, a.detalle]));
    borrador.revision.forEach(x => av.push(['Fila no procesada', x.exp || '', `${x.archivo}, fila ${x.fila}: ${x.motivo} (valor: "${x.valor}")`]));
    XLSX.utils.book_append_sheet(wb, hoja(av, [36, 12, 120]), 'Avisos');

    // Eventos (de las causas del universo, con fuente)
    const uni = new Set(borrador.consolidado.map(f => f.exp));
    const ev = [['N° de SAC', 'Familia', 'Operación', 'Fecha', 'Posterior al corte', 'Dependencia', 'Fuente']];
    borrador._estado.eventos.filter(e => uni.has(e.exp)).forEach(e => ev.push([e.exp, e.familia, e.tipo, e.fecha, e.fecha > borrador.fechaCorte ? 'Sí' : '', e.dependencia, e.fuente]));
    XLSX.utils.book_append_sheet(wb, hoja(ev, [12, 12, 60, 12, 10, 50, 50]), 'Eventos');

    // Insumos
    const ins = [['Archivo › hoja', 'Tipo', 'Filas recibidas', 'Aceptadas', 'De otra dependencia', 'Fuera de alcance', 'Observadas', 'Filtros del reporte']];
    borrador.infoCargas.forEach(c => ins.push([c.archivo, ETIQUETA[c.tipo] || c.tipo, c.recibidas, c.aceptadas, c.fueraDeSede, c.fueraDeAlcance, c.observadas, c.filtros]));
    (o.tablasOrigen ? [o.tablasOrigen] : []).forEach(t => ins.push([t, 'Tabla de equivalencias']));
    XLSX.utils.book_append_sheet(wb, hoja(ins, [60, 20, 10, 10, 12, 12, 10, 100]), 'Insumos');
    return wb;
  }

  function aBytes(wb) { return XLSX.write(wb, { bookType: 'xlsx', type: typeof window === 'undefined' ? 'buffer' : 'array', compression: true }); }

  const api = { APP_VERSION, normEncabezado, mapearColumnas, reconocer, faltantes, aCarga, escribirBase, leerBase, armarInforme, aBytes,
    CAMPOS, NOMBRES, REQUERIDOS, OPCIONALES, ETIQUETA, COLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StockIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
