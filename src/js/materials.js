// Base de datos de materiales: valores de partida según modelo de láser, material, acción y grosor.
// Valores propios de referencia para láser de diodo (potencia óptica de referencia 10 W), escalados según
// la potencia de cada modelo. Son un punto de partida: confírmelos siempre con la prueba de materiales.
(function (LS) {
  const M = {};
  // potencia óptica (W) de cada modelo y velocidad máxima de grabado razonable (mm/min)
  M.LASERS = {
    tts55: { nombre: 'Two Trees TTS-55 / TTS-55 Pro (5,5 W)', w: 5.5, vmax: 6000 },
    tts10: { nombre: 'Two Trees TTS-10 Pro (10 W)', w: 10, vmax: 6000 },
    tts20: { nombre: 'Two Trees TTS 20 Pro / 20 Max (20 W)', w: 20, vmax: 10000 },
    ts1: { nombre: 'Two Trees TS1 Mini (3 W)', w: 3, vmax: 3000 },
    ts2_10: { nombre: 'Two Trees TS2 10 W', w: 10, vmax: 10000 },
    ts2_20: { nombre: 'Two Trees TS2 20 W', w: 20, vmax: 12000 },
    ts2_40: { nombre: 'Two Trees TS2 40 W / Max', w: 40, vmax: 15000 },
    ts3: { nombre: 'Two Trees TS3 (10 W)', w: 10, vmax: 10000 },
    d5: { nombre: 'Diodo genérico 5 W', w: 5, vmax: 6000 },
    d10: { nombre: 'Diodo genérico 10 W', w: 10, vmax: 10000 },
    d20: { nombre: 'Diodo genérico 20 W', w: 20, vmax: 12000 },
    d40: { nombre: 'Diodo genérico 40 W', w: 40, vmax: 15000 }
  };
  // modelo de máquina (esquema) -> modelo de láser sugerido
  M.DESDE_MAQUINA = { tts55: 'tts55', tts20pro: 'tts20', tts20max: 'tts20', ts1: 'ts1', ts2: 'ts2_10', ts2max: 'ts2_40', ts3: 'ts3' };

  // Referencia a 10 W. grabar: [potencia %, velocidad mm/min, pasadas, intervalo mm]
  // cortar: { grosor_mm: [potencia %, velocidad mm/min, pasadas] }
  M.MATERIALES = {
    contrachapado: { nombre: 'Madera contrachapada', grabar: [70, 4000, 1, 0.1], cortar: { 1.5: [100, 500, 1], 3: [100, 300, 2], 5: [100, 200, 4] } },
    pino: { nombre: 'Madera maciza (pino, cedro)', grabar: [65, 4000, 1, 0.1], cortar: { 3: [100, 250, 2], 5: [100, 180, 4] } },
    balsa: { nombre: 'Madera balsa', grabar: [30, 5000, 1, 0.1], cortar: { 2: [100, 800, 1], 3: [100, 600, 1], 5: [100, 400, 2] } },
    mdf: { nombre: 'MDF', grabar: [70, 3500, 1, 0.1], cortar: { 2: [100, 300, 2], 3: [100, 250, 3] } },
    bambu: { nombre: 'Bambú', grabar: [65, 3500, 1, 0.1], cortar: { 3: [100, 250, 3] } },
    cuero: { nombre: 'Cuero natural', grabar: [40, 6000, 1, 0.1], cortar: { 1.5: [100, 500, 1], 2: [100, 400, 2], 3: [100, 300, 3] } },
    cuerosint: { nombre: 'Cuero sintético (PU) — evite PVC', grabar: [30, 6000, 1, 0.1], cortar: { 1: [100, 700, 1] } },
    acrilnegro: { nombre: 'Acrílico negro u opaco (transparente no apto para diodo)', grabar: [60, 3000, 1, 0.1], cortar: { 2: [100, 200, 4], 3: [100, 150, 6] } },
    carton: { nombre: 'Cartón', grabar: [30, 6000, 1, 0.1], cortar: { 2: [100, 1000, 1], 3: [100, 700, 1], 5: [100, 500, 2] } },
    papel: { nombre: 'Papel y cartulina', grabar: [15, 6000, 1, 0.1], cortar: { 0.3: [100, 2000, 1], 0.5: [100, 1500, 1] } },
    corcho: { nombre: 'Corcho', grabar: [40, 6000, 1, 0.1], cortar: { 2: [100, 800, 1], 3: [100, 600, 2] } },
    fieltro: { nombre: 'Fieltro y tela (algodón, jean)', grabar: [30, 6000, 1, 0.1], cortar: { 1: [100, 1500, 1], 3: [100, 800, 1] } },
    goma: { nombre: 'Goma EVA (foamy)', grabar: [25, 6000, 1, 0.1], cortar: { 2: [100, 1000, 1], 3: [100, 800, 1] } },
    pizarra: { nombre: 'Pizarra', grabar: [80, 3000, 1, 0.1] },
    inox: { nombre: 'Acero inoxidable (grabado oscuro)', grabar: [100, 800, 2, 0.05] },
    anodizado: { nombre: 'Aluminio anodizado', grabar: [80, 3000, 1, 0.08] },
    pintado: { nombre: 'Metal pintado / termo con pintura en polvo', grabar: [70, 3000, 1, 0.08] },
    ceramica: { nombre: 'Azulejo o cerámica (con pintura)', grabar: [100, 1000, 1, 0.08] },
    vidrio: { nombre: 'Vidrio (con pintura o cinta)', grabar: [100, 1500, 1, 0.08] },
    piedra: { nombre: 'Piedra / mármol oscuro', grabar: [90, 2000, 1, 0.08] }
  };

  // Calcula la configuración sugerida para un modelo de láser
  M.sugerir = (laserId, matId, accion, grosor) => {
    const L = M.LASERS[laserId] || M.LASERS.d10, m = M.MATERIALES[matId];
    if (!m) return null;
    const k = 10 / L.w; // más potencia => menos porcentaje o más velocidad
    if (accion === 'grabar') {
      if (!m.grabar) return null;
      const [p, v, n, iv] = m.grabar;
      // energía por mm constante: potencia% · W / velocidad. Primero se aprovecha la velocidad, luego la potencia.
      let pot, vel;
      if (k >= 1) { pot = p * k; vel = v; if (pot > 100) { vel = v * 100 / pot; pot = 100; } } // menos potente: sube potencia, luego baja velocidad
      else { vel = Math.min(L.vmax, v / k); pot = p * k * vel / v; }                         // más potente: sube velocidad, luego baja potencia
      if (vel > L.vmax) { pot = pot * L.vmax / vel; vel = L.vmax; }
      return { potencia: Math.round(Math.min(100, pot)), velocidad: Math.round(vel / 50) * 50, pasadas: n, intervalo: iv, modo: 'relleno', aviso: null };
    }
    if (!m.cortar) return null;
    const g = grosor != null ? grosor : Object.keys(m.cortar)[0];
    const c = m.cortar[g]; if (!c) return null;
    const [p, v, n] = c;
    // en corte se mantiene la velocidad y se ajustan las pasadas a la potencia
    const pasadas = Math.max(1, Math.ceil(n * k - 0.15));
    let aviso = null;
    if (pasadas > 12) aviso = 'Este grosor necesita demasiadas pasadas para esta potencia; use un material más delgado o un láser más potente.';
    return { potencia: p, velocidad: Math.round(v / 10) * 10, pasadas, intervalo: 0.1, modo: 'linea', aviso };
  };
  LS.materialDB = M;
})(window.LS);
