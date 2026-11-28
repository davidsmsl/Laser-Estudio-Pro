// Interfaz: barras de herramientas, barra numérica, paneles laterales y paleta de capas.
(function (LS) {
  const G = LS.G, D = LS.D, V = LS.V;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const U = { h, esc, $ };

  const IC = {
    nuevo: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', abrir: '<path d="M3 7h6l2 2h10v10H3z"/>', guardar: '<path d="M5 3h12l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
    importar: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v4h16v-4"/>', deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', rehacer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    seleccionar: '<path d="M5 3l14 8-6 2-3 6z"/>', linea: '<path d="M4 18l6-10 5 7 5-11"/><circle cx="4" cy="18" r="1.3"/><circle cx="20" cy="4" r="1.3"/>', rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    elipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>', poligono: '<path d="M12 3l8 6-3 10H7L4 9z"/>', texto: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    zona: '<path d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4"/><rect x="8" y="8" width="8" height="8" stroke-dasharray="2 2"/>',
    origenUsuario: '<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    quitarFondo: '<path d="M4 20 14 10"/><path d="M15 4v3M18.5 5.5l-2 2M20 9h-3"/><path d="M15 9l1.5 1.5"/><rect x="3" y="3" width="7" height="7" stroke-dasharray="2 2"/>',
    union: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>', diferencia: '<path d="M14 7.5A5 5 0 1 0 14 16.5"/><circle cx="15" cy="12" r="5" stroke-dasharray="2 2"/>', interseccion: '<path d="M12 8a5 5 0 0 1 0 8a5 5 0 0 1 0-8z" fill="currentColor"/><circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
    offset: '<rect x="8" y="8" width="8" height="8"/><rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="2 2"/>', calcar: '<path d="M4 18c3-8 6-12 8-12s4 6 8 12"/><rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2"/>',
    agrupar: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/><path d="M2 2h20v20H2z" stroke-dasharray="2 2"/>', desagrupar: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
    reflejarH: '<path d="M12 3v18"/><path d="M9 7L3 12l6 5zM15 7l6 5-6 5z"/>', reflejarV: '<path d="M3 12h18"/><path d="M7 9l5-6 5 6zM7 15l5 6 5-6z"/>', girar90: '<path d="M20 12a8 8 0 1 1-3-6.3"/><path d="M20 3v5h-5"/>',
    alinIzq: '<path d="M4 3v18"/><rect x="6" y="6" width="10" height="4"/><rect x="6" y="14" width="14" height="4"/>', alinCentroH: '<path d="M12 3v18"/><rect x="7" y="6" width="10" height="4"/><rect x="5" y="14" width="14" height="4"/>', alinDer: '<path d="M20 3v18"/><rect x="8" y="6" width="10" height="4"/><rect x="4" y="14" width="14" height="4"/>',
    alinArriba: '<path d="M3 4h18"/><rect x="6" y="6" width="4" height="10"/><rect x="14" y="6" width="4" height="14"/>', alinCentroV: '<path d="M3 12h18"/><rect x="6" y="7" width="4" height="10"/><rect x="14" y="5" width="4" height="14"/>', alinAbajo: '<path d="M3 20h18"/><rect x="6" y="8" width="4" height="10"/><rect x="14" y="4" width="4" height="14"/>',
    distH: '<path d="M4 3v18M20 3v18"/><rect x="9" y="8" width="6" height="8"/>', distV: '<path d="M3 4h18M3 20h18"/><rect x="8" y="9" width="8" height="6"/>',
    matriz: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    vista: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', zoom: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    rotativo: '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/>', prueba: '<rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5" fill="currentColor" opacity=".4"/><rect x="17" y="3" width="4" height="5" fill="currentColor"/><rect x="3" y="10" width="5" height="5" fill="currentColor" opacity=".4"/><rect x="10" y="10" width="5" height="5" fill="currentColor"/>',
    cubo: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>',
    maquina: '<rect x="2" y="3" width="20" height="18" rx="1"/><path d="M2 9h20"/><rect x="10" y="7" width="4" height="6" fill="currentColor"/>',
    rodillos: '<rect x="3" y="7" width="18" height="3" rx="1.5"/><rect x="3" y="14" width="18" height="3" rx="1.5"/><ellipse cx="12" cy="12" rx="9" ry="2.2" stroke-dasharray="2 1.5"/>',
    iman: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/>'
  };
  U.icon = k => `<svg viewBox="0 0 24 24">${IC[k] || ''}</svg>`;

  // ---------- Barra superior ----------
  function buildToolbar() {
    const tb = $('#toolbar');
    const items = [['nuevo', 'Nuevo (Ctrl+N)', 'nuevo'], ['abrir', 'Abrir (Ctrl+O)', 'abrir'], ['guardar', 'Guardar (Ctrl+S)', 'guardar'], ['importar', 'Importar SVG, DXF o imagen (Ctrl+I)', 'importar'], '|',
      ['deshacer', 'Deshacer (Ctrl+Z)', 'deshacer'], ['rehacer', 'Rehacer (Ctrl+Y)', 'rehacer'], '|',
      ['agrupar', 'Agrupar (Ctrl+G)', 'agrupar'], ['desagrupar', 'Desagrupar (Ctrl+U)', 'desagrupar'], ['reflejarH', 'Reflejar horizontal', 'reflejarH'], ['reflejarV', 'Reflejar vertical', 'reflejarV'], ['girar90', 'Girar 90°', 'girar90'], '|',
      ['alinIzq', 'Alinear a la izquierda', 'alin:izq'], ['alinCentroH', 'Centrar horizontalmente', 'alin:centroH'], ['alinDer', 'Alinear a la derecha', 'alin:der'], ['alinArriba', 'Alinear arriba', 'alin:arriba'], ['alinCentroV', 'Centrar verticalmente', 'alin:centroV'], ['alinAbajo', 'Alinear abajo', 'alin:abajo'], ['distH', 'Distribuir horizontalmente', 'dist:h'], ['distV', 'Distribuir verticalmente', 'dist:v'], '|',
      ['matriz', 'Matriz rectangular', 'matriz'], ['prueba', 'Prueba de materiales', 'pruebaMaterial'], ['rotativo', 'Configuración de rotativo', 'rotativo'], ['cubo', 'Simulación 3D del rotativo (Alt+3)', 'vista3d'], ['vista', 'Vista previa (Alt+P)', 'vistaPrevia'], ['zoom', 'Ajustar a la mesa', 'zoomMesa'], ['iman', 'Ajustar a la cuadrícula', 'iman'], '|', ['maquina', 'Mostrar/ocultar esquema de la máquina (Alt+M)', 'verMaquina'], ['rodillos', 'Mostrar/ocultar esquema del rotativo (Alt+R)', 'verRotativo']];
    tb.append(h('<span class="brand">Láser Estudio Pro</span>'));
    items.forEach(it => {
      if (it === '|') return tb.append(h('<span class="sep"></span>'));
      const b = h(`<button class="tb" data-cmd="${it[2]}" title="${it[1]}">${U.icon(it[0])}</button>`);
      b.onclick = () => { if (it[2] === 'iman') { V.snapGrid = !V.snapGrid; b.classList.toggle('on', V.snapGrid); toast(V.snapGrid ? 'Ajuste a la cuadrícula activado (10 mm).' : 'Ajuste a la cuadrícula desactivado.'); } else LS.app.command(it[2]); };
      tb.append(b);
    });
  }
  // ---------- Caja de herramientas ----------
  const TOOLS = [['seleccionar', 'Seleccionar (V)'], ['linea', 'Línea / polilínea (L) — doble clic para terminar'], ['rect', 'Rectángulo (R) — Mayús: cuadrado'], ['elipse', 'Elipse (E) — Mayús: círculo'], ['poligono', 'Polígono (P)'], ['texto', 'Texto (T)'], ['origenUsuario', 'Fijar referencia: haga clic en el punto del lienzo donde está físicamente el láser'], ['zona', 'Zona parcial (Z): dibuje un recuadro y solo se grabará o cortará lo que quede dentro, sin modificar el diseño (para repasar o reforzar una parte)'], null,
    ['union', 'Unión booleana', 'union'], ['diferencia', 'Diferencia booleana', 'diferencia'], ['interseccion', 'Intersección booleana', 'interseccion'], ['offset', 'Desplazar formas (offset)', 'offset'], ['calcar', 'Calcar imagen', 'calcar'], ['quitarFondo', 'Quitar fondo y detectar siluetas (F): seleccione una imagen y elimine su fondo uniforme o haga clic con la varita sobre el fondo', 'quitarFondo']];
  function buildToolbox() {
    const tbx = $('#toolbox');
    TOOLS.forEach(t => {
      if (!t) return tbx.append(h('<span class="sep" style="width:22px;height:1px;margin:5px 0"></span>'));
      const b = h(`<button class="tb" data-tool="${t[0]}" title="${t[1]}">${U.icon(t[0])}</button>`);
      b.onclick = () => t[2] ? LS.app.command(t[2]) : U.setTool(t[0]);
      tbx.append(b);
    });
    U.setTool('seleccionar');
  }
  U.setTool = t => {
    if (V.tool === 'linea' && t !== 'linea') V.cancelDraft();
    V.tool = t; document.querySelectorAll('#toolbox .tb[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $('#cv').style.cursor = t === 'seleccionar' ? '' : 'crosshair';
    U.refreshNumeric();
  };

  // ---------- Barra numérica ----------
  let anchor = 'cen-cen', lock = true;
  U.lockRatio = () => lock;
  U.polygonSides = () => Number(($('#nb-lados') || {}).value) || 6;
  function buildNumbar() {
    const nb = $('#numbar');
    nb.innerHTML = `
      <div class="f"><div class="anchor9" id="nb-anchor" title="Punto de referencia">${['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'].map(a => `<i data-a="${a}"></i>`).join('')}</div></div>
      <div class="f"><label>X</label><input type="number" step="0.1" id="nb-x"></div>
      <div class="f"><label>Y</label><input type="number" step="0.1" id="nb-y"></div>
      <div class="f"><label>Ancho</label><input type="number" step="0.1" id="nb-w"></div>
      <div class="f"><label>Alto</label><input type="number" step="0.1" id="nb-h"></div>
      <div class="f"><button class="tb on" id="nb-lock" title="Mantener proporción"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button></div>
      <div class="f"><label>Rotar</label><input type="number" step="1" id="nb-rot" value="0" title="Grados a rotar (Intro para aplicar)"></div>
      <div class="f" id="nb-poly"><label>Lados</label><input type="number" id="nb-lados" min="3" max="64" value="6" style="width:56px"></div>
      <div class="f"><label>Capa</label><select id="nb-layer"></select></div>
      <div class="f"><button id="nb-mat" title="Elegir material: aplica velocidad, potencia y pasadas sugeridas a la capa de lo seleccionado (o a la capa actual)">🗄 Material…</button></div>
      <span id="nb-info" class="chip"></span>`;
    nb.querySelectorAll('#nb-anchor i').forEach(i => i.onclick = () => { anchor = i.dataset.a; U.refreshNumeric(); });
    $('#nb-mat').onclick = () => LS.dlg.materialDB();
    $('#nb-lock').onclick = () => { lock = !lock; $('#nb-lock').classList.toggle('on', lock); };
    const apply = () => {
      const b = D.selBBox(); if (!b) return;
      const x = parseFloat($('#nb-x').value), y = parseFloat($('#nb-y').value); let w = parseFloat($('#nb-w').value), hh = parseFloat($('#nb-h').value);
      if (!(w > 0) || !(hh > 0)) return;
      D.checkpoint();
      const [av, ah] = anchor.split('-');
      const ref = [ah === 'izq' ? b.x0 : ah === 'der' ? b.x1 : (b.x0 + b.x1) / 2, av === 'sup' ? b.y0 : av === 'inf' ? b.y1 : (b.y0 + b.y1) / 2];
      const sx = b.w > 1e-9 ? w / b.w : 1, sy = b.h > 1e-9 ? hh / b.h : 1;
      D.transformSel(G.about(G.sc(sx, sy), ref[0], ref[1]));
      const target = LS.fromDisp(x, y); // en coordenadas internas
      D.transformSel(G.tr(target[0] - ref[0], target[1] - ref[1]));
      D.changed('xf');
    };
    ['x', 'y'].forEach(k => $('#nb-' + k).addEventListener('change', apply));
    $('#nb-w').addEventListener('change', () => { const b = D.selBBox(); if (lock && b && b.w) $('#nb-h').value = +(b.h * $('#nb-w').value / b.w).toFixed(3); apply(); });
    $('#nb-h').addEventListener('change', () => { const b = D.selBBox(); if (lock && b && b.h) $('#nb-w').value = +(b.w * $('#nb-h').value / b.h).toFixed(3); apply(); });
    $('#nb-rot').addEventListener('change', () => { const v = parseFloat($('#nb-rot').value); if (v) LS.ops.rotate(v); $('#nb-rot').value = 0; });
    $('#nb-layer').addEventListener('change', () => { const li = Number($('#nb-layer').value); if (D.selection.size) { D.checkpoint(); D.selected().forEach(o => o.layer = li); D.layer(li); } D.currentLayer = li; D.changed('layers'); });
  }
  U.refreshNumeric = () => {
    const b = D.selBBox(); const has = !!b;
    document.querySelectorAll('#nb-anchor i').forEach(i => i.classList.toggle('on', i.dataset.a === anchor));
    ['x', 'y', 'w', 'h', 'rot'].forEach(k => $('#nb-' + k).disabled = !has);
    $('#nb-poly').style.display = V.tool === 'poligono' ? '' : 'none';
    if (has) {
      const [av, ah] = anchor.split('-');
      const ref = [ah === 'izq' ? b.x0 : ah === 'der' ? b.x1 : (b.x0 + b.x1) / 2, av === 'sup' ? b.y0 : av === 'inf' ? b.y1 : (b.y0 + b.y1) / 2];
      const d = LS.toDisp(ref[0], ref[1]);
      if (document.activeElement !== $('#nb-x')) $('#nb-x').value = +d[0].toFixed(3);
      if (document.activeElement !== $('#nb-y')) $('#nb-y').value = +d[1].toFixed(3);
      if (document.activeElement !== $('#nb-w')) $('#nb-w').value = +b.w.toFixed(3);
      if (document.activeElement !== $('#nb-h')) $('#nb-h').value = +b.h.toFixed(3);
      const sel = D.selected(); $('#nb-info').textContent = sel.length === 1 ? ({ path: 'Forma', image: 'Imagen', text: 'Texto' })[sel[0].kind] + (sel[0].group ? ' (grupo)' : '') : `${sel.length} objetos`;
    } else { ['x', 'y', 'w', 'h'].forEach(k => $('#nb-' + k).value = ''); $('#nb-info').textContent = `${D.objects.length} objetos`; }
    // la capa activa sigue a la selección (p. ej. al escoger un texto se ven y editan los ajustes de su capa)
    if (has) { const ks = [...new Set(D.selected().map(o => o.layer))].filter(k => k < 1000); if (ks.length === 1 && ks[0] !== D.currentLayer) { D.currentLayer = ks[0]; D._capaElegida = false; setTimeout(() => D.changed('layers'), 0); } }
    const ls = $('#nb-layer'); const keys = usedLayers(); if (!keys.includes(D.currentLayer)) keys.push(D.currentLayer);
    ls.innerHTML = keys.sort((a, b) => a - b).map(k => `<option value="${k}" ${k === D.currentLayer ? 'selected' : ''}>${esc(D.layer(k).nombre)}</option>`).join('');
  };
  function usedLayers() { return [...new Set(D.objects.map(o => o.layer))].filter(k => k < 1000); }

  // ---------- Paleta ----------
  function buildPalette() {
    const p = $('#palette'); p.innerHTML = '<label style="margin-right:6px">Capas:</label>';
    LS.PALETTE.forEach((c, i) => {
      const s = h(`<span class="sw" style="background:${c}" title="Capa ${String(i).padStart(2, '0')} — clic: asignar a la selección">${String(i).padStart(2, '0')}</span>`);
      s.onclick = () => { if (D.selection.size) { D.checkpoint(); D.selected().forEach(o => o.layer = i); } D.layer(i); D.currentLayer = i; D._capaElegida = true; D.changed('layers'); };
      p.append(s);
    });
  }
  function refreshPalette() { document.querySelectorAll('#palette .sw').forEach((s, i) => s.classList.toggle('on', i === D.currentLayer)); }

  // ---------- Paneles laterales ----------
  const TABS = [['capas', 'Capas'], ['laser', 'Láser'], ['mover', 'Mover'], ['consola', 'Consola'], ['biblioteca', 'Biblioteca']];
  function buildTabs() {
    const tabs = $('#tabs'), panels = $('#panels');
    TABS.forEach(([id, name], i) => {
      const b = h(`<button data-t="${id}">${name}</button>`); b.onclick = () => U.showTab(id); tabs.append(b);
      panels.append(h(`<div class="panel" id="p-${id}"></div>`));
    });
    buildLayersPanel(); buildLaserPanel(); buildMovePanel(); buildConsolePanel(); buildLibraryPanel(); buildJogFloat();
    U.showTab('capas');
  }
  U.showTab = id => { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id)); document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'p-' + id); };

  // --- Capas ---
  const MODOS = { linea: 'Línea', relleno: 'Relleno', imagen: 'Imagen' };
  function buildLayersPanel() {
    $('#p-capas').innerHTML = `<h3>Cortes / capas</h3><table class="layers"><thead><tr><th>#</th><th>Modo</th><th>Vel.</th><th>Pot.</th><th title="Salida">Sal.</th><th title="Mostrar">Ver</th></tr></thead><tbody id="lay-body"></tbody></table>
      <div class="btns"><button id="lay-up" title="Subir prioridad">▲ Subir</button><button id="lay-down" title="Bajar prioridad">▼ Bajar</button></div>
      <div id="lay-edit"></div>`;
    $('#lay-up').onclick = () => movePriority(-1); $('#lay-down').onclick = () => movePriority(1);
  }
  function movePriority(dir) {
    const keys = usedLayers().sort((a, b) => D.layer(a).prioridad - D.layer(b).prioridad); const i = keys.indexOf(D.currentLayer); const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const a = D.layer(keys[i]), b = D.layer(keys[j]); [a.prioridad, b.prioridad] = [b.prioridad, a.prioridad]; if (a.prioridad === b.prioridad) a.prioridad += dir;
    D.changed('layers');
  }
  function refreshLayers() {
    const body = $('#lay-body'); if (!body) return;
    const keys = usedLayers().sort((a, b) => D.layer(a).prioridad - D.layer(b).prioridad);
    const vu = LS.device.unidadVelocidad;
    body.innerHTML = keys.map(k => { const L = D.layer(k); return `<tr data-k="${k}" class="${k === D.currentLayer ? 'on' : ''}"><td><span class="sw" style="background:${L.color}"></span> ${String(k).padStart(2, '0')}</td><td>${MODOS[L.modo]}</td><td>${L.velocidad}</td><td>${L.potMax}%</td><td><input type="checkbox" data-f="salida" ${L.salida ? 'checked' : ''}></td><td><input type="checkbox" data-f="visible" ${L.visible ? 'checked' : ''}></td></tr>`; }).join('') || `<tr><td colspan="6" style="color:var(--muted);padding:10px">Dibuje o importe algo para crear capas. Velocidad en ${vu}.</td></tr>`;
    body.querySelectorAll('tr[data-k]').forEach(tr => {
      tr.onclick = e => { if (e.target.tagName === 'INPUT') return; D.currentLayer = Number(tr.dataset.k); D._capaElegida = true; D.changed('layers'); };
      tr.querySelectorAll('input').forEach(inp => inp.onchange = () => { D.layer(Number(tr.dataset.k))[inp.dataset.f] = inp.checked; D.changed('layers'); });
    });
    buildLayerEditor();
  }
  function buildLayerEditor() {
    const L = D.layer(D.currentLayer), ed = $('#lay-edit'), vu = LS.device.unidadVelocidad;
    const dpi = L.intervalo > 0 ? Math.round(25.4 / L.intervalo) : 0;
    const field = (label, f, attrs = 'step="0.1"', show = true) => show ? `<div class="row"><label>${label}</label><input type="number" data-f="${f}" value="${L[f]}" ${attrs}></div>` : '';
    const chk = (label, f, show = true) => show ? `<div class="row"><label>${label}</label><input type="checkbox" data-f="${f}" ${L[f] ? 'checked' : ''}></div>` : '';
    const isF = L.modo !== 'linea';
    ed.innerHTML = `<h3>Ajustes de la capa <span class="sw" style="background:${L.color}"></span> ${String(D.currentLayer).padStart(2, '0')}</h3>
      <div class="row"><label>Nombre</label><input type="text" data-f="nombre" value="${esc(L.nombre)}"></div>
      <div class="row"><label>Modo</label><select data-f="modo">${Object.entries(MODOS).map(([k, v]) => `<option value="${k}" ${k === L.modo ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${field(`Velocidad (${vu})`, 'velocidad', 'step="1" min="0.1"')}
      ${field('Potencia máx. (%)', 'potMax', 'step="0.5" min="0" max="100"')}
      ${field('Potencia mín. (%)', 'potMin', 'step="0.5" min="0" max="100"')}
      ${field('Pasadas', 'pasadas', 'step="1" min="1"')}
      ${field('Paso Z por pasada (mm)', 'pasoZ', 'step="0.1" min="0"')}
      ${field(`Intervalo (mm) — ${dpi} DPI`, 'intervalo', 'step="0.01" min="0.01"', isF)}
      ${field('Ángulo de barrido (°)', 'angulo', 'step="1"', L.modo === 'relleno')}
      ${field('Sobrebarrido (%)', 'sobrebarrido', 'step="0.5" min="0"', isF)}
      ${field('Saltar blancos de más de (mm)', 'saltoBlanco', 'step="1" min="0" title="Las zonas en blanco más anchas que esto se cruzan en movimiento rápido con el láser apagado, en vez de recorrerlas a velocidad de grabado. 0 = recorrer todo."', isF)}
      ${chk('Bidireccional', 'bidireccional', isF)}
      ${chk('Relleno cruzado', 'cruzado', L.modo === 'relleno')}
      ${chk('Rellenar formas juntas', 'rellenarJuntos', L.modo === 'relleno')}
      ${chk('Asistencia de aire', 'aire')}
      <div class="btns"><button id="lay-db" title="Configuración sugerida según modelo de láser, material y acción">🗄 Configuración sugerida…</button></div>
      <div class="btns"><button id="lay-save">Guardar en biblioteca</button><button id="lay-sel">Seleccionar objetos de la capa</button></div>`;
    ed.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
      const f = inp.dataset.f; const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? parseFloat(inp.value) : inp.value;
      if (inp.type === 'number' && !isFinite(v)) return;
      if ((f === 'potMax' || f === 'potMin') && (v < 0 || v > 100)) { toast('La potencia debe estar entre 0 y 100 %.', 'err'); return; }
      L[f] = v; D.changed('layers');
    });
    $('#lay-save').onclick = () => LS.dlg.saveMaterial(L);
    $('#lay-db').onclick = () => LS.dlg.materialDB({ accion: L.modo === 'linea' ? 'cortar' : 'grabar', capas: [D.currentLayer] });
    $('#lay-sel').onclick = () => { D.selection.clear(); D.objects.filter(o => o.layer === D.currentLayer).forEach(o => D.selection.add(o.id)); D.changed('sel'); };
  }

  // --- Láser ---
  const jobOpts = LS.jobs.options;
  function buildLaserPanel() {
    $('#p-laser').innerHTML = `<h3>Dispositivo</h3>
      <div class="row"><span id="ls-dev" style="flex:1"></span><button id="ls-cfg">Configurar…</button></div>
      <div class="row"><label>Mostrar esquema de la máquina</label><input type="checkbox" id="ls-vermaq"></div>
      <div class="row"><label>Al arrastrar el módulo</label><select id="ls-arr"><option value="mover">Mueve la máquina</option><option value="ubicar">Solo ubica (no mueve)</option></select></div>
      <div class="row"><span><span class="dot" id="ls-dot"></span><span id="ls-state">Desconectado</span></span><span id="ls-pos" class="chip" style="margin-left:auto"></span></div>
      <div class="row"><label>Conexión</label><select id="ls-via"><option value="usb">USB (cable)</option><option value="wifi">WiFi</option></select><button id="ls-wifi" title="Ver la IP de la placa, unirla a la WiFi de su casa y elegir la dirección">WiFi…</button></div>
      <div class="row" id="ls-wifirow"><label>IP de la placa</label><input id="ls-ip" type="text" placeholder="192.168.1.50" title="Dirección de la placa en la red (puerto en WiFi…; MKS: 8080)"><span class="chip" id="ls-ptochip" title="Puerto (se cambia en WiFi…)" style="margin-left:6px"></span></div>
      <div class="row" id="ls-sdrow"><label title="Sube el trabajo a la tarjeta microSD de la placa y lo graba desde ahí: sin cortes aunque el WiFi falle">Grabar desde la tarjeta SD de la placa</label><input type="checkbox" id="ls-sd"></div>
      <div class="btns"><button class="primary" id="ls-conn">Conectar</button><button id="ls-home">Inicio</button><button id="ls-unlock" title="Quitar alarma ($X)">Desbloquear</button></div>
      <h3>Trabajo</h3>
      <div class="btns"><button class="primary" id="ls-start">▶ Iniciar</button><button id="ls-pause">⏸ Pausar</button><button class="danger" id="ls-stop">■ Detener</button></div>
      <div class="btns"><button id="ls-dry" title="Recorre todo el trabajo con el láser apagado (también gira el rotativo)">Ensayo sin láser</button><button id="ls-3d" title="Vista 3D y simulación del grabado en el rotativo">Simulación 3D</button></div>
      <div class="btns"><button id="ls-frame" title="Recorre el contorno del trabajo">Marco</button><button id="ls-prev">Vista previa</button><button id="ls-save">Guardar archivo</button></div>
      <div class="progress"><i id="ls-prog"></i></div><div id="ls-est" class="note" style="color:var(--muted)"></div>
      <h3>Marco con luz (ver el área antes de grabar)</h3>
      <div class="row"><label>Encender la luz en "Marco"</label><input type="checkbox" id="ls-mluz" title="El botón Marco recorre el contorno con el láser a baja intensidad"></div>
      <div class="row"><label>Intensidad de la luz (%)</label><input type="number" id="ls-mpot" min="0.1" max="5" step="0.1" style="width:80px" title="Máximo 5 %: solo para ver el punto, no para marcar"></div>
      <div class="row"><label>Velocidad del marco (mm/min)</label><input type="number" id="ls-mvel" min="100" max="20000" step="100" style="width:80px"></div>
      <div class="row"><label>Vueltas del marco</label><input type="number" id="ls-mrep" min="1" max="20" step="1" style="width:80px" title="Repite el contorno para verlo con calma"></div>
      <div class="btns"><button class="primary" id="ls-frameluz" title="Recorre el contorno del trabajo con el láser encendido a baja intensidad y vuelve al punto de partida">▣ Marco con luz</button><button id="ls-fire" title="Mantener pulsado: enciende la luz en la posición actual del cabezal">● Disparo de prueba (mantener)</button></div>
      <p class="note" style="margin:2px 0 6px">Use gafas de protección. Con 0,5–2 % el punto se ve pero normalmente no marca; en materiales oscuros o sensibles baje la intensidad. ■ DETENER apaga el láser en cualquier momento.</p>
      <h3>Origen del trabajo</h3>
      <div class="row"><label>Iniciar desde</label><select id="ls-origin"><option value="absoluto">Coordenadas absolutas</option><option value="actual">Posición actual</option><option value="usuario">Origen fijado (aquí)</option></select></div>
      <div class="row"><label>Punto del trabajo</label><div class="anchor9" id="ls-anchor">${['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'].map(a => `<i data-a="${a}"></i>`).join('')}</div></div>
      <div class="row"><label>Solo selección</label><input type="checkbox" id="ls-onlysel"></div>
      <div class="row"><label title="Graba o corta solo lo que queda dentro de un recuadro, sin tocar el diseño">Zona parcial</label><span id="ls-zonainfo" class="muted">— todo el diseño —</span></div>
      <div class="row"><label title="Las imágenes grandes se graban por franjas: cada parte se prepara y se envía por separado, con un descanso entre partes, para que la placa no se sature">Trabajo por partes</label><select id="ls-pmodo"><option value="auto">Automático (imágenes grandes)</option><option value="siempre">Siempre</option><option value="nunca">Nunca</option></select></div>
      <div class="row"><label title="0 = automático según el tamaño de la imagen">Alto de cada parte (mm)</label><input type="number" id="ls-palto" min="0" step="1" style="width:70px"></div>
      <div class="row"><label title="Pausa entre una parte y la siguiente (deja descansar el láser y la placa)">Descanso entre partes (s)</label><input type="number" id="ls-pdesc" min="0" step="5" style="width:70px"><button id="ls-psig" hidden title="Terminar el descanso y seguir con la siguiente parte ya">Seguir ya</button></div>
      <div class="row"><button id="ls-zonad" title="Dibuje un recuadro en el lienzo sobre la parte que quiere volver a grabar o reforzar">⬚ Dibujar zona</button><button id="ls-zonaq" disabled>✕ Quitar zona</button></div>
      <div class="row"><label>Optimizar recorrido</label><input type="checkbox" id="ls-opt" checked></div>
      <div class="row"><label>Interiores primero</label><input type="checkbox" id="ls-inner" checked></div>
      <h3>Rotativo</h3>
      <div class="row"><label>Rotativo activado</label><input type="checkbox" id="ls-rot"></div>
      <div class="row"><span id="ls-rotinfo" class="note" style="flex:1;margin:0"></span></div>
      <div class="btns"><button id="ls-rotcfg">Configurar rotativo…</button><button id="ls-rotcal">Calibrar…</button></div>
      <div class="btns"><button id="ls-rotsim" title="Muestra cómo girará la pieza y cómo se formará el grabado (cilindro o cono), con una vista plana tipo papel">🎞 Simular giro de la pieza</button></div>
      <div class="row"><label>Mostrar esquema</label><input type="checkbox" id="ls-rotshow"></div>
      <div class="btns"><button id="ls-rotturn" title="Cambia el eje del objeto entre horizontal y vertical">Girar esquema 90°</button><button id="ls-rotcenter">Centrar en la mesa</button></div>
      <div class="btns"><button id="ls-rotfit" title="Mueve la selección (o todo el diseño) al centro del área de grabado">Centrar diseño en el área</button></div>
      <div class="btns"><button id="ls-rotalign" title="Coloca el esquema del rotativo de modo que la línea superior del objeto quede bajo el láser">Alinear rotativo con el láser</button></div>`;
    $('#ls-cfg').onclick = () => LS.dlg.device();
    $('#ls-arr').onchange = e => { LS.device.arrastreModo = e.target.value; LS.saveSettings(); refreshLaser(); toast(e.target.value === 'ubicar' ? 'Arrastrar el módulo o la barra solo indica dónde está el cabezal; la máquina no se mueve. Mayús hace lo contrario.' : 'Arrastrar el módulo o la barra mueve la máquina. Mayús solo ubica.'); };
    $('#ls-vermaq').onchange = e => { LS.device.verMaquina = e.target.checked; LS.saveSettings(); refreshLaser(); V.fitBed(); };
    $('#ls-conn').onclick = () => LS.machine.connected ? LS.machine.disconnect() : guard(() => LS.machine.connect());
    const dvc = LS.device;
    const viaUpd = () => { $('#ls-via').value = dvc.conexion || 'usb'; $('#ls-ip').value = dvc.wifiHost || ''; $('#ls-wifirow').hidden = (dvc.conexion || 'usb') !== 'wifi'; $('#ls-ptochip').textContent = ':' + (dvc.wifiPuerto || 8080); $('#ls-sdrow').hidden = (dvc.conexion || 'usb') !== 'wifi'; $('#ls-sd').checked = dvc.usarSD !== false; };
    $('#ls-sd').onchange = e => { dvc.usarSD = e.target.checked; LS.saveSettings(); };
    U.refreshVia = viaUpd; viaUpd();
    $('#ls-via').onchange = e => { dvc.conexion = e.target.value; LS.saveSettings(); viaUpd(); refreshLaser(); if (dvc.conexion === 'wifi' && !dvc.wifiHost) LS.dlg.wifi(); };
    $('#ls-ip').onchange = e => { dvc.wifiHost = e.target.value.trim(); LS.saveSettings(); refreshLaser(); };
    $('#ls-wifi').onclick = () => LS.dlg.wifi();
    $('#ls-home').onclick = () => guard(() => LS.machine.home());
    $('#ls-unlock').onclick = () => guard(() => LS.machine.unlock());
    $('#ls-start').onclick = () => LS.app.startJob();
    $('#ls-pause').onclick = () => guard(() => LS.machine.paused ? LS.machine.resume() : LS.machine.pause());
    $('#ls-stop').onclick = () => guard(() => LS.machine.stop());
    $('#ls-frame').onclick = () => LS.app.frame();
    // marco con luz y disparo de prueba
    const dv = LS.device;
    const luzIni = dv.marcoLuz != null ? !!dv.marcoLuz : (dv.potenciaMarco || 0) > 0;
    $('#ls-mluz').checked = luzIni; $('#ls-mpot').value = dv.potenciaMarco > 0 ? dv.potenciaMarco : 1;
    $('#ls-mvel').value = dv.velMarco || 3000; $('#ls-mrep').value = dv.repeticionesMarco || 1;
    const guardarMarco = () => {
      const pot = Math.min(5, Math.max(0.1, parseFloat($('#ls-mpot').value) || 1));
      Object.assign(dv, { marcoLuz: $('#ls-mluz').checked, potenciaMarco: pot, velMarco: Math.max(100, parseFloat($('#ls-mvel').value) || 3000), repeticionesMarco: Math.max(1, Math.min(20, parseInt($('#ls-mrep').value, 10) || 1)) });
      $('#ls-mpot').value = pot; LS.saveSettings();
    };
    ['#ls-mluz', '#ls-mpot', '#ls-mvel', '#ls-mrep'].forEach(id => $(id).onchange = guardarMarco);
    $('#ls-frameluz').onclick = () => { guardarMarco(); LS.app.frame({ luz: true }); };
    const fire = $('#ls-fire');
    const fireOff = () => { if (LS.machine.connected && LS.machine.disparando) LS.machine.fire(0, false); fire.classList.remove('on'); };
    fire.onmousedown = () => guard(async () => { guardarMarco(); await LS.machine.prepararTrabajo(); await LS.machine.fire(dv.potenciaMarco, true); fire.classList.add('on'); });
    fire.onmouseup = fire.onmouseleave = fireOff;
    window.addEventListener('blur', fireOff);
    $('#ls-dry').onclick = () => LS.app.dryRun();
    $('#ls-3d').onclick = () => LS.app.command('vista3d');
    $('#ls-prev').onclick = () => LS.app.command('vistaPrevia');
    $('#ls-save').onclick = () => LS.app.command(LS.device.tipo === 'ruida' ? 'guardarRd' : 'guardarGcode');
    $('#ls-origin').onchange = e => { jobOpts.origenTrabajo = e.target.value; if (e.target.value === 'usuario' && !jobOpts.origenUsuario) toast('Use la herramienta "Fijar origen de usuario" o el panel Mover para definirlo.'); };
    $('#ls-anchor').querySelectorAll('i').forEach(i => i.onclick = () => { jobOpts.ancla = i.dataset.a; refreshLaser(); });
    $('#ls-onlysel').onchange = e => jobOpts.soloSeleccion = e.target.checked;
    { const d = LS.device, pm = $('#ls-pmodo'), pa = $('#ls-palto'), pd = $('#ls-pdesc');
      pm.value = d.partesModo || 'auto'; pa.value = d.partesAlto || 0; pd.value = d.partesDescanso ?? 15;
      pm.onchange = () => { d.partesModo = pm.value; LS.saveSettings(); };
      pa.onchange = () => { d.partesAlto = Math.max(0, +pa.value || 0); LS.saveSettings(); };
      pd.onchange = () => { d.partesDescanso = Math.max(0, +pd.value || 0); LS.saveSettings(); };
      $('#ls-psig').onclick = () => { LS.machine._saltarDescanso = true; }; }
    $('#ls-rotsim').onclick = () => LS.rotSim.open();
    $('#ls-zonad').onclick = () => { U.setTool('zona'); toast('Arrastre un recuadro sobre la parte del diseño que quiere grabar o cortar.'); };
    $('#ls-zonaq').onclick = () => { LS.jobs.setZona(null); toast('Zona parcial quitada: se graba todo el diseño.'); };
    $('#ls-opt').onchange = e => jobOpts.optimizar = e.target.checked;
    $('#ls-inner').onchange = e => jobOpts.interiorPrimero = e.target.checked;
    $('#ls-rot').onchange = e => { LS.rotary.activo = e.target.checked; LS.saveSettings(); refreshLaser(); V.redraw(); };
    $('#ls-rotcfg').onclick = () => LS.dlg.rotary();
    $('#ls-rotcal').onclick = () => LS.dlg.rotaryCalibrate();
    $('#ls-rotshow').onchange = e => { LS.rotary.mostrar = e.target.checked; if (e.target.checked && !LS.rotary.activo) { LS.rotary.activo = true; toast('El esquema se muestra con el rotativo activado: se activó.', 'ok'); } LS.saveSettings(); refreshLaser(); V.redraw(); };
    $('#ls-rotturn').onclick = () => {
      const R = LS.rotary;
      if (R.orient !== 'vertical' && !(R.eje === 'Z' && LS.device.tipo === 'grbl')) return toast('La orientación vertical solo es posible con el rotativo conectado al puerto Z (GRBL). Con el puerto Y el eje del objeto va paralelo a X.', 'err');
      R.orient = R.orient === 'vertical' ? 'horizontal' : 'vertical'; LS.saveSettings(); refreshLaser(); V.redraw();
    };
    $('#ls-rotalign').onclick = () => {
      const h = V.headWorld() || LS.startWorld(), g = LS.rotaryGeom(), R = LS.rotary;
      // el láser queda sobre la línea superior del objeto (centro del esquema en el eje transversal)
      if (g.vertical) { R.posX = h[0]; } else { R.posY = h[1]; }
      LS.saveSettings(); V.redraw(); toast('Esquema del rotativo alineado con el láser. Arrástrelo a lo largo del eje si el objeto está desplazado.', 'ok');
    };
    $('#ls-rotcenter').onclick = () => { LS.rotary.posX = null; LS.rotary.posY = null; LS.saveSettings(); V.redraw(); };
    $('#ls-rotfit').onclick = () => {
      if (!LS.rotary.activo) return toast('Active el rotativo primero.', 'err');
      const objs = D.selection.size ? D.selected() : D.objects; if (!objs.length) return toast('No hay diseño para mover.', 'err');
      const g = LS.rotaryGeom(), b = D.selBBox(objs);
      D.checkpoint(); D.transformSel(G.tr(g.c[0] - (b.x0 + b.x1) / 2, g.c[1] - (b.y0 + b.y1) / 2), objs); D.changed('xf');
      const aw = g.vertical ? g.circ : g.lo, ah = g.vertical ? g.lo : g.circ;
      if (b.w > aw + 0.01 || b.h > ah + 0.01) toast(`El diseño (${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm) es mayor que el área de grabado (${aw.toFixed(1)} × ${ah.toFixed(1)} mm).`, 'err');
      else toast('Diseño centrado en el área de grabado.', 'ok');
    };
    LS.machine.on(refreshLaser);
    // botón DETENER global: visible siempre que haya conexión, por encima de diálogos y de la vista 3D
    const stopBtn = document.getElementById('stopAll');
    stopBtn.onclick = () => guard(() => LS.machine.stop());
    LS.machine.on(M => { stopBtn.hidden = !M.connected; stopBtn.classList.toggle('moving', !!M.running || !!M.disparando || /Trabajando|Moviendo|Buscando|Pausando/.test(M.state)); });
  }
  let rotPrev = null;
  function refreshLaser() {
    { const b = document.getElementById('ls-psig'); if (b) b.hidden = !LS.machine.parteActual; }
    { const z = LS.jobs.options.zona, inf = document.getElementById('ls-zonainfo'), q = document.getElementById('ls-zonaq');
      if (inf) { inf.textContent = z ? `${(z.x1 - z.x0).toFixed(1)} × ${(z.y1 - z.y0).toFixed(1)} mm (solo esa parte)` : '— todo el diseño —'; inf.classList.toggle('warn', !!z); }
      if (q) q.disabled = !z; }
    { const R = LS.rotary, rod = R.activo && R.eje === 'R'; if (U._rodPrev !== undefined && U._rodPrev !== rod && LS.machine.connected && (R.eje === 'R' || U._rodPrev)) LS.machine.modoRodillo(rod).catch(() => { }); U._rodPrev = rod; }
    { const R = LS.rotary, nowZ = R.activo && LS.jobs.rotaryAxis() === 'Z'; if (nowZ && !U._rotZPrev && LS.machine.connected) setTimeout(() => LS.machine.revisarModoZ(), 300); U._rotZPrev = nowZ; }
    { const R = LS.rotary, now = R.activo && LS.jobs.rotaryAxis() === 'Y'; if (rotPrev !== null && rotPrev !== now) LS.machine.rotaryChanged(rotPrev, now); rotPrev = now;
      const key = `${R.activo}|${LS.jobs.rotaryAxis()}|${LS.jobs.rotaryOrient()}`; const cambio = U._rotKey !== undefined && U._rotKey !== key; U._rotKey = key; if (cambio && R.activo) LS.machine.zeroRotation(); }
    const M = LS.machine, d = LS.device;
    if (!$('#ls-dev')) return;
    $('#ls-dev').textContent = `${(LS.MACHINE_PRESETS[d.modelo] && LS.MACHINE_PRESETS[d.modelo].ancho) ? LS.MACHINE_PRESETS[d.modelo].nombre : d.nombre} · ${d.tipo === 'ruida' ? 'Ruida (red)' : d.conexion === 'wifi' ? 'GRBL (WiFi ' + (d.wifiHost || '?') + ')' : 'GRBL (USB)'} · ${d.ancho}×${d.alto} mm`;
    $('#ls-dot').classList.toggle('ok', M.connected); $('#ls-state').textContent = M.state;
    let posTxt = '';
    if (M.pos) {
      if (LS.rotary.activo) {
        const giro = LS.V.rotaryDot(M.pos).ang, port = LS.jobs.rotaryAxis();
        const hx = port === 'Z' && M.rawPos ? M.rawPos[0] : M.pos[0];
        posTxt = port === 'Z' && M.rawPos ? `X ${hx.toFixed(1)}  Y ${M.rawPos[1].toFixed(1)}  · giro ${giro.toFixed(0)}°` : `X ${hx.toFixed(1)}  · giro ${giro.toFixed(0)}°`;
      } else posTxt = `X ${M.pos[0].toFixed(2)}  Y ${M.pos[1].toFixed(2)}`;
    }
    $('#ls-pos').textContent = posTxt;
    $('#ls-conn').textContent = M.connected ? 'Desconectar' : 'Conectar';
    if ($('#ls-via')) { $('#ls-via').disabled = !!M.connected; $('#ls-ip').disabled = !!M.connected; }
    $('#ls-conn').classList.toggle('primary', !M.connected);
    $('#ls-pause').textContent = M.paused ? '⏵ Reanudar' : '⏸ Pausar';
    $('#ls-prog').style.width = (M.running ? M.progress * 100 : 0) + '%';
    $('#ls-unlock').style.display = d.tipo === 'ruida' ? 'none' : '';
    $('#ls-home').textContent = (d.tipo !== 'ruida' && !d.finalesCarrera) ? 'Ir a partida' : 'Inicio';
    $('#ls-home').title = (d.tipo !== 'ruida' && !d.finalesCarrera) ? 'Sin finales de carrera: lleva el cabezal a la posición de partida' : 'Buscar inicio: primero X y luego Y con los finales de carrera; esa esquina queda como origen';
    $('#ls-origin').value = jobOpts.origenTrabajo; U.refreshOrigen && $('#mv-anc') && (() => { $('#mv-anc').querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.a === jobOpts.ancla)); })();
    $('#ls-anchor').querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.a === jobOpts.ancla));
    const R = LS.rotary, P = LS.ROTARY_PRESETS[R.modelo];
    $('#ls-rot').checked = R.activo;
    $('#ls-rotinfo').textContent = `${P ? P.nombre : 'Personalizado'} · puerto ${LS.jobs.rotaryAxis()} · eje ${LS.jobs.rotaryOrient()} · Ø ${R.diamObjeto} × ${R.largoObjeto || 200} mm · circunferencia ${(Math.PI * R.diamObjeto).toFixed(1)} mm`;
    $('#ls-rotshow').checked = R.mostrar !== false;
    $('#ls-vermaq').checked = d.verMaquina !== false;
    $('#ls-arr').value = d.arrastreModo || 'mover'; if ($('#mv-arr')) $('#mv-arr').value = d.arrastreModo || 'mover';
    const tbM = document.querySelector('#toolbar [data-cmd="verMaquina"]'), tbR = document.querySelector('#toolbar [data-cmd="verRotativo"]');
    if (tbM) tbM.classList.toggle('on', d.verMaquina !== false);
    if (tbR) { tbR.classList.toggle('on', R.activo && R.mostrar !== false); tbR.style.opacity = R.activo ? 1 : 0.45; }
    // guía de las flechas del panel Mover
    const hint = $('#mv-hint');
    if (hint) {
      const L = LS.jobs.axisLetters(), rot = R.activo, port = LS.jobs.rotaryAxis();
      hint.innerHTML = !rot ? '◀ ▶ mueven el cabezal en X · ▲ ▼ mueven el cabezal en Y'
        : port === 'Z' ? 'Flechas: mueven el <b>cabezal</b> en X e Y · <b style="color:#ffb020">⟲ ⟳ giran el rotativo (conector Z)</b>'
        : '◀ ▶ mueven el cabezal en X · <b style="color:#ffb020">▲ ▼ y ⟲ ⟳ giran el rotativo (conector Y)</b>: el motor Y del cabezal está desconectado';
      $('#mv-rot').style.display = rot ? '' : 'none';
      $('#mv-rotwarn').style.display = rot && port === 'Y' ? '' : 'none';
      const zBusy = L.includes('Z');
      ['#mv-zup', '#mv-zdn'].forEach(id => { $(id).disabled = zBusy; $(id).title = zBusy ? 'El conector Z está ocupado por el rotativo' : ''; });
    }
    U.refreshJogFloat && U.refreshJogFloat();
    document.getElementById('st-machine').innerHTML = `<span class="dot ${M.connected ? 'ok' : ''}"></span>${esc(M.state)}${R.activo ? ' · Rotativo' : ''}${M.connected && M.topeActivo && (M.topeActivo('X') || M.topeActivo('Y')) ? ` · <b style="color:#ff6b5b">Tope ${['X', 'Y'].filter(a => M.topeActivo(a)).join(' ')}</b>` : ''}`;
  }
  U.refreshLaser = refreshLaser;

  // --- Controles de movimiento flotantes sobre el lienzo (se pueden arrastrar a cualquier lugar) ---
  function buildJogFloat() {
    if (document.getElementById('jogfloat')) return;
    const el = document.createElement('div'); el.id = 'jogfloat';
    el.innerHTML = `<div class="jf-head" title="Arrastre para mover"><span>✥ ${'Mover'}</span><button class="jf-x" title="Ocultar (Ver → Controles flotantes)">×</button></div>
      <div class="jf-grid">
        <button data-jf="-1,1" title="Diagonal">↖</button><button data-jf="0,1" title="Arriba (Y+)">▲</button><button data-jf="1,1" title="Diagonal">↗</button>
        <button data-jf="-1,0" title="Izquierda (X−)">◀</button><button class="jf-home" title="Inicio / ir a partida">⌂</button><button data-jf="1,0" title="Derecha (X+)">▶</button>
        <button data-jf="-1,-1" title="Diagonal">↙</button><button data-jf="0,-1" title="Abajo (Y−)">▼</button><button data-jf="1,-1" title="Diagonal">↘</button>
      </div>
      <div class="jf-rot" hidden><button data-jr="-1" title="Girar rotativo −">⟲</button><button data-jr="1" title="Girar rotativo +">⟳</button><button class="jf-rsim" title="Simular cómo gira la pieza y cómo se forma el grabado">🎞 Simular giro</button><label class="jf-rinv" title="Si el grabado sale en espejo (al revés) sobre la pieza, marque o desmarque esta casilla"><input type="checkbox" class="jf-rinvcb"> Invertir giro (si sale en espejo)</label></div>
      <div class="jf-rotlbl" hidden>Rotativo (conector Z)</div>
      <div class="jf-z"><button class="jf-zup" title="Subir Z (mesa o cabezal)">Z ▲</button><button class="jf-zdn" title="Bajar Z (mesa o cabezal)">Z ▼</button></div>
      <div class="jf-by" hidden><button class="jf-byup" title="Mover la barra Y hacia arriba (el rotativo no gira)">Barra ▲</button><button class="jf-bydn" title="Mover la barra Y hacia abajo (el rotativo no gira)">Barra ▼</button></div>
      <div class="jf-row"><select class="jf-step" title="Distancia por pulsación (mm)"><option>0.1</option><option>1</option><option>10</option><option>50</option><option>100</option></select><span>mm</span></div>
      <div class="jf-row jf-topes"><label title="La máquina tiene finales de carrera: ⌂ busca primero X y luego Y y fija esa esquina como origen"><input type="checkbox" class="jf-tcb"> Origen con topes</label></div>
      <div class="jf-row jf-tind" title="Estado de los finales de carrera (rojo = activado)"><span class="jf-tx">X ○</span><span class="jf-ty">Y ○</span><button class="jf-thome" title="Buscar origen con los topes: X y luego Y">⌂ Buscar</button></div>
      <div class="jf-row jf-ir"><input type="number" class="jf-gx" step="0.1" placeholder="X" title="Coordenada X (mm)"><input type="number" class="jf-gy" step="0.1" placeholder="Y" title="Coordenada Y (mm)"><button class="jf-go" title="Ir a la coordenada X, Y (mm del lienzo)">Ir</button></div>
      <div class="jf-row"><button class="jf-orig" title="Fijar origen aquí: el láser está donde se ve el módulo en el lienzo (no mueve la máquina)">⌖ Fijar origen aquí</button></div>
      <div class="jf-row"><button class="jf-luz" title="Marco con luz: recorre el contorno del trabajo a baja intensidad y vuelve al punto de partida">▣ Marco luz</button><button class="jf-fire" title="Disparo de prueba: mantener pulsado (luz de baja intensidad en la posición actual)">● Disparo</button></div>
      <div class="jf-row"><button class="jf-start" title="Iniciar el trabajo">▶ Iniciar</button><button class="jf-stop" title="Detener todo">■</button></div>
      <div class="jf-pos"></div>`;
    $('#stage').appendChild(el);
    const pos = (() => { try { return JSON.parse(localStorage.getItem('ls.jogfloat') || 'null'); } catch (e) { return null; } })();
    const colocar = (x, y) => { const st = $('#stage').getBoundingClientRect(); x = Math.max(0, Math.min(st.width - el.offsetWidth, x)); y = Math.max(0, Math.min(st.height - el.offsetHeight, y)); el.style.left = x + 'px'; el.style.top = y + 'px'; return [x, y]; };
    requestAnimationFrame(() => { const st = $('#stage').getBoundingClientRect(); colocar(pos ? pos.x : st.width - el.offsetWidth - 14, pos ? pos.y : 14); el.hidden = pos && pos.oculto; });
    // arrastre por la cabecera
    const head = el.querySelector('.jf-head');
    head.onpointerdown = e => {
      if (e.target.closest('button')) return;
      head.setPointerCapture(e.pointerId); const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
      head.onpointermove = ev => colocar(ev.clientX - sx, ev.clientY - sy);
      head.onpointerup = () => { head.onpointermove = head.onpointerup = null; try { localStorage.setItem('ls.jogfloat', JSON.stringify({ x: el.offsetLeft, y: el.offsetTop, oculto: false })); } catch (x) { } };
    };
    window.addEventListener('resize', () => { if (!el.hidden) colocar(el.offsetLeft, el.offsetTop); });
    // distancia sincronizada con el panel Mover
    const selF = el.querySelector('.jf-step'), selP = $('#mv-step');
    selF.value = selP ? selP.value : '10';
    selF.onchange = () => { if (selP) selP.value = selF.value; };
    if (selP) selP.addEventListener('change', () => { selF.value = selP.value; });
    el.querySelectorAll('[data-jf]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.jf.split(',').map(Number); guard(() => U.jogDir(x, y, parseFloat(selF.value))); });
    el.querySelectorAll('[data-jr]').forEach(b => b.onclick = () => guard(() => U.jogRot(+b.dataset.jr, parseFloat(selF.value))));
    el.querySelector('.jf-home').onclick = () => guard(() => LS.machine.home());
    el.querySelector('.jf-byup').onclick = () => guard(() => LS.machine.jogBarraY(parseFloat(selF.value)));
    el.querySelector('.jf-bydn').onclick = () => guard(() => LS.machine.jogBarraY(-parseFloat(selF.value)));
    el.querySelector('.jf-zup').onclick = () => guard(() => LS.machine.jogZ(parseFloat(selF.value)));
    el.querySelector('.jf-zdn').onclick = () => guard(() => LS.machine.jogZ(-parseFloat(selF.value)));
    el.querySelector('.jf-luz').onclick = () => LS.app.frame({ luz: true });
    el.querySelector('.jf-start').onclick = () => LS.app.startJob();
    const jfFire = el.querySelector('.jf-fire');
    const jfFireOff = () => { if (LS.machine.connected && LS.machine.disparando) LS.machine.fire(0, false); jfFire.classList.remove('on'); };
    jfFire.onpointerdown = () => guard(async () => { await LS.machine.prepararTrabajo(); const dv = LS.device; await LS.machine.fire(Math.min(5, dv.potenciaMarco > 0 ? dv.potenciaMarco : 1), true); jfFire.classList.add('on'); });
    jfFire.onpointerup = jfFire.onpointerleave = jfFireOff;
    window.addEventListener('blur', jfFireOff);
    const irA = () => guard(async () => {
      const M = LS.machine, x = parseFloat(el.querySelector('.jf-gx').value), y = parseFloat(el.querySelector('.jf-gy').value);
      if (!isFinite(x) && !isFinite(y)) throw new Error('Escriba la coordenada X y/o Y.');
      if (!M.origenConocido) throw new Error('Primero fije el origen (o pulse Inicio) para que la máquina sepa dónde está.');
      const p = M.pos || [0, 0];
      await M.moveTo(isFinite(x) ? x : p[0], isFinite(y) ? y : p[1], parseFloat(($('#mv-speed') || {}).value) || 50);
    });
    el.querySelector('.jf-go').onclick = irA;
    el.querySelectorAll('.jf-gx, .jf-gy').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); irA(); } e.stopPropagation(); }));
    el.querySelector('.jf-orig').onclick = () => { U.fijarReferencia(V.headWorld() || LS.startWorld()); U.refreshOrigen && U.refreshOrigen(); };
    el.querySelector('.jf-stop').onclick = () => { if (LS.machine.connected) guard(() => LS.machine.stop()); };
    el.querySelector('.jf-x').onclick = () => U.toggleJogFloat(false);
    el.querySelector('.jf-tcb').onchange = e => { LS.device.finalesCarrera = e.target.checked; LS.saveSettings(); refreshLaser(); V.redraw(); toast(e.target.checked ? 'Origen con topes: ⌂ busca X y luego Y. Ubicación de los topes en Dispositivo → Configurar.' : 'Sin topes: ⌂ lleva el cabezal a la posición de partida.', 'ok'); };
    el.querySelector('.jf-rsim').onclick = () => LS.rotSim.open();
    el.querySelector('.jf-rinvcb').onchange = e => { LS.rotary.invertir = e.target.checked; LS.saveSettings(); V.redraw(); toast(e.target.checked ? 'Giro invertido: el próximo grabado gira en sentido contrario (corrige el efecto espejo).' : 'Giro normal.', 'ok'); };
    el.querySelector('.jf-thome').onclick = () => guard(() => LS.machine.home());
    U.refreshJogFloat = () => {
      const M = LS.machine, d = LS.device;
      el.querySelector('.jf-rot').hidden = !LS.rotary.activo; el.querySelector('.jf-rinvcb').checked = !!LS.rotary.invertir;
      const zOcupado = LS.rotary.activo && LS.jobs.rotaryAxis() === 'Z';
      const rodillo = LS.rotary.activo && LS.rotary.eje === 'R';
      el.querySelector('.jf-z').hidden = zOcupado || rodillo || d.tipo === 'ruida';
      el.querySelector('.jf-by').hidden = !zOcupado;
      el.querySelector('[data-jf="0,1"]').title = LS.rotary.activo ? 'Girar el rotativo (+)' : 'Arriba (Y+)';
      el.querySelector('[data-jf="0,-1"]').title = LS.rotary.activo ? 'Girar el rotativo (−)' : 'Abajo (Y−)';
      const lbl = el.querySelector('.jf-rotlbl'); lbl.hidden = !LS.rotary.activo;
      const m45 = M.connected && M.ajuste ? M.ajuste('45') : null;
      lbl.classList.remove('warn');
      lbl.innerHTML = (LS.rotary.eje === 'R' ? 'Rotativo: modo rodillo de la placa ($45=1) · ▲▼ y ⟲ ⟳ giran' : zOcupado ? 'Rotativo en el conector Z (⟲ ⟳ giran)' : 'Rotativo en el conector Y') + (zOcupado && m45 != null ? ` · placa $45=${m45} <button class="jf-fix45" title="Elegir el modo de ejes de la placa ($45)">Modo…</button>` : '');
      if (rodillo && m45 != null && String(m45) !== '1') {
        lbl.classList.add('warn');
        lbl.innerHTML = `La placa está en $45=${m45}: ▲▼ mueven la barra Y, no el rotativo <button class="jf-rod1" title="Volver a poner la placa en modo rodillo">Poner $45=1</button>`;
        lbl.querySelector('.jf-rod1').onclick = () => guard(() => LS.machine.modoRodillo(true));
      }
      const bf = lbl.querySelector('.jf-fix45'); if (bf) bf.onclick = () => LS.dlg.modo45();
      el.querySelector('.jf-home').title = d.tipo !== 'ruida' && d.finalesCarrera ? 'Inicio: busca X y luego Y con los finales de carrera' : 'Ir a la posición de partida';
      el.querySelectorAll('button:not(.jf-x)').forEach(b => { if (!b.classList.contains('jf-stop') && !b.classList.contains('jf-orig')) b.disabled = !M.connected; });
      el.querySelectorAll('.jf-gx, .jf-gy').forEach(i => { i.disabled = !M.connected; });
      const p = M.pos; el.querySelector('.jf-pos').textContent = M.connected ? (p ? `X ${p[0].toFixed(1)}  Y ${p[1].toFixed(1)}` : M.state) : 'Desconectado';
      el.classList.toggle('jf-off', !M.connected);
      const fc = d.tipo !== 'ruida' && !!d.finalesCarrera, pn = M.connected ? (M.pines || '') : '';
      el.querySelector('.jf-tcb').checked = fc; el.querySelector('.jf-tind').hidden = !fc;
      [['.jf-tx', 'X'], ['.jf-ty', 'Y']].forEach(([c, a]) => { const sp = el.querySelector(c), on = !!pn && M.topeActivo(a); sp.textContent = `${a} ${on ? '●' : '○'}`; sp.classList.toggle('on', on); });
      el.querySelector('.jf-thome').disabled = !M.connected || !!M.buscandoInicio;
      el.querySelector('.jf-thome').textContent = M.buscandoInicio ? 'Buscando…' : '⌂ Buscar';
    };
    U.refreshJogFloat();
  }
  U.toggleJogFloat = mostrar => {
    const el = document.getElementById('jogfloat'); if (!el) return;
    el.hidden = mostrar === undefined ? !el.hidden : !mostrar;
    try { localStorage.setItem('ls.jogfloat', JSON.stringify({ x: el.offsetLeft, y: el.offsetTop, oculto: el.hidden })); } catch (e) { }
    if (!el.hidden) U.refreshJogFloat && U.refreshJogFloat();
  };

  // --- Mover ---
  function buildMovePanel() {
    $('#p-mover').innerHTML = `<h3>Mover el cabezal</h3>
      <div class="row"><label>Distancia (mm)</label><select id="mv-step"><option>0.1</option><option>1</option><option selected>10</option><option>50</option><option>100</option></select></div>
      <div class="row"><label>Velocidad (mm/s)</label><input type="number" id="mv-speed" value="50" min="1"></div>
      <div class="jog">
        <button data-j="-1,1">↖</button><button data-j="0,1">▲</button><button data-j="1,1">↗</button>
        <button data-j="-1,0">◀</button><button id="mv-home" title="Ir al origen 0,0">⌂</button><button data-j="1,0">▶</button>
        <button data-j="-1,-1">↙</button><button data-j="0,-1">▼</button><button data-j="1,-1">↘</button>
      </div>
      <div id="mv-rotwarn" class="pregunta" style="display:none"><p><b>La barra no se mueve</b> porque el rotativo está activado en el <b>conector Y</b>: ▲ ▼ giran el objeto. Si en ese conector sigue el motor Y de la barra, desactive el rotativo.</p><div class="btns"><button id="mv-rotoff">Desactivar rotativo</button></div></div>
      <p class="note" id="mv-hint" style="text-align:center"></p>
      <div class="btns"><button id="mv-dir" title="Mueve 5 mm y pregunta hacia dónde fue el cabezal; ajusta el sentido de los ejes">Comprobar dirección</button><button id="mv-invy" title="Si ▲ mueve el cabezal hacia usted">⇅ Invertir Y</button><button id="mv-invx" title="Si ▶ mueve el cabezal hacia la izquierda">⇄ Invertir X</button></div>
      <div class="btns" id="mv-rot"><button id="mv-rotm" title="Girar el rotativo: la parte de arriba del objeto hacia el fondo">⟲ Girar −</button><button id="mv-rotp" title="Girar el rotativo: la parte de arriba del objeto hacia usted">⟳ Girar +</button><button id="mv-rot0" title="Toma la posición actual del objeto como 0°">Giro a 0°</button></div>
      <p class="note" style="text-align:center;margin-top:-4px">Teclado numérico: 7 8 9 / 4 6 / 1 2 3 mueven (diagonales incluidas) · + − giran el rotativo · 5 detiene</p>
      <div class="btns"><button id="mv-zup">Z ▲</button><button id="mv-zdn">Z ▼</button></div>
      <div class="row"><label>Arrastrar el módulo en el lienzo</label><select id="mv-arr"><option value="mover">Mueve la máquina</option><option value="ubicar">Solo ubica (no mueve)</option></select></div>
      <h3>Origen del trabajo</h3>
      <p class="note" style="margin:4px 0">El origen es solo la <b>referencia de partida</b>: ubique el módulo en el lienzo donde está físicamente el láser y pulse <b>Fijar origen aquí</b>. El texto, la imagen o las formas se graban, cortan y enmarcan <b>donde están colocados en el lienzo</b>.</p>
      <div class="row"><label>Punto de anclaje del giro (rotativo)</label><div class="anchor9" id="mv-anc" title="Con el rotativo: qué punto del diseño queda bajo el láser al empezar el giro">${['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'].map(a => `<i data-a="${a}"></i>`).join('')}</div><span id="mv-ancname" class="chip"></span></div>
      <div class="btns"><button id="mv-setorig" class="primary" title="Indica que el láser está físicamente donde se ve el módulo en el lienzo (no mueve la máquina)">Fijar origen aquí</button><button id="mv-clrorig" title="Volver a coordenadas absolutas del lienzo">Quitar origen</button></div>
      <div class="row"><span id="mv-originfo" class="note" style="margin:0"></span></div>
      <h3>Calibrar posición (sin finales de carrera)</h3>
      <p class="note" style="margin:4px 0">Úselo solo si el esquema no coincide con la máquina: indica en qué punto del lienzo está realmente el cabezal.</p>
      <div class="row"><label>El cabezal está en</label><div class="anchor9" id="mv-ref" title="Punto del lienzo que corresponde a la posición actual del cabezal">${['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'].map(a => `<i data-a="${a}"></i>`).join('')}</div><span id="mv-refname" class="chip"></span></div>
      <div class="btns"><button id="mv-setzero" title="Declara que el cabezal está en el punto elegido del lienzo (G10 L20 P1)">Calibrar posición</button><button id="mv-clrzero" title="Quita un origen temporal G92">Quitar origen G92</button></div>
      <h3>Ir a posición</h3>
      <div class="grid2"><input type="number" id="mv-x" placeholder="X"><input type="number" id="mv-y" placeholder="Y"></div>
      <div class="btns"><button id="mv-go">Ir</button></div>
      <h3>Disparo de prueba</h3>
      <div class="row"><label>Potencia (%)</label><input type="number" id="mv-fire" value="1" min="0" max="20" step="0.5"></div>
      <div class="btns"><button id="mv-fireBtn" title="Mantener pulsado para disparar">Mantener para disparar</button></div>
      <p class="note">Sin finales de carrera, la app conoce la posición del cabezal desde la esquina de origen. Si mueve el cabezal a mano con la máquina apagada, vuelva a fijar la esquina.</p>
      <p class="note">El disparo de prueba usa una potencia baja limitada al 20 %. Use siempre gafas de protección.</p>`;
    const step = () => parseFloat($('#mv-step').value), spd = () => parseFloat($('#mv-speed').value) || 50;
    // dirección en pantalla (x derecha, y arriba) -> desplazamiento en coordenadas de la máquina
    U.jogDelta = (x, y, st = step()) => { const yy = LS.device.origen.startsWith('inf') ? y : -y; const xx = LS.device.origen.endsWith('der') ? -x : x; return [xx * st, yy * st]; };
    // Flechas = cabezal. Con el rotativo en el conector Z el cabezal sigue moviéndose en X e Y (movimiento físico).
    // Con el rotativo en el conector Y, ▲▼ giran el accesorio (el motor Y del cabezal está desconectado).
    U.jogDir = (x, y, st) => (LS.rotary.activo && LS.jobs.rotaryAxis() === 'Z') ? LS.machine.jogHead(...U.jogDelta(x, y, st), spd()) : LS.machine.jog(...U.jogDelta(x, y, st), spd());
    U.jogRot = (sgn, st = step()) => LS.machine.jogRot(sgn * st, Math.min(spd(), 30));
    $('#p-mover').querySelectorAll('[data-j]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.j.split(',').map(Number); guard(() => U.jogDir(x, y)); });
    // teclado numérico: 8 direcciones (7 8 9 / 4 6 / 1 2 3); 5 = detener
    $('#mv-rotm').onclick = () => guard(() => U.jogRot(-1));
    $('#mv-rotp').onclick = () => guard(() => U.jogRot(1));
    $('#mv-rotoff').onclick = () => U.offerDisableRotary(true);
    $('#mv-rot0').onclick = () => { LS.machine.zeroRotation(); toast('Giro puesto en 0°.', 'ok'); };
    $('#mv-invy').onclick = () => guard(async () => { await LS.machine.invertAxis('Y'); toast('Sentido del eje Y invertido: ▲ y arrastrar hacia arriba ahora alejan el cabezal de usted.', 'ok'); });
    $('#mv-invx').onclick = () => guard(async () => { await LS.machine.invertAxis('X'); toast('Sentido del eje X invertido.', 'ok'); });
    $('#mv-dir').onclick = () => guard(async () => {
      if (!LS.machine.connected) throw new Error('Conecte el láser para comprobar la dirección.');
      const preguntar = (titulo, texto, si, no) => LS.dlg.open({ title: titulo, body: `<p>${texto}</p><p class="note">Si el cabezal estaba contra un borde y no se movió, pulse DETENER, aléjelo del borde y repita.</p>`, buttons: [{ label: 'No se movió' }, { label: no[0], action: no[1] }, { label: si[0], primary: true, action: si[1] }] });
      const yRot = LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y';
      if (!yRot) {
        await U.jogDir(0, 1, 5);
        await preguntar('Comprobar eje Y', 'Se pulsó ▲ (5 mm). ¿El cabezal se alejó de usted, hacia el <b>fondo</b> de la máquina?',
          ['Sí, hacia el fondo', () => toast('Eje Y correcto.', 'ok')],
          ['No, vino hacia mí', async () => { await U.jogDir(0, -1, 5); await LS.machine.invertAxis('Y'); toast('Eje Y invertido y cabezal devuelto a su lugar.', 'ok'); }]);
      }
      await U.jogDir(1, 0, 5);
      await preguntar('Comprobar eje X', 'Se pulsó ▶ (5 mm). ¿El cabezal se movió hacia la <b>derecha</b>?',
        ['Sí, a la derecha', () => toast('Eje X correcto.', 'ok')],
        ['No, a la izquierda', async () => { await U.jogDir(-1, 0, 5); await LS.machine.invertAxis('X'); toast('Eje X invertido y cabezal devuelto a su lugar.', 'ok'); }]);
    });
    // + y − del teclado numérico giran el rotativo
    window.addEventListener('keydown', e => {
      if (!/^Numpad(Add|Subtract)$/.test(e.code) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !LS.machine.connected || !LS.rotary.activo) return;
      e.preventDefault(); guard(() => U.jogRot(e.code === 'NumpadAdd' ? 1 : -1));
    });
    window.addEventListener('keydown', e => {
      if (!/^Numpad[1-9]$/.test(e.code) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !LS.machine.connected) return;
      const k = +e.code.slice(6); e.preventDefault();
      if (k === 5) return guard(() => LS.machine.stop());
      const dir = { 7: [-1, 1], 8: [0, 1], 9: [1, 1], 4: [-1, 0], 6: [1, 0], 1: [-1, -1], 2: [0, -1], 3: [1, -1] }[k];
      guard(() => U.jogDir(dir[0], dir[1]));
    });
    $('#mv-arr').onchange = e => { LS.device.arrastreModo = e.target.value; LS.saveSettings(); refreshLaser(); };
    $('#mv-home').onclick = () => guard(() => LS.machine.moveTo(0, 0));
    $('#mv-zup').onclick = () => guard(() => LS.machine.jogZ(step()));
    $('#mv-zdn').onclick = () => guard(() => LS.machine.jogZ(-step()));
    const REF_NOMBRES = { 'sup-izq': 'Esquina sup. izq.', 'sup-cen': 'Centro superior', 'sup-der': 'Esquina sup. der.', 'cen-izq': 'Centro izquierdo', 'cen-cen': 'Centro', 'cen-der': 'Centro derecho', 'inf-izq': 'Esquina inf. izq.', 'inf-cen': 'Centro inferior', 'inf-der': 'Esquina inf. der.' };
    const refUpd = () => { const r = LS.device.refOrigen || LS.device.origen; $('#mv-ref').querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.a === r)); $('#mv-refname').textContent = REF_NOMBRES[r]; V.redraw(); };
    $('#mv-ref').querySelectorAll('i').forEach(i => i.onclick = () => { LS.device.refOrigen = i.dataset.a; LS.saveSettings(); refUpd(); });
    refUpd(); U.refreshRefOrigen = refUpd;
    $('#mv-setzero').onclick = () => guard(async () => { await LS.machine.setZero(LS.device.refOrigen || LS.device.origen); refreshLaser(); toast('Posición calibrada: el cabezal quedó en la referencia elegida del lienzo.', 'ok'); });
    // origen del trabajo en la posición actual del láser (no mueve nada)
    const ancUpd = () => { $('#mv-anc').querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.a === jobOpts.ancla)); $('#mv-ancname').textContent = REF_NOMBRES[jobOpts.ancla]; const u = jobOpts.origenTrabajo === 'usuario' && jobOpts.origenUsuario; $('#mv-originfo').textContent = u ? `Origen fijado en X ${u[0].toFixed(1)}  Y ${u[1].toFixed(1)} mm` : 'El diseño se graba donde está en el lienzo; el origen es solo la referencia de partida del láser.'; V.redraw(); };
    $('#mv-anc').querySelectorAll('i').forEach(i => i.onclick = () => { jobOpts.ancla = i.dataset.a; ancUpd(); refreshLaser(); });
    U.refreshOrigen = ancUpd; ancUpd();
    $('#mv-setorig').onclick = () => { const h = V.headWorld() || LS.startWorld(); U.fijarReferencia(h); ancUpd(); };
    $('#mv-clrorig').onclick = () => { jobOpts.origenTrabajo = 'absoluto'; jobOpts.origenUsuario = null; ancUpd(); refreshLaser(); toast('Origen quitado: el trabajo se graba donde está en el lienzo.'); };
    $('#mv-clrzero').onclick = () => guard(() => LS.machine.clearZero());
    $('#mv-go').onclick = () => guard(() => LS.machine.moveTo(parseFloat($('#mv-x').value) || 0, parseFloat($('#mv-y').value) || 0));
    const fb = $('#mv-fireBtn');
    fb.onmousedown = () => guard(() => LS.machine.fire(Math.min(20, parseFloat($('#mv-fire').value) || 0), true));
    fb.onmouseup = fb.onmouseleave = () => { if (LS.machine.connected) LS.machine.fire(0, false); };
  }
  // Herramienta "Fijar origen": clic en el lienzo = donde está el láser ahora. Se ajusta a los 9 puntos de referencia.
  // Desactivar el rotativo (cuando el motor Y de la barra sigue en el conector Y)
  U.offerDisableRotary = async (sinPreguntar) => {
    const ok = sinPreguntar || await LS.dlg.confirm('Desactivar rotativo', 'El rotativo está activado en el conector Y, por eso la barra se muestra fija y ▲ ▼ giran el objeto.<br><br>¿Desactivar el rotativo para que ▲ ▼ y el esquema vuelvan a mover la barra?');
    if (!ok) return;
    LS.rotary.activo = false; LS.saveSettings(); refreshLaser(); V.redraw();
    toast('Rotativo desactivado: la barra vuelve a seguir al láser.', 'ok');
  };
  // El origen es solo la REFERENCIA DE PARTIDA: indica en qué punto del lienzo está físicamente el láser.
  // El diseño (texto, imagen, formas) se graba y se enmarca donde está colocado en el lienzo.
  U.fijarReferencia = w => {
    const M = LS.machine, d = LS.device;
    if (M.connected && d.tipo === 'ruida') { // Ruida: el controlador trabaja desde su posición actual
      jobOpts.origenUsuario = LS.toDisp(w[0], w[1]); jobOpts.origenTrabajo = 'usuario';
      U.refreshOrigen && U.refreshOrigen(); refreshLaser(); toast('Origen fijado (Ruida).', 'ok'); U.setTool('seleccionar'); return;
    }
    jobOpts.origenTrabajo = 'absoluto'; jobOpts.origenUsuario = null;
    const dd = LS.toDisp(w[0], w[1]);
    if (M.connected) {
      guard(async () => { await M.setZeroAt(w); U.refreshOrigen && U.refreshOrigen(); refreshLaser(); toast(`Referencia fijada: el láser está en X ${dd[0].toFixed(1)}  Y ${dd[1].toFixed(1)} del lienzo. El diseño se grabará y enmarcará donde está colocado.`, 'ok'); });
    } else {
      d.refArranque = 'custom'; d.posArranque = w.slice(); d.arranquePendiente = true; LS.saveSettings();
      toast(`Referencia de partida en X ${dd[0].toFixed(1)}  Y ${dd[1].toFixed(1)}: al conectar se tomará como la posición del láser. El diseño se grabará donde está en el lienzo.`, 'ok');
    }
    U.refreshOrigen && U.refreshOrigen(); refreshLaser(); V.redraw(); U.setTool('seleccionar');
  };
  U.setUserOrigin = w => U.fijarReferencia(w);
  U.declararPosicion = w => guard(async () => {
    const refs = ['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'];
    let best = null, bd = Infinity;
    refs.forEach(r => { const p = LS.machine.refPoint(r).world, d = Math.hypot(p[0] - w[0], p[1] - w[1]) * V.scale; if (d < bd) { bd = d; best = r; } });
    const ref = bd < 25 ? best : null;
    const pt = ref ? LS.machine.refPoint(ref).world : w;
    if (ref) { LS.device.refOrigen = ref; LS.saveSettings(); U.refreshRefOrigen && U.refreshRefOrigen(); }
    if (!LS.machine.connected) { toast(ref ? 'Referencia elegida. Conecte el láser y vuelva a hacer clic (o use Mover → Fijar origen aquí) para aplicarla.' : 'Conecte el láser para fijar el origen.', 'err'); return; }
    await LS.machine.setZeroAt(pt, ref);
    toast('Origen fijado: el punto verde quedó donde hizo clic.', 'ok');
    U.setTool('seleccionar'); refreshLaser();
  });

  // --- Consola ---
  function buildConsolePanel() {
    $('#p-consola').innerHTML = `<h3>Consola de la máquina</h3><div id="console"></div>
      <div class="row"><input type="text" id="con-in" placeholder="Comando (ej. $$, $I, G0 X10)" style="flex:1"><button id="con-send">Enviar</button></div>
      <div class="btns"><button data-c="$$">$$ Ajustes</button><button data-c="$I">$I Versión</button><button data-c="$G">$G Estado</button><button data-c="?">? Posición</button></div>
      <div class="row"><label title="Escribe en la consola cada vez que se pulsa o suelta un final de carrera">Mostrar finales de carrera en vivo</label><input type="checkbox" id="cs-pines"></div>
      <p class="note">Disponible para controladores GRBL. Las líneas que empiezan con $ cambian la configuración del controlador.</p>`;
    const send = () => { const v = $('#con-in').value.trim(); if (!v) return; guard(() => LS.machine.sendLine(v)); $('#con-in').value = ''; };
    $('#con-send').onclick = send; $('#con-in').onkeydown = e => { if (e.key === 'Enter') send(); };
    $('#p-consola').querySelectorAll('[data-c]').forEach(b => b.onclick = () => guard(() => LS.machine.sendLine(b.dataset.c)));
    $('#cs-pines').checked = !!LS.machine.verPines;
    $('#cs-pines').onchange = e => { LS.machine.verPines = e.target.checked; if (e.target.checked) LS.ui.consoleAppend('Pulse cada final de carrera: aquí aparecerá X o Y al pulsarlo y "ninguno activo" al soltarlo.', 'in'); };
  }
  U.consoleAppend = (txt, kind) => { const c = $('#console'); if (!c) return; const d = document.createElement('div'); d.className = kind; d.textContent = txt; c.append(d); while (c.childElementCount > 800) c.firstChild.remove(); c.scrollTop = c.scrollHeight; };

  // --- Biblioteca de materiales ---
  function buildLibraryPanel() { refreshLibrary(); }
  function refreshLibrary() {
    const p = $('#p-biblioteca'); const lib = LS.library.materiales;
    p.innerHTML = `<h3>Biblioteca de materiales</h3>
      <p class="note">Guarde los ajustes de una capa (Capas → Guardar en biblioteca) y aplíquelos después a la capa activa.</p>
      <table class="layers"><thead><tr><th>Material</th><th>Modo</th><th>Vel/Pot</th><th></th></tr></thead><tbody>${lib.map((m, i) => `<tr><td><b>${esc(m.material)}</b><br><span style="color:var(--muted)">${esc(m.descripcion || '')} ${m.espesor ? '· ' + m.espesor + ' mm' : ''}</span></td><td>${MODOS[m.ajustes.modo]}</td><td>${m.ajustes.velocidad} / ${m.ajustes.potMax}%</td><td><button data-a="${i}">Aplicar</button> <button data-d="${i}" title="Eliminar">✕</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted);padding:10px">Biblioteca vacía.</td></tr>'}</tbody></table>
      <div class="btns"><button id="lib-exp">Exportar…</button><button id="lib-imp">Importar…</button></div>`;
    p.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const m = lib[b.dataset.a]; const L = D.layer(D.currentLayer); D.checkpoint(); Object.assign(L, m.ajustes, { color: L.color }); D.changed('layers'); toast(`Ajustes de "${m.material}" aplicados a la capa ${L.nombre}.`, 'ok'); });
    p.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { lib.splice(Number(b.dataset.d), 1); LS.saveSettings(); refreshLibrary(); });
    $('#lib-exp').onclick = async () => { await window.nativo.saveFile({ defaultPath: 'biblioteca-materiales.json', filters: [{ name: 'Biblioteca', extensions: ['json'] }], data: JSON.stringify(LS.library, null, 2) }); };
    $('#lib-imp').onclick = async () => { const f = await window.nativo.openFile({ filters: [{ name: 'Biblioteca', extensions: ['json'] }] }); if (!f.length) return; try { const o = JSON.parse(new TextDecoder().decode(f[0].data)); LS.library.materiales.push(...(o.materiales || [])); LS.saveSettings(); refreshLibrary(); toast('Biblioteca importada.', 'ok'); } catch (e) { toast('Archivo no válido: ' + e.message, 'err'); } };
  }
  U.refreshLibrary = refreshLibrary;

  // ---------- Utilidades ----------
  U.status = t => { const e = $('#st-pos'); if (e) e.textContent = t; };
  U.msg = t => { const e = $('#st-msg'); if (e) e.textContent = t; };
  function toast(t, kind = '') { const d = h(`<div class="${kind}"></div>`); d.textContent = t; $('#toast').append(d); setTimeout(() => d.remove(), kind === 'err' ? 7000 : 3500); }
  U.toast = toast;
  async function guard(fn) { try { await fn(); } catch (e) { if (e && e.name === 'NotFoundError') return; toast(e.message || String(e), 'err'); } }
  U.guard = guard;
  U.notifyMaxS = v => { if (v > 0 && v !== LS.device.maxS) { LS.device.maxS = v; LS.saveSettings(); toast(`Potencia máxima S del controlador detectada: ${v}`, 'ok'); } };
  U.notifyStepsY = v => { if (v > 0) { LS.rotary.pasosMmYDetectado = v; } };

  U.createTextAt = w => LS.dlg.text(null, w);
  U.editText = o => LS.dlg.text(o);
  U.imageDialog = o => LS.dlg.image(o);

  U.init = () => {
    buildToolbar(); buildNumbar(); buildToolbox(); buildPalette(); buildTabs();
    D.on(what => { U.refreshNumeric(); refreshPalette(); refreshLayers(); updateTitle(); });
    U.refreshNumeric(); refreshPalette(); refreshLayers(); refreshLaser();
  };
  function updateTitle() { document.title = `${D.filePath ? D.filePath.split(/[\\/]/).pop() : 'Sin título'}${D.dirty ? ' •' : ''} — Láser Estudio Pro`; }
  U.updateTitle = updateTitle;
  U.refreshLayers = refreshLayers;
  LS.ui = U;
})(window.LS);
