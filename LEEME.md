# Láser Estudio Pro 1.0

Diseño y control para grabadoras/cortadoras láser, en español.

## Instalar
- `LaserEstudioPro-Instalador-1.0.0.exe`: instalador para Windows 10/11 (64 bits).
- `LaserEstudioPro-Portable-1.0.0.exe`: se ejecuta sin instalar.
Windows SmartScreen puede advertir porque el ejecutable no está firmado: "Más información → Ejecutar de todas formas".

## Primeros pasos
1. Editar → Configuración del dispositivo: tipo (GRBL o Ruida), área, origen, valor S máximo.
2. Panel Láser → Conectar (GRBL: elija el puerto COM; Ruida: IP del controlador).
3. Importe (Ctrl+I) SVG, DXF o imagen, o dibuje. Asigne capas con la paleta inferior.
4. Ajuste velocidad, potencia y modo (Línea / Relleno / Imagen) en el panel Capas.
5. Vista previa (Alt+P) → Marco → Iniciar.

## Rotativo (TR3 y otros)
Herramientas → Configuración de rotativo. Elija "Two Trees TR3", escriba el diámetro del
objeto y pulse "Leer" para traer $101 del controlador. Confirme pasos por rotación y
diámetro del rodillo con el manual de su TR3, o use Herramientas → Calibrar rotativo.

## Compilar desde el código
Requiere Node.js 20+:  `npm install`  y luego  `npm start`  (ejecutar) o  `npm run dist`  (instalador).

## Quitar el aviso de SmartScreen
Vea GUIA-SIN-AVISO-SMARTSCREEN.md (publicar gratis en Microsoft Store o firmar el instalador).

## Novedades 1.1
- Rotativo conectado al puerto Y o al puerto Z (máquinas sin motor Z), con asistente de ajustes GRBL ($112, $122, $132) y respaldo.
- Esquema del rotativo en el lienzo: arrastrable, orientable (horizontal/vertical con puerto Z), con medidas y área de grabado desarrollada.
- Objetos cilíndricos y cónicos (vasos/termos cónicos) con corrección por altura.
- Simulación 3D del grabado sobre el objeto y ensayo en la máquina sin láser.
- Máquinas sin finales de carrera: recorte de trabajos y marco al área, límite en movimientos manuales y "Fijar origen aquí" con punto de referencia del lienzo (centro, esquinas o bordes).

## Novedades 1.1.1
- Botón DETENER siempre visible (también sobre diálogos y la vista 3D); atajo Ctrl+Espacio o tecla Pausa. Detiene trabajos, marco, ensayo, pruebas de giro y movimientos conservando la posición.
- Verificación del rotativo con flechas: la app dice qué eje moverá, pregunta qué se movió y corrige sola el puerto (Y/Z) y el sentido de giro. Identificación del conector Y o Z.
- El panel Mover indica qué flechas mueven el cabezal y cuáles giran el rotativo.
- Origen unificado: "Fijar origen aquí" (panel Mover) y la herramienta de mira (clic en el lienzo donde está el láser, con ajuste al centro, esquinas y bordes) mueven el punto verde a esa referencia. Se quitó el "origen de usuario" duplicado.

## Novedades 1.1.2
- Punto verde en rotativo: recorre la circunferencia del objeto (cilindro o cono) dentro del esquema y muestra el ángulo de giro.
- Esquema editable con el ratón: manijas para largo/ancho del módulo, distancia entre rodillos, largo y diámetros del objeto, y botón para girar la orientación.
- Diagnóstico de ejes en el diálogo del rotativo: detecta alarma, errores de GRBL, firmware sin eje Z y fallas físicas; sugiere pasar al puerto Y.
- Compatibilidad con GRBL anterior a 1.1 (movimientos con G0).
- Movimiento en diagonal: teclado en el diálogo del rotativo y teclado numérico (7 8 9 / 4 6 / 1 2 3; 5 detiene).
- Corrección: sin origen fijado ya no se bloquean los movimientos manuales, y el límite nunca invierte la dirección pedida.

## Novedades 1.1.3
- Panel Mover: las flechas mueven siempre el cabezal (X e Y). El rotativo tiene botones propios (⟲ ⟳ y + − del teclado numérico). Con el conector Y, ▲▼ giran el rotativo y se indica.
- Esquema de la máquina: marco, rieles, pórtico y módulo láser que se mueven con la posición real. Modelos Two Trees: TS1 Mini, TTS-55/TTS-10 Pro, TTS 20 Pro, TTS 20 Max, TS2, TS2 Max/40 W y TS3.
- Mostrar/ocultar esquemas de máquina y rotativo: menú Ver (Alt+M, Alt+R), barra de herramientas y panel Láser.
- Indicador de posición con X, Y y ángulo de giro por separado.

## Novedades 1.1.4
- Lectura de posición compatible con GRBL 1.1 y 0.9 (el módulo ahora sigue la posición real en más placas).
- Módulo láser arrastrable con el ratón: desconectado fija la posición de arranque; conectado mueve la máquina; con Mayús indica dónde está el cabezal sin moverlo. Se ajusta a centro, esquinas y bordes.
- Posición de arranque (sin finales de carrera): por defecto esquina inferior izquierda; al conectar una máquina recién encendida se asume automáticamente.
- Marco ajustable: clic en un perfil y arrastre las manijas (márgenes del marco y tamaño del área, conservando la posición real del diseño).
- Escala en los rieles Y, el perfil delantero y la barra del láser, en cm (como la regla de la máquina) o mm. Alt+E alterna.

## Novedades 1.1.5
- La barra del pórtico (eje Y) se arrastra con el ratón y mueve solo en Y.
- Sin conexión, arrastrar el módulo o la barra fija la posición de partida; al conectar se fija siempre como origen.
- Opción "La máquina tiene finales de carrera" (por defecto no): "Inicio" pasa a "Ir a partida". Aviso si la placa tiene $22=1 sin sensores instalados.

## Novedades 1.1.6
- Al conectar, si la placa arranca en ALARMA ($22=1 sin finales de carrera) se desbloquea antes de fijar la posición de partida, y se verifica que el controlador la aceptó.
- Con el rotativo en el conector Y, la barra queda donde se ubicó (ya no salta al rotativo) y al quitar el rotativo se restaura su Y real; el esquema ya no se sale del lienzo.
- Modo "Al arrastrar el módulo: Mueve la máquina / Solo ubica (no mueve)" en los paneles Láser y Mover (Mayús invierte).
- Corrección: con el rotativo en el conector Z, fijar el origen ahora fija X e Y.

## Novedades 1.1.7
- El punto verde queda siempre en el láser; el giro se muestra junto a él y con una marca naranja sobre el objeto.
- El giro es relativo: empieza en 0° al conectar o activar el rotativo, y hay un botón "Giro a 0°" (panel Mover).
- Botón "Alinear rotativo con el láser" (panel Láser).

## Novedades 1.1.8
- Sentido de los ejes configurable: Mover → "Comprobar dirección" (mueve 5 mm y pregunta) o "Invertir Y" / "Invertir X". Corrige a la vez flechas, arrastre del módulo y trabajos (sin grabar en espejo), conservando la posición del cabezal.

## Novedades 1.1.9
- Aviso visible cuando la barra no se mueve porque el rotativo está activado en el conector Y (en la barra del lienzo y en el panel Mover), con botón para desactivarlo.

## Novedades 1.2.0
- Importar imagen en dos pasos (como LaserGRBL): redimensionar suave/nítido, escala de grises (luminosidad, promedio, RGB personalizado), brillo, contraste, blancos, gamma, realce, B&N/umbral, invertir; herramientas Línea a línea, Tramado 1 bit, Vectorizar, Línea central y Passthrough; dirección horizontal/vertical/diagonal, calidad en líneas/mm y vista previa de líneas; girar, reflejar y recortar bordes. Paso 2: velocidad, modo M3/M4, S-MIN/S-MAX, tamaño (DPI/automático) y posición.
- Base de datos de materiales (configuración sugerida): modelo de láser (Two Trees y genéricos), material, grabar o cortar y grosor. Valores propios de partida (no se copió la base de LaserGRBL, que es GPLv3).
- Idiomas: Español, English y Português (menú Idioma o Configurar dispositivo).
- "Fijar origen aquí" ya no mueve el cabezal: el trabajo empieza donde está el láser (contorno naranja). La calibración de posición queda aparte.
- Corregido: "Nuevo" seguía marcando el proyecto como no guardado; Enter confirma las ventanas; ventanas dentro de ventanas; más formatos de imagen (jfif, avif, ico) y aviso para HEIC/TIFF.

## Novedades 1.2.2
- Placas **MKS LS ESP32 — modo de ejes ($45)**: su significado cambia según la versión del firmware (en algunas $45=2 es modo rodillo). La aplicación ya no lo cambia sola: el panel flotante muestra el valor y «Modo…» abre un asistente para enviar 0/1/2 y probar qué se mueve (Y 5 mm y Z 5 mm) tras apagar y encender.
- **Rotativo en el conector Z de placas MKS (modo rodillo)**: nueva opción «Conectado en: Conector Z — modo rodillo de la placa MKS ($45=1)». Al activar el rotativo la app envía $45=1 (▲▼ y ⟲ ⟳ giran el rotativo, escalados con $101 de la placa); al desactivarlo envía $45=0 y la barra Y vuelve a moverse. Si el cambio no se aplica, apague y encienda la máquina. En este modo los botones Z ▲▼ se ocultan (la salida Z de la placa no se mueve por separado) y, si la placa vuelve a $45=0 (por ejemplo al escribirlo en la consola), el panel flotante lo avisa con el botón «Poner $45=1». Como el firmware solo aplica $45 al arrancar, la app reinicia la placa sola ([ESP444]RESTART) al activar o quitar el rotativo, sin apagar ni reconectar a mano; conserva la ubicación (si la placa se reinicia, restaura X/Y), espera a que termine el cambio antes de mover o iniciar un ensayo, y desactiva los límites por software ($20=0) mientras el rotativo está activo para que la placa no rechace el giro (se restauran al quitarlo).
- **Trabajo por partes para imágenes grandes (nuevo)**: Láser → «Trabajo por partes» (Automático / Siempre / Nunca), «Alto de cada parte» y «Descanso entre partes». Las imágenes grandes se dividen en franjas: cada parte se prepara, se envía (o se sube a la tarjeta SD por WiFi), se graba y vuelve al punto de partida; tras el descanso sigue la siguiente, todas alineadas con el anclaje del trabajo completo. El botón «Seguir ya» acorta el descanso y DETENER cancela las partes restantes. La imagen se procesa una sola vez y el marco ya no recorre todos los píxeles (es instantáneo).
- **Corregido «Maximum call stack size exceeded»** al enviar trabajos de cientos de miles de líneas (por cable o WiFi sin tarjeta): la cola de envío ahora lee el trabajo con un índice, sin copiarlo, y arranca al instante.
- **WiFi con archivos grandes**: el G-code que se sube a la tarjeta va compacto (sin espacios ni G1 repetido, ~25 % menos), el tiempo de subida se ajusta al tamaño, y si la placa suelta el WiFi mientras recibe el archivo la app espera a que termine la subida, reconecta y recién entonces inicia (antes se conectaba y reconectaba sin arrancar).
- **Zona parcial (nuevo, herramienta ⬚ de la barra izquierda o tecla Z)**: se dibuja un recuadro sobre el lienzo y solo se graba o corta lo que queda dentro, sin modificar el diseño. Sirve para repasar o reforzar una parte que quedó mal marcada (por ejemplo, una placa inclinada). El punto de anclaje se calcula con el diseño completo, así la zona cae exactamente donde estaba; en los bordes se agrega sobrebarrido para que la intensidad sea pareja. Se quita en Láser → Zona parcial → «Quitar zona». El marco y el ensayo también usan solo la zona.
- **Simulación del rotativo (nuevo)**: Láser → «🎞 Simular giro de la pieza» (o en el panel flotante). Muestra la pieza de frente (cilindro recto o cono) formándose el grabado al ritmo del trabajo, con una vista plana tipo papel y una flecha con el sentido de giro (con ▲ la parte de arriba gira hacia usted), para compararla con la máquina y detectar si hay que invertir el giro.
- **Grabado en espejo con rotativo**: el panel flotante trae la casilla «Invertir giro (si sale en espejo)» junto a ⟲ ⟳ para corregir el sentido de giro sin abrir diálogos.
- **Ensayo sin láser por WiFi**: igual que el trabajo, se guarda primero en la tarjeta SD de la placa y se ejecuta desde ella (sin cortes ni pérdida de ubicación).
- Rotativo: con la máquina conectada el giro se calcula con los pasos/mm reales de la placa ($101/$102).
- **Rotativo: velocidad corregida**. El avance (F) de los movimientos de giro se escala igual que la distancia, para que la velocidad sobre la superficie sea la de la capa (antes el motor del rotativo recibía hasta ~7 veces más pasos por segundo y solo vibraba). Giro manual limitado a 20 mm/s de superficie. Panel flotante: "Barra ▲/▼" para mover la barra Y con el rotativo en el conector Z.
- Panel flotante: botones **Z ▲ / Z ▼** cuando el conector Z está libre; con el rotativo en Z se muestran los botones de giro ⟲ ⟳ con la indicación "Rotativo en el conector Z".
- Panel flotante: **Fijar origen aquí, Marco luz, Disparo de prueba (mantener) e Iniciar**. Activar el rotativo (icono o casilla) ya no mueve la barra ni la posición del láser en el esquema.
- **Topes cruzados**: si el tope de X llega por la entrada Y (y viceversa), la búsqueda de inicio se detiene igual al tocarlo, lo detecta y lo corrige sola; los indicadores muestran el tope físico. Restablecer en Dispositivo.
- **Movimientos manuales y topes**: si al mover con las flechas se toca un tope, el movimiento se detiene y esa posición queda como límite del eje (no deja seguir empujando hacia él); si es el tope configurado, el esquema muestra el láser en ese borde, y con los dos topes tocados queda fijado el origen. Con el origen solo supuesto al encender, el área no bloquea los movimientos (se puede ir hacia la derecha y hacia abajo para buscar los topes).
- Búsqueda de inicio **guiada por la app por defecto** (el homing del firmware MKS no se detenía en el tope); no se puede iniciar dos veces; DETENER la corta al instante; con el método de firmware se espera la respuesta real de cada eje. ALARM:6 explicada.
- Controles flotantes: casilla **"Origen con topes"**, estado en vivo de los topes X/Y (rojo = activado) y botón **⌂ Buscar**. Método de búsqueda elegible: firmware ($HX/$HY) o guiado por la app (avanza hasta ver el tope activo).
- **Velocidades seguras**: la búsqueda de inicio usa 600 mm/min y aproximación fina de 100 mm/min (configurables; si la placa tenía valores más altos se bajan). "Ir a partida" e "Ir a coordenada" usan G1 a velocidad moderada en lugar de G0 (máxima).
- Al desconectarse (cable o WiFi) el esquema vuelve a la posición de partida en lugar de quedarse en la última posición. El icono del rotativo lo activa si estaba desactivado.
- **Finales de carrera con ubicación**: en Dispositivo se indica dónde está cada tope (X izquierda/derecha, Y delante/atrás); se dibujan en el esquema (se ponen en rojo al pulsarlos). **Inicio** busca primero X y luego Y ($HX/$HY, o búsqueda guiada si el firmware no los tiene) y fija esa esquina como origen (0,0). "Aplicar ajustes de inicio a la placa" envía $22/$23/$24–$27 calculando el sentido.
- **Controles de movimiento flotantes** sobre el lienzo (arrastrables, Ver → Alt+J): flechas con diagonales, Inicio, ir a una coordenada X/Y, Fijar origen, Marco con luz, Detener y posición.
- **Grabar desde la tarjeta SD de la placa** (conexión WiFi): el trabajo se sube a la microSD por el servidor web de la placa (POST /upload) y se ejecuta desde ahí ([ESP220] o $SD/Run=), con avance en vivo; sin cortes ni pérdida de intensidad aunque el WiFi sea débil. El envío directo por WiFi vuelve a ser con búfer (fluido) por defecto.
- **Material: recuerda la última configuración** (láser, material, acción, grosor y los valores editados) y la propone al volver a abrir.
- **WiFi estable**: si la conexión se corta durante un trabajo, la aplicación reconecta sola (hasta ~30 s) y continúa desde la línea pendiente; si la placa se reinició, cancela y avisa. Envío "seguro" (una línea a la vez, por defecto) o "rápido" (búfer); consulta de estado más espaciada por WiFi.
- **Acerca de** muestra la versión real (1.2.2), las novedades y el firmware de la placa conectada. **Ayuda → Buscar actualizaciones…** consulta la lista oficial de firmware de Makerbase (GitHub) y la compara con la de su placa.
- **Ayuda → Actualizar firmware de la placa…** (ESP32, con esptool-js de Espressif): copia de seguridad completa de la memoria, escritura en 0x0 (imagen completa) o 0x10000 (solo aplicación), verificación MD5 y reinicio; "Restaurar copia…" y "Restaurar ajustes" ($$ guardados antes de actualizar).
- WiFi en placas **MKS LS ESP32**: el asistente usa $53 (red), $54 (contraseña) y $50=2 (modo red de casa); botón para volver a la red propia ($50=1).
- **Conexión por WiFi** (placas ESP32 como MKS DLC32 / LS ESP32 PRO): en Láser → Conexión elija "WiFi" y la IP de la placa (Telnet: puerto 8080 en MKS DLC32, 23 en otras). Asistente "WiFi…": muestra la red y la IP que informa la placa, la une a la WiFi de su casa ([ESP100]/[ESP101]/[ESP110]) y guarda la dirección.
- **Prueba de finales de carrera**: el "?" enviado desde la Consola ahora muestra la respuesta del controlador y los pines activos (Pn). Nueva casilla "Mostrar finales de carrera en vivo" y aviso "Tope X/Y" en la barra de estado.
- **Marco con luz y disparo de prueba** (pestaña Láser): "▣ Marco con luz" recorre el contorno del trabajo con el láser a baja intensidad (máx. 5 %) para ver sobre el material dónde se grabará o cortará; viaja a la primera esquina con el láser apagado, permite varias vueltas y vuelve al punto de partida. "● Disparo de prueba (mantener)" enciende la luz en la posición actual mientras se mantiene pulsado. Opción para que el botón "Marco" normal también use la luz. El disparo de prueba ahora funciona con el modo láser de GRBL ($32=1).
- **El contenido manda la posición**: el texto, la imagen o las formas se graban, cortan y enmarcan **donde están colocados en el lienzo**. "Fijar origen aquí" ya no traslada el diseño al origen: solo indica en qué punto del lienzo está físicamente el láser (referencia de partida). Con el rotativo, el eje lineal también sigue la posición del diseño y el giro parte de la posición actual del objeto.
- Al terminar un trabajo con "Volver al origen" activo, el cabezal vuelve al punto de donde partió.
- **Marco y Ensayo vuelven siempre al punto de partida**: al terminar, el cabezal regresa a donde estaba antes de pulsar el comando (en cualquier modo de origen y con el rotativo), así "Fijar origen aquí" después del marco queda donde dejó el láser.
- **Configuración de material editable**: en "Selecciona tu configuración" la potencia, velocidad, pasadas, intervalo y modo vienen con los valores sugeridos por defecto, pero se pueden cambiar antes de aplicar. Con "Guardar estos valores como míos" quedan como sus valores para ese láser/material/acción (★); "↺ Sugeridos" vuelve a los de la aplicación.
- **Materiales para textos y cualquier objeto**: botón **🗄 Material…** en la barra superior (aplica a la capa de lo seleccionado) y **🗄 Elegir material…** en el cuadro de texto.
- Al seleccionar un objeto, la capa activa y el panel de Capas pasan a la capa de ese objeto.

## Novedades 1.2.1
- Corregido: "Iniciar" no arrancaba cuando la placa quedaba en ALARMA ($22=1 sin finales de carrera): todas las líneas se rechazaban (error:9) sin aviso. Ahora se desbloquea ($X) al conectar, después de DETENER y antes de cada trabajo, marco o ensayo.
- Si el controlador rechaza el inicio del trabajo, se cancela y se explica la causa; si deja de responder 15 s, se avisa.
- Ofrece desactivar la búsqueda de inicio en la placa ($22=0) cuando la máquina no tiene finales de carrera.
- Aviso "Trabajo iniciado" con líneas y tiempo estimado.
