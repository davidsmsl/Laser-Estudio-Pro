// Modelo del documento, capas, deshacer/rehacer y configuración persistente.
(function (LS) {
  const G = LS.G;
  const PALETTE = ['#000000', '#1f4fff', '#e0262b', '#1fa83a', '#c9a400', '#e46a00', '#00a3b8', '#d62fbd', '#7a7a7a', '#5b3cc4',
    '#8a5a2b', '#2f7d6d', '#a01c4f', '#4f8f1a', '#2b5f99', '#b7792d', '#6e2f99', '#c43c3c', '#3c9c9c', '#909020',
    '#1a7ad6', '#d04d92', '#52b852', '#e09a3a', '#4466aa', '#aa4466', '#669944', '#995522', '#225599', '#bb3333'];
  LS.PALETTE = PALETTE;

  const store = {
    get(k, def) { try { const v = localStorage.getItem('ls.' + k); return v ? Object.assign(Array.isArray(def) ? [] : {}, def, JSON.parse(v)) : structuredClone(def); } catch { return structuredClone(def); } },
    set(k, v) { try { localStorage.setItem('ls.' + k, JSON.stringify(v)); } catch { } }
  };
  LS.store = store;

  LS.DEVICE_DEFAULT = {
    nombre: 'Mi láser', tipo: 'grbl', ancho: 400, alto: 400, origen: 'inf-izq',
    maxS: 1000, baudios: 115200, conexion: 'usb', wifiHost: '', wifiPuerto: 8080, ruidaIP: '192.168.1.100', modoLaser: 'M4',
    volverOrigen: true, unidadVelocidad: 'mm/s', potenciaMarco: 0, homingAlConectar: false,
    aireM8: true, retardoInicio: 0, recortarArea: true, limitarMovimientos: true, modelo: 'generico', verMaquina: true, refArranque: 'inf-izq', arranqueAuto: true, finalesCarrera: false, topeX: 'izq', topeY: 'inf', velBusqueda: 600, velBusquedaFina: 100, metodoInicio: 'guiado', velIrPartida: 1500, escala: 'cm'
  };
  // Modelos de máquina: área de trabajo publicada por el fabricante; el marco (mx, my) es aproximado
  LS.MACHINE_PRESETS = {
    generico: { nombre: 'Genérica (usar el área configurada)', ancho: null, alto: null, mx: 50, my: 55, tipo: 'portico' },
    ts1: { nombre: 'Two Trees TS1 Mini', ancho: 80, alto: 80, mx: 30, my: 35, tipo: 'cerrada' },
    tts55: { nombre: 'Two Trees TTS-55 Pro / TTS-10 Pro', ancho: 300, alto: 300, mx: 55, my: 60, tipo: 'portico' },
    tts20pro: { nombre: 'Two Trees TTS 20 Pro', ancho: 418, alto: 418, mx: 55, my: 60, tipo: 'portico' },
    tts20max: { nombre: 'Two Trees TTS 20 Max', ancho: 450, alto: 450, mx: 55, my: 60, tipo: 'portico' },
    ts2: { nombre: 'Two Trees TS2 (10 W / 20 W)', ancho: 450, alto: 410, mx: 60, my: 70, tipo: 'portico' },
    ts2max: { nombre: 'Two Trees TS2 Max / 40 W', ancho: 450, alto: 900, mx: 60, my: 70, tipo: 'portico' },
    ts3: { nombre: 'Two Trees TS3 (cerrada)', ancho: 300, alto: 200, mx: 80, my: 90, tipo: 'cerrada' }
  };
  LS.ROTARY_PRESETS = {
    tr3: { nombre: 'Two Trees TR3 (rodillos)', tipo: 'rodillos', pasosRotacion: 3200, diamRodillo: 18, rangoObjeto: '2–150 mm', verificar: true, largoModulo: 250, anchoModulo: 110 },
    rodillosGen: { nombre: 'Rodillos genérico', tipo: 'rodillos', pasosRotacion: 3200, diamRodillo: 20, rangoObjeto: '', largoModulo: 260, anchoModulo: 120 },
    mandrilGen: { nombre: 'Mandril (chuck) genérico', tipo: 'mandril', pasosRotacion: 6400, diamRodillo: 0, rangoObjeto: '', largoModulo: 320, anchoModulo: 130 },
    personalizado: { nombre: 'Personalizado', tipo: 'rodillos', pasosRotacion: 3200, diamRodillo: 20, rangoObjeto: '', largoModulo: 250, anchoModulo: 110 }
  };
  LS.ROTARY_DEFAULT = { velMax: 20, activo: false, modelo: 'tr3', tipo: 'rodillos', pasosRotacion: 3200, diamRodillo: 18, diamObjeto: 80, pasosMmY: 80, pasosMmZ: 80, eje: 'Y', invertir: false, respaldoGrbl: null,
    orient: 'horizontal', posX: null, posY: null, largoObjeto: 200, largoModulo: 250, anchoModulo: 110, mostrar: true,
    forma: 'cilindro', diamObjeto2: 60, diamContacto: null, material3d: 'acero' };

  LS.device = store.get('device', LS.DEVICE_DEFAULT);
  LS.rotary = store.get('rotary', LS.ROTARY_DEFAULT);
  LS.library = store.get('library', { materiales: [] });
  LS.saveSettings = () => { store.set('device', LS.device); store.set('rotary', LS.rotary); store.set('library', LS.library); };

  LS.layerDefault = (i) => ({
    color: PALETTE[i], nombre: 'C' + String(i).padStart(2, '0'), modo: i === 0 ? 'linea' : (i === 1 ? 'relleno' : 'linea'),
    velocidad: i === 1 ? 120 : 10, potMax: i === 1 ? 30 : 80, potMin: 0, pasadas: 1, intervalo: 0.1, angulo: 0,
    bidireccional: true, cruzado: false, sobrebarrido: 2.5, saltoBlanco: 5, aire: true, salida: true, visible: true,
    tramado: 'floyd', pasoZ: 0, rellenarJuntos: true, prioridad: i
  });

  const D = {
    objects: [], layers: {}, selection: new Set(), filePath: null, dirty: false,
    undoStack: [], redoStack: [], listeners: [],
  };
  D.layer = idx => (D.layers[idx] = D.layers[idx] || LS.layerDefault(idx));
  D.on = fn => D.listeners.push(fn);
  D.changed = (what = 'doc') => { D.dirty = true; D.listeners.forEach(f => f(what)); };

  D.snapshot = () => JSON.stringify({ objects: D.objects, layers: D.layers });
  D.checkpoint = () => { D.undoStack.push(D.snapshot()); if (D.undoStack.length > 120) D.undoStack.shift(); D.redoStack = []; };
  D.restore = s => { const o = JSON.parse(s); D.objects = o.objects; D.layers = o.layers; D.selection.clear(); invalidateAll(); D.changed('all'); };
  D.undo = () => { if (!D.undoStack.length) return; D.redoStack.push(D.snapshot()); D.restore(D.undoStack.pop()); };
  D.redo = () => { if (!D.redoStack.length) return; D.undoStack.push(D.snapshot()); D.restore(D.redoStack.pop()); };

  // --- Objetos ---
  // kind: 'path' (paths locales), 'image' (src, w, h en mm), 'text' (paths generados + datos de texto)
  D.add = (o, select = true) => {
    o.id = o.id || G.uid(); o.tx = o.tx || G.I(); o.layer = o.layer ?? D.currentLayer;
    D.layer(o.layer); D.objects.push(o);
    if (select) D.selection.add(o.id);
    return o;
  };
  D.currentLayer = 0;
  D.byId = id => D.objects.find(o => o.id === id);
  D.selected = () => D.objects.filter(o => D.selection.has(o.id));
  D.remove = ids => { const s = new Set(ids); D.objects = D.objects.filter(o => !s.has(o.id)); ids.forEach(i => D.selection.delete(i)); };

  const cache = new WeakMap();
  function invalidateAll() { /* WeakMap se limpia sola al reemplazar objetos */ }
  D.invalidate = o => cache.delete(o);
  // Trazados en coordenadas del mundo (mm), con caché por matriz
  D.worldPaths = o => {
    if (o.kind === 'image') {
      const c = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(p => G.apply(o.tx, p));
      return [{ pts: c, closed: true }];
    }
    const key = o.tx.join(',') + '|' + (o._v || 0);
    const c = cache.get(o);
    if (c && c.key === key) return c.paths;
    const paths = (o.paths || []).map(p => ({ pts: p.pts.map(q => G.apply(o.tx, q)), closed: p.closed }));
    cache.set(o, { key, paths });
    return paths;
  };
  D.objBBox = o => { let b = null; D.worldPaths(o).forEach(p => { b = G.union(b, G.bbox(p.pts)); }); return b; };
  D.selBBox = (objs = D.selected()) => { let b = null; objs.forEach(o => { b = G.union(b, D.objBBox(o)); }); return b; };
  D.transformSel = (m, objs = D.selected()) => { objs.forEach(o => { o.tx = G.mul(m, o.tx); }); };

  // Selección por grupo
  D.groupMembers = o => o.group ? D.objects.filter(x => x.group === o.group) : [o];

  D.clear = () => { D.objects = []; D.selection.clear(); D.undoStack = []; D.redoStack = []; D.filePath = null; D.dirty = false; D.layers = {}; D.layer(0); D.changed('all'); D.dirty = false; };

  D.serialize = () => JSON.stringify({ app: 'LaserEstudioPro', version: 1, device: LS.device, rotary: LS.rotary, objects: D.objects, layers: D.layers }, null, 0);
  D.load = txt => {
    const o = JSON.parse(txt);
    if (o.app !== 'LaserEstudioPro') throw new Error('El archivo no es un proyecto de Láser Estudio Pro.');
    D.objects = o.objects || []; D.layers = o.layers || {}; D.selection.clear(); D.undoStack = []; D.redoStack = []; D.dirty = false;
    D.changed('all');
  };
  LS.D = D;
})(window.LS);
