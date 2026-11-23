# Láser Estudio Pro

Aplicación de escritorio para Windows, en español, para diseñar y controlar grabadoras/cortadoras láser (tipo LightBurn Pro). Hecha con Electron.

**Versión actual: 1.2.2**

## Qué hace
- Diseño: importar SVG, DXF e imágenes; dibujar formas y texto; capas en modo Línea, Relleno o Imagen.
- Control de máquinas **GRBL** (USB o WiFi) y **Ruida**.
- Base de materiales con valores sugeridos y editables.
- Marco con luz baja y disparo de prueba.
- Origen con finales de carrera (búsqueda guiada X y luego Y, con detección de topes cruzados).
- Panel flotante de movimiento: flechas, fijar origen, ir a coordenada, marco con luz, disparo, iniciar.
- Trabajos por WiFi guardados en la tarjeta SD de la placa (sin cortes).
- **Rotativo** (Two Trees TR3 y otros): puerto Y, puerto Z o *modo rodillo* de placas MKS (`$45=1`), con reinicio automático de la placa y ubicación conservada.
- **Simulación del rotativo**: cilindro recto o cono, con vista plana tipo papel y sentido de giro.
- **Zona parcial**: grabar o cortar solo una parte del diseño sin modificarlo.
- Actualización de firmware de placas MKS DLC32 / LS ESP32 (con respaldo previo).

Máquina de referencia: Two Trees TTS-55 con placa Makerbase MKS LS ESP32 PRO.

## Documentación
- [LEEME.md](LEEME.md): guía de uso e historial de novedades por versión.
- [GUIA-SIN-AVISO-SMARTSCREEN.md](GUIA-SIN-AVISO-SMARTSCREEN.md): cómo evitar el aviso de SmartScreen.
- [docs/hardware](docs/hardware): conexión y montaje de los finales de carrera, y soportes imprimibles (STL).
- Capturas: [simulación del rotativo](docs/simulacion-rotativo.png), [zona parcial](docs/zona-parcial.png).

## Compilar
Requiere Node.js 20 o superior.
```
npm install
npm start          # ejecutar
npm run dist       # instalador y portable para Windows (carpeta dist/)
```
