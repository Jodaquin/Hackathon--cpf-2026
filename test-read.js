'use strict';

require('dotenv').config({ quiet: true });

const {
  estadoConfiguracion,
  leerDia,
  leerBase,
  traducirErrorGoogle,
} = require('./lib/sheets');
const { fechaValida, hoyISO, formatearPestana } = require('./lib/fechas');

const ZONA = process.env.TZ || 'America/Argentina/Buenos_Aires';

async function principal() {
  const fecha = process.argv[2] || hoyISO(ZONA);

  if (!fechaValida(fecha)) {
    console.error('\n✗ Fecha inválida. Usá el formato YYYY-MM-DD. Ejemplo:');
    console.error('  node test-read.js 2026-10-26\n');
    process.exit(1);
  }

  const estado = estadoConfiguracion();

  if (!estado.configurado) {
    console.error('\n✗ Todavía no está configurada la conexión con Google Sheets.\n');
    for (const faltante of estado.faltantes) {
      console.error(`  - ${faltante}`);
    }
    console.error('\n  Ejecutá "npm run setup" para ver el detalle.');
    console.error('  Guía: README.md → "Credenciales de Google"\n');
    process.exit(1);
  }

  try {
    const [datos, base] = await Promise.all([leerDia(fecha), leerBase()]);

    console.log(`\nFecha: ${fecha}`);
    console.log(`Pestaña esperada: ${formatearPestana(fecha)}`);
    console.log(`Pestaña real: ${datos.pestana}`);
    console.log(`Estado: ${datos.existe ? 'encontrada' : 'todavía no existe'}`);
    console.log(`Filas de datos: ${datos.total}`);
    console.log(`Clases en la tabla base para ese día: ${datos.baseDisponible}`);
    console.log(`Tabla base: ${base.existe ? `${base.total} fila(s)` : 'no existe'}\n`);
    console.log(JSON.stringify({ dia: datos, base }, null, 2));
    console.log('');
  } catch (error) {
    const traducido = traducirErrorGoogle(error);
    console.error(`\n✗ ${traducido.message}`);
    console.error(`  Detalle técnico: ${error.message}\n`);
    process.exit(1);
  }
}

principal();
