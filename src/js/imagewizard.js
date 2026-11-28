// Asistente de importación de imagen en dos pasos (como LaserGRBL) y base de datos de materiales.
(function (LS) {
  const G = LS.G, D = LS.D, U = LS.ui, X = LS.dlg, esc = U.esc;
  const $ = (b, s) => b.querySelector(s);
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = src; });
  const mmMin = L => LS.device.unidadVelocidad === 'mm/min' ? L.velocidad : L.velocidad * 60;
  const fromMmMin = v => LS.device.unidadVelocidad === 'mm/min' ? v : v / 60;

  // ---------- Transformaciones de la imagen (sobre una copia) ----------
  function transformar(img, op) {
    const c = document.createElement('canvas'), cx = c.getContext('2d');
    const rot = op === 'cw' || op === 'ccw';
    c.width = rot ? img.height : img.width; c.height = rot ? img.width : img.height;
    if (op === 'cw') { cx.translate(c.width, 0); cx.rotate(Math.PI / 2); }
    if (op === 'ccw') { cx.translate(0, c.height); cx.rotate(-Math.PI / 2); }
    if (op === 'fh') { cx.translate(c.width, 0); cx.scale(-1, 1); }
    if (op === 'fv') { cx.translate(0, c.height); cx.scale(1, -1); }
    cx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  }
  function recortarBlancos(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, a = d[i + 3], l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (a > 20 && l < 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return { src: o.toDataURL('image/png'), fx: x0 / img.width, fy: y0 / img.height, fw: o.width / img.width, fh: o.height / img.height };
  }

  // ---------- Paso 1: importar imagen ----------
  X.image = async (obj, opciones = {}) => {
    const entry = LS.imgCache[obj.id];
    const ws = opciones.ws || { src: obj.src, w: obj.w, h: obj.h, ajustes: Object.assign({}, LS.IMG_DEFAULT, obj.ajustes), ig: 8, su: 1 };
    let img = opciones.ws ? await loadImg(ws.src) : (entry && entry.img ? entry.img : await loadImg(obj.src));
    if (!ws.ajustes.herramienta) ws.ajustes.herramienta = LS.imgTool(ws.ajustes);
    const L = D.layer(obj.layer);
    if (!ws.calidad) ws.calidad = +(1 / Math.max(0.01, L.intervalo || 0.1)).toFixed(2);
    let terminado = false;
    const radio = (v, t) => `<label class="radio"><input type="radio" name="w-herr" value="${v}" ${ws.ajustes.herramienta === v ? 'checked' : ''}> ${t}</label>`;
    const slider = (id, label, min, max, step, v) => `<div class="row"><label>${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}" style="flex:1"><span class="chip" id="${id}-v">${v}</span></div>`;
    const a = ws.ajustes;
    await X.open({
      title: 'Importar imagen', width: 980,
      body: `<div class="wiz">
        <div class="wiz-izq">
          <fieldset><legend>Parámetros</legend>
            <div class="row"><label>Redimensionar</label><select id="w-redim"><option value="suave">Suave (bilineal)</option><option value="nitido">Nítido (vecino más cercano)</option></select></div>
            <div class="row"><label>Escala de grises</label><select id="w-grises"><option value="lum">Luminosidad (estándar)</option><option value="prom">Promedio</option><option value="pers">Personalizado</option></select></div>
            <div id="w-rgb">${slider('w-pr', '<span style="color:#ff6b6b">Rojo</span>', 0, 100, 1, a.pr)}${slider('w-pg', '<span style="color:#5fd16b">Verde</span>', 0, 100, 1, a.pg)}${slider('w-pb', '<span style="color:#6aa8ff">Azul</span>', 0, 100, 1, a.pb)}</div>
            ${slider('w-br', 'Brillo', -100, 100, 1, a.brillo)}${slider('w-co', 'Contraste', -100, 100, 1, a.contraste)}${slider('w-bl', 'Blancos', 0, 60, 1, a.blancos)}${slider('w-fo', 'Limpiar fondo (%)', 0, 30, 1, a.fondo ?? 4)}${slider('w-ga', 'Gamma', 0.2, 3, 0.05, a.gamma)}${slider('w-re', 'Realce', 0, 100, 1, a.realce)}
            <div class="row"><label><input type="checkbox" id="w-bn" ${a.bn ? 'checked' : ''}> B&amp;N</label><label><input type="checkbox" id="w-inv" ${a.invertir ? 'checked' : ''}> Invertir</label></div>
            <div id="w-umb">${slider('w-um', 'Umbral', 1, 254, 1, a.umbral)}</div>
          </fieldset>
          <fieldset><legend>Herramienta de conversión</legend>
            ${radio('linea', 'Línea a línea')}${radio('tramado', 'Tramado 1 bit (dithering)')}
            <div class="row" id="w-trrow" style="margin-left:22px"><select id="w-tr">${Object.entries(LS.DITHERS).filter(([k]) => !['umbral', 'grises'].includes(k)).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
            ${radio('vector', 'Vectorizar (contornos rellenos)')}${radio('central', 'Línea central (trazos)')}${radio('passthrough', 'Passthrough (imagen tal cual)')}
          </fieldset>
          <fieldset id="w-lin"><legend>Opciones de línea a línea</legend>
            <div class="row"><label>Dirección</label><select id="w-dir"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="diagonal">Diagonal</option></select></div>
            <div class="row"><label>Calidad</label><input type="number" id="w-cal" step="0.5" min="1" max="50" value="${ws.calidad}" style="width:80px"> líneas/mm <span class="chip" id="w-dpi"></span></div>
            <div class="row"><label><input type="checkbox" id="w-vpl" checked> Vista previa de líneas</label></div>
          </fieldset>
          <fieldset id="w-vec" hidden><legend>Opciones de vectorización</legend>
            <div class="row"><label>Ignorar manchas (px)</label><input type="number" id="w-ig" value="${ws.ig}" min="0" step="1" style="width:80px"></div>
            <div class="row"><label>Suavizado</label><input type="number" id="w-su" value="${ws.su}" min="0.1" max="5" step="0.1" style="width:80px"></div>
          </fieldset>
        </div>
        <div class="wiz-der">
          <div class="tabs2"><button id="w-tprev" class="on">Vista previa</button><button id="w-torig">Original</button><span style="flex:1"></span><span class="chip" id="w-info"></span></div>
          <div class="wiz-cv"><canvas id="w-cv"></canvas></div>
          <div class="wiz-tools">
            <button class="tb" id="w-reset" title="Deshacer cambios de la imagen">⟲</button>
            <button class="tb" id="w-cw" title="Girar 90° a la derecha">↻</button><button class="tb" id="w-ccw" title="Girar 90° a la izquierda">↺</button>
            <button class="tb" id="w-fv" title="Reflejar verticalmente">⇅</button><button class="tb" id="w-fh" title="Reflejar horizontalmente">⇄</button>
            <button class="tb" id="w-crop" title="Recortar bordes blancos">✂</button><button class="tb" id="w-qf" title="Quitar fondo y detectar siluetas">🪄</button>
          </div>
        </div></div>`,
      onOpen: b => {
        $(b, '#w-redim').value = a.redim; $(b, '#w-grises').value = a.grises; $(b, '#w-dir').value = a.direccion;
        $(b, '#w-tr').value = ['umbral', 'grises'].includes(a.tramado) ? 'floyd' : a.tramado;
        let vista = 'prev';
        const leer = () => {
          Object.assign(a, { redim: $(b, '#w-redim').value, grises: $(b, '#w-grises').value, pr: +$(b, '#w-pr').value, pg: +$(b, '#w-pg').value, pb: +$(b, '#w-pb').value,
            brillo: +$(b, '#w-br').value, contraste: +$(b, '#w-co').value, blancos: +$(b, '#w-bl').value, fondo: +$(b, '#w-fo').value, gamma: +$(b, '#w-ga').value, realce: +$(b, '#w-re').value,
            bn: $(b, '#w-bn').checked, invertir: $(b, '#w-inv').checked, umbral: +$(b, '#w-um').value,
            herramienta: (b.querySelector('input[name="w-herr"]:checked') || {}).value || 'linea', tramado: $(b, '#w-tr').value, direccion: $(b, '#w-dir').value });
          ws.calidad = Math.max(1, +$(b, '#w-cal').value || 10); ws.ig = +$(b, '#w-ig').value || 0; ws.su = +$(b, '#w-su').value || 1;
        };
        const pintar = () => {
          leer();
          const h = a.herramienta;
          $(b, '#w-rgb').style.display = a.grises === 'pers' ? '' : 'none';
          $(b, '#w-umb').style.display = (h === 'linea' && a.bn) || h === 'vector' || h === 'central' ? '' : 'none';
          $(b, '#w-trrow').style.display = h === 'tramado' ? '' : 'none';
          $(b, '#w-lin').hidden = !(h === 'linea' || h === 'tramado' || h === 'passthrough');
          $(b, '#w-vec').hidden = !(h === 'vector' || h === 'central');
          ['w-pr', 'w-pg', 'w-pb', 'w-br', 'w-co', 'w-bl', 'w-ga', 'w-re', 'w-um'].forEach(id => $(b, '#' + id + '-v').textContent = $(b, '#' + id).value);
          $(b, '#w-dpi').textContent = `${Math.round(ws.calidad * 25.4)} DPI · intervalo ${(1 / ws.calidad).toFixed(3)} mm`;
          $(b, '#w-info').textContent = `${img.width}×${img.height} px · ${ws.w.toFixed(1)}×${ws.h.toFixed(1)} mm`;
          const cv = $(b, '#w-cv'), cx = cv.getContext('2d');
          let src;
          if (vista === 'orig') src = img;
          else src = LS.processImagePreview(img, a, { maxPx: 700, lineas: $(b, '#w-vpl').checked && (h === 'linea' || h === 'tramado' || h === 'passthrough') ? { porMm: ws.calidad, anchoMm: ws.w } : null });
          const box = cv.parentElement.getBoundingClientRect(), s = Math.min((box.width - 16) / src.width, (box.height - 16) / src.height);
          cv.width = Math.max(1, Math.round(src.width * s)); cv.height = Math.max(1, Math.round(src.height * s));
          cx.imageSmoothingEnabled = vista === 'orig' || a.redim !== 'nitido'; cx.drawImage(src, 0, 0, cv.width, cv.height);
        };
        b._leer = leer;
        let t = 0; const programar = () => { cancelAnimationFrame(t); t = requestAnimationFrame(pintar); };
        b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', programar));
        $(b, '#w-tprev').onclick = () => { vista = 'prev'; $(b, '#w-tprev').classList.add('on'); $(b, '#w-torig').classList.remove('on'); pintar(); };
        $(b, '#w-torig').onclick = () => { vista = 'orig'; $(b, '#w-torig').classList.add('on'); $(b, '#w-tprev').classList.remove('on'); pintar(); };
        const aplicarOp = async op => {
          if (op === 'reset') { ws.src = obj.src; ws.w = obj.w; ws.h = obj.h; }
          else if (op === 'crop') { const r = recortarBlancos(img); if (!r) return U.toast('La imagen está vacía.', 'err'); ws.src = r.src; ws.cropOff = [(ws.cropOff ? ws.cropOff[0] : 0) + r.fx * ws.w, (ws.cropOff ? ws.cropOff[1] : 0) + r.fy * ws.h]; ws.w *= r.fw; ws.h *= r.fh; }
          else { ws.src = transformar(img, op); if (op === 'cw' || op === 'ccw') [ws.w, ws.h] = [ws.h, ws.w]; }
          img = await loadImg(ws.src); pintar();
        };
        ['reset', 'cw', 'ccw', 'fh', 'fv', 'crop'].forEach(op => $(b, '#w-' + op).onclick = () => U.guard(() => aplicarOp(op)));
        // quitar fondo: cierra el asistente y abre la herramienta sobre la imagen
        $(b, '#w-qf').onclick = () => { const bc = [...b.closest('.modal, .dlg, [role=dialog]') ? b.closest('.modal, .dlg, [role=dialog]').querySelectorAll('button') : []].find(x => x.textContent.trim() === LS.t('Cancelar') || x.textContent.trim() === 'Cancelar'); if (bc) bc.click(); setTimeout(() => LS.fondo.open(obj), 120); };
        setTimeout(pintar, 30);
      },
      buttons: [{ label: 'Cancelar' }, { label: 'Siguiente ›', primary: true, action: async (b, close) => { b._leer && b._leer(); terminado = 'paso2'; close(true); }, keepOpen: true }],
      onClose: () => { }
    });
    if (terminado !== 'paso2') { if (opciones.nuevo) { D.remove([obj.id]); D.changed('all'); } return; }
    return paso2(obj, ws, img, opciones);
  };

  // ---------- Paso 2: imagen objetivo (velocidad, potencia, tamaño y posición) ----------
  async function paso2(obj, ws, img, opciones) {
    const a = ws.ajustes, L = D.layer(obj.layer), dev = LS.device, h = a.herramienta;
    const vector = h === 'vector' || h === 'central';
    const b0 = D.objBBox(obj), ref = LS.toDisp(b0.x0, b0.y1); // esquina inferior izquierda en coordenadas de máquina
    const dpiAuto = Math.round(img.width / (ws.w / 25.4));
    let volver = false;
    await X.open({
      title: vector ? (h === 'central' ? 'Línea central: trabajo' : 'Vectorizar: trabajo') : 'Imagen objetivo', width: 560,
      body: `<fieldset><legend>Velocidad</legend>
          <div class="row"><label>Velocidad de ${vector && h === 'central' ? 'trazo' : 'grabado'}</label><input type="number" id="p-vel" value="${Math.round(mmMin(L))}" min="1" step="50" style="width:100px"> mm/min <button id="p-db" title="Configuración sugerida por material">🗄 Materiales…</button></div>
          <div class="row"><label>Pasadas</label><input type="number" id="p-pas" value="${L.pasadas || 1}" min="1" step="1" style="width:80px"></div>
        </fieldset>
        <fieldset><legend>Opciones de láser</legend>
          <div class="row"><label>Modo de láser</label><select id="p-modo"><option value="M4">M4 — potencia dinámica</option><option value="M3">M3 — potencia constante</option></select></div>
          <div class="row"><label>S-MIN</label><input type="number" id="p-smin" value="${Math.round(L.potMin / 100 * dev.maxS)}" min="0" max="${dev.maxS}" step="1" style="width:90px"> <span class="chip" id="p-smin-p"></span></div>
          <div class="row"><label>S-MAX</label><input type="number" id="p-smax" value="${Math.round(L.potMax / 100 * dev.maxS)}" min="0" max="${dev.maxS}" step="1" style="width:90px"> <span class="chip" id="p-smax-p"></span> <span class="note" style="margin:0">S máximo del controlador: ${dev.maxS}</span></div>
        </fieldset>
        <fieldset><legend>Tamaño y posición de la imagen [mm]</legend>
          <div class="row"><label><input type="checkbox" id="p-auto"> Tamaño automático</label><input type="number" id="p-dpi" value="${dpiAuto}" min="10" max="2400" style="width:80px"> DPI</div>
          <div class="row"><label>Tamaño</label>W <input type="number" id="p-w" value="${ws.w.toFixed(1)}" step="0.1" min="1" style="width:80px"> H <input type="number" id="p-h" value="${ws.h.toFixed(1)}" step="0.1" min="1" style="width:80px"> <label><input type="checkbox" id="p-lock" checked> 🔒</label></div>
          <div class="row"><label>Inicio (inferior izq.)</label>X <input type="number" id="p-x" value="${ref[0].toFixed(1)}" step="0.5" style="width:80px"> Y <input type="number" id="p-y" value="${ref[1].toFixed(1)}" step="0.5" style="width:80px"> <button id="p-centrar" title="Centrar en el área de trabajo">⌖ Centrar</button></div>
        </fieldset>
        ${vector ? `<div class="row"><label><input type="checkbox" id="p-del" checked> Quitar la imagen original después de convertir</label></div>` : ''}
        <p class="note">La velocidad y la potencia se guardan en la capa <b>${esc(L.nombre)}</b>${vector ? ' que recibe los vectores' : ''}. Valores de partida: confírmelos con Herramientas → Prueba de materiales.</p>`,
      onOpen: bx => {
        $(bx, '#p-modo').value = dev.modoLaser;
        const pct = () => { $(bx, '#p-smin-p').textContent = (100 * +$(bx, '#p-smin').value / dev.maxS).toFixed(1) + ' %'; $(bx, '#p-smax-p').textContent = (100 * +$(bx, '#p-smax').value / dev.maxS).toFixed(1) + ' %'; };
        ['#p-smin', '#p-smax'].forEach(s => $(bx, s).addEventListener('input', pct)); pct();
        const ratio = ws.h / ws.w;
        $(bx, '#p-w').oninput = () => { if ($(bx, '#p-lock').checked) $(bx, '#p-h').value = (+$(bx, '#p-w').value * ratio).toFixed(1); $(bx, '#p-auto').checked = false; };
        $(bx, '#p-h').oninput = () => { if ($(bx, '#p-lock').checked) $(bx, '#p-w').value = (+$(bx, '#p-h').value / ratio).toFixed(1); $(bx, '#p-auto').checked = false; };
        const autoT = () => { if (!$(bx, '#p-auto').checked) return; const dpi = Math.max(10, +$(bx, '#p-dpi').value); $(bx, '#p-w').value = (img.width / dpi * 25.4).toFixed(1); $(bx, '#p-h').value = (img.height / dpi * 25.4).toFixed(1); };
        $(bx, '#p-auto').onchange = autoT; $(bx, '#p-dpi').oninput = autoT;
        $(bx, '#p-centrar').onclick = () => { $(bx, '#p-x').value = ((dev.ancho - +$(bx, '#p-w').value) / 2).toFixed(1); $(bx, '#p-y').value = ((dev.alto - +$(bx, '#p-h').value) / 2).toFixed(1); };
        $(bx, '#p-db').onclick = () => X.materialDB({ accion: vector && h === 'central' ? 'cortar' : 'grabar', onApply: r => { $(bx, '#p-vel').value = r.velocidad; $(bx, '#p-pas').value = r.pasadas; $(bx, '#p-smax').value = Math.round(r.potencia / 100 * dev.maxS); $(bx, '#p-smin').value = 0; pct(); } });
      },
      buttons: [{ label: '‹ Atrás', action: (bx, close) => { volver = true; close(); } }, { label: 'Cancelar' }, {
        label: vector ? 'Convertir' : 'Crear', primary: true, action: async bx => {
          const w = +$(bx, '#p-w').value, hh = +$(bx, '#p-h').value, vel = +$(bx, '#p-vel').value;
          if (!(w > 0 && hh > 0 && vel > 0)) throw new Error('Revise el tamaño y la velocidad.');
          D.checkpoint();
          // imagen
          obj.src = ws.src; obj.w = w; obj.h = hh; obj.ajustes = Object.assign({}, a);
          if (LS.imgMode(a) === 'grises' || a.herramienta === 'linea') obj.ajustes.tramado = a.bn ? 'umbral' : 'grises';
          // posición: esquina inferior izquierda en coordenadas de máquina
          const x = +$(bx, '#p-x').value, y = +$(bx, '#p-y').value;
          const p1 = LS.fromDisp(x, y), p2 = LS.fromDisp(x + w, y + hh);
          obj.tx = G.tr(Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]));
          delete LS.imgCache[obj.id];
          dev.modoLaser = $(bx, '#p-modo').value; LS.saveSettings();
          const ajCapa = { velocidad: +fromMmMin(vel).toFixed(2), pasadas: Math.max(1, +$(bx, '#p-pas').value | 0), potMin: +(100 * +$(bx, '#p-smin').value / dev.maxS).toFixed(1), potMax: +(100 * +$(bx, '#p-smax').value / dev.maxS).toFixed(1) };
          if (!vector) {
            Object.assign(L, ajCapa, { modo: 'imagen', intervalo: +(1 / ws.calidad).toFixed(4) });
            D.selection.clear(); D.selection.add(obj.id); D.changed('all');
            U.toast('Imagen lista. Ajústela con doble clic.', 'ok'); return;
          }
          // vectorizar o línea central: esperar a que cargue la imagen modificada
          LS.imageFor(obj); for (let i = 0; i < 100 && !(LS.imgCache[obj.id] && LS.imgCache[obj.id].img); i++) await new Promise(r => setTimeout(r, 30));
          let capa = D.currentLayer;
          if (D.layer(capa).modo === 'imagen') { for (let i = 0; i < 30; i++) if (!D.objects.some(o => o.layer === i)) { capa = i; break; } }
          const Lv = D.layer(capa); Object.assign(Lv, ajCapa, { modo: h === 'central' ? 'linea' : 'relleno' });
          const n = h === 'central' ? await LS.ops.centerline(obj, { capa, ignorar: ws.ig || 6, suavizado: Math.max(0.3, ws.su * 0.8) })
            : await LS.ops.trace(obj, { umbral: a.umbral, ignorar: ws.ig, suavizado: ws.su, resolucion: 900, invertir: a.invertir, capa });
          if ($(bx, '#p-del') && $(bx, '#p-del').checked) { D.remove([obj.id]); D.changed('all'); }
          U.toast(`${h === 'central' ? 'Línea central' : 'Vectorización'} lista: ${n} ${h === 'central' ? 'trazos' : 'contornos'} en la capa ${Lv.nombre}.`, 'ok');
        }
      }]
    });
    if (volver) return X.image(obj, Object.assign({}, opciones, { ws }));
  }

  // ---------- Base de datos de materiales (configuración sugerida) ----------
  // Capas destino: las de los objetos seleccionados (p. ej. un texto) o, si no hay selección, la capa actual
  X.capasDestino = () => {
    const sel = D.selected ? D.selected() : [];
    const ks = [...new Set(sel.map(o => o.layer))].filter(k => k != null && k < 1000);
    return ks.length ? ks : [D.currentLayer];
  };
  X.aplicarMaterial = (r, capas = X.capasDestino()) => {
    D.checkpoint();
    const nombres = capas.map(k => {
      const L = D.layer(k);
      Object.assign(L, { velocidad: +fromMmMin(r.velocidad).toFixed(2), potMax: r.potencia, potMin: 0, pasadas: r.pasadas, intervalo: r.intervalo });
      if (L.modo !== 'imagen') L.modo = r.modo;
      return L.nombre;
    });
    D.currentLayer = capas[0];
    D.changed('layers'); U.toast(`Configuración aplicada a la capa ${nombres.join(', ')}.`, 'ok');
  };
  // Valores propios del usuario por láser/material/acción/grosor (sustituyen a los sugeridos)
  const KEY_PROPIOS = 'ls.materialesPropios';
  const leerPropios = () => { try { return JSON.parse(localStorage.getItem(KEY_PROPIOS) || '{}'); } catch (e) { return {}; } };
  const guardarPropios = o => { try { localStorage.setItem(KEY_PROPIOS, JSON.stringify(o)); } catch (e) { } };
  const KEY_ULTIMO = 'ls.materialUltimo';
  const leerUltimo = () => { try { return JSON.parse(localStorage.getItem(KEY_ULTIMO) || 'null'); } catch (e) { return null; } };
  X.materialDB = ({ accion, onApply, capas } = {}) => {
    const M = LS.materialDB, dev = LS.device, ult = leerUltimo();
    if (!onApply) capas = capas || X.capasDestino();
    if (!accion) accion = ult && ult.acc ? ult.acc : (capas && D.layer(capas[0]).modo === 'linea' ? 'cortar' : 'grabar');
    const destino = capas ? capas.map(k => D.layer(k).nombre).join(', ') : '';
    const laser0 = dev.laserDB || M.DESDE_MAQUINA[dev.modelo] || 'd10';
    const num = (id, step, min, max, suf) => `<div class="row"><label style="flex:0 0 80px">${id[1]}</label><input type="number" id="${id[0]}" step="${step}" min="${min}"${max != null ? ` max="${max}"` : ''} style="width:90px"> <span class="note" style="margin:0 0 0 4px">${suf}</span></div>`;
    return X.open({
      title: 'Selecciona tu configuración', width: 760,
      body: `<div style="display:flex;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:300px">
          <div class="row"><label>Modelo de láser</label><select id="m-laser">${Object.entries(M.LASERS).map(([k, l]) => `<option value="${k}" ${k === laser0 ? 'selected' : ''}>${l.nombre}</option>`).join('')}</select></div>
          <div class="row"><label>Material</label><select id="m-mat">${Object.entries(M.MATERIALES).map(([k, m]) => `<option value="${k}">${m.nombre}</option>`).join('')}</select></div>
          <div class="row"><label>Acción</label><select id="m-acc"><option value="grabar">Grabar</option><option value="cortar">Cortar</option></select></div>
          <div class="row"><label>Grosor</label><select id="m-gro"></select></div>
        </div><fieldset style="flex:0 0 280px"><legend>Configuración (editable)</legend>
          ${num(['m-pot', 'Potencia'], 0.5, 0, 100, '%')}
          ${num(['m-vel', 'Velocidad'], 10, 1, null, 'mm/min')}
          ${num(['m-pas', 'Pasadas'], 1, 1, 50, '')}
          ${num(['m-int', 'Intervalo'], 0.01, 0.01, 2, 'mm')}
          <div class="row"><label style="flex:0 0 80px">Modo</label><select id="m-mod"><option value="relleno">Relleno / imagen</option><option value="linea">Línea (corte)</option></select></div>
          <div class="row"><span id="m-origen" class="chip"></span></div>
          <div class="btns"><button id="m-reset" type="button" title="Volver a los valores sugeridos de la aplicación">↺ Sugeridos</button></div>
        </fieldset></div>
        <p style="margin:10px 0 4px"><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="m-guardar" checked><span>Recordar estos valores para este láser, material y acción</span></label></p>
        ${destino ? `<p class="note"><b>Se aplicará a la capa: ${esc(destino)}</b></p>` : ''}
        <p class="warn" id="m-aviso" hidden></p>
        <p class="note">Los valores sugeridos son un punto de partida calculado según la potencia del láser; puede cambiarlos antes de aplicar. Confírmelos con Herramientas → Prueba de materiales.</p>`,
      onOpen: b => {
        $(b, '#m-acc').value = accion;
        // última configuración usada: láser, material y grosor
        if (ult) { if (ult.laser && M.LASERS[ult.laser]) $(b, '#m-laser').value = ult.laser; if (ult.mat && M.MATERIALES[ult.mat]) $(b, '#m-mat').value = ult.mat; b._groIni = ult.gro; }
        const clave = () => [$(b, '#m-laser').value, $(b, '#m-mat').value, $(b, '#m-acc').value, $(b, '#m-gro').disabled ? '-' : $(b, '#m-gro').value].join('|');
        const poner = (r, propio) => {
          $(b, '#m-pot').value = r ? r.potencia : ''; $(b, '#m-vel').value = r ? r.velocidad : '';
          $(b, '#m-pas').value = r ? r.pasadas : ''; $(b, '#m-int').value = r ? r.intervalo : '';
          if (r) $(b, '#m-mod').value = r.modo === 'linea' ? 'linea' : 'relleno';
          $(b, '#m-origen').textContent = !r ? 'Sin valores sugeridos: escríbalos' : propio ? '★ Valores guardados por usted' : 'Valores sugeridos';
          $(b, '#m-guardar').checked = true;
        };
        const upd = () => {
          const mat = M.MATERIALES[$(b, '#m-mat').value], acc = $(b, '#m-acc').value;
          const gro = $(b, '#m-gro'), prev = b._groIni != null ? String(b._groIni) : gro.value; b._groIni = null;
          if (acc === 'cortar' && mat.cortar) { gro.disabled = false; gro.innerHTML = Object.keys(mat.cortar).map(g => `<option value="${g}">${String(g).replace('.', ',')} mm</option>`).join(''); if ([...gro.options].some(o => o.value === prev)) gro.value = prev; }
          else { gro.disabled = true; gro.innerHTML = '<option>-</option>'; }
          const r = M.sugerir($(b, '#m-laser').value, $(b, '#m-mat').value, acc, gro.disabled ? null : gro.value);
          b._sug = r;
          const propio = leerPropios()[clave()];
          poner(propio || r, !!propio);
          const av = $(b, '#m-aviso'); const msg = !r && !propio ? (acc === 'cortar' ? 'Este material no se corta con láser de diodo: si aun así quiere probar, escriba los valores.' : 'Sin datos para esta combinación: escriba los valores.') : (r && r.aviso);
          av.hidden = !msg; av.textContent = msg || '';
        };
        b.querySelectorAll('select:not(#m-mod)').forEach(s => s.addEventListener('change', upd)); upd();
        b.querySelectorAll('#m-pot,#m-vel,#m-pas,#m-int,#m-mod').forEach(i => i.addEventListener('input', () => { $(b, '#m-origen').textContent = '✎ Valores editados'; }));
        $(b, '#m-reset').onclick = () => {
          const o = leerPropios(); delete o[clave()]; guardarPropios(o);
          poner(b._sug, false);
        };
        b._leer = () => {
          const pot = parseFloat($(b, '#m-pot').value), vel = parseFloat($(b, '#m-vel').value), pas = parseInt($(b, '#m-pas').value, 10), int = parseFloat($(b, '#m-int').value);
          if (!(pot >= 0 && pot <= 100)) throw new Error('La potencia debe estar entre 0 y 100 %.');
          if (!(vel > 0)) throw new Error('Escriba una velocidad mayor que 0.');
          if (!(pas >= 1)) throw new Error('Las pasadas deben ser 1 o más.');
          if (!(int > 0)) throw new Error('Escriba un intervalo mayor que 0.');
          const r = { potencia: pot, velocidad: vel, pasadas: pas, intervalo: int, modo: $(b, '#m-mod').value };
          const o = leerPropios();
          if ($(b, '#m-guardar').checked) o[clave()] = r; else delete o[clave()];
          guardarPropios(o);
          try { localStorage.setItem(KEY_ULTIMO, JSON.stringify({ laser: $(b, '#m-laser').value, mat: $(b, '#m-mat').value, acc: $(b, '#m-acc').value, gro: $(b, '#m-gro').disabled ? null : $(b, '#m-gro').value, valores: r })); } catch (e) { }
          return r;
        };
      },
      buttons: [{ label: 'Cancelar' }, {
        label: 'Aplicar', primary: true, action: b => {
          const r = b._leer();
          dev.laserDB = $(b, '#m-laser').value; LS.saveSettings();
          if (onApply) return onApply(r);
          X.aplicarMaterial(r, capas);
        }
      }]
    });
  };
})(window.LS);
