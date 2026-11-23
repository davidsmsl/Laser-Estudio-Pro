// Procesamiento de imágenes: ajustes, escala de grises y tramados (dithering).
(function (LS) {
  const G = LS.G;
  // herramienta: 'linea' (línea a línea), 'tramado' (1 bit), 'vector', 'central', 'passthrough'
  LS.IMG_DEFAULT = { brillo: 0, contraste: 0, gamma: 1, invertir: false, tramado: 'floyd', umbral: 128, realce: 0,
    herramienta: null, bn: false, blancos: 0, redim: 'suave', grises: 'lum', pr: 30, pg: 59, pb: 11, direccion: 'horizontal' };
  // Modo efectivo de tramado según la herramienta (compatible con proyectos anteriores)
  LS.imgMode = a => {
    const h = a.herramienta || (a.tramado === 'grises' ? 'linea' : a.tramado === 'umbral' ? 'linea' : 'tramado');
    if (h === 'linea') return (a.bn || (!a.herramienta && a.tramado === 'umbral')) ? 'umbral' : 'grises';
    if (h === 'passthrough') return 'passthrough';
    if (h === 'vector' || h === 'central') return 'umbral';
    return a.tramado === 'grises' || a.tramado === 'umbral' ? 'floyd' : a.tramado;
  };
  LS.imgTool = a => a.herramienta || (a.tramado === 'grises' || a.tramado === 'umbral' ? 'linea' : 'tramado');
  LS.DIR_ANG = { horizontal: 0, vertical: 90, diagonal: 45 };
  LS.DITHERS = { umbral: 'Umbral', floyd: 'Floyd–Steinberg', jarvis: 'Jarvis', stucki: 'Stucki', atkinson: 'Atkinson', sierra: 'Sierra', bayer: 'Ordenado (Bayer)', grises: 'Escala de grises (3D)', halftone: 'Semitono' };

  // gris: Float32Array 0..255 (0 negro = máximo grabado)
  function adjust(gray, w, h, a) {
    const c = (a.contraste || 0) / 100, br = (a.brillo || 0) * 2.55, g = a.gamma || 1;
    const f = (1 + c) / (1 - Math.min(c, 0.99));
    let out = gray;
    if (LS.imgMode(a) === 'passthrough') return Float32Array.from(gray);
    if (a.realce > 0) { // máscara de enfoque simple
      out = new Float32Array(gray.length); const k = a.realce / 100;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; let s = 0, n = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) { const X = x + xx, Y = y + yy; if (X >= 0 && Y >= 0 && X < w && Y < h) { s += gray[Y * w + X]; n++; } }
        out[i] = gray[i] + k * 2 * (gray[i] - s / n);
      }
    }
    for (let i = 0; i < out.length; i++) {
      let v = (out[i] - 128) * f + 128 + br;
      v = Math.max(0, Math.min(255, v));
      v = 255 * Math.pow(v / 255, 1 / g);
      if (a.blancos > 0 && v >= 255 * (1 - a.blancos / 100)) v = 255; // blancos: aclara los tonos casi blancos
      if (a.invertir) v = 255 - v;
      out[i] = v;
    }
    return out;
  }
  const KERNELS = {
    floyd: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]], div_floyd: 16,
    jarvis: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]], div_jarvis: 48,
    stucki: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]], div_stucki: 42,
    atkinson: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]], div_atkinson: 8,
    sierra: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]], div_sierra: 32,
  };
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // Devuelve potencia 0..1 por píxel (1 = grabar a máxima potencia)
  function dither(gray, w, h, a) {
    const mode = LS.imgMode(a), out = new Float32Array(w * h);
    if (mode === 'passthrough') { for (let i = 0; i < out.length; i++) out[i] = gray[i] < 128 ? 1 : 0; return out; }
    if (mode === 'grises') { for (let i = 0; i < out.length; i++) out[i] = 1 - gray[i] / 255; return out; }
    if (mode === 'umbral') { const t = a.umbral ?? 128; for (let i = 0; i < out.length; i++) out[i] = gray[i] < t ? 1 : 0; return out; }
    if (mode === 'bayer') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; out[i] = gray[i] < (BAYER[y & 3][x & 3] + 0.5) * 16 ? 1 : 0; } return out; }
    if (mode === 'halftone') {
      const cell = 6; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = Math.floor(x / cell) * cell + cell / 2, cy = Math.floor(y / cell) * cell + cell / 2;
        const v = gray[Math.min(h - 1, Math.floor(cy)) * w + Math.min(w - 1, Math.floor(cx))];
        const r = (1 - v / 255) * cell * 0.72; out[y * w + x] = Math.hypot(x + .5 - cx, y + .5 - cy) < r ? 1 : 0;
      } return out;
    }
    const k = KERNELS[mode] || KERNELS.floyd, div = KERNELS['div_' + mode] || 16;
    const buf = Float32Array.from(gray);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, old = buf[i], nw = old < 128 ? 0 : 255, err = old - nw;
      out[i] = nw === 0 ? 1 : 0;
      for (const [dx, dy, wt] of k) { const X = x + dx, Y = y + dy; if (X >= 0 && X < w && Y < h) buf[Y * w + X] += err * wt / div; }
    }
    return out;
  }
  // Pesos de la escala de grises: luminosidad estándar, promedio o personalizados (Rojo/Verde/Azul)
  function pesos(a) {
    if (!a || a.grises === 'lum') return [0.299, 0.587, 0.114];
    if (a.grises === 'prom') return [1 / 3, 1 / 3, 1 / 3];
    const t = (a.pr || 0) + (a.pg || 0) + (a.pb || 0) || 1; return [(a.pr || 0) / t, (a.pg || 0) / t, (a.pb || 0) / t];
  }
  function grayFrom(img, w, h, a) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
    cx.imageSmoothingEnabled = !(a && a.redim === 'nitido'); cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), [wr, wg, wb] = pesos(a);
    for (let i = 0; i < g.length; i++) { const al = d[i * 4 + 3] / 255; g[i] = (wr * d[i * 4] + wg * d[i * 4 + 1] + wb * d[i * 4 + 2]) * al + 255 * (1 - al); }
    return g;
  }
  // Vista previa. opts.lineas = { porMm, anchoMm } simula las líneas del grabado (como "Vista previa de líneas")
  LS.processImagePreview = (img, aj, opts = {}) => {
    aj = Object.assign({}, LS.IMG_DEFAULT, aj);
    const maxPx = opts.maxPx || 900, s = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const pw = dither(adjust(grayFrom(img, w, h, aj), w, h, aj), w, h, aj);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'), id = cx.createImageData(w, h);
    let paso = 0;
    if (opts.lineas && opts.lineas.porMm > 0 && opts.lineas.anchoMm > 0) { const pxmm = w / opts.lineas.anchoMm; paso = pxmm / opts.lineas.porMm; if (paso < 1.6) paso = 0; }
    const ang = LS.DIR_ANG[aj.direccion] || 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = 255 - pw[i] * 255;
      if (paso) { const t = ang === 90 ? x : ang === 45 ? (x + y) / Math.SQRT2 : y; if ((t % paso) > Math.max(1, paso * 0.55)) v = 255; }
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    cx.putImageData(id, 0, 0); return c;
  };
  LS.binaryFrom = (img, aj, maxPx) => { // imagen binaria (1 = grabar) para vectorizar o línea central
    aj = Object.assign({}, LS.IMG_DEFAULT, aj, { herramienta: 'vector' });
    const s = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const g = adjust(grayFrom(img, w, h, aj), w, h, aj), t = aj.umbral ?? 128, bin = new Uint8Array(w * h);
    for (let i = 0; i < bin.length; i++) bin[i] = g[i] < t ? 1 : 0;
    return { w, h, bin };
  };

  // Rasteriza un objeto imagen para el trabajo: rejilla alineada a los ejes con paso = intervalo
  // Rasteriza un objeto imagen para el trabajo. La rejilla se orienta según la dirección de barrido
  // (horizontal 0°, vertical 90°, diagonal 45°); r.map convierte puntos de la rejilla al lienzo.
  LS.rasterize = (obj, interval) => {
    const entry = LS.imgCache[obj.id];
    if (!entry || !entry.img) throw new Error('La imagen aún no se ha cargado.');
    const img = entry.img, aj = Object.assign({}, LS.IMG_DEFAULT, obj.ajustes);
    const ang = LS.DIR_ANG[aj.direccion] || 0, Rg = G.rot(-ang), Rw = G.rot(ang);
    const corners = [[0, 0], [obj.w, 0], [obj.w, obj.h], [0, obj.h]].map(p => G.apply(Rg, G.apply(obj.tx, p)));
    const b = G.bbox(corners);
    const cols = Math.max(1, Math.round(b.w / interval)), rows = Math.max(1, Math.round(b.h / interval));
    if (cols * rows > 60e6) throw new Error('La imagen es demasiado grande para el intervalo elegido. Aumente el intervalo.');
    const sx = obj.w / interval, sy = obj.h / interval;
    const gw = Math.max(1, Math.round(Math.hypot(obj.tx[0], obj.tx[1]) * sx)), gh = Math.max(1, Math.round(Math.hypot(obj.tx[2], obj.tx[3]) * sy));
    const gray = adjust(grayFrom(img, gw, gh, aj), gw, gh, aj);
    const inv = G.mul(G.inv(obj.tx), Rw);
    const g2 = new Float32Array(cols * rows).fill(255);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lp = G.apply(inv, [b.x0 + (c + 0.5) * interval, b.y0 + (r + 0.5) * interval]);
      const u = Math.floor(lp[0] / obj.w * gw), v = Math.floor(lp[1] / obj.h * gh);
      if (u >= 0 && v >= 0 && u < gw && v < gh) g2[r * cols + c] = gray[v * gw + u];
    }
    const power = dither(g2, cols, rows, aj);
    return { x0: b.x0, y0: b.y0, step: interval, cols, rows, power, gris: LS.imgMode(aj) === 'grises', map: ang ? (p => G.apply(Rw, p)) : null };
  };
  LS.grayFrom = grayFrom;
})(window.LS);
