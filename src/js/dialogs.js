// Diálogos: dispositivo, rotativo (TR3), calibración, imagen, calcado, texto, matrices, prueba de materiales.
(function (LS) {
  const G = LS.G, D = LS.D, U = LS.ui, $ = U.$, esc = U.esc;
  const X = {};

  // Ventanas apiladas: una ventana puede abrir otra (p. ej. Materiales dentro de Imagen objetivo) sin perderse
  X.open = ({ title, body, buttons = [], width, onOpen, onClose }) => new Promise(resolve => {
    const host = $('#modal');
    const m = U.h(`<div class="capa-modal"><div class="dlg" style="${width ? 'width:' + width + 'px' : ''}"><header>${esc(title)}</header><div class="body">${body}</div><footer></footer></div></div>`);
    host.querySelectorAll('.capa-modal').forEach(c => c.classList.add('atras'));
    host.append(m); host.hidden = false;
    const ft = m.querySelector('footer');
    let cerrado = false;
    const close = v => {
      if (cerrado) return; cerrado = true;
      m.remove(); const resto = host.querySelectorAll('.capa-modal');
      if (!resto.length) host.hidden = true; else resto[resto.length - 1].classList.remove('atras');
      onClose && onClose(); resolve(v);
    };
    let primario = null;
    buttons.forEach(b => {
      const el = U.h(`<button class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`);
      el.onclick = async () => { try { const r = b.action ? await b.action(m.querySelector('.body'), close) : undefined; if (r !== false && !b.keepOpen) close(r); } catch (e) { U.toast(e.message || String(e), 'err'); } };
      if (b.primary) primario = el;
      ft.append(el);
    });
    m.addEventListener('keydown', e => {
      if (m.classList.contains('atras')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && primario && !/TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); primario.click(); }
    });
    onOpen && onOpen(m.querySelector('.body'), close);
    const first = m.querySelector('input,select,textarea'); (first || primario || m.querySelector('button')).focus();
  });
  const cancel = { label: 'Cancelar' };
  const val = (b, id) => { const e = b.querySelector('#' + id); return e.type === 'checkbox' ? e.checked : e.type === 'number' ? parseFloat(e.value) : e.value; };
  const row = (label, input) => `<div class="row"><label>${label}</label>${input}</div>`;
  const num = (id, v, attrs = 'step="0.1"') => `<input type="number" id="${id}" value="${v}" ${attrs}>`;
  const sel = (id, opts, v) => `<select id="${id}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${k == v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  X.confirm = (title, msg) => X.open({ title, body: `<p>${msg}</p>`, buttons: [cancel, { label: 'Aceptar', primary: true, action: () => true }] });

  // ---------- Dispositivo ----------
  // Asistente de WiFi para placas ESP32 (MKS DLC32 / LS ESP32 PRO, Grbl_ESP32): ver IP, unir a la red de casa, elegir conexión
  X.wifi = () => {
    const M = LS.machine, d = LS.device;
    const info = () => {
      const w = M.wifi || {}, sta = w.STA, ap = w.AP;
      const l = [];
      if (sta) l.push(`Red de su casa (STA): <b>${esc(sta.red || '—')}</b> · ${sta.conectado && sta.ip ? 'conectada · IP <b>' + esc(sta.ip) + '</b>' : 'no conectada'}`);
      if (ap) l.push(`Red propia de la placa (AP): <b>${esc(ap.red || '—')}</b>${ap.ip ? ' · IP <b>' + esc(ap.ip) + '</b>' : ''}`);
      if (w.leida) l.push(`IP leída: <b>${esc(w.leida)}</b>`);
      if (w.puerto) l.push(`Puerto Telnet de la placa: <b>${w.puerto}</b>`);
      const a = M.ajustesTexto || {};
      if (a['50'] != null) l.push(`Modo WiFi ($50): <b>${({ 0: 'apagado', 1: 'red propia (AP)', 2: 'red de casa (STA)', 3: 'Bluetooth' })[a['50']] || a['50']}</b>${a['53'] ? ' · red de casa ($53): <b>' + esc(a['53']) + '</b>' : ''}${a['51'] ? ' · red propia ($51): <b>' + esc(a['51']) + '</b>' : ''}`);
      return l.length ? l.join('<br>') : (M.connected ? 'Aún no hay datos: pulse «Leer IP».' : 'Conecte la placa por USB para leer su red e IP (aparecen al conectar).');
    };
    const ipSugerida = () => { const w = M.wifi || {}; return (w.STA && w.STA.conectado && w.STA.ip) || w.leida || (w.AP && w.AP.ip) || ''; };
    let tm = null;
    return X.open({
      title: 'WiFi de la placa', width: 640,
      body: `<fieldset><legend>Lo que informa la placa</legend><p id="w-info" class="note" style="margin:4px 0"></p>
          <div class="btns"><button id="w-leer" type="button" title="Envía [ESP111] por la conexión actual">Leer IP</button><button id="w-usar" type="button">Usar esta IP</button></div></fieldset>
        <fieldset><legend>Opción A — Conectar el PC a la red propia de la placa</legend>
          <p class="note" style="margin:4px 0">En Windows, abra las redes WiFi y conéctese a la red de la placa (p. ej. <b>Laser_39067</b>; contraseña de fábrica habitual <b>12345678</b>). Luego use la IP que muestra la placa en modo AP. Mientras tanto el PC no tendrá Internet por WiFi.</p></fieldset>
        <fieldset><legend>Opción B — Unir la placa a la WiFi de su casa (recomendado)</legend>
          <div class="row"><label>Nombre de la red (SSID)</label><input id="w-ssid" type="text" autocomplete="off"></div>
          <div class="row"><label>Contraseña</label><input id="w-pass" type="password" autocomplete="off"></div>
          <p class="note" style="margin:4px 0">Requiere la placa conectada por USB. Se envían $53=red, $54=contraseña y $50=2 (modo red de casa) y se reinicia la placa; si no se conecta, apague y encienda la máquina; al volver a conectar por USB verá la IP nueva aquí. La red debe ser de 2,4 GHz.</p>
          <div class="btns"><button id="w-enviar" type="button">Enviar a la placa y reiniciar</button><button id="w-ap" type="button" title="$50=1: la placa vuelve a crear su propia red WiFi">Volver a red propia (AP)</button></div></fieldset>
        <fieldset><legend>Conexión de esta aplicación</legend>
          <div class="row"><label>Conectar por</label><select id="w-via"><option value="usb">USB (cable)</option><option value="wifi">WiFi</option></select></div>
          <div class="row"><label>IP de la placa</label><input id="w-ip" type="text" placeholder="192.168.1.50"></div>
          <div class="row"><label>Puerto</label><input id="w-port" type="number" min="1" max="65535" style="width:90px"> <span class="note" style="margin:0 0 0 6px">MKS DLC32: 8080 · otras: 23</span></div>
          <div class="row"><label>Envío de trabajos por WiFi</label><select id="w-envio"><option value="bufer">Fluido: búfer (recomendado)</option><option value="seguro">Una línea a la vez (lento: el láser se detiene entre líneas)</option></select></div>
          <div class="row"><label>Grabar desde la tarjeta SD de la placa</label><input type="checkbox" id="w-sd"></div>
          <div class="row"><label>Puerto web de la placa (subida a la tarjeta)</label><input id="w-http" type="number" min="1" max="65535" style="width:90px"></div>
          <div class="btns"><button id="w-probar" type="button" title="Comprueba si el PC llega a la placa y en qué puerto responde">Probar conexión</button></div>
          <p id="w-diag" class="note" style="margin:4px 0"></p></fieldset>`,
      onOpen: b => {
        const q = id => b.querySelector(id);
        q('#w-via').value = d.conexion || 'usb'; q('#w-ip').value = d.wifiHost || ''; q('#w-envio').value = d.wifiEnvio === 'seguro' ? 'seguro' : 'bufer'; q('#w-sd').checked = d.usarSD !== false; q('#w-http').value = d.wifiHttp || 80; q('#w-port').value = d.wifiPuerto || 8080;
        const pintar = () => { const e = q('#w-info'); if (e) e.innerHTML = info(); q('#w-usar').disabled = !ipSugerida(); };
        pintar(); tm = setInterval(pintar, 700);
        q('#w-leer').onclick = () => U.guard(async () => { if (!M.connected) throw new Error('Conecte primero la placa (USB o WiFi).'); await M.sendLine('[ESP111]'); });
        q('#w-usar').onclick = () => { q('#w-ip').value = ipSugerida(); q('#w-via').value = 'wifi'; if (M.wifi && M.wifi.puerto) q('#w-port').value = M.wifi.puerto; };
        q('#w-probar').onclick = () => U.guard(async () => {
          const ip = q('#w-ip').value.trim(), dg = q('#w-diag');
          if (!ip) throw new Error('Escriba la IP de la placa.');
          dg.textContent = 'Probando ' + ip + '…';
          const r = await window.nativo.tcpProbar(ip, [8080, 23, 80]);
          const ab = r.filter(x => x.estado === 'abierto').map(x => x.port);
          const txt = r.map(x => `${x.port}: ${x.estado}`).join(' · ');
          let v;
          if (ab.includes(8080) || ab.includes(23)) { const pt = ab.includes(8080) ? 8080 : 23; q('#w-port').value = pt; q('#w-via').value = 'wifi'; v = `✔ La placa responde en el puerto ${pt}. Pulse Guardar y luego Conectar.`; }
          else if (ab.includes(80)) v = '⚠ La placa está en la red (su página web responde) pero no acepta Telnet: cierre LaserGRBL u otro programa conectado, o reinicie la placa.';
          else if (r.every(x => x.estado === 'rechazado')) v = '⚠ Hay un equipo en esa IP pero no es la placa (o la placa tiene el WiFi apagado). Revise la IP.';
          else v = '✖ No hay respuesta en esa IP: la placa no está en la misma red que el PC, la IP es otra, o la placa sigue en su red propia (Laser_…). Conecte por USB y abra WiFi… para ver su modo y su IP.';
          dg.innerHTML = esc(v) + '<br><span style="opacity:.7">' + esc(txt) + '</span>';
        });
        q('#w-ap').onclick = () => U.guard(async () => {
          if (!M.connected || M.via !== 'usb') throw new Error('Para cambiar el modo WiFi, conecte la placa por USB.');
          await M.sendLine('$50=1'); await new Promise(r => setTimeout(r, 500)); await M.sendLine('[ESP444]RESTART');
          U.toast('La placa vuelve a su red propia (AP) tras reiniciar.', 'ok');
        });
        q('#w-enviar').onclick = () => U.guard(async () => {
          const ssid = q('#w-ssid').value.trim(), pass = q('#w-pass').value;
          if (!M.connected || M.via !== 'usb') throw new Error('Para enviar la red, conecte la placa por USB.');
          if (!ssid) throw new Error('Escriba el nombre de la red WiFi.');
          if (pass && pass.length < 8) throw new Error('La contraseña WiFi debe tener al menos 8 caracteres.');
          // se envían las dos variantes de comandos (ESP3D y Grbl_ESP32 "$"); el firmware ignora las que no conoce
          const env = async l => { await M.sendLine(l); await new Promise(r => setTimeout(r, 250)); };
          // MKS LS ESP32 / DLC32 (S1): $53 = red de casa, $54 = contraseña, $50 = 2 (modo STA).
          // Si el firmware es otro (Grbl_ESP32/ESP3D), se envían también sus variantes; el firmware ignora las que no conoce.
          await env('$53=' + ssid); await env('$54=' + pass); await env('$50=2');
          if (!M.ajuste('50')) { await env('$ESP100=' + ssid); await env('$ESP101=' + pass); await env('$ESP110=STA'); }
          await env('$$');
          await new Promise(r => setTimeout(r, 800)); await M.sendLine('[ESP444]RESTART');
          U.toast('Datos enviados. Apague la máquina (fuente y USB) unos segundos y vuelva a encenderla; luego conecte por USB para ver la IP nueva.', 'ok');
        });
      },
      onClose: () => clearInterval(tm),
      buttons: [{ label: 'Cerrar' }, {
        label: 'Guardar', primary: true, action: b => {
          const ip = b.querySelector('#w-ip').value.trim(), via = b.querySelector('#w-via').value;
          if (via === 'wifi' && !/^[\w.-]+$/.test(ip)) throw new Error('Escriba una IP válida, por ejemplo 192.168.1.50.');
          Object.assign(d, { conexion: via, wifiHost: ip, wifiEnvio: b.querySelector('#w-envio').value, usarSD: b.querySelector('#w-sd').checked, wifiHttp: Math.max(1, parseInt(b.querySelector('#w-http').value, 10) || 80), wifiPuerto: Math.max(1, Math.min(65535, parseInt(b.querySelector('#w-port').value, 10) || 8080)) });
          LS.saveSettings(); U.refreshVia && U.refreshVia(); U.refreshLaser && U.refreshLaser();
          U.toast(via === 'wifi' ? `Conexión por WiFi a ${ip}:${d.wifiPuerto}. Pulse Conectar.` : 'Conexión por USB.', 'ok');
        }
      }]
    });
  };
  // Modo de ejes de las placas MKS LS ESP32 ($45). Su significado cambia según la versión del firmware,
  // por eso se prueba: elegir un valor, apagar y encender, y comprobar qué se mueve.
  X.modo45 = () => {
    const M = LS.machine, act = M.ajuste ? M.ajuste('45') : null;
    return X.open({
      title: 'Modo de ejes de la placa ($45)', width: 600,
      body: `<p>Valor actual: <b>${act != null ? '$45=' + esc(act) : 'desconocido'}</b>.</p>
        <p class="note">Este ajuste decide si el conector Z mueve el rotativo por separado o si la placa manda el movimiento de Y al rotativo (modo rodillo). <b>Su significado cambia según la versión del firmware</b>, así que hay que probarlo:</p>
        <ol class="note"><li>Elija un valor y pulse Enviar.</li><li><b>Apague y encienda la máquina</b> (fuente y USB) y vuelva a conectar.</li><li>Pulse «Probar»: debe moverse la <b>barra Y</b> con la primera orden y el <b>rotativo</b> con la segunda.</li></ol>
        <p class="note">En su placa: <b>$45=2</b> resultó ser modo rodillo (Y mueve el rotativo). Pruebe primero <b>$45=0</b> y, si el rotativo no gira con ⟲ ⟳, <b>$45=1</b>.</p>
        <div class="btns"><button type="button" data-m45="0">Enviar $45=0</button><button type="button" data-m45="1">Enviar $45=1</button><button type="button" data-m45="2">Enviar $45=2</button></div>
        <div class="btns"><button type="button" id="m45-prueba" title="Envía Y +5 mm y luego Z +5 mm, despacio">Probar (Y 5 mm, luego Z 5 mm)</button></div>
        <p class="note" id="m45-res"></p>`,
      onOpen: b => {
        b.querySelectorAll('[data-m45]').forEach(x => x.onclick = () => U.guard(async () => {
          if (!M.connected) throw new Error('Conecte la máquina primero.');
          await M.sendLine('$45=' + x.dataset.m45); await new Promise(r => setTimeout(r, 400)); await M.sendLine('$45');
          M.ajustesTexto = Object.assign(M.ajustesTexto || {}, { 45: x.dataset.m45 });
          b.querySelector('#m45-res').innerHTML = `Enviado <b>$45=${x.dataset.m45}</b>. Ahora <b>apague y encienda la máquina</b>, conecte y pulse «Probar».`;
        }));
        b.querySelector('#m45-prueba').onclick = () => U.guard(async () => {
          if (!M.connected) throw new Error('Conecte la máquina primero.');
          await M.rawJog('Y', 5, 300); await new Promise(r => setTimeout(r, 2500)); await M.rawJog('Z', 5, 300);
          b.querySelector('#m45-res').innerHTML = 'Primero se envió <b>Y +5</b> (debe moverse la barra) y luego <b>Z +5</b> (debe girar el rotativo). Si no fue así, pruebe otro valor.';
        });
      },
      buttons: [{ label: 'Cerrar', primary: true }]
    });
  };
  X.device = () => {
    const d = LS.device;
    return X.open({
      title: 'Configuración del dispositivo', width: 520,
      body: `${row('Nombre', `<input type="text" id="d-nombre" value="${esc(d.nombre)}">`)}
        ${row('Idioma / Language', sel('d-idioma', LS.IDIOMAS, LS.idioma()))}
        ${row('Modelo de máquina', sel('d-modelo', Object.fromEntries(Object.entries(LS.MACHINE_PRESETS).map(([k, m]) => [k, m.nombre + (m.ancho ? ` — ${m.ancho}×${m.alto} mm` : '')])), d.modelo || 'generico'))}
        ${row('Mostrar esquema de la máquina', `<input type="checkbox" id="d-vermaq" ${d.verMaquina !== false ? 'checked' : ''}>`)}
        ${row('Escala en rieles y barra', sel('d-escala', { cm: 'Centímetros (como la regla de la máquina)', mm: 'Milímetros', no: 'No mostrar' }, d.escala || 'cm'))}
        <div class="grid2">${row('Margen marco izq. (mm)', num('d-mi', d.margenIzq ?? '', 'step="1" min="0" placeholder="modelo"'))}${row('Margen marco der. (mm)', num('d-md', d.margenDer ?? '', 'step="1" min="0" placeholder="modelo"'))}</div>
        <div class="grid2">${row('Margen marco sup. (mm)', num('d-ms', d.margenSup ?? '', 'step="1" min="0" placeholder="modelo"'))}${row('Margen marco inf. (mm)', num('d-mf', d.margenInf ?? '', 'step="1" min="0" placeholder="modelo"'))}</div>
        <p class="note">También puede ajustar el marco con el ratón: haga clic sobre un perfil del marco en el lienzo y arrastre las manijas.</p>
        ${row('Posición del cabezal al encender', sel('d-arr', { 'inf-izq': 'Esquina inferior izquierda', 'sup-izq': 'Esquina superior izquierda', 'inf-der': 'Esquina inferior derecha', 'sup-der': 'Esquina superior derecha', 'cen-cen': 'Centro', ...(d.refArranque === 'custom' ? { custom: 'Posición personalizada (fijada con el ratón)' } : {}) }, d.refArranque || 'inf-izq'))}
        ${row('La máquina tiene finales de carrera instalados', `<input type="checkbox" id="d-finales" ${d.finalesCarrera ? 'checked' : ''}>`)}
        <div id="d-topes" style="border-left:3px solid #ff8a1f;padding-left:10px;margin:4px 0 8px">
          ${row('Final de carrera X en', sel('d-topex', { izq: 'Izquierda (extremo izquierdo del pórtico)', der: 'Derecha (extremo derecho del pórtico)' }, d.topeX || 'izq'))}
          ${row('Final de carrera Y en', sel('d-topey', { inf: 'Abajo / delante (lado de la placa)', sup: 'Arriba / atrás' }, d.topeY || 'inf'))}
          <div class="grid2">${row('Velocidad de búsqueda (mm/min)', num('d-velb', d.velBusqueda || 600, 'step="50" min="100" max="3000"'))}${row('Aproximación fina (mm/min)', num('d-velbf', d.velBusquedaFina || 100, 'step="10" min="20" max="500"'))}</div>
          <p class="note">Velocidades bajas protegen los interruptores. Recomendado: 400–800 y 50–150 mm/min.</p>
          ${row('Método de búsqueda', sel('d-metodo', { guiado: 'Guiado por la app: avanza hasta ver el tope activo (recomendado)', auto: 'Firmware de la placa ($HX, $HY)' }, d.metodoInicio === 'auto' ? 'auto' : 'guiado'))}
          <p class="note" id="d-topesinfo"></p>
          <p class="note" id="d-mapa"></p>
          <div class="btns"><button type="button" id="d-topesapl" title="Envía $22=1, $23 (sentido hacia los topes), $24, $25, $26 y $27 a la placa">Aplicar ajustes de inicio a la placa</button></div>
        </div>
        <p class="note">Si la placa tiene conectores para sensores pero la máquina no los tiene, deje esta casilla sin marcar: «Inicio» llevará el cabezal a la posición de partida en vez de buscar los sensores.</p>
        ${row('Asumirla al conectar (sin finales de carrera)', `<input type="checkbox" id="d-arrauto" ${d.arranqueAuto !== false ? 'checked' : ''}>`)}
        ${row('Controlador', sel('d-tipo', { grbl: 'GRBL (diodo / CO2 por USB)', ruida: 'Ruida (CO2 por red Ethernet)' }, d.tipo))}
        <div class="grid2">${row('Ancho (mm)', num('d-ancho', d.ancho, 'step="1" min="10"'))}${row('Alto (mm)', num('d-alto', d.alto, 'step="1" min="10"'))}</div>
        <p class="note">Si en su máquina ▲ mueve el cabezal hacia usted, use Mover → «Comprobar dirección» o «Invertir Y»: cambia esta esquina de origen.</p>
        ${row('Origen de la máquina', sel('d-origen', { 'inf-izq': 'Abajo a la izquierda', 'sup-izq': 'Arriba a la izquierda', 'sup-der': 'Arriba a la derecha', 'inf-der': 'Abajo a la derecha' }, d.origen))}
        ${row('Unidad de velocidad', sel('d-uv', { 'mm/s': 'mm/s', 'mm/min': 'mm/min' }, d.unidadVelocidad))}
        <div id="d-grbl">
          ${row('Valor S máximo ($30)', num('d-maxs', d.maxS, 'step="1" min="1"'))}
          ${row('Baudios', sel('d-baud', { 115200: '115200', 250000: '250000', 230400: '230400', 57600: '57600', 9600: '9600' }, d.baudios))}
          ${row('Modo de láser', sel('d-modo', { M4: 'M4 — potencia dinámica (recomendado)', M3: 'M3 — potencia constante' }, d.modoLaser))}
          ${row('Asistencia de aire (M8/M9)', `<input type="checkbox" id="d-aire" ${d.aireM8 ? 'checked' : ''}>`)}
          ${row('Buscar inicio al conectar', `<input type="checkbox" id="d-homing" ${d.homingAlConectar ? 'checked' : ''}>`)}
        </div>
        <div id="d-ruida">${row('Dirección IP', `<input type="text" id="d-ip" value="${esc(d.ruidaIP)}">`)}
          <p class="warn">El soporte Ruida es experimental: el formato .rd y el protocolo de red no tienen documentación oficial pública. Pruebe primero con "Marco" y un trabajo pequeño, a baja potencia.</p></div>
        <p class="note" style="margin-top:10px"><b>Máquinas sin finales de carrera:</b> la app actúa como límite usando el ancho y alto de arriba.</p>
        ${row('Recortar trabajos y marco al área', `<input type="checkbox" id="d-recorte" ${d.recortarArea !== false ? 'checked' : ''}>`)}
        ${row('Limitar movimientos manuales', `<input type="checkbox" id="d-limmov" ${d.limitarMovimientos !== false ? 'checked' : ''}>`)}
        ${row('Volver al origen al terminar', `<input type="checkbox" id="d-volver" ${d.volverOrigen ? 'checked' : ''}>`)}
        ${row('Potencia del marco (%)', num('d-pmarco', d.potenciaMarco, 'step="0.5" min="0" max="5"'))}
        ${row('Velocidad de viaje (mm/s)', num('d-vrap', d.velRapida || 100, 'step="1" min="1"'))}`,
      onOpen: b => {
        const topesUpd = () => {
          const on = b.querySelector('#d-finales').checked; b.querySelector('#d-topes').hidden = !on;
          const tx = b.querySelector('#d-topex').value, ty = b.querySelector('#d-topey').value;
          const prev = { topeX: d.topeX, topeY: d.topeY, origen: d.origen }; Object.assign(d, { topeX: tx, topeY: ty, origen: b.querySelector('#d-origen').value });
          const m = LS.machine.mascaraHoming(); Object.assign(d, prev);
          const guiado = b.querySelector('#d-metodo').value !== 'auto';
          b.querySelector('#d-topesinfo').innerHTML = `Inicio: primero <b>X</b> hacia la ${tx === 'izq' ? 'izquierda' : 'derecha'}, luego <b>Y</b> hacia ${ty === 'inf' ? 'adelante' : 'atrás'}. La esquina <b>${ty === 'inf' ? 'inferior' : 'superior'} ${tx === 'izq' ? 'izquierda' : 'derecha'}</b> queda como origen (0,0). ${guiado ? 'La app avanza hasta que el tope se active (placa: <code>$22=0</code>).' : `En la placa: <code>$22=1 $23=${m} $25=${b.querySelector('#d-velb').value} $24=${b.querySelector('#d-velbf').value}</code>.`}`;
        };
        const mapaUpd = () => {
          const m = d.mapaTopes || {}, cruz = Object.keys(m).some(k => m[k] !== k);
          b.querySelector('#d-mapa').innerHTML = cruz ? `Entradas detectadas: tope X → entrada <b>${m.X || 'X'}</b>, tope Y → entrada <b>${m.Y || 'Y'}</b> (conectores cruzados, ya corregido). <a href="#" id="d-mapareset">Restablecer</a>` : 'Si los conectores X-/Y- están cruzados, la búsqueda lo detecta y lo corrige sola.';
          const a = b.querySelector('#d-mapareset'); if (a) a.onclick = ev => { ev.preventDefault(); d.mapaTopes = null; LS.saveSettings(); mapaUpd(); };
        };
        mapaUpd();
        ['#d-finales', '#d-topex', '#d-topey', '#d-origen', '#d-velb', '#d-velbf', '#d-metodo'].forEach(id => b.querySelector(id).addEventListener('change', topesUpd)); topesUpd();
        b.querySelector('#d-topesapl').onclick = () => U.guard(async () => {
          if (!LS.machine.connected) throw new Error('Conecte la máquina para enviar los ajustes.');
          Object.assign(d, { topeX: b.querySelector('#d-topex').value, topeY: b.querySelector('#d-topey').value, origen: b.querySelector('#d-origen').value, finalesCarrera: true, velBusqueda: Math.max(100, Math.min(3000, parseFloat(b.querySelector('#d-velb').value) || 600)), velBusquedaFina: Math.max(20, Math.min(500, parseFloat(b.querySelector('#d-velbf').value) || 100)), metodoInicio: b.querySelector('#d-metodo').value });
          LS.saveSettings(); const n = await LS.machine.aplicarAjustesInicio(true);
          U.toast(n ? 'Ajustes de inicio enviados a la placa.' : 'La placa ya tenía estos ajustes.', 'ok');
        });
        b.querySelector('#d-modelo').onchange = () => { const m = LS.MACHINE_PRESETS[val(b, 'd-modelo')]; ['d-mi', 'd-md', 'd-ms', 'd-mf'].forEach(id => b.querySelector('#' + id).value = ''); if (m.ancho) { b.querySelector('#d-ancho').value = m.ancho; b.querySelector('#d-alto').value = m.ancho && m.alto; if (!val(b, 'd-nombre') || val(b, 'd-nombre') === 'Mi láser') b.querySelector('#d-nombre').value = m.nombre; } }; const t = () => { b.querySelector('#d-grbl').hidden = val(b, 'd-tipo') !== 'grbl'; b.querySelector('#d-ruida').hidden = val(b, 'd-tipo') !== 'ruida'; }; b.querySelector('#d-tipo').onchange = t; t(); },
      buttons: [cancel, {
        label: 'Guardar', primary: true, action: b => {
          if (LS.machine.connected && val(b, 'd-tipo') !== d.tipo) throw new Error('Desconecte el láser antes de cambiar el tipo de controlador.');
          Object.assign(d, { nombre: val(b, 'd-nombre'), tipo: val(b, 'd-tipo'), ancho: val(b, 'd-ancho'), alto: val(b, 'd-alto'), origen: val(b, 'd-origen'), unidadVelocidad: val(b, 'd-uv'), maxS: val(b, 'd-maxs'), baudios: Number(val(b, 'd-baud')), modoLaser: val(b, 'd-modo'), aireM8: val(b, 'd-aire'), ruidaIP: val(b, 'd-ip').trim(), volverOrigen: val(b, 'd-volver'), potenciaMarco: Math.min(5, val(b, 'd-pmarco') || 0), marcoLuz: (val(b, 'd-pmarco') || 0) > 0 ? (d.marcoLuz != null ? d.marcoLuz : true) : false, velRapida: val(b, 'd-vrap'), modelo: val(b, 'd-modelo'), verMaquina: val(b, 'd-vermaq'), escala: val(b, 'd-escala'), finalesCarrera: val(b, 'd-finales'), topeX: val(b, 'd-topex'), topeY: val(b, 'd-topey'), velBusqueda: Math.max(100, Math.min(3000, val(b, 'd-velb') || 600)), velBusquedaFina: Math.max(20, Math.min(500, val(b, 'd-velbf') || 100)), metodoInicio: val(b, 'd-metodo'), homingAlConectar: val(b, 'd-finales') ? val(b, 'd-homing') : false, refArranque: val(b, 'd-arr'), arranqueAuto: val(b, 'd-arrauto'),
            margenIzq: isFinite(val(b, 'd-mi')) ? val(b, 'd-mi') : null, margenDer: isFinite(val(b, 'd-md')) ? val(b, 'd-md') : null, margenSup: isFinite(val(b, 'd-ms')) ? val(b, 'd-ms') : null, margenInf: isFinite(val(b, 'd-mf')) ? val(b, 'd-mf') : null, recortarArea: val(b, 'd-recorte'), limitarMovimientos: val(b, 'd-limmov') });
          LS.saveSettings(); LS.V.fitBed(); U.refreshLaser(); D.changed('device');
          if (val(b, 'd-idioma') !== LS.idioma()) LS.setIdioma(val(b, 'd-idioma'));
        }
      }]
    });
  };

  // ---------- Rotativo ----------
  X.rotary = () => {
    const R = LS.rotary;
    const presets = Object.fromEntries(Object.entries(LS.ROTARY_PRESETS).map(([k, p]) => [k, p.nombre]));
    const isGrbl = LS.device.tipo === 'grbl';
    return X.open({
      title: 'Configuración de rotativo', width: 620,
      body: `<p class="note">Para grabar objetos cilíndricos (vasos, botellas, termos). El programa convierte los milímetros del diseño en giro del objeto y dibuja el módulo en el lienzo (arrástrelo para ubicarlo; doble clic para abrir esta ventana).</p>
        <div class="grid2">${row('Activar rotativo', `<input type="checkbox" id="r-on" ${R.activo ? 'checked' : ''}>`)}${row('Mostrar en el lienzo', `<input type="checkbox" id="r-show" ${R.mostrar !== false ? 'checked' : ''}>`)}</div>
        ${row('Modelo', sel('r-modelo', presets, R.modelo))}
        <div id="r-info"></div>
        <h3 style="font-size:12px;color:var(--muted);margin:12px 0 4px">CONEXIÓN A LA PLACA</h3>
        ${row('Rotativo conectado en', sel('r-eje', { Y: 'Puerto del eje Y (reemplaza el motor Y)', Z: 'Puerto del eje Z (eje Z independiente)', R: 'Conector Z — modo rodillo de la placa MKS ($45=1)' }, R.eje || 'Y'))}
        <div id="r-zinfo"></div>
        <div id="r-ymm-row">${row('Pasos/mm del eje Y ($101)', `${num('r-ymm', R.pasosMmY, 'step="0.001" min="0.001"')}<button id="r-leer" title="Leer del controlador conectado">Leer</button>`)}</div>
        <div id="r-zmm-row">${row('Pasos/mm del eje Z ($102)', `${num('r-zmm', R.pasosMmZ, 'step="0.001" min="0.001"')}<button id="r-leerz" title="Leer del controlador conectado">Leer</button>`)}</div>
        <h3 style="font-size:12px;color:var(--muted);margin:12px 0 4px">MÓDULO Y OBJETO</h3>
        ${row('Tipo', sel('r-tipo', { rodillos: 'Rodillos (el objeto apoya sobre ruedas)', mandril: 'Mandril (el objeto se sujeta en el eje)' }, R.tipo))}
        ${row('Pasos por rotación', num('r-pasos', R.pasosRotacion, 'step="1" min="1"'))}
        <div id="r-rod">${row('Diámetro del rodillo (mm)', num('r-drod', R.diamRodillo, 'step="0.01" min="0.1"'))}</div>
        ${row('Forma del objeto', sel('r-forma', { cilindro: 'Cilindro (vaso recto, botella, termo)', cono: 'Cono (vaso o termo cónico)' }, R.forma || 'cilindro'))}
        <div class="grid2">${row('<span id="r-dlab">Ø objeto (mm)</span>', num('r-dobj', R.diamObjeto, 'step="0.1" min="1"'))}${row('Largo objeto (mm)', num('r-lobj', R.largoObjeto || 200, 'step="1" min="5"'))}</div>
        <div id="r-cono"><div class="grid2">${row('Ø extremo final (mm)', num('r-dobj2', R.diamObjeto2 || 60, 'step="0.1" min="1"'))}<div id="r-controw">${row('Ø en la rueda motriz (mm)', num('r-dcont', R.diamContacto || '', 'step="0.1" min="1" placeholder="el mayor"'))}</div></div>
          <p class="note">El diseño se ajusta a cada altura del cono (longitud de arco real), así no se deforma. Eleve el extremo angosto para que la línea superior quede horizontal y el foco sea constante. Si el giro no coincide, ajuste el "Ø en la rueda motriz".</p></div>
        <div class="grid2">${row('Largo módulo ≈ (mm)', num('r-lmod', R.largoModulo || 250, 'step="1" min="20"'))}${row('Ancho módulo ≈ (mm)', num('r-amod', R.anchoModulo || 110, 'step="1" min="20"'))}</div>
        ${row('Orientación del eje del objeto', sel('r-orient', { horizontal: 'Horizontal (paralelo a X)', vertical: 'Vertical (paralelo a Y) — solo puerto Z' }, R.orient || 'horizontal'))}
        ${row('Invertir giro', `<input type="checkbox" id="r-inv" ${R.invertir ? 'checked' : ''}>`)}
        <p class="note" id="r-factor"></p>
        <h3 style="font-size:12px;color:var(--muted);margin:14px 0 4px">PROBAR Y VERIFICAR (con el láser conectado)</h3>
        <p class="note" id="r-plan"></p>
        <div class="btns"><button id="r-up" title="Gira un poco: la parte superior del objeto debe moverse hacia usted">▲ Girar 10 mm</button><button id="r-dn">▼ Girar 10 mm</button><button id="r-test">⟳ Una vuelta completa</button><button class="danger" id="r-stop">■ Detener</button></div>
        <div style="display:flex;gap:14px;align-items:center;margin:6px 0">
          <div class="jog" id="r-pad" style="grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,34px);margin:0">
            <button data-j="-1,1">↖</button><button data-j="0,1">▲</button><button data-j="1,1">↗</button>
            <button data-j="-1,0">◀</button><button class="danger" id="r-pstop" title="Detener">■</button><button data-j="1,0">▶</button>
            <button data-j="-1,-1">↙</button><button data-j="0,-1">▼</button><button data-j="1,-1">↘</button></div>
          <div class="note" style="flex:1;margin:0">Aquí ◀ ▶ mueven el cabezal en X y ▲ ▼ <b>giran el accesorio</b> (también en diagonal, ambos a la vez), igual que durante el grabado. <span id="r-padhint"></span><br>Paso: <select id="r-pstep"><option>1</option><option selected>5</option><option>10</option><option>25</option></select> mm</div>
        </div>
        <div id="r-q"></div>
        <details style="margin-top:6px"><summary style="cursor:pointer;color:var(--muted)">¿No sabe en qué conector está el rotativo? Identificarlo</summary>
          <p class="note">Mueve directamente cada conector de la placa 5 mm, sin conversión. Observe qué se mueve y responda.</p>
          <div class="btns"><button id="r-idY">Mover conector Y</button><button id="r-idZ">Mover conector Z</button></div>
        </details>
        <div class="btns"><button id="r-diag" title="Prueba X, Y y Z y muestra qué acepta y mueve el controlador">Diagnosticar ejes</button><button id="r-unlock" title="Quita la alarma del controlador ($X)">Desbloquear</button></div>
        <div class="btns"><button id="r-grbl">Revisar ajustes GRBL para puerto Z…</button></div>`,
      onOpen: b => {
        const upd = () => {
          const P = LS.ROTARY_PRESETS[val(b, 'r-modelo')], eje = val(b, 'r-eje');
          b.querySelector('#r-rod').hidden = val(b, 'r-tipo') === 'mandril';
          const cono = val(b, 'r-forma') === 'cono';
          b.querySelector('#r-cono').hidden = !cono; b.querySelector('#r-controw').hidden = val(b, 'r-tipo') === 'mandril';
          b.querySelector('#r-dlab').textContent = cono ? 'Ø extremo inicial (mm)' : 'Ø objeto (mm)';
          b.querySelector('#r-ymm-row').hidden = eje !== 'Y'; b.querySelector('#r-zmm-row').hidden = eje !== 'Z';
          b.querySelector('#r-grbl').hidden = eje !== 'Z';
          const orient = b.querySelector('#r-orient'); orient.options[1].disabled = eje !== 'Z' || !isGrbl;
          if (orient.options[1].disabled && orient.value === 'vertical') orient.value = 'horizontal';
          b.querySelector('#r-info').innerHTML = P.verificar ? `<p class="warn">TR3: rango de objetos ${P.rangoObjeto}. El fabricante no publica en su página los pasos por rotación, el diámetro del rodillo ni las medidas del módulo; los valores cargados son de partida. Confírmelos con el manual o use <b>Calibrar rotativo</b>.</p>` : (P.rangoObjeto ? `<p class="note">Rango de objetos: ${P.rangoObjeto}</p>` : '');
          b.querySelector('#r-zinfo').innerHTML = eje !== 'Z' ? '' : (!isGrbl
            ? '<p class="warn">La conexión al puerto Z aplica a controladores GRBL. En Ruida configure el rotativo (eje Y o U) desde el panel del controlador.</p>'
            : `<p class="note">El cable del rotativo va al conector <b>Z</b> de la placa (el motor Y queda conectado). Durante el trabajo el cabezal queda fijo sobre la línea roja del esquema y el objeto gira con movimientos en Z. Antes del primer uso pulse <b>Revisar ajustes GRBL</b>: normalmente hay que subir la velocidad y aceleración máximas de Z, y ampliar su recorrido si los límites por software están activos. El "paso Z por pasada" de las capas no se usa en este modo.</p>`);
          const d = val(b, 'r-dobj'), diam = val(b, 'r-tipo') === 'mandril' ? d : val(b, 'r-drod');
          const pmm = eje === 'Z' ? val(b, 'r-zmm') : val(b, 'r-ymm');
          const f = val(b, 'r-pasos') / (pmm * Math.PI * diam);
          const circ = Math.PI * d;
          let vmax = '';
          const st = LS.machine.grblSettings(), maxRate = eje === 'Z' ? st['112'] : st['111'];
          if (maxRate && isFinite(f) && f > 0) vmax = ` · Velocidad superficial máxima con $${eje === 'Z' ? 112 : 111}=${maxRate}: ${(maxRate / 60 / f).toFixed(0)} mm/s`;
          b.querySelector('#r-factor').textContent = `Circunferencia ${circ.toFixed(1)} mm · área desarrollada ${val(b, 'r-lobj')} × ${circ.toFixed(1)} mm · factor ${eje}: ${isFinite(f) ? f.toFixed(5) : '—'}${vmax}`;
        };
        b.querySelector('#r-modelo').onchange = () => { const P = LS.ROTARY_PRESETS[val(b, 'r-modelo')]; b.querySelector('#r-tipo').value = P.tipo; b.querySelector('#r-pasos').value = P.pasosRotacion; b.querySelector('#r-drod').value = P.diamRodillo; b.querySelector('#r-lmod').value = P.largoModulo; b.querySelector('#r-amod').value = P.anchoModulo; upd(); };
        b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', upd));
        const leer = (k, id) => () => { const v = LS.machine.grblSettings()[k] || (k === '101' ? LS.rotary.pasosMmYDetectado : null); if (v) { b.querySelector('#' + id).value = v; upd(); } else U.toast(`Conecte un controlador GRBL para leer $${k}.`, 'err'); };
        b.querySelector('#r-leer').onclick = leer('101', 'r-ymm');
        b.querySelector('#r-leerz').onclick = leer('102', 'r-zmm');
        // ---- Probar y verificar ----
        const q = b.querySelector('#r-q');
        const plan = () => {
          const on = val(b, 'r-on'), eje = val(b, 'r-eje');
          b.querySelector('#r-plan').innerHTML = !on
            ? '<span style="color:#ffcc66">El rotativo está desactivado: las pruebas moverían el cabezal en Y. Marque «Activar rotativo».</span>'
            : `Las pruebas girarán el accesorio por el <b>conector ${eje === 'Z' && isGrbl ? 'Z' : 'Y'}</b> de la placa${eje === 'Z' && isGrbl ? ' (el cabezal no se mueve)' : ' (el motor Y del cabezal debe estar desconectado)'}.`;
        };
        b.querySelectorAll('#r-on,#r-eje').forEach(i => i.addEventListener('change', plan)); plan();
        const preguntar = (texto, opciones) => {
          q.innerHTML = `<div class="pregunta"><p>${texto}</p><div class="btns">${opciones.map((o, i) => `<button data-i="${i}">${o[0]}</button>`).join('')}</div></div>`;
          q.querySelectorAll('[data-i]').forEach(x => x.onclick = () => U.guard(async () => { await opciones[+x.dataset.i][1](); }));
        };
        const listo = (msg, ok = true) => { q.innerHTML = `<div class="pregunta" style="border-color:${ok ? '#2f7a45' : '#7a5a2f'}"><p>${msg}</p></div>`; };
        // ---- Diagnóstico: explica qué pasó en el controlador ----
        const explicarErrores = (errs, alarma) => {
          if (alarma || errs.some(e => e.code === 'ALARM' || e.code === '9')) return 'El controlador está en <b>ALARMA</b> y rechaza todos los movimientos (por eso no se mueve ningún eje). Pulse <b>Desbloquear</b> y pruebe otra vez. Si su máquina no tiene finales de carrera, desactive la búsqueda de inicio ($22=0) en la consola.';
          const e = errs[0]; if (!e) return null;
          if (e.code === '15') return `El controlador rechazó el movimiento por <b>límites por software</b> (${e.line}). En máquinas sin finales de carrera use $20=0, o pulse «Revisar ajustes GRBL para puerto Z» para ampliar $132.`;
          if (e.code === '3' || e.code === '20') return `El firmware no reconoce el comando de movimiento manual (${e.line}). Ya se activó el modo compatible (G0): pruebe de nuevo.`;
          return `El controlador respondió <b>${e.line}</b> ${e.texto}.`;
        };
        const diagnosticar = async (ejes) => {
          q.innerHTML = '<div class="pregunta"><p>Diagnosticando… no toque la máquina.</p></div>';
          const filas = []; let sugerirY = false;
          for (const ax of ejes) {
            const d = await LS.machine.diagnoseAxis(ax, 3);
            const err = explicarErrores(d.errors, d.alarm);
            let res;
            if (err) res = err;
            else if (d.moved != null && Math.abs(d.moved) > 0.01) res = `El controlador <b>sí movió ${ax}</b> (${d.before.toFixed(2)} → ${d.after.toFixed(2)}). Si no vio movimiento, el problema es físico: driver ${ax} ausente o mal insertado, cable en otro conector, motor sin alimentación o micropasos.`;
            else if (!d.idle) res = `El controlador no terminó de responder. Pulse <b>DETENER</b> para limpiar la comunicación y repita.`;
            else res = ax === 'Z' && !('102' in d.settings) ? 'El firmware no tiene eje Z (no existe $102): es una placa de 2 ejes. Conecte el rotativo al puerto Y.' : `El controlador aceptó la orden pero no cambió ${ax}: ${ax === 'Z' ? 'su placa probablemente no tiene eje Z (placa de 2 ejes). Conecte el rotativo al <b>puerto Y</b> (desenchufe el motor Y y enchufe allí el rotativo).' : `revise $10${'XYZ'.indexOf(ax)} (pasos/mm) y $11${'XYZ'.indexOf(ax)} (velocidad máxima).`}`;
            if (ax === 'Z' && !err && !(d.moved != null && Math.abs(d.moved) > 0.01)) sugerirY = true;
            filas.push(`<tr><td><b>${ax}</b></td><td>${res}</td></tr>`);
            if (d.alarm) break;
          }
          const q2 = LS.machine.queueInfo();
          q.innerHTML = `<div class="pregunta"><p><b>Resultado del diagnóstico</b> (firmware ${LS.machine.version ? 'GRBL ' + LS.machine.version.toFixed(1) : 'GRBL'}; comandos pendientes: ${q2.pendientes})</p><table class="layers">${filas.join('')}</table>${sugerirY ? '<div class="btns"><button id="r-usarY">Usar el puerto Y para el rotativo</button></div>' : ''}</div>`;
          const uy = q.querySelector('#r-usarY'); if (uy) uy.onclick = () => { b.querySelector('#r-eje').value = 'Y'; b.querySelector('#r-on').checked = true; upd(); plan(); save(b); listo('Rotativo configurado en el <b>puerto Y</b>. Apague la máquina, desenchufe el motor Y de la placa, enchufe allí el rotativo, encienda, reconecte y pruebe con ▲.'); };
        };
        b.querySelector('#r-pad').querySelectorAll('[data-j]').forEach(x => x.onclick = () => U.guard(async () => {
          if (!LS.machine.connected) throw new Error('Conecte el láser para mover.');
          save(b); const [jx, jy] = x.dataset.j.split(',').map(Number); await LS.machine.jog(...U.jogDelta(jx, jy, parseFloat(val(b, 'r-pstep'))), 15);
          b.querySelector('#r-padhint').textContent = 'Último: ' + LS.machine.describeJog(...U.jogDelta(jx, jy, parseFloat(val(b, 'r-pstep'))));
        }));
        b.querySelector('#r-pstop').onclick = () => U.guard(() => LS.machine.stop());
        b.querySelector('#r-diag').onclick = () => U.guard(async () => { if (!LS.machine.connected) throw new Error('Conecte el láser para diagnosticar.'); await diagnosticar(['X', 'Y', 'Z']); });
        b.querySelector('#r-unlock').onclick = () => U.guard(async () => { await LS.machine.unlock(); listo('Se envió Desbloquear ($X). Pruebe de nuevo con ▲.'); });
        const prueba = async (mm) => {
          if (!val(b, 'r-on')) throw new Error('Marque «Activar rotativo» primero; si no, la prueba movería el cabezal en Y.');
          save(b);
          const vert = LS.jobs.rotaryOrient() === 'vertical';
          const dx = vert ? mm : 0, dy = vert ? 0 : mm;
          if (!LS.machine.connected) throw new Error('Conecte el láser para probar.');
          const t0 = Date.now();
          await LS.machine.jog(dx, dy, 15);
          await LS.machine.waitIdle(3000);
          const err = explicarErrores(LS.machine.errorsSince(t0), LS.machine.state === 'Alarma');
          if (err) { listo(err, false); return null; }
          return LS.machine.describeJog(dx, dy);
        };
        const preguntarResultado = (desc, sentido) => preguntar(`Se envió: ${desc}.<br>¿Qué se movió?`, [
          ['✓ Giró el objeto', async () => {
            if (!sentido) return listo('Correcto. El accesorio gira por el conector configurado.');
            preguntar('¿La parte de arriba del objeto se movió <b>hacia usted</b> (frente de la máquina)?', [
              ['Sí', async () => listo('Perfecto: conexión y sentido de giro correctos.')],
              ['No, hacia el fondo', async () => { b.querySelector('#r-inv').checked = !b.querySelector('#r-inv').checked; save(b); listo('Se cambió «Invertir giro». Vuelva a probar con ▲ para confirmar.'); }]
            ]);
          }],
          ['Se movió el cabezal', async () => {
            const eje = val(b, 'r-eje');
            if (eje === 'Y') preguntar('El giro salió por el conector Y y el cabezal se movió: el motor Y sigue conectado allí. Si el rotativo está en el conector Z, cambie la conexión.', [
              ['Cambiar a puerto Z', async () => { b.querySelector('#r-eje').value = 'Z'; upd(); plan(); save(b); listo('Conexión cambiada a puerto Z. Pruebe de nuevo con ▲.'); }],
              ['Dejar como está', async () => listo('Sin cambios. Con el puerto Y, desconecte el motor Y del cabezal y conecte allí el rotativo.', false)]]);
            else listo('Con el puerto Z el cabezal no debería moverse. Revise que su placa tenga el driver Z y que el cable del rotativo esté en el conector Z; use «Identificarlo» abajo para comprobarlo.', false);
          }],
          ['No se movió nada', async () => { await diagnosticar([val(b, 'r-eje') === 'Z' && isGrbl ? 'Z' : 'Y', 'X']); }]
        ]);
        b.querySelector('#r-up').onclick = () => U.guard(async () => { const d = await prueba(10); if (d) preguntarResultado(d, true); });
        b.querySelector('#r-dn').onclick = () => U.guard(async () => { const d = await prueba(-10); if (d) preguntarResultado(d, false); });
        b.querySelector('#r-test').onclick = () => U.guard(async () => { const circ = Math.PI * val(b, 'r-dobj'); const d = await prueba(circ); if (d) preguntarResultado(d + ` — debe dar exactamente una vuelta (${circ.toFixed(1)} mm)`, false); });
        b.querySelector('#r-stop').onclick = () => U.guard(() => LS.machine.stop());
        const identificar = axis => U.guard(async () => {
          const st = LS.machine.grblSettings(); const feed = Math.min(600, st[axis === 'Z' ? '112' : '111'] || 600);
          await LS.machine.rawJog(axis, 5, feed);
          preguntar(`Se movió el conector <b>${axis}</b> 5 mm. ¿Qué se movió?`, [
            ['Giró el rotativo', async () => { b.querySelector('#r-on').checked = true; if (isGrbl) b.querySelector('#r-eje').value = axis; upd(); plan(); save(b); listo(`Listo: rotativo activado en el puerto ${axis}. Ahora pruebe el sentido con ▲.`); }],
            ['Se movió el cabezal', async () => listo(`El conector ${axis} mueve el cabezal; el rotativo no está ahí.`, false)],
            ['Nada', async () => listo(`El conector ${axis} no movió nada${axis === 'Z' ? ' (puede faltar el driver Z o $112 ser muy bajo)' : ''}.`, false)]]);
        });
        b.querySelector('#r-idY').onclick = () => identificar('Y');
        b.querySelector('#r-idZ').onclick = () => identificar('Z');
        b.querySelector('#r-grbl').onclick = () => U.guard(async () => { save(b); await X.grblRotaryZ(); });
        upd();
      },
      buttons: [cancel, { label: 'Guardar', primary: true, action: b => { save(b); } }]
    });
    function save(b) {
      Object.assign(R, { activo: val(b, 'r-on'), mostrar: val(b, 'r-show'), modelo: val(b, 'r-modelo'), eje: val(b, 'r-eje'), tipo: val(b, 'r-tipo'), pasosRotacion: val(b, 'r-pasos'), diamRodillo: val(b, 'r-drod'), diamObjeto: val(b, 'r-dobj'), largoObjeto: val(b, 'r-lobj'), largoModulo: val(b, 'r-lmod'), anchoModulo: val(b, 'r-amod'), orient: val(b, 'r-orient'), forma: val(b, 'r-forma'), diamObjeto2: val(b, 'r-dobj2'), diamContacto: val(b, 'r-dcont') > 0 ? val(b, 'r-dcont') : null, pasosMmY: val(b, 'r-ymm'), pasosMmZ: val(b, 'r-zmm'), invertir: val(b, 'r-inv') });
      const pmm = R.eje === 'Z' ? R.pasosMmZ : R.pasosMmY;
      if (!(R.pasosRotacion > 0 && pmm > 0 && R.diamObjeto > 0 && R.largoObjeto > 0 && (R.tipo === 'mandril' || R.diamRodillo > 0))) throw new Error('Revise los valores del rotativo: deben ser mayores que cero.');
      LS.saveSettings(); U.refreshLaser(); LS.V.redraw();
    }
  };

  // Asistente: ajustes GRBL recomendados cuando el rotativo usa el puerto Z
  X.grblRotaryZ = () => {
    const M = LS.machine;
    if (!M.connected || !M.isGrbl()) throw new Error('Conecte el láser GRBL para leer y ajustar su configuración.');
    const st = M.grblSettings();
    if (!st['102']) throw new Error('Aún no se han leído los ajustes del controlador. Espere unos segundos o envíe $$ desde la consola.');
    const n = k => Number(st[k]);
    const ratio = n('101') && n('102') ? n('101') / n('102') : 1;
    // misma frecuencia de pasos que el motor Y (equivalente físico)
    const prop = [];
    const want112 = Math.round(n('111') * ratio), want122 = Math.round(n('121') * ratio);
    if (n('111') && n('112') < want112) prop.push(['112', n('112'), want112, 'Velocidad máxima de Z (mm/min): igual a la del motor Y en frecuencia de pasos.']);
    if (n('121') && n('122') < want122) prop.push(['122', n('122'), want122, 'Aceleración de Z (mm/s²): igual a la del motor Y en frecuencia de pasos.']);
    if (n('20') === 1 && n('132') < 100000) prop.push(['132', n('132'), 100000, 'Recorrido máximo de Z (mm): amplio, para que los límites por software no detengan el giro.']);
    const homing = n('22') === 1;
    return X.open({
      title: 'Ajustes GRBL para rotativo en el puerto Z', width: 640,
      body: `<table class="layers"><thead><tr><th>Ajuste</th><th>Actual</th><th></th></tr></thead><tbody>
          ${[['102', 'Pasos/mm Z'], ['112', 'Vel. máx. Z (mm/min)'], ['122', 'Aceleración Z (mm/s²)'], ['132', 'Recorrido máx. Z (mm)'], ['20', 'Límites por software'], ['22', 'Búsqueda de inicio']].map(([k, t]) => `<tr><td>$${k} ${t}</td><td>${st[k] ?? '—'}</td><td></td></tr>`).join('')}
        </tbody></table>
        <h3 style="font-size:12px;color:var(--muted);margin:12px 0 4px">CAMBIOS PROPUESTOS</h3>
        ${prop.length ? prop.map(([k, a, bv, why], i) => `<div class="row"><label style="flex:0 0 auto"><input type="checkbox" id="g-${i}" checked> $${k}: ${a} → <b>${bv}</b></label><span class="note" style="margin:0">${why}</span></div>`).join('') : '<p class="note">La configuración actual ya es adecuada; no se proponen cambios.</p>'}
        ${homing ? '<p class="warn">La búsqueda de inicio ($22=1) está activa. Si el firmware incluye el eje Z en el ciclo de inicio, "Inicio" dará alarma porque el rotativo no tiene final de carrera: en ese caso use "Desbloquear" y posicione el cabezal a mano.</p>' : ''}
        <p class="warn">Estos cambios se guardan en la memoria de la placa. Se hará un respaldo de los valores actuales para poder restaurarlos al quitar el rotativo.</p>
        ${LS.rotary.respaldoGrbl ? `<p class="note">Respaldo guardado: ${Object.entries(LS.rotary.respaldoGrbl).map(([k, v]) => `$${k}=${v}`).join('  ')}</p>` : ''}`,
      buttons: [
        ...(LS.rotary.respaldoGrbl ? [{ label: 'Restaurar respaldo', action: () => { const bk = LS.rotary.respaldoGrbl; M.sendSettings(Object.entries(bk).map(([k, v]) => `$${k}=${v}`)); LS.rotary.respaldoGrbl = null; LS.saveSettings(); U.toast('Valores originales restaurados en el controlador.', 'ok'); } }] : []),
        cancel,
        ...(prop.length ? [{ label: 'Aplicar al controlador', primary: true, action: b => {
          const chosen = prop.filter((p, i) => b.querySelector('#g-' + i).checked);
          if (!chosen.length) return;
          const bk = Object.assign({}, LS.rotary.respaldoGrbl || {}); chosen.forEach(([k, a]) => { if (!(k in bk)) bk[k] = a; });
          LS.rotary.respaldoGrbl = bk; LS.saveSettings();
          M.sendSettings(chosen.map(([k, , v]) => `$${k}=${v}`));
          U.toast('Ajustes enviados al controlador.', 'ok');
        } }] : [])
      ]
    });
  };
  X.rotaryCalibrate = () => {
    const R = LS.rotary;
    return X.open({
      title: 'Calibrar rotativo', width: 540,
      body: `<p class="note">1) Coloque un objeto de diámetro conocido con cinta de enmascarar. 2) Pulse <b>Grabar línea de prueba</b>: se marcará una línea de la longitud indicada alrededor del objeto. 3) Mida con una cinta flexible la longitud real y escríbala. Se recalculan los pasos por rotación.</p>
        ${row('Longitud de prueba (mm)', num('c-len', 50, 'step="1" min="5"'))}
        ${row('Potencia (%)', num('c-pot', 15, 'step="1" min="1" max="100"'))}
        ${row('Velocidad (mm/s)', num('c-vel', 20, 'step="1" min="1"'))}
        <div class="btns"><button id="c-burn">Grabar línea de prueba</button><button class="danger" id="c-stop">■ Detener</button></div>
        ${row('Longitud medida (mm)', num('c-med', '', 'step="0.1" min="0.1"'))}
        <p class="note" id="c-res">Pasos por rotación actuales: ${R.pasosRotacion}</p>`,
      onOpen: b => {
        b.querySelector('#c-burn').onclick = () => U.guard(async () => {
          if (!R.activo) throw new Error('Active el rotativo primero.');
          const L = val(b, 'c-len'), dev = LS.device, rf = LS.jobs.rotaryFactor();
          const S = Math.round(val(b, 'c-pot') / 100 * dev.maxS), F = Math.round(val(b, 'c-vel') * 60);
          if (LS.device.tipo !== 'grbl') throw new Error('La línea de prueba automática está disponible con GRBL.');
          const RL = LS.jobs.rotaryAxis();
          const Fe = Math.max(1, Math.round(F * Math.abs(rf))); // avance en unidades del eje de giro
          const g = `G21\nG91\nG1 ${RL}0 S0 F${Fe}\nM4 S${S}\nG1 ${RL}${(L * rf).toFixed(3)} F${Fe}\nM5 S0\nG90\n`;
          LS.machine.runGcode(g);
        });
        b.querySelector('#c-stop').onclick = () => U.guard(() => LS.machine.stop());
        b.querySelector('#c-med').oninput = () => { const m = val(b, 'c-med'), L = val(b, 'c-len'); if (m > 0) b.querySelector('#c-res').textContent = `Nuevo valor: ${(R.pasosRotacion * m / L).toFixed(1)} pasos por rotación (actual ${R.pasosRotacion}).`; };
      },
      buttons: [cancel, { label: 'Aplicar corrección', primary: true, action: b => { const m = val(b, 'c-med'), L = val(b, 'c-len'); if (!(m > 0)) throw new Error('Escriba la longitud medida.'); R.pasosRotacion = Math.round(R.pasosRotacion * m / L * 10) / 10; LS.saveSettings(); U.refreshLaser(); U.toast(`Pasos por rotación ajustados a ${R.pasosRotacion}.`, 'ok'); } }]
    });
  };

  // ---------- Imagen ----------
  X.image = obj => {
    const aj = Object.assign({}, LS.IMG_DEFAULT, obj.ajustes);
    const entry = LS.imgCache[obj.id];
    return X.open({
      title: 'Ajustes de imagen', width: 760,
      body: `<div class="imgprev"><div style="flex:1">
        ${row('Tramado', sel('i-modo', LS.DITHERS, aj.tramado))}
        ${row('Brillo', `<input type="range" id="i-br" min="-100" max="100" value="${aj.brillo}">`)}
        ${row('Contraste', `<input type="range" id="i-co" min="-100" max="100" value="${aj.contraste}">`)}
        ${row('Gamma', `<input type="range" id="i-ga" min="0.2" max="3" step="0.05" value="${aj.gamma}">`)}
        ${row('Realce', `<input type="range" id="i-re" min="0" max="100" value="${aj.realce}">`)}
        ${row('Umbral', `<input type="range" id="i-um" min="0" max="255" value="${aj.umbral}">`)}
        ${row('Invertir', `<input type="checkbox" id="i-inv" ${aj.invertir ? 'checked' : ''}>`)}
        <p class="note">El intervalo (DPI), la velocidad y la potencia se ajustan en la capa de imagen. "Escala de grises" varía la potencia por píxel; los demás tramados usan puntos de potencia máxima.</p>
        </div><div><canvas id="i-cv"></canvas></div></div>`,
      onOpen: b => {
        const draw = () => { if (!entry || !entry.img) return; const c = LS.processImagePreview(entry.img, read(b)); const cv = b.querySelector('#i-cv'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); };
        b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', draw)); draw();
      },
      buttons: [{ label: 'Calcar…', action: () => setTimeout(() => X.trace(obj), 0) }, cancel, { label: 'Aplicar', primary: true, action: b => { D.checkpoint(); obj.ajustes = read(b); D.changed(); } }]
    });
    function read(b) { return { tramado: val(b, 'i-modo'), brillo: +val(b, 'i-br'), contraste: +val(b, 'i-co'), gamma: +val(b, 'i-ga'), realce: +val(b, 'i-re'), umbral: +val(b, 'i-um'), invertir: val(b, 'i-inv') }; }
  };
  X.trace = obj => X.open({
    title: 'Calcar imagen a vectores', width: 460,
    body: `${row('Umbral', `<input type="range" id="t-um" min="1" max="254" value="128">`)}
      ${row('Ignorar manchas menores a (px)', num('t-ig', 8, 'step="1" min="0"'))}
      ${row('Suavizado', num('t-su', 1, 'step="0.1" min="0.1" max="5"'))}
      ${row('Resolución (px)', num('t-res', 800, 'step="50" min="100" max="3000"'))}
      ${row('Invertir', '<input type="checkbox" id="t-inv">')}
      ${row('Borrar imagen original', '<input type="checkbox" id="t-del">')}`,
    buttons: [cancel, { label: 'Calcar', primary: true, action: async b => { const n = await LS.ops.trace(obj, { umbral: +val(b, 't-um'), ignorar: val(b, 't-ig'), suavizado: val(b, 't-su'), resolucion: val(b, 't-res'), invertir: val(b, 't-inv'), capa: D.currentLayer }); if (val(b, 't-del')) { D.remove([obj.id]); D.changed(); } U.toast(`Calcado terminado: ${n} contornos.`, 'ok'); } }]
  });

  // ---------- Texto ----------
  let lastFont = null;
  X.text = async (obj, at) => {
    if (!LS.fonts.list.length) { try { await LS.loadFontList(); } catch { } }
    if (!LS.fonts.list.length) { U.toast('No se encontraron fuentes instaladas en el sistema.', 'err'); return; }
    const t = obj ? obj.text : { texto: 'Texto', fuente: lastFont || defaultFont(), tam: 10, espaciado: 0, interlineado: 1.2, alinear: 'izquierda', soldar: false };
    const fonts = Object.fromEntries(LS.fonts.list.map(f => [f.path, f.file.replace(/\.(ttf|otf)$/i, '')]));
    return X.open({
      title: obj ? 'Editar texto' : 'Nuevo texto', width: 520,
      body: `<textarea id="x-t" rows="4" style="width:100%">${esc(t.texto)}</textarea>
        ${row('Fuente', sel('x-f', fonts, t.fuente))}
        <div class="grid2">${row('Altura (mm)', num('x-s', t.tam, 'step="0.5" min="0.5"'))}${row('Espaciado (mm)', num('x-e', t.espaciado, 'step="0.1"'))}</div>
        <div class="grid2">${row('Interlineado', num('x-l', t.interlineado, 'step="0.05" min="0.5"'))}${row('Alinear', sel('x-a', { izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha' }, t.alinear))}</div>
        ${row('Soldar letras (unir contornos)', `<input type="checkbox" id="x-w" ${t.soldar ? 'checked' : ''}>`)}
        ${row('Material', `<button id="x-mat" type="button" title="Velocidad, potencia y pasadas sugeridas para grabar o cortar este texto">🗄 Elegir material…</button> <span id="x-matinfo" class="note"></span>`)}
        <p class="note">La altura se mide en letras mayúsculas. Doble clic sobre un texto para editarlo.</p>`,
      onOpen: b => {
        const capa = obj ? obj.layer : D.currentLayer;
        b.querySelector('#x-mat').onclick = () => X.materialDB({ capas: [capa] }).then(() => {
          const L = D.layer(capa), info = b.querySelector('#x-matinfo');
          if (info) info.textContent = `${L.nombre}: ${L.potMax}% · ${L.velocidad} ${LS.device.unidadVelocidad} · ${L.pasadas}×`;
        });
      },
      buttons: [cancel, {
        label: obj ? 'Actualizar' : 'Crear', primary: true, action: async b => {
          const nt = { texto: val(b, 'x-t'), fuente: val(b, 'x-f'), tam: val(b, 'x-s'), espaciado: val(b, 'x-e'), interlineado: val(b, 'x-l'), alinear: val(b, 'x-a'), soldar: val(b, 'x-w') };
          if (!nt.texto.trim()) throw new Error('Escriba algún texto.');
          const paths = await LS.textPaths(nt); lastFont = nt.fuente;
          D.checkpoint();
          if (obj) { obj.text = nt; obj.paths = paths; obj._v = (obj._v || 0) + 1; }
          else { D.selection.clear(); D.add({ kind: 'text', text: nt, paths, tx: G.tr(at[0], at[1]) }); LS.ui.setTool('seleccionar'); }
          D.changed();
        }
      }]
    });
  };
  function defaultFont() { const pref = ['arial.ttf', 'segoeui.ttf', 'calibri.ttf', 'DejaVuSans.ttf', 'LiberationSans-Regular.ttf']; for (const p of pref) { const f = LS.fonts.list.find(x => x.file.toLowerCase() === p.toLowerCase()); if (f) return f.path; } return LS.fonts.list[0].path; }

  // ---------- Desplazamiento / matrices ----------
  X.offset = () => X.open({
    title: 'Desplazar formas (offset)', width: 420,
    body: `${row('Distancia (mm)', num('o-d', 1, 'step="0.1"'))}
      ${row('Dirección', sel('o-dir', { fuera: 'Hacia afuera', dentro: 'Hacia adentro' }, 'fuera'))}
      ${row('Esquinas', sel('o-j', { redondo: 'Redondeadas', recto: 'Rectas', bisel: 'Biseladas' }, 'redondo'))}
      ${row('Borrar original', '<input type="checkbox" id="o-del">')}`,
    buttons: [cancel, { label: 'Aplicar', primary: true, action: b => LS.ops.offset(val(b, 'o-d') * (val(b, 'o-dir') === 'dentro' ? -1 : 1), val(b, 'o-j'), val(b, 'o-del')) }]
  });
  X.gridArray = () => X.open({
    title: 'Matriz rectangular', width: 400,
    body: `<div class="grid2">${row('Columnas', num('a-c', 3, 'step="1" min="1"'))}${row('Filas', num('a-r', 2, 'step="1" min="1"'))}</div>
      <div class="grid2">${row('Separación X (mm)', num('a-x', 5))}${row('Separación Y (mm)', num('a-y', 5))}</div>`,
    buttons: [cancel, { label: 'Crear', primary: true, action: b => LS.ops.gridArray(val(b, 'a-c') | 0, val(b, 'a-r') | 0, val(b, 'a-x'), val(b, 'a-y')) }]
  });
  X.circularArray = () => X.open({
    title: 'Matriz circular', width: 400,
    body: `${row('Cantidad total', num('c-n', 8, 'step="1" min="2"'))}${row('Radio (mm)', num('c-r', 30, 'step="1" min="1"'))}${row('Girar copias', '<input type="checkbox" id="c-rot" checked>')}<p class="note">El centro del círculo queda debajo de la selección, a la distancia del radio.</p>`,
    buttons: [cancel, { label: 'Crear', primary: true, action: b => LS.ops.circularArray(val(b, 'c-n') | 0, val(b, 'c-r'), val(b, 'c-rot')) }]
  });

  // ---------- Prueba de materiales ----------
  X.materialTest = () => {
    const vu = LS.device.unidadVelocidad;
    return X.open({
      title: 'Generador de prueba de materiales', width: 560,
      body: `<p class="note">Crea una rejilla de cuadros: cada fila usa una velocidad y cada columna una potencia. Grábela en un retazo del material para encontrar los mejores ajustes.</p>
        ${row('Modo', sel('m-modo', { relleno: 'Relleno (grabado)', linea: 'Línea (corte)' }, 'relleno'))}
        <div class="grid2">${row('Filas (velocidad)', num('m-f', 5, 'step="1" min="1" max="20"'))}${row('Columnas (potencia)', num('m-c', 5, 'step="1" min="1" max="20"'))}</div>
        <div class="grid2">${row(`Vel. mín. (${vu})`, num('m-v0', 50, 'step="1"'))}${row(`Vel. máx. (${vu})`, num('m-v1', 250, 'step="1"'))}</div>
        <div class="grid2">${row('Pot. mín. (%)', num('m-p0', 10, 'step="1"'))}${row('Pot. máx. (%)', num('m-p1', 90, 'step="1"'))}</div>
        <div class="grid2">${row('Tamaño cuadro (mm)', num('m-t', 8))}${row('Separación (mm)', num('m-s', 2))}</div>
        <div class="grid2">${row('Intervalo (mm)', num('m-i', 0.1, 'step="0.01"'))}${row('Pasadas', num('m-pa', 1, 'step="1" min="1"'))}</div>
        <div class="grid2">${row('Posición X (mm)', num('m-x', 10))}${row('Posición Y (mm)', num('m-y', 10))}</div>`,
      buttons: [cancel,
        { label: 'Añadir al lienzo', action: b => { const t = LS.jobs.materialTest(read(b)); D.checkpoint(); t.objects.forEach((o, i) => { const li = 2 + (i % 28); }); addToCanvas(t); } },
        { label: 'Vista previa', action: b => { const t = LS.jobs.materialTest(read(b)); LS.app.previewTemp(t); } },
        { label: 'Enviar al láser', primary: true, action: b => { const t = LS.jobs.materialTest(read(b)); return LS.app.runTemp(t); } }]
    });
    function read(b) { return { modo: val(b, 'm-modo'), filas: val(b, 'm-f') | 0, columnas: val(b, 'm-c') | 0, velMin: val(b, 'm-v0'), velMax: val(b, 'm-v1'), potMin: val(b, 'm-p0'), potMax: val(b, 'm-p1'), tam: val(b, 'm-t'), separacion: val(b, 'm-s'), intervalo: val(b, 'm-i'), pasadas: val(b, 'm-pa') | 0, x: val(b, 'm-x'), y: val(b, 'm-y') }; }
    function addToCanvas(t) {
      // cada celda necesita su propia capa; se usan capas libres de la paleta
      const free = []; for (let i = 0; i < 30; i++) if (!D.objects.some(o => o.layer === i)) free.push(i);
      if (free.length < t.objects.length) throw new Error(`Se necesitan ${t.objects.length} capas libres y solo hay ${free.length}. Use "Enviar al láser" para pruebas grandes.`);
      t.objects.forEach((o, i) => { const li = free[i]; const L = Object.assign({}, t.layers[o.layer], { color: LS.PALETTE[li], nombre: `${t.layers[o.layer].velocidad}/${t.layers[o.layer].potMax}%` }); D.layers[li] = L; o.layer = li; o.id = G.uid(); D.add(o, false); });
      D.changed('all');
    }
  };

  X.saveMaterial = L => X.open({
    title: 'Guardar en biblioteca de materiales', width: 420,
    body: `${row('Material', '<input type="text" id="s-m" placeholder="MDF, acrílico, cuero…">')}${row('Descripción', '<input type="text" id="s-d" placeholder="Grabado, corte…">')}${row('Espesor (mm)', num('s-e', 3))}`,
    buttons: [cancel, { label: 'Guardar', primary: true, action: b => { const m = val(b, 's-m').trim(); if (!m) throw new Error('Escriba el nombre del material.'); const aj = Object.assign({}, L); delete aj.color; delete aj.nombre; delete aj.prioridad; LS.library.materiales.push({ material: m, descripcion: val(b, 's-d'), espesor: val(b, 's-e'), ajustes: aj }); LS.saveSettings(); U.refreshLibrary(); U.toast('Guardado en la biblioteca.', 'ok'); } }]
  });

  X.serialPorts = list => X.open({
    title: 'Elegir puerto del láser', width: 440,
    body: list.length ? `<div class="portlist">${list.map(p => `<button data-id="${esc(p.portId)}"><b>${esc(p.portName || p.portId)}</b><br><span style="color:var(--muted)">${esc(p.displayName || '')} ${p.vendorId ? '· VID ' + p.vendorId : ''}</span></button>`).join('')}</div>` : '<p>No se encontraron puertos serie. Conecte el láser por USB y verifique que el controlador (CH340/CP210x) esté instalado.</p>',
    onOpen: (b, close) => b.querySelectorAll('[data-id]').forEach(x => x.onclick = () => { window.nativo.chooseSerialPort(x.dataset.id); close(true); }),
    onClose: () => window.nativo.chooseSerialPort(''),
    buttons: [cancel]
  });

  X.shortcuts = () => X.open({
    title: 'Atajos de teclado', width: 480,
    body: `<table class="layers">${[['V', 'Seleccionar'], ['L', 'Línea / polilínea'], ['R', 'Rectángulo'], ['E', 'Elipse'], ['P', 'Polígono'], ['T', 'Texto'], ['Esc', 'Cancelar / volver a seleccionar'], ['Supr', 'Eliminar'], ['Flechas', 'Mover 1 mm (Mayús: 10 mm)'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copiar / pegar / duplicar'], ['Ctrl+G / Ctrl+U', 'Agrupar / desagrupar'], ['Alt+P', 'Vista previa'], ['Rueda', 'Zoom'], ['Espacio + arrastrar / botón central', 'Desplazar la vista'], ['Mayús al escalar', 'Cambiar bloqueo de proporción'], ['Mayús al rotar', 'Pasos de 15°']].map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`,
    buttons: [{ label: 'Cerrar', primary: true }]
  });
  const NOVEDADES = [
    ['1.2.2', 'Conexión por WiFi (Telnet) y asistente de red para placas ESP32 · Marco con luz y disparo de prueba · El diseño se graba donde está en el lienzo · Marco/Ensayo vuelven al punto de partida · Materiales editables · Prueba de finales de carrera en vivo · Actualización de firmware con copia de seguridad'],
    ['1.2.1', 'Asistente de imágenes tipo LaserGRBL · Base de materiales · Idiomas (español, inglés, portugués)'],
    ['1.2.0', 'Esquema de la máquina Two Trees · Rotativo en el conector Z · Simulación 3D · Origen por punto de referencia']
  ];
  const fechaDe = n => { const m = String(n).match(/(20\d{2})[_-]?(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  const versionDe = n => { const m = String(n).match(/V(\d+)\.?(\d+)(?:\.(\d+))?/i); return m ? `V${m[1]}.${m[2]}${m[3] != null ? '.' + m[3] : ''}` : ''; };
  const placaHtml = () => {
    const M = LS.machine, f = M.firmware || {};
    if (!M.connected) return '<p class="note">Conecte la máquina para ver el firmware de la placa.</p>';
    return `<p class="note">Placa: <b>${esc(f.maquina || 'GRBL')}</b> · firmware <b>${esc(f.ver || (M.version ? 'GRBL ' + M.version : '—'))}</b>${M.via ? ' · conectada por ' + (M.via === 'wifi' ? 'WiFi' : 'USB') : ''}</p>`;
  };
  X.about = async () => {
    let info = { version: '1.2.2' };
    try { if (window.nativo && window.nativo.appInfo) info = await window.nativo.appInfo(); } catch (e) { }
    return X.open({
      title: 'Acerca de Láser Estudio Pro', width: 560,
      body: `<p><b style="font-size:1.25em">Láser Estudio Pro ${esc(info.version)}</b><br>Diseño y control para grabadoras y cortadoras láser, en español.</p>
        <p class="note">Controladores: GRBL (USB o WiFi) y Ruida (red, experimental). Accesorios: rotativos de rodillos y mandril, con preajuste para Two Trees TR3.</p>
        <fieldset><legend>Novedades</legend>${NOVEDADES.map(([v, t]) => `<p class="note" style="margin:3px 0"><b>${v}</b> — ${esc(t)}</p>`).join('')}</fieldset>
        <fieldset><legend>Máquina conectada</legend>${placaHtml()}</fieldset>
        <p class="note">${info.electron ? `Electron ${esc(info.electron)} · Chromium ${esc(info.chrome)} · ${esc(info.so)}<br>` : ''}Software independiente; no está afiliado a LightBurn Software ni a fabricantes de láseres. Usa esptool-js (Espressif, Apache 2.0) para el firmware.</p>`,
      buttons: [{ label: 'Actualizar firmware…', action: () => { setTimeout(() => X.firmware(), 0); } }, { label: 'Buscar actualizaciones…', action: () => { setTimeout(() => X.actualizaciones(), 0); } }, { label: 'Cerrar', primary: true }]
    });
  };

  // Lista oficial de firmware de Makerbase (GitHub). Devuelve las imágenes de láser "normal" más recientes.
  async function listaMakerbase() {
    const l = await window.nativo.fwLista('makerbase-mks/MKS-DLC32');
    return l.filter(f => /Laser\/Normal/i.test(f.path)).map(f => {
      const nombre = f.path.split('/').pop(), pantalla = (f.path.match(/\/(TS\d+)\//) || [])[1] || '', placa = (f.path.match(/Board_V([\d.]+)/i) || [])[1] || '';
      return Object.assign(f, { nombre, pantalla, placa, version: versionDe(nombre), fecha: fechaDe(nombre) });
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }

  X.actualizaciones = async () => {
    const M = LS.machine; let info = { version: '1.2.2' };
    try { if (window.nativo && window.nativo.appInfo) info = await window.nativo.appInfo(); } catch (e) { }
    return X.open({
      title: 'Buscar actualizaciones', width: 640,
      body: `<fieldset><legend>Aplicación</legend><p class="note">Versión instalada: <b>${esc(info.version)}</b>. Las versiones nuevas de Láser Estudio Pro se entregan como instalador (.exe); instálelo encima y conserva su configuración.</p></fieldset>
        <fieldset><legend>Firmware de la placa</legend><div id="u-placa">${placaHtml()}</div><p id="u-res" class="note">Consultando la lista oficial de Makerbase…</p></fieldset>`,
      onOpen: async b => {
        const res = b.querySelector('#u-res');
        try {
          const l = await listaMakerbase(), f = M.firmware || {};
          const ult = l.find(x => x.pantalla === 'TS35' && x.placa.startsWith('2')) || l[0];
          const fechaPlaca = fechaDe(f.ver || '');
          let veredicto = '';
          if (fechaPlaca && ult && ult.fecha) veredicto = ult.fecha > fechaPlaca ? `<b style="color:var(--accent)">Hay una versión publicada más reciente que la de su placa (${fechaPlaca}).</b>` : '<b>Su placa tiene una versión igual o más reciente que la publicada.</b>';
          res.innerHTML = `Más reciente publicada por Makerbase para <b>MKS DLC32</b> (láser, normal): <b>${esc(ult ? ult.version + ' · ' + ult.fecha : '—')}</b> <span style="opacity:.7">(${esc(ult ? ult.nombre : '')})</span><br>${veredicto}
            <br><br><b>Importante:</b> su placa es la <b>MKS LS ESP32 PRO</b> (Two Trees). Makerbase solo publica firmware de esa placa para la versión de hardware V2.1; los archivos de MKS DLC32 son de otra placa y pueden tener otros pines. Use solo el firmware que Two Trees o Makerbase indiquen para su placa, y siempre con copia de seguridad.`;
        } catch (e) { res.textContent = 'No se pudo consultar GitHub (' + e.message + '). Revise la conexión a Internet.'; }
      },
      buttons: [{ label: 'Abrir firmware de Makerbase', action: () => { window.nativo.openExternal('https://github.com/makerbase-mks/MKS-DLC32'); return false; } }, { label: 'Actualizar firmware…', action: () => { setTimeout(() => X.firmware(), 0); } }, { label: 'Cerrar', primary: true }]
    });
  };

  // Actualizar firmware: copia de seguridad → escritura → verificación → reinicio
  X.firmware = () => {
    const M = LS.machine, FW = LS.firmware;
    let bin = null, binNombre = '', lista = null, ocupado = false;
    const guardarAjustes = () => { try { if (M.ajustesTexto && Object.keys(M.ajustesTexto).length) localStorage.setItem('ls.ajustesRespaldo', JSON.stringify({ fecha: new Date().toISOString(), ajustes: M.ajustesTexto })); } catch (e) { } };
    const leerAjustes = () => { try { return JSON.parse(localStorage.getItem('ls.ajustesRespaldo') || 'null'); } catch (e) { return null; } };
    return X.open({
      title: 'Actualizar firmware de la placa', width: 700,
      body: `<p class="warn">Cambiar el firmware reemplaza el programa interno de la placa. Use solo un archivo hecho para <b>su</b> placa (MKS LS ESP32 PRO V1.1 en su Two Trees). La aplicación guarda primero una copia completa de la memoria actual, para poder restaurarla si algo no funciona.</p>
        ${placaHtml()}
        <fieldset><legend>1 · Archivo de firmware</legend>
          <div class="btns"><button id="f-arch" type="button">Elegir archivo .bin…</button><button id="f-mks" type="button" title="Descarga desde el GitHub oficial de Makerbase">Descargar de Makerbase…</button></div>
          <select id="f-lista" hidden style="width:100%;margin-top:6px"></select>
          <p id="f-sel" class="note">Ningún archivo elegido.</p></fieldset>
        <fieldset><legend>2 · Seguridad</legend>
          <div class="row"><label>Guardar copia del firmware actual antes de escribir (recomendado)</label><input type="checkbox" id="f-copia" checked></div>
          <div class="row"><label>Confirmo que el archivo es para mi placa</label><input type="checkbox" id="f-ok"></div>
          <p class="note">También se guardan sus ajustes ($$, red WiFi, pasos/mm). Después podrá reenviarlos con «Restaurar ajustes».</p></fieldset>
        <fieldset><legend>3 · Progreso</legend><div class="progress"><i id="f-prog"></i></div><p id="f-est" class="note">Listo para empezar. Con la máquina encendida y el cable USB conectado.</p></fieldset>`,
      onOpen: b => {
        const q = id => b.querySelector(id);
        const est = t => { q('#f-est').textContent = t; }, prog = p => { q('#f-prog').style.width = Math.round(p * 100) + '%'; };
        const elegir = (u8, nombre) => {
          const dir = FW.direccion(u8);
          if (dir == null) { bin = null; q('#f-sel').innerHTML = '<span style="color:#ff6b5b">Este archivo no parece firmware de ESP32.</span>'; return; }
          bin = u8; binNombre = nombre; b._dir = dir;
          q('#f-sel').innerHTML = `<b>${esc(nombre)}</b> · ${(u8.length / 1048576).toFixed(2)} MB · se escribe en 0x${dir.toString(16)} (${dir ? 'solo la aplicación' : 'imagen completa'})`;
        };
        q('#f-arch').onclick = () => U.guard(async () => {
          const r = await window.nativo.openFile({ filters: [{ name: 'Firmware ESP32', extensions: ['bin'] }] }); if (!r || !r.length) return;
          elegir(new Uint8Array(r[0].data), r[0].name);
        });
        q('#f-mks').onclick = () => U.guard(async () => {
          const sel = q('#f-lista');
          if (!lista) { est('Consultando la lista de Makerbase…'); lista = await listaMakerbase(); est('Elija un archivo de la lista.'); }
          sel.hidden = false;
          sel.innerHTML = '<option value="">— Firmware MKS DLC32 (láser) —</option>' + lista.map((f, i) => `<option value="${i}">${esc(f.version + ' · ' + f.fecha + ' · pantalla ' + f.pantalla + ' · placa V' + f.placa + ' · ' + f.nombre)}</option>`).join('');
          sel.onchange = () => U.guard(async () => {
            const f = lista[+sel.value]; if (!f) return;
            est('Descargando ' + f.nombre + '…'); prog(0.1);
            const u8 = new Uint8Array(await window.nativo.fwDescargar('makerbase-mks/MKS-DLC32', f.path)); prog(0);
            elegir(u8, f.nombre); est('Descargado. Revise que corresponda a su placa.');
          });
        });
        b._ejecutar = async restaurar => {
          if (ocupado) return; ocupado = true;
          const botones = [...b.closest('.capa-modal, #modal').querySelectorAll('footer button')]; botones.forEach(x => x.disabled = true);
          let ses = null;
          try {
            guardarAjustes();
            if (M.connected) { est('Desconectando la conexión GRBL…'); await M.disconnect(); await new Promise(r => setTimeout(r, 500)); }
            est('Elija el puerto USB de la placa y espere: entra en modo de carga…');
            ses = await FW.conectar({ log: t => console.log('[esptool]', t) });
            est(`Conectado: ${ses.chip} · memoria ${(ses.flash / 1048576).toFixed(0)} MB.`);
            if (bin.length + b._dir > ses.flash) throw new Error('El archivo es más grande que la memoria de la placa.');
            if (!restaurar && q('#f-copia').checked) {
              est('Leyendo la memoria actual para la copia de seguridad…');
              const copia = await FW.leer(ses, p => { prog(p); est(`Copia de seguridad: ${Math.round(p * 100)} %`); });
              const fecha = new Date().toISOString().slice(0, 10);
              const ruta = await window.nativo.saveFile({ defaultPath: `copia-firmware-placa-${fecha}.bin`, filters: [{ name: 'Firmware', extensions: ['bin'] }], data: copia });
              if (!ruta) throw new Error('Copia de seguridad cancelada: no se escribió nada.');
              est('Copia guardada en ' + ruta);
            }
            prog(0); est('Escribiendo el firmware… no desconecte el cable.');
            const r = await FW.escribir(ses, bin, p => { prog(p); est(`Escribiendo: ${Math.round(p * 100)} %`); }, b._dir);
            if (!r.ok) throw new Error(`La verificación falló (MD5 ${r.enChip} ≠ ${r.md5}). Repita la escritura o restaure la copia.`);
            prog(1); est('Escritura verificada (MD5 correcto). Reiniciando la placa…');
            await FW.cerrar(ses, true); ses = null;
            est('Listo: firmware ' + (restaurar ? 'restaurado' : 'actualizado') + ' y verificado. Conecte de nuevo la máquina; si los ajustes cambiaron use «Restaurar ajustes».');
            U.toast('Firmware escrito y verificado.', 'ok');
          } catch (e) {
            est('Error: ' + (e && e.message || e)); U.toast('Firmware: ' + (e && e.message || e), 'err');
          } finally {
            if (ses) await FW.cerrar(ses, false);
            ocupado = false; botones.forEach(x => x.disabled = false);
          }
        };
        b._restAjustes = () => U.guard(async () => {
          const r = leerAjustes(); if (!r) throw new Error('No hay ajustes guardados.');
          if (!M.connected) throw new Error('Conecte la máquina primero.');
          const filas = Object.entries(r.ajustes).filter(([k]) => !/^5[0-4]$/.test(k));
          for (const [k, v] of filas) { await M.sendLine(`$${k}=${v}`); await new Promise(r2 => setTimeout(r2, 60)); }
          U.toast(`Ajustes del ${r.fecha.slice(0, 10)} reenviados (${filas.length}). La red WiFi no se reenvía: use WiFi….`, 'ok');
        });
      },
      buttons: [
        { label: 'Restaurar ajustes', action: b => { b._restAjustes(); return false; } },
        { label: 'Restaurar copia…', action: b => { U.guard(async () => { const r = await window.nativo.openFile({ filters: [{ name: 'Copia de firmware', extensions: ['bin'] }] }); if (!r || !r.length) return; bin = new Uint8Array(r[0].data); b._dir = 0; binNombre = r[0].name; if (!confirm('¿Restaurar la copia ' + binNombre + ' en la placa?')) return; await b._ejecutar(true); }); return false; } },
        { label: 'Cerrar' },
        { label: 'Actualizar firmware', primary: true, action: b => {
          if (!bin) throw new Error('Elija primero un archivo de firmware.');
          if (!b.querySelector('#f-ok').checked) throw new Error('Marque «Confirmo que el archivo es para mi placa».');
          b._ejecutar(false); return false;
        } }
      ]
    });
  };
  LS.dlg = X;
})(window.LS);
