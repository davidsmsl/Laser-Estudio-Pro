const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nativo', {
  onMenu: cb => ipcRenderer.on('menu', (e, cmd) => cb(cmd)),
  onSerialPorts: cb => ipcRenderer.on('serial-ports', (e, list) => cb(list)),
  chooseSerialPort: portId => ipcRenderer.send('serial-port-chosen', portId),
  openFile: opts => ipcRenderer.invoke('file:open', opts || {}),
  saveFile: opts => ipcRenderer.invoke('file:save', opts),
  readPath: p => ipcRenderer.invoke('file:readPath', p),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  ruidaSend: (ip, packets, expectReply) => ipcRenderer.invoke('ruida:sendPackets', { ip, packets, expectReply }),
  onRuidaProgress: cb => ipcRenderer.on('ruida-progress', (e, p) => cb(p)),
  openExternal: url => ipcRenderer.invoke('shell:open', url),
  tcpConnect: (host, port) => ipcRenderer.invoke('tcp:connect', { host, port }),
  tcpProbar: (host, puertos) => ipcRenderer.invoke('tcp:probar', { host, puertos }),
  sdSubir: (host, puerto, nombre, data) => ipcRenderer.invoke('sd:subir', { host, puerto, nombre, data }),
  tcpWrite: data => ipcRenderer.invoke('tcp:write', data),
  tcpClose: () => ipcRenderer.invoke('tcp:close'),
  onTcpData: cb => ipcRenderer.on('tcp-data', (e, d) => cb(d)),
  onTcpClose: cb => ipcRenderer.on('tcp-close', (e, m) => cb(m)),
  appInfo: () => ipcRenderer.invoke('app:info'),
  fwLista: repo => ipcRenderer.invoke('fw:lista', repo),
  fwDescargar: (repo, path) => ipcRenderer.invoke('fw:descargar', { repo, path }),
  setIdioma: l => ipcRenderer.send('set-idioma', l),
  plataforma: process.platform
});
