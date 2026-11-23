// Simulación del rotativo: muestra cómo se forma el grabado sobre la pieza (cilindro recto o cono)
// y una "salida tipo papel" plana, con el sentido de giro, para compararla con la máquina real.
(function () {
  const LS = window.LS;
  const S = LS.rotSim = {};

  S.open = () => {
    const R = LS.rotary, J = LS.jobs;
    if (!R.activo) { LS.ui.toast('Active el rotativo (Láser → Rotativo) para simular el giro de la pieza.', 'err'); return; }
    let job;
    try { job = J.build(Object.assign({}, J.options)); } catch (e) { LS.ui.toast(e.message || String(e), 'err'); return; }
    const segs = job.segs;
    if (!segs.some(s => s.on)) { LS.ui.toast('El trabajo no tiene nada que grabar.', 'err'); return; }

    // ---- geometría: eje del rotativo y coordenadas sobre la pieza ----
    const g = LS.rotaryGeom(), u = LS.jobs.rotaryOrient() === 'vertical' ? [0, 1] : [1, 0], n = [-u[1], u[0]];
    const along = p => (p[0] - g.c[0]) * u[0] + (p[1] - g.c[1]) * u[1];   // mm a lo largo del eje (izquierda → derecha)
    const around = p => (p[0] - g.c[0]) * n[0] + (p[1] - g.c[1]) * n[1];  // mm alrededor (hacia abajo en el lienzo)
    const cono = R.forma === 'cono', d1 = R.diamObjeto || 50, d2 = cono ? (R.diamObjeto2 || d1) : d1;
    const lo = R.largoObjeto || 200;
    const diamEn = a => cono ? d1 + (d2 - d1) * Math.max(0, Math.min(1, (a + lo / 2) / lo)) : d1;

    // límites del grabado en coordenadas de la pieza
    let a0 = Infinity, a1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const s of segs) if (s.on) for (const p of [s.a, s.b]) { const a = along(p), v = around(p); a0 = Math.min(a0, a); a1 = Math.max(a1, a); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const margenA = Math.max(10, (a1 - a0) * 0.12);
    const A0 = Math.min(a0 - margenA, -lo / 2), A1 = Math.max(a1 + margenA, lo / 2);

    // ---- textura del grabado (coordenadas along/around), se pinta a medida que avanza ----
    const k = Math.min(6, 1400 / Math.max(1, A1 - A0), 1400 / Math.max(1, (v1 - v0) + 20));
    const tex = document.createElement('canvas');
    const TV0 = v0 - 10; tex.width = Math.ceil((A1 - A0) * k); tex.height = Math.ceil((v1 - v0 + 20) * k);
    const tx = tex.getContext('2d'); tx.lineCap = 'round';
    const T = p => [(along(p) - A0) * k, (around(p) - TV0) * k];

    // tiempos de cada tramo (estimados) para animar al ritmo real
    const rapid = LS.device.velRapida || 100, mmmin = LS.device.unidadVelocidad === 'mm/min';
    const dur = segs.map(s => { const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); const v = mmmin ? s.F / 60 : s.F; return (s.on || s.scan) ? l / Math.max(0.1, v) : l / rapid; });
    const acum = []; let tot = 0; dur.forEach(d => { acum.push(tot); tot += d; });

    const fmt = t => { t = Math.max(0, Math.round(t)); const m = Math.floor(t / 60); return m ? `${m} min ${t % 60} s` : `${t} s`; };
    const body = `
      <div class="rs-wrap">
        <div class="rs-tit">Vista de frente de la pieza ${cono ? '(cónica)' : '(cilindro recto)'} — la línea roja es donde pega el láser</div>
        <canvas id="rs-cil" width="760" height="260"></canvas>
        <div class="rs-tit">Salida tipo papel (pieza desenrollada) — lo grabado se aleja de la línea del láser en el sentido en que gira la pieza</div>
        <canvas id="rs-pap" width="760" height="230"></canvas>
        <div class="rs-ctl">
          <button id="rs-play">⏸ Pausa</button>
          <button id="rs-rei">⏮ Reiniciar</button>
          <label>Velocidad <select id="rs-vel"><option value="auto" selected>Automática (~20 s)</option><option value="1">×1 (real)</option><option value="5">×5</option><option value="20">×20</option><option value="60">×60</option><option value="200">×200</option></select></label>
          <input type="range" id="rs-pos" min="0" max="1000" value="0" style="flex:1">
          <span id="rs-t" class="muted"></span>
        </div>
        <div id="rs-sent" class="rs-sent"></div>
        <p class="note">La animación muestra cómo debe girar la pieza según lo que envía la app: con ▲ la parte de arriba del objeto gira <b>hacia usted</b>. Compare con la máquina: si la pieza real gira al revés que aquí (o el grabado le sale en espejo), marque o desmarque <b>«Invertir giro»</b> en el panel flotante o en Láser → Rotativo.</p>
      </div>`;

    let raf = 0, play = true, vel = Math.max(1, tot / 20), t = 0, pintado = 0, ultimo = performance.now();
    LS.dlg.open({
      title: 'Simulación del rotativo', width: 800, body,
      buttons: [{ label: 'Cerrar', primary: true }],
      onClose: () => cancelAnimationFrame(raf),
      onOpen: b => {
        const cv = b.querySelector('#rs-cil'), cx = cv.getContext('2d');
        const pv = b.querySelector('#rs-pap'), px = pv.getContext('2d');
        const bPlay = b.querySelector('#rs-play'), sPos = b.querySelector('#rs-pos'), lT = b.querySelector('#rs-t'), lS = b.querySelector('#rs-sent');
        bPlay.onclick = () => { play = !play; bPlay.textContent = play ? '⏸ Pausa' : '▶ Reproducir'; ultimo = performance.now(); };
        b.querySelector('#rs-rei').onclick = () => { t = 0; reiniciarTex(); play = true; bPlay.textContent = '⏸ Pausa'; };
        b.querySelector('#rs-vel').onchange = e => vel = e.target.value === 'auto' ? Math.max(1, tot / 20) : Number(e.target.value);
        sPos.oninput = () => { const nt = sPos.value / 1000 * tot; if (nt < t) reiniciarTex(); t = nt; };

        function reiniciarTex() { tx.clearRect(0, 0, tex.width, tex.height); pintado = 0; }
        // pinta en la textura los tramos quemados hasta el tiempo t
        function pintarHasta(t) {
          let i = pintado;
          while (i < segs.length && acum[i] + dur[i] <= t) { trazo(segs[i], 1); i++; }
          pintado = i;
          if (i < segs.length && acum[i] < t) trazo(segs[i], (t - acum[i]) / Math.max(1e-9, dur[i]), true);
        }
        function trazo(s, f, parcial) {
          if (!s.on) return;
          const a = T(s.a), e = T([s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f]);
          const p = Math.max(0.15, Math.min(1, s.p == null ? 1 : s.p));
          const c = Math.round(150 - 125 * p); tx.strokeStyle = `rgb(${c},${Math.round(c * 0.62)},${Math.round(c * 0.3)})`; tx.lineWidth = Math.max(1, (LS.D.layer(s.L).intervalo || 0.1) * k * 1.1);
          tx.beginPath(); tx.moveTo(a[0], a[1]); tx.lineTo(e[0], e[1]); tx.stroke();
        }
        // posición actual del láser (along/around) y sentido de giro
        function estado(t) {
          let i = 0, lo2 = 0, hi = segs.length - 1;
          while (lo2 <= hi) { const m = (lo2 + hi) >> 1; if (acum[m] <= t) { i = m; lo2 = m + 1; } else hi = m - 1; }
          const s = segs[i], f = Math.max(0, Math.min(1, (t - acum[i]) / Math.max(1e-9, dur[i])));
          const p = [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
          let dv = around(s.b) - around(s.a), j = i;
          while (Math.abs(dv) < 1e-6 && j > 0) { j--; dv = around(segs[j].b) - around(segs[j].a); }
          return { a: along(p), v: around(p), dv, on: s.on };
        }

        const fiL = 15 * Math.PI / 180; // la línea del láser se ve un poco por encima del centro (vista de frente)
        function dibujarCilindro(st) {
          const W = cv.width, H = cv.height;
          cx.fillStyle = '#20232a'; cx.fillRect(0, 0, W, H);
          const esc = Math.min((W - 60) / (A1 - A0), (H - 40) / Math.max(d1, d2));
          const ox = (W - (A1 - A0) * esc) / 2, cy = H / 2;
          // franjas verticales: cada columna tiene su propio radio (cono)
          const cols = cono ? 60 : 1, ancho = (A1 - A0) / cols;
          for (let c = 0; c < cols; c++) {
            const am = A0 + (c + 0.5) * ancho, Rmm = diamEn(am) / 2, Rpx = Rmm * esc;
            const sx = ox + c * ancho * esc, sw = ancho * esc + 1;
            const texX = c * ancho * k, texW = ancho * k;
            for (let y = Math.floor(cy - Rpx); y < cy + Rpx; y++) {
              const dy = (cy - y - 0.5) / Rpx; if (dy < -1 || dy > 1) continue;
              const fi = Math.asin(dy), luz = 0.45 + 0.55 * Math.max(0, Math.cos(fi - 0.5));
              // material (madera/metal claro)
              cx.fillStyle = `rgb(${Math.round(214 * luz)},${Math.round(178 * luz)},${Math.round(128 * luz)})`; cx.fillRect(sx, y, sw, 1.2);
              // lo grabado que está en este ángulo: lo grabado antes queda por debajo de la línea del láser
              const v = st.v + (fiL - fi) * Rmm, ty = (v - TV0) * k;
              if (ty >= 0 && ty < tex.height) { cx.globalAlpha = luz; cx.drawImage(tex, texX, ty, texW, Math.max(1, k * Rmm * (1 / Math.max(0.15, Math.cos(fi))) / Rpx), sx, y, sw, 1.2); cx.globalAlpha = 1; }
            }
          }
          // contorno
          cx.strokeStyle = '#8a94a6'; cx.lineWidth = 1; cx.beginPath();
          for (let i = 0; i <= 60; i++) { const a = A0 + (A1 - A0) * i / 60, r = diamEn(a) / 2 * esc; const X = ox + (a - A0) * esc; i ? cx.lineTo(X, cy - r) : cx.moveTo(X, cy - r); }
          for (let i = 60; i >= 0; i--) { const a = A0 + (A1 - A0) * i / 60, r = diamEn(a) / 2 * esc; cx.lineTo(ox + (a - A0) * esc, cy + r); }
          cx.closePath(); cx.stroke();
          // línea del láser y punto
          cx.strokeStyle = 'rgba(255,60,60,0.85)'; cx.setLineDash([5, 4]); cx.beginPath();
          for (let i = 0; i <= 60; i++) { const a = A0 + (A1 - A0) * i / 60, r = diamEn(a) / 2 * esc, X = ox + (a - A0) * esc, Y = cy - Math.sin(fiL) * r; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); }
          cx.stroke(); cx.setLineDash([]);
          const rr = diamEn(st.a) / 2 * esc, hx = ox + (st.a - A0) * esc, hy = cy - Math.sin(fiL) * rr;
          cx.fillStyle = st.on ? '#ff3b3b' : '#ffb3b3'; cx.beginPath(); cx.arc(hx, hy, st.on ? 5 : 3.5, 0, Math.PI * 2); cx.fill();
          if (st.on) { cx.fillStyle = 'rgba(255,80,60,0.25)'; cx.beginPath(); cx.arc(hx, hy, 11, 0, Math.PI * 2); cx.fill(); }
          // flecha de giro en el extremo derecho
          flechaGiro(cx, ox + (A1 - A0) * esc + 18, cy, diamEn(A1) / 2 * esc, st.dv);
        }
        function flechaGiro(c, x, y, r, dv) {
          if (Math.abs(dv) < 1e-6) return;
          const haciaUsted = dv < 0; // ▲ (hacia arriba en el lienzo) = la parte de arriba gira hacia usted
          c.save(); c.strokeStyle = '#4ea1ff'; c.fillStyle = '#4ea1ff'; c.lineWidth = 3;
          const y0 = y - r * 0.7, y1 = y + r * 0.7;
          c.beginPath(); c.moveTo(x, haciaUsted ? y0 : y1); c.lineTo(x, haciaUsted ? y1 : y0); c.stroke();
          const yt = haciaUsted ? y1 : y0, s = haciaUsted ? 1 : -1;
          c.beginPath(); c.moveTo(x - 7, yt - 8 * s); c.lineTo(x + 7, yt - 8 * s); c.lineTo(x, yt + 2 * s); c.closePath(); c.fill();
          c.restore();
        }
        function dibujarPapel(st) {
          const W = pv.width, H = pv.height;
          px.fillStyle = '#20232a'; px.fillRect(0, 0, W, H);
          const esc = Math.min((W - 190) / (A1 - A0), 4);
          const ox = 150 + (W - 190 - (A1 - A0) * esc) / 2, lineaY = Math.round(H / 2), anchoT = (A1 - A0) * esc;
          // la tira: lo grabado se desplaza alejándose de la línea del láser, como el papel que sale de una impresora
          px.fillStyle = '#e9dcc4'; px.fillRect(ox, 0, anchoT, H);
          const vArriba = st.v - lineaY / esc; // mm de la pieza que se ven en el borde superior
          px.drawImage(tex, 0, (vArriba - TV0) * k, tex.width, (H / esc) * k, ox, 0, anchoT, H);
          // sombreado: arriba = ya pasó hacia el fondo, abajo = ya pasó hacia usted
          px.fillStyle = 'rgba(32,35,42,0.18)'; px.fillRect(ox, 0, anchoT, lineaY - 10);
          px.strokeStyle = 'rgba(255,60,60,0.95)'; px.lineWidth = 2; px.beginPath(); px.moveTo(ox - 8, lineaY); px.lineTo(ox + anchoT + 8, lineaY); px.stroke();
          const hx = ox + (st.a - A0) * esc; px.fillStyle = st.on ? '#ff3b3b' : '#ffb3b3'; px.beginPath(); px.arc(hx, lineaY, st.on ? 5 : 3.5, 0, Math.PI * 2); px.fill();
          px.font = '11px Segoe UI, sans-serif'; px.fillStyle = '#c9ced8';
          px.fillText(LS.t('↑ hacia el fondo'), 8, 16); px.fillText(LS.t('↓ hacia usted (frente)'), 8, H - 8);
          px.fillStyle = '#ff6b6b'; px.fillText(LS.t('línea del láser →'), 8, lineaY + 4);
          // flecha: hacia dónde avanza la tira en este momento
          if (Math.abs(st.dv) > 1e-6) {
            const baja = st.dv < 0; px.fillStyle = '#4ea1ff'; const x = W - 16, y = lineaY;
            px.fillRect(x - 2, y - 40, 4, 80); px.beginPath();
            if (baja) { px.moveTo(x - 8, y + 36); px.lineTo(x + 8, y + 36); px.lineTo(x, y + 50); } else { px.moveTo(x - 8, y - 36); px.lineTo(x + 8, y - 36); px.lineTo(x, y - 50); }
            px.closePath(); px.fill();
          }
        }
        function cuadro(ahora) {
          const dt = Math.min(0.1, (ahora - ultimo) / 1000); ultimo = ahora;
          if (play) { t += dt * vel; if (t >= tot) { t = tot; play = false; bPlay.textContent = '▶ Reproducir'; } }
          pintarHasta(t);
          const st = estado(Math.min(t, tot - 1e-6));
          dibujarCilindro(st); dibujarPapel(st);
          sPos.value = Math.round(t / tot * 1000);
          lT.textContent = `${fmt(t)} / ${fmt(tot)}`;
          lS.innerHTML = Math.abs(st.dv) < 1e-6 ? LS.t('La pieza no gira en este tramo (solo se mueve X).')
            : st.dv < 0 ? LS.t('La parte de arriba de la pieza gira <b>hacia usted</b> (▲).') : LS.t('La parte de arriba de la pieza gira <b>hacia el fondo</b> (▼).');
          raf = requestAnimationFrame(cuadro);
        }
        raf = requestAnimationFrame(cuadro);
      }
    });
  };
})();
