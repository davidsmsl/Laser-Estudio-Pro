// Vista 3D del rotativo y simulación del grabado sobre el objeto (cilindro o cono).
import * as THREE from '../../node_modules/three/build/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const LS = window.LS;
const MATERIALES = {
  acero: { nombre: 'Acero inoxidable', base: '#c9ced6', grabado: '#3b3f46', metal: 0.75, rugosidad: 0.35 },
  blanco: { nombre: 'Pintura blanca', base: '#f2f2ee', grabado: '#6b6f78', metal: 0.05, rugosidad: 0.6 },
  negro: { nombre: 'Pintura negra', base: '#24262b', grabado: '#d9d4c7', metal: 0.1, rugosidad: 0.55 },
  madera: { nombre: 'Madera', base: '#c9995c', grabado: '#3a2414', metal: 0, rugosidad: 0.85 },
  vidrio: { nombre: 'Vidrio', base: '#bcd4dc', grabado: '#f4f8fa', metal: 0.1, rugosidad: 0.15 },
};

let st = null; // estado de la vista abierta

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

export function abrir() {
  const R = LS.rotary;
  if (!R.activo) { LS.ui.toast('Active el rotativo (panel Láser) para usar la simulación 3D.', 'err'); return; }
  if (st) cerrar();
  const ov = el(`<div id="v3d" style="position:fixed;inset:0;z-index:40;background:#14161b;display:grid;grid-template-rows:auto 1fr auto">
    <div style="display:flex;gap:10px;align-items:center;padding:8px 12px;background:#252931;border-bottom:1px solid #3a404c;flex-wrap:wrap">
      <b style="color:#ff8a1f">Simulación 3D del rotativo</b>
      <label>Forma <select id="v-forma"><option value="cilindro">Cilindro</option><option value="cono">Cono</option></select></label>
      <label>Ø <input type="number" id="v-d1" step="0.1" min="1" style="width:70px"></label>
      <label id="v-d2l">Ø final <input type="number" id="v-d2" step="0.1" min="1" style="width:70px"></label>
      <label>Largo <input type="number" id="v-lo" step="1" min="5" style="width:70px"></label>
      <label title="Distancia del cabezal a la superficie del objeto (foco)">Distancia de foco <input type="number" id="v-foco" step="0.5" min="1" style="width:64px"></label>
      <label>Material <select id="v-mat">${Object.entries(MATERIALES).map(([k, m]) => `<option value="${k}">${m.nombre}</option>`).join('')}</select></label>
      <button id="v-apl">Aplicar medidas</button>
      <span style="flex:1"></span>
      <button id="v-cerrar" class="primary" style="margin-right:130px">Cerrar</button>
    </div>
    <div id="v3d-cv" style="position:relative;min-height:0"><div id="v-info" style="position:absolute;left:12px;top:10px;color:#ffd08a;font-size:12px;background:rgba(20,22,27,.75);padding:6px 9px;border-radius:4px;line-height:1.5;pointer-events:none"></div></div>
    <div style="display:flex;gap:12px;align-items:center;padding:8px 12px;background:#252931;border-top:1px solid #3a404c">
      <button id="v-play">▶ Simular</button><button id="v-reset">⟲ Reiniciar</button>
      <label>Velocidad <select id="v-vel"><option value="1">1×</option><option value="5">5×</option><option value="20" selected>20×</option><option value="100">100×</option><option value="500">500×</option></select></label>
      <input type="range" id="v-t" min="0" max="1000" value="0" style="flex:1">
      <span id="v-tiempo" class="chip">0 s</span>
      <label><input type="checkbox" id="v-haz" checked> Haz</label>
      <button id="v-seco" title="Ejecuta el mismo recorrido en la máquina con el láser apagado">Ensayo en la máquina (sin láser)</button>
    </div></div>`);
  document.body.append(ov);
  const $ = s => ov.querySelector(s);
  $('#v-forma').value = R.forma || 'cilindro'; $('#v-d1').value = R.diamObjeto; $('#v-d2').value = R.diamObjeto2 || R.diamObjeto;
  $('#v-lo').value = R.largoObjeto || 200; $('#v-foco').value = R.distFoco || 20; $('#v-mat').value = R.material3d || 'acero';
  const updForma = () => { $('#v-d2l').style.display = $('#v-forma').value === 'cono' ? '' : 'none'; };
  updForma(); $('#v-forma').onchange = updForma;

  const host = $('#v3d-cv');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1b1e24');
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-200, 400, 300); scene.add(sun);
  const grid = new THREE.GridHelper(800, 40, 0x3a404c, 0x2a2e36); scene.add(grid);

  st = { ov, renderer, scene, camera, controls, playing: false, t: 0, dur: 0, raf: 0, last: performance.now(), $ };
  const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); renderer.domElement.style.width = r.width + 'px'; renderer.domElement.style.height = r.height + 'px'; camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  st.ro = new ResizeObserver(resize); st.ro.observe(host); resize();

  construir();

  $('#v-cerrar').onclick = cerrar;
  $('#v-apl').onclick = () => {
    Object.assign(R, { forma: $('#v-forma').value, diamObjeto: +$('#v-d1').value, diamObjeto2: +$('#v-d2').value, largoObjeto: +$('#v-lo').value, distFoco: +$('#v-foco').value, material3d: $('#v-mat').value });
    if (!(R.diamObjeto > 0 && R.largoObjeto > 0)) return LS.ui.toast('El diámetro y el largo deben ser mayores que cero.', 'err');
    LS.saveSettings(); LS.ui.refreshLaser(); LS.V.redraw(); construir();
  };
  $('#v-mat').onchange = () => { R.material3d = $('#v-mat').value; LS.saveSettings(); construir(); };
  $('#v-play').onclick = () => { if (st.t >= st.dur) reiniciar(); st.playing = !st.playing; $('#v-play').textContent = st.playing ? '⏸ Pausar' : '▶ Simular'; st.last = performance.now(); };
  $('#v-reset').onclick = () => { reiniciar(); };
  $('#v-t').oninput = e => { const target = e.target.value / 1000 * st.dur; if (target < st.t) reiniciar(false); avanzarHasta(target); };
  $('#v-seco').onclick = () => LS.app.dryRun();
  window.addEventListener('keydown', st.onKey = e => { if (e.key === 'Escape') cerrar(); });
  bucle();
}

export function cerrar() {
  if (!st) return;
  cancelAnimationFrame(st.raf); st.ro.disconnect(); window.removeEventListener('keydown', st.onKey);
  st.renderer.dispose(); st.ov.remove(); st = null;
}

// ---------- Escena ----------
function construir() {
  const { scene } = st, R = LS.rotary, $ = st.$;
  if (st.grupo) { scene.remove(st.grupo); st.grupo.traverse(o => { o.geometry && o.geometry.dispose(); }); }
  const grupo = new THREE.Group(); st.grupo = grupo; scene.add(grupo);
  const g = LS.rotaryGeom();
  const lm = g.lm, am = g.am, lo = g.lo;
  const cono = R.forma === 'cono';
  const d1 = R.diamObjeto, d2 = cono ? (R.diamObjeto2 || d1) : d1, r1 = d1 / 2, r2 = d2 / 2, rmax = Math.max(r1, r2);
  const metal = new THREE.MeshStandardMaterial({ color: '#5c636e', metalness: 0.6, roughness: 0.45 });
  const goma = new THREE.MeshStandardMaterial({ color: '#202226', metalness: 0.1, roughness: 0.9 });
  // base del módulo
  const base = new THREE.Mesh(new THREE.BoxGeometry(lm, 8, am), metal); base.position.y = 4; grupo.add(base);
  let axisY;
  st.rodillos = [];
  if (R.tipo === 'mandril') {
    axisY = 8 + Math.max(rmax, 30) + 12;
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(rmax * 1.25, 28), Math.max(rmax * 1.25, 28), 30, 48), metal);
    chuck.rotation.z = Math.PI / 2; chuck.position.set(-lo / 2 - 16, axisY, 0); grupo.add(chuck);
    const torre = new THREE.Mesh(new THREE.BoxGeometry(40, axisY, 50), metal); torre.position.set(-lo / 2 - 40, axisY / 2, 0); grupo.add(torre);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(10, 26, 24), metal); punta.rotation.z = Math.PI / 2; punta.position.set(lo / 2 + 14, axisY, 0); grupo.add(punta);
    const torre2 = new THREE.Mesh(new THREE.BoxGeometry(24, axisY, 36), metal); torre2.position.set(lo / 2 + 34, axisY / 2, 0); grupo.add(torre2);
    st.mandril = chuck;
  } else {
    const rr = (R.diamRodillo || 18) / 2, sep = Math.max(rmax * 0.84, rr * 1.8, am * 0.18) ;
    const ry = 8 + 14 + rr;
    [-1, 1].forEach(k => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, lm * 0.86, 32), goma);
      rod.rotation.z = Math.PI / 2; rod.position.set(0, ry, k * sep); grupo.add(rod); st.rodillos.push(rod);
      [-1, 1].forEach(e => { const sop = new THREE.Mesh(new THREE.BoxGeometry(10, ry, rr * 2 + 8), metal); sop.position.set(e * lm * 0.45, ry / 2 + 4, k * sep); grupo.add(sop); });
    });
    // centro del objeto apoyado en los dos rodillos (usa el radio mayor)
    axisY = ry + Math.sqrt(Math.max(0, (rmax + rr) ** 2 - sep ** 2));
    st.rr = rr;
  }
  // objeto con textura de grabado
  const M = MATERIALES[R.material3d] || MATERIALES.acero; st.mat = M;
  const k = Math.min(6, 4096 / Math.max(Math.PI * 2 * rmax, lo));
  const tex = document.createElement('canvas'); tex.width = Math.max(64, Math.round(Math.PI * 2 * rmax * k)); tex.height = Math.max(64, Math.round(lo * k));
  st.tex = tex; st.tctx = tex.getContext('2d'); st.k = k;
  const texture = new THREE.CanvasTexture(tex); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; st.texture = texture;
  const lado = new THREE.MeshStandardMaterial({ map: texture, metalness: M.metal, roughness: M.rugosidad });
  const tapa = new THREE.MeshStandardMaterial({ color: M.base, metalness: M.metal, roughness: M.rugosidad });
  // CylinderGeometry: radio superior = extremo final (+X), inferior = extremo inicial
  const obj = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, lo, 160, 1, false), [lado, tapa, tapa]);
  obj.rotation.z = -Math.PI / 2;
  const rotor = new THREE.Group(); rotor.add(obj);
  const incl = new THREE.Group(); incl.add(rotor); incl.position.set(0, axisY, 0);
  // cono: se inclina para que la línea superior quede horizontal (foco constante)
  if (cono) incl.rotation.z = Math.atan2(r1 - r2, lo);
  grupo.add(incl);
  st.rotor = rotor; st.obj = obj; st.r1 = r1; st.r2 = r2; st.lo = lo;
  const topY = axisY + rmax;
  // cabezal del láser y haz
  const foco = R.distFoco || 20;
  const cab = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(34, 46, 34), new THREE.MeshStandardMaterial({ color: '#2b2f37', metalness: 0.3, roughness: 0.6 }));
  cuerpo.position.y = foco + 23; cab.add(cuerpo);
  const boquilla = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 8, 20), metal); boquilla.position.y = foco + 2; cab.add(boquilla);
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, foco, 8), new THREE.MeshBasicMaterial({ color: '#ff3a2a' }));
  haz.position.y = foco / 2; cab.add(haz);
  const punto = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 12), new THREE.MeshBasicMaterial({ color: '#ffb080' })); cab.add(punto);
  cab.position.set(-lo / 2, topY, 0); grupo.add(cab);
  // riel del eje lineal
  const riel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(lm, lo) + 120, 10, 14), metal); riel.position.set(0, topY + foco + 60, -30); grupo.add(riel);
  st.cab = cab; st.haz = haz; st.punto = punto; st.topY = topY;
  // cámara
  const dist = Math.max(lm, lo) * 1.25;
  st.camera.position.set(dist * 0.35, topY + dist * 0.55, dist * 0.9); st.controls.target.set(0, topY * 0.7, 0); st.controls.update();
  prepararTrabajo();
  reiniciar();
}

// ---------- Trabajo y línea de tiempo ----------
function prepararTrabajo() {
  const $ = st.$;
  st.segs = []; st.tiempos = []; st.dur = 0;
  let job;
  try { job = LS.jobs.build(Object.assign({}, LS.jobs.options, { sinRecorte: true })); }
  catch (e) { $('#v-info').innerHTML = 'Sin trabajo para simular: ' + e.message; return; }
  const g = LS.rotaryGeom(), dev = LS.device, rapid = dev.velRapida || 100;
  // coordenadas sobre el objeto: L a lo largo del eje, a = arco desde la línea superior
  const ref = LS.jobs.anchorPoint(job.bbox, LS.jobs.options.ancla);
  const sobre = p => {
    const L = (p[0] - (g.c[0] - g.u[0] * g.lo / 2)) * g.u[0] + (p[1] - (g.c[1] - g.u[1] * g.lo / 2)) * g.u[1];
    const a = (p[0] - g.c[0]) * g.v[0] + (p[1] - g.c[1]) * g.v[1];
    return [L, a];
  };
  let t = 0, fuera = 0;
  for (const s of job.segs) {
    const A = sobre(s.a), B = sobre(s.b), l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const v = (s.on || s.scan) ? (dev.unidadVelocidad === 'mm/min' ? s.F / 60 : s.F) : rapid;
    const d = l / Math.max(0.1, v) + (!s.on && !s.scan && l > 0 ? 0.05 : 0);
    if (s.on && (A[0] < -0.5 || A[0] > g.lo + 0.5 || B[0] < -0.5 || B[0] > g.lo + 0.5)) fuera++;
    const L = LS.D.layer(s.L);
    st.segs.push({ A, B, on: s.on, pot: s.on ? (L.potMin + (L.potMax - L.potMin) * (s.p ?? 1)) / 100 : 0, ancho: L.modo === 'linea' ? 0.15 : Math.max(0.05, L.intervalo) });
    st.tiempos.push(t); t += d;
  }
  st.dur = t;
  const R = LS.rotary, cono = R.forma === 'cono';
  $('#v-info').innerHTML = `${(LS.ROTARY_PRESETS[R.modelo] || {}).nombre || 'Rotativo'} · ${cono ? `cono Ø${R.diamObjeto}→Ø${R.diamObjeto2}` : `cilindro Ø${R.diamObjeto}`} × ${R.largoObjeto} mm · foco ${R.distFoco || 20} mm<br>`
    + `Contorno ${cono ? `${(Math.PI * R.diamObjeto).toFixed(1)}→${(Math.PI * R.diamObjeto2).toFixed(1)}` : (Math.PI * R.diamObjeto).toFixed(1)} mm · duración estimada ${LS.jobs.fmtTime(st.dur)}`
    + (fuera ? `<br><span style="color:#ff8080">Atención: parte del diseño queda fuera del largo del objeto. Use "Centrar diseño en el área".</span>` : '');
}

function diamEn(L) { const f = Math.max(0, Math.min(1, L / st.lo)); return 2 * (st.r1 + (st.r2 - st.r1) * f); }
// posición en la textura: x = vuelta (u), y = largo (canvas fila 0 = extremo final)
function texXY(L, a) {
  const circ = Math.PI * diamEn(L);
  let u = a / circ + 0.5; u -= Math.floor(u);
  return [u * st.tex.width, (1 - L / st.lo) * st.tex.height, u];
}
function pintarFondo() {
  const c = st.tctx; c.globalAlpha = 1; c.fillStyle = st.mat.base; c.fillRect(0, 0, st.tex.width, st.tex.height);
  // reflejo sutil para materiales metálicos
  if (st.mat.metal > 0.5) { const gr = c.createLinearGradient(0, 0, st.tex.width, 0); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)'); c.fillStyle = gr; c.fillRect(0, 0, st.tex.width, st.tex.height); }
  st.texture.needsUpdate = true;
}
function reiniciar(redibujar = true) {
  st.t = 0; st.i = 0; st.parcial = 0; pintarFondo();
  if (redibujar) { st.playing = false; st.$('#v-play').textContent = '▶ Simular'; }
  colocar(st.segs[0] ? st.segs[0].A : [0, 0], false);
}
function quemar(seg, f0, f1) {
  if (!seg.on || f1 <= f0) return;
  const c = st.tctx, P = (f) => [seg.A[0] + (seg.B[0] - seg.A[0]) * f, seg.A[1] + (seg.B[1] - seg.A[1]) * f];
  const a = P(f0), b = P(f1);
  const ta = texXY(a[0], a[1]), tb = texXY(b[0], b[1]);
  if (Math.abs(ta[0] - tb[0]) > st.tex.width / 2) return; // cruza la costura
  c.strokeStyle = st.mat.grabado; c.globalAlpha = 0.35 + 0.65 * Math.min(1, seg.pot * 1.2);
  c.lineWidth = Math.max(1, seg.ancho * st.k * 1.05); c.lineCap = 'butt';
  c.beginPath(); c.moveTo(ta[0], ta[1]); c.lineTo(tb[0], tb[1]); c.stroke();
  st.sucio = true;
}
function avanzarHasta(T) {
  T = Math.min(T, st.dur);
  const n = st.segs.length;
  while (st.i < n) {
    const t0 = st.tiempos[st.i], t1 = st.i + 1 < n ? st.tiempos[st.i + 1] : st.dur;
    const seg = st.segs[st.i];
    const fEnd = t1 > t0 ? Math.min(1, (T - t0) / (t1 - t0)) : 1;
    if (fEnd <= 0) break;
    quemar(seg, st.parcial, fEnd);
    if (fEnd >= 1) { st.i++; st.parcial = 0; } else { st.parcial = fEnd; break; }
  }
  st.t = T;
  const seg = st.segs[Math.min(st.i, n - 1)];
  if (st.t >= st.dur && n) { colocar([st.lo / 2, 0], false); }
  else if (seg) { const f = st.i < n ? st.parcial : 1; colocar([seg.A[0] + (seg.B[0] - seg.A[0]) * f, seg.A[1] + (seg.B[1] - seg.A[1]) * f], seg.on && st.i < n && st.t < st.dur); }
  if (st.sucio) { st.texture.needsUpdate = true; st.sucio = false; }
  st.$('#v-t').value = st.dur ? Math.round(st.t / st.dur * 1000) : 0;
  st.$('#v-tiempo').textContent = `${LS.jobs.fmtTime(st.t)} / ${LS.jobs.fmtTime(st.dur)}`;
}
// Coloca cabezal y giro para el punto (L, a) del objeto
function colocar(p, encendido) {
  const [L, a] = p;
  const [, , u] = texXY(L, a);
  const theta = u * Math.PI * 2;
  st.rotor.rotation.x = -(theta + Math.PI / 2);
  const rObj = diamEn(L) / 2;
  if (st.rodillos.length) st.rodillos.forEach(r => { r.rotation.x = -st.rotor.rotation.x * (Math.max(st.r1, st.r2) / st.rr); });
  if (st.mandril) st.mandril.rotation.x = st.rotor.rotation.x;
  st.cab.position.x = -st.lo / 2 + Math.max(0, Math.min(st.lo, L));
  const on = encendido && st.$('#v-haz').checked;
  st.haz.visible = on; st.punto.visible = on;
}
function bucle() {
  if (!st) return;
  const now = performance.now(), dt = (now - st.last) / 1000; st.last = now;
  if (st.playing) {
    avanzarHasta(st.t + dt * Number(st.$('#v-vel').value));
    if (st.t >= st.dur) { st.playing = false; st.$('#v-play').textContent = '▶ Simular'; }
  }
  st.controls.update(); st.renderer.render(st.scene, st.camera);
  st.raf = requestAnimationFrame(bucle);
}

LS.vista3d = { abrir, cerrar, _estado: () => st, _avanzar: T => avanzarHasta(T) };
