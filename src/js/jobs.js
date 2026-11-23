// Generación del trabajo: convierte el documento en una lista de movimientos neutros
// (coordenadas del mundo en mm) que luego se escriben como G-code (GRBL) o RD (Ruida).
(function (LS) {
  const G = LS.G, D = LS.D;
  const J = {};
  J.options = { soloSeleccion: false, origenTrabajo: 'absoluto', ancla: 'sup-izq', optimizar: true, interiorPrimero: true, origenUsuario: null, zona: null };

  // ---------- Relleno por líneas de barrido ----------
  function hatch(paths, interval, angle) {
    const closed = paths.filter(p => p.closed && p.pts.length > 2);
    if (!closed.length) return [];
    const r = G.rot(-angle), ri = G.rot(angle);
    const rp = closed.map(p => p.pts.map(q => G.apply(r, q)));
    let b = null; rp.forEach(p => { b = G.union(b, G.bbox(p)); });
    const lines = [];
    const edges = [];
    rp.forEach(p => { for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; if (a[1] !== c[1]) edges.push(a[1] < c[1] ? [a, c] : [c, a]); } });
    edges.sort((e1, e2) => e1[0][1] - e2[0][1]);
    let active = [], ei = 0;
    for (let y = b.y0 + interval / 2; y < b.y1; y += interval) {
      while (ei < edges.length && edges[ei][0][1] <= y) active.push(edges[ei++]);
      active = active.filter(e => e[1][1] > y);
      const xs = [];
      for (const [a, c] of active) if (a[1] <= y && c[1] > y) xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1]));
      xs.sort((u, v) => u - v);
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) lines.push([G.apply(ri, [xs[i], y]), G.apply(ri, [xs[i + 1], y])]);
    }
    return groupRows(lines, interval, angle);
  }
  // agrupa segmentos por fila para alternar dirección
  function groupRows(lines, interval, angle) {
    const r = G.rot(-angle); const rows = new Map();
    for (const l of lines) { const y = Math.round(G.apply(r, l[0])[1] / interval * 4); (rows.get(y) || rows.set(y, []).get(y)).push(l); }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, segs]) => segs.sort((s1, s2) => G.apply(r, s1[0])[0] - G.apply(r, s2[0])[0]));
  }

  // ---------- Orden de trayectorias ----------
  function orderPaths(paths, start, inner) {
    let items = paths.map(p => ({ p, b: G.bbox(p.pts), depth: 0 }));
    if (inner) {
      items.forEach(a => { items.forEach(c => { if (a !== c && c.p.closed && a.b.x0 >= c.b.x0 && a.b.x1 <= c.b.x1 && a.b.y0 >= c.b.y0 && a.b.y1 <= c.b.y1 && (a.b.w < c.b.w || a.b.h < c.b.h)) a.depth++; }); });
    }
    const out = []; let cur = start;
    const depths = [...new Set(items.map(i => i.depth))].sort((a, b) => b - a);
    for (const d of depths) {
      let pool = items.filter(i => i.depth === d);
      while (pool.length) {
        let bi = 0, bd = Infinity, rev = false, bestStart = 0;
        pool.forEach((it, i) => {
          const pts = it.p.pts;
          const d0 = Math.hypot(pts[0][0] - cur[0], pts[0][1] - cur[1]);
          if (d0 < bd) { bd = d0; bi = i; rev = false; bestStart = 0; }
          if (!it.p.closed) { const n = pts[pts.length - 1], d1 = Math.hypot(n[0] - cur[0], n[1] - cur[1]); if (d1 < bd) { bd = d1; bi = i; rev = true; } }
          else if (pts.length < 2000) { for (let k = 1; k < pts.length; k += Math.max(1, pts.length >> 6)) { const dk = Math.hypot(pts[k][0] - cur[0], pts[k][1] - cur[1]); if (dk < bd) { bd = dk; bi = i; rev = false; bestStart = k; } } }
        });
        const it = pool.splice(bi, 1)[0]; let pts = it.p.pts.slice();
        if (rev) pts.reverse();
        if (it.p.closed && bestStart) pts = pts.slice(bestStart).concat(pts.slice(0, bestStart));
        out.push({ pts, closed: it.p.closed }); const e = it.p.closed ? pts[0] : pts[pts.length - 1]; cur = e;
      }
    }
    return out;
  }

  // ---------- Construcción ----------
  // Devuelve { segs:[{a,b,on,p,F,L}], layers:[...], bbox }
  J.build = (opts = {}) => {
    opts = Object.assign({}, J.options, opts);
    const objs = (opts.objects || (opts.soloSeleccion ? D.selected() : D.objects)).filter(o => { const L = D.layer(o.layer); return L.salida; });
    if (!objs.length) throw new Error(opts.soloSeleccion ? 'No hay objetos seleccionados con salida activada.' : 'No hay nada para grabar o cortar (revise que las capas tengan la salida activada).');
    const byLayer = {};
    objs.forEach(o => (byLayer[o.layer] = byLayer[o.layer] || []).push(o));
    const layerIds = Object.keys(byLayer).map(Number).sort((a, b) => (D.layer(a).prioridad - D.layer(b).prioridad) || a - b);
    // capas de imagen y relleno primero, corte al final (como recomienda la práctica)
    layerIds.sort((a, b) => rank(D.layer(a)) - rank(D.layer(b)) || D.layer(a).prioridad - D.layer(b).prioridad);
    const segs = []; let cur = [0, 0]; let bbox = null;
    const push = (a, b, on, p, F, L, extra) => { segs.push(Object.assign({ a, b, on, p, F, L }, extra)); cur = b; if (on) bbox = G.union(bbox, G.bbox([a, b])); };
    for (const li of layerIds) {
      const L = opts.layerOverride ? Object.assign({}, D.layer(li), opts.layerOverride[li]) : D.layer(li);
      const os = byLayer[li];
      for (let pass = 0; pass < Math.max(1, L.pasadas | 0); pass++) {
        const zDown = pass > 0 ? (L.pasoZ || 0) : 0;
        const tag = { pass, z: zDown };
        if (L.modo === 'linea') {
          const paths = os.filter(o => o.kind !== 'image').flatMap(o => D.worldPaths(o));
          const ordered = opts.optimizar ? orderPaths(paths, cur, opts.interiorPrimero) : paths;
          for (const p of ordered) {
            const pts = p.closed ? p.pts.concat([p.pts[0]]) : p.pts;
            push(cur, pts[0], false, 0, L.velocidad, li, tag); tag.z = 0;
            for (let i = 1; i < pts.length; i++) push(pts[i - 1], pts[i], true, 1, L.velocidad, li);
          }
        } else if (L.modo === 'relleno') {
          const groups = L.rellenarJuntos ? [os.filter(o => o.kind !== 'image')] : os.filter(o => o.kind !== 'image').map(o => [o]);
          const angles = L.cruzado ? [L.angulo || 0, (L.angulo || 0) + 90] : [L.angulo || 0];
          for (const g of groups) for (const ang of angles) {
            const rows = hatch(g.flatMap(o => D.worldPaths(o)), Math.max(0.01, L.intervalo), ang);
            emitRows(rows, L, li, push, () => cur, tag, ang);
          }
        } else if (L.modo === 'imagen') {
          for (const o of os.filter(o => o.kind === 'image')) {
            const r = LS.rasterize(o, Math.max(0.02, L.intervalo));
            emitRaster(r, L, li, push, () => cur, tag);
          }
          // vectores en capa de imagen se rellenan
          const vec = os.filter(o => o.kind !== 'image');
          if (vec.length) emitRows(hatch(vec.flatMap(o => D.worldPaths(o)), Math.max(0.01, L.intervalo), 0), L, li, push, () => cur, tag, 0);
        }
      }
    }
    if (!segs.length) throw new Error('El trabajo no generó ningún movimiento (¿formas abiertas en una capa de relleno?).');
    const job = { segs, bbox, layers: layerIds };
    if (LS.device.recortarArea !== false && !opts.sinRecorte) J.clipToBed(job, opts);
    if (opts.zona && !opts.sinZona) J.clipToZona(job, opts.zona);
    // en conos, la corrección varía a lo largo del eje: se subdividen los tramos para seguir la curva
    if (J.coneInfo()) {
      const out = [];
      for (const s of job.segs) {
        const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = (s.on || s.scan) ? Math.min(200, Math.ceil(l / 1.5)) : 1;
        if (n <= 1) { out.push(s); continue; }
        for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; out.push(Object.assign({}, s, { a: [s.a[0] + (s.b[0] - s.a[0]) * t0, s.a[1] + (s.b[1] - s.a[1]) * t0], b: [s.a[0] + (s.b[0] - s.a[0]) * t1, s.a[1] + (s.b[1] - s.a[1]) * t1], z: i ? 0 : s.z })); }
      }
      job.segs = out;
    }
    return job;
  };
  function rank(L) { return L.modo === 'imagen' ? 0 : L.modo === 'relleno' ? 1 : 2; }

  function emitRows(rows, L, li, push, cur, tag, angle) {
    const over = (L.sobrebarrido || 0) / 100 * L.velocidad; // mm de sobrebarrido ≈ % de velocidad
    const dir = G.apply(G.rot(angle), [1, 0]);
    let flip = false;
    for (const row of rows) {
      let segs = row.map(s => s.slice());
      if (L.bidireccional && flip) segs = segs.reverse().map(s => [s[1], s[0]]);
      const d = (L.bidireccional && flip) ? [-dir[0], -dir[1]] : dir;
      const first = segs[0][0], last = segs[segs.length - 1][1];
      const pre = [first[0] - d[0] * over, first[1] - d[1] * over];
      push(cur(), pre, false, 0, L.velocidad, li, tag); tag.z = 0;
      push(pre, first, false, 0, L.velocidad, li, { scan: true });
      segs.forEach((s, i) => { if (i) push(cur(), s[0], false, 0, L.velocidad, li, { scan: true }); push(s[0], s[1], true, 1, L.velocidad, li, { scan: true }); });
      push(last, [last[0] + d[0] * over, last[1] + d[1] * over], false, 0, L.velocidad, li, { scan: true });
      flip = !flip;
    }
  }
  function emitRaster(r, L, li, pushRaw, cur, tag) {
    const over = (L.sobrebarrido || 0) / 100 * L.velocidad;
    // puntos en el marco de la rejilla; r.map los lleva al lienzo (barrido vertical o diagonal)
    const M = r.map || (p => p);
    const push = (a, b, on, p, F, l, extra) => pushRaw(a === cur() ? a : M(a), M(b), on, p, F, l, extra);
    let flip = false;
    for (let row = 0; row < r.rows; row++) {
      const y = r.y0 + (row + 0.5) * r.step, base = row * r.cols;
      let firstC = -1, lastC = -1;
      for (let c = 0; c < r.cols; c++) if (r.power[base + c] > 0.004) { if (firstC < 0) firstC = c; lastC = c; }
      if (firstC < 0) continue;
      const rev = L.bidireccional && flip;
      const runs = [];
      let c = firstC;
      while (c <= lastC) { const p = quant(r.power[base + c]); let e = c; while (e + 1 <= lastC && quant(r.power[base + e + 1]) === p) e++; runs.push([c, e + 1, p]); c = e + 1; }
      if (rev) runs.reverse();
      const xs = k => r.x0 + k * r.step;
      const startX = rev ? xs(lastC + 1) : xs(firstC), endX = rev ? xs(firstC) : xs(lastC + 1), d = rev ? -1 : 1;
      push(cur(), [startX - d * over, y], false, 0, L.velocidad, li, tag); tag.z = 0;
      push([startX - d * over, y], [startX, y], false, 0, L.velocidad, li, { scan: true });
      for (const [a, b, p] of runs) {
        const x0 = rev ? xs(b) : xs(a), x1 = rev ? xs(a) : xs(b);
        push([x0, y], [x1, y], p > 0, p, L.velocidad, li, { scan: true });
      }
      push([endX, y], [endX + d * over, y], false, 0, L.velocidad, li, { scan: true });
      flip = !flip;
    }
  }
  const quant = v => Math.round(v * 100) / 100;

  // ---------- Transformación a coordenadas de máquina ----------
  J.anchorPoint = (bbox, ancla) => {
    const [v, h] = ancla.split('-');
    const x = h === 'izq' ? bbox.x0 : h === 'der' ? bbox.x1 : (bbox.x0 + bbox.x1) / 2;
    const y = v === 'sup' ? bbox.y0 : v === 'inf' ? bbox.y1 : (bbox.y0 + bbox.y1) / 2;
    return [x, y];
  };
  // Eje por el que sale el giro: 'Y' (rotativo en el puerto Y) o 'Z' (puerto Z, máquinas sin motor Z; solo GRBL)
  J.rotaryAxis = () => (LS.rotary.activo && LS.rotary.eje === 'Z' && LS.device.tipo === 'grbl') ? 'Z' : 'Y';
  J.rotaryFactor = () => {
    const R = LS.rotary; if (!R.activo) return 1;
    const diam = R.tipo === 'mandril' ? R.diamObjeto : R.diamRodillo;
    // con la máquina conectada se usan los pasos/mm reales de la placa ($101 / $102)
    const gs = LS.machine && LS.machine.connected && LS.machine.grblSettings ? LS.machine.grblSettings() : {};
    const zEje = J.rotaryAxis() === 'Z', deBoard = Number(gs[zEje ? '102' : '101']);
    const pasosMm = deBoard > 0 ? deBoard : (zEje ? R.pasosMmZ : R.pasosMmY);
    const f = R.pasosRotacion / (Math.max(0.0001, pasosMm) * Math.PI * Math.max(0.01, diam));
    return R.invertir ? -f : f;
  };
  // Objetos cónicos (vasos/termos cónicos): el diámetro cambia a lo largo del eje.
  // El diseño se interpreta como longitud de arco en cada altura; el giro se corrige con k = d_ref / d(L).
  J.coneInfo = () => {
    const R = LS.rotary; if (!R.activo || R.forma !== 'cono') return null;
    const g = LS.rotaryGeom(), d1 = R.diamObjeto, d2 = R.diamObjeto2 || d1;
    const dref = R.tipo === 'mandril' ? d1 : (R.diamContacto || Math.max(d1, d2));
    const along = (x, y) => (x - (g.c[0] - g.u[0] * g.lo / 2)) * g.u[0] + (y - (g.c[1] - g.u[1] * g.lo / 2)) * g.u[1];
    const diamAt = L => d1 + (d2 - d1) * Math.max(0, Math.min(1, L / g.lo));
    return { g, d1, d2, dref, along, diamAt, k: (x, y) => dref / Math.max(0.1, diamAt(along(x, y))) };
  };
  // Orientación del eje del objeto sobre la mesa. 'vertical' solo es posible con el rotativo en el puerto Z.
  J.rotaryOrient = () => (J.rotaryAxis() === 'Z' && LS.rotary.orient === 'vertical') ? 'vertical' : 'horizontal';
  // Letras de eje para los dos valores que devuelve machineMapper
  //  sin rotativo / rotativo en Y: X, Y   ·   Z horizontal: X, Z (Y queda fijo)   ·   Z vertical: Z, Y (X queda fijo)
  J.axisLetters = () => {
    if (!LS.rotary.activo || LS.device.tipo !== 'grbl' || J.rotaryAxis() === 'Y') return ['X', 'Y'];
    return J.rotaryOrient() === 'vertical' ? ['Z', 'Y'] : ['X', 'Z'];
  };
  // Devuelve función (x,y mundo) -> [valor1, valor2] en las letras de J.axisLetters()
  J.machineMapper = (job, opts = {}) => {
    opts = Object.assign({}, J.options, opts);
    const dev = LS.device;
    let off = [0, 0];
    if (opts.origenTrabajo !== 'absoluto') {
      const a = J.anchorPoint(job.anchorBox || job.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }, opts.ancla);
      off = LS.toDisp(a[0], a[1]);
      if (opts.origenTrabajo === 'usuario' && opts.origenUsuario) { const u = opts.origenUsuario; off = [off[0] - u[0], off[1] - u[1]]; }
    }
    const rf = (dev.tipo === 'grbl' || LS.rotary.escalarRuida) ? J.rotaryFactor() : 1;
    const cone = J.coneInfo(), K = cone ? cone.k : () => 1;
    if (!LS.rotary.activo) return (x, y) => { const d = LS.toDisp(x, y); return [d[0] - off[0], d[1] - off[1]]; };
    if (J.rotaryAxis() !== 'Z') {
      // rotativo en el puerto Y: X sigue la posición del diseño; el giro es relativo a la posición actual
      // del objeto, tomando como referencia el punto de anclaje (se pone a 0 con G92 al empezar)
      const ab = job.anchorBox || job.bbox;
      const a = ab ? LS.toDisp(...J.anchorPoint(ab, opts.ancla)) : [0, 0];
      return (x, y) => { const d = LS.toDisp(x, y); return [d[0] - off[0], (d[1] - a[1]) * rf * K(x, y)]; };
    }
    // Rotativo en el puerto Z: el giro siempre es relativo a la posición actual del objeto,
    // tomando como referencia el punto de anclaje del trabajo.
    const ab = job.anchorBox || job.bbox;
    const a = ab ? LS.toDisp(...J.anchorPoint(ab, opts.ancla)) : [0, 0];
    if (J.rotaryOrient() === 'vertical') return (x, y) => { const d = LS.toDisp(x, y); return [(d[0] - a[0]) * rf * K(x, y), d[1] - off[1]]; };
    return (x, y) => { const d = LS.toDisp(x, y); return [d[0] - off[0], (d[1] - a[1]) * rf * K(x, y)]; };
  };

  // ---------- Límites del área (máquinas sin finales de carrera) ----------
  // Rectángulo de la mesa expresado en coordenadas del diseño, según dónde caerá el trabajo.
  // Devuelve null si no se puede saber (p. ej. "posición actual" sin conexión).
  J.clipRectWorld = (anchorBox, opts) => {
    opts = Object.assign({}, J.options, opts);
    const d = LS.device;
    let d0;
    if (opts.origenTrabajo === 'absoluto') d0 = [0, 0];
    else {
      const base = opts.origenTrabajo === 'usuario' ? opts.origenUsuario : (LS.machine && LS.machine.connected ? LS.machine.pos : null);
      if (!base || !anchorBox) return null;
      const a = LS.toDisp(...J.anchorPoint(anchorBox, opts.ancla));
      d0 = [a[0] - base[0], a[1] - base[1]];
    }
    const p = LS.fromDisp(d0[0], d0[1]), q = LS.fromDisp(d0[0] + d.ancho, d0[1] + d.alto);
    const r = { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) };
    // con rotativo, el eje que gira no tiene tope de mesa
    if (LS.rotary.activo) { if (J.axisLetters()[0] === 'Z') { r.x0 = -Infinity; r.x1 = Infinity; } else { r.y0 = -Infinity; r.y1 = Infinity; } }
    return r;
  };
  // Recorte de un segmento con Liang–Barsky
  function clipSeg(a, b, r) {
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    const P = [-dx, dx, -dy, dy], Q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      const t = Q[i] / P[i];
      if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
  }
  J.clipToBed = (job, opts) => {
    job.anchorBox = job.bbox;
    const r = J.clipRectWorld(job.bbox, opts);
    if (!r) { job.recorte = { desconocido: true }; return job; }
    const out = []; let cur = null, cut = 0, bbox = null;
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const s of job.segs) {
      const c = clipSeg(s.a, s.b, r);
      if (!c) { if (s.on) cut += len(s.a, s.b); continue; }
      if (s.on) cut += len(s.a, s.b) - len(c[0], c[1]);
      // solo se agrega un viaje si el recorte dejó un hueco; nunca hacia el origen del diseño
      if (cur ? len(cur, c[0]) > 1e-6 : (s.on || s.scan)) out.push({ a: cur || c[0], b: c[0], on: false, p: 0, F: s.F, L: s.L });
      out.push(Object.assign({}, s, { a: c[0], b: c[1] }));
      if (s.on) bbox = G.union(bbox, G.bbox(c));
      cur = c[1];
    }
    job.segs = out; job.bbox = bbox || job.bbox;
    job.recorte = { mm: cut, recortado: cut > 0.01 };
    if (!out.some(s => s.on)) throw new Error('Todo el diseño queda fuera del área de trabajo definida. Muévalo dentro de la mesa.');
    return job;
  };

  // ---------- Zona parcial ----------
  // Solo se graba/corta lo que queda dentro del recuadro; el diseño del lienzo no se modifica.
  // El punto de anclaje se calcula con el diseño completo, así la zona cae exactamente donde estaba.
  J.setZona = r => {
    J.options.zona = r ? { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) } : null;
    if (LS.ui && LS.ui.refreshLaser) LS.ui.refreshLaser(); if (LS.V) LS.V.redraw();
  };
  J.clipToZona = (job, z) => {
    job.anchorBox = job.anchorBox || job.bbox;
    const r = { x0: Math.min(z.x0, z.x1), y0: Math.min(z.y0, z.y1), x1: Math.max(z.x0, z.x1), y1: Math.max(z.y0, z.y1) };
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const out = []; let cur = null, bbox = null, ult = null, zPend = 0;
    // sobrebarrido en los bordes de la zona: el cabezal entra y sale de cada tramo a velocidad constante
    const sobre = s => Math.max(2, ((D.layer(s.L) || {}).sobrebarrido || 0) / 100 * (s.F || 0));
    const cerrar = () => {
      if (ult && ult.scan && cur) { const e = [cur[0] + ult.d[0] * ult.m, cur[1] + ult.d[1] * ult.m]; out.push({ a: cur, b: e, on: false, p: 0, F: ult.F, L: ult.L, scan: true }); cur = e; }
      ult = null;
    };
    for (const s of job.segs) {
      if (s.z) zPend = s.z;
      if (!s.on && !s.scan) continue; // los viajes se rehacen
      const c = clipSeg(s.a, s.b, r); if (!c || len(c[0], c[1]) < 1e-6) continue;
      const l = len(s.a, s.b) || 1, d = [(s.b[0] - s.a[0]) / l, (s.b[1] - s.a[1]) / l];
      const seguido = cur && len(cur, c[0]) < 1e-6 && ult && !!ult.scan === !!s.scan;
      if (!seguido) {
        cerrar();
        let ini = c[0]; const m = s.scan ? sobre(s) : 0;
        if (s.scan) ini = [c[0][0] - d[0] * m, c[0][1] - d[1] * m];
        out.push({ a: cur || ini, b: ini, on: false, p: 0, F: s.F, L: s.L, z: zPend }); zPend = 0;
        if (s.scan) out.push({ a: ini, b: c[0], on: false, p: 0, F: s.F, L: s.L, scan: true });
      }
      out.push(Object.assign({}, s, { a: c[0], b: c[1], z: 0 }));
      if (s.on) bbox = G.union(bbox, G.bbox(c));
      cur = c[1]; ult = { scan: !!s.scan, d, m: s.scan ? sobre(s) : 0, F: s.F, L: s.L };
    }
    cerrar();
    // tramos sin láser al final de la zona: se quitan
    while (out.length && !out[out.length - 1].on && !out[out.length - 1].scan) out.pop();
    if (!out.some(s => s.on)) throw new Error('La zona parcial no contiene nada para grabar o cortar. Dibújela sobre el diseño o quítela en Láser → Zona parcial.');
    job.segs = out; job.bbox = bbox; job.zona = r;
    return job;
  };

  J.estimate = job => {
    const rapid = (LS.device.velRapida || 100);
    let t = 0, cut = 0, travel = 0;
    for (const s of job.segs) {
      const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const v = LS.device.unidadVelocidad === 'mm/min' ? s.F / 60 : s.F;
      if (s.on || s.scan) { t += l / Math.max(0.1, v); cut += l; } else { t += l / rapid + (l > 0 ? 0.05 : 0); travel += l; }
    }
    return { segundos: t * 1.08, corte: cut, viaje: travel };
  };
  J.fmtTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ' h ' : '') + (m ? m + ' min ' : '') + ss + ' s'; };

  // ---------- Prueba de materiales ----------
  // Genera objetos temporales: rejilla de velocidad × potencia
  J.materialTest = p => {
    const objects = [], layers = {}, override = {};
    let idx = 0;
    const sizeX = p.tam, sizeY = p.tam, gap = p.separacion;
    for (let r = 0; r < p.filas; r++) for (let c = 0; c < p.columnas; c++) {
      const speed = p.velMin + (p.filas > 1 ? (p.velMax - p.velMin) * r / (p.filas - 1) : 0);
      const power = p.potMin + (p.columnas > 1 ? (p.potMax - p.potMin) * c / (p.columnas - 1) : 0);
      const x = p.x + c * (sizeX + gap), y = p.y + r * (sizeY + gap);
      const layerId = 1000 + idx++;
      objects.push({ id: 'mt' + idx, kind: 'path', layer: layerId, tx: G.I(), paths: [{ pts: [[x, y], [x + sizeX, y], [x + sizeX, y + sizeY], [x, y + sizeY]], closed: true }] });
      layers[layerId] = Object.assign(LS.layerDefault(0), { modo: p.modo, velocidad: Math.round(speed * 10) / 10, potMax: Math.round(power * 10) / 10, potMin: 0, intervalo: p.intervalo, pasadas: p.pasadas, prioridad: idx });
    }
    return { objects, layers };
  };
  J.withTempDoc = (objects, layers, fn) => {
    const saveO = D.objects, saveL = D.layers;
    D.objects = objects; D.layers = Object.assign({}, saveL, layers);
    try { return fn(); } finally { D.objects = saveO; D.layers = saveL; }
  };
  LS.jobs = J;
})(window.LS);
