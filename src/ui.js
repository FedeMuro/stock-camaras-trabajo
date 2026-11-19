/* Interfaz de la App de stock. Solo presenta y orquesta: las reglas están en StockEngine. */
(function () {
  'use strict';
  const E = window.StockEngine, IO = window.StockIO, CFG = window.StockConfig;
  const $ = id => document.getElementById(id);
  const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtF = iso => iso ? iso.split('-').reverse().join('/') : '';
  const miles = n => Number(n || 0).toLocaleString('es-AR');
  const tick = () => new Promise(r => setTimeout(r, 30));
  const S = { piezas: [], base: null, tablas: null, ignoradas: [], anot: [], borrador: null, baseTrabajo: null, seq: 0, confirmado: false };
  const LS = 'stockApp.ultimoCierre.';
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  function estado(t) { const el = $('estado'); if (!t) { el.style.display = 'none'; return; } el.textContent = t; el.style.display = 'block'; }

  /* ---------- Sedes: las configuradas en el archivo + las creadas en la app ---------- */
  const NUEVA = '__nueva';
  const LS_SEDES = 'stockApp.sedes';
  const SEDES = Object.assign({}, CFG.SEDES);
  Object.values(lsGet(LS_SEDES) || {}).forEach(x => { if (x && x.id && !CFG.SEDES[x.id]) SEDES[x.id] = x; });
  const sede = () => SEDES[$('sede').value] || null;
  const esPropia = s => s && !CFG.SEDES[s.id];
  function registrarSede(x, guardar) {
    SEDES[x.id] = x;
    if (guardar) { const m = lsGet(LS_SEDES) || {}; m[x.id] = x; lsSet(LS_SEDES, m); }
  }

  /* ---------- Paso 1 ---------- */
  function opcionesSedes(sel) {
    const propias = Object.values(SEDES).filter(esPropia);
    $('sede').innerHTML = Object.values(CFG.SEDES).map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('') +
      (propias.length ? `<optgroup label="Configuradas en la app">${propias.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</optgroup>` : '') +
      `<option value="${NUEVA}">＋ Sede nueva…</option>`;
    if (sel) $('sede').value = sel;
  }
  function initSedes() {
    $('ver').textContent = IO.APP_VERSION + ' · reglas ' + E.REGLAS_VERSION;
    opcionesSedes();
    $('sede').addEventListener('change', () => { S.editando = null; invalidar(); pintarSede(); render(); });
    pintarSede();
  }
  function pintarSede() {
    const s = sede();
    if (!s) { $('sedeInfo').innerHTML = '<span class="tag warn">Sin configurar</span> ' + (S.piezas.some(p => p.tipo === 'foto') ? 'Revisá la configuración de abajo y tocá «Usar esta sede».' : 'Cargá en el paso 2 al menos la foto del SAC de la sede; con sus datos se arma la configuración acá abajo.'); return; }
    const sinCierres = !S.base || !S.base.base.cierres.length;
    $('sedeInfo').innerHTML = `${s.tipo === 'multifuero' ? '<span class="tag">Multifuero</span>' : '<span class="tag">Especializada</span>'} ` +
      Object.entries(s.dependencias).map(([d, sec]) => `${esc(sec)}: <span class="mut">${esc(d)}</span>`).join(' · ') +
      (esPropia(s) ? ` <span class="tag">${esc(s.origen || 'Configurada en la app')}</span>` + (sinCierres ? ' <button class="chico sec" id="editarSede">Editar configuración</button>' : '') : '');
    if ($('editarSede')) $('editarSede').onclick = () => { S.editando = s.id; render(); };
  }

  /* ---------- Sede nueva: se arma con lo que traen los reportes ---------- */
  function relevar() {
    const deps = {}, grupos = {}, causales = {}, localidades = {};
    const suma = (o, k, n) => { if (k) o[k] = (o[k] || 0) + (n || 1); };
    S.piezas.forEach(p => {
      const col = c => p.mapa[c];
      for (let i = p.desde; i < p.rows.length; i++) {
        const r = p.rows[i]; if (!r) continue;
        const v = c => col(c) === undefined || r[col(c)] === null ? '' : String(r[col(c)]).trim();
        if (p.tipo === 'foto') {
          const d = v('dependencia'); if (!d) continue;
          const x = deps[d] || (deps[d] = { foto: 0, elev: 0, ops: 0, grupos: {} });
          x.foto++; suma(x.grupos, v('grupo')); suma(grupos, v('grupo')); suma(localidades, v('localidad'));
        } else if (p.tipo === 'remisiones') {
          const d = v('dependenciaDestino'); if (!d) continue;
          const x = deps[d] || (deps[d] = { foto: 0, elev: 0, ops: 0, grupos: {} });
          suma(causales, v('tipoRemision')); x.elev++;
        } else {
          const d = v('dependencia'); if (!d) continue;
          (deps[d] || (deps[d] = { foto: 0, elev: 0, ops: 0, grupos: {} })).ops++;
        }
      }
    });
    return { deps, grupos, causales, localidades };
  }
  const titulo = t => t.toLowerCase().replace(/(^|[\s.(-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|Y|E)(?= )/g, w => w.toLowerCase());
  const slug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function renderNueva() {
    const cont = $('nueva');
    const editar = S.editando ? SEDES[S.editando] : null;
    if ($('sede').value !== NUEVA && !editar) { cont.innerHTML = ''; return; }
    const R = relevar();
    // Solo dependencias que aparecen en la foto: los reportes de operaciones traen toda la localidad.
    const lista = Object.keys(R.deps).filter(d => R.deps[d].foto > 0 || (editar && d in editar.dependencias)).sort((a, b) => R.deps[b].foto - R.deps[a].foto || (a < b ? -1 : 1));
    if (!S.piezas.some(p => p.tipo === 'foto')) { cont.innerHTML = `<div class="caja mut">Esperando la foto del SAC de la sede (paso 2).</div>`; return; }
    const loc = Object.keys(R.localidades).sort((a, b) => R.localidades[b] - R.localidades[a])[0] || '';
    const pre = editar || {};
    const marcada = d => editar ? d in editar.dependencias : (lista.length === 1 || /TRABAJO|\bLAB\b|S\.\s*LAB/i.test(d));
    const marcadas = lista.filter(marcada);
    const secDef = (d, i) => editar && editar.dependencias[d] ? editar.dependencias[d]
      : /S\.?\s*LAB/i.test(d) ? 'SEC. LABORAL' : /S\.?\s*CIV/i.test(d) ? 'SEC. CIVIL'
      : (d.match(/SEC(?:RETARIA)?\.?\s*(?:N[°º.]?\s*)?(\d+)/i) ? 'Secretaría ' + d.match(/SEC(?:RETARIA)?\.?\s*(?:N[°º.]?\s*)?(\d+)/i)[1]
      : marcadas.length > 1 ? 'Secretaría ' + (marcadas.indexOf(d) + 1) : 'Cámara del Trabajo');
    const causales = Object.keys(R.causales).sort((a, b) => R.causales[b] - R.causales[a]);
    const causalSel = pre.causalElevacion || (R.causales['ELEVACION A JUICIO'] ? 'ELEVACION A JUICIO' : causales[0] || 'ELEVACION A JUICIO');
    let h = `<div class="caja"><h3 style="margin-top:0">${editar ? 'Editar' : 'Configurar'} la sede</h3>
      <div class="mapa"><label>Nombre de la sede</label><input type="text" id="nNombre" value="${esc(pre.nombre || (loc ? 'Cámara del Trabajo - ' + titulo(loc) : ''))}" placeholder="Cámara del Trabajo - …">
      <label>Nombre corto (para los archivos)</label><input type="text" id="nCorto" value="${esc(pre.nombreArchivo || (loc ? titulo(loc) : ''))}">
      <label>Tipo de sede</label><select id="nTipo"><option value="especializada" ${pre.tipo !== 'multifuero' ? 'selected' : ''}>Especializada (todo es del fuero laboral)</option><option value="multifuero" ${pre.tipo === 'multifuero' ? 'selected' : ''}>Multifuero (solo cuenta el universo laboral)</option></select>
      <label>Causal de elevación</label><select id="nCausal">${(causales.includes(causalSel) ? causales : [causalSel].concat(causales)).map(c => `<option ${c === causalSel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <p class="mut" style="margin:10px 0 6px">Marcá las dependencias que forman la sede y poné el nombre con que querés ver cada secretaría. Los números son las filas de cada reporte que corresponden a esa dependencia.</p>
      <div class="dep"><span class="h"></span><span class="h">Dependencia (según el SAC)</span><span class="h solo-ancho">En la foto</span><span class="h solo-ancho">Remisiones</span><span class="h">Secretaría</span>
      ${lista.map((d, i) => `<input type="checkbox" data-dep="${i}" ${marcada(d) ? 'checked' : ''}><span>${esc(d)}</span><span class="solo-ancho mut">${miles(R.deps[d].foto)}</span><span class="solo-ancho mut">${miles(R.deps[d].elev)}</span><input type="text" data-sec="${i}" value="${esc(secDef(d, i))}">`).join('')}</div>
      <div id="nGrupos"></div>
      <div class="fila"><button id="nGuardar">${editar ? 'Guardar cambios' : 'Usar esta sede'}</button>${editar ? '<button class="sec" id="nCancelar">Cancelar</button>' : ''}<span id="nMsg"></span></div>
      <p class="mut" style="margin:4px 0 0">La configuración se guarda en esta computadora y dentro de la base que se descarga al confirmar: el mes que viene, al cargar esa base, la sede aparece sola en cualquier PC.</p></div>`;
    cont.innerHTML = h;
    const pintarGrupos = () => {
      const multi = $('nTipo').value === 'multifuero';
      const elegidas = lista.filter((d, i) => cont.querySelector(`[data-dep="${i}"]`).checked);
      const gr = {}; elegidas.forEach(d => Object.entries(R.deps[d].grupos).forEach(([g, n]) => gr[g] = (gr[g] || 0) + n));
      const gl = Object.keys(gr).sort((a, b) => gr[b] - gr[a]);
      const prev = (editar && editar.gruposLaborales) || [];
      $('nGrupos').innerHTML = !multi ? '' : `<p class="mut" style="margin:12px 0 6px">Grupos que son del fuero laboral (además, entran los tipos de juicio de materia Laboral de cualquier grupo):</p>` +
        (gl.length ? gl.map(g => `<label style="display:block"><input type="checkbox" data-grupo="${esc(g)}" ${(editar ? prev.includes(g) : /TRABAJO/i.test(g)) ? 'checked' : ''}> ${esc(g)} <span class="mut">(${miles(gr[g])})</span></label>`).join('') : '<span class="mut">Marcá primero alguna dependencia.</span>');
    };
    pintarGrupos();
    $('nTipo').onchange = pintarGrupos;
    cont.querySelectorAll('[data-dep]').forEach(el => el.onchange = pintarGrupos);
    if ($('nCancelar')) $('nCancelar').onclick = () => { S.editando = null; render(); };
    $('nGuardar').onclick = () => {
      const msg = t => { $('nMsg').innerHTML = `<span class="tag bad">${esc(t)}</span>`; };
      const nombre = $('nNombre').value.trim(), corto = $('nCorto').value.trim() || nombre;
      const dependencias = {};
      lista.forEach((d, i) => { if (cont.querySelector(`[data-dep="${i}"]`).checked) dependencias[d] = cont.querySelector(`[data-sec="${i}"]`).value.trim() || d; });
      const multi = $('nTipo').value === 'multifuero';
      const gruposLaborales = multi ? Array.from(cont.querySelectorAll('[data-grupo]:checked')).map(x => x.dataset.grupo) : [];
      if (!nombre) return msg('Poné un nombre a la sede.');
      if (!Object.keys(dependencias).length) return msg('Marcá al menos una dependencia.');
      const secs = Object.values(dependencias); if (new Set(secs).size !== secs.length) return msg('Dos dependencias tienen el mismo nombre de secretaría.');
      if (multi && !gruposLaborales.length && !(tablasActivas() && Object.keys(tablasActivas().materias).length)) return msg('En una sede multifuero marcá al menos un grupo laboral, o cargá la tabla de códigos con la hoja de materias.');
      const id = editar ? editar.id : slug(corto);
      if (!editar && (CFG.SEDES[id] || SEDES[id])) return msg(`Ya existe una sede con el nombre corto "${corto}". Usá otro.`);
      const nueva = { id, nombre, nombreArchivo: corto, tipo: multi ? 'multifuero' : 'especializada', localidad: loc, dependencias,
        gruposLaborales, causalElevacion: $('nCausal').value, resolucionesExtra: (editar && editar.resolucionesExtra) || [],
        origen: 'Configurada en la app', creada: (editar && editar.creada) || new Date().toISOString().slice(0, 10) };
      registrarSede(nueva, true);
      S.editando = null; opcionesSedes(id); invalidar(); pintarSede(); render();
    };
  }

  /* ---------- Paso 2 ---------- */
  function initDrop() {
    const d = $('drop'), f = $('file');
    d.addEventListener('click', () => f.click());
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') f.click(); });
    ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('sobre'); }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('sobre'); }));
    d.addEventListener('drop', e => agregar(Array.from(e.dataTransfer.files)));
    f.addEventListener('change', () => { agregar(Array.from(f.files)); f.value = ''; });
  }

  async function agregar(files) {
    const problemas = [], nuevas = [];
    for (const file of files) {
      estado(`Leyendo ${file.name}…`); await tick();
      try {
        const buf = await file.arrayBuffer();
        const r = IO.reconocer(file.name, buf, CFG.CATALOGO);
        if (!r.piezas.length) { problemas.push(`${file.name}: no se reconoció ninguna hoja (hojas: ${r.ignoradas.join(', ') || 'ninguna'}).`); continue; }
        r.piezas.forEach(p => {
          if (p.tipo === 'base') {
            const L = IO.leerBase(p.wb); L.archivo = file.name; nuevas.push(L);
          } else if (p.tipo === 'tablas') {
            S.tablas = p;
          } else {
            S.piezas = S.piezas.filter(q => !(q.archivo === p.archivo && q.hoja === p.hoja));
            p.id = ++S.seq; S.piezas.push(p);
          }
        });
        if (r.ignoradas.length) S.ignoradas.push(`${file.name}: hojas sin datos reconocibles (${r.ignoradas.join(', ')})`);
      } catch (e) { problemas.push(`${file.name}: ${e.message}`); }
    }
    if (nuevas.length) elegirBase(nuevas.concat(S.base ? [S.base] : []).concat(S.choque || []), problemas);
    estado('');
    invalidar();
    render(problemas);
    document.body.dataset.lecturas = String(Number(document.body.dataset.lecturas || 0) + 1);
  }

  /* Trabajo a la par: si llegan varias bases, se usa la del último cierre y se frena si hay dos
     bases distintas del mismo cierre (dos personas cerraron el mismo mes partiendo de la misma base). */
  const ultimaHuella = L => { const c = L.base.cierres; return c.length ? c[c.length - 1].huella : ''; };
  function elegirBase(lista, problemas) {
    // Sin repetidos (el mismo archivo cargado dos veces)
    const unicas = []; lista.forEach(L => { if (!unicas.some(U => U.base.sedeId === L.base.sedeId && ultimaHuella(U) === ultimaHuella(L) && U.base.cierres.length === L.base.cierres.length)) unicas.push(L); });
    const sedes = [...new Set(unicas.map(L => L.base.sedeId))];
    if (sedes.length > 1) { problemas.push(`Cargaste bases de distintas sedes (${sedes.join(', ')}). Cargá solo la base de la sede que vas a cerrar.`); S.base = null; S.choque = null; return; }
    const max = Math.max(...unicas.map(L => L.base.cierres.length));
    const top = unicas.filter(L => L.base.cierres.length === max);
    S.ignoradasBase = unicas.filter(L => L.base.cierres.length < max).map(L => {
      const cadena = top[0].base.cierres[L.base.cierres.length - 1];
      const antecesora = cadena && cadena.huella === ultimaHuella(L);
      return antecesora ? `${L.archivo}: se ignoró porque llega hasta el cierre N° ${L.base.cierres.length} y hay una más nueva.`
        : `${L.archivo}: llega hasta el cierre N° ${L.base.cierres.length}, pero ese cierre es distinto del que tiene la base más nueva. Hubo cierres en paralelo: revisá cuál es el correcto.`;
    });
    if (top.length > 1) { S.choque = top; S.base = null; }
    else { S.choque = null; usarBase(top[0], problemas); }
  }
  function usarBase(L, problemas) {
    S.base = L; S.choque = null;
    if (!SEDES[L.base.sedeId] && L.sede && L.sede.id === L.base.sedeId) {
      registrarSede(Object.assign({}, L.sede, { origen: 'Configuración traída de la base' }), true);
      opcionesSedes();
    }
    if (!SEDES[L.base.sedeId]) (problemas || []).push(`${L.archivo}: es una base de la sede "${L.base.sedeId}", que no está configurada en esta app.`);
    else $('sede').value = L.base.sedeId;
    S.editando = null; pintarSede();
  }

  function tablasActivas() {
    if (S.tablas) return { equivalencias: S.tablas.equivalencias, materias: S.tablas.materias, origen: `${S.tablas.archivo} (cargada ahora)` };
    if (S.base && Object.keys(S.base.tablas.equivalencias).length) return { equivalencias: S.base.tablas.equivalencias, materias: S.base.tablas.materias, origen: 'Guardada en la base' };
    return null;
  }

  function render(problemas) {
    const s = sede();
    pintarSede(); renderNueva();
    // Base
    let h = '';
    if (S.choque) {
      h += `<div class="msg bad"><b>Hay ${S.choque.length} bases distintas del mismo cierre (N° ${S.choque[0].base.cierres.length}).</b> Dos personas cerraron el mismo mes partiendo de la misma base. Elegí cuál vale; la otra no se usa (conviene borrarla de la carpeta compartida para que no vuelva a pasar).
        <div style="margin-top:8px">${S.choque.map((L, i) => { const u = L.base.cierres[L.base.cierres.length - 1];
          return `<div class="fila"><button class="chico" data-elegir="${i}">Usar esta</button> ${esc(L.archivo)} · corte ${fmtF(u.fechaCorte)} · stock ${miles(u.stock)} · confirmó <b>${esc(u.autor || 'sin nombre')}</b>${u.confirmado ? ' el ' + fmtF(u.confirmado) : ''}</div>`; }).join('')}</div></div>`;
    }
    (S.ignoradasBase || []).forEach(x => { h += `<div class="msg ${/paralelo/.test(x) ? 'bad' : 'warn'}">${esc(x)}</div>`; });
    if (S.base) {
      const b = S.base.base, ult = b.cierres[b.cierres.length - 1];
      h += `<div class="msg info"><b>Base:</b> ${esc(S.base.archivo)} · ${b.cierres.length} cierre(s) · último corte <b>${fmtF(ult && ult.fechaCorte)}</b>${ult && ult.autor ? ` (confirmó ${esc(ult.autor)})` : ''} · stock ${miles(ult && ult.stock)} · ${miles(Object.keys(b.expedientes).length)} causas en el universo
        <button class="chico sec" id="quitarBase">Quitar</button></div>`;
      S.base.avisos.forEach(a => { h += `<div class="msg warn">${esc(a)}</div>`; });
      if (s && b.sedeId !== s.id) h += `<div class="msg bad">La base es de otra sede (${esc(b.sedeId)}).</div>`;
      const rec = lsGet(LS + b.sedeId);
      if (rec && rec.numero > b.cierres.length) h += `<div class="msg bad">En esta computadora ya se confirmó el cierre N° ${rec.numero} (corte ${fmtF(rec.corte)}). Esta base llega hasta el N° ${b.cierres.length}: no es la última. Usá la base más reciente.</div>`;
    } else if (!S.choque) h += `<div class="msg info">Sin base cargada: se hará el <b>primer cierre</b> (foto inicial).</div>`;
    $('baseInfo').innerHTML = h;
    if ($('quitarBase')) $('quitarBase').onclick = () => { S.base = null; S.ignoradasBase = []; invalidar(); render(); };
    document.querySelectorAll('[data-elegir]').forEach(el => el.onclick = () => { const L = S.choque[+el.dataset.elegir]; S.ignoradasBase = []; usarBase(L); invalidar(); render(); });

    // Tablas
    const t = tablasActivas();
    $('tablasInfo').innerHTML = t
      ? `<div class="msg info"><b>Tabla de equivalencias:</b> ${esc(t.origen)} · ${miles(Object.keys(t.equivalencias).length)} tipos de juicio${Object.keys(t.materias).length ? ` · ${miles(Object.keys(t.materias).length)} con materia` : ''}${S.tablas && S.tablas.conflictos.length ? ` · <span class="tag bad">${S.tablas.conflictos.length} conflictos</span>` : ''}</div>`
      : `<div class="msg warn">Falta la tabla de equivalencias (archivo “Códigos”): sin ella no se puede saber qué causas son ordinarias.</div>`;
    if (s && s.tipo === 'multifuero' && t && !Object.keys(t.materias).length) $('tablasInfo').innerHTML += `<div class="msg warn">La tabla no trae la columna Materia (hoja JUICIOS GRAL): en esta sede multifuero solo se reconocerán las causas del grupo del trabajo.</div>`;

    // Piezas
    if (S.piezas.length) {
      let tb = `<h3>Reportes reconocidos</h3><div class="tabla"><table><tr><th>Archivo › hoja</th><th>Tipo</th><th class="n">Filas</th><th>Filtros del reporte</th><th>Columnas</th><th></th></tr>`;
      S.piezas.forEach(p => {
        const falta = IO.faltantes(p);
        tb += `<tr><td>${esc(p.archivo)} › <b>${esc(p.hoja)}</b></td>
          <td><select data-tipo="${p.id}">${['foto', 'remisiones', 'resoluciones', 'avocamiento'].map(k => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${IO.ETIQUETA[k]}</option>`).join('')}</select></td>
          <td class="n">${miles(p.rows.length - p.desde)}</td>
          <td>${p.filtros ? `<details><summary class="mut">ver</summary><div class="filtro">${esc(p.filtros)}</div></details>` : '<span class="tag warn">sin fila de filtros</span>'}</td>
          <td>${falta.length ? `<span class="tag bad">faltan: ${falta.map(c => IO.NOMBRES[c]).join(', ')}</span>` : '<span class="tag ok">completas</span>'} <button class="chico sec" data-mapear="${p.id}">Mapear columnas</button></td>
          <td><button class="chico sec" data-quitar="${p.id}">Quitar</button></td></tr>
          <tr id="mapa-${p.id}" hidden><td colspan="6"></td></tr>`;
      });
      tb += '</table></div>';
      if (S.ignoradas.length) tb += `<details><summary class="mut">Hojas ignoradas (${S.ignoradas.length})</summary><div class="mut">${S.ignoradas.map(esc).join('<br>')}</div></details>`;
      $('piezas').innerHTML = tb;
      document.querySelectorAll('[data-tipo]').forEach(el => el.onchange = () => { const p = S.piezas.find(q => q.id == el.dataset.tipo); p.tipo = el.value; invalidar(); render(); });
      document.querySelectorAll('[data-quitar]').forEach(el => el.onclick = () => { S.piezas = S.piezas.filter(q => q.id != el.dataset.quitar); invalidar(); render(); });
      document.querySelectorAll('[data-mapear]').forEach(el => el.onclick = () => abrirMapa(S.piezas.find(q => q.id == el.dataset.mapear)));
    } else $('piezas').innerHTML = '';

    // Lista de control
    const tiene = k => S.piezas.some(p => p.tipo === k);
    const items = [['foto', 'Foto del SAC'], ['remisiones', 'Remisiones'], ['resoluciones', 'Resoluciones'], ['avocamiento', 'Avocamiento y AVC']];
    let ch = '<div class="fila">' + items.map(([k, l]) => `<span class="tag ${tiene(k) ? 'ok' : (k === 'foto' ? 'bad' : 'warn')}">${tiene(k) ? '✓' : '✗'} ${l}</span>`).join('') + `<span class="tag ${t ? 'ok' : 'bad'}">${t ? '✓' : '✗'} Tabla de equivalencias</span></div>`;
    if (!tiene('remisiones') || !tiene('resoluciones') || !tiene('avocamiento')) ch += `<div class="msg warn">Falta algún reporte: se puede calcular, pero solo con los eventos que ya están en la base.</div>`;
    if (!s) ch += `<div class="msg warn">Falta configurar la sede (paso 1).</div>`;
    else if (tiene('foto')) {
      // ¿La foto trae filas de la sede elegida?
      let n = 0, total = 0;
      S.piezas.filter(p => p.tipo === 'foto' && p.mapa.dependencia !== undefined).forEach(p => { for (let i = p.desde; i < p.rows.length; i++) { const r = p.rows[i]; if (!r) continue; total++; if (r[p.mapa.dependencia] !== null && String(r[p.mapa.dependencia]).trim() in s.dependencias) n++; } });
      if (total && !n) ch += `<div class="msg bad">Ninguna fila de la foto es de las dependencias de "${esc(s.nombre)}". ¿Elegiste bien la sede? Si es una sede que no está en la lista, <button class="chico" id="irNueva">configurala como sede nueva</button>.</div>`;
    }
    (problemas || []).forEach(x => { ch += `<div class="msg bad">${esc(x)}</div>`; });
    $('checklist').innerHTML = ch;
    if ($('irNueva')) $('irNueva').onclick = () => { $('sede').value = NUEVA; S.editando = null; invalidar(); render(); $('p1').scrollIntoView({ behavior: 'smooth' }); };

    const listo = !!s && !S.editando && !S.choque && tiene('foto') && t && S.piezas.every(p => !IO.faltantes(p).length);
    $('p3').classList.toggle('inactivo', !listo);
  }

  function abrirMapa(p) {
    const fila = $('mapa-' + p.id); fila.hidden = !fila.hidden;
    if (fila.hidden) return;
    const campos = IO.REQUERIDOS[p.tipo].concat(IO.OPCIONALES[p.tipo]);
    const opts = sel => `<option value="">— sin columna —</option>` + p.encabezados.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || '(columna ' + (i + 1) + ')')}</option>`).join('');
    fila.firstElementChild.innerHTML = `<div class="mapa">${campos.map(c => `<label>${IO.NOMBRES[c]}${IO.REQUERIDOS[p.tipo].includes(c) ? ' *' : ''}</label><select data-campo="${c}">${opts(p.mapa[c])}</select>`).join('')}</div>
      <button class="chico" id="aplicarMapa">Aplicar</button> <span class="mut">* obligatoria. Encabezados en la fila ${p.filaEncabezado}.</span>`;
    $('aplicarMapa').onclick = () => {
      fila.querySelectorAll('[data-campo]').forEach(s => { if (s.value === '') delete p.mapa[s.dataset.campo]; else p.mapa[s.dataset.campo] = Number(s.value); });
      invalidar(); render();
    };
  }

  /* ---------- Paso 3 ---------- */
  function invalidar() {
    S.borrador = null; S.confirmado = false;
    $('previa').innerHTML = ''; $('errores').innerHTML = ''; $('hecho').innerHTML = '';
    $('p4').classList.add('inactivo');
  }

  function baseDeTrabajo() {
    let b = S.base ? S.base.base : E.baseVacia(sede());
    S.anot.forEach(a => { b = E.anotar(b, a.exp, a.campo, a.valor, $('autor').value || 'sin nombre', a.motivo); });
    return b;
  }

  async function calcular() {
    estado('Calculando…'); await tick();
    try {
      const cargas = S.piezas.map((p, i) => IO.aCarga(p, 'c' + (i + 1)));
      const t = tablasActivas();
      S.baseTrabajo = baseDeTrabajo();
      const b = E.procesar({ sede: sede(), catalogo: CFG.CATALOGO, tablas: t, base: S.baseTrabajo, cargas, fechaCorte: $('corte').value || null });
      S.borrador = b;
      if (!b.ok) {
        $('errores').innerHTML = b.errores.map(e => `<div class="msg bad">${esc(e)}</div>`).join('') +
          (b.fechaCorteSugerida ? `<div class="msg info">Fecha sugerida por los reportes: <b>${fmtF(b.fechaCorteSugerida)}</b>.</div>` : '');
        $('previa').innerHTML = ''; $('p4').classList.add('inactivo');
      } else {
        $('errores').innerHTML = '';
        if (!$('corte').value) $('corte').value = b.fechaCorte;
        $('corteNota').textContent = b.fechaCorte === b.fechaCorteSugerida ? 'Coincide con el evento más reciente de los reportes.' : `Los reportes sugieren ${fmtF(b.fechaCorteSugerida)}.`;
        previa(b);
        $('p4').classList.remove('inactivo');
      }
    } catch (e) { $('errores').innerHTML = `<div class="msg bad">Error inesperado: ${esc(e.message)}</div>`; console.error(e); }
    estado('');
    document.body.dataset.calculos = String(Number(document.body.dataset.calculos || 0) + 1);
  }

  const CLASIF = ['Sin avocamiento', 'Avocada sin operación de AVC', 'Avocada con operación de AVC'];
  function previa(b) {
    const r = b.resumen, c = b.conciliacion, s = sede();
    const nAv = b.avisos.filter(a => a.tipo !== 'Cobertura').length, cob = b.avisos.filter(a => a.tipo === 'Cobertura');
    let h = `<div class="kpis">
      <div class="kpi"><div class="v">${miles(r.stock)}</div><div class="l">Stock pendiente al ${fmtF(b.fechaCorte)}</div></div>
      <div class="kpi">${c ? `<div class="v">${miles(c.stockAnterior)} − ${miles(c.sale)} + ${miles(c.entra)}</div><div class="l">Conciliación con el ${fmtF(c.corteAnterior)}: ${c.cierra ? '<span class="tag ok">cierra</span>' : '<span class="tag bad">NO cierra</span>'}</div>` : `<div class="v">—</div><div class="l">Primer cierre: sin corte anterior</div>`}</div>
      <div class="kpi"><div class="v">${miles(nAv)}</div><div class="l">Avisos por expediente</div></div>
      <div class="kpi"><div class="v">${miles(b.revision.length)}</div><div class="l">Filas no procesadas</div></div></div>`;
    cob.forEach(a => { h += `<div class="msg warn"><b>Cobertura:</b> ${esc(a.detalle)}</div>`; });
    const rev = b.consolidado.filter(x => x.revisar);
    if (rev.length) h += `<div class="msg warn"><b>${miles(rev.length)} causa(s) a revisar:</b> están resueltas pero tienen un movimiento posterior (nueva elevación o reactivación). Se cuentan como resueltas; en el informe van en la hoja “Causas a revisar” para corregir el SAC. ${rev.slice(0, 12).map(x => `<a href="#" data-exp="${esc(x.exp)}">${esc(x.exp)}</a>`).join(' · ')}${rev.length > 12 ? ' …' : ''}</div>`;

    // Año × avocamiento
    const anios = Object.keys(r.porAnio).sort((a, b2) => (a === 'Sin fecha') - (b2 === 'Sin fecha') || (a < b2 ? -1 : 1));
    h += `<div class="grid2"><div><h3>Stock por año de elevación y avocamiento</h3><div class="tabla"><table><tr><th>Año</th>${CLASIF.map(x => `<th class="n">${x}</th>`).join('')}<th class="n">Total</th></tr>`;
    anios.forEach(a => { h += `<tr><td>${esc(a)}</td>${CLASIF.map(cl => `<td class="n">${miles(b.stock.filter(x => x.anioElevacion === a && x.clasificacion === cl).length)}</td>`).join('')}<td class="n"><b>${miles(r.porAnio[a])}</b></td></tr>`; });
    h += `<tr><th>Total</th>${CLASIF.map(cl => `<th class="n">${miles(r.porClasificacion[cl] || 0)}</th>`).join('')}<th class="n">${miles(r.stock)}</th></tr></table></div></div><div>`;
    if (s.tipo === 'multifuero' || Object.keys(s.dependencias).length > 1)
      h += `<h3>Por secretaría</h3><table>${Object.entries(r.porSecretaria).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${miles(v)}</td></tr>`).join('')}</table>`;
    if (s.tipo === 'multifuero') {
      h += `<h3>Por criterio de ingreso al universo laboral</h3><table>${Object.entries(r.porCriterio).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${miles(v)}</td></tr>`).join('')}</table>`;
    }
    h += `<h3>Ordinarios del universo por situación</h3><table>${Object.entries(r.porSituacion).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${miles(v)}</td></tr>`).join('')}</table>`;
    h += `<h3>Insumos</h3><table><tr><th>Reporte</th><th class="n">Aceptadas</th><th class="n">Otra dep.</th><th class="n">Fuera de alcance</th><th class="n">Observadas</th></tr>${b.infoCargas.map(x => `<tr><td>${esc(x.archivo)}</td><td class="n">${miles(x.aceptadas)}</td><td class="n">${miles(x.fueraDeSede)}</td><td class="n">${miles(x.fueraDeAlcance)}</td><td class="n">${miles(x.observadas)}</td></tr>`).join('')}</table>`;
    h += `</div></div>`;

    // Avisos agrupados
    const grupos = {};
    b.avisos.filter(a => a.tipo !== 'Cobertura').forEach(a => (grupos[a.tipo] = grupos[a.tipo] || []).push(a));
    if (b.revision.length) grupos['Fila no procesada'] = b.revision.map(x => ({ exp: x.exp || '', detalle: `${x.archivo}, fila ${x.fila}: ${x.motivo} (valor "${x.valor}")` }));
    h += `<h3>Avisos</h3>`;
    if (!Object.keys(grupos).length) h += `<div class="msg ok">Sin avisos.</div>`;
    Object.keys(grupos).sort().forEach(k => {
      const l = grupos[k];
      h += `<details><summary>${esc(k)} <span class="tag">${miles(l.length)}</span></summary><div class="tabla"><table><tr><th>N° de SAC</th><th>Detalle</th></tr>${l.slice(0, 300).map(a => `<tr><td>${a.exp ? `<a href="#" data-exp="${esc(a.exp)}">${esc(a.exp)}</a>` : ''}</td><td>${esc(a.detalle)}</td></tr>`).join('')}${l.length > 300 ? `<tr><td colspan="2" class="mut">… y ${miles(l.length - 300)} más (están todos en el informe, hoja Avisos)</td></tr>` : ''}</table></div></details>`;
    });

    // Movimientos
    if (c) {
      h += `<h3>Movimientos respecto del ${fmtF(c.corteAnterior)}</h3>`;
      if (!b.movimientos.length) h += `<div class="mut">Sin movimientos.</div>`;
      else {
        const mot = {}; b.movimientos.forEach(m => { const k = m.movimiento + ' · ' + m.motivo.replace(/\s*\(.*\)$/, '').replace(/:.*/, ''); mot[k] = (mot[k] || 0) + 1; });
        h += `<table>${Object.entries(mot).sort().map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${miles(v)}</td></tr>`).join('')}</table>
          <details><summary>Ver por expediente (${miles(b.movimientos.length)})</summary><div class="tabla"><table><tr><th>N° de SAC</th><th>Movimiento</th><th>Motivo</th></tr>${b.movimientos.slice(0, 1000).map(m => `<tr><td><a href="#" data-exp="${esc(m.exp)}">${esc(m.exp)}</a></td><td>${esc(m.movimiento)}</td><td>${esc(m.motivo)}</td></tr>`).join('')}</table></div></details>`;
      }
    }

    // Buscador
    h += `<h3>Buscar un expediente</h3><div class="fila"><input type="search" id="buscar" placeholder="N° de SAC"> <button class="chico" id="btnBuscar">Buscar</button></div><div id="ficha"></div>`;
    if (S.anot.length) h += `<div class="msg info">${S.anot.length} anotación(es) manual(es) se guardarán en la base al confirmar.</div>`;
    $('previa').innerHTML = h;
    document.querySelectorAll('[data-exp]').forEach(a => a.onclick = e => { e.preventDefault(); $('buscar').value = a.dataset.exp; ficha(a.dataset.exp); $('ficha').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('btnBuscar').onclick = () => ficha($('buscar').value);
    $('buscar').onkeydown = e => { if (e.key === 'Enter') ficha($('buscar').value); };
  }

  const ETQ = { enStock: 'En stock', situacion: 'Situación', tipoProceso: 'Tipo de proceso', tipoProcesoTabla: 'Según la tabla', reclasificacion: 'Reclasificación', criterio: 'Universo', secretaria: 'Secretaría',
    presente: 'En la foto actual', estado: 'Estado SAC', ubicacion: 'Ubicación', tipoJuicio: 'Tipo de juicio', fechaElevacion: 'Elevación', clasificacion: 'Avocamiento', ultimoAvocamiento: 'Último avocamiento',
    ultimaAvcTipo: 'Última AVC', ultimaAvcFecha: 'Fecha AVC', resolucionTipo: 'Resolución', resolucionFecha: 'Fecha resolución', autoTipo: 'Auto', motivoIngreso: 'Ingreso', observacion: 'Observación', vocal: 'Vocal' };
  function ficha(v) {
    const k = E.normalizarClave(v), el = $('ficha'), b = S.borrador;
    if (!k.ok) { el.innerHTML = `<div class="msg warn">${esc(k.motivo)}</div>`; return; }
    const f = b.consolidado.find(x => x.exp === k.clave);
    const evs = b._estado.eventos.filter(e => e.exp === k.clave);
    if (!f) { el.innerHTML = `<div class="msg warn">El expediente ${esc(k.clave)} no está en el universo de esta sede${evs.length ? ` (tiene ${evs.length} eventos registrados)` : ''}.</div>`; return; }
    const an = (S.baseTrabajo.anotaciones || {})[k.clave] || {};
    let h = `<div class="grid2"><div><table>${Object.keys(ETQ).filter(c => f[c]).map(c => `<tr><th>${ETQ[c]}</th><td>${esc(c.toLowerCase().includes('fecha') || c === 'ultimoAvocamiento' ? fmtF(f[c]) : f[c])}</td></tr>`).join('')}
      ${f.avisos.length ? `<tr><th>Avisos</th><td>${f.avisos.map(a => `<span class="tag warn">${esc(a)}</span>`).join(' ')}</td></tr>` : ''}</table></div>
      <div><h3 style="margin-top:0">Eventos</h3><div class="tabla" style="max-height:220px"><table><tr><th>Fecha</th><th>Operación</th><th>Fuente</th></tr>${evs.map(e => `<tr><td>${fmtF(e.fecha)}${e.fecha > b.fechaCorte ? ' <span class="tag warn">posterior al corte</span>' : ''}</td><td>${esc(e.tipo)}</td><td class="mut">${esc(e.fuente)}</td></tr>`).join('') || '<tr><td colspan="3" class="mut">Sin eventos</td></tr>'}</table></div>
      <h3>Anotaciones manuales</h3>
      <div class="mapa"><label>Observación</label><input type="text" id="aObs" value="${esc(an.observacion || '')}">
      <label>Vocal</label><input type="text" id="aVoc" value="${esc(an.vocal || '')}">
      <label>Reclasificar tipo de proceso</label><select id="aTp">${['', 'Ordinario', 'Recurso de apelación', 'Especiales', 'PDA', 'Otros'].map(o => `<option ${an.tipoProcesoManual === o ? 'selected' : ''} value="${o}">${o || '— según la tabla —'}</option>`).join('')}</select>
      <label>Motivo</label><input type="text" id="aMot" value="${esc(an.motivoReclasificacion || '')}"></div>
      <button class="chico" id="aGuardar">Guardar y recalcular</button></div></div>`;
    el.innerHTML = h;
    $('aGuardar').onclick = async () => {
      const cambios = [['observacion', $('aObs').value], ['vocal', $('aVoc').value], ['tipoProcesoManual', $('aTp').value], ['motivoReclasificacion', $('aMot').value]];
      cambios.forEach(([campo, valor]) => { if ((an[campo] || '') !== valor) S.anot.push({ exp: k.clave, campo, valor, motivo: 'Anotación desde la vista previa' }); });
      if ($('aTp').value && !$('aMot').value) { el.insertAdjacentHTML('afterbegin', '<div class="msg warn">Indicá el motivo de la reclasificación.</div>'); S.anot = S.anot.filter(a => !(a.exp === k.clave && a.motivo === 'Anotación desde la vista previa')); return; }
      await calcular(); $('buscar').value = k.clave; ficha(k.clave);
    };
  }

  /* ---------- Paso 4 ---------- */
  const nombreSede = () => (sede().nombreArchivo || sede().nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  function confirmar() {
    const b = S.borrador;
    if (!b || !b.ok) return;
    if (S.confirmado) { $('hecho').innerHTML = '<div class="msg warn">Este cierre ya se confirmó. Para otro mes, recargá la página y partí de la base nueva.</div>'; return; }
    const autor = $('autor').value.trim();
    if (!autor) { $('hecho').innerHTML = '<div class="msg warn">Indicá quién confirma el cierre.</div>'; $('autor').focus(); return; }
    try {
      // Las anotaciones se registran con el nombre de quien confirma
      S.baseTrabajo = baseDeTrabajo();
      const nb = E.confirmar(S.baseTrabajo, b, { autor });
      const t = tablasActivas();
      const n = nb.cierres.length, corte = b.fechaCorte;
      const quien = autor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
      const fBase = `Base_${nombreSede()}_${corte}_cierre${n}_${quien}.xlsx`, fInf = `Informe_${nombreSede()}_${corte}.xlsx`;
      XLSX.writeFile(IO.escribirBase(nb, t, sede()), fBase, { compression: true });
      XLSX.writeFile(IO.armarInforme(b, sede(), { numeroCierre: n, autor, tablasOrigen: t.origen }), fInf, { compression: true });
      lsSet(LS + sede().id, { numero: n, corte, huella: nb.cierres[n - 1].huella });
      S.confirmado = true;
      $('hecho').innerHTML = `<div class="msg ok">Cierre N° ${n} al ${fmtF(corte)} confirmado. Se descargaron <b>${esc(fBase)}</b> (guardala: es la base del próximo mes) y <b>${esc(fInf)}</b>.</div>`;
      $('confirmar').disabled = true;
    } catch (e) { $('hecho').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
  }
  function soloInforme() {
    const b = S.borrador; if (!b || !b.ok) return;
    const t = tablasActivas();
    XLSX.writeFile(IO.armarInforme(b, sede(), { numeroCierre: 'BORRADOR (sin confirmar)', autor: $('autor').value, tablasOrigen: t.origen }), `Informe_BORRADOR_${nombreSede()}_${b.fechaCorte}.xlsx`, { compression: true });
  }

  /* ---------- Inicio ---------- */
  initSedes(); initDrop(); render();
  $('calcular').onclick = calcular;
  // Cambiar la fecha invalida la vista previa: no se puede confirmar un cálculo hecho con otra fecha.
  $('corte').onchange = () => { if (S.borrador) { invalidar(); $('corteNota').textContent = 'Cambiaste la fecha: volvé a calcular la vista previa.'; } };
  $('confirmar').onclick = confirmar;
  $('borrador').onclick = soloInforme;
  window.__stockApp = S; // para pruebas automáticas
})();
