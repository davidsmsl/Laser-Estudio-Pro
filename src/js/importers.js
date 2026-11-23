// Importación de SVG, DXF e imágenes; texto con fuentes del sistema.
(function (LS) {
  const G = LS.G, D = LS.D;

  function nearestLayer(color) {
    if (!color || color === 'none') return null;
    const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; const hex = c.fillStyle;
    if (!/^#/.test(hex)) return null;
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    let best = 0, bd = Infinity;
    LS.PALETTE.forEach((p, i) => { const m = parseInt(p.slice(1), 16); const d = (r - (m >> 16)) ** 2 + (g - ((m >> 8) & 255)) ** 2 + (b - (m & 255)) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function unitToMm(v, def = 'px') {
    if (v == null) return null; const m = String(v).match(/^([-\d.e+]+)\s*([a-z%]*)$/i); if (!m) return null;
    const n = parseFloat(m[1]), u = (m[2] || def).toLowerCase();
    return n * ({ mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 })[u] || n * 25.4 / 96;
  }
  function parseTransform(s) {
    let m = G.I(); if (!s) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let r;
    while ((r = re.exec(s))) {
      const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number); let t;
      switch (r[1]) {
        case 'matrix': t = a; break;
        case 'translate': t = G.tr(a[0], a[1] || 0); break;
        case 'scale': t = G.sc(a[0], a[1] ?? a[0]); break;
        case 'rotate': t = a.length > 2 ? G.about(G.rot(a[0]), a[1], a[2]) : G.rot(a[0]); break;
        case 'skewX': t = [1, 0, Math.tan(a[0] * Math.PI / 180), 1, 0, 0]; break;
        case 'skewY': t = [1, Math.tan(a[0] * Math.PI / 180), 0, 1, 0, 0]; break;
      }
      m = G.mul(m, t);
    }
    return m;
  }
  function styleOf(el, name) {
    const st = el.getAttribute('style'); if (st) { const m = st.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)')); if (m) return m[1].trim(); }
    const a = el.getAttribute(name); if (a) return a;
    return el.parentElement && el.parentElement.tagName !== 'svg' ? styleOf(el.parentElement, name) : null;
  }

  LS.importSVG = (text, name) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.querySelector('svg'); if (!svg) throw new Error('SVG no válido.');
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const wmm = unitToMm(svg.getAttribute('width')), hmm = unitToMm(svg.getAttribute('height'));
    let root = G.sc(25.4 / 96, 25.4 / 96);
    if (vb.length === 4 && vb[2] > 0) {
      const sx = (wmm || vb[2] * 25.4 / 96) / vb[2], sy = (hmm || vb[3] * 25.4 / 96) / vb[3];
      root = G.mul(G.sc(sx, sy), G.tr(-vb[0], -vb[1]));
    }
    const groups = {}; const images = [];
    const gid = G.uid();
    const tol = 0.01;
    function walk(el, m) {
      const tag = el.tagName.toLowerCase();
      if (['defs', 'clippath', 'mask', 'metadata', 'title', 'desc', 'style', 'symbol', 'marker', 'pattern'].includes(tag)) return;
      if (styleOf(el, 'display') === 'none' || styleOf(el, 'visibility') === 'hidden') return;
      const mm = G.mul(m, parseTransform(el.getAttribute('transform')));
      let paths = null; const n = k => parseFloat(el.getAttribute(k) || 0);
      if (tag === 'path') paths = G.parsePathD(el.getAttribute('d') || '', tol);
      else if (tag === 'rect') {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height'); let rx = n('rx'), ry = n('ry'); if (!rx) rx = ry; if (!ry) ry = rx;
        if (rx > 0) paths = G.parsePathD(`M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`, tol);
        else paths = [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        paths = G.parsePathD(`M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}Z`, tol);
      } else if (tag === 'line') paths = [{ pts: [[n('x1'), n('y1')], [n('x2'), n('y2')]], closed: false }];
      else if (tag === 'polyline' || tag === 'polygon') {
        const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        paths = [{ pts, closed: tag === 'polygon' }];
      } else if (tag === 'image') {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href');
        if (href && href.startsWith('data:')) images.push({ src: href, m: G.mul(mm, G.tr(n('x'), n('y'))), w: n('width'), h: n('height') });
        return;
      } else if (tag === 'use') {
        const ref = (el.getAttribute('href') || el.getAttribute('xlink:href') || '').slice(1);
        const t = ref && doc.getElementById(ref); if (t) walk(t, G.mul(mm, G.tr(n('x'), n('y'))));
        return;
      }
      if (paths && paths.length) {
        const stroke = styleOf(el, 'stroke'), fill = styleOf(el, 'fill');
        let layer = nearestLayer(stroke && stroke !== 'none' ? stroke : null);
        let isFill = false;
        if (layer == null) { layer = nearestLayer(fill && fill !== 'none' ? fill : (fill === null ? '#000' : null)); isFill = layer != null; }
        if (layer == null) layer = D.currentLayer;
        const key = layer + (isFill ? 'f' : '');
        const tm = G.mul(root, mm);
        (groups[key] = groups[key] || { layer, isFill, paths: [] }).paths.push(...paths.map(p => ({ pts: p.pts.map(q => G.apply(tm, q)), closed: p.closed })));
      }
      for (const c of el.children) walk(c, mm);
    }
    for (const c of svg.children) walk(c, G.I());
    const added = [];
    Object.values(groups).forEach(g => {
      const L = D.layer(g.layer);
      if (g.isFill && !Object.keys(D.layers).includes(String(g.layer))) L.modo = 'relleno';
      added.push(D.add({ kind: 'path', paths: g.paths, layer: g.layer, group: gid, nombre: name }));
    });
    images.forEach(im => {
      const tm = G.mul(root, im.m); const sw = Math.hypot(tm[0], tm[1]), sh = Math.hypot(tm[2], tm[3]);
      const L = D.layer(LS.firstImageLayer()); L.modo = 'imagen';
      added.push(D.add({ kind: 'image', src: im.src, w: im.w * sw, h: im.h * sh, tx: [tm[0] / sw, tm[1] / sw, tm[2] / sh, tm[3] / sh, tm[4], tm[5]], layer: LS.firstImageLayer(), ajustes: Object.assign({}, LS.IMG_DEFAULT), group: gid }));
    });
    if (added.length === 1) delete added[0].group;
    return added;
  };

  LS.firstImageLayer = () => {
    for (const k of Object.keys(D.layers)) if (D.layers[k].modo === 'imagen') return Number(k);
    for (let i = 2; i < 30; i++) if (!D.layers[i]) { const L = D.layer(i); L.modo = 'imagen'; L.velocidad = 150; L.potMax = 40; L.intervalo = 0.1; return i; }
    return 29;
  };

  LS.importDXF = (text, name) => {
    const parser = new window.DxfParser();
    const dxf = parser.parseSync(text);
    const units = dxf.header && dxf.header.$INSUNITS; const k = units === 1 ? 25.4 : units === 5 ? 10 : units === 6 ? 1000 : 1;
    const byLayer = {}; const gid = G.uid();
    const push = (ent, pts, closed) => {
      const color = ent.color != null ? '#' + ent.color.toString(16).padStart(6, '0') : null;
      const layer = nearestLayer(color) ?? D.currentLayer;
      (byLayer[layer] = byLayer[layer] || []).push({ pts: pts.map(p => [p[0] * k, -p[1] * k]), closed });
    };
    const bulgePts = (vs, closed) => {
      const out = [[vs[0].x, vs[0].y]]; const n = vs.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = vs[i], b = vs[(i + 1) % n];
        if (a.bulge) {
          const th = 4 * Math.atan(a.bulge), ch = Math.hypot(b.x - a.x, b.y - a.y), r = ch / (2 * Math.sin(Math.abs(th) / 2));
          G.arc(out, [a.x, a.y], r, r, 0, Math.abs(th) > Math.PI, th > 0, [b.x, b.y], 0.01);
        } else out.push([b.x, b.y]);
      }
      return out;
    };
    for (const e of dxf.entities || []) {
      switch (e.type) {
        case 'LINE': push(e, e.vertices.map(v => [v.x, v.y]), false); break;
        case 'LWPOLYLINE': case 'POLYLINE': if (e.vertices && e.vertices.length > 1) push(e, bulgePts(e.vertices, !!e.shape), !!e.shape); break;
        case 'CIRCLE': { const pts = []; const n = Math.max(48, Math.ceil(e.radius * 6)); for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI; pts.push([e.center.x + e.radius * Math.cos(t), e.center.y + e.radius * Math.sin(t)]); } push(e, pts, true); break; }
        case 'ARC': { let a0 = e.startAngle, a1 = e.endAngle; if (a1 < a0) a1 += 2 * Math.PI; const n = Math.max(12, Math.ceil((a1 - a0) * e.radius * 3)); const pts = []; for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([e.center.x + e.radius * Math.cos(t), e.center.y + e.radius * Math.sin(t)]); } push(e, pts, false); break; }
        case 'ELLIPSE': { const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y, R = Math.hypot(mx, my), r = R * e.axisRatio, rot = Math.atan2(my, mx); let a0 = e.startAngle || 0, a1 = e.endAngle ?? 2 * Math.PI; if (a1 < a0) a1 += 2 * Math.PI; const n = 96, pts = []; for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; const x = R * Math.cos(t), y = r * Math.sin(t); pts.push([e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot)]); } push(e, pts, Math.abs(a1 - a0 - 2 * Math.PI) < 1e-6); break; }
        case 'SPLINE': { const cp = (e.fitPoints && e.fitPoints.length > 1 ? e.fitPoints : e.controlPoints) || []; if (cp.length > 1) push(e, splinePts(e, cp), !!e.closed); break; }
        case 'POINT': break;
      }
    }
    // colocar en la mesa (las coordenadas DXF tienen Y hacia arriba)
    const all = Object.values(byLayer).flat(); if (!all.length) throw new Error('No se encontraron entidades compatibles en el DXF.');
    let b = null; all.forEach(p => { b = G.union(b, G.bbox(p.pts)); });
    const added = Object.entries(byLayer).map(([layer, paths]) => D.add({ kind: 'path', paths: paths.map(p => ({ pts: p.pts.map(q => [q[0] - b.x0 + 10, q[1] - b.y0 + 10]), closed: p.closed })), layer: Number(layer), group: gid, nombre: name }));
    if (added.length === 1) delete added[0].group;
    return added;
  };
  // B-spline uniforme (aproximación con de Boor cuando hay nudos)
  function splinePts(e, cp) {
    const P = cp.map(p => [p.x, p.y]);
    if (!e.knotValues || !e.controlPoints || cp === e.fitPoints) return P;
    const k = e.degreeOfSplineCurve || 3, knots = e.knotValues, n = P.length;
    const out = []; const t0 = knots[k], t1 = knots[n]; const steps = Math.max(30, n * 12);
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(t0 + (t1 - t0) * s / steps, t1 - 1e-9);
      let i = k; while (i < n - 1 && knots[i + 1] <= t) i++;
      const d = []; for (let j = 0; j <= k; j++) d.push(P[j + i - k].slice());
      for (let r = 1; r <= k; r++) for (let j = k; j >= r; j--) { const a = (t - knots[j + i - k]) / (knots[j + 1 + i - r] - knots[j + i - k] || 1); d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]]; }
      out.push(d[k]);
    }
    return out;
  }

  LS.importImage = (dataUrl, name) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width * 25.4 / 96, h = img.height * 25.4 / 96;
      const maxW = LS.device.ancho * 0.6, maxH = LS.device.alto * 0.6; const s = Math.min(1, maxW / w, maxH / h); w *= s; h *= s;
      const layer = LS.firstImageLayer();
      const o = D.add({ kind: 'image', src: dataUrl, w, h, tx: G.tr((LS.device.ancho - w) / 2, (LS.device.alto - h) / 2), layer, ajustes: Object.assign({}, LS.IMG_DEFAULT, { herramienta: 'linea' }), nombre: name });
      resolve([o]);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = dataUrl;
  });

  // ---- Texto ----
  LS.fonts = { list: [], cache: {} };
  LS.loadFontList = async () => {
    const files = await window.nativo.listFonts();
    LS.fonts.list = files.sort((a, b) => a.file.localeCompare(b.file));
    return LS.fonts.list;
  };
  LS.getFont = async (p) => {
    if (LS.fonts.cache[p]) return LS.fonts.cache[p];
    const buf = await window.nativo.readPath(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const f = window.opentype.parse(ab); LS.fonts.cache[p] = f; return f;
  };
  LS.fontDisplayName = async p => { try { const f = await LS.getFont(p); return (f.names.fullName && (f.names.fullName.es || f.names.fullName.en)) || p; } catch { return p; } };

  // Genera trazados para texto. t = {texto, fuente, tam (mm altura de mayúscula aprox.), espaciado, interlineado, alinear, soldar}
  LS.textPaths = async t => {
    const f = await LS.getFont(t.fuente);
    const size = t.tam / ((f.tables.os2 && f.tables.os2.sCapHeight) ? f.tables.os2.sCapHeight / f.unitsPerEm : 0.7);
    const lines = String(t.texto || '').split('\n');
    const lh = size * (t.interlineado || 1.2);
    const paths = [];
    // glifos carácter por carácter (evita sustituciones OpenType no soportadas por algunas fuentes)
    const toGlyphs = l => Array.from(l).map(ch => f.charToGlyph(ch));
    const kern = (a, b) => { try { return f.getKerningValue(a, b); } catch { return 0; } };
    const lineWidth = l => { const gs = toGlyphs(l); let w = 0; gs.forEach((g, i) => { w += g.advanceWidth * size / f.unitsPerEm; if (i < gs.length - 1) w += kern(g, gs[i + 1]) * size / f.unitsPerEm; }); return w + Math.max(0, gs.length - 1) * (t.espaciado || 0); };
    const widths = lines.map(lineWidth);
    const maxW = Math.max(...widths, 0);
    lines.forEach((line, li) => {
      let x = t.alinear === 'centro' ? (maxW - widths[li]) / 2 : t.alinear === 'derecha' ? maxW - widths[li] : 0;
      const y = li * lh + size * 0.8;
      const glyphs = toGlyphs(line);
      glyphs.forEach((g, gi) => {
        const p = g.getPath(x, y, size);
        let cur = null; let last = [0, 0];
        for (const c of p.commands) {
          if (c.type === 'M') { if (cur && cur.pts.length > 1) paths.push(cur); cur = { pts: [[c.x, c.y]], closed: true }; last = [c.x, c.y]; }
          else if (c.type === 'L') { cur.pts.push([c.x, c.y]); last = [c.x, c.y]; }
          else if (c.type === 'C') { G.cubic(cur.pts, last, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y], 0.01); last = [c.x, c.y]; }
          else if (c.type === 'Q') { G.quad(cur.pts, last, [c.x1, c.y1], [c.x, c.y], 0.01); last = [c.x, c.y]; }
          else if (c.type === 'Z') { if (cur && cur.pts.length > 1) paths.push(cur); cur = null; }
        }
        if (cur && cur.pts.length > 1) paths.push(cur);
        let adv = g.advanceWidth * size / f.unitsPerEm;
        if (gi < glyphs.length - 1) adv += kern(g, glyphs[gi + 1]) * size / f.unitsPerEm;
        x += adv + (t.espaciado || 0);
      });
    });
    if (t.soldar && paths.length) return LS.ops.booleanPaths(paths, [], 'union');
    return paths;
  };
})(window.LS);
