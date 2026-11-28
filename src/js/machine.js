// Control de máquina: GRBL por puerto serie (Web Serial) y Ruida por red UDP.
(function (LS) {
  const M = { connected: false, state: 'Desconectado', pos: null, running: false, paused: false, progress: 0, listeners: [], log: [] };
  const emit = () => M.listeners.forEach(f => f(M));
  M.on = f => M.listeners.push(f);
  const log = (txt, kind = 'in') => { M.log.push({ txt, kind }); if (M.log.length > 2000) M.log.splice(0, 500); LS.ui && LS.ui.consoleAppend(txt, kind); };
  M.logMsg = log;

  // ---------------- GRBL ----------------
  const grbl = { port: null, reader: null, writer: null, buf: '', queue: [], sentLens: [], inflight: [], enPausaRed: false, cerrando: false, trasReconexion: 0, rxSize: 120, pollTimer: null, lineWaiters: [], settings: {} };
  const enc = new TextEncoder(), dec = new TextDecoder();
  async function grblWrite(s) { if (grbl.writer) await grbl.writer.write(enc.encode(s)); }
  // Puerto "virtual" por WiFi (Telnet/TCP) con la misma forma que un puerto serie
  let tcpCtl = null, tcpHooks = false;
  function tcpPort(host, puerto) {
    const N = window.nativo;
    if (!N || !N.tcpConnect) throw new Error('La conexión WiFi solo está disponible en la aplicación de escritorio.');
    if (!tcpHooks) {
      tcpHooks = true;
      N.onTcpData(d => { if (tcpCtl) { const b = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) & 255; try { tcpCtl.enqueue(b); } catch (e) { } } });
      N.onTcpClose(m => {
        // corte inesperado: se intenta reconectar sin cerrar la sesión (el trabajo sigue al volver)
        if (M.connected && M.via === 'wifi' && !grbl.cerrando) { reconectarWifi(m); return; }
        if (tcpCtl) { try { tcpCtl.close(); } catch (e) { } tcpCtl = null; }
      });
    }
    const readable = new ReadableStream({ start(c) { tcpCtl = c; } });
    const writable = new WritableStream({ write(chunk) { let t = ''; for (const b of chunk) t += String.fromCharCode(b); return N.tcpWrite(t).catch(() => { /* socket caído: las líneas quedan pendientes y se reenvían al reconectar */ }); } });
    return { readable, writable, open: async () => { log(`Conectando por WiFi a ${host}:${puerto}…`, 'ok'); await N.tcpConnect(host, puerto); log('Conectado por WiFi.', 'ok'); }, close: async () => { tcpCtl = null; await N.tcpClose(); } };
  }
  // Reconexión automática por WiFi: reabre el socket sin reiniciar la placa y reenvía las líneas sin confirmar
  let reconectando = false;
  async function reconectarWifi(motivo) {
    if (reconectando) return; reconectando = true; grbl.enPausaRed = true;
    // durante la subida a la tarjeta la placa puede soltar el Telnet: se espera a que termine la subida antes de reintentar
    if (M._subiendoSD) { log('La placa soltó el WiFi mientras recibe el archivo; se reconecta al terminar la subida…', 'in'); while (M._subiendoSD && M.connected && !grbl.cerrando) await new Promise(r => setTimeout(r, 500)); }
    const d = LS.device, eraTrabajo = M.running;
    log('Se perdió la conexión WiFi' + (motivo ? ' (' + motivo + ')' : '') + '. Reintentando…', 'err');
    const estadoPrev = M.state; M.state = 'Reconectando…'; emit();
    let ok = false;
    for (let i = 1; i <= 20 && M.connected && !grbl.cerrando; i++) {
      await new Promise(r => setTimeout(r, i === 1 ? 500 : 1500));
      try { await window.nativo.tcpConnect(d.wifiHost.trim(), Number(d.wifiPuerto) || 8080); ok = true; break; }
      catch (e) { if (i % 3 === 0) log(`Reintento ${i}/20…`, 'err'); }
    }
    reconectando = false;
    if (!ok) {
      grbl.enPausaRed = false;
      if (M.connected) {
        log('No se pudo recuperar la conexión WiFi. La placa termina lo que ya recibió y se detiene.', 'err');
        LS.ui.toast('Se perdió la conexión WiFi con la placa. Para trabajos largos use el cable USB.', 'err');
        await M.disconnect();
      }
      return;
    }
    // líneas enviadas sin confirmar: se reenvían (el G-code es absoluto, repetir un movimiento no cambia el resultado)
    const pend = grbl.inflight.splice(0);
    if (pend.length) { grbl.queue.unshift(...pend); if (M.running) M.sentCount = Math.max(0, M.sentCount - pend.length); }
    grbl.sentLens = []; grbl.trasReconexion = Date.now();
    M.state = estadoPrev === 'Reconectando…' ? 'Inactivo' : estadoPrev;
    log('Conexión WiFi recuperada' + (eraTrabajo ? '; el trabajo continúa.' : '.'), 'ok');
    M.reconexiones = (M.reconexiones || 0) + 1; emit();
    grblWrite('?').catch(() => { });
    // pausa breve para detectar si la placa se reinició (en ese caso el trabajo se cancela)
    await new Promise(r => setTimeout(r, 1200));
    grbl.enPausaRed = false; if (M.running || grbl.queue.length) pump();
  }
  async function grblConnect() {
    const d = LS.device, wifi = d.conexion === 'wifi';
    let port;
    if (wifi) {
      if (!d.wifiHost) throw new Error('Escriba la dirección IP de la placa en Láser → Conexión → WiFi….');
      // prueba el puerto configurado y, si falla, los habituales (MKS: 8080; Grbl_ESP32/FluidNC: 23)
      const host = d.wifiHost.trim(), puertos = [...new Set([Number(d.wifiPuerto) || 8080, 8080, 23])];
      let ultimo = null;
      for (const pto of puertos) {
        port = tcpPort(host, pto);
        try { await port.open(); ultimo = null; if (pto !== Number(d.wifiPuerto)) { d.wifiPuerto = pto; LS.saveSettings(); log(`La placa respondió en el puerto ${pto}; queda guardado.`, 'ok'); } break; }
        catch (e) { ultimo = e.message.replace(/^Error invoking remote method 'tcp:connect': (Error: )?/, ''); log(`Puerto ${pto}: ${ultimo}`, 'err'); if (/ETIMEDOUT|tiempo de espera|EHOSTUNREACH|ENETUNREACH/i.test(ultimo)) break; }
      }
      if (ultimo) throw new Error(/ETIMEDOUT|tiempo de espera|EHOSTUNREACH|ENETUNREACH/i.test(ultimo)
        ? `La placa no responde en ${host}. Revise: 1) que la placa esté en la red de su casa (WiFi… → Probar conexión), 2) que el PC esté en la MISMA red, 3) la IP correcta.`
        : `La placa ${host} no acepta conexiones en los puertos ${puertos.join(', ')} (${ultimo}). Cierre LaserGRBL u otro programa conectado a la placa y pruebe de nuevo.`);
    } else {
      if (!('serial' in navigator)) throw new Error('El puerto serie no está disponible en este equipo.');
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(d.baudios) || 115200, bufferSize: 8192 });
    }
    M.via = wifi ? 'wifi' : 'usb';
    grbl.port = port; grbl.writer = port.writable.getWriter(); grbl.reader = port.readable.getReader();
    M.connected = true; M.state = 'Conectando…'; M.limitesTope = {}; M.ejesCalibrados = {}; M.origenSupuesto = false; M.origenConocido = false; M.avisoOrigen = false; M.primerEstado = false; M.mpos = null; emit();
    readLoop();
    await grblWrite('\x18'); // reinicio suave
    await new Promise(r => setTimeout(r, 1200));
    await grblWrite('\n$$\n$I\n');
    let tic = 0;
    grbl.pollTimer = setInterval(() => { tic++; if (!M.connected || grbl.enPausaRed || M._subiendoSD) return; if (M.via === 'wifi' && M.running && tic % 4) return; grblWrite('?').catch(() => { }); }, 250);
    if (LS.device.homingAlConectar) M.home();
    // placas MKS LS ESP32: $45 decide si el conector Z funciona (0 = desactivado)
    setTimeout(async () => {
      if (!M.connected) return; try { await grblWrite('$45\n'); } catch (e) { }
      // con el modo «rodillo MKS» configurado se ajusta $45 al estado del rotativo
      setTimeout(() => { if (LS.rotary.eje === 'R' && M.ajuste('45') != null) M.modoRodillo(!!LS.rotary.activo).catch(() => { }); }, 700);
    }, 1800);
  }
  // Rotativo en el conector Z con la placa en modo X/Y ($45=0): el motor Z no se mueve. Se ofrece activarlo.
  // El significado de $45 depende de la versión del firmware MKS: solo se cambia con el modo
  // «Conector Z — modo rodillo» del rotativo, comprobado en la placa del usuario ($45=1 rodillo, $45=0 normal).
  M.revisarModoZ = async () => { };
  M.modoRodillo = activar => { const p = modoRodillo(activar).finally(() => { if (M._modoPromesa === p) M._modoPromesa = null; }); M._modoPromesa = p; return p; };
  async function modoRodillo(activar) {
    if (!M.connected || !M.isGrbl()) return;
    const v = activar ? '1' : '0', espera = ms => new Promise(r => setTimeout(r, ms));
    if (M.ajuste('45') === v) return;
    // la placa puede reiniciarse al cambiar $45 (pierde la posición): se guarda para restaurarla
    const wAntes = M.rawPos ? M.rawPos.slice() : null, t0 = Date.now(), d = LS.device;
    await M.sendLine('$45=' + v); await espera(300); await grblWrite('$45\n');
    M.ajustesTexto = Object.assign(M.ajustesTexto || {}, { 45: v });
    // límites por software: el giro del rotativo no tiene tope, con $20=1 la placa rechaza los movimientos (error:15)
    if (activar && Number(grbl.settings['20']) === 1) { grblSend('$20=0'); grbl.settings['20'] = 0; d.restaurarSoft = true; LS.saveSettings(); log('Límites por software desactivados mientras el rotativo esté activo ($20=0); se restauran al quitarlo.', 'ok'); }
    if (!activar && d.restaurarSoft) { grblSend('$20=1'); grbl.settings['20'] = 1; d.restaurarSoft = false; LS.saveSettings(); log('Límites por software restaurados ($20=1).', 'ok'); }
    // el firmware de la placa solo aplica $45 al arrancar: se reinicia sola (sin apagar ni reconectar a mano)
    await espera(400);
    log('Reiniciando la placa para aplicar $45 (unos segundos)…', 'ok');
    LS.ui.toast('Reiniciando la placa para aplicar el cambio… espere unos segundos.');
    const tR = Date.now();
    await grblWrite('[ESP444]RESTART\n').catch(() => { }); // escritura directa: no se reenvía al reconectar
    let listo = false;
    for (let i = 0; i < 120 && M.connected; i++) { await espera(250); if ((grbl.ultimoBanner || 0) > tR || (grbl.trasReconexion || 0) > tR) { listo = true; break; } }
    const reinicio = listo || (grbl.ultimoBanner || 0) > t0;
    if (listo) { await espera(1500); grbl.sentLens = []; grbl.inflight = []; }
    await grblWrite('?').catch(() => { }); await espera(400);
    if (/alarm/i.test(M.state)) { grblSend('$X'); await espera(300); }
    if (wAntes && M.connected) {
      const ejes = activar ? [0, 1] : [0]; // al quitarlo, la barra Y se restaura desde su posición física guardada
      const cambio = !M.rawPos || ejes.some(i => Math.abs((M.rawPos[i] || 0) - (wAntes[i] || 0)) > 0.01);
      if (reinicio || cambio) {
        grblSend(`G10 L20 P1 ${ejes.map(i => 'XY'[i] + wAntes[i].toFixed(3)).join(' ')}`);
        log(`Ubicación restaurada tras el reinicio (X ${wAntes[0].toFixed(1)}${activar ? '  Y ' + wAntes[1].toFixed(1) : ''}).`, 'ok');
      }
      if (!activar && d.barraY != null) grblSend(`G10 L20 P1 Y${LS.toDisp(0, d.barraY)[1].toFixed(3)}`);
      setTimeout(() => grblWrite('?').catch(() => { }), 200);
    }
    grblSend('$45');
    if (!listo) { LS.ui.toast('La placa no confirmó el reinicio. Si el cambio no se aplica, apague y encienda la máquina.', 'err'); return; }
    log(activar ? 'Modo rodillo activado en la placa ($45=1): ▲▼ giran el rotativo; la barra Y queda quieta (puede moverla a mano).' : 'Modo normal en la placa ($45=0): la barra Y vuelve a moverse.', 'ok');
    LS.ui.toast(activar ? 'Rotativo listo (modo rodillo $45=1): ▲▼ y ⟲ ⟳ giran el rotativo.' : 'Rotativo quitado ($45=0): X e Y se mueven normal.', 'ok');
  }
  async function readLoop() {
    try {
      while (grbl.reader) {
        const { value, done } = await grbl.reader.read(); if (done) break;
        grbl.buf += dec.decode(value);
        let i; while ((i = grbl.buf.search(/\r?\n/)) >= 0) { const line = grbl.buf.slice(0, i).trim(); grbl.buf = grbl.buf.slice(i + 1).replace(/^\n/, ''); if (line) onLine(line); }
      }
    } catch (e) { log('Error de lectura: ' + e.message, 'err'); }
    if (M.connected) { M.connected = false; M.state = 'Desconectado'; M.pos = null; M.rawPos = null; M.mpos = null; M.running = false; M.sdActivo = false; emit(); }
  }
  function onLine(line) {
    if (line.startsWith('<')) {
      // Admite GRBL 1.1 (<Idle|MPos:x,y,z|WCO:...>) y GRBL 0.9 (<Idle,MPos:x,y,z,WPos:x,y,z>)
      const body = line.replace(/^<|>$/g, '');
      const state = body.split(/[|,]/)[0]; M.state = traducirEstado(state);
      // trabajo desde la tarjeta SD: |SD:45.20,/lep.nc|
      const sdm = body.match(/SD:([\d.]+)/);
      if (M.sdActivo) {
        if (sdm) { M.sdVisto = true; M.progress = Math.min(1, parseFloat(sdm[1]) / 100); M.ultimaRespuesta = Date.now(); }
        else if ((M.sdVisto || Date.now() - M.sdInicio > 6000) && /Idle/i.test(state)) { M.sdActivo = false; M.running = false; M.progress = 1; log('Trabajo desde la tarjeta terminado.', 'ok'); LS.ui.toast('Trabajo terminado.', 'ok'); }
      }
      // pines activos (finales de carrera, sonda, puerta): Pn:XY…
      const pn = (body.match(/Pn:([A-Za-z]+)/) || [])[1] || '';
      if (pn !== M.pines) {
        const antes = [...(M.pines || '')].filter(c => 'XYZABC'.includes(c)); M.pines = pn; emit();
        const nuevas = [...pn].filter(c => 'XYZABC'.includes(c) && !antes.includes(c));
        if (nuevas.length && !M.buscandoInicio && !M.running && M.ultimoJog && Date.now() - M.ultimoJog.t < 30000) setTimeout(() => topeEnMovimiento(nuevas[0]), 0); // tras leer la posición de este mismo informe
        if (M.verPines) log(pn ? `Final de carrera / pin activo: ${pn.split('').join(', ')}` : 'Finales de carrera: ninguno activo', pn ? 'err' : 'in'); }
      if (grbl.mostrarEstado) { grbl.mostrarEstado = false; log(line); log(pn ? `→ Pines activos (Pn): ${pn.split('').join(', ')}` : '→ Ningún final de carrera activo (sin Pn)'); }
      const grab = key => { const m = body.match(new RegExp(key + ':\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)(?:\\s*,\\s*(-?[\\d.]+))?')); return m ? [+m[1], +m[2], m[3] != null ? +m[3] : 0] : null; };
      const mp = grab('MPos'), wp = grab('WPos'), wco = grab('WCO');
      if (wco) grbl.wco = wco;
      let p = null;
      if (wp) p = wp;
      else if (mp) p = grbl.wco ? mp.map((v, i) => v - (grbl.wco[i] || 0)) : mp.slice();
      if (mp) M.mpos = mp; else if (wp && grbl.wco) M.mpos = wp.map((v, i) => v + (grbl.wco[i] || 0));
      if (p) {
        M.rawPos = p.slice(); M.pos = posFromMachine(p);
        if (!M.primerEstado) { M.primerEstado = true; setTimeout(() => { arranque(); setTimeout(() => { if (LS.rotary.activo) M.zeroRotation(); }, 700); }, 50); }
      }
      emit(); LS.V && LS.V.redraw(); return;
    }
    if (line === 'ok' || line.startsWith('error')) {
      const n = grbl.sentLens.shift(); grbl.inflight.shift();
      if (line.startsWith('error') && (line.endsWith(':3') || line.endsWith(':20')) && M.lastJogAt && Date.now() - M.lastJogAt < 1500 && !M.jogLegacy) { M.jogLegacy = true; log('El firmware no reconoce $J: desde ahora los movimientos manuales usan G0. Repita el movimiento.', 'err'); }
      if (line.startsWith('error')) { const code = line.split(':')[1]; log(line + ' ' + (GRBL_ERRORS[code] || ''), 'err'); M.errors.push({ t: Date.now(), line, code, texto: GRBL_ERRORS[code] || '' }); }
      if (M.running) { M.ultimaRespuesta = Date.now(); if (line === 'ok') M.okTrabajo++; else { M.errTrabajo++; vigilarErroresTrabajo(line); } }
      const w = grbl.lineWaiters.shift(); if (w) w(line);
      pump(); return;
    }
    if (line.startsWith('ALARM')) M.errors.push({ t: Date.now(), line, code: 'ALARM', texto: GRBL_ALARMS[line.split(':')[1]] || 'Alarma' });
    if (line.startsWith('ALARM')) { log(line + ' — ' + (GRBL_ALARMS[line.split(':')[1]] || 'Alarma') + '. Use "Desbloquear" ($X) o "Inicio" ($H).', 'err'); M.state = 'Alarma'; emit(); return; }
    const mt = line.match(/^\$(\d+)=(.*)$/); if (mt) { M.ajustesTexto = M.ajustesTexto || {}; M.ajustesTexto[mt[1]] = mt[2].trim(); if (/^5[0-4]$|^45$/.test(mt[1])) emit(); }
    const m = line.match(/^\$(\d+)=([-\d.]+)/); if (m) { grbl.settings[m[1]] = Number(m[2]); if (m[1] === '30') LS.ui && LS.ui.notifyMaxS(Number(m[2])); if (m[1] === '101') LS.ui && LS.ui.notifyStepsY(Number(m[2])); if (m[1] === '102' && Number(m[2]) > 0) LS.rotary.pasosMmZ = Number(m[2]);
      if (m[1] === '22' && Number(m[2]) === 1 && !LS.device.finalesCarrera && !M.avisoHoming) { M.avisoHoming = true; setTimeout(ofrecerQuitarHoming, 600); } }
    // identificación del firmware: [MSG:Using machine:MKS DLC32] · [VER:1.1h.2022…:] · [OPT:…]
    const um = line.match(/Using machine:\s*([^\]]+)/i); if (um) { M.firmware = Object.assign(M.firmware || {}, { maquina: um[1].trim() }); }
    const vm = line.match(/^\[VER:([^\]]*)\]/); if (vm) { M.firmware = Object.assign(M.firmware || {}, { ver: vm[1].replace(/:$/, '') }); }
    const om = line.match(/^\[OPT:([^\]]*)\]/); if (om) { M.firmware = Object.assign(M.firmware || {}, { opt: om[1] }); }
    const ver = line.match(/^Grbl\s+(\d+)\.(\d+)/i);
    if (ver) { M.version = +ver[1] + +ver[2] / 10; M.jogLegacy = M.version < 1.1; if (M.jogLegacy) log(`Firmware GRBL ${ver[1]}.${ver[2]}: no admite $J; los movimientos manuales usarán G0.`, 'err'); }
    if (line.startsWith('Grbl')) grbl.ultimoBanner = Date.now();
    if (line.startsWith('Grbl') && M.running && grbl.trasReconexion && Date.now() - grbl.trasReconexion < 4000) {
      grbl.queue = []; grbl.inflight = []; grbl.sentLens = []; M.running = false; grbl.trasReconexion = 0;
      log('La placa se reinició durante el corte de WiFi: el trabajo se canceló (la posición pudo perderse). Revise el origen antes de repetir.', 'err');
      LS.ui.toast('La placa se reinició: trabajo cancelado. Revise el origen.', 'err');
    }
    if (line.startsWith('Grbl') || line.startsWith('[')) { M.state = M.state === 'Conectando…' ? 'Inactivo' : M.state; emit(); }
    // WiFi de la placa: [MSG:Mode=STA:SSID=…:Status=Connected:IP=192.168.1.50:…] / [MSG:Mode=AP:SSDI=Laser_x:IP=192.168.4.1:…]
    const wm = line.match(/Mode=(STA|AP)[^\]]*?(?:SSID|SSDI)=([^:\]]*)/i);
    if (wm) {
      const ip = (line.match(/IP=(\d+\.\d+\.\d+\.\d+)/) || [])[1] || '';
      const conectado = /Status=Connected/i.test(line) || (wm[1].toUpperCase() === 'AP');
      M.wifi = Object.assign(M.wifi || {}, { [wm[1].toUpperCase()]: { red: wm[2], ip, conectado } });
      emit();
    }
    // MKS DLC32: [MSG:Local access point Laser_39067 started, 192.168.4.1] · [MSG:TELNET Started 8080] · [MSG:Connected with 192.168.1.50]
    const apm = line.match(/access point\s+(\S+)\s+started,\s*(\d+\.\d+\.\d+\.\d+)/i);
    if (apm) { M.wifi = Object.assign(M.wifi || {}, { AP: { red: apm[1], ip: apm[2], conectado: true } }); emit(); }
    const tlm = line.match(/TELNET\s+Started\s+(\d+)/i);
    if (tlm) { M.wifi = Object.assign(M.wifi || {}, { puerto: +tlm[1] }); emit(); }
    const stm = line.match(/(?:Connected with|STA.*?IP[:=]|Got IP[:=]?)\s*(\d+\.\d+\.\d+\.\d+)/i);
    if (stm && !/access point/i.test(line)) { M.wifi = Object.assign(M.wifi || {}, { STA: Object.assign((M.wifi && M.wifi.STA) || {}, { ip: stm[1], conectado: true }) }); emit(); }
    const ipSola = line.match(/^(?:\[MSG:)?(?:IP[:=]\s*)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]?$/);
    if (ipSola) { M.wifi = Object.assign(M.wifi || {}, { leida: ipSola[1] }); emit(); }
    log(line, 'in');
  }
  // Posición de arranque (máquinas sin finales de carrera): al conectar una máquina recién encendida
  // (posición de máquina 0,0) se asume que el cabezal está en la referencia configurada.
  function arranque() {
    const d = LS.device;
    if (!M.connected || !M.isGrbl() || d.arranqueAuto === false || d.homingAlConectar) return;
    const mp = M.mpos || M.rawPos || [0, 0, 0];
    const recienEncendida = Math.abs(mp[0]) < 0.01 && Math.abs(mp[1]) < 0.01;
    const ref = d.refArranque || 'inf-izq';
    const pendiente = !!d.arranquePendiente; // fijada con el ratón sin conexión: se aplica siempre
    if (pendiente) { d.arranquePendiente = false; LS.saveSettings(); }
    if (pendiente || recienEncendida) {
      // sin finales de carrera la placa puede arrancar en ALARMA ($22=1) y rechazaría el origen: se desbloquea primero
      if (M.state === 'Alarma' && !d.finalesCarrera) { log('Controlador en alarma al conectar: se desbloquea ($X) para fijar la posición de partida.', 'ok'); grblSend('$X'); }
      const objetivo = (ref === 'custom' && d.posArranque) ? d.posArranque : M.refPoint(ref === 'custom' ? 'inf-izq' : ref).world;
      setTimeout(() => { // verificación: el controlador debe reportar la posición fijada
        const R = LS.rotary, rotY = R.activo && LS.jobs.rotaryAxis() === 'Y', exp = LS.toDisp(objetivo[0], objetivo[1]);
        if (!M.rawPos || Math.abs(M.rawPos[0] - exp[0]) > 0.05 || (!rotY && Math.abs(M.rawPos[1] - exp[1]) > 0.05)) {
          const e = M.errors.slice(-1)[0];
          LS.ui.toast(`El controlador no aceptó la posición de partida${e ? ` (${e.line} ${e.texto})` : ''}. Pulse «Desbloquear» y vuelva a soltar el módulo con «Solo ubicar».`, 'err');
        }
      }, 1500);
      try { if (ref === 'custom' && d.posArranque) M.setZeroAt(d.posArranque, null); else M.setZero(ref === 'custom' ? 'inf-izq' : ref); M.origenSupuesto = true; LS.ui.toast(`Posición de arranque: se asumió que el cabezal está en ${ref === 'custom' ? 'la posición de arranque guardada' : 'la ' + NOMBRE_REF[ref]} del área. Si no es así, arrastre el módulo en el lienzo o use Mover → Fijar origen aquí.`, 'ok'); } catch (e) { }
    } else {
      M.origenConocido = !!d.origenAplicado;
      if (M.state === 'Alarma' && !d.finalesCarrera) { grblSend('$X'); log('Controlador en alarma al conectar: desbloqueado ($X).', 'ok'); }
      LS.ui.toast('La máquina no se ha apagado desde la última conexión: se conserva su posición actual.');
    }
  }
  const NOMBRE_REF = { 'sup-izq': 'esquina superior izquierda', 'sup-cen': 'parte superior central', 'sup-der': 'esquina superior derecha', 'cen-izq': 'parte izquierda central', 'cen-cen': 'centro', 'cen-der': 'parte derecha central', 'inf-izq': 'esquina inferior izquierda', 'inf-cen': 'parte inferior central', 'inf-der': 'esquina inferior derecha' };
  M.NOMBRE_REF = NOMBRE_REF;
  // $22=1 sin finales de carrera: la placa queda en ALARMA tras cada reinicio y rechaza los trabajos
  function ofrecerQuitarHoming() {
    if (!M.connected || !LS.dlg) return;
    const h21 = grbl.settings['21'] === 1;
    LS.dlg.open({
      title: 'Búsqueda de inicio activa sin finales de carrera', width: 560,
      body: `<p>La placa tiene activa la <b>búsqueda de inicio ($22=1)</b>, pero la máquina no tiene finales de carrera instalados.</p>
        <p>Por eso el controlador queda en <b>ALARMA</b> al encender o al detener, y rechaza los trabajos (error:9): al pulsar Iniciar no pasa nada.</p>
        <p>¿Desactivarla en la placa? Se enviará <b>$22=0</b>${h21 ? ' y <b>$21=0</b> (límites duros, sin sensores pueden disparar alarmas)' : ''}. Se guarda en la memoria de la placa y se puede volver a activar desde la Consola.</p>
        <p class="note">Mientras tanto, la app desbloquea automáticamente ($X) antes de cada trabajo.</p>`,
      buttons: [{ label: 'Ahora no' }, { label: `Desactivar ($22=0${h21 ? ', $21=0' : ''})`, primary: true, action: () => {
        const l = ['$22=0']; if (h21) l.push('$21=0');
        if (M.state === 'Alarma') grblSend('$X');
        M.sendSettings(l); LS.ui.toast('Búsqueda de inicio desactivada en la placa.', 'ok');
      } }]
    });
  }
  const traducirEstado = s => ({ Idle: 'Inactivo', Run: 'Trabajando', Hold: 'En pausa', 'Hold:0': 'En pausa', 'Hold:1': 'Pausando…', Jog: 'Moviendo', Alarm: 'Alarma', Door: 'Puerta abierta', Check: 'Verificación', Home: 'Buscando inicio', Sleep: 'Reposo' })[s] || s;
  // Un tope se activó durante un movimiento manual: se detiene y esa posición queda como límite del eje
  function topeEnMovimiento(letra) {
    const j = M.ultimoJog; if (!j) return;
    let eje = null;
    if (Math.abs(j.dx) > 1e-9 && Math.abs(j.dy) < 1e-9) eje = 'X';
    else if (Math.abs(j.dy) > 1e-9 && Math.abs(j.dx) < 1e-9) eje = 'Y';
    else { const m = LS.device.mapaTopes || {}; eje = Object.keys(m).find(k => m[k] === letra) || letra; }
    if (eje !== 'X' && eje !== 'Y') return;
    grblWrite('\x85').catch(() => { });              // detiene el movimiento al tocar
    if (eje === 'X' || eje === 'Y') { if (M.letraTope(eje) !== letra && (Math.abs(j.dx) < 1e-9 || Math.abs(j.dy) < 1e-9)) aprenderTope(eje, letra); }
    const delta = eje === 'X' ? j.dx : j.dy, i = eje === 'X' ? 0 : 1;
    M.limitesTope = Object.assign({}, M.limitesTope, { [eje]: { lado: delta < 0 ? 'min' : 'max', mpos: M.mpos ? M.mpos[i] : null } });
    log(`Tope de ${eje} tocado: movimiento detenido; esa posición queda como límite de ${eje} (${delta < 0 ? 'lado negativo' : 'lado positivo'}).`, 'err');
    // si es el tope configurado, el láser está en ese borde: se actualiza su posición en el esquema
    const d = LS.device, rotEje = LS.rotary.activo ? (LS.jobs.rotaryAxis() === 'Y' ? 'Y' : null) : null;
    if (d.finalesCarrera && eje !== rotEje && Math.sign(delta) === M.sentidoTope(eje)) {
      setTimeout(() => {
        const borde = M.refPoint(M.esquinaTopes()).disp[eje === 'X' ? 0 : 1];
        grblSend(`G10 L20 P1 ${eje}${borde.toFixed(3)}`); setTimeout(() => grblWrite('?').catch(() => { }), 150);
        M.ejesCalibrados = Object.assign({}, M.ejesCalibrados, { [eje]: true });
        if (M.ejesCalibrados.X && M.ejesCalibrados.Y) { M.origenConocido = true; M.origenSupuesto = false; LS.device.origenAplicado = true; LS.saveSettings(); }
        log(`Posición de ${eje} actualizada: el láser está en el borde del tope (${eje} ${borde.toFixed(1)}).`, 'ok');
        LS.ui.toast(M.ejesCalibrados.X && M.ejesCalibrados.Y ? 'Topes X e Y tocados: posición real del láser y origen fijados.' : `Tope de ${eje} tocado: el esquema muestra el láser en ese borde.`, 'ok');
        emit();
      }, 400); // espera a que el movimiento se detenga
    } else LS.ui.toast(`Tope de ${eje} tocado: se detuvo y queda guardado como límite.`, 'ok');
  }
  const GRBL_ERRORS = { 1: 'Falta letra de comando', 2: 'Valor numérico inválido', 3: 'Comando $ no reconocido', 8: 'Comando no aceptado en este estado', 9: 'Bloqueado por alarma', 15: 'Movimiento fuera de los límites del área', 20: 'Comando G no soportado', 22: 'Velocidad (F) no definida', 33: 'Destino de movimiento inválido' };
  const GRBL_ALARMS = { 1: 'Final de carrera activado', 2: 'Movimiento fuera de límites (soft limit)', 3: 'Reinicio durante movimiento', 6: 'Búsqueda de inicio interrumpida (se detuvo o reinició durante el homing)', 7: 'Búsqueda de inicio: la puerta se abrió', 4: 'La sonda no estaba en reposo', 5: 'La sonda no tocó', 8: 'Fallo al buscar inicio', 9: 'Fallo al buscar inicio: no se encontró el interruptor' };

  // Streaming con conteo de caracteres
  // Por WiFi: "búfer" (fluido, por defecto) o "seguro" = una línea a la vez (el láser se detiene entre líneas)
  const limiteEnvio = () => M.via === 'wifi' ? (LS.device.wifiEnvio === 'seguro' ? { bytes: 255, lineas: 1 } : { bytes: grbl.rxSize, lineas: 999 }) : { bytes: grbl.rxSize, lineas: 999 };
  function pump() {
    if (grbl.enPausaRed) return;
    const lim = limiteEnvio(); let lote = '';
    while (grbl.queue.length) {
      const line = grbl.queue[0], used = grbl.sentLens.reduce((a, b) => a + b, 0);
      if (grbl.sentLens.length >= lim.lineas || (grbl.sentLens.length && used + line.length + 1 > lim.bytes)) break;
      grbl.queue.shift(); grbl.sentLens.push(line.length + 1); grbl.inflight.push(line);
      lote += line + '\n';
      if (M.running) { M.sentCount++; M.progress = M.sentCount / M.total; if (M.sentCount % 50 === 0) emit(); }
    }
    if (lote) grblWrite(lote).catch(e => log(e.message, 'err'));
    if (M.running && !M.sdActivo && !grbl.queue.length && !grbl.sentLens.length) { M.running = false; M.progress = 1; log('Trabajo terminado.', 'ok'); emit(); }
  }
  function grblSend(line) { grbl.queue.push(line); pump(); }

  // Conversión entre coordenadas visibles (mm del diseño) y ejes de la máquina según el rotativo
  function rotState() {
    const J = LS.jobs, [A1, A2] = J.axisLetters(), rf = LS.rotary.activo ? J.rotaryFactor() : 1;
    const rot = !LS.rotary.activo ? null : (A1 === 'Z' ? 0 : 1); // índice del valor que lleva el giro
    return { A1, A2, rf, rot };
  }
  function axisWords(v1, v2, omitirCero = false) {
    const { A1, A2, rf, rot } = rotState();
    if (rot === 0) v1 *= rf; else if (rot === 1) v2 *= rf;
    if (omitirCero) { const w = []; if (Math.abs(v1) > 1e-9) w.push(`${A1}${v1.toFixed(3)}`); if (Math.abs(v2) > 1e-9) w.push(`${A2}${v2.toFixed(3)}`); return w.join(' ') || `${A1}0`; }
    return `${A1}${v1.toFixed(3)} ${A2}${v2.toFixed(3)}`;
  }
  function posFromMachine(p) {
    const { A1, A2, rf, rot } = rotState(), get = a => p['XYZ'.indexOf(a)] || 0;
    let v1 = get(A1), v2 = get(A2);
    if (rot === 0) v1 /= rf || 1; else if (rot === 1) v2 /= rf || 1;
    return [v1, v2];
  }
  M.axisWords = axisWords;
  // Texto legible de qué se va a mover con un desplazamiento (para las flechas y las pruebas)
  function describeJog(dx, dy, words) {
    const { A1, A2, rot } = rotState(), parts = [];
    const add = (v, letter, isRot) => { if (Math.abs(v) < 1e-9) return; parts.push(isRot ? `giro del rotativo ${v > 0 ? '+' : ''}${v.toFixed(1)} mm de superficie (puerto ${letter})` : `cabezal en ${letter} ${v > 0 ? '+' : ''}${v.toFixed(1)} mm`); };
    add(dx, A1, rot === 0); add(dy, A2, rot === 1);
    return (parts.join(' · ') || 'sin movimiento') + `  [${words}]`;
  }
  M.describeJog = (dx, dy) => describeJog(dx, dy, axisWords(dx, dy, true));
  M.errors = [];
  M.errorsSince = t => M.errors.filter(e => e.t >= t);
  // Espera a que el controlador termine el movimiento (estado Inactivo)
  M.waitIdle = async (ms = 4000) => {
    const t0 = Date.now(); await new Promise(r => setTimeout(r, 250));
    while (Date.now() - t0 < ms) { await grblWrite('?').catch(() => { }); await new Promise(r => setTimeout(r, 200)); if (/Inactivo|Alarma/.test(M.state)) return true; }
    return false;
  };
  // Diagnóstico de un eje: ¿el controlador acepta el movimiento y avanza su posición?
  M.diagnoseAxis = async (axis, dist = 5) => {
    need(); if (!M.isGrbl()) throw new Error('El diagnóstico está disponible con GRBL.');
    const idx = 'XYZ'.indexOf(axis), st = M.grblSettings();
    await grblWrite('?'); await new Promise(r => setTimeout(r, 300));
    const before = M.rawPos ? M.rawPos[idx] : null, t0 = Date.now();
    const feed = Math.max(30, Math.min(600, st[String(110 + idx)] || 600));
    await M.rawJog(axis, dist, feed);
    const idle = await M.waitIdle(Math.max(4000, Math.abs(dist) / feed * 60000 + 2000));
    const after = M.rawPos ? M.rawPos[idx] : null;
    return { axis, before, after, moved: before != null && after != null ? after - before : null, idle, errors: M.errorsSince(t0), settings: st, feed, alarm: M.state === 'Alarma' };
  };

  // ---------------- Ruida ----------------
  const R = () => LS.ruida;
  async function ruidaSendRaw(bytes, expectReply) {
    const res = await window.nativo.ruidaSend(LS.device.ruidaIP, R().packets(bytes), expectReply);
    if (!res.ok) throw new Error(res.error);
    return res.replies.map(r => Array.from(R().unswizzle(r)));
  }
  async function ruidaConnect() {
    const rep = await ruidaSendRaw(R().cmd.estado(), true);
    M.connected = true; M.state = 'Conectado (Ruida)'; emit(); log('Controlador Ruida responde en ' + LS.device.ruidaIP, 'ok');
    M.pollRuida();
  }
  M.pollRuida = async () => {
    if (!M.connected || LS.device.tipo !== 'ruida' || M.running) return;
    try {
      const rx = await ruidaSendRaw(R().cmd.leerPosX(), true), ry = await ruidaSendRaw(R().cmd.leerPosY(), true);
      const vx = rx[0] && rx[0].length >= 9 ? R().decodeNumber(rx[0].slice(4, 9)) / 1000 : null;
      const vy = ry[0] && ry[0].length >= 9 ? R().decodeNumber(ry[0].slice(4, 9)) / 1000 : null;
      if (vx != null && vy != null) { M.pos = [vx, vy]; emit(); LS.V.redraw(); }
    } catch { }
  };

  // ---------------- API común ----------------
  M.connect = async () => {
    if (M.connected) return;
    try { if (LS.device.tipo === 'ruida') await ruidaConnect(); else await grblConnect(); }
    catch (e) { M.connected = false; M.state = 'Desconectado'; emit(); throw e; }
  };
  M.disconnect = async () => {
    clearInterval(grbl.pollTimer); grbl.cerrando = true; grbl.enPausaRed = false;
    if (grbl.reader) { try { await grbl.reader.cancel(); grbl.reader.releaseLock(); } catch { } grbl.reader = null; }
    if (grbl.writer) { try { grbl.writer.releaseLock(); } catch { } grbl.writer = null; }
    if (grbl.port) { try { await grbl.port.close(); } catch { } grbl.port = null; }
    grbl.queue = []; grbl.sentLens = []; grbl.inflight = []; M.via = null; grbl.cerrando = false;
    M.connected = false; M.running = false; M.state = 'Desconectado'; M.pos = null; emit();
  };
  const need = () => { if (!M.connected) throw new Error('Conecte primero el láser (panel Láser → Conectar).'); };
  M.ajuste = n => (M.ajustesTexto || {})[n];
  M.isGrbl = () => LS.device.tipo !== 'ruida';
  M.sendLine = async line => {
    need(); log('> ' + line, 'out');
    if (M.isGrbl()) { if (line === '?') grbl.mostrarEstado = true; if (line === '?' || line === '!' || line === '~') return grblWrite(line); grblSend(line); if (/^\$45=\d/.test(line.trim())) setTimeout(() => { try { grblSend('$45'); } catch (e) { } }, 400); }
    else log('La consola de texto solo está disponible con GRBL.', 'err');
  };
  // Deja el controlador listo antes de un trabajo, marco o ensayo: sin finales de carrera quita la alarma
  M.prepararTrabajo = async () => {
    need(); if (M._modoPromesa) await M._modoPromesa.catch(() => { }); if (!M.isGrbl()) return;
    // un indicador "en curso" que quedó colgado (sin nada pendiente) se libera
    if (M.running && !grbl.queue.length && !grbl.sentLens.length) { M.running = false; emit(); }
    if (M.running) throw new Error('Ya hay un trabajo en curso. Espere a que termine o pulse DETENER.');
    await grblWrite('?'); await new Promise(r => setTimeout(r, 300));
    if (M.state === 'Alarma') {
      if (LS.device.finalesCarrera) throw new Error('La máquina está en ALARMA. Pulse «Inicio» (búsqueda de inicio) o «Desbloquear» antes de grabar.');
      log('El controlador estaba en ALARMA: se desbloquea ($X) para poder grabar.', 'ok'); grblSend('$X');
      await M.waitIdle(2500);
      if (M.state === 'Alarma') throw new Error('El controlador sigue en ALARMA y no acepta el trabajo. Revise la Consola; si la placa tiene $22=1 sin sensores, escriba $22=0.');
    }
    if (/Puerta/.test(M.state)) throw new Error('La puerta de seguridad está abierta.');
  };
  function vigilarErroresTrabajo(line) {
    // si el controlador rechaza las primeras líneas, el trabajo no avanzará: se cancela y se explica
    if (M.okTrabajo === 0 && M.errTrabajo >= 3) {
      const code = line.split(':')[1];
      grbl.queue = []; M.running = false; emit();
      const motivo = code === '9' ? 'el controlador está en ALARMA (bloqueado). Pulse «Desbloquear» y vuelva a intentarlo; si la placa tiene $22=1 sin finales de carrera, escriba $22=0 en la Consola.'
        : code === '15' ? 'los movimientos superan los límites por software ($20). Revise el área de trabajo o desactive $20.'
        : `el controlador respondió ${line} ${GRBL_ERRORS[code] || ''}.`;
      log('Trabajo cancelado: ' + motivo, 'err');
      LS.ui.toast('El trabajo no pudo iniciar: ' + motivo, 'err');
    }
  }
  M.runGcode = gcode => {
    need();
    if (M.sdActivo) throw new Error('La placa está grabando desde la tarjeta. Espere o pulse Detener.');
    if (M.running && !grbl.queue.length && !grbl.sentLens.length) M.running = false;
    if (M.running) throw new Error('Ya hay un trabajo en curso.');
    const lines = gcode.split('\n').map(l => l.replace(/;.*$/, '').trim()).filter(Boolean);
    M.total = lines.length; M.sentCount = 0; M.running = true; M.paused = false; M.progress = 0;
    M.okTrabajo = 0; M.errTrabajo = 0; M.ultimaRespuesta = Date.now(); emit();
    log(`Enviando trabajo (${lines.length} líneas)…`, 'ok');
    grbl.queue.push(...lines); pump();
    // vigilancia: si el controlador deja de responder, se avisa en lugar de quedarse esperando sin decir nada
    clearInterval(M._vigia);
    M._vigia = setInterval(() => {
      if (!M.running) { clearInterval(M._vigia); return; }
      if (!M.paused && Date.now() - M.ultimaRespuesta > 15000 && /Inactivo|Alarma/.test(M.state)) {
        LS.ui.toast(`El controlador no responde desde hace 15 s (${M.state}). Pulse DETENER y revise la conexión o la Consola.`, 'err');
        M.ultimaRespuesta = Date.now();
      }
    }, 3000);
  };
  // Graba desde la tarjeta SD de la placa: sube el archivo por HTTP y lo ejecuta en la placa (sin depender del WiFi)
  M.runDesdeSD = async (gcode, nombre = 'lep.nc') => {
    need();
    const d = LS.device;
    if (M.via !== 'wifi') throw new Error('Grabar desde la tarjeta requiere la conexión WiFi.');
    if (M.running || M.sdActivo) throw new Error('Ya hay un trabajo en curso.');
    // sin comentarios ni líneas vacías (algunos firmwares fallan con acentos en los comentarios)
    let modo = null;
    const texto = gcode.split('\n').map(l => {
      l = l.replace(/;.*$/, '').replace(/\([^)]*\)/g, '').trim(); if (!l) return '';
      const m = l.match(/^G0?([01])\s+(.*)$/);
      if (m && !/[GM$\[]/.test(m[2])) { const c = m[2].replace(/\s+/g, ''); const r = (modo === m[1] ? '' : 'G' + m[1]) + c; modo = m[1]; return r; }
      modo = null; return l; // otros comandos: se dejan tal cual y se vuelve a escribir G0/G1 en la siguiente línea
    }).filter(Boolean).join('\n') + '\n';
    const bytes = new TextEncoder().encode(texto);
    log(`Subiendo el trabajo a la tarjeta de la placa (${bytes.length < 10240 ? bytes.length + ' bytes' : (bytes.length / 1024).toFixed(0) + ' KB'})…`, 'ok');
    M.state = 'Subiendo a la tarjeta…'; emit();
    M._subiendoSD = true;
    try { await window.nativo.sdSubir(d.wifiHost.trim(), d.wifiHttp || 80, nombre, bytes); }
    catch (e) {
      M._subiendoSD = false; M.state = 'Inactivo'; emit();
      throw new Error('No se pudo subir el archivo a la tarjeta (' + e.message.replace(/^Error invoking remote method 'sd:subir': (Error: )?/, '') + '). Revise que la tarjeta esté puesta en la placa, o desactive «Grabar desde la tarjeta».');
    }
    M._subiendoSD = false;
    log('Archivo guardado en la tarjeta: /' + nombre, 'ok');
    // si el WiFi se cayó durante la subida, espera a que vuelva antes de dar la orden de iniciar
    for (let i = 0; i < 60 && (grbl.enPausaRed || /Reconectando/.test(M.state)) && M.connected; i++) await new Promise(r => setTimeout(r, 500));
    M.state = 'Inactivo'; emit();
    // inicia la ejecución (comando de ESP3D/Grbl_ESP32 antiguo y, si no lo reconoce, el moderno)
    const nErr = M.errors.length;
    await M.sendLine('[ESP220]/' + nombre);
    await new Promise(r => setTimeout(r, 1200));
    if (M.errors.length > nErr) { log('Probando el comando alternativo de la tarjeta…', 'in'); await M.sendLine('$SD/Run=/' + nombre); await new Promise(r => setTimeout(r, 1200)); }
    M.sdActivo = true; M.sdVisto = false; M.sdInicio = Date.now(); M.running = true; M.progress = 0; M.ultimaRespuesta = Date.now(); emit();
    log('La placa está grabando desde la tarjeta. El WiFi solo se usa para ver el avance.', 'ok');
  };
  M.runRuida = async bytes => {
    need(); M.running = true; M.progress = 0; emit();
    try { await ruidaSendRaw(bytes, false); log('Trabajo enviado al controlador Ruida.', 'ok'); }
    finally { M.running = false; M.progress = 1; emit(); }
  };
  M.pause = async () => { need(); M.paused = true; emit(); if (M.isGrbl()) await grblWrite('!'); else await ruidaSendRaw(R().cmd.pausar()); };
  M.resume = async () => { need(); M.paused = false; emit(); if (M.isGrbl()) await grblWrite('~'); else await ruidaSendRaw(R().cmd.reanudar()); };
  // Detiene TODO: trabajos, marco, ensayo, giro de prueba y movimientos manuales.
  // Primero cancela el jog y frena con retención (conserva la posición); luego reinicia el controlador
  // ya detenido, para vaciar su búfer sin perder la posición (importante en máquinas sin finales de carrera).
  M.stop = async () => {
    need(); M.disparando = false; M.sdActivo = false; M._cancelPartes = true; if (M.buscandoInicio) M._abortInicio = true;
    if (M.isGrbl()) {
      grbl.queue = [];
      await grblWrite('\x85'); // cancelar jog
      await grblWrite('!');     // retención de avance
      const t0 = Date.now();
      while (Date.now() - t0 < 2000) { await new Promise(r => setTimeout(r, 100)); await grblWrite('?').catch(() => { }); if (/pausa|Inactivo/i.test(M.state) && M.state !== 'Pausando…') break; }
      await grblWrite('\x18');  // reinicio suave con la máquina quieta
      grbl.sentLens = []; grbl.inflight = []; grbl.lineWaiters = [];
      // sin finales de carrera, el reinicio deja la placa en ALARMA ($22=1): se desbloquea para seguir usando la máquina
      setTimeout(() => grblWrite((LS.device.finalesCarrera ? '' : '$X\n') + 'M5 S0\n').catch(() => { }), 1200);
    } else await ruidaSendRaw(R().cmd.detener());
    const habia = M.running;
    M.running = false; M.paused = false; emit();
    log(habia ? 'Trabajo detenido.' : 'Movimiento detenido.', 'err');
  };
  // Movimiento directo de un eje físico, sin conversión del rotativo (para identificar conexiones)
  // Línea(s) de movimiento manual: $J en GRBL 1.1; G91 G0 en firmware antiguo
  function jogLines(words, feedMmMin) {
    M.lastJogAt = Date.now();
    return M.jogLegacy ? ['G91 G21 G0 ' + words, 'G90'] : [`$J=G91 G21 ${words} F${Math.round(feedMmMin)}`];
  }
  // Tras un movimiento manual, avisa si el controlador lo rechazó o está en alarma
  function vigilarMovimiento(t0) {
    setTimeout(() => {
      const errs = M.errorsSince(t0);
      if (M.state === 'Alarma') LS.ui.toast('El controlador está en ALARMA y no acepta movimientos. Pulse «Desbloquear» (panel Láser).', 'err');
      else if (errs.length) LS.ui.toast(`El controlador rechazó el movimiento: ${errs[0].line} ${errs[0].texto}`, 'err');
      else if (grbl.sentLens.length >= 3) LS.ui.toast('El controlador no está respondiendo a los comandos. Pulse DETENER para limpiar la comunicación y pruebe de nuevo.', 'err');
    }, 900);
  }
  // Mueve el CABEZAL (ejes físicos X/Y) sin conversión del rotativo. Se usa con el rotativo en el conector Z,
  // donde el motor Y del cabezal sigue conectado.
  M.jogHead = async (dx, dy, speedMms) => {
    need();
    if (!M.isGrbl()) return M.jog(dx, dy, speedMms);
    if (M.rawPos && M.origenConocido && !M.origenSupuesto && LS.device.limitarMovimientos !== false) {
      const d = LS.device, lim = (cur, delta, max) => delta > 0 ? Math.max(0, Math.min(delta, max - cur)) : Math.min(0, Math.max(delta, 0 - cur));
      const ndx = lim(M.rawPos[0], dx, d.ancho), ndy = lim(M.rawPos[1], dy, d.alto);
      if (Math.abs(ndx) < 1e-3 && Math.abs(ndy) < 1e-3 && (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3)) { LS.ui.toast('Límite del área de trabajo: el cabezal ya está en el borde en esa dirección.', 'err'); return; }
      if (Math.abs(ndx - dx) > 1e-6 || Math.abs(ndy - dy) > 1e-6) LS.ui.toast('Movimiento recortado al borde del área de trabajo.');
      dx = ndx; dy = ndy;
    }
    [dx, dy] = recortarPorTopes(dx, dy); M.ultimoJog = { dx, dy, t: Date.now() };
    const w = []; if (Math.abs(dx) > 1e-9) w.push(`X${dx.toFixed(3)}`); if (Math.abs(dy) > 1e-9) w.push(`Y${dy.toFixed(3)}`);
    if (!w.length) return;
    await grblWrite('\x85'); const t0 = Date.now();
    jogLines(w.join(' '), speedMms * 60).forEach(l => grblSend(l)); vigilarMovimiento(t0);
    LS.ui.msg(`Movimiento enviado: cabezal ${Math.abs(dx) > 1e-9 ? `X ${dx > 0 ? '+' : ''}${dx.toFixed(1)} mm ` : ''}${Math.abs(dy) > 1e-9 ? `Y ${dy > 0 ? '+' : ''}${dy.toFixed(1)} mm` : ''}  [${w.join(' ')}]`);
  };
  // Gira el accesorio rotativo 'mm' de superficie del objeto (positivo = la parte de arriba hacia el frente)
  M.jogRot = async (mm, speedMms) => {
    need(); if (M._modoPromesa) await M._modoPromesa.catch(() => { });
    if (!LS.rotary.activo) throw new Error('Active el rotativo (panel Láser) para girarlo.');
    if (!M.isGrbl()) return M.jog(0, mm, speedMms);
    const J = LS.jobs, letra = J.rotaryAxis() === 'Z' ? 'Z' : 'Y', rf = J.rotaryFactor(), v = mm * rf;
    // velocidad sobre la superficie limitada (un rotativo con carga no acelera como un eje lineal)
    const vSup = Math.min(speedMms, Number(LS.rotary.velMax) || 20), fEje = Math.max(1, vSup * 60 * Math.abs(rf));
    await grblWrite('\x85'); const t0 = Date.now();
    jogLines(`${letra}${v.toFixed(3)}`, fEje).forEach(l => grblSend(l)); vigilarMovimiento(t0);
    LS.ui.msg(`Movimiento enviado: giro del rotativo ${mm > 0 ? '+' : ''}${mm.toFixed(1)} mm de superficie (conector ${letra})  [${letra}${v.toFixed(3)}]`);
  };
  // Mover la barra Y física aunque el rotativo esté activo en el conector Z
  M.jogBarraY = async (mm, speedMms = 20) => {
    need();
    if (LS.rotary.activo && LS.jobs.rotaryAxis() !== 'Z') throw new Error('Con el rotativo en el conector Y la barra no se puede mover por separado.');
    const sy = (LS.device.origen || 'inf-izq').startsWith('inf') ? 1 : 1;
    await grblWrite('\x85'); M.ultimoJog = { dx: 0, dy: mm, t: Date.now() };
    jogLines(`Y${(mm * sy).toFixed(3)}`, speedMms * 60).forEach(l => grblSend(l));
  };
  M.queueInfo = () => ({ pendientes: grbl.sentLens.length, enCola: grbl.queue.length });
  M.rawJog = async (axis, dist, feedMmMin) => {
    need();
    if (!M.isGrbl()) throw new Error('La identificación de ejes está disponible con GRBL.');
    await grblWrite('\x85');
    const lines = jogLines(`${axis}${dist.toFixed(3)}`, feedMmMin);
    lines.forEach(l => { log('> ' + l, 'out'); grblSend(l); });
  };
  // Sin finales de carrera, "Inicio" lleva el cabezal a la posición de partida guardada
  M.goStart = async () => {
    need();
    if (!M.origenConocido) throw new Error('Aún no se conoce la posición del cabezal. Arrastre el módulo con Mayús hasta donde está, o use Mover → Fijar origen aquí.');
    const d = LS.startWorld(), dd = LS.toDisp(d[0], d[1]);
    if (LS.rotary.activo && LS.jobs.rotaryAxis() === 'Z') await M.jogHead(dd[0] - M.rawPos[0], dd[1] - M.rawPos[1], 50);
    else if (LS.rotary.activo) await M.jog(dd[0] - M.pos[0], 0, 50);
    else await M.moveTo(dd[0], dd[1], Math.max(5, (Number(LS.device.velIrPartida) || 1500) / 60));
    log('Volviendo a la posición de partida (velocidad moderada).', 'ok');
  };
  // ---- Búsqueda de inicio con finales de carrera ----
  // Esquina de los topes (lienzo) → ref "inf-izq", etc.
  M.esquinaTopes = () => `${LS.device.topeY === 'sup' ? 'sup' : 'inf'}-${LS.device.topeX === 'der' ? 'der' : 'izq'}`;
  // Sentido (en el controlador) hacia cada tope, según el origen de la máquina (que ya refleja ejes invertidos)
  M.sentidoTope = eje => {
    const d = LS.device, [v, h] = (d.origen || 'inf-izq').split('-');
    if (eje === 'X') return ((d.topeX || 'izq') === 'izq') === (h === 'izq') ? -1 : 1;
    return ((d.topeY || 'inf') === 'inf') === (v === 'inf') ? -1 : 1;
  };
  M.mascaraHoming = () => (M.sentidoTope('X') < 0 ? 1 : 0) | (M.sentidoTope('Y') < 0 ? 2 : 0);
  // Ajustes de la placa para buscar el inicio ($22, $23, velocidades y separación)
  // velocidades seguras para no golpear los finales de carrera (mm/min)
  M.velInicio = () => ({ rapida: Math.max(100, Math.min(3000, Number(LS.device.velBusqueda) || 600)), fina: Math.max(20, Math.min(500, Number(LS.device.velBusquedaFina) || 100)) });
  M.metodoInicio = () => LS.device.metodoInicio === 'auto' ? 'auto' : 'guiado';
  // Guiado: la app vigila los topes; no hace falta el homing del firmware ($22=0 evita el bloqueo al encender)
  M.ajustesInicio = () => { const v = M.velInicio(); return M.metodoInicio() === 'guiado' ? { 22: 0 } : { 22: 1, 23: M.mascaraHoming(), 24: v.fina, 25: v.rapida, 26: 250, 27: 3 }; };
  M.aplicarAjustesInicio = async (forzar = true) => {
    need(); const a = M.ajustesInicio(), act = M.ajustesTexto || {}; let n = 0;
    for (const [k, v] of Object.entries(a)) {
      // respeta separación/rebote ya puestos, pero las velocidades nunca quedan por encima de las seguras
      if (!forzar && (k === '26' || k === '27') && act[k] != null) continue;
      if (!forzar && (k === '24' || k === '25') && act[k] != null && parseFloat(act[k]) <= v) continue;
      if (act[k] != null && Math.abs(parseFloat(act[k]) - v) < 1e-6) continue;
      await M.sendLine(`$${k}=${v}`); await new Promise(r => setTimeout(r, 120)); n++;
      M.ajustesTexto = Object.assign(M.ajustesTexto || {}, { [k]: String(v) });
    }
    if (n) log(M.metodoInicio() === 'guiado' ? 'Búsqueda guiada por la app: $22=0 (la placa no usa su propio homing).' : `Ajustes de inicio enviados a la placa: $22=1, $23=${a[23]} (X hacia ${LS.device.topeX === 'der' ? 'la derecha' : 'la izquierda'}, Y hacia ${LS.device.topeY === 'sup' ? 'atrás' : 'adelante'}).`, 'ok');
    return n;
  };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  // Búsqueda guiada (si el firmware no tiene $HX/$HY): avanza hacia el tope vigilando el interruptor (Pn)
  // Entradas de finales de carrera informadas por la placa (Pn) — P (sonda), D (puerta), etc. no cuentan
  const LETRAS_TOPE = 'XYZABC';
  M.letrasTope = () => [...(M.pines || '')].filter(c => LETRAS_TOPE.includes(c));
  // Entrada en la que llega el tope de cada eje (si los conectores están cruzados, X puede llegar como "Y")
  M.letraTope = eje => (LS.device.mapaTopes && LS.device.mapaTopes[eje]) || eje;
  M.topeActivo = eje => !!M.connected && (M.pines || '').includes(M.letraTope(eje));
  function aprenderTope(eje, letra) {
    const d = LS.device; if (!letra || M.letraTope(eje) === letra) return;
    d.mapaTopes = Object.assign({}, d.mapaTopes, { [eje]: letra });
    if (LETRAS_TOPE.includes(letra) && letra !== eje && !(d.mapaTopes[letra] && d.mapaTopes[letra] !== eje)) d.mapaTopes[letra] = eje; // cruce X↔Y
    LS.saveSettings();
    log(`El tope del eje ${eje} llega por la entrada ${letra} de la placa (conectores cruzados). Queda registrado; también puede intercambiar los conectores X-/Y-.`, 'err');
    LS.ui.toast(`Tope de ${eje} detectado en la entrada ${letra}: corregido automáticamente.`, 'ok');
  }
  async function busquedaGuiada(eje) {
    const s = M.sentidoTope(eje), d = LS.device, recorrido = (eje === 'X' ? d.ancho : d.alto) + 10;
    const rapido = setInterval(() => grblWrite('?').catch(() => { }), 40);
    const pulsado = () => M.topeActivo(eje);
    const desbloquear = async () => { if (M.state === 'Alarma') { await grblWrite('$X\n'); await esperar(400); } };
    const avanzar = async (dist, f, pararAlTocar) => {
      await grblWrite('\x85'); await esperar(60);
      const base = M.letrasTope();
      await grblWrite(`$J=G91 G21 ${eje}${(dist).toFixed(3)} F${f}\n`);
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        await esperar(20);
        if (M._abortInicio) throw new Error('búsqueda detenida.');
        // solo se mueve este eje: cualquier tope que se active es el suyo (aunque llegue por otra entrada)
        const nuevas = M.letrasTope().filter(l => !base.includes(l));
        if (pararAlTocar && (pulsado() || nuevas.length)) {
          await grblWrite('\x85'); if (!pulsado() && nuevas.length) aprenderTope(eje, nuevas[0]);
          await esperar(300); await desbloquear(); return true;
        }
        if (M.state === 'Alarma') { await desbloquear(); return pararAlTocar; } // límite duro: también indica el tope
        if (!pararAlTocar && /Inactivo/.test(M.state) && Date.now() - t0 > 300) return true;
        if (pararAlTocar && /Inactivo/.test(M.state) && Date.now() - t0 > 500) return false;
      }
      return false;
    };
    try {
      if (pulsado()) await avanzar(-s * 6, 600, false);                    // si ya está tocando, se separa
      const vel = M.velInicio();
      if (!(await avanzar(s * recorrido, vel.rapida, true))) throw new Error(`No se encontró el final de carrera de ${eje}: revise que esté conectado y en el lado configurado.`);
      await avanzar(-s * 4, 300, false);                                  // se separa
      if (!(await avanzar(s * 8, vel.fina, true))) throw new Error(`El final de carrera de ${eje} no respondió en la segunda aproximación.`);
      await avanzar(-s * 3, 300, false);                                  // separación final
    } finally { clearInterval(rapido); }
  }
  M.home = async () => {
    need();
    if (!M.isGrbl()) { await ruidaSendRaw(R().cmd.homeXY()); log('Buscando inicio…', 'ok'); return; }
    if (!LS.device.finalesCarrera) return M.goStart();
    if (M.running || M.sdActivo) throw new Error('Hay un trabajo en curso.');
    if (M.buscandoInicio) { LS.ui.toast('La búsqueda de inicio ya está en curso.'); return; }
    M._abortInicio = false;
    if (LS.rotary.activo && LS.jobs.rotaryAxis() === 'Y') throw new Error('Con el rotativo en el conector Y no se puede buscar el inicio en Y. Desactive el rotativo primero.');
    M.buscandoInicio = true; emit();
    try {
      await M.aplicarAjustesInicio(false);
      for (const eje of ['X', 'Y']) {
        log(`Buscando inicio en ${eje}…`, 'ok'); LS.ui.msg && LS.ui.msg(`Buscando el final de carrera de ${eje}…`);
        let noSoportado = M.metodoInicio() === 'guiado', respuesta = null;
        if (!noSoportado) {
          // espera la respuesta real de la placa al terminar el eje (no el estado, que algunos firmwares no informan durante el homing)
          await esperar(300);
          respuesta = await new Promise(res => { const tm = setTimeout(() => res('timeout'), 120000); grbl.lineWaiters.push(l => { clearTimeout(tm); res(l); }); grblSend('$H' + eje); });
          noSoportado = /^error:(3|20|1)$/.test(respuesta);
          if (!noSoportado && respuesta !== 'ok') throw new Error(`La búsqueda de ${eje} con el firmware falló (${respuesta}). Use el método «Guiado por la app» en Dispositivo o en los controles flotantes.`);
        }
        if (noSoportado) { log(LS.device.metodoInicio === 'guiado' ? `Búsqueda guiada de ${eje}: avanza hasta que el tope ${eje} se active.` : `El firmware no tiene $H${eje}: búsqueda guiada por la aplicación.`, 'in'); await grblWrite('$X\n'); await esperar(300); await busquedaGuiada(eje); }
        else {
          await M.waitIdle(5000);
          if (M.state === 'Alarma') throw new Error(`La búsqueda de ${eje} terminó en ALARMA: revise el final de carrera de ${eje} y el sentido (Dispositivo → finales de carrera).`);
        }
      }
      // la esquina de los topes pasa a ser el punto de partida (0,0 del lienzo en esa esquina)
      const ref = M.esquinaTopes();
      await M.setZeroAt(M.refPoint(ref).world, ref);
      M.origenConocido = true; M.origenSupuesto = false; M.limitesTope = {}; M.ejesCalibrados = { X: true, Y: true }; LS.device.refArranque = ref; LS.saveSettings();
      log('Inicio encontrado: el origen queda en la esquina de los finales de carrera.', 'ok');
      LS.ui.toast('Inicio encontrado: origen fijado en la esquina de los finales de carrera.', 'ok');
    } catch (e) {
      try { await grblWrite('\x85'); } catch (x) { }
      log('Búsqueda de inicio: ' + e.message, 'err'); throw e;
    } finally { M.buscandoInicio = false; M._abortInicio = false; emit(); }
  };
  M.unlock = () => { need(); if (M.isGrbl()) grblSend('$X'); };
  // Limita un destino (coordenadas visibles) al área de trabajo; el eje que gira el rotativo no se limita
  function clampTarget(x, y) {
    const d = LS.device; if (d.limitarMovimientos === false) return [x, y, false];
    let rx = false, ry = false;
    if (LS.rotary.activo) { if (LS.jobs.axisLetters()[0] === 'Z') rx = true; else ry = true; }
    const cx = rx ? x : Math.max(0, Math.min(d.ancho, x)), cy = ry ? y : Math.max(0, Math.min(d.alto, y));
    return [cx, cy, Math.abs(cx - x) > 1e-6 || Math.abs(cy - y) > 1e-6];
  }
  // Recorta un movimiento manual para no empujar contra un tope ya detectado (límites en coordenadas de máquina)
  function recortarPorTopes(dx, dy) {
    const L = M.limitesTope || {}, mp = M.mpos; let msg = null;
    const ajustar = (eje, i, delta) => {
      if (!delta) return delta;
      // si el tope de este eje está pulsado, no se deja avanzar hacia él
      const t = L[eje];
      if (M.topeActivo(eje) && t && ((t.lado === 'min' && delta < 0) || (t.lado === 'max' && delta > 0))) { msg = `El tope de ${eje} está pulsado: solo puede alejarse de él.`; return 0; }
      if (!t || !mp || t.mpos == null) return delta;
      if (t.lado === 'min' && delta < 0) { const lim = t.mpos + 0.5 - mp[i]; if (delta < lim) { msg = `Límite de ${eje} (tope detectado).`; return Math.min(0, lim); } }
      if (t.lado === 'max' && delta > 0) { const lim = t.mpos - 0.5 - mp[i]; if (delta > lim) { msg = `Límite de ${eje} (tope detectado).`; return Math.max(0, lim); } }
      return delta;
    };
    const r = [ajustar('X', 0, dx), ajustar('Y', 1, dy)];
    if (msg) LS.ui.toast(msg, 'err');
    return r;
  }
  M.recortarPorTopes = recortarPorTopes;
  M.jog = async (dx, dy, speedMms) => {
    need(); if (M._modoPromesa) { LS.ui.toast('Cambiando el modo de la placa ($45)… espere un momento.'); await M._modoPromesa.catch(() => { }); }
    if (M.isGrbl() && !LS.rotary.activo) [dx, dy] = recortarPorTopes(dx, dy);
    M.ultimoJog = { dx, dy, t: Date.now() };
    // Límites del área: solo cuando la app sabe dónde está el cabezal (origen fijado o búsqueda de inicio).
    // Nunca invierte el sentido pedido: si ya está fuera, solo deja moverse hacia dentro.
    if (M.pos && LS.device.limitarMovimientos !== false) {
      if (!M.origenConocido || M.origenSupuesto) {
        if (!M.avisoOrigen) { M.avisoOrigen = true; LS.ui.toast('Aún no ha fijado el origen: los límites del área no están activos. Lleve el cabezal a una referencia y use Mover → «Fijar origen aquí».'); }
      } else {
        const d = LS.device; let rx = false, ry = false;
        if (LS.rotary.activo) { if (LS.jobs.axisLetters()[0] === 'Z') rx = true; else ry = true; }
        const lim = (cur, delta, max) => delta > 0 ? Math.max(0, Math.min(delta, max - cur)) : Math.min(0, Math.max(delta, 0 - cur));
        const ndx = rx ? dx : lim(M.pos[0], dx, d.ancho), ndy = ry ? dy : lim(M.pos[1], dy, d.alto);
        if (Math.abs(ndx - dx) > 1e-6 || Math.abs(ndy - dy) > 1e-6) {
          if (Math.abs(ndx) < 1e-3 && Math.abs(ndy) < 1e-3) { LS.ui.toast('Límite del área de trabajo: el cabezal ya está en el borde en esa dirección.', 'err'); return; }
          LS.ui.toast('Movimiento recortado al borde del área de trabajo.');
          dx = ndx; dy = ndy;
        }
      }
    }
    if (M.isGrbl()) {
      // dx/dy en coordenadas visibles; el eje que lleva el rotativo se convierte en giro
      await grblWrite('\x85'); // cancelar jog previo
      const words = axisWords(dx, dy, true);
      const t0 = Date.now();
      let feedM = speedMms * 60;
      if (LS.rotary.activo) {
        const { rf, rot } = rotState(), sup = Math.hypot(dx, dy);
        const a = rot === 0 ? [dx * rf, dy] : rot === 1 ? [dx, dy * rf] : [dx, dy], vSup = Math.min(speedMms, Number(LS.rotary.velMax) || 20);
        if (sup > 1e-9) feedM = Math.max(1, vSup * 60 * Math.hypot(a[0], a[1]) / sup);
      }
      jogLines(words, feedM).forEach(l => grblSend(l));
      vigilarMovimiento(t0);
      LS.ui.msg(`Movimiento enviado: ${describeJog(dx, dy, words)}`);
    } else {
      const p = M.pos || [0, 0];
      await ruidaSendRaw(R().cmd.moverAbs(p[0] + dx, p[1] + dy)); setTimeout(M.pollRuida, 400);
    }
  };
  M.jogZ = async dz => {
    need();
    if (M.isGrbl() && LS.jobs.axisLetters().includes('Z')) throw new Error('El puerto Z está asignado al rotativo: use las flechas para girar el objeto.');
    if (M.isGrbl()) grblSend(`$J=G91 G21 Z${dz.toFixed(3)} F300`); else await ruidaSendRaw(R().cmd.moverZRel(dz));
  };
  M.moveTo = async (x, y, speedMms = 50) => {
    need();
    const [cx, cy, clamped] = M.origenConocido && !M.origenSupuesto ? clampTarget(x, y) : [x, y, false];
    if (clamped) { LS.ui.toast('El destino estaba fuera del área de trabajo; se ajustó al borde.', 'err'); x = cx; y = cy; }
    // G1 con láser apagado a velocidad controlada (G0 iría a la máxima de la máquina)
    if (M.isGrbl()) { grblSend('M5 S0'); grblSend(`G90 G1 ${axisWords(x, y)} F${Math.round(Math.max(1, speedMms) * 60)}`); }
    else { await ruidaSendRaw(R().cmd.moverAbs(x, y)); setTimeout(M.pollRuida, 400); }
  };
  // Declara la posición actual como esquina de origen (0,0) de la mesa. Útil en máquinas sin finales de carrera:
  // se guarda en el sistema de coordenadas G54 del controlador (persiste al apagar).
  // Declara que la posición actual del cabezal es un punto de referencia del lienzo (centro, esquina o borde).
  // El controlador guarda ese ajuste en G54 (G10 L20 P1), así la mesa queda alineada con el lienzo desde ahí.
  M.refPoint = ref => {
    const d = LS.device, [v, h] = ref.split('-');
    const x = h === 'izq' ? 0 : h === 'der' ? d.ancho : d.ancho / 2, y = v === 'sup' ? 0 : v === 'inf' ? d.alto : d.alto / 2;
    return { world: [x, y], disp: LS.toDisp(x, y) };
  };
  // Cambio de rotativo con el conector Y: al quitarlo, el eje Y del controlador traía vueltas del objeto;
  // se vuelve a declarar la Y real de la barra para que el lienzo coincida con la máquina.
  // Invierte el sentido de un eje (cómo está cableado el motor). Cambia la esquina de origen de la máquina
  // para que flechas, arrastre y trabajos coincidan con el movimiento real; conserva la posición del cabezal.
  M.invertAxis = async axis => {
    const d = LS.device, hw = LS.V.headWorld ? LS.V.headWorld() : null;
    const [v, h] = d.origen.split('-');
    d.origen = axis === 'Y' ? `${v === 'inf' ? 'sup' : 'inf'}-${h}` : `${v}-${h === 'izq' ? 'der' : 'izq'}`;
    LS.saveSettings();
    if (M.connected && M.isGrbl() && M.origenConocido && hw) await M.setZeroAt(hw, null);
    LS.ui.refreshLaser(); LS.V.redraw(); emit();
    log(`Sentido del eje ${axis} invertido (origen de la máquina: ${d.origen}).`, 'ok');
  };
  M.rotCero = 0;
  // «Giro a 0°»: la posición actual del objeto pasa a ser 0°
  M.zeroRotation = () => { const vert = LS.jobs.rotaryOrient() === 'vertical'; M.rotCero = M.pos ? M.pos[vert ? 0 : 1] : 0; LS.V && LS.V.redraw(); emit(); };
  M.rotaryChanged = (prevRotY, nowRotY) => {
    const d = LS.device;
    if (nowRotY && !prevRotY) {
      // la barra se queda donde está: se toma la posición REAL del controlador (no la del esquema, que ya usa el rotativo)
      const h = M.rawPos ? LS.fromDisp(M.rawPos[0], M.rawPos[1]) : (LS.V.headWorld && !LS.rotary.activo ? LS.V.headWorld() : null);
      d.barraY = h ? h[1] : LS.startWorld()[1]; LS.saveSettings(); return;
    }
    if (prevRotY && !nowRotY && M.connected && M.isGrbl() && d.barraY != null) {
      const y = LS.toDisp(0, d.barraY)[1];
      grblSend(`G10 L20 P1 Y${y.toFixed(3)}`); log(`Rotativo quitado del conector Y: la barra vuelve a Y ${y.toFixed(1)} (posición física).`, 'ok');
      setTimeout(() => grblWrite('?').catch(() => { }), 150);
    }
  };
  M.setZero = (ref = LS.device.refOrigen || LS.device.origen) => M.setZeroAt(M.refPoint(ref).world, ref);
  // Declara que la posición actual del láser corresponde al punto 'world' del lienzo
  M.setZeroAt = (world, ref = null) => {
    need();
    if (!M.isGrbl()) throw new Error('Con Ruida el origen se fija desde el panel del controlador.');
    const disp = LS.toDisp(world[0], world[1]);
    // ejes lineales (el eje que lleva el rotativo no se toca)
    // ejes del cabezal: con el rotativo en el conector Y, el motor Y es el rotativo (solo X es del cabezal)
    const R = LS.rotary, rotY = R.activo && LS.jobs.rotaryAxis() === 'Y', lin = rotY ? ['X'] : ['X', 'Y'];
    if (rotY) { LS.device.barraY = world[1]; LS.saveSettings(); } // posición física de la barra (el controlador no la conoce)
    const val = { X: disp[0], Y: disp[1] };
    grblSend('G92.1');
    grblSend(`G10 L20 P1 ${lin.map(a => a + (+val[a].toFixed(3))).join(' ')}`);
    const nombres = { 'sup-izq': 'esquina superior izquierda', 'sup-cen': 'centro superior', 'sup-der': 'esquina superior derecha', 'cen-izq': 'centro izquierdo', 'cen-cen': 'centro', 'cen-der': 'centro derecho', 'inf-izq': 'esquina inferior izquierda', 'inf-cen': 'centro inferior', 'inf-der': 'esquina inferior derecha' };
    log(`Origen fijado: la posición actual del láser es ${ref ? 'la ' + nombres[ref] : 'el punto elegido'} del lienzo (X ${val.X.toFixed(1)}  Y ${val.Y.toFixed(1)}).`, 'ok');
    if (ref) { LS.device.refOrigen = ref; LS.saveSettings(); }
    // las coordenadas del controlador ya coinciden con el lienzo: el trabajo usa coordenadas absolutas
    LS.jobs.options.origenTrabajo = 'absoluto';
    M.origenConocido = true; M.origenSupuesto = false; LS.device.origenAplicado = true; LS.saveSettings();
    M.pos = [val.X ?? (M.pos ? M.pos[0] : 0), val.Y ?? (M.pos ? M.pos[1] : 0)]; emit(); LS.V && LS.V.redraw();
    setTimeout(() => grblWrite('?').catch(() => { }), 150);
  };
  // Envía ajustes $ al controlador GRBL (cambia la configuración guardada en la placa)
  M.sendSettings = lines => { need(); if (!M.isGrbl()) throw new Error('Solo disponible con GRBL.'); lines.forEach(l => { log('> ' + l, 'out'); grblSend(l); }); grblSend('$$'); };
  M.clearZero = () => { need(); if (M.isGrbl()) grblSend('G92.1'); };
  M.fire = async (pct, on) => {
    need();
    if (!M.isGrbl()) { log('El disparo de prueba se hace desde el panel del controlador Ruida.', 'err'); return; }
    if (on) { const S = Math.max(1, Math.round(pct / 100 * LS.device.maxS)); grblSend(`G1 F1000 M3 S${S}`); M.disparando = true; emit(); }
    else { grblSend('M5 S0'); M.disparando = false; emit(); }
  };
  // Posición de trabajo actual (WPos) por letra de eje, para volver tras marco/ensayo
  M.posInicio = () => M.rawPos ? { X: M.rawPos[0], Y: M.rawPos[1], Z: M.rawPos[2] } : null;
  M.frame = async (job, opts) => {
    need();
    if (M.isGrbl()) {
      const ini = M.posInicio();
      LS.frameGcode(job, opts, false, ini).forEach(l => grblSend(l));
      // al terminar, refresca la posición para que el esquema muestre el cabezal de regreso
      M.waitIdle && M.waitIdle(60000).then(() => { try { grblWrite('?'); } catch (e) { } }).catch(() => { });
    }
    else {
      const b = job.bbox; const s = (x, y, on) => ({ a: [x, y], b: [x, y], on, p: 0, F: 50, L: job.segs[0].L });
      const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1], [b.x0, b.y0]];
      const fj = { bbox: b, segs: pts.slice(1).map((p, i) => ({ a: pts[i], b: p, on: false, p: 0, F: 50, L: job.segs[0].L })) };
      await ruidaSendRaw(R().encodeJob(fj, opts));
    }
  };
  M.grblSettings = () => grbl.settings;
  LS.machine = M;
})(window.LS);
