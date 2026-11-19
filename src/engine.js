/* Motor de reglas — App de stock de causas (Cámaras del Trabajo, Córdoba).
   Sin interfaz y sin dependencias: recibe filas ya leídas de los Excel y la base anterior,
   devuelve un borrador de cierre. Las reglas (R0–R17, T1–T2) siguen la Especificación v2. */
(function (root) {
  'use strict';

  const REGLAS_VERSION = '2.3';
  const DIA = 86400000;

  /* ---------- Normalización ---------- */

  // T2: la clave es un entero. Devuelve {ok, clave} o {ok:false, motivo}.
  function normalizarClave(v) {
    if (v === null || v === undefined || v === '') return { ok: false, motivo: 'Clave vacía' };
    if (typeof v === 'number') {
      if (!isFinite(v)) return { ok: false, motivo: 'Clave inválida' };
      const r = Math.round(v);
      if (Math.abs(v - r) > 1e-9) return { ok: false, motivo: 'Clave con decimales' };
      if (r <= 0) return { ok: false, motivo: 'Clave no positiva' };
      return { ok: true, clave: String(r) };
    }
    const s = String(v).trim();
    if (s === '') return { ok: false, motivo: 'Clave vacía' };
    if (/e/i.test(s) && /^[\d.,]+e[+-]?\d+$/i.test(s)) return { ok: false, motivo: 'Clave en notación científica' };
    let m = s.match(/^(\d+)(?:[.,]0+)?$/);
    if (!m) return { ok: false, motivo: 'Clave con texto' };
    const sinCeros = m[1].replace(/^0+/, '');
    if (sinCeros === '') return { ok: false, motivo: 'Clave en cero' };
    return { ok: true, clave: sinCeros };
  }

  function iso(y, mo, d) {
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCMonth() !== mo - 1) return null; // 31/02 y similares
    return t.toISOString().slice(0, 10);
  }

  // Devuelve 'AAAA-MM-DD' o null. Acepta serial de Excel, Date, ISO y dd/mm/aaaa.
  function normalizarFecha(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      const t = new Date(v.getTime() + 12 * 3600000); // evita corrimientos por huso
      return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
    if (typeof v === 'number') {
      if (v < 1 || v > 80000) return null;
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * DIA).toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); // formato argentino dd/mm/aaaa
    if (m) return iso(+m[3], +m[2], +m[1]);
    return null;
  }

  const txt = v => (v === null || v === undefined) ? '' : String(v).trim();

  // Huella estable (cyrb53). Sirve para detectar cambios, no es criptográfica.
  function huella(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }

  const cmpClave = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);

  /* ---------- Catálogo ---------- */

  function clasificarOperacion(tipo, catalogo, sede) {
    if (catalogo.resolucionesAdmitidas.includes(tipo) || (sede.resolucionesExtra || []).includes(tipo))
      return { familia: 'resolucion' };
    if (catalogo.avocamiento[tipo]) return { familia: 'avocamiento', funcional: catalogo.avocamiento[tipo] };
    if (catalogo.marcaAuto.test(tipo)) return { familia: 'auto' };
    if (catalogo.raicesCandidatas.some(r => tipo.includes(r))) return { familia: 'candidata' };
    return { familia: 'otra' };
  }

  // Lee la lista "Tipo de Operacion es A, B o C" de la fila de filtros.
  function tiposEnFiltro(filtros) {
    const m = txt(filtros).match(/Tipo de Operaci[oó]n es ([^\n]+)/i);
    if (!m) return null;
    const partes = m[1].split(/, /);
    const ult = partes.pop();
    const i = ult.lastIndexOf(' o ');
    if (i >= 0) partes.push(ult.slice(0, i), ult.slice(i + 3)); else partes.push(ult);
    return partes.map(s => s.trim()).filter(Boolean);
  }

  /* ---------- Universo laboral ---------- */

  function criterioLaboral(sede, tablas, grupo, tipoJuicio) {
    if (sede.tipo !== 'multifuero') return 'Sede especializada';
    if ((sede.gruposLaborales || []).includes(txt(grupo))) return 'Grupo laboral';
    if ((tablas.materias || {})[txt(tipoJuicio)] === 'Laboral') return 'Materia laboral en grupo no laboral';
    return null;
  }

  /* ---------- Procesamiento ---------- */

  function baseVacia(sede) {
    return {
      formato: 'stock-base', sedeId: sede.id, reglasVersion: REGLAS_VERSION,
      cierres: [], expedientes: {}, ultimos: {}, observaciones: [], eventos: [],
      consolidados: {}, anotaciones: {}, auditoria: [], cargas: []
    };
  }

  function procesar(entrada) {
    const { sede, catalogo, tablas = {}, cargas = [] } = entrada;
    const base = entrada.base ? entrada.base : baseVacia(sede);
    const errores = [];
    const avisos = [];
    const revision = [];
    const aviso = (tipo, exp, detalle, extra) => avisos.push(Object.assign({ tipo, exp: exp || '', detalle: detalle || '' }, extra || {}));

    if (base.sedeId !== sede.id) errores.push(`La base es de la sede "${base.sedeId}" y elegiste "${sede.id}".`);
    const ultimoCierre = base.cierres.length ? base.cierres[base.cierres.length - 1] : null;
    const corteAnterior = ultimoCierre ? ultimoCierre.fechaCorte : null;
    const deps = sede.dependencias;

    /* 1. Leer cargas: claves, fechas, filtro por sede (R0), causal (R5), catálogo */
    const nuevosEventos = [];
    const filasFoto = [];
    const infoCargas = [];
    let maxFechaEvento = null;

    cargas.forEach((c, ci) => {
      const info = { id: c.id || `c${ci + 1}`, archivo: c.archivo || '', tipo: c.tipo, filtros: txt(c.filtros),
        recibidas: c.filas.length, aceptadas: 0, fueraDeSede: 0, fueraDeAlcance: 0, observadas: 0 };
      infoCargas.push(info);
      const fuente = info.archivo || info.tipo;

      // Avisos de cobertura (R17 y foto parcial)
      if (c.tipo === 'resoluciones') {
        const lista = tiposEnFiltro(c.filtros);
        if (lista) {
          const faltan = catalogo.resolucionesAdmitidas.filter(t => !lista.includes(t));
          faltan.forEach(t => aviso('Cobertura', '', `El reporte "${fuente}" no incluye en su filtro: ${t}. Si hubo resoluciones de ese tipo, no se contaron.`));
        } else aviso('Cobertura', '', `El reporte "${fuente}" no trae la lista de tipos de operación en la fila de filtros; no se pudo verificar su cobertura.`);
      }
      if (c.tipo === 'avocamiento') {
        const lista = tiposEnFiltro(c.filtros);
        if (lista) Object.keys(catalogo.avocamiento).filter(t => !lista.includes(t))
          .forEach(t => aviso('Cobertura', '', `El reporte "${fuente}" no incluye en su filtro: ${t}.`));
      }
      if (c.tipo === 'foto' && /Estado Expediente es ACTIVO/i.test(info.filtros) && !/PARALIZADO/i.test(info.filtros))
        aviso('Cobertura', '', `La foto "${fuente}" trae solo causas ACTIVAS: no se pueden distinguir los cambios de estado de las causas que dejan de figurar, ni detectar reactivaciones.`);

      c.filas.forEach((f, fi) => {
        const fila = f._fila || fi + 4;
        const k = normalizarClave(f.exp);
        const dep = txt(c.tipo === 'remisiones' ? f.dependenciaDestino : f.dependencia);
        if (!(dep in deps)) { info.fueraDeSede++; return; }               // R0
        if (!k.ok) { info.observadas++; revision.push({ archivo: fuente, fila, valor: txt(f.exp), motivo: k.motivo }); return; } // T2

        if (c.tipo === 'foto') {
          info.aceptadas++;
          filasFoto.push({ exp: k.clave, fila, f, dep });
          return;
        }
        const fecha = normalizarFecha(f.fecha);
        if (!fecha) { info.observadas++; revision.push({ archivo: fuente, fila, valor: txt(f.fecha), motivo: 'Fecha vacía o inválida', exp: k.clave }); return; }

        let ev;
        if (c.tipo === 'remisiones') {
          if (txt(f.tipoRemision) !== sede.causalElevacion) { info.fueraDeAlcance++; return; } // R5
          ev = { exp: k.clave, familia: 'elevacion', tipo: sede.causalElevacion, fecha,
            tipoJuicio: txt(f.tipoJuicio), grupo: txt(f.grupoDestino), dependencia: dep };
        } else {
          const tipo = txt(f.tipoOperacion);
          const cl = clasificarOperacion(tipo, catalogo, sede);
          if (cl.familia === 'otra') { info.fueraDeAlcance++; return; }
          ev = { exp: k.clave, familia: cl.familia, tipo, fecha, tipoJuicio: txt(f.tipoJuicio), grupo: txt(f.grupo), dependencia: dep };
          if (cl.funcional) ev.funcional = cl.funcional;
        }
        ev.fuente = fuente; ev.cargaId = info.id;
        ev.huella = huella([sede.id, ev.exp, ev.tipo, ev.fecha].join('|')); // T1
        nuevosEventos.push(ev);
        info.aceptadas++;
        if (!maxFechaEvento || fecha > maxFechaEvento) maxFechaEvento = fecha;
      });
    });

    if (!cargas.some(c => c.tipo === 'foto')) errores.push('Falta la foto del SAC: sin ella no se puede calcular el stock.');

    /* 2. Fecha de corte (R16) */
    const fechaCorteSugerida = maxFechaEvento;
    const fechaCorte = entrada.fechaCorte ? normalizarFecha(entrada.fechaCorte) : fechaCorteSugerida;
    if (!fechaCorte) errores.push('No se pudo determinar la fecha de corte: ningún reporte trae eventos con fecha. Indicala a mano.');
    if (fechaCorte && corteAnterior && fechaCorte <= corteAnterior)
      errores.push(`La fecha de corte (${fechaCorte}) no es posterior al último cierre (${corteAnterior}). El cierre anterior no se modifica; para corregirlo hay que registrar una rectificación.`);
    if (errores.length) return { ok: false, errores, avisos, revision, infoCargas, fechaCorteSugerida };

    /* 3. Eventos: los de la base + los nuevos, sin duplicar (T1) */
    const porHuella = new Map();
    base.eventos.forEach(e => porHuella.set(e.huella, e));
    let eventosNuevosReales = 0;
    nuevosEventos.forEach(e => { if (!porHuella.has(e.huella)) { porHuella.set(e.huella, e); eventosNuevosReales++; } });
    const eventos = Array.from(porHuella.values()).sort((a, b) =>
      cmpClave(a.exp, b.exp) || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0) || (a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0));
    const huellasNuevas = new Set(nuevosEventos.map(n => n.huella));
    const futuros = eventos.filter(e => e.fecha > fechaCorte && huellasNuevas.has(e.huella));
    futuros.forEach(e => aviso('Evento posterior al corte', e.exp, `${e.tipo} del ${e.fecha}: no se tiene en cuenta en este cierre.`));

    const evPorExp = new Map();
    eventos.forEach(e => { if (e.fecha <= fechaCorte) { if (!evPorExp.has(e.exp)) evPorExp.set(e.exp, []); evPorExp.get(e.exp).push(e); } });

    // Candidatas: denominaciones nuevas que podrían ser resoluciones
    const candidatas = new Map();
    nuevosEventos.filter(e => e.familia === 'candidata').forEach(e => candidatas.set(e.tipo, (candidatas.get(e.tipo) || 0) + 1));
    candidatas.forEach((n, t) => aviso('Denominación candidata', '', `"${t}" (${n} casos) no está en el catálogo. No se cuenta como resolución hasta que se apruebe.`));

    /* 4. Foto actual */
    const foto = new Map();
    filasFoto.forEach(r => {
      if (foto.has(r.exp)) { aviso('Duplicado en la foto', r.exp, `Aparece más de una vez en la foto (fila ${r.fila}); se toma la primera.`); return; }
      const f = r.f;
      foto.set(r.exp, {
        estado: txt(f.estado).toUpperCase(), ubicacion: txt(f.ubicacion), tipoJuicio: txt(f.tipoJuicio),
        grupo: txt(f.grupo), dependencia: r.dep, fechaInicio: normalizarFecha(f.fechaInicio),
        principalAnexo: txt(f.principalAnexo), tipoExpediente: txt(f.tipoExpediente),
        criterio: criterioLaboral(sede, tablas, f.grupo, f.tipoJuicio)
      });
    });

    /* 5. Universo (R1–R7) */
    const expedientes = JSON.parse(JSON.stringify(base.expedientes));
    const ultimos = Object.assign({}, base.ultimos);
    const esPrimerCierre = base.cierres.length === 0;
    const incorporadas = new Map();

    const primeraElevacion = exp => {
      const ev = (evPorExp.get(exp) || []).filter(e => e.familia === 'elevacion');
      return ev.length ? ev[0].fecha : null; // eventos ordenados por fecha: R11
    };

    Array.from(foto.keys()).sort(cmpClave).forEach(exp => {
      const r = foto.get(exp);
      if (expedientes[exp] || !r.criterio || r.estado !== 'ACTIVO') return;
      let motivo;
      const elev = primeraElevacion(exp);
      if (esPrimerCierre) motivo = 'Foto inicial';                                            // R1
      else if (elev && elev > corteAnterior) motivo = 'Elevación';                            // R4
      else if (elev) motivo = 'Elevación (detección tardía)';
      else if (ultimos[exp] && ultimos[exp].estado === 'PARALIZADO') motivo = 'Reactivación';  // R6
      else { motivo = 'Activa sin antecedente'; aviso('Antecedente insuficiente', exp, 'Figura ACTIVA sin estado previo conocido ni elevación: no se puede confirmar si es reactivación.'); } // R7
      expedientes[exp] = { exp, motivoIngreso: motivo, corteIngreso: fechaCorte };
      incorporadas.set(exp, motivo);
    });

    // Elevaciones del período que no figuran en la foto
    eventos.filter(e => e.familia === 'elevacion' && corteAnterior !== null && e.fecha > corteAnterior && e.fecha <= fechaCorte && !foto.has(e.exp))
      .forEach(e => aviso('Elevación sin registro en la foto', e.exp, `Elevación del ${e.fecha} a ${e.dependencia}, pero el expediente no figura en la foto.`));

    /* 6. Consolidado por expediente */
    const consolidadoAnterior = ultimoCierre ? (base.consolidados[ultimoCierre.numero] || []) : [];
    const antPorExp = new Map(consolidadoAnterior.map(r => [r.exp, r]));
    const consolidado = [];
    const sinEquivalencia = new Map();
    const observaciones = [];

    Object.keys(expedientes).sort(cmpClave).forEach(exp => {
      const u = expedientes[exp];
      const r = foto.get(exp);
      const ant = antPorExp.get(exp);
      const previo = ultimos[exp];
      const evs = evPorExp.get(exp) || [];
      const fila = { exp, motivoIngreso: u.motivoIngreso, corteIngreso: u.corteIngreso, avisos: [] };
      const marca = (tipo, detalle) => { fila.avisos.push(tipo); aviso(tipo, exp, detalle); };

      // Estado SAC (R2/R3)
      if (r) {
        Object.assign(fila, { presente: 'Sí', estado: r.estado, ubicacion: r.ubicacion, tipoJuicio: r.tipoJuicio,
          grupo: r.grupo, dependencia: r.dependencia, fechaInicio: r.fechaInicio, principalAnexo: r.principalAnexo,
          corteEstado: fechaCorte, criterio: r.criterio || 'Fuera del universo laboral' });
      } else {
        const p = previo || {};
        Object.assign(fila, { presente: 'No', estado: p.estado || '', ubicacion: p.ubicacion || '', tipoJuicio: p.tipoJuicio || '',
          grupo: p.grupo || '', dependencia: p.dependencia || '', fechaInicio: p.fechaInicio || null, principalAnexo: p.principalAnexo || '',
          corteEstado: p.corte || '', criterio: p.criterio || '' });
        marca('No encontrada en el corte actual', `Último estado conocido: ${p.estado || 'sin dato'} (${p.corte || 'sin fecha'}).`);
      }
      fila.secretaria = deps[fila.dependencia] || '';
      if (fila.criterio === 'Materia laboral en grupo no laboral') marca('Materia laboral en grupo no laboral', `Tipo de juicio "${fila.tipoJuicio}" en ${fila.grupo}. Se cuenta en el stock.`);

      // Tipo de proceso (R14); una reclasificación manual registrada prevalece y se avisa cada mes
      const extra = (catalogo.equivalenciasExtra || {})[fila.tipoJuicio];
      const eq = (tablas.equivalencias || {})[fila.tipoJuicio] || (extra && extra.tipoProceso);
      if (!(tablas.equivalencias || {})[fila.tipoJuicio] && extra) fila.equivalenciaOrigen = extra.origen;
      const an0 = base.anotaciones[exp] || {};
      fila.tipoProcesoTabla = eq || 'Sin equivalencia';
      if (an0.tipoProcesoManual) {
        fila.tipoProceso = an0.tipoProcesoManual;
        fila.reclasificacion = an0.motivoReclasificacion || 'Reclasificación manual';
        marca('Reclasificación manual', `Tabla: ${fila.tipoProcesoTabla} → se toma "${an0.tipoProcesoManual}". ${fila.reclasificacion}`);
      } else {
        fila.tipoProceso = eq || 'Sin equivalencia';
        if (!eq) { sinEquivalencia.set(fila.tipoJuicio, (sinEquivalencia.get(fila.tipoJuicio) || 0) + 1); fila.avisos.push('Tipo de juicio sin equivalencia'); }
      }

      // Resolución (R8): la más reciente; empate entre tipos distintos se conserva (R13)
      const res = evs.filter(e => e.familia === 'resolucion');
      if (res.length) {
        const f = res[res.length - 1].fecha;
        const delDia = res.filter(e => e.fecha === f);
        const tipos = [...new Set(delDia.map(e => e.tipo))];
        Object.assign(fila, { resolucionTipo: tipos.join(' | '), resolucionFecha: f, resolucionFuente: [...new Set(delDia.map(e => e.fuente))].join(' | ') });
        if (tipos.length > 1) marca('Empate de fecha', `Resoluciones distintas el ${f}: ${tipos.join(' | ')}.`);
      }

      // Avocamiento y AVC (R12, R13)
      const avoc = evs.filter(e => e.familia === 'avocamiento' && e.tipo === 'Avocamiento');
      const avc = evs.filter(e => e.familia === 'avocamiento' && e.tipo !== 'Avocamiento');
      if (avoc.length) fila.ultimoAvocamiento = avoc[avoc.length - 1].fecha;
      if (avc.length) {
        const f = avc[avc.length - 1].fecha;
        const tipos = [...new Set(avc.filter(e => e.fecha === f).map(e => e.tipo))];
        fila.ultimaAvcTipo = tipos.join(' | '); fila.ultimaAvcFecha = f;
        if (tipos.length > 1) marca('Empate de fecha', `Operaciones de AVC distintas el ${f}: ${tipos.join(' | ')}.`);
      }
      fila.clasificacion = avc.length ? 'Avocada con operación de AVC' : avoc.length ? 'Avocada sin operación de AVC' : 'Sin avocamiento';

      // Elevación (R11)
      const elev = primeraElevacion(exp);
      fila.fechaElevacion = elev;
      fila.anioElevacion = elev ? elev.slice(0, 4) : 'Sin fecha';

      // Autos (R15). Si no hay resolución admitida y la política lo dispone, el auto cierra la causa.
      const autos = evs.filter(e => e.familia === 'auto');
      let porAuto = false;
      if (autos.length) {
        const a = autos[autos.length - 1]; fila.autoTipo = a.tipo; fila.autoFecha = a.fecha;
        if (!fila.resolucionFecha && catalogo.autosCierran) {
          porAuto = true;
          Object.assign(fila, { resolucionTipo: a.tipo, resolucionFecha: a.fecha, resolucionFuente: a.fuente });
        }
      }

      // R10 (decisión 18/11/2026): la resolución prevalece. Una elevación o reactivación posterior
      // NO reabre la causa; solo se avisa para revisar la carga en el SAC. Un reenvío por anulación
      // del TSJ entra con otra causal (no ELEVACION A JUICIO), que hoy no se toma como ingreso.
      let conflicto = false;
      if (fila.resolucionFecha) {
        const elevPost = evs.find(e => e.familia === 'elevacion' && e.fecha > fila.resolucionFecha);
        const reactivada = r && r.estado === 'ACTIVO' && previo && previo.estado === 'PARALIZADO' && previo.corte >= fila.resolucionFecha;
        if (elevPost || reactivada) {
          conflicto = true;
          fila.revisar = elevPost
            ? `Resuelta el ${fila.resolucionFecha} y con nueva ELEVACION A JUICIO el ${elevPost.fecha}: corregir esa remisión en el SAC.`
            : `Resuelta el ${fila.resolucionFecha} y volvió a figurar ACTIVA: revisar el estado en el SAC.`;
          fila.revisarFecha = elevPost ? elevPost.fecha : '';
          marca(elevPost ? 'A revisar: elevación posterior a la resolución' : 'A revisar: reactivada después de resuelta',
            fila.revisar + ' Se cuenta como resuelta.');
        }
      }

      // Situación y stock
      const resuelta = !!fila.resolucionFecha;
      const situacion = resuelta ? (porAuto ? 'Resuelta con operación Auto' : 'Resuelta') : 'Pendiente';
      fila.situacion = situacion;
      fila.conflicto = conflicto ? 'Sí' : '';
      const laboral = fila.criterio && fila.criterio !== 'Fuera del universo laboral';
      fila.enStock = (laboral && fila.presente === 'Sí' && fila.estado === 'ACTIVO' && fila.tipoProceso === 'Ordinario' && situacion === 'Pendiente') ? 'Sí' : 'No';

      if (fila.situacion === 'Resuelta con operación Auto' && laboral && fila.tipoProceso === 'Ordinario')
        marca('Resuelta con operación Auto', `${fila.autoTipo} del ${fila.autoFecha}. Borrar el auto en el SAC y cargar la operación de Sentencia.`);
      if (fila.enStock === 'Sí') {
        if (fila.autoTipo) marca('Auto homologatorio en causa pendiente', `${fila.autoTipo} del ${fila.autoFecha}. No resuelve: la causa sigue pendiente.`);
        if (!elev) marca('Pendiente sin fecha de elevación', 'No hay elevación a juicio registrada para esta causa.');
      }

      // Anotaciones manuales (se arrastran sin cambios)
      const an = base.anotaciones[exp];
      if (an) { fila.observacion = an.observacion || ''; fila.caratula = an.caratula || ''; fila.vocal = an.vocal || ''; }

      consolidado.push(fila);
      observaciones.push({ exp, corte: fechaCorte, estado: fila.estado, ubicacion: fila.ubicacion, presente: fila.presente });
    });

    sinEquivalencia.forEach((n, t) => aviso('Tipo de juicio sin equivalencia', '', `"${t}" (${n} expedientes) no está en la tabla de equivalencias. Clasificalo para que entre al cálculo.`));

    // Último estado conocido de todo lo visto en la foto (sirve para R6/R7 en el próximo mes)
    foto.forEach((r, exp) => { ultimos[exp] = { corte: fechaCorte, estado: r.estado, ubicacion: r.ubicacion, tipoJuicio: r.tipoJuicio,
      grupo: r.grupo, dependencia: r.dependencia, fechaInicio: r.fechaInicio, principalAnexo: r.principalAnexo, criterio: r.criterio || 'Fuera del universo laboral' }; });

    /* 7. Movimientos y conciliación */
    const movimientos = [];
    let conciliacion = null;
    if (ultimoCierre) {
      const nuevo = new Map(consolidado.map(r => [r.exp, r]));
      const antStock = consolidadoAnterior.filter(r => r.enStock === 'Sí');
      const nuevoStock = consolidado.filter(r => r.enStock === 'Sí');
      const antSet = new Set(antStock.map(r => r.exp));
      antStock.forEach(a => {
        const n = nuevo.get(a.exp);
        if (n && n.enStock === 'Sí') return;
        let motivo;
        if (!n) motivo = 'Salió del universo (revisar)';
        else if (n.situacion !== 'Pendiente') motivo = `${n.situacion}: ${n.resolucionTipo} (${n.resolucionFecha})`;
        else if (n.presente === 'No') motivo = 'No encontrada en el corte actual';
        else if (n.criterio === 'Fuera del universo laboral') motivo = 'Pasó a un grupo no laboral';
        else if (n.estado !== 'ACTIVO') motivo = `Cambio de estado: ${n.estado}`;
        else if (n.tipoProceso !== 'Ordinario') motivo = n.reclasificacion ? `Reclasificación manual: ${n.tipoProceso}` : `Cambio de tipo de proceso: ${n.tipoProceso}`;
        else motivo = 'Otro (revisar)';
        movimientos.push({ exp: a.exp, movimiento: 'Sale', motivo });
      });
      nuevoStock.forEach(n => {
        if (antSet.has(n.exp)) return;
        const a = antPorExp.get(n.exp);
        let motivo;
        if (incorporadas.has(n.exp)) motivo = incorporadas.get(n.exp);
        else if (a && a.presente === 'No') motivo = 'Volvió a figurar en el SAC';
        else if (a && a.estado === 'PARALIZADO') motivo = 'Reactivación';
        else if (a && a.estado !== 'ACTIVO') motivo = `Volvió a ACTIVO (antes ${a.estado})`;
        else if (a && a.tipoProceso !== 'Ordinario') motivo = 'Cambio de tipo de proceso a Ordinario';
        else motivo = 'Otro (revisar)';
        movimientos.push({ exp: n.exp, movimiento: 'Entra', motivo });
      });
      movimientos.sort((x, y) => (x.movimiento < y.movimiento ? -1 : x.movimiento > y.movimiento ? 1 : 0) || cmpClave(x.exp, y.exp));
      const sale = movimientos.filter(m => m.movimiento === 'Sale').length;
      const entra = movimientos.filter(m => m.movimiento === 'Entra').length;
      conciliacion = { corteAnterior, stockAnterior: antStock.length, sale, entra, stockActual: nuevoStock.length,
        cierra: antStock.length - sale + entra === nuevoStock.length };
    }

    /* 8. Resumen */
    const stock = consolidado.filter(r => r.enStock === 'Sí')
      .sort((a, b) => ((a.fechaElevacion || '9999') < (b.fechaElevacion || '9999') ? -1 : (a.fechaElevacion || '9999') > (b.fechaElevacion || '9999') ? 1 : cmpClave(a.exp, b.exp)));
    const cuenta = (arr, fn) => arr.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
    const resumen = {
      stock: stock.length,
      porClasificacion: cuenta(stock, r => r.clasificacion),
      porAnio: cuenta(stock, r => r.anioElevacion),
      porSecretaria: cuenta(stock, r => r.secretaria || 'Sin secretaría'),
      porCriterio: cuenta(stock, r => r.criterio),
      porSituacion: cuenta(consolidado.filter(r => r.tipoProceso === 'Ordinario'), r => r.situacion),
      universo: consolidado.length,
      eventosNuevos: eventosNuevosReales
    };

    const borrador = {
      ok: true, fechaCorte, fechaCorteSugerida, corteAnterior, consolidado, stock, movimientos, conciliacion,
      avisos, revision, infoCargas, resumen,
      _estado: { expedientes, ultimos, eventos, observaciones, sedeId: sede.id }
    };
    return borrador;
  }

  /* ---------- Cierre y base ---------- */

  function confirmar(base, borrador, opciones) {
    const o = opciones || {};
    if (!borrador.ok) throw new Error('No se puede confirmar un borrador con errores.');
    const b = base ? JSON.parse(JSON.stringify(base)) : null;
    const nb = b || baseVacia({ id: borrador._estado.sedeId });
    const ultimo = nb.cierres[nb.cierres.length - 1];
    if (ultimo && borrador.corteAnterior !== ultimo.fechaCorte)
      throw new Error('El borrador se calculó sobre una base que no es la última.');
    const numero = nb.cierres.length + 1;
    nb.expedientes = borrador._estado.expedientes;
    nb.ultimos = borrador._estado.ultimos;
    nb.eventos = borrador._estado.eventos;
    nb.observaciones = nb.observaciones.concat(borrador._estado.observaciones);
    nb.consolidados[numero] = borrador.consolidado.map(r => { const c = Object.assign({}, r); c.avisos = r.avisos.join(' · '); return c; });
    borrador.infoCargas.forEach(c => nb.cargas.push(Object.assign({}, c, { cierre: numero, corte: borrador.fechaCorte })));
    const cierre = { numero, fechaCorte: borrador.fechaCorte, confirmado: o.fecha || new Date().toISOString().slice(0, 10),
      autor: o.autor || '', estado: 'confirmado', reglasVersion: REGLAS_VERSION,
      huellaAnterior: ultimo ? ultimo.huella : '', stock: borrador.resumen.stock };
    cierre.huella = huella(JSON.stringify([cierre.huellaAnterior, cierre.fechaCorte, nb.consolidados[numero]]));
    nb.cierres.push(cierre);
    nb.reglasVersion = REGLAS_VERSION;
    return nb;
  }

  // Campos manuales: Observación, Carátula, Vocal. Queda registro en auditoría.
  function anotar(base, exp, campo, valor, autor, motivo) {
    const permitidos = ['observacion', 'caratula', 'vocal', 'tipoProcesoManual', 'motivoReclasificacion'];
    if (!permitidos.includes(campo)) throw new Error(`Campo manual desconocido: ${campo}`);
    const k = normalizarClave(exp);
    if (!k.ok) throw new Error(k.motivo);
    const nb = JSON.parse(JSON.stringify(base));
    const an = nb.anotaciones[k.clave] || (nb.anotaciones[k.clave] = {});
    nb.auditoria.push({ exp: k.clave, campo, anterior: an[campo] || '', nuevo: valor, autor: autor || '', motivo: motivo || '', fecha: new Date().toISOString() });
    an[campo] = valor;
    return nb;
  }

  const api = { REGLAS_VERSION, normalizarClave, normalizarFecha, tiposEnFiltro, clasificarOperacion, criterioLaboral,
    huella, baseVacia, procesar, confirmar, anotar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StockEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
