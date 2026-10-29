'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const {
  estadoConfiguracion,
  obtenerTitulos,
  traducirErrorGoogle,
} = require('../lib/sheets');
const { estadoAuditoria } = require('../lib/auditoria');

const ok = (mensaje) => console.log(`  ✓ ${mensaje}`);
const mal = (mensaje) => console.log(`  ✗ ${mensaje}`);

async function principal() {
  console.log('\nVerificación de configuración\n');

  const rutaEnv = path.join(process.cwd(), '.env');
  if (fs.existsSync(rutaEnv)) {
    ok('Archivo .env encontrado.');
  } else {
    mal('No existe el archivo .env. Copiá .env.example como .env.');
  }

  const estado = estadoConfiguracion();

  if (estado.emailCuentaServicio) {
    ok(`Credenciales de Google cargadas (${estado.origenCredencial}).`);
    console.log(`    Cuenta de servicio: ${estado.emailCuentaServicio}`);
  } else {
    mal(
      'No se pudieron cargar las credenciales de Google. Revisá GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }

  if (estado.spreadsheetIdVisible) {
    ok(`SPREADSHEET_ID configurado (${estado.spreadsheetIdVisible}).`);
  } else {
    mal('Falta SPREADSHEET_ID en el archivo .env.');
  }

  const auditoria = estadoAuditoria();
  if (auditoria.configurada) {
    ok(`Auditoría en Supabase activa (tabla "${auditoria.tabla}").`);
  } else {
    console.log('  · Auditoría en Supabase: opcional, no configurada.');
  }

  if (!estado.configurado) {
    console.log('\nFalta completar la configuración.');
    console.log('Guía paso a paso: README.md → "Credenciales de Google"\n');
    process.exit(1);
  }

  console.log('\nProbando la conexión con Google Sheets…');

  try {
    const pestanas = await obtenerTitulos();
    ok(`Conexión correcta. La planilla tiene ${pestanas.length} pestaña(s).`);

    if (pestanas.length > 0) {
      const muestra = pestanas.slice(0, 8).join(' · ');
      console.log(`    ${muestra}${pestanas.length > 8 ? ' …' : ''}`);
    }

    console.log('\nTodo listo. Ejecutá "npm start" y abrí http://localhost:3000\n');
  } catch (error) {
    const traducido = traducirErrorGoogle(error);
    mal('No se pudo conectar con la planilla.');
    console.log(`    ${traducido.message}`);
    console.log(`    Detalle técnico: ${error.message}\n`);
    process.exit(1);
  }
}

principal();
