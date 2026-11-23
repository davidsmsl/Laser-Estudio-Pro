// Codificador de trabajos para controladores Ruida (RDC644x y similares) — formato .rd
// Basado en la documentación pública del protocolo (proyectos abiertos como MeerK40t).
// Estado: experimental. Verifique primero con "Marco" y una prueba pequeña.
(function (LS) {
  const D = LS.D, J = LS.jobs;
  const R = {};
  R.MAGIC = 0x88;

  // números de 7 bits por byte, big-endian
  const num = (v, n) => { v = Math.round(v); const out = []; for (let i = n - 1; i >= 0; i--) out.push((v >> (7 * i)) & 0x7F); return out; };
  const abs = mm => { let v = Math.round(mm * 1000); if (v < 0) v += 34359738368; /* complemento a 2 en 35 bits */ const o = []; for (let i = 4; i >= 0; i--) o.push(Math.floor(v / Math.pow(128, i)) & 0x7F); return o; };
  const power = pct => num(Math.max(0, Math.min(100, pct)) * 0x3FFF / 100, 2);
  const speed = mms => abs(mms); // µm/s con 5 bytes
  const color = hex => { const n = parseInt(hex.slice(1), 16); const bgr = ((n & 255) << 16) | (n & 0xFF00) | (n >> 16); return abs(bgr / 1000); };

  R.encodeJob = (job, opts = {}) => {
    const dev = LS.device, map = J.machineMapper(job, opts);
    const o = Object.assign({}, J.options, opts);
    const b = [];
    const P = (...a) => a.forEach(x => Array.isArray(x) ? b.push(...x) : b.push(x));
    // límites
    let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    job.segs.forEach(s => { [s.a, s.b].forEach(p => { const m = map(p[0], p[1]); mn = [Math.min(mn[0], m[0]), Math.min(mn[1], m[1])]; mx = [Math.max(mx[0], m[0]), Math.max(mx[1], m[1])]; }); });
    const layers = [...new Set(job.segs.map(s => s.L))];
    const layerIdx = new Map(layers.map((l, i) => [l, i]));
    P(0xD8, 0x12); // UploadFollow
    P(0xF0);
    P(0xF1, 0x02, 0x00);
    P(0xD8, o.origenTrabajo === 'actual' ? 0x10 : 0x12); // modo de punto de referencia: 0x12 absoluto, 0x10 posición actual
    P(0xE7, 0x06, abs(0), abs(0));
    P(0xE7, 0x03, abs(mn[0]), abs(mn[1]));
    P(0xE7, 0x07, abs(mx[0]), abs(mx[1]));
    P(0xE7, 0x50, abs(mn[0]), abs(mn[1]));
    P(0xE7, 0x51, abs(mx[0]), abs(mx[1]));
    P(0xE7, 0x04, 0x00, 0x01, 0x00, 0x01, abs(0), abs(0));
    P(0xE7, 0x05, 0x00);
    // tabla de capas
    layers.forEach(l => {
      const L = D.layer(l), i = layerIdx.get(l);
      P(0xC9, 0x04, i, speed(L.velocidad));
      P(0xC6, 0x31, i, power(o.seco ? 0 : L.potMin));
      P(0xC6, 0x32, i, power(o.seco ? 0 : L.potMax));
      P(0xC6, 0x41, i, power(L.potMin));
      P(0xC6, 0x42, i, power(L.potMax));
      P(0xCA, 0x06, i, color(L.color));
      P(0xCA, 0x41, i, 0x00);
      P(0xE7, 0x52, i, abs(mn[0]), abs(mn[1]));
      P(0xE7, 0x53, i, abs(mx[0]), abs(mx[1]));
      P(0xE7, 0x61, i, abs(mn[0]), abs(mn[1]));
      P(0xE7, 0x62, i, abs(mx[0]), abs(mx[1]));
    });
    P(0xCA, 0x22, layers.length - 1);
    P(0xE7, 0x54, 0x00, abs(0), abs(0));
    P(0xE7, 0x54, 0x01, abs(0), abs(0));
    P(0xE7, 0x55, 0x00, abs(0), abs(0));
    P(0xE7, 0x55, 0x01, abs(0), abs(0));
    P(0xF1, 0x03, abs(0), abs(0));
    P(0xF1, 0x00, 0x00);
    P(0xF1, 0x01, 0x00);
    P(0xF2, 0x00, 0x00);
    P(0xF2, 0x01, 0x00);
    P(0xF2, 0x02, 0x05, 0x2A, 0x1F, 0x5C, 0x5B, 0x00, 0x00);
    P(0xF2, 0x03, abs(mn[0]), abs(mn[1]));
    P(0xF2, 0x04, abs(mx[0]), abs(mx[1]));
    P(0xF2, 0x06, abs(0), abs(0));
    P(0xF2, 0x07, 0x00);
    P(0xF2, 0x05, 0x00, 0x01, 0x00, 0x01, abs(mx[0] - mn[0]), abs(mx[1] - mn[1]));
    P(0xEA, 0x00);
    P(0xE7, 0x60, 0x00);
    P(0xE7, 0x13, abs(mn[0]), abs(mn[1]));
    P(0xE7, 0x17, abs(mx[0]), abs(mx[1]));
    P(0xE7, 0x23, abs(mn[0]), abs(mn[1]));
    P(0xE7, 0x24, 0x00);
    P(0xE7, 0x08, 0x00, 0x01, 0x00, 0x01, abs(0), abs(0));
    // cuerpo
    let lastL = null, lastP = null, curPos = null;
    for (const s of job.segs) {
      const L = D.layer(s.L);
      if (s.L !== lastL) {
        const i = layerIdx.get(s.L);
        P(0xCA, 0x01, 0x00);
        P(0xCA, 0x02, i);
        P(0xCA, 0x01, 0x30);
        P(0xCA, 0x01, 0x10);
        P(0xCA, 0x01, 0x13);
        P(0xC9, 0x02, speed(L.velocidad));
        P(0xC6, 0x12, abs(0)); P(0xC6, 0x13, abs(0)); // retardos encendido/apagado
        P(0xC6, 0x01, power(L.potMin));
        P(0xC6, 0x02, power(L.potMax));
        P(0xC6, 0x21, power(L.potMin));
        P(0xC6, 0x22, power(L.potMax));
        P(0xCA, 0x03, 0x01);
        P(0xCA, 0x10, 0x00);
        if (L.aire) P(0xCA, 0x01, 0x13); else P(0xCA, 0x01, 0x12);
        lastL = s.L; lastP = null;
      }
      const a = map(s.a[0], s.a[1]), e = map(s.b[0], s.b[1]);
      if (!curPos || Math.abs(curPos[0] - a[0]) > 1e-4 || Math.abs(curPos[1] - a[1]) > 1e-4) P(0x88, abs(a[0]), abs(a[1]));
      if (s.on && !o.seco) {
        const pct = L.potMin + (L.potMax - L.potMin) * s.p;
        if (L.modo === 'imagen' && pct !== lastP) { P(0xC6, 0x01, power(pct)); P(0xC6, 0x02, power(pct)); lastP = pct; }
        P(0xA8, abs(e[0]), abs(e[1]));
      } else P(0x88, abs(e[0]), abs(e[1]));
      curPos = e;
    }
    P(0xEB); // fin de bloque
    P(0xE7, 0x00);
    P(0xDA, 0x01, 0x06, 0x20, abs(0), abs(0));
    P(0xD7); // EOF
    return new Uint8Array(b);
  };

  R.swizzleByte = (x, m = R.MAGIC) => { x ^= (x >> 7) & 0xFF; x ^= (x << 7) & 0xFF; x ^= (x >> 7) & 0xFF; x ^= m; return (x + 1) & 0xFF; };
  R.unswizzleByte = (x, m = R.MAGIC) => { x = (x - 1) & 0xFF; x ^= m; x ^= (x >> 7) & 0xFF; x ^= (x << 7) & 0xFF; x ^= (x >> 7) & 0xFF; return x; };
  R.swizzle = data => Uint8Array.from(data, x => R.swizzleByte(x));
  R.unswizzle = data => Uint8Array.from(data, x => R.unswizzleByte(x));
  // Paquetes UDP: [checksum 2 bytes][datos codificados], máx. 1470 bytes de datos
  R.packets = data => {
    const sw = R.swizzle(data), out = [];
    for (let i = 0; i < sw.length; i += 1470) {
      const chunk = sw.slice(i, i + 1470); let sum = 0; chunk.forEach(v => sum += v);
      out.push([(sum >> 8) & 0xFF, sum & 0xFF, ...chunk]);
    }
    return out;
  };
  // Comandos de control directos
  R.cmd = {
    detener: () => [0xD8, 0x01], pausar: () => [0xD8, 0x02], reanudar: () => [0xD8, 0x03],
    homeXY: () => [0xD8, 0x2A], homeZ: () => [0xD8, 0x2C],
    moverAbs: (x, y) => [0xD9, 0x10, 0x00, ...abs(x), ...abs(y)],
    moverX: (x) => [0xD9, 0x00, 0x02, ...abs(x)], moverY: (y) => [0xD9, 0x01, 0x02, ...abs(y)],
    moverZRel: (z) => [0xD9, 0x02, 0x02, ...abs(z)],
    leerPosX: () => [0xDA, 0x00, 0x04, 0x21], leerPosY: () => [0xDA, 0x00, 0x04, 0x31],
    estado: () => [0xDA, 0x00, 0x04, 0x00]
  };
  R.decodeNumber = bytes => { let v = 0; for (const x of bytes) v = v * 128 + (x & 0x7F); return v; };
  LS.ruida = R;
})(window.LS);
