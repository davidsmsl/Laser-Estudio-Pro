// Quitar fondo y detectar siluetas de una imagen ya colocada en el lienzo.
// - Automático: detecta el color uniforme del borde y lo elimina (relleno desde los bordes, con tolerancia).
// - Varita: clic sobre el fondo para quitar ese color (contiguo o en toda la imagen).
// - Cuenta las siluetas que quedan; con clic se puede descartar o conservar cada una.
// - Al aplicar: el fondo queda transparente (no se graba), se puede recortar, separar cada silueta y crear su contorno de corte.
(function () {
  const LS = window.LS, G = LS.G, D = LS.D;
  const F = LS.fondo = {};
  const MAX_TRABAJO = 4096;   // resolución máxima del resultado
  const MAX_VISTA = 1600;     // resolución del análisis en el diálogo (las líneas finas no deben desaparecer)

  // ---------- análisis de píxeles ----------
  function pixeles(img, maxPx) {
    const s = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
    return { w, h, data: cx.getImageData(0, 0, w, h).data, s };
  }
  // color dominante del borde de la imagen y qué tan uniforme es
  F.colorBorde = px => {
    const { w, h, data } = px, bins = new Map(), m = [];
    const tomar = i => { if (data[i * 4 + 3] < 30) return; const k = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4); bins.set(k, (bins.get(k) || 0) + 1); m.push(i); };
    for (let x = 0; x < w; x++) { tomar(x); tomar((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { tomar(y * w); tomar(y * w + w - 1); }
    if (!m.length) return { color: [255, 255, 255], uniforme: 1, transparente: true };
    let mejor = -1, n = 0; bins.forEach((v, k) => { if (v > n) { n = v; mejor = k; } });
    let r = 0, g = 0, b = 0, c = 0;
    for (const i of m) { const k = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4); if (Math.abs((k >> 8) - (mejor >> 8)) <= 1 && Math.abs(((k >> 4) & 15) - ((mejor >> 4) & 15)) <= 1 && Math.abs((k & 15) - (mejor & 15)) <= 1) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; c++; } }
    return { color: [r / c, g / c, b / c], uniforme: c / m.length };
  };
  const umbralDe = tol => (tol / 100) * 255 * 1.2; // distancia RGB máxima para considerar "mismo color"

  // Máscara de fondo: 1 = fondo (se elimina). opts: { tol, auto, semillas:[{x,y}] (0..1), global, borde, manchas }
  F.mascara = (px, opts) => {
    const { w, h, data } = px, n = w * h, fondo = new Uint8Array(n), thr = umbralDe(opts.tol), thr2 = thr * thr;
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 30) fondo[i] = 1; // ya transparente
    const refs = [];
    const parecido = (i, c) => { const dr = data[i * 4] - c[0], dg = data[i * 4 + 1] - c[1], db = data[i * 4 + 2] - c[2]; return dr * dr + dg * dg + db * db <= thr2; };
    const cola = new Int32Array(n); let ini = 0, fin = 0;
    const sembrar = (i, c) => { if (!fondo[i] && parecido(i, c)) { fondo[i] = 1; cola[fin++] = i; } };
    const expandir = c => {
      while (ini < fin) {
        const i = cola[ini++], x = i % w, y = (i / w) | 0;
        if (x > 0) sembrar(i - 1, c); if (x < w - 1) sembrar(i + 1, c);
        if (y > 0) sembrar(i - w, c); if (y < h - 1) sembrar(i + w, c);
      }
    };
    if (opts.auto) {
      const c = F.colorBorde(px).color; refs.push(c);
      for (let x = 0; x < w; x++) { sembrar(x, c); sembrar((h - 1) * w + x, c); }
      for (let y = 0; y < h; y++) { sembrar(y * w, c); sembrar(y * w + w - 1, c); }
      expandir(c);
    }
    for (const s of opts.semillas || []) {
      const x = Math.min(w - 1, Math.max(0, Math.round(s.x * (w - 1)))), y = Math.min(h - 1, Math.max(0, Math.round(s.y * (h - 1)))), i = y * w + x;
      const c = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]; refs.push(c);
      ini = fin = 0; fondo[i] = 1; cola[fin++] = i; expandir(c);
    }
    // huecos interiores del mismo color (entre brazos y cuerpo, dentro de letras): todo el color, no solo lo contiguo
    if (opts.global) for (let i = 0; i < n; i++) if (!fondo[i]) for (const c of refs) if (parecido(i, c)) { fondo[i] = 1; break; }
    // borde: quita el halo del color de fondo alrededor de la silueta
    for (let k = 0; k < (opts.borde || 0); k++) {
      const add = [];
      for (let i = 0; i < n; i++) if (!fondo[i]) { const x = i % w, y = (i / w) | 0; if ((x > 0 && fondo[i - 1]) || (x < w - 1 && fondo[i + 1]) || (y > 0 && fondo[i - w]) || (y < h - 1 && fondo[i + w])) add.push(i); }
      add.forEach(i => fondo[i] = 1);
    }
    return fondo;
  };

  // Siluetas: regiones conectadas (8 vecinos) de lo que no es fondo. Las manchas pequeñas se descartan.
  F.siluetas = (fondo, w, h, minPx) => {
    const n = w * h, et = new Int32Array(n), cola = new Int32Array(n), lista = [];
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (fondo[s] || et[s]) continue;
      id++; let ini = 0, fin = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
      et[s] = id; cola[fin++] = s;
      while (ini < fin) {
        const i = cola[ini++], x = i % w, y = (i / w) | 0; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const j = Y * w + X; if (!fondo[j] && !et[j]) { et[j] = id; cola[fin++] = j; }
        }
      }
      lista.push({ id, area, x0, y0, x1, y1 });
    }
    const validas = lista.filter(r => r.area >= minPx).sort((a, b) => b.area - a.area);
    return { et, validas, manchas: lista.length - validas.length };
  };

  // ---------- diálogo ----------
  F.open = obj => {
    obj = obj || D.selected().find(o => o.kind === 'image');
    if (!obj || obj.kind !== 'image') { LS.ui.toast('Seleccione una imagen en el lienzo (clic sobre ella) y vuelva a pulsar «Quitar fondo».', 'err'); return; }
    const entry = LS.imgCache[obj.id];
    if (!entry || !entry.img || !entry.ready) { LS.imageFor(obj); LS.ui.toast('La imagen se está cargando; intente de nuevo en un momento.'); return; }
    const img = entry.img, pv = pixeles(img, MAX_VISTA), info = F.colorBorde(pv);
    const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const st = { tol: 18, auto: info.uniforme >= 0.5, semillas: [], global: false, borde: 1, manchas: 0.05, descartadas: new Set(), clic: 'varita' };
    let res = null;

    const body = `
      <div class="qf">
        <div class="qf-vista"><canvas id="qf-cv"></canvas><div id="qf-num" class="qf-num"></div></div>
        <div class="qf-ctl">
          <div class="qf-info">Color del borde: <span class="qf-sw" style="background:${hex(info.color)}"></span> ${hex(info.color)} · ${Math.round(info.uniforme * 100)} % del borde
            ${info.uniforme >= 0.5 ? '<b class="ok">→ fondo uniforme detectado</b>' : '<b class="warn">→ fondo no uniforme: use la varita (clic sobre el fondo)</b>'}</div>
          <label class="chk"><input type="checkbox" id="qf-auto" ${st.auto ? 'checked' : ''}> Quitar el fondo uniforme automáticamente (desde los bordes)</label>
          <div class="row"><label>Tolerancia de color</label><input type="range" id="qf-tol" min="1" max="60" value="${st.tol}"><span id="qf-tolv">${st.tol}</span></div>
          <label class="chk"><input type="checkbox" id="qf-glob"> Quitar también los huecos interiores del mismo color (entre brazos, dentro de letras)</label>
          <div class="row"><label>Limpiar borde (px)</label><input type="range" id="qf-bor" min="0" max="4" value="${st.borde}"><span id="qf-borv">${st.borde}</span></div>
          <div class="row"><label>Ignorar manchas menores de (%)</label><input type="number" id="qf-man" min="0" max="10" step="0.05" value="${st.manchas}" style="width:70px"></div>
          <div class="qf-modo">Clic en la imagen:
            <label><input type="radio" name="qf-clic" value="varita" checked> 🪄 quitar ese color (varita)</label>
            <label><input type="radio" name="qf-clic" value="silueta"> ✂ descartar / conservar una silueta</label>
          </div>
          <div class="btns"><button id="qf-desh">↶ Quitar último clic</button><button id="qf-rein">⟲ Reiniciar</button></div>
          <div id="qf-res" class="qf-res"></div>
          <fieldset><legend>Al aplicar</legend>
            <label class="chk"><input type="checkbox" id="qf-rec" checked> Recortar la imagen a las siluetas (no cambia su posición)</label>
            <label class="chk"><input type="checkbox" id="qf-sep"> Separar cada silueta como imagen independiente</label>
            <label class="chk"><input type="checkbox" id="qf-con"> Crear contorno de corte alrededor de cada silueta (capa de línea)</label>
          </fieldset>
        </div>
      </div>`;

    LS.dlg.open({
      title: 'Quitar fondo y detectar siluetas', width: 900, body,
      buttons: [{ label: 'Cancelar', action: () => null }, { label: 'Aplicar', primary: true, action: b => { aplicar(b); return true; } }],
      onOpen: b => {
        const cv = b.querySelector('#qf-cv'), cx = cv.getContext('2d'); cv.width = pv.w; cv.height = pv.h;
        const $ = q => b.querySelector(q);
        const fondoCuadros = (() => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#d9dde3'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); return cx.createPattern(c, 'repeat'); })();
        const leer = () => {
          st.tol = +$('#qf-tol').value; st.auto = $('#qf-auto').checked; st.global = $('#qf-glob').checked; st.borde = +$('#qf-bor').value;
          st.manchas = Math.max(0, +$('#qf-man').value || 0); st.clic = b.querySelector('input[name="qf-clic"]:checked').value;
          $('#qf-tolv').textContent = st.tol; $('#qf-borv').textContent = st.borde;
        };
        const recalcular = () => {
          leer();
          const fondo = F.mascara(pv, st), sil = F.siluetas(fondo, pv.w, pv.h, Math.max(4, st.manchas / 100 * pv.w * pv.h));
          res = { fondo, sil };
          dibujar();
        };
        const dibujar = () => {
          const { fondo, sil } = res, id = cx.createImageData(pv.w, pv.h), d = id.data, src = pv.data;
          const valida = new Uint8Array(sil.validas.length ? Math.max(...sil.validas.map(v => v.id)) + 1 : 1);
          sil.validas.forEach(v => { if (!st.descartadas.has(v.id)) valida[v.id] = 1; });
          for (let i = 0; i < fondo.length; i++) {
            const e = sil.et[i], vis = !fondo[i] && e && e < valida.length && valida[e];
            d[i * 4] = src[i * 4]; d[i * 4 + 1] = src[i * 4 + 1]; d[i * 4 + 2] = src[i * 4 + 2]; d[i * 4 + 3] = vis ? 255 : 0;
          }
          cx.fillStyle = fondoCuadros; cx.fillRect(0, 0, pv.w, pv.h);
          const t = document.createElement('canvas'); t.width = pv.w; t.height = pv.h; t.getContext('2d').putImageData(id, 0, 0); cx.drawImage(t, 0, 0);
          // marcos numerados de cada silueta
          const ke = Math.max(1, pv.w / 600); cx.font = `bold ${Math.round(13 * ke)}px Segoe UI, sans-serif`; cx.lineWidth = 1.5 * ke;
          sil.validas.forEach((v, k) => {
            const off = st.descartadas.has(v.id); cx.strokeStyle = off ? 'rgba(220,60,60,0.9)' : 'rgba(255,154,31,0.95)'; cx.setLineDash(off ? [3, 3] : [6, 3]);
            cx.strokeRect(v.x0 - 1.5, v.y0 - 1.5, v.x1 - v.x0 + 3, v.y1 - v.y0 + 3); cx.setLineDash([]);
            const lbl = (k + 1) + (off ? ' ✕' : ''); const tw = cx.measureText(lbl).width + 8;
            cx.fillStyle = off ? '#dc3c3c' : '#ff9a1f'; cx.fillRect(v.x0 - 1.5, Math.max(0, v.y0 - 18 * ke), tw, 16 * ke); cx.fillStyle = '#111'; cx.fillText(lbl, v.x0 + 2.5 * ke, Math.max(12 * ke, v.y0 - 5 * ke));
          });
          st.semillas.forEach(s => { cx.fillStyle = '#4ea1ff'; cx.beginPath(); cx.arc(s.x * pv.w, s.y * pv.h, 4 * Math.max(1, pv.w / 600), 0, 7); cx.fill(); cx.strokeStyle = '#fff'; cx.stroke(); });
          const n = sil.validas.length, nk = sil.validas.filter(v => !st.descartadas.has(v.id)).length;
          const pctFondo = Math.round(fondo.reduce((a, v) => a + v, 0) / fondo.length * 100);
          $('#qf-res').innerHTML = n
            ? `<b>${n} silueta${n === 1 ? '' : 's'} detectada${n === 1 ? '' : 's'}</b>${nk < n ? ` · se conservan ${nk}` : ''} · fondo eliminado: ${pctFondo} %${sil.manchas ? ` · ${sil.manchas} mancha${sil.manchas === 1 ? '' : 's'} pequeña${sil.manchas === 1 ? '' : 's'} ignorada${sil.manchas === 1 ? '' : 's'}` : ''}`
            : '<b class="warn">No queda ninguna silueta: baje la tolerancia o quite el último clic.</b>';
          $('#qf-sep').disabled = nk < 2; if (nk < 2) $('#qf-sep').checked = false;
        };
        cv.onclick = e => {
          const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          if (st.clic === 'varita') { st.semillas.push({ x, y }); recalcular(); return; }
          const i = Math.min(pv.h - 1, Math.floor(y * pv.h)) * pv.w + Math.min(pv.w - 1, Math.floor(x * pv.w));
          let e2 = res.sil.et[i];
          if (!e2 || res.fondo[i]) { // clic en el fondo: la silueta más cercana por su recuadro
            const px = x * pv.w, py = y * pv.h; let best = null, bd = Infinity;
            res.sil.validas.forEach(v => { const dx = Math.max(v.x0 - px, 0, px - v.x1), dy = Math.max(v.y0 - py, 0, py - v.y1), dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = v; } });
            if (!best || bd > 400 * Math.max(1, pv.w / 600) ** 2) return; e2 = best.id;
          }
          if (!res.sil.validas.some(v => v.id === e2)) return;
          st.descartadas.has(e2) ? st.descartadas.delete(e2) : st.descartadas.add(e2); dibujar();
        };
        ['#qf-tol', '#qf-bor'].forEach(q => $(q).oninput = () => { st.descartadas.clear(); recalcular(); });
        ['#qf-auto', '#qf-glob', '#qf-man'].forEach(q => $(q).onchange = () => { st.descartadas.clear(); recalcular(); });
        b.querySelectorAll('input[name="qf-clic"]').forEach(r => r.onchange = leer);
        $('#qf-desh').onclick = () => { st.semillas.pop(); st.descartadas.clear(); recalcular(); };
        $('#qf-rein').onclick = () => { st.semillas = []; st.descartadas.clear(); $('#qf-auto').checked = info.uniforme >= 0.5; $('#qf-glob').checked = false; recalcular(); };
        recalcular();
      }
    });

    // ---------- aplicar a la resolución real ----------
    function aplicar(b) {
      const $ = q => b.querySelector(q), recortar = $('#qf-rec').checked, separar = $('#qf-sep').checked && !$('#qf-sep').disabled, contorno = $('#qf-con').checked;
      LS.ui.toast('Procesando la imagen…');
      setTimeout(() => {
        try {
          const px = pixeles(img, MAX_TRABAJO);
          const fondo = F.mascara(px, st);
          const sil = F.siluetas(fondo, px.w, px.h, Math.max(4, st.manchas / 100 * px.w * px.h));
          // las siluetas descartadas en la vista se ubican en la resolución real por su posición
          const k = px.w / pv.w, descartar = new Set();
          for (const idv of st.descartadas) {
            const v = res.sil.validas.find(q => q.id === idv); if (!v) continue;
            const cxv = (v.x0 + v.x1) / 2 * k, cyv = (v.y0 + v.y1) / 2 * k; let best = null, bd = Infinity;
            sil.validas.forEach(q => { const dd = ((q.x0 + q.x1) / 2 - cxv) ** 2 + ((q.y0 + q.y1) / 2 - cyv) ** 2; if (dd < bd) { bd = dd; best = q; } });
            if (best) descartar.add(best.id);
          }
          const quedan = sil.validas.filter(v => !descartar.has(v.id));
          if (!quedan.length) throw new Error('No queda ninguna silueta para conservar.');
          const keep = new Uint8Array(Math.max(...sil.validas.map(v => v.id)) + 1); quedan.forEach(v => keep[v.id] = 1);
          const grupos = separar ? quedan.map(v => [v]) : [quedan];
          const mmX = obj.w / px.w, mmY = obj.h / px.h;
          D.checkpoint();
          const nuevos = [], contornos = [];
          grupos.forEach((g, gi) => {
            const ids = new Set(g.map(v => v.id));
            let x0 = 0, y0 = 0, x1 = px.w - 1, y1 = px.h - 1;
            if (recortar || separar) { x0 = Math.min(...g.map(v => v.x0)); y0 = Math.min(...g.map(v => v.y0)); x1 = Math.max(...g.map(v => v.x1)); y1 = Math.max(...g.map(v => v.y1)); }
            const W = x1 - x0 + 1, H = y1 - y0 + 1, c = document.createElement('canvas'); c.width = W; c.height = H;
            const id = c.getContext('2d').createImageData(W, H), d = id.data, mask = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              const i = (y + y0) * px.w + (x + x0), o = (y * W + x) * 4, e = sil.et[i];
              const vis = !fondo[i] && e && (separar ? ids.has(e) : keep[e]);
              d[o] = px.data[i * 4]; d[o + 1] = px.data[i * 4 + 1]; d[o + 2] = px.data[i * 4 + 2]; d[o + 3] = vis ? px.data[i * 4 + 3] : 0;
              if (vis) mask[y * W + x] = 1;
            }
            c.getContext('2d').putImageData(id, 0, 0);
            const src = c.toDataURL('image/png'), tx = G.mul(obj.tx, G.tr(x0 * mmX, y0 * mmY)), w = W * mmX, h = H * mmY;
            if (gi === 0) {
              Object.assign(obj, { src, w, h, tx }); delete LS.imgCache[obj.id]; LS.imageFor(obj); nuevos.push(obj);
            } else {
              const o = D.add({ kind: 'image', src, w, h, tx, layer: obj.layer, ajustes: JSON.parse(JSON.stringify(obj.ajustes || LS.IMG_DEFAULT)), nombre: (obj.nombre || 'imagen') + ' · silueta ' + (gi + 1) }, false);
              LS.imageFor(o); nuevos.push(o);
            }
            if (contorno) contornos.push(...trazarContorno(mask, W, H, tx, w / W, h / H));
          });
          if (contornos.length) {
            const capa = capaLinea();
            D.add({ kind: 'path', paths: contornos, layer: capa, nombre: 'Contorno de silueta' }, false);
          }
          D.selection.clear(); nuevos.forEach(o => D.selection.add(o.id));
          D.changed('all');
          const n = quedan.length;
          LS.ui.toast(`Fondo quitado: ${n} silueta${n === 1 ? '' : 's'}${separar && n > 1 ? ' separadas en imágenes independientes' : ''}${contornos.length ? ' · contorno de corte creado' : ''}. Ahora solo queda ajustar la imagen (asistente de imagen) y grabar.`, 'ok');
        } catch (e) { LS.ui.toast(e.message || String(e), 'err'); }
      }, 30);
    }
  };

  // contorno vectorial de la silueta (para corte): calcado de la máscara con ImageTracer
  function trazarContorno(mask, W, H, tx, sx, sy) {
    const esc = Math.min(1, 1200 / Math.max(W, H)), w = Math.max(2, Math.round(W * esc)), h = Math.max(2, Math.round(H * esc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const src = document.createElement('canvas'); src.width = W; src.height = H; const sxx = src.getContext('2d'), id = sxx.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) { const v = mask[i] ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    sxx.putImageData(id, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) { const v = im.data[i * 4] < 128 ? 0 : 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; }
    const td = window.ImageTracer.imagedataToTracedata(im, { ltres: 1, qtres: 1, pathomit: 16, colorsampling: 0, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] });
    const li = td.palette.findIndex(p => p.r < 128), paths = [], k = 1 / esc;
    (td.layers[li] || []).forEach(p => {
      if (p.isholepath) return; // solo el borde exterior de la silueta
      const pts = [];
      p.segments.forEach((sg, i) => { if (i === 0) pts.push([sg.x1, sg.y1]); if (sg.type === 'L') pts.push([sg.x2, sg.y2]); else G.quad(pts, [sg.x1, sg.y1], [sg.x2, sg.y2], [sg.x3, sg.y3], 0.3); });
      if (pts.length > 2) paths.push({ pts: pts.map(q => G.apply(tx, [q[0] * k * sx, q[1] * k * sy])), closed: true });
    });
    // para cortar sirve solo el borde exterior: se descartan islas interiores y fragmentos diminutos
    const area = pts => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); };
    const conArea = paths.map(p => ({ p, a: area(p.pts) })).sort((x, y) => y.a - x.a);
    const max = conArea.length ? conArea[0].a : 0, kept = [];
    for (const c of conArea) {
      if (c.a < max * 0.005) continue;
      if (kept.some(k => G.pointInPoly(c.p.pts[0], k.pts))) continue;
      kept.push(c.p);
    }
    return kept;
  }
  function capaLinea() {
    for (const k of Object.keys(D.layers)) if (D.layers[k].modo === 'linea' && D.layers[k].salida !== false) return Number(k);
    for (let i = 0; i < 30; i++) if (!D.layers[i]) { const L = D.layer(i); L.modo = 'linea'; return i; }
    return 0;
  }
})();
