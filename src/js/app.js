// Orquestación: comandos de menú, archivos, portapapeles, vista previa y envío de trabajos.
(function (LS) {
  const G = LS.G, D = LS.D, V = LS.V, U = LS.ui, J = LS.jobs;
  const A = {};
  let clipboard = null;

  const FILTERS_IMPORT = [{ name: 'Archivos compatibles', extensions: ['svg', 'dxf', 'png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'bmp', 'gif', 'webp', 'avif', 'ico', 'lep'] },
    { name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'gif', 'webp', 'avif', 'ico'] }, { name: 'Vectores', extensions: ['svg', 'dxf'] }, { name: 'Todos los archivos', extensions: ['*'] }];
  async function importFiles() {
    const files = await window.nativo.openFile({ multi: true, filters: FILTERS_IMPORT });
    for (const f of files) await importOne(f);
  }
  async function importOne(f) {
    try {
      D.checkpoint(); D.selection.clear();
      const txt = () => new TextDecoder().decode(f.data);
      let added = [], abrirAsistente = null;
      if (f.ext === '.svg') added = LS.importSVG(txt(), f.name);
      else if (f.ext === '.dxf') added = LS.importDXF(txt(), f.name);
      else if (f.ext === '.lep') { D.load(txt()); D.filePath = f.path; V.fitBed(); return; }
      else { const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.pjpeg': 'image/jpeg', '.bmp': 'image/bmp', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon' }[f.ext];
        if (!mime) throw new Error(/\.(heic|heif|tif|tiff|psd|cdr|ai|pdf)$/.test(f.ext) ? `El formato ${f.ext} no se puede abrir directamente. Guárdelo como PNG o JPG (o SVG para vectores) e impórtelo de nuevo.` : 'Formato no compatible: ' + f.ext); added = await LS.importImage(`data:${mime};base64,${toB64(f.data)}`, f.name); abrirAsistente = added[0]; }
      D.changed('all');
      if (abrirAsistente) { LS.imageFor(abrirAsistente); setTimeout(() => LS.dlg.image(abrirAsistente, { nuevo: true }), 60); return; }
      U.toast(`Importado: ${f.name}`, 'ok');
      const b = D.selBBox(added); if (b && (b.x1 > LS.device.ancho || b.y1 > LS.device.alto)) U.toast('Atención: parte del diseño queda fuera del área de trabajo.', 'err');
    } catch (e) { D.undoStack.pop(); U.toast(`No se pudo importar ${f.name}: ${e.message}`, 'err'); }
  }
  function toB64(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }

  async function saveProject(as) {
    const p = await window.nativo.saveFile({ path: as ? null : D.filePath, defaultPath: 'proyecto.lep', filters: [{ name: 'Proyecto Láser Estudio', extensions: ['lep'] }], data: D.serialize() });
    if (p) { D.filePath = p; D.dirty = false; U.updateTitle(); U.toast('Proyecto guardado.', 'ok'); }
  }
  async function openProject() {
    if (D.dirty && !(await LS.dlg.confirm('Abrir proyecto', 'Hay cambios sin guardar. ¿Descartarlos?'))) return;
    const f = await window.nativo.openFile({ filters: [{ name: 'Proyecto Láser Estudio', extensions: ['lep'] }] });
    if (!f.length) return;
    try { D.load(new TextDecoder().decode(f[0].data)); D.filePath = f[0].path; U.updateTitle(); V.fitBed(); } catch (e) { U.toast(e.message, 'err'); }
  }
  function exportSVG() {
    const parts = [];
    for (const o of D.objects) {
      const L = D.layer(o.layer);
      if (o.kind === 'image') { const m = o.tx; parts.push(`<image href="${o.src}" width="${o.w}" height="${o.h}" transform="matrix(${m.join(' ')})" preserveAspectRatio="none"/>`); continue; }
      const d = D.worldPaths(o).map(p => 'M' + p.pts.map(q => q[0].toFixed(3) + ',' + q[1].toFixed(3)).join('L') + (p.closed ? 'Z' : '')).join('');
      parts.push(`<path d="${d}" fill="${L.modo === 'relleno' ? L.color : 'none'}" fill-rule="evenodd" stroke="${L.color}" stroke-width="0.1"/>`);
    }
    const dv = LS.device;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${dv.ancho}mm" height="${dv.alto}mm" viewBox="0 0 ${dv.ancho} ${dv.alto}">\n${parts.join('\n')}\n</svg>\n`;
  }

  // ---------- Trabajo ----------
  function build(extra) {
    const job = J.build(Object.assign({}, J.options, extra));
    const r = job.recorte;
    if (r && r.recortado) U.toast(`Se omitieron ${r.mm.toFixed(0)} mm de recorrido que quedaban fuera del área de trabajo (${LS.device.ancho}×${LS.device.alto} mm).`, 'err');
    if (r && r.desconocido) U.toast('No se pudo comprobar el área: con "Posición actual" conecte el láser para que la app conozca dónde está el cabezal.', 'err');
    return job;
  }
  function checkBounds(job) {
    if (J.options.origenTrabajo === 'actual' || LS.device.recortarArea !== false) return; // con recorte activo ya se ajustó al área
    const b = job.bbox, d = LS.device;
    // con rotativo, el eje del giro no tiene límite de mesa (se revisa solo el eje lineal)
    if (!b) return;
    const rot = LS.rotary.activo ? (LS.jobs.axisLetters()[0] === 'Z' ? 'x' : 'y') : null;
    const outX = rot !== 'x' && (b.x0 < -0.01 || b.x1 > d.ancho + 0.01), outY = rot !== 'y' && (b.y0 < -0.01 || b.y1 > d.alto + 0.01);
    if (outX || outY) throw new Error('El trabajo se sale del área de la máquina. Muévalo dentro de la mesa o use "Posición actual".');
  }
  A.startJob = () => U.guard(async () => {
    const M = LS.machine; if (!M.connected) throw new Error('Conecte primero el láser.');
    await M.prepararTrabajo();
    U.msg('Preparando el trabajo…'); await new Promise(r => setTimeout(r, 30)); // deja ver el aviso en trabajos grandes
    // imágenes grandes: se graban por partes (cada parte se prepara y envía por separado, con descanso entre partes)
    if (LS.device.tipo !== 'ruida') {
      const plan = J.planPartes();
      if (plan.necesario) return A.trabajoPorPartes(plan);
    }
    const job = build(); checkBounds(job);
    const est = J.estimate(job);
    if (LS.device.tipo === 'ruida') await M.runRuida(LS.ruida.encodeJob(job, J.options));
    else {
      // al terminar vuelve al punto de partida (si "Volver al origen al terminar" está activo)
      const gc = LS.toGcode(job, Object.assign({}, J.options, LS.device.volverOrigen && M.posInicio ? { volverA: M.posInicio() } : {}));
      if (M.via === 'wifi' && LS.device.usarSD !== false) {
        await M.runDesdeSD(gc);
        U.toast(`Trabajo guardado en la tarjeta e iniciado · tiempo estimado ${J.fmtTime(est.segundos)}.`, 'ok');
      } else {
        M.runGcode(gc);
        U.toast(`Trabajo iniciado: ${gc.split('\n').length} líneas · tiempo estimado ${J.fmtTime(est.segundos)}.`, 'ok');
      }
    }
    U.msg(`Grabando… tiempo estimado ${J.fmtTime(est.segundos)}`);
    U.showTab('laser');
  });
  // ---------- Trabajo por partes ----------
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  // espera a que la máquina termine la parte en curso (por cable o desde la tarjeta SD)
  async function esperarFin(M) {
    const t0 = Date.now();
    while (!(M.running || M.sdActivo) && Date.now() - t0 < 10000 && !M._cancelPartes) await dormir(300);
    while ((M.running || M.sdActivo) && M.connected && !M._cancelPartes) await dormir(500);
    await dormir(800);
  }
  A.trabajoPorPartes = async plan => {
    const M = LS.machine, d = LS.device, n = plan.franjas.length;
    M._cancelPartes = false; M._saltarDescanso = false;
    const inicio = d.volverOrigen !== false && M.posInicio ? M.posInicio() : null; // cada parte vuelve al punto de partida: la siguiente arranca desde el mismo lugar
    const descanso = Math.max(0, Number(d.partesDescanso ?? 15));
    U.toast(`Trabajo grande: se grabará en ${n} partes de ${plan.alto.toFixed(1)} mm${descanso ? `, con ${descanso} s de descanso entre partes` : ''}.`, 'ok');
    U.showTab('laser');
    let hechas = 0;
    for (let k = 0; k < n; k++) {
      if (M._cancelPartes || !M.connected) break;
      U.msg(`Preparando la parte ${k + 1} de ${n}…`); M.parteActual = { k: k + 1, n }; await dormir(40);
      let job;
      try { job = J.build(Object.assign({}, J.options, { franja: plan.franjas[k], anchorBox: plan.anchorBox })); }
      catch (e) { if (/no contiene nada|no generó/.test(e.message)) continue; throw e; } // franja en blanco
      const gc = LS.toGcode(job, Object.assign({}, J.options, inicio ? { volverA: inicio } : {}));
      const est = J.estimate(job);
      if (M.via === 'wifi' && d.usarSD !== false) await M.runDesdeSD(gc); else M.runGcode(gc);
      U.msg(`Grabando la parte ${k + 1} de ${n} · ${J.fmtTime(est.segundos)} aprox.`);
      job = null; // libera memoria antes de la siguiente parte
      await esperarFin(M);
      if (M._cancelPartes || !M.connected) break;
      hechas = k + 1;
      if (k < n - 1 && descanso > 0) {
        for (let t = descanso; t > 0 && !M._cancelPartes && !M._saltarDescanso; t--) { U.msg(`Descanso: ${t} s · sigue la parte ${k + 2} de ${n}`); await dormir(1000); }
        M._saltarDescanso = false;
      }
    }
    M.parteActual = null;
    if (M._cancelPartes) { U.msg(`Trabajo detenido en la parte ${hechas + 1} de ${n}.`); U.toast(`Trabajo por partes detenido (${hechas} de ${n} partes terminadas).`, 'err'); }
    else if (hechas >= n || !M._cancelPartes) { U.msg(`Trabajo terminado (${n} partes).`); U.toast(`Trabajo terminado: ${n} partes.`, 'ok'); }
  };
  // Ensayo en la máquina: recorre todo el trabajo (y gira el rotativo) con el láser apagado
  A.dryRun = () => U.guard(async () => {
    await LS.machine.prepararTrabajo();
    const M = LS.machine; if (!M.connected) throw new Error('Conecte primero el láser.');
    const job = build(); checkBounds(job);
    const opts = Object.assign({}, J.options, { seco: true, volverA: M.posInicio && M.posInicio() });
    U.msg(`Ensayo sin láser · duración aproximada ${J.fmtTime(J.estimate(job).segundos)}`);
    if (LS.device.tipo === 'ruida') await M.runRuida(LS.ruida.encodeJob(job, opts));
    // por WiFi el ensayo también se guarda en la tarjeta SD de la placa (sin cortes ni pérdidas de ubicación)
    else if (M.via === 'wifi' && LS.device.usarSD !== false) await M.runDesdeSD(LS.toGcode(job, opts));
    else M.runGcode(LS.toGcode(job, opts));
    U.toast('Ensayo iniciado: la máquina se mueve con el láser apagado.', 'ok');
  });
  A.frame = (extra = {}) => U.guard(async () => {
    await LS.machine.prepararTrabajo(); const job = build({ soloBBox: true });
    const o = Object.assign({}, J.options, extra);
    await LS.machine.frame(job, o);
    const d = LS.device, luz = extra.luz != null ? extra.luz : (d.marcoLuz != null ? d.marcoLuz : d.potenciaMarco > 0);
    if (luz) U.toast(`Marco con luz al ${Math.min(5, d.potenciaMarco > 0 ? d.potenciaMarco : 1)} %: mire el contorno sobre el material. Al terminar vuelve al punto de partida.`, 'ok');
  });
  A.saveGcode = () => U.guard(async () => { const job = build(); checkBounds(job); await window.nativo.saveFile({ defaultPath: 'trabajo.gc', filters: [{ name: 'G-code', extensions: ['gc', 'gcode', 'nc'] }], data: LS.toGcode(job, J.options) }); U.toast('G-code guardado.', 'ok'); });
  A.saveRd = () => U.guard(async () => { const job = build(); checkBounds(job); const data = LS.ruida.swizzle(LS.ruida.encodeJob(job, J.options)); await window.nativo.saveFile({ defaultPath: 'trabajo.rd', filters: [{ name: 'Archivo Ruida', extensions: ['rd'] }], data: Array.from(data) }); U.toast('Archivo .rd guardado (codificado para memoria USB del controlador).', 'ok'); });

  // ---------- Vista previa ----------
  A.preview = job => {
    const est = J.estimate(job);
    V.preview = { moves: job.segs.map(s => ({ a: s.a, b: s.b, on: s.on, p: s.p, color: D.layer(s.L).color })), showTravel: true };
    V.previewT = 1; V.fitRect(job.bbox, 60);
    const bar = document.getElementById('previewbar'); bar.hidden = false;
    bar.innerHTML = `<b>Vista previa</b><input type="range" id="pv-t" min="0" max="1000" value="1000"><label><input type="checkbox" id="pv-tr" checked> Viajes</label><span class="chip">${J.fmtTime(est.segundos)}</span><span class="chip">Corte ${(est.corte / 1000).toFixed(2)} m · viaje ${(est.viaje / 1000).toFixed(2)} m</span><button id="pv-play">▶</button><button id="pv-close" class="primary">Cerrar</button>`;
    let timer = null;
    bar.querySelector('#pv-t').oninput = e => { V.previewT = e.target.value / 1000; V.redraw(); };
    bar.querySelector('#pv-tr').onchange = e => { V.preview.showTravel = e.target.checked; V.redraw(); };
    bar.querySelector('#pv-play').onclick = () => { if (timer) { clearInterval(timer); timer = null; return; } V.previewT = 0; timer = setInterval(() => { V.previewT = Math.min(1, V.previewT + 0.004); bar.querySelector('#pv-t').value = V.previewT * 1000; V.redraw(); if (V.previewT >= 1) { clearInterval(timer); timer = null; } }, 30); };
    bar.querySelector('#pv-close').onclick = () => { clearInterval(timer); A.closePreview(); };
    V.redraw();
  };
  A.closePreview = () => { V.preview = null; document.getElementById('previewbar').hidden = true; V.redraw(); };
  A.previewTemp = t => U.guard(() => { const job = J.withTempDoc(t.objects, t.layers, () => J.build({ objects: t.objects, optimizar: false })); J.withTempDoc(t.objects, t.layers, () => A.preview(job)); });
  A.runTemp = async t => {
    const M = LS.machine; if (!M.connected) throw new Error('Conecte primero el láser.');
    await M.prepararTrabajo();
    await J.withTempDoc(t.objects, t.layers, async () => {
      const job = J.build({ objects: t.objects, optimizar: false });
      if (LS.device.tipo === 'ruida') await M.runRuida(LS.ruida.encodeJob(job, J.options)); else M.runGcode(LS.toGcode(job, J.options));
    });
  };

  // ---------- Portapapeles ----------
  function copy() { const s = D.selected(); if (s.length) clipboard = JSON.stringify(s); }
  function paste(offset = 5) {
    if (!clipboard) return; D.checkpoint(); D.selection.clear();
    const groups = {};
    JSON.parse(clipboard).forEach(o => { o.id = G.uid(); if (o.group) o.group = groups[o.group] = groups[o.group] || G.uid(); o.tx = G.mul(G.tr(offset, offset), o.tx); D.add(o); });
    clipboard = JSON.stringify(D.selected());
    D.changed();
  }

  A.command = cmd => U.guard(async () => {
    const [c, arg] = cmd.split(':');
    switch (c) {
      case 'idioma': LS.setIdioma(arg); U.toast({ es: 'Idioma: Español', en: 'Language: English', pt: 'Idioma: Português' }[arg], 'ok'); break;
      case 'nuevo':
        if (D.dirty && D.objects.length && !(await LS.dlg.confirm('Nuevo proyecto', 'Hay cambios sin guardar. ¿Descartarlos y empezar un proyecto nuevo?'))) return;
        D.clear(); Object.keys(LS.imgCache).forEach(k => delete LS.imgCache[k]); LS.V.preview && A.closePreview(); U.updateTitle(); V.fitBed(); U.toast('Proyecto nuevo.', 'ok'); break;
      case 'abrir': return openProject();
      case 'guardar': return saveProject(false);
      case 'guardarComo': return saveProject(true);
      case 'importar': return importFiles();
      case 'exportarSvg': await window.nativo.saveFile({ defaultPath: 'diseño.svg', filters: [{ name: 'SVG', extensions: ['svg'] }], data: exportSVG() }); U.toast('SVG exportado.', 'ok'); break;
      case 'guardarGcode': return A.saveGcode();
      case 'guardarRd': return A.saveRd();
      case 'deshacer': D.undo(); break;
      case 'rehacer': D.redo(); break;
      case 'copiar': copy(); break;
      case 'cortar': copy(); D.checkpoint(); D.remove(D.selected().map(o => o.id)); D.changed(); break;
      case 'pegar': paste(); break;
      case 'duplicar': copy(); paste(0); break;
      case 'eliminar': if (D.selection.size) { D.checkpoint(); D.remove([...D.selection]); D.changed(); } break;
      case 'seleccionarTodo': D.objects.forEach(o => D.selection.add(o.id)); D.changed('sel'); break;
      case 'agrupar': { const s = D.selected(); if (s.length < 2) throw new Error('Seleccione dos o más objetos.'); D.checkpoint(); const g = G.uid(); s.forEach(o => o.group = g); D.changed(); break; }
      case 'desagrupar': D.checkpoint(); D.selected().forEach(o => delete o.group); D.changed(); break;
      case 'union': case 'diferencia': case 'interseccion': LS.ops.boolean(c); break;
      case 'offset': if (!D.selection.size) throw new Error('Seleccione formas cerradas.'); return LS.dlg.offset();
      case 'convertirTrazado': LS.ops.toPath(); break;
      case 'calcar': case 'ajustarImagen': { const im = D.selected().find(o => o.kind === 'image'); if (!im) throw new Error('Seleccione una imagen.'); return c === 'calcar' ? LS.dlg.trace(im) : LS.dlg.image(im); }
      case 'matriz': if (!D.selection.size) throw new Error('Seleccione objetos.'); return LS.dlg.gridArray();
      case 'matrizCircular': if (!D.selection.size) throw new Error('Seleccione objetos.'); return LS.dlg.circularArray();
      case 'reflejarH': LS.ops.mirror('h'); break;
      case 'reflejarV': LS.ops.mirror('v'); break;
      case 'girar90': LS.ops.rotate(90); break;
      case 'alin': LS.ops.align(arg); break;
      case 'dist': LS.ops.distribute(arg); break;
      case 'pruebaMaterial': return LS.dlg.materialTest();
      case 'materialDB': return LS.dlg.materialDB();
      case 'rotativo': return LS.dlg.rotary();
      case 'calibrarRotativo': return LS.dlg.rotaryCalibrate();
      case 'configDispositivo': return LS.dlg.device();
      case 'vistaPrevia': if (V.preview) return A.closePreview(); A.preview(build()); break;
      case 'vista3d': if (!LS.vista3d) throw new Error('La vista 3D aún se está cargando.'); LS.vista3d.abrir(); break;
      case 'ensayo': return A.dryRun();
      case 'jogFlotante': U.toggleJogFloat(); break;
      case 'simRotativo': LS.rotSim.open(); break;
      case 'verMaquina': LS.device.verMaquina = LS.device.verMaquina === false; LS.saveSettings(); U.refreshLaser(); V.fitBed(); U.toast(LS.device.verMaquina ? 'Esquema de la máquina visible.' : 'Esquema de la máquina oculto.'); break;
      case 'escala': { const c = ['cm', 'mm', 'no'], i = c.indexOf(LS.device.escala || 'cm'); LS.device.escala = c[(i + 1) % 3]; LS.saveSettings(); V.redraw(); U.toast({ cm: 'Escala en centímetros.', mm: 'Escala en milímetros.', no: 'Escala oculta.' }[LS.device.escala]); break; }
      case 'verRotativo':
        if (!LS.rotary.activo) {
          // el esquema solo se dibuja con el rotativo activado: se ofrece activarlo
          LS.rotary.mostrar = true; LS.rotary.activo = true; LS.saveSettings(); U.refreshLaser(); V.redraw();
          U.toast('Rotativo activado y esquema visible. Para quitarlo: Láser → «Rotativo activado».', 'ok'); break;
        }
        LS.rotary.mostrar = LS.rotary.mostrar === false; LS.saveSettings(); U.refreshLaser(); V.redraw(); U.toast(LS.rotary.mostrar ? 'Esquema del rotativo visible.' : 'Esquema del rotativo oculto.'); break;
      case 'zoomMesa': V.fitBed(); break;
      case 'zoomSel': V.fitRect(D.selBBox()); break;
      case 'atajos': return LS.dlg.shortcuts();
      case 'acerca': return LS.dlg.about();
      case 'actualizaciones': return LS.dlg.actualizaciones();
      case 'firmware': return LS.dlg.firmware();
    }
  });

  // ---------- Teclado ----------
  // Detener todo: funciona incluso con un diálogo abierto
  window.addEventListener('keydown', e => {
    if ((e.key === 'Pause' || (e.ctrlKey && e.code === 'Space')) && LS.machine.connected) { e.preventDefault(); U.guard(() => LS.machine.stop()); }
  }, true);
  window.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !document.getElementById('modal').hidden) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return; // los atajos con modificador los maneja el menú
    const k = e.key;
    if (k === 'Escape') { if (V.preview) A.closePreview(); else if (V.draft) V.cancelDraft(); else if (V.tool !== 'seleccionar') U.setTool('seleccionar'); else { D.selection.clear(); D.changed('sel'); } return; }
    if (k === 'Enter' && V.tool === 'linea') { V.cancelDraft(); return; }
    if (k === 'Delete' || k === 'Backspace') { A.command('eliminar'); return; }
    const tools = { v: 'seleccionar', l: 'linea', r: 'rect', e: 'elipse', p: 'poligono', t: 'texto', z: 'zona' };
    if (tools[k.toLowerCase()]) { U.setTool(tools[k.toLowerCase()]); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k] && D.selection.size) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; D.checkpoint(); D.transformSel(G.tr(arrows[k][0] * s, arrows[k][1] * s)); D.changed('xf'); }
  });

  // arrastrar y soltar archivos
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) {
      const data = new Uint8Array(await file.arrayBuffer()); const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      await importOne({ name: file.name, ext, data, path: file.path });
    }
  });
  window.addEventListener('beforeunload', e => { if (D.dirty && !window.__forceClose) { e.returnValue = false; LS.dlg.confirm('Salir', 'Hay cambios sin guardar. ¿Salir de todas formas?').then(ok => { if (ok) { window.__forceClose = true; window.close(); } }); } });

  A.init = () => {
    D.layer(0);
    LS.V.init(document.getElementById('cv'));
    U.init();
    window.nativo.onMenu(c => A.command(c));
    window.nativo.onSerialPorts(list => LS.dlg.serialPorts(list));
    window.nativo.onRuidaProgress(p => { LS.machine.progress = p; LS.ui.refreshLaser(); });
    LS.loadFontList().catch(() => { });
    U.updateTitle();
    U.msg('Listo. Importe un diseño (Ctrl+I) o dibuje con las herramientas de la izquierda.');
  };
  LS.app = A;
  A.init();
})(window.LS);
