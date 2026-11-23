// Lienzo de edición: vista, renderizado, herramientas e interacción.
(function (LS) {
  const G = LS.G, D = LS.D;
  const T = s => (LS.t ? LS.t(s) : s);
  const V = { scale: 2, ox: 40, oy: 40, tool: 'seleccionar', drag: null, hover: null, draft: null, preview: null, previewT: 1, snapGrid: false, gridMm: 10 };
  LS.V = V;
  let cv, ctx, W = 0, H = 0, dpr = 1;
  const RULER = 22;
  LS.imgCache = {};

  // coordenadas visibles (máquina) a partir de las internas (y hacia abajo, origen sup-izq)
  LS.toDisp = (x, y) => {
    const d = LS.device, o = d.origen;
    return [o.endsWith('der') ? d.ancho - x : x, o.startsWith('inf') ? d.alto - y : y];
  };
  LS.fromDisp = LS.toDisp; // es su propia inversa

  V.w2s = p => [p[0] * V.scale + V.ox, p[1] * V.scale + V.oy];
  V.s2w = p => [(p[0] - V.ox) / V.scale, (p[1] - V.oy) / V.scale];

  V.init = canvas => {
    cv = canvas; ctx = cv.getContext('2d');
    new ResizeObserver(resize).observe(cv.parentElement); resize();
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    D.on(() => V.redraw());
  };
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (!V._fitted) { V.fitBed(); V._fitted = true; }
    V.redraw();
  }
  V.fitRect = (b, pad = 30) => {
    if (!b || !isFinite(b.w)) return;
    const s = Math.min((W - RULER - pad * 2) / Math.max(b.w, 1), (H - RULER - pad * 2) / Math.max(b.h, 1));
    V.scale = Math.max(0.05, Math.min(200, s));
    V.ox = RULER + (W - RULER) / 2 - (b.x0 + b.w / 2) * V.scale;
    V.oy = RULER + (H - RULER) / 2 - (b.y0 + b.h / 2) * V.scale;
    V.redraw();
  };
  function machinePreset() { return LS.MACHINE_PRESETS[LS.device.modelo] || LS.MACHINE_PRESETS.generico; }
  // Geometría del marco en coordenadas del lienzo (mm, y hacia abajo). Los márgenes se ajustan con el ratón.
  LS.frameGeom = () => {
    const d = LS.device, m = machinePreset(), W = d.ancho, H = d.alto;
    const mg = k => (d[k] != null ? d[k] : (k === 'margenIzq' || k === 'margenDer' ? m.mx : m.my));
    return { W, H, P: 20, x0: -mg('margenIzq'), x1: W + mg('margenDer'), y0: -mg('margenSup'), y1: H + mg('margenInf'), m };
  };
  V.fitBed = () => {
    const d = LS.device, f = LS.frameGeom();
    if (d.verMaquina !== false) V.fitRect({ x0: f.x0, y0: f.y0 - 14, w: f.x1 - f.x0, h: f.y1 - f.y0 + 14 }, 16);
    else V.fitRect({ x0: 0, y0: 0, w: d.ancho, h: d.alto });
  };

  // ---------- Esquema de la máquina (marco, rieles, pórtico, cabezal y escalas) ----------
  // Punto de arranque (cabezal al encender) en coordenadas del lienzo
  LS.startWorld = () => {
    const d = LS.device;
    if (d.refArranque === 'custom' && d.posArranque) return d.posArranque.slice();
    const [v, h] = (d.refArranque || 'inf-izq').split('-');
    return [h === 'izq' ? 0 : h === 'der' ? d.ancho : d.ancho / 2, v === 'sup' ? 0 : v === 'inf' ? d.alto : d.alto / 2];
  };
  // Posición del cabezal en el lienzo según la conexión del rotativo
  function headWorld() {
    const M = LS.machine, R = LS.rotary;
    if (!M || !M.pos) return null;
    if (R.activo) {
      const port = LS.jobs.rotaryAxis();
      if (port === 'Y') return [LS.fromDisp(M.pos[0], 0)[0], LS.device.barraY ?? LS.startWorld()[1]]; // motor Y desconectado: la barra queda donde se ubicó
      if (M.rawPos) return LS.fromDisp(M.rawPos[0], M.rawPos[1]); // conector Z: cabezal físico X/Y
    }
    return LS.fromDisp(M.pos[0], M.pos[1]);
  }
  V.headWorld = headWorld;
  // Rectángulo del módulo láser (mm) para dibujar y para arrastrar
  const moduleRect = (hx, hy) => [hx - 23, hy - 64, hx + 23, hy + 6];
  V.moduleHit = w => {
    if (LS.device.verMaquina === false || V.preview) return false;
    const h = (V.drag && V.drag.type === 'head') ? V.drag.orig : (headWorld() || LS.startWorld());
    const r = moduleRect(h[0], h[1]);
    return w[0] >= r[0] && w[0] <= r[2] && w[1] >= r[1] && w[1] <= r[3];
  };
  // Barra del pórtico (eje Y): arrastrarla mueve solo en Y
  V.beamHit = w => {
    if (LS.device.verMaquina === false || V.preview) return false;
    const f = LS.frameGeom(), h = (V.drag && (V.drag.type === 'head')) ? V.drag.orig : (headWorld() || LS.startWorld());
    const by = h[1] - 38;
    return w[0] >= f.x0 - 4 && w[0] <= f.x1 + 4 && w[1] >= by - 26 && w[1] <= by + 26;
  };
  // Manijas del marco (márgenes) y del área de trabajo
  V.frameSel = false; V.frameHover = null;
  V.frameHandles = () => {
    const f = LS.frameGeom(), d = LS.device, cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    const o = d.origen, ax = o.endsWith('der') ? 0 : f.W, ay = o.startsWith('inf') ? 0 : f.H; // esquina opuesta al origen
    return [
      { id: 'margenIzq', p: [f.x0, cy], t: 'Margen izquierdo del marco' }, { id: 'margenDer', p: [f.x1, cy], t: 'Margen derecho del marco' },
      { id: 'margenSup', p: [cx, f.y0], t: 'Margen superior del marco' }, { id: 'margenInf', p: [cx, f.y1], t: 'Margen inferior del marco' },
      { id: 'area', p: [ax, ay], t: 'Tamaño del área de trabajo (el origen queda fijo)', area: true }
    ];
  };
  V.frameHandleAt = s => {
    if (!V.frameSel || LS.device.verMaquina === false) return null;
    return V.frameHandles().find(h => { const p = V.w2s(h.p); return Math.hypot(p[0] - s[0], p[1] - s[1]) < 9; }) || null;
  };
  V.frameHit = w => {
    if (LS.device.verMaquina === false) return false;
    const f = LS.frameGeom();
    const inOuter = w[0] >= f.x0 && w[0] <= f.x1 && w[1] >= f.y0 && w[1] <= f.y1;
    const inBed = w[0] >= 0 && w[0] <= f.W && w[1] >= 0 && w[1] <= f.H;
    return inOuter && !inBed;
  };
  function rectW(x0, y0, x1, y1) { const a = V.w2s([x0, y0]), b = V.w2s([x1, y1]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; }
  // Escala impresa (como la de los perfiles Two Trees): valores en coordenadas de la máquina
  function drawScale(axis, fixed, from, to, side) {
    const d = LS.device, unidad = d.escala || 'cm'; if (unidad === 'no') return;
    const pxmm = V.scale; if (pxmm < 0.6) return;
    const minor = pxmm >= 4 ? 1 : pxmm >= 1.5 ? 5 : 10, major = 10, label = pxmm >= 2.2 ? 10 : pxmm >= 1.1 ? 50 : 100;
    ctx.save(); ctx.strokeStyle = 'rgba(235,238,244,0.85)'; ctx.fillStyle = 'rgba(235,238,244,0.95)'; ctx.lineWidth = 1;
    ctx.font = `${Math.max(8, Math.min(11, pxmm * 3.2))}px Segoe UI, sans-serif`;
    const lim = axis === 'x' ? d.ancho : d.alto;
    for (let v = 0; v <= lim + 1e-6; v += minor) {
      const w = axis === 'x' ? LS.fromDisp(v, 0)[0] : LS.fromDisp(0, v)[1];
      if (w < from - 1e-6 || w > to + 1e-6) continue;
      const len = (v % major === 0 ? 6 : 3) + (v % 50 === 0 ? 3 : 0);
      const p = axis === 'x' ? V.w2s([w, fixed]) : V.w2s([fixed, w]);
      ctx.beginPath();
      if (axis === 'x') { ctx.moveTo(Math.round(p[0]) + .5, p[1]); ctx.lineTo(Math.round(p[0]) + .5, p[1] + side * len); }
      else { ctx.moveTo(p[0], Math.round(p[1]) + .5); ctx.lineTo(p[0] + side * len, Math.round(p[1]) + .5); }
      ctx.stroke();
      if (v % label === 0) {
        const t = unidad === 'cm' ? String(v / 10).padStart(2, '0') : String(v);
        if (axis === 'x') ctx.fillText(t, p[0] - ctx.measureText(t).width / 2, p[1] + side * (len + 9) + (side < 0 ? 0 : 0));
        else { ctx.save(); ctx.translate(p[0] + side * (len + 3), p[1]); ctx.fillText(t, side < 0 ? -ctx.measureText(t).width : 0, 3.5); ctx.restore(); }
      }
    }
    ctx.restore();
  }
  function drawMachineFrame() {
    const d = LS.device, f = LS.frameGeom(), m = f.m, P = f.P;
    ctx.save();
    if (m.tipo === 'cerrada') {
      const r = rectW(f.x0 - 15, f.y0 - 15, f.x1 + 15, f.y1 + 15);
      ctx.fillStyle = 'rgba(60,66,76,0.22)'; ctx.strokeStyle = 'rgba(40,44,52,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(r[0], r[1], r[2], r[3], 5 * V.scale); ctx.fill(); ctx.stroke();
    }
    // perfiles de aluminio
    ctx.fillStyle = V.frameSel ? 'rgba(90,96,110,0.7)' : 'rgba(70,76,88,0.55)'; ctx.strokeStyle = 'rgba(35,38,45,0.9)'; ctx.lineWidth = 1;
    [[f.x0, f.y0, f.x0 + P, f.y1], [f.x1 - P, f.y0, f.x1, f.y1], [f.x0, f.y0, f.x1, f.y0 + P], [f.x0, f.y1 - P, f.x1, f.y1]].forEach(b => { const r = rectW(...b); ctx.fillRect(...r); ctx.strokeRect(...r); });
    // escalas en los rieles Y (izquierdo y derecho) y en el perfil delantero (X)
    drawScale('y', f.x0 + P - 2, 0, f.H, -1);
    drawScale('y', f.x1 - P + 2, 0, f.H, 1);
    drawScale('x', f.y1 - P + 2, 0, f.W, 1);
    // rótulo
    ctx.fillStyle = 'rgba(210,214,222,0.9)'; ctx.font = '11px Segoe UI, sans-serif';
    const lp = V.w2s([f.x0, f.y0]); ctx.fillText(`${m.ancho ? m.nombre : (d.nombre || T('Máquina'))} · ${T('área')} ${f.W}×${f.H} mm`, lp[0] + 4, lp[1] - 6);
    ctx.restore();
    return f;
  }
  // Origen del trabajo fijado y contorno de dónde se grabará el diseño
  function drawJobOrigin() {
    const o = LS.jobs.options; if (o.origenTrabajo !== 'usuario' || !o.origenUsuario || V.preview) return;
    const ow = LS.fromDisp(o.origenUsuario[0], o.origenUsuario[1]), p = V.w2s(ow);
    const objs = (o.soloSeleccion ? D.selected() : D.objects).filter(x => D.layer(x.layer).salida && D.layer(x.layer).visible);
    ctx.save();
    if (objs.length) {
      const b = D.selBBox(objs), a = LS.jobs.anchorPoint(b, o.ancla), dx = ow[0] - a[0], dy = ow[1] - a[1];
      const r0 = V.w2s([b.x0 + dx, b.y0 + dy]), r1 = V.w2s([b.x1 + dx, b.y1 + dy]);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(255,138,31,0.08)';
      ctx.fillRect(r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1]); ctx.strokeRect(r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1]); ctx.setLineDash([]);
      ctx.fillStyle = '#ff8a1f'; ctx.font = '11px Segoe UI, sans-serif'; ctx.fillText(`${T('se grabará aquí')} (${b.w.toFixed(0)}×${b.h.toFixed(0)} mm)`, r0[0] + 4, r0[1] - 5);
    }
    ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p[0] - 12, p[1]); ctx.lineTo(p[0] + 12, p[1]); ctx.moveTo(p[0], p[1] - 12); ctx.lineTo(p[0], p[1] + 12); ctx.stroke();
    ctx.beginPath(); ctx.rect(p[0] - 5, p[1] - 5, 10, 10); ctx.stroke();
    ctx.fillStyle = '#ff8a1f'; ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.fillText(T('origen'), p[0] + 8, p[1] + 16);
    ctx.restore();
  }
  function drawFrameHandles() {
    const f = LS.frameGeom(); ctx.save();
    if (V.frameSel) {
      const r = rectW(f.x0, f.y0, f.x1, f.y1); ctx.setLineDash([5, 3]); ctx.strokeStyle = '#4ea1ff'; ctx.lineWidth = 1.5; ctx.strokeRect(...r); ctx.setLineDash([]);
      for (const h of V.frameHandles()) {
        const p = V.w2s(h.p); ctx.fillStyle = h.id === V.frameHover ? '#fff' : (h.area ? '#29d65f' : '#4ea1ff'); ctx.strokeStyle = '#123';
        ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10); ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10);
      }
    }
    ctx.restore();
  }
  function drawModule(hx, hy, alpha, borde) {
    ctx.save(); ctx.globalAlpha = alpha;
    const r = rectW(...moduleRect(hx, hy)); ctx.fillStyle = '#2b2f37'; ctx.fillRect(...r); ctx.strokeStyle = borde; ctx.lineWidth = 1.5; ctx.strokeRect(...r);
    const fan = V.w2s([hx, hy - 36]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(fan[0], fan[1], 15 * V.scale, 0, 7); ctx.stroke();
    ctx.restore();
  }
  // Finales de carrera: X en un extremo del pórtico (se mueve con él), Y en el extremo del riel del mismo lado
  function drawTopes(f, beamY) {
    const d = LS.device, izq = (d.topeX || 'izq') === 'izq', inf = (d.topeY || 'inf') === 'inf', P = f.P;
    const pines = (LS.machine && LS.machine.pines) || '';
    const tope = (wx, wy, eje, vertical) => {
      const w = vertical ? 12 : 16, h = vertical ? 16 : 12, r = rectW(wx - w / 2, wy - h / 2, wx + w / 2, wy + h / 2);
      const act = LS.machine && LS.machine.topeActivo ? LS.machine.topeActivo(eje) : pines.includes(eje);
      ctx.fillStyle = act ? '#ff3a2a' : '#111418'; ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 2;
      ctx.fillRect(...r); ctx.strokeRect(...r);
      const p = V.w2s([wx, wy]); ctx.fillStyle = act ? '#ff6b5b' : '#ffb35c'; ctx.font = 'bold 11px Segoe UI, sans-serif';
      const t = `${T('tope')} ${eje}${act ? ' ●' : ''}`, tw = ctx.measureText(t).width;
      ctx.fillText(t, vertical ? (izq ? p[0] + 10 * V.scale + 4 : p[0] - 10 * V.scale - tw - 4) : p[0] - tw / 2, vertical ? p[1] + 4 : p[1] - 9 * V.scale - 4);
    };
    ctx.save();
    tope(izq ? f.x0 + P + 12 : f.x1 - P - 12, beamY, 'X', false);
    tope(izq ? f.x0 + P / 2 : f.x1 - P / 2, inf ? f.y1 - P - 10 : f.y0 + P + 10, 'Y', true);
    // esquina de inicio
    const c = V.w2s([izq ? 0 : f.W, inf ? f.H : 0]);
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c[0], c[1], 9, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffd400'; ctx.font = 'bold 11px Segoe UI, sans-serif';
    const t = T('inicio (0,0)'), tw = ctx.measureText(t).width;
    ctx.fillText(t, izq ? c[0] + 13 : c[0] - tw - 13, inf ? c[1] - 12 : c[1] + 20);
    ctx.restore();
  }
  function drawGantry(f) {
    const M = LS.machine, hw = headWorld(), conectado = !!(M && M.connected), conPos = !!hw;
    const dragging = V.drag && V.drag.type === 'head';
    let [hx, hy] = dragging ? V.drag.orig : (hw || LS.startWorld());
    const fuera = hx < -0.5 || hy < -0.5 || hx > f.W + 0.5 || hy > f.H + 0.5;
    hx = Math.max(0, Math.min(f.W, hx)); hy = Math.max(0, Math.min(f.H, hy));
    ctx.save(); ctx.globalAlpha = conPos ? 0.85 : 0.55;
    const beamY = hy - 38, P = f.P;
    // pórtico X (barra) y carros Y
    let r = rectW(f.x0, beamY - 11, f.x1, beamY + 11); ctx.fillStyle = '#4a515d'; ctx.fillRect(...r); ctx.strokeStyle = '#22262d'; ctx.strokeRect(...r);
    [[f.x0 - 4, f.x0 + 30], [f.x1 - 30, f.x1 + 4]].forEach(([u0, u1]) => { const c = rectW(u0, beamY - 26, u1, beamY + 26); ctx.fillStyle = '#353b45'; ctx.fillRect(...c); ctx.strokeStyle = '#1b1e23'; ctx.strokeRect(...c); });
    ctx.globalAlpha = 1;
    // escala sobre la barra del láser (X)
    drawScale('x', beamY + 10, 0, f.W, -1);
    ctx.restore();
    V._beamY = beamY;
    drawModule(hx, hy, conPos ? 0.88 : 0.6, conPos ? '#ff8a1f' : '#9aa3b2');
    // destino del arrastre
    if (dragging) {
      const [tx, ty] = V.drag.target; drawModule(tx, ty, 0.5, '#29d65f');
      const tp = V.w2s([tx, ty]); ctx.save(); ctx.strokeStyle = '#29d65f'; ctx.setLineDash([4, 3]); const sp = V.w2s([hx, hy]);
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke(); ctx.setLineDash([]);
      const dd = LS.toDisp(tx, ty); ctx.fillStyle = '#29d65f'; ctx.font = 'bold 11px Segoe UI, sans-serif';
      ctx.fillText(`${T(V.drag.accion)} X ${dd[0].toFixed(1)}  Y ${dd[1].toFixed(1)}${V.drag.snap ? ' · ' + T(LS.machine.NOMBRE_REF[V.drag.snap]) : ''}`, tp[0] + 26, tp[1] - 6);
      ctx.restore();
    }
    const lp = V.w2s([hx, hy]);
    ctx.save(); ctx.fillStyle = conPos ? '#ff3a2a' : '#888'; ctx.beginPath(); ctx.arc(lp[0], lp[1], 3.5, 0, 7); ctx.fill();
    if (conPos && fuera) { ctx.fillStyle = '#ff8080'; ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.fillText(T('posición del controlador fuera del área: ubique el módulo con «Solo ubicar»'), lp[0] + 26, lp[1] + 14); }
    if (!conPos) { ctx.fillStyle = 'rgba(200,205,215,0.9)'; ctx.font = '11px Segoe UI, sans-serif'; ctx.fillText(T(conectado ? 'esperando posición del controlador…' : 'posición de arranque (arrastre para cambiarla)'), lp[0] + 26, lp[1] + 14); }
    ctx.restore();
    // aviso: con el rotativo en el conector Y la barra no se mueve
    V._badge = null;
    if (LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y') {
      const t = T('🔒 Barra fija: el conector Y está asignado al rotativo — clic aquí para desactivarlo');
      ctx.save(); ctx.font = 'bold 11px Segoe UI, sans-serif';
      const p = V.w2s([Math.min(hx + 30, f.x1 - 40), beamY]), tw = ctx.measureText(t).width + 14;
      ctx.fillStyle = 'rgba(120,70,0,0.92)'; ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(p[0], p[1] - 30, tw, 20, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe2a8'; ctx.fillText(t, p[0] + 7, p[1] - 16);
      V._badge = [p[0], p[1] - 30, tw, 20];
      ctx.restore();
    }
  }

  let raf = 0;
  V.redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--canvas-bg'); ctx.fillRect(0, 0, W, H);
    const d = LS.device;
    // mesa
    const a = V.w2s([0, 0]), b = V.w2s([d.ancho, d.alto]);
    ctx.fillStyle = css('--bed'); ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    // cuadrícula
    let step = 10; while (step * V.scale < 14) step *= 2; while (step * V.scale > 80 && step > 1) step /= 2;
    ctx.lineWidth = 1;
    for (let x = 0; x <= d.ancho + 1e-6; x += step) {
      ctx.strokeStyle = (Math.round(x) % (step * 5) === 0) ? css('--grid-major') : css('--grid');
      const s = V.w2s([x, 0])[0]; ctx.beginPath(); ctx.moveTo(Math.round(s) + .5, a[1]); ctx.lineTo(Math.round(s) + .5, b[1]); ctx.stroke();
    }
    for (let y = 0; y <= d.alto + 1e-6; y += step) {
      ctx.strokeStyle = (Math.round(y) % (step * 5) === 0) ? css('--grid-major') : css('--grid');
      const s = V.w2s([0, y])[1]; ctx.beginPath(); ctx.moveTo(a[0], Math.round(s) + .5); ctx.lineTo(b[0], Math.round(s) + .5); ctx.stroke();
    }
    ctx.strokeStyle = css('--bed-border'); ctx.strokeRect(a[0] + .5, a[1] + .5, b[0] - a[0], b[1] - a[1]);
    // marcador del origen de la máquina
    const o = d.origen, op = V.w2s([o.endsWith('der') ? d.ancho : 0, o.startsWith('inf') ? d.alto : 0]);
    ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.arc(op[0], op[1], 5, 0, 7); ctx.fill();
    // punto de referencia para "Fijar origen aquí"
    if (LS.machine && LS.machine.refPoint) {
      const rp = V.w2s(LS.machine.refPoint(d.refOrigen || d.origen).world);
      ctx.save(); ctx.strokeStyle = '#29d65f'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rp[0], rp[1], 11, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(rp[0] - 15, rp[1]); ctx.lineTo(rp[0] + 15, rp[1]); ctx.moveTo(rp[0], rp[1] - 15); ctx.lineTo(rp[0], rp[1] + 15); ctx.stroke();
      ctx.restore();
    }

    // esquema de la máquina: marco y rieles debajo de todo
    const verMaq = LS.device.verMaquina !== false && !V.preview;
    const marco = verMaq ? drawMachineFrame() : null;
    // esquema del rotativo (debajo de los objetos)
    if (LS.rotary.activo && LS.rotary.mostrar !== false) drawRotary();

    // objetos
    if (!V.preview) {
      const ordered = D.objects.slice();
      for (const obj of ordered) drawObject(obj);
    } else drawPreview();

    drawZona();
    // selección
    const sel = D.selected();
    if (sel.length && !V.preview) drawSelection(sel);
    // borrador de herramienta
    if (V.draft) drawDraft();
    // marquesina
    if (V.drag && V.drag.type === 'marquee') {
      const m = V.drag; const p0 = V.w2s(m.start), p1 = V.w2s(m.cur);
      ctx.save(); ctx.strokeStyle = m.cur[0] < m.start[0] ? '#37c45a' : '#4ea1ff'; ctx.setLineDash(m.cur[0] < m.start[0] ? [5, 4] : []);
      ctx.fillStyle = 'rgba(78,161,255,0.08)'; ctx.fillRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]); ctx.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]); ctx.restore();
    }
    // pórtico y cabezal por encima del diseño (semitransparentes)
    if (marco) { drawGantry(marco); if (LS.device.finalesCarrera && LS.device.tipo !== 'ruida') drawTopes(marco, V._beamY); drawFrameHandles(); }
    drawJobOrigin();
    // posición del láser
    if (LS.machine && LS.machine.pos) {
      // el punto verde es siempre el láser; con rotativo se indica el giro en el objeto con una marca naranja
      let mp = headWorld() || LS.fromDisp(LS.machine.pos[0], LS.machine.pos[1]), angTxt = null;
      mp = [Math.max(0, Math.min(LS.device.ancho, mp[0])), Math.max(0, Math.min(LS.device.alto, mp[1]))];
      if (LS.rotary.activo) {
        const r = V.rotaryDot(LS.machine.pos); angTxt = r.ang;
        if (LS.rotary.mostrar !== false) { const q = V.w2s(r.w); ctx.save(); ctx.strokeStyle = '#ff8a1f'; ctx.fillStyle = 'rgba(255,138,31,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff8a1f'; ctx.font = 'bold 10px Segoe UI, sans-serif'; ctx.fillText(`${r.ang.toFixed(0)}°`, q[0] + 9, q[1] + 4); ctx.restore(); }
      }
      const s = V.w2s(mp); ctx.strokeStyle = '#29d65f'; ctx.lineWidth = 2;
      if (angTxt != null) { ctx.fillStyle = '#29d65f'; ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.fillText(`${T('giro')} ${angTxt.toFixed(0)}°`, s[0] + 10, s[1] - 8); }
      ctx.beginPath(); ctx.moveTo(s[0] - 8, s[1]); ctx.lineTo(s[0] + 8, s[1]); ctx.moveTo(s[0], s[1] - 8); ctx.lineTo(s[0], s[1] + 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
    drawRulers();
  }

  // ---------- Esquema del rotativo ----------
  // Devuelve la geometría (mm, coordenadas internas) según la configuración actual.
  LS.rotaryGeom = () => {
    const R = LS.rotary, d = LS.device;
    const vertical = LS.jobs.rotaryOrient() === 'vertical';
    const c = [R.posX ?? d.ancho / 2, R.posY ?? d.alto / 2];
    const u = vertical ? [0, 1] : [1, 0], v = vertical ? [-1, 0] : [0, 1];
    const rect = (lu, lv, du = 0, dv = 0) => { // rectángulo centrado en c desplazado du (eje) y dv (transversal)
      const pts = [[-lu / 2, -lv / 2], [lu / 2, -lv / 2], [lu / 2, lv / 2], [-lu / 2, lv / 2]];
      return pts.map(([a, b]) => [c[0] + u[0] * (a + du) + v[0] * (b + dv), c[1] + u[1] * (a + du) + v[1] * (b + dv)]);
    };
    const lm = R.largoModulo || 250, am = R.anchoModulo || 110, lo = R.largoObjeto || 200;
    const cono = R.forma === 'cono', d1 = R.diamObjeto || 50, d2 = cono ? (R.diamObjeto2 || d1) : d1, dobj = Math.max(d1, d2);
    const circ = Math.PI * dobj;
    // trapecio a lo largo del eje: ancho w1 en el extremo inicial y w2 en el final
    const trap = (w1, w2) => [[-lo / 2, -w1 / 2], [lo / 2, -w2 / 2], [lo / 2, w2 / 2], [-lo / 2, w1 / 2]].map(([a, b]) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b]);
    const g = { c, u, v, vertical, circ, lm, am, lo, dobj, d1, d2, cono, base: rect(lm, am), objeto: trap(d1, d2), area: trap(Math.PI * d1, Math.PI * d2), partes: [] };
    if (R.tipo === 'mandril') {
      const dm = Math.max(dobj * 1.25, 50);
      g.partes.push({ tipo: 'mandril', pts: rect(30, dm, -lm / 2 + 20) }, { tipo: 'contrapunta', pts: rect(22, 34, lm / 2 - 15) });
    } else {
      const dr = R.diamRodillo || 18, sep = R.sepRodillos ? R.sepRodillos / 2 : Math.max(dobj * 0.42, dr * 0.9, am * 0.18);
      g.sep = sep;
      [-1, 1].forEach(k => g.partes.push({ tipo: 'rodillo', pts: rect(lm * 0.86, dr, 0, k * sep) }));
    }
    const P = (a, b) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b];
    g.P = P;
    // manijas de edición con el ratón
    g.manijas = [
      { id: 'lm', p: P(lm / 2, 0), t: 'Largo del módulo' },
      { id: 'am', p: P(0, am / 2), t: 'Ancho del módulo' },
      { id: 'lo', p: P(lo / 2, -(Math.max(d1, d2) / 2) - 6), t: 'Largo del objeto' },
      { id: 'd1', p: P(-lo / 2, d1 / 2), t: cono ? 'Ø extremo inicial' : 'Diámetro del objeto' },
      ...(cono ? [{ id: 'd2', p: P(lo / 2, d2 / 2), t: 'Ø extremo final' }] : []),
      ...(R.tipo !== 'mandril' ? [{ id: 'sep', p: P(-lm * 0.43, -(g.sep || 0)), t: 'Distancia entre rodillos' }] : []),
      { id: 'orient', p: P(-lm / 2 - 10, -am / 2 - 10), t: 'Girar orientación 90°', redonda: true }
    ];
    // línea del láser: la generatriz superior del objeto (el láser queda fijo sobre ella)
    g.linea = [[c[0] - u[0] * lo / 2, c[1] - u[1] * lo / 2], [c[0] + u[0] * lo / 2, c[1] + u[1] * lo / 2]];
    return g;
  };
  V.rotarySel = false; V.rotaryHover = null;
  V.rotaryHandleAt = s => {
    if (!V.rotarySel || !LS.rotary.activo || LS.rotary.mostrar === false) return null;
    return LS.rotaryGeom().manijas.find(m => { const p = V.w2s(m.p); return Math.hypot(p[0] - s[0], p[1] - s[1]) < 9; }) || null;
  };
  // Punto verde en rotativo: el eje lineal sale de la máquina y el giro se dibuja dentro de la
  // circunferencia del objeto (va y viene alrededor de la línea del láser, sin salir del lienzo)
  V.rotaryDot = pos => {
    const g = LS.rotaryGeom(), R = LS.rotary, d = LS.device;
    const vert = g.vertical, rotIdx = vert ? 0 : 1;
    const lin = LS.fromDisp(pos[0], pos[1]);
    const along = vert ? lin[1] : lin[0];
    const L = (vert ? along - (g.c[1] - g.lo / 2) : along - (g.c[0] - g.lo / 2));
    const dL = g.cono ? g.d1 + (g.d2 - g.d1) * Math.max(0, Math.min(1, L / g.lo)) : g.dobj;
    const circ = Math.PI * dL;
    // signo: avanzar en + del eje de la máquina va "hacia arriba" del diseño
    const sign = rotIdx === 1 ? (d.origen.startsWith('inf') ? -1 : 1) : (d.origen.endsWith('der') ? -1 : 1);
    // giro relativo: 0° es la posición del objeto al activar el rotativo (o al pulsar «Giro a 0°»)
    const sup = pos[rotIdx] - (LS.machine.rotCero || 0);
    let a = sup % circ; if (a > circ / 2) a -= circ; if (a < -circ / 2) a += circ;
    const w = vert ? [g.c[0] + sign * a, along] : [along, g.c[1] + sign * a];
    let ang = (sup / circ * 360) % 360; if (ang < 0) ang += 360; if (ang > 359.5) ang = 0;
    return { w, ang, sup };
  };
  V.rotaryHit = w => {
    if (!LS.rotary.activo || LS.rotary.mostrar === false) return false;
    return G.pointInPoly(w, LS.rotaryGeom().base);
  };
  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => { const s = V.w2s(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }
  function drawRotary() {
    const g = LS.rotaryGeom(), R = LS.rotary;
    ctx.save();
    // base del módulo
    poly(g.base); ctx.fillStyle = 'rgba(80,90,105,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(70,80,95,0.75)'; ctx.setLineDash([]); ctx.lineWidth = 1.2; ctx.stroke();
    // rodillos / mandril
    for (const p of g.partes) {
      poly(p.pts);
      ctx.fillStyle = p.tipo === 'rodillo' ? 'rgba(40,40,45,0.55)' : 'rgba(60,64,72,0.7)'; ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,25,0.8)'; ctx.stroke();
      if (p.tipo === 'rodillo') { // anillos de goma
        const a = p.pts[0], b = p.pts[1], d3 = p.pts[3]; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        for (let k = 1; k < 8; k++) { const t = k / 8; const s0 = V.w2s([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), s1 = V.w2s([d3[0] + (b[0] - a[0]) * t, d3[1] + (b[1] - a[1]) * t]); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); }
      }
    }
    // objeto (vista superior) con sombreado cilíndrico
    poly(g.objeto);
    const s0 = V.w2s([g.c[0] - g.v[0] * g.dobj / 2, g.c[1] - g.v[1] * g.dobj / 2]), s1 = V.w2s([g.c[0] + g.v[0] * g.dobj / 2, g.c[1] + g.v[1] * g.dobj / 2]);
    const gr = ctx.createLinearGradient(s0[0], s0[1], s1[0], s1[1]);
    gr.addColorStop(0, 'rgba(120,150,190,0.35)'); gr.addColorStop(0.5, 'rgba(220,235,255,0.45)'); gr.addColorStop(1, 'rgba(120,150,190,0.35)');
    ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = 'rgba(60,100,160,0.9)'; ctx.stroke();
    // área de grabado desarrollada
    poly(g.area); ctx.setLineDash([7, 4]); ctx.strokeStyle = '#d68a00'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    // línea del láser
    const l0 = V.w2s(g.linea[0]), l1 = V.w2s(g.linea[1]);
    ctx.strokeStyle = 'rgba(230,40,40,0.85)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke(); ctx.setLineDash([]);
    // flecha de giro
    const e = V.w2s([g.c[0] + g.u[0] * (g.lo / 2 + 8), g.c[1] + g.u[1] * (g.lo / 2 + 8)]);
    ctx.strokeStyle = '#d68a00'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(e[0], e[1], 9, -Math.PI * 0.8, Math.PI * 0.6); ctx.stroke();
    // etiquetas
    const P = LS.ROTARY_PRESETS[R.modelo];
    const lab = V.w2s(g.base.reduce((m, p) => (p[0] + p[1] < m[0] + m[1] ? p : m)));
    const lines = [
      `${P ? T(P.nombre) : T('Rotativo')} · ${T('puerto')} ${LS.jobs.rotaryAxis()} · ${T(g.vertical ? 'eje vertical' : 'eje horizontal')}`,
      `${T('Módulo')} ≈ ${g.lm} × ${g.am} mm · ${g.cono ? `${T('cono')} Ø${g.d1}→Ø${g.d2}` : `${T('objeto')} Ø${g.dobj}`} × ${g.lo} mm`,
      g.cono ? `${T('Área desarrollada')}: ${g.lo} mm · ${T('contorno')} ${(Math.PI * g.d1).toFixed(1)}→${(Math.PI * g.d2).toFixed(1)} mm`
        : `${T('Área de grabado (desarrollada)')}: ${g.vertical ? `${g.circ.toFixed(1)} × ${g.lo}` : `${g.lo} × ${g.circ.toFixed(1)}`} mm`
    ];
    ctx.font = '11px Segoe UI, sans-serif'; const tw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 12;
    const ty = Math.max(RULER + 4, lab[1] - 52);
    ctx.fillStyle = 'rgba(29,32,38,0.86)'; ctx.fillRect(lab[0], ty, tw, 46);
    ctx.fillStyle = '#ffd08a'; lines.forEach((t, i) => ctx.fillText(t, lab[0] + 6, ty + 14 + i * 14));
    if (R.tipo !== 'mandril' && g.sep) { ctx.fillStyle = '#ffd08a'; const sp = V.w2s(g.P(0, -(g.sep) - 8)); ctx.fillText(`${T('rodillos a')} ${(g.sep * 2).toFixed(0)} mm`, sp[0] - 34, sp[1]); }
    if (V.rotarySel) {
      poly(g.base); ctx.setLineDash([5, 3]); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      for (const m of g.manijas) {
        const p = V.w2s(m.p); ctx.fillStyle = m.id === V.rotaryHover ? '#fff' : '#ffb020'; ctx.strokeStyle = '#7a4a00';
        if (m.redonda) { ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3a2400'; ctx.font = 'bold 11px Segoe UI'; ctx.fillText('⟳', p[0] - 4.5, p[1] + 4); }
        else { ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10); ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10); }
      }
    }
    ctx.restore();
  }

  function layerColor(i) { return D.layer(i).color; }
  function drawObject(obj) {
    const L = D.layer(obj.layer);
    if (!L.visible) return;
    if (obj.kind === 'image') {
      const img = LS.imageFor(obj);
      if (img) {
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const m = obj.tx;
        ctx.transform(m[0] * V.scale, m[1] * V.scale, m[2] * V.scale, m[3] * V.scale, m[4] * V.scale + V.ox, m[5] * V.scale + V.oy);
        ctx.imageSmoothingEnabled = V.scale * obj.w / img.width < 3;
        ctx.globalAlpha = 0.95; ctx.drawImage(img, 0, 0, obj.w, obj.h); ctx.restore();
      }
      const wp = D.worldPaths(obj)[0].pts.map(V.w2s);
      ctx.strokeStyle = L.color; ctx.setLineDash([4, 3]); ctx.beginPath(); wp.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    const paths = D.worldPaths(obj);
    ctx.beginPath();
    for (const p of paths) {
      p.pts.forEach((q, i) => { const s = V.w2s(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
      if (p.closed) ctx.closePath();
    }
    if (L.modo === 'relleno') { ctx.fillStyle = hexA(L.color, 0.28); ctx.fill('evenodd'); }
    ctx.strokeStyle = L.color; ctx.lineWidth = V.hover === obj.id ? 2 : 1.2; ctx.stroke(); ctx.lineWidth = 1;
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // --- Selección y manijas ---
  V.handles = () => {
    const b = D.selBBox(); if (!b) return [];
    const p0 = V.w2s([b.x0, b.y0]), p1 = V.w2s([b.x1, b.y1]);
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    return [
      { id: 'nw', x: p0[0], y: p0[1], ax: b.x1, ay: b.y1 }, { id: 'n', x: mx, y: p0[1], ax: null, ay: b.y1 },
      { id: 'ne', x: p1[0], y: p0[1], ax: b.x0, ay: b.y1 }, { id: 'e', x: p1[0], y: my, ax: b.x0, ay: null },
      { id: 'se', x: p1[0], y: p1[1], ax: b.x0, ay: b.y0 }, { id: 's', x: mx, y: p1[1], ax: null, ay: b.y0 },
      { id: 'sw', x: p0[0], y: p1[1], ax: b.x1, ay: b.y0 }, { id: 'w', x: p0[0], y: my, ax: b.x1, ay: null },
      { id: 'rot', x: mx, y: p0[1] - 24, ax: (b.x0 + b.x1) / 2, ay: (b.y0 + b.y1) / 2 }
    ];
  };
  function drawSelection(sel) {
    const b = D.selBBox(sel); if (!b) return;
    const p0 = V.w2s([b.x0, b.y0]), p1 = V.w2s([b.x1, b.y1]);
    ctx.save(); ctx.strokeStyle = '#4ea1ff'; ctx.setLineDash([5, 3]); ctx.strokeRect(p0[0] - .5, p0[1] - .5, p1[0] - p0[0] + 1, p1[1] - p0[1] + 1); ctx.setLineDash([]);
    for (const o of sel) { if (o.kind !== 'image') { ctx.strokeStyle = 'rgba(78,161,255,0.9)'; ctx.beginPath(); D.worldPaths(o).forEach(p => { p.pts.forEach((q, i) => { const s = V.w2s(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); if (p.closed) ctx.closePath(); }); ctx.stroke(); } }
    for (const h of V.handles()) {
      ctx.fillStyle = h.id === 'rot' ? '#ffb020' : '#fff'; ctx.strokeStyle = '#2a6fd6';
      if (h.id === 'rot') { ctx.beginPath(); ctx.moveTo((p0[0] + p1[0]) / 2, p0[1]); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(h.x - 4, h.y - 4, 8, 8); ctx.strokeRect(h.x - 4, h.y - 4, 8, 8); }
    }
    ctx.restore();
  }

  // Zona parcial: fuera del recuadro se oscurece; el diseño queda intacto
  function drawZona() {
    const z = LS.jobs.options.zona; if (!z) return;
    const a = V.w2s([z.x0, z.y0]), b = V.w2s([z.x1, z.y1]);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, h); ctx.fill('evenodd');
    ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]); ctx.font = 'bold 11px Segoe UI, sans-serif'; const t = LS.t ? LS.t('Zona parcial: solo se graba esto') : 'Zona parcial: solo se graba esto';
    const tw = ctx.measureText(t).width + 10; ctx.fillStyle = '#ff9a1f'; ctx.fillRect(x, y - 17, tw, 16); ctx.fillStyle = '#1a1a1a'; ctx.fillText(t, x + 5, y - 5);
    ctx.restore();
  }
  function drawDraft() {
    const d = V.draft; ctx.save(); ctx.strokeStyle = layerColor(D.currentLayer); ctx.setLineDash([4, 3]);
    if (d.pts) { ctx.beginPath(); d.pts.concat(d.cur ? [d.cur] : []).forEach((q, i) => { const s = V.w2s(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
    if (d.zona) { const a = V.w2s(d.start), b = V.w2s(d.cur); ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.fillStyle = 'rgba(255,154,31,0.10)'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    if (d.shape) { const ps = LS.shapePaths(d.shape, d.start, d.cur, d.shift); ctx.beginPath(); ps.forEach(p => { p.pts.forEach((q, i) => { const s = V.w2s(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }); ctx.stroke(); }
    ctx.restore();
  }

  // --- Reglas ---
  function drawRulers() {
    ctx.fillStyle = css('--ruler'); ctx.fillRect(0, 0, W, RULER); ctx.fillRect(0, 0, RULER, H);
    ctx.strokeStyle = css('--ruler-tick'); ctx.fillStyle = css('--ruler-text'); ctx.font = '10px Segoe UI, sans-serif';
    let step = 10; while (step * V.scale < 50) step *= 2; while (step * V.scale > 140 && step > 1) step /= 2;
    const w0 = V.s2w([RULER, RULER]), w1 = V.s2w([W, H]);
    for (let x = Math.floor(w0[0] / step) * step; x <= w1[0]; x += step) {
      const s = V.w2s([x, 0])[0]; if (s < RULER) continue;
      ctx.beginPath(); ctx.moveTo(s + .5, RULER - 8); ctx.lineTo(s + .5, RULER); ctx.stroke();
      ctx.fillText(String(Math.round(LS.toDisp(x, 0)[0] * 10) / 10), s + 3, 11);
    }
    for (let y = Math.floor(w0[1] / step) * step; y <= w1[1]; y += step) {
      const s = V.w2s([0, y])[1]; if (s < RULER) continue;
      ctx.beginPath(); ctx.moveTo(RULER - 8, s + .5); ctx.lineTo(RULER, s + .5); ctx.stroke();
      ctx.save(); ctx.translate(11, s - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(Math.round(LS.toDisp(0, y)[1] * 10) / 10), 0, 0); ctx.restore();
    }
    ctx.fillStyle = css('--ruler'); ctx.fillRect(0, 0, RULER, RULER);
  }

  // --- Vista previa de trayectorias ---
  function drawPreview() {
    const P = V.preview; if (!P) return;
    const n = Math.floor(P.moves.length * V.previewT);
    ctx.lineWidth = 1;
    let last = null;
    for (let i = 0; i < n; i++) {
      const m = P.moves[i];
      const a = V.w2s(m.a), b = V.w2s(m.b);
      if (m.on) { ctx.strokeStyle = m.color; ctx.globalAlpha = 0.25 + 0.75 * (m.p ?? 1); }
      else { if (!P.showTravel) continue; ctx.strokeStyle = 'rgba(230,60,60,0.55)'; ctx.globalAlpha = 1; ctx.setLineDash([3, 3]); }
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      last = b;
    }
    ctx.globalAlpha = 1;
    if (last) { ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(last[0], last[1], 4, 0, 7); ctx.fill(); }
  }

  // --- Detección ---
  V.hitTest = (w, tolPx = 5) => {
    const tol = tolPx / V.scale;
    for (let i = D.objects.length - 1; i >= 0; i--) {
      const o = D.objects[i]; if (!D.layer(o.layer).visible) continue;
      const paths = D.worldPaths(o);
      if (o.kind === 'image') { if (G.pointInPoly(w, paths[0].pts)) return o; continue; }
      const L = D.layer(o.layer);
      for (const p of paths) {
        for (let j = 1; j < p.pts.length; j++) if (G.distSeg(w, p.pts[j - 1], p.pts[j]) < tol) return o;
        if (p.closed && p.pts.length > 2 && G.distSeg(w, p.pts[p.pts.length - 1], p.pts[0]) < tol) return o;
      }
      if (L.modo === 'relleno' || o.kind === 'text') { let inside = false; for (const p of paths) if (p.closed && G.pointInPoly(w, p.pts)) inside = !inside; if (inside) return o; }
    }
    return null;
  };

  function snap(w) { if (!V.snapGrid) return w; const g = V.gridMm; return [Math.round(w[0] / g) * g, Math.round(w[1] / g) * g]; }

  // --- Ratón ---
  let spaceDown = false;
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; cv.style.cursor = ''; } });

  function evPos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  function onDown(e) {
    const s = evPos(e), w = V.s2w(s);
    cv.focus();
    if (e.button === 1 || e.button === 2 && V.tool === 'seleccionar' && false || spaceDown) { V.drag = { type: 'pan', s, ox: V.ox, oy: V.oy }; return; }
    if (e.button !== 0) return;
    if (V.preview) return;
    const t = V.tool;
    if (t === 'seleccionar') {
      for (const h of V.handles()) {
        if (Math.hypot(h.x - s[0], h.y - s[1]) < 8) {
          D.checkpoint();
          V.drag = { type: h.id === 'rot' ? 'rotate' : 'scale', h, start: w, bbox: D.selBBox(), orig: D.selected().map(o => [o, o.tx.slice()]) };
          return;
        }
      }
      if (V._badge) { const [bx, by, bw, bh] = V._badge; if (s[0] >= bx && s[0] <= bx + bw && s[1] >= by && s[1] <= by + bh) { LS.ui.offerDisableRotary(); return; } }
      const fh = V.frameHandleAt(s);
      if (fh) { V.drag = { type: 'frameHandle', h: fh, start: w, orig: { ancho: LS.device.ancho, alto: LS.device.alto } }; return; }
      const enModulo = V.moduleHit(w), enBarra = !enModulo && V.beamHit(w);
      if (enModulo || enBarra) {
        if (enBarra && LS.machine.connected && LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y') { LS.ui.toast('Con el rotativo en el conector Y, el motor Y del pórtico está desconectado: la barra no se mueve.', 'err'); return; }
        const h = headWorld() || LS.startWorld();
        V.frameSel = false; V.rotarySel = false;
        V.drag = { type: 'head', start: w, orig: h.slice(), target: h.slice(), accion: '', soloY: enBarra };
        updHeadDrag(w, e); V.redraw(); return;
      }
      const rh = V.rotaryHandleAt(s);
      if (rh) {
        if (rh.id === 'orient') { LS.ui.toggleRotaryOrient(); return; }
        V.drag = { type: 'rotaryHandle', h: rh }; return;
      }
      const hit = V.hitTest(w);
      if (hit) V.rotarySel = false;
      if (hit) {
        const members = D.groupMembers(hit);
        if (e.shiftKey) { const has = D.selection.has(hit.id); members.forEach(m => has ? D.selection.delete(m.id) : D.selection.add(m.id)); }
        else if (!D.selection.has(hit.id)) { D.selection.clear(); members.forEach(m => D.selection.add(m.id)); }
        D.checkpoint();
        V.drag = { type: 'move', start: w, orig: D.selected().map(o => [o, o.tx.slice()]), moved: false };
        D.changed('sel');
      } else if (!e.shiftKey && !V.rotaryHit(w) && V.frameHit(w)) {
        V.frameSel = true; V.rotarySel = false; D.selection.clear(); D.changed('sel');
        LS.ui.msg('Marco seleccionado: use las manijas azules para ajustar el marco a su máquina y la verde para el tamaño del área de trabajo.');
      } else if (!e.shiftKey && V.rotaryHit(w)) {
        V.frameSel = false;
        const g = LS.rotaryGeom();
        V.rotarySel = true; D.selection.clear(); D.changed('sel');
        V.drag = { type: 'rotary', start: w, orig: g.c.slice() };
        LS.ui.msg('Esquema del rotativo seleccionado: arrastre para moverlo o use las manijas naranjas para ajustar medidas, distancia entre rodillos y orientación.');
      } else {
        V.rotarySel = false; V.frameSel = false;
        if (!e.shiftKey) D.selection.clear();
        V.drag = { type: 'marquee', start: w, cur: w, add: e.shiftKey };
        D.changed('sel');
      }
      return;
    }
    if (t === 'linea') {
      const p = snap(w);
      if (!V.draft) V.draft = { pts: [p], cur: p };
      else {
        const first = V.draft.pts[0];
        if (V.draft.pts.length > 2 && Math.hypot((first[0] - p[0]) * V.scale, (first[1] - p[1]) * V.scale) < 8) { finishPolyline(true); return; }
        V.draft.pts.push(p);
      }
      V.redraw(); return;
    }
    if (t === 'zona') { V.draft = { zona: true, start: w, cur: w }; V.drag = { type: 'zona' }; return; }
    if (t === 'rect' || t === 'elipse' || t === 'poligono') { V.draft = { shape: t, start: snap(w), cur: snap(w) }; V.drag = { type: 'shape' }; return; }
    if (t === 'texto') { LS.ui.createTextAt(w); return; }
    if (t === 'origenUsuario') { LS.ui.setUserOrigin(w); return; }
  }
  function finishPolyline(closed) {
    const d = V.draft; V.draft = null;
    if (!d || d.pts.length < 2) { V.redraw(); return; }
    D.checkpoint(); D.selection.clear();
    D.add({ kind: 'path', paths: [{ pts: d.pts, closed }] });
    D.changed();
  }
  V.finishPolyline = finishPolyline;

  function onMove(e) {
    if (!cv) return;
    const s = evPos(e), w = V.s2w(s);
    const disp = LS.toDisp(w[0], w[1]);
    LS.ui && LS.ui.status(`X: ${disp[0].toFixed(2)}  Y: ${disp[1].toFixed(2)} mm`);
    const dr = V.drag;
    if (V.draft && V.draft.pts) { V.draft.cur = snap(w); if (e.shiftKey) { const l = V.draft.pts[V.draft.pts.length - 1]; if (Math.abs(w[0] - l[0]) > Math.abs(w[1] - l[1])) V.draft.cur = [V.draft.cur[0], l[1]]; else V.draft.cur = [l[0], V.draft.cur[1]]; } V.redraw(); }
    if (!dr) {
      if (e.target === cv && V.tool === 'seleccionar') {
        const h = V.handles().find(h => Math.hypot(h.x - s[0], h.y - s[1]) < 8);
        cv.style.cursor = spaceDown ? 'grab' : h ? (h.id === 'rot' ? 'crosshair' : ({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' })[h.id]) : '';
        const hov = V.hitTest(w); const id = hov ? hov.id : null; if (id !== V.hover) { V.hover = id; V.redraw(); }
        const fh = V.frameHandleAt(s); const fid = fh ? fh.id : null;
        if (fid !== V.frameHover) { V.frameHover = fid; V.redraw(); }
        const rh = fh ? null : V.rotaryHandleAt(s); const rid = rh ? rh.id : null;
        if (rid !== V.rotaryHover) { V.rotaryHover = rid; V.redraw(); }
        if (fh) { cv.style.cursor = fh.area ? 'nwse-resize' : (/Izq|Der/.test(fh.id) ? 'ew-resize' : 'ns-resize'); cv.title = fh.t; }
        else if (rh) { cv.style.cursor = rh.redonda ? 'pointer' : 'grab'; cv.title = rh.t; }
        else if (!h && !spaceDown && V.moduleHit(w)) { cv.style.cursor = 'grab'; cv.title = LS.machine.connected ? 'Arrastre para mover el cabezal (Mayús: indicar dónde está sin moverlo)' : 'Arrastre para fijar la posición de arranque'; }
        else { cv.title = ''; if (!h && !hov && !spaceDown && V.rotaryHit(w)) cv.style.cursor = 'move'; }
      }
      return;
    }
    if (dr.type === 'pan') { V.ox = dr.ox + s[0] - dr.s[0]; V.oy = dr.oy + s[1] - dr.s[1]; V.redraw(); return; }
    if (dr.type === 'marquee') { dr.cur = w; V.redraw(); return; }
    if (dr.type === 'head') { updHeadDrag(w, e); V.redraw(); return; }
    if (dr.type === 'frameHandle') {
      const d = LS.device, f = LS.frameGeom(), h = dr.h.id, r1 = x => Math.max(0, Math.round(x));
      if (h === 'margenIzq') d.margenIzq = r1(-w[0]);
      if (h === 'margenDer') d.margenDer = r1(w[0] - f.W);
      if (h === 'margenSup') d.margenSup = r1(-w[1]);
      if (h === 'margenInf') d.margenInf = r1(w[1] - f.H);
      if (h === 'area') {
        const o = d.origen, sx = o.endsWith('der') ? -1 : 1, sy = o.startsWith('inf') ? -1 : 1;
        const ox = o.endsWith('der') ? dr.orig.ancho : 0, oy = o.startsWith('inf') ? dr.orig.alto : 0; // esquina de origen (fija) en coordenadas al empezar
        const s0 = dr.start;
        d.ancho = Math.max(20, Math.round(dr.orig.ancho + sx * (w[0] - s0[0])));
        d.alto = Math.max(20, Math.round(dr.orig.alto + sy * (w[1] - s0[1])));
        LS.ui.status(`Área de trabajo ${d.ancho} × ${d.alto} mm`);
      } else LS.ui.status(`${dr.h.t}: ${d[h]} mm`);
      V.redraw(); return;
    }
    if (dr.type === 'rotaryHandle') {
      const g = LS.rotaryGeom(), R = LS.rotary, h = dr.h.id;
      const du = (w[0] - g.c[0]) * g.u[0] + (w[1] - g.c[1]) * g.u[1], dv = (w[0] - g.c[0]) * g.v[0] + (w[1] - g.c[1]) * g.v[1];
      const r1 = x => Math.round(x * 2) / 2; // pasos de 0.5 mm
      let info = '';
      if (h === 'lm') { R.largoModulo = Math.max(40, r1(Math.abs(du) * 2)); info = `Largo del módulo ${R.largoModulo} mm`; }
      if (h === 'am') { R.anchoModulo = Math.max(30, r1(Math.abs(dv) * 2)); info = `Ancho del módulo ${R.anchoModulo} mm`; }
      if (h === 'lo') { R.largoObjeto = Math.max(5, r1(Math.abs(du) * 2)); info = `Largo del objeto ${R.largoObjeto} mm`; }
      if (h === 'd1') { R.diamObjeto = Math.max(2, r1(Math.abs(dv) * 2)); info = `${R.forma === 'cono' ? 'Ø inicial' : 'Ø objeto'} ${R.diamObjeto} mm · circunferencia ${(Math.PI * R.diamObjeto).toFixed(1)} mm`; }
      if (h === 'd2') { R.diamObjeto2 = Math.max(2, r1(Math.abs(dv) * 2)); info = `Ø final ${R.diamObjeto2} mm · circunferencia ${(Math.PI * R.diamObjeto2).toFixed(1)} mm`; }
      if (h === 'sep') { R.sepRodillos = Math.max((R.diamRodillo || 18) + 2, r1(Math.abs(dv) * 2)); info = `Distancia entre rodillos ${R.sepRodillos} mm (centro a centro)`; }
      LS.ui.status(info); V.redraw(); return;
    }
    if (dr.type === 'rotary') {
      let nx = dr.orig[0] + w[0] - dr.start[0], ny = dr.orig[1] + w[1] - dr.start[1];
      if (V.snapGrid) { nx = Math.round(nx / V.gridMm) * V.gridMm; ny = Math.round(ny / V.gridMm) * V.gridMm; }
      LS.rotary.posX = nx; LS.rotary.posY = ny; LS.ui.status(`Rotativo: centro X ${LS.toDisp(nx, ny)[0].toFixed(1)}  Y ${LS.toDisp(nx, ny)[1].toFixed(1)} mm`); V.redraw(); return;
    }
    if (dr.type === 'zona') { V.draft.cur = w; V.redraw(); return; }
    if (dr.type === 'shape') { V.draft.cur = snap(w); V.draft.shift = e.shiftKey; V.redraw(); return; }
    if (dr.type === 'move') {
      let dx = w[0] - dr.start[0], dy = w[1] - dr.start[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (V.snapGrid) { dx = Math.round(dx / V.gridMm) * V.gridMm; dy = Math.round(dy / V.gridMm) * V.gridMm; }
      dr.orig.forEach(([o, tx]) => { o.tx = G.mul(G.tr(dx, dy), tx); });
      dr.moved = true; LS.ui.refreshNumeric(); V.redraw(); return;
    }
    if (dr.type === 'scale') {
      const b = dr.bbox, h = dr.h;
      let sx = 1, sy = 1;
      if (h.ax !== null) { const ref = h.id.includes('w') ? b.x0 : b.x1; sx = (w[0] - h.ax) / ((ref - h.ax) || 1e-9); }
      if (h.ay !== null) { const ref = h.id.includes('n') ? b.y0 : b.y1; sy = (w[1] - h.ay) / ((ref - h.ay) || 1e-9); }
      const corner = h.ax !== null && h.ay !== null;
      if (corner && (LS.ui.lockRatio() !== e.shiftKey)) { const m = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * m; sy = Math.sign(sy || 1) * m; }
      if (Math.abs(sx) < 1e-3) sx = 1e-3; if (Math.abs(sy) < 1e-3) sy = 1e-3;
      const ax = h.ax ?? (b.x0 + b.x1) / 2, ay = h.ay ?? (b.y0 + b.y1) / 2;
      const m = G.about(G.sc(sx, sy), ax, ay);
      dr.orig.forEach(([o, tx]) => { o.tx = G.mul(m, tx); });
      LS.ui.refreshNumeric(); V.redraw(); return;
    }
    if (dr.type === 'rotate') {
      const c = [dr.h.ax, dr.h.ay];
      let a = (Math.atan2(w[1] - c[1], w[0] - c[0]) - Math.atan2(dr.start[1] - c[1], dr.start[0] - c[0])) * 180 / Math.PI;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      const m = G.about(G.rot(a), c[0], c[1]);
      dr.orig.forEach(([o, tx]) => { o.tx = G.mul(m, tx); });
      LS.ui.status(`Rotación: ${a.toFixed(1)}°`); V.redraw(); return;
    }
  }
  function onUp(e) {
    const dr = V.drag; V.drag = null;
    if (!dr) return;
    if (dr.type === 'marquee') {
      const x0 = Math.min(dr.start[0], dr.cur[0]), x1 = Math.max(dr.start[0], dr.cur[0]), y0 = Math.min(dr.start[1], dr.cur[1]), y1 = Math.max(dr.start[1], dr.cur[1]);
      const crossing = dr.cur[0] < dr.start[0];
      if (x1 - x0 > 0.01 || y1 - y0 > 0.01) {
        for (const o of D.objects) {
          if (!D.layer(o.layer).visible) continue;
          const b = D.objBBox(o); if (!b) continue;
          const inside = b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
          const touches = b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1;
          if (inside || (crossing && touches)) D.groupMembers(o).forEach(m => D.selection.add(m.id));
        }
      }
      D.changed('sel'); return;
    }
    if (dr.type === 'rotary' || dr.type === 'rotaryHandle') { LS.saveSettings(); LS.ui.refreshLaser(); return; }
    if (dr.type === 'head') { finishHeadDrag(dr); return; }
    if (dr.type === 'frameHandle') {
      const d = LS.device;
      if (dr.h.id === 'area') {
        // conserva la posición real (en la máquina) del diseño, del rotativo y del origen
        const dW = d.ancho - dr.orig.ancho, dH = d.alto - dr.orig.alto, o = d.origen;
        const tx = o.endsWith('der') ? dW : 0, ty = o.startsWith('inf') ? dH : 0;
        if (tx || ty) {
          D.objects.forEach(ob => { ob.tx = G.mul(G.tr(tx, ty), ob.tx); });
          if (LS.rotary.posX != null) LS.rotary.posX += tx; if (LS.rotary.posY != null) LS.rotary.posY += ty;
          if (d.posArranque) d.posArranque = [d.posArranque[0] + tx, d.posArranque[1] + ty];
          D.changed('xf');
        }
        if (d.modelo && LS.MACHINE_PRESETS[d.modelo] && LS.MACHINE_PRESETS[d.modelo].ancho && (d.ancho !== LS.MACHINE_PRESETS[d.modelo].ancho || d.alto !== LS.MACHINE_PRESETS[d.modelo].alto)) LS.ui.toast('El área ya no coincide con la del modelo elegido (por ejemplo, con un kit de extensión).');
      }
      LS.saveSettings(); LS.ui.refreshLaser(); V.redraw(); return;
    }
    if (dr.type === 'zona') {
      const d = V.draft; V.draft = null;
      if (Math.abs(d.cur[0] - d.start[0]) > 0.5 && Math.abs(d.cur[1] - d.start[1]) > 0.5) {
        LS.jobs.setZona({ x0: d.start[0], y0: d.start[1], x1: d.cur[0], y1: d.cur[1] });
        const z = LS.jobs.options.zona; LS.ui.toast(`Zona parcial: ${(z.x1 - z.x0).toFixed(1)} × ${(z.y1 - z.y0).toFixed(1)} mm. Solo se grabará o cortará lo que está dentro (el diseño no cambia).`, 'ok');
        LS.ui.setTool('seleccionar');
      } else V.redraw();
      return;
    }
    if (dr.type === 'shape') {
      const d = V.draft; V.draft = null;
      if (Math.abs(d.cur[0] - d.start[0]) > 0.2 || Math.abs(d.cur[1] - d.start[1]) > 0.2) {
        D.checkpoint(); D.selection.clear();
        D.add({ kind: 'path', paths: LS.shapePaths(d.shape, d.start, d.cur, d.shift), shape: d.shape });
        D.changed();
      } else V.redraw();
      return;
    }
    if (dr.type === 'move' && !dr.moved) { D.undoStack.pop(); }
    if (dr.type === 'move' || dr.type === 'scale' || dr.type === 'rotate') D.changed('xf');
  }
  function onDbl(e) {
    if (V.tool === 'linea' && V.draft) { V.draft.pts.pop(); finishPolyline(false); return; }
    const w = V.s2w(evPos(e)); const hit = V.hitTest(w);
    if (hit && hit.kind === 'text') LS.ui.editText(hit);
    else if (hit && hit.kind === 'image') LS.ui.imageDialog(hit);
    else if (!hit && V.rotaryHit(w)) LS.dlg.rotary();
  }
  function onWheel(e) {
    e.preventDefault();
    const s = evPos(e), w = V.s2w(s);
    const f = Math.pow(1.0015, -e.deltaY);
    V.scale = Math.max(0.05, Math.min(400, V.scale * f));
    V.ox = s[0] - w[0] * V.scale; V.oy = s[1] - w[1] * V.scale; V.redraw();
  }
  V.cancelDraft = () => { if (V.draft && V.draft.pts && V.draft.pts.length > 1) finishPolyline(false); V.draft = null; V.redraw(); };

  // ---- Arrastre del módulo láser ----
  const REFS9 = ['sup-izq', 'sup-cen', 'sup-der', 'cen-izq', 'cen-cen', 'cen-der', 'inf-izq', 'inf-cen', 'inf-der'];
  const refWorld = r => { const d = LS.device, [v, h] = r.split('-'); return [h === 'izq' ? 0 : h === 'der' ? d.ancho : d.ancho / 2, v === 'sup' ? 0 : v === 'inf' ? d.alto : d.alto / 2]; };
  function updHeadDrag(w, e) {
    const dr = V.drag, M = LS.machine, d = LS.device;
    let t = [dr.orig[0] + (dr.soloY ? 0 : w[0] - dr.start[0]), dr.orig[1] + w[1] - dr.start[1]];
    if (e.altKey === false && V.snapGrid) t = [Math.round(t[0] / V.gridMm) * V.gridMm, Math.round(t[1] / V.gridMm) * V.gridMm];
    // ajuste a centro, esquinas y bordes
    dr.snap = null; let best = 1e9;
    if (dr.soloY) { // la barra se ajusta al borde inferior, al centro y al borde superior
      for (const yy of [0, d.alto / 2, d.alto]) { const dd = Math.abs(yy - t[1]) * V.scale; if (dd < 14 && dd < best) { best = dd; t = [t[0], yy]; } }
      const ref = REFS9.find(r => { const p = refWorld(r); return Math.abs(p[0] - t[0]) < 1e-6 && Math.abs(p[1] - t[1]) < 1e-6; });
      dr.snap = ref || null;
    } else
    for (const r of REFS9) { const p = refWorld(r), dd = Math.hypot(p[0] - t[0], p[1] - t[1]) * V.scale; if (dd < 14 && dd < best) { best = dd; dr.snap = r; t = p.slice(); } }
    // dentro del área
    t = [Math.max(0, Math.min(d.ancho, t[0])), Math.max(0, Math.min(d.alto, t[1]))];
    dr.target = t;
    const soloUbicar = (d.arrastreModo === 'ubicar') !== !!e.shiftKey; // Mayús invierte el modo elegido
    dr.modo = !M.connected ? 'arranque' : (soloUbicar || !M.origenConocido) ? 'declarar' : 'mover';
    dr.accion = { arranque: 'Partida en', declarar: 'El cabezal está en', mover: dr.soloY ? 'Mover barra a' : 'Mover a' }[dr.modo];
  }
  function finishHeadDrag(dr) {
    const M = LS.machine, d = LS.device, t = dr.target;
    if (Math.hypot(t[0] - dr.orig[0], t[1] - dr.orig[1]) < 0.05 && !dr.snap) { V.redraw(); return; }
    if (dr.modo === 'arranque') {
      d.refArranque = dr.snap || 'custom'; d.posArranque = dr.snap ? null : t.slice(); d.arranquePendiente = true; LS.saveSettings();
      LS.ui.toast(`Posición de partida: ${dr.snap ? M.NOMBRE_REF[dr.snap] : `X ${LS.toDisp(...t)[0].toFixed(1)} Y ${LS.toDisp(...t)[1].toFixed(1)}`}. Al conectar se fijará como origen (el cabezal debe estar ahí).`, 'ok');
      LS.ui.refreshLaser(); V.redraw(); return;
    }
    if (dr.modo === 'declarar' && dr.soloY && LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y') {
      d.barraY = t[1]; LS.saveSettings(); LS.ui.toast('Barra ubicada en el lienzo (el motor Y está ocupado por el rotativo, no se envía nada a la máquina).', 'ok'); V.redraw(); return;
    }
    if (dr.modo === 'declarar') {
      LS.ui.guard(async () => { await M.setZeroAt(t, dr.snap); LS.ui.toast('Posición del cabezal fijada donde soltó el módulo. Los límites del área ya están activos.', 'ok'); LS.ui.refreshLaser(); });
      return;
    }
    const dd = LS.toDisp(t[0], t[1]);
    LS.ui.guard(async () => {
      if (LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y') await M.jog(dd[0] - (M.pos ? M.pos[0] : 0), 0, 50); // con el rotativo en Y solo se mueve X
      else if (dr.soloY && M.rawPos) await M.jogHead(0, dd[1] - M.rawPos[1], 50);
      else if (LS.rotary.activo) await M.jogHead(dd[0] - M.rawPos[0], dd[1] - M.rawPos[1], 50);
      else await M.moveTo(dd[0], dd[1]);
    });
    V.redraw();
  }

  // Formas paramétricas
  LS.shapePaths = (shape, a, b, square) => {
    let x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    if (square) { const m = Math.max(w, h); w = h = m; if (b[0] < a[0]) x0 = a[0] - m; if (b[1] < a[1]) y0 = a[1] - m; }
    if (shape === 'rect') return [{ pts: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], closed: true }];
    const cx = x0 + w / 2, cy = y0 + h / 2;
    if (shape === 'elipse') {
      const n = Math.max(48, Math.min(720, Math.ceil(Math.PI * (w + h) / 0.5)));
      const pts = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push([cx + w / 2 * Math.cos(t), cy + h / 2 * Math.sin(t)]); }
      return [{ pts, closed: true }];
    }
    if (shape === 'poligono') {
      const n = LS.ui ? LS.ui.polygonSides() : 6, pts = [];
      for (let i = 0; i < n; i++) { const t = -Math.PI / 2 + i / n * Math.PI * 2; pts.push([cx + w / 2 * Math.cos(t), cy + h / 2 * Math.sin(t)]); }
      return [{ pts, closed: true }];
    }
    return [];
  };

  LS.imageFor = obj => {
    const c = LS.imgCache[obj.id];
    if (c && c.src === obj.src && c.key === JSON.stringify(obj.ajustes)) return c.ready ? c.canvas : null;
    const entry = { src: obj.src, key: JSON.stringify(obj.ajustes), ready: false };
    LS.imgCache[obj.id] = entry;
    const img = new Image();
    img.onload = () => { entry.img = img; entry.canvas = LS.processImagePreview(img, obj.ajustes); entry.ready = true; V.redraw(); };
    img.src = obj.src;
    return null;
  };
})(window.LS);
