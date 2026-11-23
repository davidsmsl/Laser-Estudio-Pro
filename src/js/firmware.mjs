// Actualización del firmware de placas ESP32 (MKS DLC32 / LS ESP32 PRO) con esptool-js (Espressif).
// Flujo seguro: copia completa de la memoria actual → escritura en 0x0 → verificación MD5 → reinicio.
import { ESPLoader, Transport } from '../../node_modules/esptool-js/bundle.js';

// MD5 (RFC 1321) sobre una cadena binaria (un carácter = un byte)
function md5(s) {
  const k = [], r = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  const n = s.length, words = new Int32Array(((n + 8 >> 6) + 1) * 16);
  for (let i = 0; i < n; i++) words[i >> 2] |= (s.charCodeAt(i) & 255) << (i % 4 * 8);
  words[n >> 2] |= 0x80 << (n % 4 * 8);
  words[words.length - 2] = n * 8; words[words.length - 1] = Math.floor(n / 536870912);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let j = 0; j < words.length; j += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const t = d; d = c; c = b;
      const x = (a + f + k[i] + words[j + g]) | 0, sh = r[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << sh) | (x >>> (32 - sh)))) | 0; a = t;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map(v => { let h = ''; for (let i = 0; i < 4; i++) h += ((v >>> (i * 8)) & 255).toString(16).padStart(2, '0'); return h; }).join('');
}
const aCadena = u8 => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return s; };

const F = {
  md5, aCadena,
  // Conecta con el cargador del ESP32 (el puerto lo elige el usuario)
  async conectar({ baudios = 460800, log = () => { } } = {}) {
    const port = await navigator.serial.requestPort();
    const transport = new Transport(port, false);
    const terminal = { clean() { }, writeLine: t => log(t), write: t => log(t) };
    const loader = new ESPLoader({ transport, baudrate: baudios, romBaudrate: 115200, terminal });
    const chip = await loader.main();
    let flash = 4 * 1024 * 1024;
    try { const fs = await loader.getFlashSize(); if (fs > 0) flash = fs * 1024; } catch (e) { }
    return { loader, transport, chip, flash };
  },
  async leer(ses, progreso = () => { }) {
    const total = ses.flash; const datos = await ses.loader.readFlash(0, total, (pkt, leido) => progreso(leido / total));
    return datos;
  },
  async escribir(ses, bin, progreso = () => { }, direccion = 0) {
    const datos = aCadena(bin);
    await ses.loader.writeFlash({
      fileArray: [{ data: datos, address: direccion }], flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true, reportProgress: (i, w, t) => progreso(w / t), calculateMD5Hash: md5
    });
    // verificación independiente: MD5 calculado por el chip sobre lo escrito
    const enChip = await ses.loader.flashMd5sum(direccion, bin.length);
    return { ok: enChip === md5(datos), md5: md5(datos), enChip };
  },
  async cerrar(ses, reiniciar = true) {
    try { if (reiniciar) await ses.loader.after('hard_reset'); } catch (e) { }
    try { await ses.transport.disconnect(); } catch (e) { }
  }
};
// Dónde va el archivo: imagen completa (cargador en 0x1000) → 0x0; solo la aplicación → 0x10000
F.direccion = bin => {
  if (bin.length > 0x1000 && bin[0x1000] === 0xE9) return 0x0;
  if (bin[0] === 0xE9) return 0x10000;
  return null;
};
window.LS = window.LS || {}; window.LS.firmware = F;
