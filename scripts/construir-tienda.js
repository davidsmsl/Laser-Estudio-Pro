// Genera el paquete MSIX para publicar en Microsoft Store.
// La Tienda lo firma con el certificado de Microsoft: quienes lo instalen desde allí
// no ven el aviso de SmartScreen ni "Editor desconocido".
// Requiere Windows 10/11 con el Windows SDK (makeappx) instalado.
const fs = require('fs');
const path = require('path');
const builder = require('electron-builder');

const cfgPath = path.join(__dirname, '..', 'tienda.json');
if (!fs.existsSync(cfgPath)) {
  console.error('Falta tienda.json. Copie tienda.ejemplo.json como tienda.json y complete los datos de Partner Center.');
  process.exit(1);
}
const t = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
for (const k of ['identityName', 'publisher', 'publisherDisplayName']) {
  if (!t[k] || /COMPLETAR/.test(t[k])) { console.error(`Complete "${k}" en tienda.json (Partner Center → Identidad del producto).`); process.exit(1); }
}
if (process.platform !== 'win32') { console.error('El paquete MSIX solo se puede generar en Windows 10/11.'); process.exit(1); }

builder.build({
  targets: builder.Platform.WINDOWS.createTarget(['appx'], builder.Arch.x64),
  config: {
    appx: {
      identityName: t.identityName,
      publisher: t.publisher,
      publisherDisplayName: t.publisherDisplayName,
      applicationId: 'LaserEstudioPro',
      displayName: t.displayName || 'Láser Estudio Pro',
      backgroundColor: '#20242C',
      languages: ['es-CO', 'es-ES'],
      showNameOnTiles: true,
      artifactName: 'LaserEstudioPro-Tienda-${version}.${ext}'
    }
  }
}).then(files => {
  console.log('\nPaquete listo para subir a Partner Center:\n' + files.join('\n'));
}).catch(e => { console.error(e.message || e); process.exit(1); });
