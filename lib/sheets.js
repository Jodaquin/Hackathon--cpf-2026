'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { google } = require('googleapis');

const { formatearPestana, hoyISO } = require('./fechas');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Orden EXACTO de las columnas de la planilla.
// Si tu planilla real tiene otro orden, cambiá esta lista.
const COLUMNAS = [
  { key: 'carrera', label: 'Carrera' },
  { key: 'semestre', label: 'Semestre' },
  { key: 'asignatura', label: 'Asignatura' },
  { key: 'seccion', label: 'Sección' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'docente', label: 'Docente' },
  { key: 'horaInicio', label: 'Hora inicio' },
  { key: 'horaFin', label: 'Hora fin' },
  { key: 'aula', label: 'Aula' },
  { key: 'estado', label: 'Estado' },
  { key: 'observacion', label: 'Observación' },
  { key: 'reemplazante', label: 'Reemplazante' },
];

const FILAS_ENCABEZADO = 4;
const PRIMERA_FILA_DATOS = FILAS_ENCABEZADO + 1;
const ULTIMA_COLUMNA = 'L';

let clienteCache = null;

function normalizarCredenciales(json) {
  const credenciales = { ...json };
  if (typeof credenciales.private_key === 'string') {
    credenciales.private_key = credenciales.private_key.replace(/\\n/g, '\n');
  }
  return credenciales;
}

/**
 * Busca las credenciales en GOOGLE_SERVICE_ACCOUNT_JSON (Vercel)
 * o en el archivo indicado por GOOGLE_APPLICATION_CREDENTIALS (local).
 */
function leerCredenciales() {
  const jsonEnVariable = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();

  if (jsonEnVariable) {
    try {
      const json = JSON.parse(jsonEnVariable);
      return {
        tipo: 'variable de entorno',
        credentials: normalizarCredenciales(json),
        ruta: null,
      };
    } catch {
      return {
        tipo: 'variable de entorno',
        credentials: null,
        ruta: null,
        error: 'GOOGLE_SERVICE_ACCOUNT_JSON no contiene un JSON válido.',
      };
    }
  }

  const rutaConfigurada = String(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || 'credentials/service-account.json',
  ).trim();
  const rutaAbsoluta = path.isAbsolute(rutaConfigurada)
    ? rutaConfigurada
    : path.join(process.cwd(), rutaConfigurada);

  if (!fs.existsSync(rutaAbsoluta)) {
    return {
      tipo: 'archivo',
      credentials: null,
      ruta: rutaAbsoluta,
      error: `No se encontró el archivo de credenciales: ${rutaAbsoluta}`,
    };
  }

  try {
    const contenido = JSON.parse(fs.readFileSync(rutaAbsoluta, 'utf8'));
    return {
      tipo: 'archivo',
      credentials: normalizarCredenciales(contenido),
      ruta: rutaAbsoluta,
    };
  } catch {
    return {
      tipo: 'archivo',
      credentials: null,
      ruta: rutaAbsoluta,
      error: 'El archivo JSON de credenciales no es válido.',
    };
  }
}

function estadoConfiguracion() {
  const credenciales = leerCredenciales();
  const spreadsheetId = String(process.env.SPREADSHEET_ID || '').trim();
  const faltantes = [];

  if (!spreadsheetId) faltantes.push('SPREADSHEET_ID');
  if (!credenciales.credentials) {
    faltantes.push(credenciales.error || 'Credenciales de Google');
  }

  return {
    configurado: faltantes.length === 0,
    faltantes,
    origenCredencial: credenciales.tipo,
    rutaCredencial: credenciales.ruta,
    emailCuentaServicio: credenciales.credentials?.client_email || null,
    spreadsheetIdVisible: spreadsheetId ? `…${spreadsheetId.slice(-6)}` : null,
    pestanaHoy: formatearPestana(
      hoyISO(process.env.TZ || 'America/Argentina/Buenos_Aires'),
    ),
  };
}

function crearCliente() {
  if (clienteCache) return clienteCache;

  const credenciales = leerCredenciales();
  if (!credenciales.credentials) {
    const error = new Error(
      'Faltan las credenciales de Google. Revisá el README.md o ejecutá "npm run setup".',
    );
    error.status = 503;
    error.publicMessage =
      'La app todavía no está conectada a Google Sheets. Falta el archivo de credenciales.';
    throw error;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credenciales.credentials,
    scopes: SCOPES,
  });

  clienteCache = google.sheets({ version: 'v4', auth });
  return clienteCache;
}

function obtenerSpreadsheetId() {
  const id = String(process.env.SPREADSHEET_ID || '').trim();
  if (!id) {
    const error = new Error('Falta configurar SPREADSHEET_ID en el archivo .env.');
    error.status = 503;
    error.publicMessage =
      'La app todavía no está conectada a Google Sheets. Falta el ID de la planilla (SPREADSHEET_ID).';
    throw error;
  }
  return id;
}

/**
 * Escapa el nombre de la pestaña para usarlo en un rango A1.
 */
function citarPestana(titulo) {
  return `'${String(titulo).replace(/'/g, "''")}'`;
}

async function obtenerTitulos() {
  const sheets = crearCliente();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: obtenerSpreadsheetId(),
    fields: 'sheets.properties.title',
  });

  return (data.sheets || [])
    .map((hoja) => hoja.properties?.title)
    .filter(Boolean);
}

/**
 * Crea la pestaña si no existe y deja las 4 filas de encabezado.
 * Si ya existe, la respeta tal cual está.
 */
async function asegurarPestana(titulo) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const titulos = await obtenerTitulos();

  if (titulos.includes(titulo)) {
    return { creada: false };
  }

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: titulo } } }],
      },
    });
  } catch (error) {
    // Si dos personas guardan al mismo tiempo, la pestaña puede
    // haberse creado en paralelo: en ese caso continuamos.
    if (!/already exists/i.test(String(error.message || ''))) throw error;
    return { creada: false };
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${citarPestana(titulo)}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['REGISTRO DE ESTADOS DE CLASES'],
        ['Pestaña', titulo],
        [
          'Carga normalizada desde el formulario web. No editar las primeras 4 filas.',
        ],
        COLUMNAS.map((columna) => columna.label),
      ],
    },
  });

  return { creada: true };
}

async function leerFilas(titulo) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const titulos = await obtenerTitulos();

  if (!titulos.includes(titulo)) {
    return { existe: false, filas: [], total: 0 };
  }

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${citarPestana(titulo)}!A${PRIMERA_FILA_DATOS}:${ULTIMA_COLUMNA}`,
  });

  const filas = [];
  (data.values || []).forEach((filaCruda, indice) => {
    const tieneContenido = filaCruda.some(
      (valor) => String(valor ?? '').trim() !== '',
    );
    if (!tieneContenido) return;

    const fila = { fila: PRIMERA_FILA_DATOS + indice };
    COLUMNAS.forEach((columna, posicion) => {
      fila[columna.key] = String(filaCruda[posicion] ?? '').trim();
    });
    filas.push(fila);
  });

  return { existe: true, filas, total: filas.length };
}

async function leerDemo(fecha) {
  const pestana = formatearPestana(fecha);
  const resultado = await leerFilas(pestana);

  return {
    fecha,
    pestana,
    existe: resultado.existe,
    total: resultado.total,
    columnas: COLUMNAS.map((columna) => ({
      key: columna.key,
      label: columna.label,
    })),
    filas: resultado.filas,
  };
}

async function agregarClase(fecha, datos) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const pestana = formatearPestana(fecha);

  const creacion = await asegurarPestana(pestana);

  const fila = COLUMNAS.map((columna) => datos[columna.key] ?? '');

  const { data } = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${citarPestana(pestana)}!A${PRIMERA_FILA_DATOS}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [fila] },
  });

  const rangoActualizado = data.updates?.updatedRange || '';
  const coincidencia = /![A-Z]+(\d+)/.exec(rangoActualizado);

  return {
    pestana,
    fila: coincidencia ? Number(coincidencia[1]) : null,
    pestanaCreada: creacion.creada,
  };
}

/**
 * Convierte un error de Google en un mensaje entendible para la persona
 * que está usando la app.
 */
function traducirErrorGoogle(error) {
  const codigo = Number(error?.code || error?.response?.status || 0);
  const correo = estadoConfiguracion().emailCuentaServicio;

  if (codigo === 403) {
    return {
      status: 403,
      message: correo
        ? `Google rechazó el acceso. Compartí la planilla con ${correo} con permiso de Editor.`
        : 'Google rechazó el acceso. Compartí la planilla con la cuenta de servicio con permiso de Editor.',
    };
  }

  if (codigo === 404) {
    return {
      status: 404,
      message:
        'No se encontró la planilla o la pestaña. Revisá el SPREADSHEET_ID y que la planilla siga existiendo.',
    };
  }

  if (codigo === 401) {
    return {
      status: 401,
      message:
        'Las credenciales de Google no son válidas o vencieron. Generá una clave nueva para la cuenta de servicio.',
    };
  }

  if (/unable to parse range/i.test(String(error?.message || ''))) {
    return {
      status: 400,
      message:
        'El nombre de la pestaña o el rango de la planilla no es válido. Revisá el formato de la pestaña.',
    };
  }

  return {
    status: 500,
    message:
      'No pudimos comunicarnos con Google Sheets. Revisá tu conexión y la configuración.',
  };
}

module.exports = {
  COLUMNAS,
  FILAS_ENCABEZADO,
  PRIMERA_FILA_DATOS,
  estadoConfiguracion,
  obtenerTitulos,
  asegurarPestana,
  leerFilas,
  leerDemo,
  agregarClase,
  traducirErrorGoogle,
};
