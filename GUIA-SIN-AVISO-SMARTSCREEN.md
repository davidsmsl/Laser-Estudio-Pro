# Cómo quitar el aviso de SmartScreen y "Editor desconocido"

El aviso aparece porque el instalador no tiene **firma digital** de un editor reconocido.
Ningún cambio en el código del programa lo elimina: Windows exige una firma emitida por
una entidad de confianza. Hay tres caminos, del más recomendado al más rápido.

## Opción A — Microsoft Store (gratis, recomendada)
Microsoft firma el paquete; al instalar desde la Tienda **no aparece ningún aviso**.

1. Cree una cuenta de desarrollador individual en Partner Center (sin costo; se verifica
   con documento de identidad y una selfie).
2. Reserve el nombre de la app (ej. "Láser Estudio Pro").
3. En *Administración de productos → Identidad del producto* copie los tres valores:
   `Package/Identity/Name`, `Package/Identity/Publisher` y `PublisherDisplayName`.
4. En su PC con Windows 10/11 (con Node.js 20+ y el Windows SDK instalados), abra la
   carpeta del proyecto y ejecute **PUBLICAR-EN-TIENDA.bat**. La primera vez abre
   `tienda.json` para pegar esos valores; la segunda genera el paquete en `dist`.
5. Suba el `.appx` en Partner Center, complete la ficha (descripción, capturas, edad)
   y envíe a certificación.

Nota: en la certificación declare que la app usa puertos serie (USB) y red local para
controlar máquinas láser.

## Opción B — Certificado de firma de código (instalador propio)
Para seguir distribuyendo el `.exe` por su cuenta:
- Compre un certificado de firma de código (OV) a una autoridad reconocida, o use
  Microsoft Artifact Signing si su país y tipo de cuenta son elegibles.
- Siga las instrucciones al inicio de `scripts/construir-firmado.js` y ejecute
  `npm run firmado`.
- Resultado: el aviso mostrará **su nombre** en vez de "Editor desconocido". SmartScreen
  puede seguir avisando durante semanas hasta que el certificado gane reputación con
  descargas; un certificado EV ya no elimina esto de inmediato.

## Opción C — Solo en sus equipos o en la entidad (inmediato)
- Antes de ejecutar: clic derecho en el `.exe` → *Propiedades* → marque **Desbloquear**
  → Aceptar. O en PowerShell:
  `Unblock-File "$env:USERPROFILE\Downloads\LaserEstudioPro-Instalador-1.0.0.exe"`
- En una entidad con área de TI, ellos pueden firmarlo con la CA interna o autorizarlo
  para todos los equipos administrados.
