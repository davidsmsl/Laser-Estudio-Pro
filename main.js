// Láser Estudio Pro — proceso principal de Electron
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const net = require('net');

let win = null;
let pendingSerialCallback = null;

function sendMenu(cmd) { if (win) win.webContents.send('menu', cmd); }

// ---- Idioma del menú (mismo diccionario que la interfaz) ----
const { DICT } = require('./src/js/i18n-dict.js');
const I18N = { en: new Map(DICT.map(r => [r[0], r[1]])), pt: new Map(DICT.map(r => [r[0], r[2]])) };
let idioma = 'es';
const T = s => (idioma === 'es' ? s : (I18N[idioma].get(s) || s));
ipcMain.on('set-idioma', (e, l) => { if (['es', 'en', 'pt'].includes(l) && l !== idioma) { idioma = l; buildMenu(); } });

function buildMenu() {
  const m = (label, cmd, accelerator) => ({ label: T(label), accelerator, click: () => sendMenu(cmd) });
  const lang = (l, nombre) => ({ label: nombre, type: 'radio', checked: idioma === l, click: () => sendMenu('idioma:' + l) });
  const template = [
    { label: T('Archivo'), submenu: [
      m('Nuevo', 'nuevo', 'CmdOrCtrl+N'),
      m('Abrir proyecto…', 'abrir', 'CmdOrCtrl+O'),
      m('Guardar proyecto', 'guardar', 'CmdOrCtrl+S'),
      m('Guardar como…', 'guardarComo', 'CmdOrCtrl+Shift+S'),
      { type: 'separator' },
      m('Importar (SVG, DXF, imagen)…', 'importar', 'CmdOrCtrl+I'),
      m('Exportar SVG…', 'exportarSvg'),
      m('Guardar G-code…', 'guardarGcode'),
      m('Guardar archivo Ruida (.rd)…', 'guardarRd'),
      { type: 'separator' },
      { label: T('Salir'), role: 'quit' }
    ]},
    { label: T('Editar'), submenu: [
      m('Deshacer', 'deshacer', 'CmdOrCtrl+Z'),
      m('Rehacer', 'rehacer', 'CmdOrCtrl+Y'),
      { type: 'separator' },
      m('Cortar', 'cortar', 'CmdOrCtrl+X'),
      m('Copiar', 'copiar', 'CmdOrCtrl+C'),
      m('Pegar', 'pegar', 'CmdOrCtrl+V'),
      m('Duplicar', 'duplicar', 'CmdOrCtrl+D'),
      m('Eliminar', 'eliminar', 'Delete'),
      m('Seleccionar todo', 'seleccionarTodo', 'CmdOrCtrl+A'),
      { type: 'separator' },
      m('Agrupar', 'agrupar', 'CmdOrCtrl+G'),
      m('Desagrupar', 'desagrupar', 'CmdOrCtrl+U'),
      { type: 'separator' },
      m('Configuración del dispositivo…', 'configDispositivo'),
    ]},
    { label: T('Herramientas'), submenu: [
      m('Unión booleana', 'union'),
      m('Diferencia booleana', 'diferencia'),
      m('Intersección booleana', 'interseccion'),
      m('Desplazar formas (offset)…', 'offset', 'Alt+O'),
      m('Convertir a trazado', 'convertirTrazado', 'CmdOrCtrl+Shift+C'),
      { type: 'separator' },
      m('Calcar imagen…', 'calcar', 'Alt+T'),
      m('Ajustar imagen…', 'ajustarImagen'),
      { type: 'separator' },
      m('Matriz rectangular…', 'matriz', 'Alt+A'),
      m('Matriz circular…', 'matrizCircular'),
      m('Reflejar horizontal', 'reflejarH', 'CmdOrCtrl+Shift+H'),
      m('Reflejar vertical', 'reflejarV', 'CmdOrCtrl+Shift+V'),
      m('Girar 90°', 'girar90', 'CmdOrCtrl+R'),
      { type: 'separator' },
      m('Prueba de materiales…', 'pruebaMaterial'),
      m('Base de datos de materiales (configuración sugerida)…', 'materialDB', 'Alt+B'),
      m('Configuración de rotativo (TR3 y otros)…', 'rotativo'),
      m('Calibrar rotativo…', 'calibrarRotativo'),
      m('Simulación 3D del rotativo…', 'vista3d', 'Alt+3'),
      m('Ensayo en la máquina sin láser', 'ensayo'),
      { type: 'separator' },
      m('Vista previa del trabajo', 'vistaPrevia', 'Alt+P'),
    ]},
    { label: T('Ver'), submenu: [
      m('Ajustar a la mesa', 'zoomMesa', 'CmdOrCtrl+0'),
      m('Ajustar a la selección', 'zoomSel', 'CmdOrCtrl+Shift+0'),
      { type: 'separator' },
      m('Mostrar/ocultar esquema de la máquina', 'verMaquina', 'Alt+M'),
      m('Mostrar/ocultar controles de movimiento flotantes', 'jogFlotante', 'Alt+J'),
      m('Mostrar/ocultar esquema del rotativo', 'verRotativo', 'Alt+R'),
      m('Escala en rieles: cm / mm / ocultar', 'escala', 'Alt+E'),
      { type: 'separator' },
      { label: T('Pantalla completa'), role: 'togglefullscreen' },
      { label: T('Herramientas de desarrollo'), role: 'toggleDevTools' }
    ]},
    { label: T('Ayuda'), submenu: [
      m('Atajos de teclado', 'atajos'),
      m('Buscar actualizaciones…', 'actualizaciones'),
      m('Actualizar firmware de la placa…', 'firmware'),
      { type: 'separator' },
      m('Acerca de Láser Estudio Pro', 'acerca')
    ]},
    { label: idioma === 'es' ? 'Idioma' : idioma === 'en' ? 'Language' : 'Idioma', submenu: [
      lang('es', 'Español'), lang('en', 'English'), lang('pt', 'Português')
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 680,
    backgroundColor: '#1d2026',
    title: 'Láser Estudio Pro',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const ses = win.webContents.session;

  // ---- Puertos serie (Web Serial) para GRBL ----
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    pendingSerialCallback = callback;
    win.webContents.send('serial-ports', portList.map(p => ({
      portId: p.portId, portName: p.portName, displayName: p.displayName,
      vendorId: p.vendorId, productId: p.productId
    })));
  });
  ses.setPermissionCheckHandler((wc, permission) => permission === 'serial' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler(details => details.deviceType === 'serial');

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  if (process.env.LS_DEBUG) win.webContents.on('console-message', (e, level, msg, line, src) => console.log(`[renderer:${level}] ${msg} (${path.basename(src || '')}:${line})`));
  if (process.env.LS_EVAL) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const r = await win.webContents.executeJavaScript(fs.readFileSync(process.env.LS_EVAL, 'utf8'));
        console.log('LS_EVAL_RESULT ' + JSON.stringify(r));
      } catch (err) { console.log('LS_EVAL_ERROR ' + err.message); }
      if (!process.env.LS_SCREENSHOT) app.exit(0);
    });
  }
  if (process.env.LS_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.LS_SCREENSHOT, img.toPNG());
        if (!process.env.LS_KEEP) app.exit(0);
      }, Number(process.env.LS_DELAY || 2500));
    });
  }
}

ipcMain.on('serial-port-chosen', (e, portId) => {
  if (pendingSerialCallback) { pendingSerialCallback(portId || ''); pendingSerialCallback = null; }
});

// ---- Archivos ----
ipcMain.handle('file:open', async (e, opts) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])], filters: opts.filters || [] });
  if (r.canceled) return [];
  return r.filePaths.map(p => ({ path: p, name: path.basename(p), ext: path.extname(p).toLowerCase(), data: fs.readFileSync(p) }));
});
ipcMain.handle('file:save', async (e, opts) => {
  let p = opts.path;
  if (!p) {
    const r = await dialog.showSaveDialog(win, { defaultPath: opts.defaultPath, filters: opts.filters || [] });
    if (r.canceled) return null;
    p = r.filePath;
  }
  fs.writeFileSync(p, typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data));
  return p;
});
ipcMain.handle('file:readPath', async (e, p) => fs.readFileSync(p));

// ---- Fuentes instaladas ----
function scanFonts(dir, out, depth = 0) {
  if (depth > 4) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) scanFonts(full, out, depth + 1);
    else if (/\.(ttf|otf)$/i.test(d.name)) out.push(full);
  }
}
ipcMain.handle('fonts:list', async () => {
  const dirs = [];
  if (process.platform === 'win32') {
    dirs.push(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'));
    if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
  } else if (process.platform === 'darwin') {
    dirs.push('/Library/Fonts', '/System/Library/Fonts', path.join(os.homedir(), 'Library/Fonts'));
  } else {
    dirs.push('/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'));
  }
  const files = [];
  dirs.forEach(d => scanFonts(d, files));
  return files.map(f => ({ path: f, file: path.basename(f) }));
});

// ---- Ruida por UDP (puerto 50200, respuestas al 40200) ----
let udp = null;
let udpWaiter = null;
function ensureUdp() {
  return new Promise((resolve, reject) => {
    if (udp) return resolve(udp);
    const s = dgram.createSocket('udp4');
    s.on('message', msg => { if (udpWaiter) { const w = udpWaiter; udpWaiter = null; w(msg); } });
    s.on('error', err => { try { s.close(); } catch {} udp = null; reject(err); });
    s.bind(40200, () => { udp = s; resolve(s); });
  });
}
function waitReply(ms) {
  return new Promise(resolve => {
    const t = setTimeout(() => { udpWaiter = null; resolve(null); }, ms);
    udpWaiter = msg => { clearTimeout(t); resolve(msg); };
  });
}
// ---- GRBL por WiFi (Telnet/TCP, p. ej. MKS DLC32 / LS ESP32 en el puerto 23) ----
let tcp = null;
ipcMain.handle('tcp:connect', (e, { host, port }) => new Promise((resolve, reject) => {
  if (tcp) { try { tcp.destroy(); } catch (x) { } tcp = null; }
  const s = net.createConnection({ host, port: Number(port) || 8080 });
  s.setNoDelay(true); s.setKeepAlive(true, 3000);
  const fallo = err => { s.destroy(); reject(new Error(err && err.code === 'ETIMEDOUT' ? 'tiempo de espera agotado' : (err && err.message) || 'sin respuesta')); };
  s.setTimeout(6000, () => fallo({ code: 'ETIMEDOUT' }));
  s.once('error', fallo);
  s.once('connect', () => {
    s.setTimeout(0); s.removeListener('error', fallo); tcp = s;
    s.on('data', d => {
      // quita negociación Telnet (IAC …) si el firmware la envía
      const out = []; for (let i = 0; i < d.length; i++) { if (d[i] === 255) { i += (d[i + 1] >= 251 && d[i + 1] <= 254) ? 2 : 1; continue; } out.push(d[i]); }
      if (out.length && win && !win.isDestroyed()) win.webContents.send('tcp-data', Buffer.from(out).toString('latin1'));
    });
    s.on('error', err => { if (win && !win.isDestroyed()) win.webContents.send('tcp-close', err.message); });
    s.on('close', () => { if (tcp === s) tcp = null; if (win && !win.isDestroyed()) win.webContents.send('tcp-close', ''); });
    resolve(true);
  });
}));
// Diagnóstico: prueba qué puertos responden en la IP (no envía nada)
ipcMain.handle('tcp:probar', async (e, { host, puertos }) => {
  const uno = port => new Promise(res => {
    const s = net.createConnection({ host, port }); const t0 = Date.now();
    const fin = estado => { try { s.destroy(); } catch (x) { } res({ port, estado, ms: Date.now() - t0 }); };
    s.setTimeout(3000, () => fin('sin respuesta'));
    s.once('connect', () => fin('abierto'));
    s.once('error', err => fin(err.code === 'ECONNREFUSED' ? 'rechazado' : (err.code || err.message)));
  });
  const out = []; for (const p of puertos) out.push(await uno(p)); return out;
});
// Sube un archivo a la tarjeta SD de la placa por su servidor web (ESP3D / Grbl_ESP32 / MKS: POST /upload)
ipcMain.handle('sd:subir', async (e, { host, puerto, nombre, data }) => {
  const url = `http://${host}${puerto && Number(puerto) !== 80 ? ':' + puerto : ''}/upload`;
  const ruta = '/' + nombre, buf = Buffer.from(data);
  const fd = new FormData();
  fd.append('path', '/');
  fd.append(ruta + 'S', String(buf.length));
  fd.append('myfile[]', new Blob([buf], { type: 'application/octet-stream' }), ruta);
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 120000);
  try {
    const r = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
    const txt = await r.text().catch(() => '');
    if (!r.ok) throw new Error(`la placa respondió ${r.status} ${txt.slice(0, 120)}`);
    return { ok: true, respuesta: txt.slice(0, 400) };
  } catch (err) { throw new Error(err.name === 'AbortError' ? 'tiempo de espera agotado al subir' : err.message); }
  finally { clearTimeout(tm); }
});
ipcMain.handle('tcp:write', (e, data) => new Promise((res, rej) => { if (!tcp) return rej(new Error('No conectado')); tcp.write(Buffer.from(data, 'latin1'), err => err ? rej(err) : res(true)); }));
ipcMain.handle('tcp:close', () => { if (tcp) { try { tcp.end(); tcp.destroy(); } catch (x) { } tcp = null; } return true; });
// paquetes ya codificados (checksum + datos) desde el renderizador
ipcMain.handle('ruida:sendPackets', async (e, { ip, packets, expectReply }) => {
  const s = await ensureUdp();
  const replies = [];
  for (let i = 0; i < packets.length; i++) {
    const buf = Buffer.from(packets[i]);
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      const wait = waitReply(attempt === 0 ? 1500 : 3000);
      s.send(buf, 50200, ip);
      const r = await wait;
      if (!r) continue; // tiempo agotado, reintentar
      if (r.length === 1 && r[0] === 0x46) { await new Promise(r2 => setTimeout(r2, 200)); continue; } // ocupado/error
      ok = true;
      if (r.length === 1 && r[0] === 0xC6) {
        if (expectReply) { const data = await waitReply(1500); if (data) replies.push(Array.from(data)); }
      } else replies.push(Array.from(r));
      if (win && packets.length > 4 && i % 8 === 0) win.webContents.send('ruida-progress', (i + 1) / packets.length);
    }
    if (!ok) return { ok: false, error: `Sin respuesta del controlador en ${ip} (paquete ${i + 1} de ${packets.length}).`, replies };
  }
  return { ok: true, replies };
});

ipcMain.handle('shell:open', (e, url) => shell.openExternal(url));
// información de la aplicación (Acerca de)
ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, so: `${os.type()} ${os.release()} ${os.arch()}` }));
// Consultas a GitHub (solo los repositorios oficiales de firmware de Makerbase)
const REPOS_FW = ['makerbase-mks/MKS-DLC32'];
ipcMain.handle('fw:lista', async (e, repo) => {
  if (!REPOS_FW.includes(repo)) throw new Error('Repositorio no permitido');
  const { net } = require('electron');
  const r = await net.fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, { headers: { 'User-Agent': 'LaserEstudioPro', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub respondió ' + r.status);
  const j = await r.json();
  return (j.tree || []).filter(t => t.type === 'blob' && /\.bin$/i.test(t.path)).map(t => ({ path: t.path, size: t.size }));
});
ipcMain.handle('fw:descargar', async (e, { repo, path: ruta }) => {
  if (!REPOS_FW.includes(repo) || /\.\./.test(ruta) || !/\.bin$/i.test(ruta)) throw new Error('Archivo no permitido');
  const { net } = require('electron');
  const url = `https://raw.githubusercontent.com/${repo}/main/${ruta.split('/').map(encodeURIComponent).join('/')}`;
  const r = await net.fetch(url, { headers: { 'User-Agent': 'LaserEstudioPro' } });
  if (!r.ok) throw new Error('Descarga falló: ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
});

app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on('window-all-closed', () => app.quit());
