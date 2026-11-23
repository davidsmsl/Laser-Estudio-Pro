// Escritor de G-code para controladores GRBL (láser de diodo, CO2 con GRBL).
(function (LS) {
  const D = LS.D, J = LS.jobs;
  const f3 = v => (Math.round(v * 1000) / 1000).toString();

  // Ejes que se ponen a cero con G92 al iniciar: los lineales en modo posición actual/usuario
  // y siempre el eje Z cuando lleva el rotativo (su giro es relativo a la posición actual).
  function zeroAxes(o) {
    const L = J.axisLetters(), z = [];
    if (o.origenTrabajo === 'actual') L.filter(a => a !== 'Z').forEach(a => z.push(a)); // 'usuario' ya usa coordenadas absolutas
    if (L.includes('Z')) z.push('Z');
    // rotativo en el conector Y: el giro siempre parte de la posición actual del objeto
    if (LS.rotary.activo && J.rotaryAxis() === 'Y' && LS.device.tipo === 'grbl' && !z.includes('Y')) z.push('Y');
    return z;
  }
  // Regreso al punto de partida: ejes puestos a 0 con G92 vuelven a 0; los demás a la posición capturada
  function regreso(A1, A2, zero, inicio) {
    if (!inicio) return null;
    const v = a => zero.includes(a) ? 0 : inicio[a];
    const p = [A1, A2].filter(a => v(a) != null && isFinite(v(a))).map(a => a + f3(v(a)));
    return p.length ? 'G0 ' + p.join(' ') : null;
  }
  LS.regresoGcode = regreso;
  LS.toGcode = (job, opts = {}) => {
    const dev = LS.device, map = J.machineMapper(job, opts);
    const o = Object.assign({}, J.options, opts);
    const out = [];
    const est = J.estimate(job);
    out.push('; Láser Estudio Pro — G-code para GRBL');
    out.push(`; Dispositivo: ${dev.nombre}  Área: ${dev.ancho}×${dev.alto} mm  Origen: ${dev.origen}`);
    out.push(`; Tiempo estimado: ${J.fmtTime(est.segundos)}`);
    const [A1, A2] = J.axisLetters(), rotLetter = J.rotaryAxis() === 'Z' ? 'Z' : 'Y';
    if (LS.rotary.activo) out.push(`; Rotativo activo: ${LS.ROTARY_PRESETS[LS.rotary.modelo]?.nombre || 'personalizado'}  conectado al puerto ${rotLetter}  orientación ${J.rotaryOrient()}  factor ${rotLetter}=${J.rotaryFactor().toFixed(5)}  Ø objeto ${LS.rotary.diamObjeto} mm`);
    out.push('G00 G17 G40 G21 G54');
    out.push('G90');
    const zero = zeroAxes(o);
    if (zero.length) out.push(`G92 ${zero.map(a => a + '0').join(' ')} ; origen en la posición actual del láser/objeto`);
    const seco = !!o.seco; // ensayo: la máquina se mueve con el láser apagado
    if (seco) out.push('; ENSAYO SIN LÁSER: potencia en cero en todo el recorrido', 'M5 S0');
    else out.push(dev.modoLaser === 'M3' ? 'M3 S0' : 'M4 S0');
    let lastF = null, lastS = null, lastLayer = null, air = false, X = null, Y = null, warnedZ = false; let prevB = null; const rotOn = !!LS.rotary.activo;
    const pow = (L, p) => {
      const pct = L.potMin + (L.potMax - L.potMin) * p;
      return Math.round(pct / 100 * dev.maxS);
    };
    const feed = L => Math.round(L.velocidad * (dev.unidadVelocidad === 'mm/min' ? 1 : 60));
    for (const s of job.segs) {
      const L = D.layer(s.L);
      if (s.L !== lastL()) {
        out.push(`; ---- Capa ${L.nombre} (${({ linea: 'Línea', relleno: 'Relleno', imagen: 'Imagen' })[L.modo]}) vel ${L.velocidad} ${dev.unidadVelocidad} pot ${L.potMin}-${L.potMax}% ----`);
        if (dev.aireM8 && !seco) { if (L.aire && !air) { out.push('M8'); air = true; } else if (!L.aire && air) { out.push('M9'); air = false; } }
        lastLayer = s.L;
      }
      if (s.z) {
        if (A1 === 'Z' || A2 === 'Z') { if (!warnedZ) { out.push('; Paso Z por pasada omitido: el puerto Z está ocupado por el rotativo'); warnedZ = true; } }
        else out.push(`G91 G0 Z${f3(-s.z)}`, 'G90');
      }
      const [x, y] = map(s.b[0], s.b[1]);
      const bPrev = prevB; prevB = s.b;
      if (!s.on && !s.scan) {
        // viaje rápido
        if (x === X && y === Y) continue;
        out.push(`G0 ${A1}${f3(x)} ${A2}${f3(y)}`); X = x; Y = y; lastS = null; continue;
      }
      const S = s.on && !seco ? pow(L, s.p) : 0;
      let line = 'G1';
      if (x !== X) line += ` ${A1}` + f3(x);
      if (y !== Y) line += ` ${A2}` + f3(y);
      if (line === 'G1') continue;
      if (S !== lastS) { line += ' S' + S; lastS = S; }
      // con rotativo las distancias del eje de giro están escaladas: el avance (F) se escala igual para que
      // la velocidad sobre la superficie del objeto sea la de la capa (GRBL aplica F a las unidades del eje)
      let F = feed(L);
      if (rotOn && bPrev) {
        const d0 = LS.toDisp(bPrev[0], bPrev[1]), d1 = LS.toDisp(s.b[0], s.b[1]);
        const sup = Math.hypot(d1[0] - d0[0], d1[1] - d0[1]), eje = Math.hypot(x - X, y - Y);
        if (sup > 1e-6) F = Math.max(1, Math.round(F * eje / sup));
      }
      if (F !== lastF) { line += ' F' + F; lastF = F; }
      out.push(line); X = x; Y = y;
    }
    function lastL() { return lastLayer; }
    if (air) out.push('M9');
    out.push('M5 S0');
    const vuelta = regreso(A1, A2, zero, o.volverA);
    if (vuelta) out.push('G90', vuelta);
    else if (dev.volverOrigen) { const u = o.origenTrabajo === 'usuario' && o.origenUsuario && A1 === 'X' && A2 === 'Y' ? o.origenUsuario : [0, 0]; out.push(`G0 ${A1}${f3(u[0])} ${A2}${f3(u[1])}`); }
    if (zero.length) out.push('G92.1');
    out.push('M2');
    return out.join('\n') + '\n';
  };

  // Marco (contorno del trabajo) con el láser apagado o a baja potencia
  LS.frameGcode = (job, opts, circular, inicio) => {
    const dev = LS.device, map = J.machineMapper(job, opts), b = job.bbox;
    const pts = circular ? [] : [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1], [b.x0, b.y0]];
    const out = ['G90', 'G21'];
    const o = Object.assign({}, J.options, opts);
    const [A1, A2] = J.axisLetters(), zero = zeroAxes(o);
    if (zero.length) out.push(`G92 ${zero.map(a => a + '0').join(' ')}`);
    // luz de baja intensidad: o.luz (botón "Marco con luz") o el ajuste del dispositivo
    const luz = o.luz != null ? !!o.luz : (dev.marcoLuz != null ? !!dev.marcoLuz : (dev.potenciaMarco || 0) > 0);
    const pct = luz ? Math.min(5, dev.potenciaMarco > 0 ? dev.potenciaMarco : 1) : 0;
    const S = Math.round(pct / 100 * dev.maxS), F = dev.velMarco || 3000;
    const vueltas = Math.max(1, Math.min(20, Math.round(o.repeticiones || dev.repeticionesMarco || 1)));
    // viaje a la primera esquina con el láser apagado (no deja una línea desde donde estaba el cabezal)
    out.push('M5');
    if (pts.length) { const [x, y] = map(pts[0][0], pts[0][1]); out.push(`G0 ${A1}${f3(x)} ${A2}${f3(y)}`); }
    out.push(S > 0 ? `M3 S${S}` : 'M5');
    for (let v = 0; v < vueltas; v++) pts.slice(1).forEach((p, i) => {
      const [x, y] = map(p[0], p[1]); let Fm = F;
      if (LS.rotary.activo) { const q = pts[i], [qx, qy] = map(q[0], q[1]), a = LS.toDisp(q[0], q[1]), b = LS.toDisp(p[0], p[1]), sup = Math.hypot(b[0] - a[0], b[1] - a[1]); if (sup > 1e-6) Fm = Math.max(1, Math.round(F * Math.hypot(x - qx, y - qy) / sup)); }
      out.push(`G1 ${A1}${f3(x)} ${A2}${f3(y)} F${Fm}`);
    });
    out.push('M5 S0');
    // siempre vuelve a donde partió (antes de G92.1, para que los ejes en G92 regresen a su 0)
    const vuelta = regreso(A1, A2, zero, inicio) || (zero.length ? `G0 ${A1}0 ${A2}0` : null);
    if (vuelta) out.push('G90', vuelta);
    if (zero.length) out.push('G92.1');
    return out;
  };
})(window.LS);
