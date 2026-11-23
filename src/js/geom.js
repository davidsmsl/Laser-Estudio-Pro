// Geometría: matrices afines [a,b,c,d,e,f], aplanado de curvas, intersecciones.
window.LS = window.LS || {};
(function (LS) {
  const G = {};
  G.I = () => [1, 0, 0, 1, 0, 0];
  G.mul = (m, n) => [ // m·n (aplica n primero)
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
  G.tr = (x, y) => [1, 0, 0, 1, x, y];
  G.sc = (sx, sy) => [sx, 0, 0, sy, 0, 0];
  G.rot = deg => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
  G.about = (m, x, y) => G.mul(G.tr(x, y), G.mul(m, G.tr(-x, -y)));
  G.apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  G.inv = m => {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  };
  G.angleOf = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;

  G.bbox = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };
  G.union = (a, b) => !a ? b : !b ? a : ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), get w() { return this.x1 - this.x0; }, get h() { return this.y1 - this.y0; } });

  // Aplanado de curvas con tolerancia en mm
  G.TOL = 0.02;
  G.cubic = (out, p0, p1, p2, p3, tol = G.TOL) => {
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    const n = Math.max(2, Math.min(400, Math.ceil(Math.sqrt(d / tol) * 0.6)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  };
  G.quad = (out, p0, p1, p2, tol) => G.cubic(out, p0,
    [p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1])],
    [p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1])], p2, tol);
  // Arco SVG (endpoint) -> puntos
  G.arc = (out, p0, rx, ry, phi, fa, fs, p1, tol = G.TOL) => {
    if (rx === 0 || ry === 0) { out.push(p1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const r = phi * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
    const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    let lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    if (fa === fs) co = -co;
    const cx1 = co * rx * y1 / ry, cy1 = -co * ry * x1 / rx;
    const cx = c * cx1 - s * cy1 + (p0[0] + p1[0]) / 2, cy = s * cx1 + c * cy1 + (p0[1] + p1[1]) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) * Math.sqrt(Math.max(rx, ry) / tol) / 2));
    for (let i = 1; i <= n; i++) {
      const t = t1 + dt * i / n;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      out.push([c * ex - s * ey + cx, s * ex + c * ey + cy]);
    }
  };

  // Analiza un atributo "d" de SVG -> [{pts, closed}]
  G.parsePathD = (d, tol) => {
    const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const paths = []; let cur = null; let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
    const num = () => parseFloat(toks[i++]);
    const start = () => { if (cur && cur.pts.length > 1) paths.push(cur); cur = { pts: [[x, y]], closed: false }; };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { if (cur) { cur.closed = true; paths.push(cur); } x = sx; y = sy; cur = null; lq = null; lcx = x; lcy = y; continue; }
      if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) { i++; continue; }
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; start(); cmd = rel ? 'l' : 'L'; lcx = x; lcy = y; lq = null; continue; }
      if (!cur) start();
      if (C === 'L') { x = ox + num(); y = oy + num(); cur.pts.push([x, y]); lcx = x; lcy = y; lq = null; }
      else if (C === 'H') { x = ox + num(); cur.pts.push([x, y]); lcx = x; lcy = y; lq = null; }
      else if (C === 'V') { y = oy + num(); cur.pts.push([x, y]); lcx = x; lcy = y; lq = null; }
      else if (C === 'C') { const a = [ox + num(), oy + num()], b = [ox + num(), oy + num()], e = [ox + num(), oy + num()]; G.cubic(cur.pts, [x, y], a, b, e, tol); lcx = b[0]; lcy = b[1]; x = e[0]; y = e[1]; lq = null; }
      else if (C === 'S') { const a = [2 * x - lcx, 2 * y - lcy], b = [ox + num(), oy + num()], e = [ox + num(), oy + num()]; G.cubic(cur.pts, [x, y], a, b, e, tol); lcx = b[0]; lcy = b[1]; x = e[0]; y = e[1]; lq = null; }
      else if (C === 'Q') { const a = [ox + num(), oy + num()], e = [ox + num(), oy + num()]; G.quad(cur.pts, [x, y], a, e, tol); lq = a; x = e[0]; y = e[1]; lcx = x; lcy = y; }
      else if (C === 'T') { const a = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y], e = [ox + num(), oy + num()]; G.quad(cur.pts, [x, y], a, e, tol); lq = a; x = e[0]; y = e[1]; lcx = x; lcy = y; }
      else if (C === 'A') { const rx = num(), ry = num(), ph = num(), fa = num(), fs = num(); const e = [ox + num(), oy + num()]; G.arc(cur.pts, [x, y], rx, ry, ph, !!fa, !!fs, e, tol); x = e[0]; y = e[1]; lcx = x; lcy = y; lq = null; }
      else i++;
    }
    if (cur && cur.pts.length > 1) paths.push(cur);
    return paths;
  };

  G.pointInPoly = (p, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  G.distSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  G.pathLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  G.segIntersects = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  G.uid = () => Math.random().toString(36).slice(2, 10);
  LS.G = G;
})(window.LS);
