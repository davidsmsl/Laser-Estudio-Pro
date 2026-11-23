// Idiomas de la interfaz: Español (base), English, Português.
// Traduce en vivo los textos, títulos y marcadores de la página usando el diccionario; lo que no
// está en el diccionario se queda en español.
(function () {
  const LS = window.LS = window.LS || {};
  const IDIOMAS = { es: 'Español', en: 'English', pt: 'Português' };
  const DICT = window.LS_I18N_DICT || [];
  const mapas = { en: new Map(), pt: new Map() };
  DICT.forEach(([es, en, pt]) => { mapas.en.set(es, en); mapas.pt.set(es, pt); });
  // textos con números o datos variables
  const PAT = [
    [/^Capa (\d+) — clic: asignar a la selección$/, 'Layer $1 — click: assign to selection', 'Camada $1 — clique: atribuir à seleção'],
    [/^Intervalo \(mm\) — (\d+) DPI$/, 'Interval (mm) — $1 DPI', 'Intervalo (mm) — $1 DPI'],
    [/^(\d+) DPI · intervalo ([\d.]+) mm$/, '$1 DPI · interval $2 mm', '$1 DPI · intervalo $2 mm'],
    [/^(\d+) pasadas$/, '$1 passes', '$1 passadas'],
    [/^Pasos por rotación actuales: (.+)$/, 'Current steps per rotation: $1', 'Passos por rotação atuais: $1'],
    [/^S máximo del controlador: (.+)$/, 'Controller max S: $1', 'S máximo do controlador: $1'],
    [/^Origen fijado en X (.+) Y (.+) mm$/, 'Origin set at X $1 Y $2 mm', 'Origem definida em X $1 Y $2 mm'],
    [/^(\d+) objetos$/, '$1 objects', '$1 objetos'],
    [/^Circunferencia (.+) mm · área desarrollada (.+) mm · factor (.): (.+)$/, 'Circumference $1 mm · unrolled area $2 mm · factor $3: $4', 'Circunferência $1 mm · área desenvolvida $2 mm · fator $3: $4'],
    [/^Contorno (.+) mm · duración estimada (.+)$/, 'Outline $1 mm · estimated time $2', 'Contorno $1 mm · duração estimada $2'],
    [/^(.+) · puerto (.) · eje (horizontal|vertical) · Ø (.+) × (.+) mm · circunferencia (.+) mm$/, '$1 · port $2 · $3 axis · Ø $4 × $5 mm · circumference $6 mm', '$1 · porta $2 · eixo $3 · Ø $4 × $5 mm · circunferência $6 mm'],
    [/^Movimiento enviado: (.+)$/, 'Move sent: $1', 'Movimento enviado: $1'],
    [/^Se aplicará a la capa: (.+)$/, 'Will be applied to layer: $1', 'Será aplicado à camada: $1'],
    [/^Configuración aplicada a la capa (.+)\.$/, 'Settings applied to layer $1.', 'Configuração aplicada à camada $1.'],
    [/^Referencia fijada: el láser está en X (.+)  Y (.+) del lienzo\. El diseño se grabará y enmarcará donde está colocado\.$/, 'Reference set: the laser is at X $1  Y $2 on the canvas. The design will be engraved and framed where it is placed.', 'Referência definida: o laser está em X $1  Y $2 da tela. O desenho será gravado e emoldurado onde está colocado.'],
    [/^Referencia de partida en X (.+)  Y (.+): al conectar se tomará como la posición del láser\. El diseño se grabará donde está en el lienzo\.$/, 'Start reference at X $1  Y $2: on connect it will be taken as the laser position. The design will be engraved where it is on the canvas.', 'Referência de partida em X $1  Y $2: ao conectar será tomada como a posição do laser. O desenho será gravado onde está na tela.'],
    [/^Marco con luz al (.+) %: mire el contorno sobre el material\. Al terminar vuelve al punto de partida\.$/, 'Light frame at $1 %: watch the outline on the material. It returns to the start point when done.', 'Moldura com luz a $1 %: observe o contorno no material. Ao terminar volta ao ponto de partida.'],
    [/^Final de carrera \/ pin activo: (.+)$/, 'Limit switch / active pin: $1', 'Fim de curso / pino ativo: $1'],
    [/^→ Pines activos \(Pn\): (.+)$/, '→ Active pins (Pn): $1', '→ Pinos ativos (Pn): $1'],
    [/^Conectando por WiFi a (.+)…$/, 'Connecting via WiFi to $1…', 'Conectando por WiFi a $1…'],
    [/^Conexión por WiFi a (.+)\. Pulse Conectar\.$/, 'WiFi connection to $1. Press Connect.', 'Conexão por WiFi a $1. Pressione Conectar.'],
    [/^Tope de (.) detectado en la entrada (.): corregido automáticamente\.$/, '$1 switch detected on input $2: corrected automatically.', 'Fim de curso $1 detectado na entrada $2: corrigido automaticamente.'],
    [/^Importado: (.+)$/, 'Imported: $1', 'Importado: $1'],
    [/^Sin título( •)? — Láser Estudio Pro$/, 'Untitled$1 — Laser Studio Pro', 'Sem título$1 — Laser Estúdio Pro'],
    [/^(.+?)( •)? — Láser Estudio Pro$/, '$1$2 — Laser Studio Pro', '$1$2 — Laser Estúdio Pro']
  ];
  let idioma = 'es';
  try { idioma = localStorage.getItem('ls.idioma') || 'es'; } catch (e) { }
  if (!IDIOMAS[idioma]) idioma = 'es';

  const traducir = (s, l = idioma) => {
    if (l === 'es' || !s) return s;
    const core = s.trim(); if (!core) return s;
    let r = mapas[l].get(core);
    if (r == null) for (const [re, en, pt] of PAT) if (re.test(core)) { r = core.replace(re, l === 'en' ? en : pt); break; }
    return r == null ? s : s.replace(core, r);
  };
  LS.t = s => traducir(s);
  LS.idioma = () => idioma;
  LS.IDIOMAS = IDIOMAS;

  // --- traducción del DOM ---
  const ORIG = '__es', TRAD = '__tr';
  function textoNodo(n) {
    const v = n.nodeValue;
    if (n[TRAD] !== undefined && v === n[TRAD]) return; // ya traducido por nosotros
    n[ORIG] = v; const t = traducir(v); n[TRAD] = t; if (t !== v) n.nodeValue = t;
  }
  function atributos(el) {
    for (const a of ['title', 'placeholder']) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const v = el.getAttribute(a), k = '__tr_' + a;
      if (el[k] !== undefined && v === el[k]) continue;
      el['__es_' + a] = v; const t = traducir(v); el[k] = t; if (t !== v) el.setAttribute(a, t);
    }
  }
  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) return textoNodo(raiz);
    if (raiz.nodeType !== 1 || raiz.tagName === 'SCRIPT' || raiz.tagName === 'STYLE') return;
    atributos(raiz);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) { if (n.parentElement && !/SCRIPT|STYLE/.test(n.parentElement.tagName)) textoNodo(n); } else atributos(n); }
  }
  // al cambiar de idioma se restauran los originales y se traduce de nuevo
  function retraducir() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n[ORIG] !== undefined && n.nodeValue === n[TRAD]) n.nodeValue = n[ORIG]; n[TRAD] = undefined; }
      else for (const a of ['title', 'placeholder']) { if (n['__es_' + a] !== undefined && n.getAttribute(a) === n['__tr_' + a]) n.setAttribute(a, n['__es_' + a]); n['__tr_' + a] = undefined; }
    }
    if (idioma !== 'es') recorrer(document.body);
    document.documentElement.lang = idioma;
  }
  let obs = null;
  function observar() {
    if (obs) return;
    obs = new MutationObserver(muts => {
      if (idioma === 'es') return;
      for (const m of muts) {
        if (m.type === 'characterData') textoNodo(m.target);
        else if (m.type === 'attributes') atributos(m.target);
        else m.addedNodes.forEach(recorrer);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  }
  LS.setIdioma = l => {
    if (!IDIOMAS[l]) return;
    idioma = l; try { localStorage.setItem('ls.idioma', l); } catch (e) { }
    retraducir();
    if (window.nativo && window.nativo.setIdioma) window.nativo.setIdioma(l);
    LS.V && LS.V.redraw && LS.V.redraw();
    LS.ui && LS.ui.updateTitle && LS.ui.updateTitle();
  };
  // título de la ventana
  const tituloOrig = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  Object.defineProperty(document, 'title', { get() { return tituloOrig.get.call(document); }, set(v) { tituloOrig.set.call(document, traducir(v)); } });

  document.addEventListener('DOMContentLoaded', () => {
    observar();
    if (window.nativo && window.nativo.setIdioma) window.nativo.setIdioma(idioma);
    if (idioma !== 'es') setTimeout(retraducir, 0);
  });
  if (document.readyState !== 'loading') { observar(); if (idioma !== 'es') setTimeout(retraducir, 0); }
})();
