// Operaciones de edición: booleanas, desplazamiento, calcado, alineación, matrices.
(function (LS) {
  const G = LS.G, D = LS.D, CL = window.ClipperLib;
  const S = 1000; // escala para Clipper (micras)
  const toCl = paths => paths.filter(p => p.closed && p.pts.length > 2).map(p => p.pts.map(q => ({ X: Math.round(q[0] * S), Y: Math.round(q[1] * S) })));
  const fromCl = sol => sol.map(r => ({ pts: r.map(q => [q.X / S, q.Y / S]), closed: true }));
  const O = {};

  O.booleanPaths = (subj, clip, op) => {
    const c = new CL.Clipper();
    const s = toCl(subj); if (op === 'union') { c.AddPaths(s, CL.PolyType.ptSubject, true); }
    else { c.AddPaths(s, CL.PolyType.ptSubject, true); c.AddPaths(toCl(clip), CL.PolyType.ptClip, true); }
    const sol = new CL.Paths();
    const type = { union: CL.ClipType.ctUnion, diferencia: CL.ClipType.ctDifference, interseccion: CL.ClipType.ctIntersection, xor: CL.ClipType.ctXor }[op];
    c.Execute(type, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    return fromCl(sol);
  };
  O.boolean = op => {
    const sel = D.selected().filter(o => o.kind !== 'image');
    if (sel.length < (op === 'union' ? 1 : 2)) throw new Error(op === 'union' ? 'Seleccione al menos una forma cerrada.' : 'Seleccione al menos dos formas cerradas. La primera seleccionada se usa como base.');
    const first = sel[0], rest = sel.slice(1);
    let res;
    if (op === 'union') res = O.booleanPaths(sel.flatMap(o => D.worldPaths(o)), [], 'union');
    else res = O.booleanPaths(D.worldPaths(first), rest.flatMap(o => D.worldPaths(o)), op);
    D.checkpoint(); D.remove(sel.map(o => o.id));
    if (res.length) D.add({ kind: 'path', paths: res, layer: first.layer });
    D.changed();
  };
  O.offset = (dist, join = 'redondo', borrarOriginal = false) => {
    const sel = D.selected().filter(o => o.kind !== 'image'); if (!sel.length) throw new Error('Seleccione formas cerradas.');
    D.checkpoint();
    for (const o of sel) {
      const co = new CL.ClipperOffset(2, 0.25 * S / 10);
      const jt = { redondo: CL.JoinType.jtRound, recto: CL.JoinType.jtMiter, bisel: CL.JoinType.jtSquare }[join];
      co.AddPaths(toCl(D.worldPaths(o)), jt, CL.EndType.etClosedPolygon);
      const sol = new CL.Paths(); co.Execute(sol, dist * S);
      if (sol.length) D.add({ kind: 'path', paths: fromCl(sol), layer: o.layer }, false);
    }
    if (borrarOriginal) D.remove(sel.map(o => o.id));
    D.changed();
  };
  O.toPath = () => {
    const sel = D.selected(); D.checkpoint();
    sel.forEach(o => { if (o.kind === 'text') { o.kind = 'path'; delete o.text; } delete o.shape; });
    D.changed();
  };

  // Calcado de imagen a vectores (ImageTracer)
  O.trace = async (obj, opts) => {
    const entry = LS.imgCache[obj.id]; if (!entry || !entry.img) throw new Error('Imagen no cargada.');
    const img = entry.img, maxPx = opts.resolucion || 800, s = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.round(img.width * s), h = Math.round(img.height * s);
    const gray = LS.grayFrom(img, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); const id = cx.createImageData(w, h);
    for (let i = 0; i < gray.length; i++) { let dark = gray[i] < opts.umbral; if (opts.invertir) dark = !dark; const v = dark ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    const td = window.ImageTracer.imagedataToTracedata(id, { ltres: opts.suavizado || 1, qtres: opts.suavizado || 1, pathomit: opts.ignorar || 8, colorsampling: 0, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], rightangleenhance: false });
    const paths = [];
    const layerIdx = td.palette.findIndex(p => p.r < 128);
    const sx = obj.w / w, sy = obj.h / h;
    (td.layers[layerIdx] || []).forEach(p => {
      const pts = [];
      p.segments.forEach((sg, i) => {
        if (i === 0) pts.push([sg.x1, sg.y1]);
        if (sg.type === 'L') pts.push([sg.x2, sg.y2]); else G.quad(pts, [sg.x1, sg.y1], [sg.x2, sg.y2], [sg.x3, sg.y3], 0.3);
      });
      if (pts.length > 2) paths.push({ pts: pts.map(q => G.apply(obj.tx, [q[0] * sx, q[1] * sy])), closed: true });
    });
    if (!paths.length) throw new Error('No se detectaron contornos con estos parámetros.');
    D.checkpoint(); D.selection.clear();
    const lay = opts.capa ?? 0;
    D.add({ kind: 'path', paths, layer: lay }); D.changed();
    return paths.length;
  };

  // Línea central: adelgaza la imagen binaria (Zhang-Suen) y sigue el esqueleto como trazos abiertos
  O.centerline = async (obj, opts = {}) => {
    const entry = LS.imgCache[obj.id]; if (!entry || !entry.img) throw new Error('Imagen no cargada.');
    const { w, h, bin } = LS.binaryFrom(entry.img, obj.ajustes, opts.resolucion || 700);
    const I = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? bin[y * w + x] : 0;
    // adelgazamiento
    let cambio = true; const del = [];
    while (cambio) {
      cambio = false;
      for (let paso = 0; paso < 2; paso++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          if (!bin[y * w + x]) continue;
          const p2 = I(x, y - 1), p3 = I(x + 1, y - 1), p4 = I(x + 1, y), p5 = I(x + 1, y + 1), p6 = I(x, y + 1), p7 = I(x - 1, y + 1), p8 = I(x - 1, y), p9 = I(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]; let A = 0; for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
          if (A !== 1) continue;
          if (paso === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) del.push(y * w + x);
        }
        if (del.length) { cambio = true; del.forEach(i => bin[i] = 0); }
      }
    }
    // seguimiento de trazos
    const vis = new Uint8Array(w * h), N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const vecinos = (x, y) => N8.filter(([dx, dy]) => I(x + dx, y + dy));
    const trazos = [];
    const seguir = (x, y) => {
      const pts = [[x, y]]; vis[y * w + x] = 1;
      for (;;) { const n = N8.map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => I(a, b) && !vis[b * w + a]); if (!n) break; [x, y] = n; vis[y * w + x] = 1; pts.push([x, y]); }
      return pts;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x] && !vis[y * w + x] && vecinos(x, y).length === 1) { const t = seguir(x, y); if (t.length > 2) trazos.push(t); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x] && !vis[y * w + x]) { const t = seguir(x, y); if (t.length > 2) trazos.push(t); }
    // simplificación (Douglas-Peucker)
    const rdp = (pts, eps) => { if (pts.length < 3) return pts; let dm = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1]; for (let i = 1; i < pts.length - 1; i++) { const d = G.distSeg(pts[i], a, b); if (d > dm) { dm = d; idx = i; } } return dm > eps ? rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps)) : [a, b]; };
    const minLen = opts.ignorar ?? 6;
    const sx = obj.w / w, sy = obj.h / h;
    const paths = trazos.filter(t => t.length >= minLen).map(t => ({ pts: rdp(t, opts.suavizado ?? 0.8).map(([x, y]) => G.apply(obj.tx, [(x + 0.5) * sx, (y + 0.5) * sy])), closed: false }));
    if (!paths.length) throw new Error('No se encontraron trazos con estos parámetros.');
    D.checkpoint(); D.selection.clear();
    D.add({ kind: 'path', paths, layer: opts.capa ?? 0 }); D.changed();
    return paths.length;
  };

  O.align = how => {
    const sel = D.selected(); if (sel.length < 2) throw new Error('Seleccione al menos dos objetos.');
    const ref = D.objBBox(sel[sel.length - 1]); D.checkpoint();
    const units = groupUnits(sel);
    units.forEach(u => {
      const b = D.selBBox(u); let dx = 0, dy = 0;
      if (how === 'izq') dx = ref.x0 - b.x0; if (how === 'der') dx = ref.x1 - b.x1; if (how === 'centroH') dx = (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2;
      if (how === 'arriba') dy = ref.y0 - b.y0; if (how === 'abajo') dy = ref.y1 - b.y1; if (how === 'centroV') dy = (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2;
      if (how === 'centros') { dx = (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2; dy = (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2; }
      D.transformSel(G.tr(dx, dy), u);
    });
    D.changed();
  };
  function groupUnits(sel) { const m = new Map(); sel.forEach(o => { const k = o.group || o.id; (m.get(k) || m.set(k, []).get(k)).push(o); }); return [...m.values()]; }
  O.distribute = axis => {
    const units = groupUnits(D.selected()); if (units.length < 3) throw new Error('Seleccione al menos tres objetos.');
    D.checkpoint();
    const bs = units.map(u => ({ u, b: D.selBBox(u) })).sort((a, b) => axis === 'h' ? a.b.x0 - b.b.x0 : a.b.y0 - b.b.y0);
    const first = bs[0].b, last = bs[bs.length - 1].b;
    const total = bs.reduce((s, x) => s + (axis === 'h' ? x.b.w : x.b.h), 0);
    const gap = ((axis === 'h' ? last.x1 - first.x0 : last.y1 - first.y0) - total) / (bs.length - 1);
    let pos = axis === 'h' ? first.x0 : first.y0;
    bs.forEach(x => { const d = pos - (axis === 'h' ? x.b.x0 : x.b.y0); D.transformSel(axis === 'h' ? G.tr(d, 0) : G.tr(0, d), x.u); pos += (axis === 'h' ? x.b.w : x.b.h) + gap; });
    D.changed();
  };
  O.mirror = axis => { const b = D.selBBox(); if (!b) return; D.checkpoint(); D.transformSel(G.about(axis === 'h' ? G.sc(-1, 1) : G.sc(1, -1), (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)); D.changed(); };
  O.rotate = deg => { const b = D.selBBox(); if (!b) return; D.checkpoint(); D.transformSel(G.about(G.rot(deg), (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)); D.changed(); };

  const clone = o => { const c = JSON.parse(JSON.stringify(o)); c.id = G.uid(); return c; };
  O.clone = clone;
  O.gridArray = (cols, rows, dx, dy) => {
    const sel = D.selected(); if (!sel.length) throw new Error('Seleccione objetos.');
    const b = D.selBBox(sel); D.checkpoint();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!r && !c) continue;
      const g = G.uid();
      sel.forEach(o => { const n = clone(o); if (o.group || sel.length > 1) n.group = g + (o.group || ''); n.tx = G.mul(G.tr(c * (b.w + dx), r * (b.h + dy)), o.tx); D.add(n, false); });
    }
    D.changed();
  };
  O.circularArray = (count, radius, rotar) => {
    const sel = D.selected(); if (!sel.length) throw new Error('Seleccione objetos.');
    const b = D.selBBox(sel); const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2 + radius; D.checkpoint();
    for (let i = 1; i < count; i++) {
      const ang = 360 * i / count; const g = G.uid();
      const rad = ang * Math.PI / 180; const nx = cx + radius * Math.sin(rad) - cx, ny = cy - radius * Math.cos(rad) - (cy - radius);
      const m = rotar ? G.about(G.rot(ang), cx, cy) : G.tr(nx, ny);
      sel.forEach(o => { const n = clone(o); n.group = g; n.tx = G.mul(m, o.tx); D.add(n, false); });
    }
    D.changed();
  };
  LS.ops = O;
})(window.LS);
