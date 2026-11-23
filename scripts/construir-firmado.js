// Genera instalador y portable FIRMADOS para distribución fuera de la Tienda.
// Admite dos formas de firma (elija una):
//
// 1) Certificado .pfx de una autoridad reconocida (Sectigo, DigiCert, Certum, etc.):
//      set CSC_LINK=C:\ruta\certificado.pfx
//      set CSC_KEY_PASSWORD=su_clave
//      npm run firmado
//
// 2) Microsoft Artifact Signing (antes "Trusted Signing"), en Azure:
//      set AZURE_TENANT_ID=...  set AZURE_CLIENT_ID=...  set AZURE_CLIENT_SECRET=...
//      set AZ_ENDPOINT=https://eus.codesigning.azure.net
//      set AZ_ACCOUNT=nombre-cuenta  set AZ_PROFILE=nombre-perfil  set AZ_PUBLISHER="Nombre del editor"
//      npm run firmado
//
// Con firma válida desaparece "Editor desconocido" (se muestra su nombre). SmartScreen
// puede seguir avisando unas semanas, hasta que el certificado gane reputación por descargas.
const builder = require('electron-builder');
const env = process.env;

const config = { win: {} };
if (env.AZ_ENDPOINT && env.AZ_ACCOUNT && env.AZ_PROFILE) {
  config.win.azureSignOptions = {
    endpoint: env.AZ_ENDPOINT,
    codeSigningAccountName: env.AZ_ACCOUNT,
    certificateProfileName: env.AZ_PROFILE,
    publisherName: env.AZ_PUBLISHER || 'Laser Estudio Pro'
  };
  console.log('Firmando con Microsoft Artifact Signing…');
} else if (env.CSC_LINK || env.WIN_CSC_LINK) {
  config.win.signtoolOptions = { signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: 'http://timestamp.digicert.com' };
  console.log('Firmando con el certificado indicado en CSC_LINK…');
} else {
  console.error('No hay certificado configurado. Lea las instrucciones al inicio de scripts/construir-firmado.js.');
  process.exit(1);
}
if (process.platform !== 'win32' && config.win.azureSignOptions) {
  console.error('La firma con Artifact Signing se ejecuta en Windows (PowerShell).');
  process.exit(1);
}

builder.build({ targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable'], builder.Arch.x64), config, publish: 'never' })
  .then(files => console.log('\nArchivos firmados:\n' + files.join('\n')))
  .catch(e => { console.error(e.message || e); process.exit(1); });
