// Menú contextual (clic derecho) sobre los objetos del lienzo.
// Material por objeto, vista previa, sentido del grabado, cortar por el borde / grabar el interior y acciones prácticas.
(function () {
  const LS = window.LS, D = LS.D, G = LS.G;
  const C = LS.ctx = {};
  const U = () => LS.ui, A = () => LS.app, J = () => LS.jobs;
  const DIRS = [['horizontal', '↔ Horizontal', 0], ['vertical', '↕ Vertical', 90], ['diagonal', '⤢ Diagonal 45°', 45], ['diagonal2', '⤡ Diagonal −45°', -45]];

  // ---------- capas ----------
  const usadas = () => new Set(D.objects.map(o => o.layer));
  // índice de capa libre (sin objetos); copia los ajustes de la capa de origen
  C.capaLibre = (desde) => {
    const us = usadas();
    for (let i = 0; i < 30; i++) {
      if (us.has(i) || i === desde) continue;
      const base = desde != null ? JSON.parse(JSON.stringify(D.layer(desde))) : {};
      const def = LS.layerDefault(i);
      D.layers[i] = Object.assign(def, base, { color: def.color, nombre: def.nombre, prioridad: def.prioridad, salida: true, visible: true });
      return i;
    }
    return desde ?? 0;
  };
  // Cada material o sentido se guarda en la capa: si la capa tiene también otros objetos,
  // la selección pasa a una capa propia (copia de la original) para no cambiar a los demás.
  C.separarCapas = sel => {
    const porCapa = {};
    sel.forEach(o => (porCapa[o.layer] = porCapa[o.layer] || []).push(o));
    const res = [];
    for (const k of Object.keys(porCapa).map(Number)) {
      const enCapa = D.objects.filter(o => o.layer === k);
      if (enCapa.length === porCapa[k].length) { res.push(k); continue; }
      const nueva = C.capaLibre(k);
      porCapa[k].forEach(o => o.layer = nueva);
      res.push(nueva);
    }
    return res;
  };
  // capa de corte (modo Línea) para figuras: la primera en uso, o la C00, o una nueva
  C.capaCorte = () => {
    const us = usadas();
    for (const k of [...us].sort((a, b) => a - b)) if (D.layer(k).modo === 'linea' && D.layer(k).salida !== false) return k;
    if (D.layer(0).modo === 'linea') return 0;
    const i = C.capaLibre(null); Object.assign(D.layer(i), { modo: 'linea', velocidad: 10, potMax: 80 }); return i;
  };
  // capa para una figura recién dibujada (rectángulo, círculo, polígono, línea):
  // las figuras son corte por el borde salvo que el usuario haya elegido a propósito una capa de relleno
  C.capaParaFigura = () => {
    const L = D.layer(D.currentLayer);
    if (L.modo === 'linea') return D.currentLayer;
    if (L.modo === 'relleno' && D._capaElegida) return D.currentLayer;
    const k = C.capaCorte();
    if (!C._avisado) { C._avisado = true; setTimeout(() => U().toast(`La figura se cortará por el borde (capa ${D.layer(k).nombre}, modo Línea). Para grabar su interior: clic derecho → «Grabar el interior (relleno)».`, 'ok'), 50); }
    return k;
  };

  // ---------- acciones ----------
  const sel = () => D.selected();
  const conCapasPropias = fn => { const s = sel(); if (!s.length) return; D.checkpoint(); const capas = C.separarCapas(s); fn(capas, s); D.currentLayer = capas[0]; D.changed('all'); };

  C.material = () => {
    const s = sel(); if (!s.length) return;
    D.checkpoint(); const capas = C.separarCapas(s); D.currentLayer = capas[0]; D.changed('all');
    LS.dlg.materialDB({ capas });
  };
  C.modo = modo => conCapasPropias((capas, s) => {
    for (const k of capas) {
      const L = D.layer(k);
      if (modo === 'linea' && L.modo !== 'linea') Object.assign(L, { modo: 'linea', velocidad: Math.min(L.velocidad, 10), potMax: Math.max(L.potMax, 80) });
      else if (modo === 'relleno' && L.modo !== 'relleno') Object.assign(L, { modo: 'relleno', velocidad: Math.max(L.velocidad, 100), potMax: Math.min(L.potMax, 35), intervalo: L.intervalo || 0.1 });
    }
    U().toast(modo === 'linea' ? 'Corte por el borde: el láser sigue solo el contorno. Ajuste potencia y velocidad con «Material…».' : 'Grabado del interior (relleno). Ajuste con «Material…».', 'ok');
  });
  C.sentido = dir => {
    const s = sel(); if (!s.length) return;
    const imgs = s.filter(o => o.kind === 'image'), vec = s.filter(o => o.kind !== 'image');
    D.checkpoint();
    imgs.forEach(o => { o.ajustes = Object.assign({}, LS.IMG_DEFAULT, o.ajustes, { direccion: dir }); if (LS.imgCache[o.id]) delete LS.imgCache[o.id].raster; });
    if (vec.length) { const capas = C.separarCapas(vec); const ang = DIRS.find(d => d[0] === dir)[2]; capas.forEach(k => { D.layer(k).angulo = ang; }); }
    D.changed('all');
    U().toast(`Sentido del grabado: ${DIRS.find(d => d[0] === dir)[1].slice(2)}.`, 'ok');
  };
  C.idaVuelta = () => conCapasPropias(capas => { const v = !D.layer(capas[0]).bidireccional; capas.forEach(k => D.layer(k).bidireccional = v); U().toast(v ? 'Grabado de ida y vuelta (más rápido).' : 'Grabado en un solo sentido (más parejo en algunos materiales).', 'ok'); });
  C.cruzado = () => conCapasPropias(capas => { const v = !D.layer(capas[0]).cruzado; capas.forEach(k => D.layer(k).cruzado = v); });
  C.invertirCorte = () => {
    const s = sel().filter(o => o.kind !== 'image' && o.paths); if (!s.length) return;
    D.checkpoint();
    s.forEach(o => { o.paths = o.paths.map(p => Object.assign({}, p, { pts: p.pts.slice().reverse() })); delete o.shape; });
    D.changed('all'); U().toast('Sentido del corte invertido.', 'ok');
  };
  C.aCapa = k => { const s = sel(); if (!s.length) return; D.checkpoint(); s.forEach(o => o.layer = k); D.layer(k); D.currentLayer = k; D._capaElegida = true; D.changed('all'); };
  C.nuevaCapa = () => conCapasPropias(() => { });
  C.vistaPrevia = () => U().guard(() => { if (LS.V.preview) A().closePreview(); A().preview(J().build({ soloSeleccion: true })); });
  C.marco = () => A().frame({ soloSeleccion: true });
  C.grabarSolo = async () => {
    const prev = J().options.soloSeleccion; J().options.soloSeleccion = true;
    const cb = document.getElementById('ls-onlysel'); if (cb) cb.checked = true;
    U().toast('«Solo selección» activado: se graba únicamente lo seleccionado. Desmárquelo en Láser para volver a grabar todo.', 'ok');
    try { await A().startJob(); } finally { if (!prev) { /* se deja activado a la vista para que el usuario sepa qué se grabó */ } }
  };
  C.zona = () => {
    const s = sel(); if (!s.length) return;
    let b = null; s.forEach(o => D.worldPaths(o).forEach(p => b = G.union(b, G.bbox(p.pts))));
    if (s.some(o => o.kind === 'image')) s.filter(o => o.kind === 'image').forEach(o => b = G.union(b, G.bbox([[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(p => G.apply(o.tx, p)))));
    if (b) J().setZona({ x0: b.x0 - 0.5, y0: b.y0 - 0.5, x1: b.x1 + 0.5, y1: b.y1 + 0.5 });
    U().toast('Zona parcial sobre la selección: solo se grabará esa área. Quítela en Láser → Zona parcial.', 'ok');
  };
  C.centrar = () => {
    const s = sel(); if (!s.length) return;
    let b = null; s.forEach(o => { const ps = o.kind === 'image' ? [[[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(p => G.apply(o.tx, p))] : D.worldPaths(o).map(p => p.pts); ps.forEach(pp => b = G.union(b, G.bbox(pp))); });
    D.checkpoint(); D.transformSel(G.tr(LS.device.ancho / 2 - (b.x0 + b.x1) / 2, LS.device.alto / 2 - (b.y0 + b.y1) / 2)); D.changed('all');
  };

  // ---------- menú ----------
  let menu = null;
  C.cerrar = () => { if (menu) { menu.remove(); menu = null; } };
  const item = (txt, fn, o = {}) => ({ txt, fn, ...o });
  const sep = { sep: true };

  function opciones() {
    const s = sel(), hay = s.length > 0, imgs = s.filter(o => o.kind === 'image'), vec = s.filter(o => o.kind !== 'image');
    if (!hay) return [
      item('📋 Pegar', () => A().command('pegar'), { atajo: 'Ctrl+V' }),
      item('▣ Seleccionar todo', () => A().command('seleccionarTodo'), { atajo: 'Ctrl+A' }),
      sep,
      item('👁 Vista previa del trabajo', () => A().command('vistaPrevia')),
      item('⬚ Dibujar zona parcial', () => U().setTool('zona'), { atajo: 'Z' }),
      J().options.zona ? item('✕ Quitar zona parcial', () => J().setZona(null)) : null,
    ].filter(Boolean);
    const capas = [...new Set(s.map(o => o.layer))], L = D.layer(capas[0]);
    const dirAct = imgs.length ? ((imgs[0].ajustes || {}).direccion || 'horizontal') : (L.angulo === 90 ? 'vertical' : L.angulo === 45 ? 'diagonal' : L.angulo === -45 ? 'diagonal2' : 'horizontal');
    const modoAct = imgs.length && !vec.length ? 'imagen' : L.modo;
    const capasUsadas = [...usadas()].sort((a, b) => a - b);
    return [
      { titulo: s.length === 1 ? (s[0].nombre || { image: 'Imagen', text: 'Texto', path: s[0].shape ? ({ rect: 'Rectángulo', elipse: 'Elipse', poligono: 'Polígono' }[s[0].shape] || 'Forma') : 'Forma' }[s[0].kind] || 'Objeto') + ` · capa ${L.nombre}` : `${s.length} objetos seleccionados` },
      item('🗄 Material…', C.material, { info: 'asigna un material solo a lo seleccionado' }),
      item('👁 Vista previa de la selección', C.vistaPrevia),
      { txt: '↔ Sentido del grabado', sub: [
        ...DIRS.map(([k, t]) => item(t, () => C.sentido(k), { marcado: dirAct === k })),
        sep,
        item('⇄ Ida y vuelta (bidireccional)', C.idaVuelta, { marcado: !!L.bidireccional, oculto: modoAct === 'linea' }),
        item('▦ Relleno cruzado', C.cruzado, { marcado: !!L.cruzado, oculto: modoAct !== 'relleno' }),
        item('↺ Invertir sentido del corte', C.invertirCorte, { oculto: !vec.length }),
      ].filter(i => !i.oculto) },
      sep,
      vec.length ? item('✂ Cortar por el borde (contorno)', () => C.modo('linea'), { marcado: modoAct === 'linea' }) : null,
      vec.length ? item('▦ Grabar el interior (relleno)', () => C.modo('relleno'), { marcado: modoAct === 'relleno' }) : null,
      { txt: '◧ Mover a la capa', sub: capasUsadas.map(k => item(`${D.layer(k).nombre} · ${{ linea: 'Línea', relleno: 'Relleno', imagen: 'Imagen' }[D.layer(k).modo]}`, () => C.aCapa(k), { marcado: capas.length === 1 && capas[0] === k, color: D.layer(k).color })).concat([sep, item('＋ Capa nueva solo para esto', C.nuevaCapa)]) },
      sep,
      item('▣ Marco de la selección', C.marco),
      item('▶ Grabar solo la selección…', C.grabarSolo),
      item('⬚ Zona parcial sobre la selección', C.zona),
      sep,
      imgs.length ? item('🖼 Asistente de imagen…', () => A().command('ajustarImagen')) : null,
      imgs.length ? item('🪄 Quitar fondo y siluetas…', () => A().command('quitarFondo'), { atajo: 'F' }) : null,
      imgs.length ? item('✎ Calcar imagen (vectorizar)…', () => A().command('calcar')) : null,
      s.some(o => o.kind === 'text') ? item('𝐓 Convertir texto en trazo', () => A().command('convertirTrazado')) : null,
      imgs.length ? sep : null,
      item('⧉ Duplicar', () => A().command('duplicar'), { atajo: 'Ctrl+D' }),
      item('⊕ Centrar en el área de trabajo', C.centrar),
      { txt: '⟲ Girar / reflejar', sub: [item('↻ Girar 90°', () => A().command('girar90')), item('⇋ Reflejar horizontal', () => A().command('reflejarH')), item('⇵ Reflejar vertical', () => A().command('reflejarV'))] },
      s.length > 1 ? item('⊞ Agrupar', () => A().command('agrupar'), { atajo: 'Ctrl+G' }) : null,
      s.some(o => o.group) ? item('⊟ Desagrupar', () => A().command('desagrupar')) : null,
      item('⧉ Copiar', () => A().command('copiar'), { atajo: 'Ctrl+C' }),
      item('🗑 Eliminar', () => A().command('eliminar'), { atajo: 'Supr', peligro: true }),
    ].filter(Boolean);
  }

  function construir(items, x, y, padre) {
    const m = document.createElement('div'); m.className = 'ctxmenu';
    items.forEach(it => {
      if (it.sep) { if (m.lastChild && !m.lastChild.classList.contains('sep')) m.append(Object.assign(document.createElement('div'), { className: 'sep' })); return; }
      if (it.titulo) { const t = document.createElement('div'); t.className = 'tit'; t.textContent = LS.t ? LS.t(it.titulo) : it.titulo; m.append(t); return; }
      const e = document.createElement('div'); e.className = 'it' + (it.peligro ? ' peligro' : '') + (it.sub ? ' consub' : '');
      e.innerHTML = `<span class="mk">${it.marcado ? '✓' : ''}</span>${it.color ? `<span class="cl" style="background:${it.color}"></span>` : ''}<span class="tx"></span>${it.atajo ? `<span class="at">${it.atajo}</span>` : ''}${it.sub ? '<span class="ar">▸</span>' : ''}`;
      e.querySelector('.tx').textContent = LS.t ? LS.t(it.txt) : it.txt;
      if (it.info) e.title = LS.t ? LS.t(it.info) : it.info;
      if (it.sub) {
        let hijo = null;
        e.onmouseenter = () => { m.querySelectorAll('.ctxmenu').forEach(x => x.remove()); const r = e.getBoundingClientRect(); hijo = construir(it.sub, r.right - 2, r.top - 4, m); };
      } else {
        e.onmouseenter = () => m.querySelectorAll(':scope > .ctxmenu').forEach(x => x.remove());
        e.onclick = ev => { ev.stopPropagation(); C.cerrar(); try { const r = it.fn(); if (r && r.catch) r.catch(err => U().toast(err.message || String(err), 'err')); } catch (err) { U().toast(err.message || String(err), 'err'); } };
      }
      m.append(e);
    });
    if (m.lastChild && m.lastChild.classList.contains('sep')) m.lastChild.remove();
    (padre || document.body).append(m);
    // que no se salga de la ventana
    const r = m.getBoundingClientRect();
    const X = Math.min(x, window.innerWidth - r.width - 6), Y = Math.min(y, window.innerHeight - r.height - 6);
    m.style.left = (padre ? X - padre.getBoundingClientRect().left : X) + 'px'; m.style.top = (padre ? Y - padre.getBoundingClientRect().top : Math.max(4, Y)) + 'px';
    if (padre && x + r.width > window.innerWidth) m.style.left = (-r.width + 4) + 'px';
    return m;
  }

  C.abrir = (e) => {
    C.cerrar();
    const V = LS.V, cv = document.getElementById('cv'), rc = cv.getBoundingClientRect();
    const w = V.s2w([e.clientX - rc.left, e.clientY - rc.top]), hit = V.hitTest(w);
    if (hit) {
      const g = hit.group;
      if (!D.selection.has(hit.id)) { D.selection.clear(); D.objects.filter(o => o.id === hit.id || (g && o.group === g)).forEach(o => D.selection.add(o.id)); D.changed('sel'); }
    } else if (D.selection.size) { D.selection.clear(); D.changed('sel'); }
    menu = construir(opciones(), e.clientX, e.clientY);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const cv = document.getElementById('cv'); if (!cv) return;
    cv.addEventListener('contextmenu', e => { e.preventDefault(); if (LS.V && LS.V.preview) return; C.abrir(e); });
    document.addEventListener('mousedown', e => { if (menu && !e.target.closest('.ctxmenu')) C.cerrar(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu) { e.stopPropagation(); C.cerrar(); } }, true);
    window.addEventListener('blur', C.cerrar); window.addEventListener('resize', C.cerrar);
  });
})();
