'use strict';

const app = require('./app');
const { estadoConfiguracion } = require('./lib/sheets');

const puerto = Number(process.env.PORT) || 3000;

const servidor = app.listen(puerto, () => {
  const estado = estadoConfiguracion();
  const url = `http://localhost:${puerto}`;

  console.log('');
  console.log('  Registro de clases');
  console.log(`  → Abrí esta URL en el navegador: ${url}`);
  console.log('');

  if (estado.configurado) {
    console.log('  ✓ Conexión con Google Sheets configurada.');
    if (estado.emailCuentaServicio) {
      console.log(`    Cuenta de servicio: ${estado.emailCuentaServicio}`);
    }
  } else {
    console.log('  ⚠ Todavía faltan datos para conectar con Google Sheets:');
    for (const faltante of estado.faltantes) {
      console.log(`    - ${faltante}`);
    }
    console.log('');
    console.log('    Guía paso a paso: README.md → "Credenciales de Google"');
    console.log('    Verificación rápida: npm run setup');
  }

  console.log('');
  console.log('  Para detener el servidor: Ctrl + C');
  console.log('');
});

function cerrar(senal) {
  console.log(`\nCerrando servidor (${senal})…`);
  servidor.close(() => process.exit(0));
}

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));
