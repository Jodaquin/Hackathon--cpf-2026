'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { google } = require('googleapis');

const {
  formatearPestana,
  resolverTituloPestana,
  diaSemanaDeFecha,
  etiquetaDia,
  normalizarDia,
  hoyISO,
  parseFecha,
} = require('./fechas');
const {
  COLUMNAS,
  COLUMNAS_BASE,
  COLUMNAS_AULAS,
  PESTANA_BASE,
  PESTANA_AULAS,
  letraColumna,
  detectarMapa,
  normalizarEncabezado,
} = require('./esquema');
const {
  normalizarHora,
  normalizarEstado,
  resumenEstados,
  texto,
} = require('./validacion');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const FORMATO_REFERENCIA = 'LUNES 26/10/2026';
const RANGO_COMPLETO = 'A1:AZ';

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
    formatoReferencia: FORMATO_REFERENCIA,
    pestanaBase: PESTANA_BASE,
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

async function obtenerHojas() {
  const sheets = crearCliente();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: obtenerSpreadsheetId(),
    fields: 'sheets.properties(title,sheetId)',
  });

  return (data.sheets || [])
    .filter((hoja) => hoja.properties?.title)
    .map((hoja) => ({
      titulo: hoja.properties.title,
      sheetId: hoja.properties.sheetId,
    }));
}

async function obtenerTitulos() {
  const hojas = await obtenerHojas();
  return hojas.map((hoja) => hoja.titulo);
}

async function leerValores(titulo) {
  const sheets = crearCliente();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: obtenerSpreadsheetId(),
    range: `${citarPestana(titulo)}!${RANGO_COMPLETO}`,
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  return data.values || [];
}

function valor(fila, indice) {
  if (!Array.isArray(fila) || indice === undefined || indice < 0) return '';
  return texto(fila[indice]);
}

function limpiarNumero(valorCrudo) {
  const crudo = texto(valorCrudo);
  if (!crudo) return '';
  const numero = Number(crudo.replace(',', '.'));
  if (Number.isFinite(numero) && Number.isInteger(numero) && numero >= 0) {
    return String(numero);
  }
  return crudo;
}

/**
 * Convierte una fila cruda de la planilla en un objeto con los nombres
 * que usa la app. Tolera pestañas con encabezados en otra fila.
 */
function mapearFila(fila, mapa, numeroConsecutivo) {
  const numeroCrudo = limpiarNumero(valor(fila, mapa.numero));
  const estadoCrudo = valor(fila, mapa.estado);

  return {
    numero: numeroCrudo || String(numeroConsecutivo),
    semestre: valor(fila, mapa.semestre),
    carrera: valor(fila, mapa.carrera),
    asignatura: valor(fila, mapa.asignatura),
    seccion: valor(fila, mapa.seccion),
    tipo: valor(fila, mapa.tipo),
    docente: valor(fila, mapa.docente),
    observacion: valor(fila, mapa.observacion),
    reemplazante: valor(fila, mapa.reemplazante),
    horaInicio: normalizarHora(valor(fila, mapa.horaInicio)),
    horaFin: normalizarHora(valor(fila, mapa.horaFin)),
    aula: valor(fila, mapa.aula),
    // Estado vacío = "sin marcar todavía": la presencia se registra cuando el
    // docente realmente entra al aula. Con valor explícito se normaliza.
    estado: normalizarEstado(estadoCrudo),
  };
}

async function leerEstructuraDia(titulo) {
  const filas = await leerValores(titulo);
  return { filas, ...detectarMapa(filas) };
}

async function leerFilas(titulo, titulos = null) {
  const lista = titulos || (await obtenerTitulos());
  if (!lista.includes(titulo)) {
    return { existe: false, titulo, filas: [], total: 0, resumen: resumenEstados([]) };
  }

  const estructura = await leerEstructuraDia(titulo);
  const filas = [];
  const inicio = estructura.filaEncabezado + 1;

  for (let i = inicio; i < estructura.filas.length; i += 1) {
    const cruda = estructura.filas[i];
    const mapeada = mapearFila(cruda, estructura.mapa, i + 1);

    // Ignoramos filas de relleno o totales sin datos de clase.
    if (!mapeada.asignatura && !mapeada.horaInicio && !mapeada.horaFin) continue;

    filas.push({
      ...mapeada,
      fila: i + 1,
    });
  }

  return {
    existe: true,
    titulo,
    filas,
    total: filas.length,
    resumen: resumenEstados(filas),
    filaEncabezado: estructura.filaEncabezado + 1,
  };
}

async function leerDia(fecha) {
  const titulos = await obtenerTitulos();
  const pestana = resolverTituloPestana(fecha, titulos);
  const resultado = await leerFilas(pestana, titulos);
  const base = await leerBase();
  const dia = diaSemanaDeFecha(fecha);

  return {
    fecha,
    pestana,
    dia,
    existe: resultado.existe,
    total: resultado.total,
    filas: resultado.filas,
    resumen: resultado.resumen,
    baseDisponible: base.filas.filter((fila) => fila.dia === dia).length,
    columnas: COLUMNAS.map((columna) => ({
      key: columna.key,
      label: columna.label,
    })),
  };
}

function detectarMapaBase(filas) {
  let filaEncabezado = 0;
  for (let i = 0; i < Math.min(filas.length, 10); i += 1) {
    const fila = filas[i] || [];
    if (
      fila.some((celda) => normalizarEncabezado(celda) === 'ASIGNATURA') &&
      fila.some((celda) => ['DIA', 'DÍA'].includes(normalizarEncabezado(celda)))
    ) {
      filaEncabezado = i;
      break;
    }
  }

  const encabezado = filas[filaEncabezado] || [];
  const mapa = {};

  for (const columna of COLUMNAS_BASE) {
    const alias = normalizarEncabezado(columna.label);
    const indice = encabezado.findIndex((celda) => {
      const valorCelda = normalizarEncabezado(celda);
      if (!valorCelda) return false;
      if (alias.length <= 3) return valorCelda === alias;
      return valorCelda === alias || valorCelda.includes(alias);
    });
    mapa[columna.key] = indice >= 0 ? indice : COLUMNAS_BASE.indexOf(columna);
  }

  return {
    filaEncabezado,
    primeraFilaDatos: filaEncabezado + 2,
    mapa,
    ultimaColumna: Math.max(...Object.values(mapa)),
  };
}

async function leerBase() {
  const titulos = await obtenerTitulos();
  if (!titulos.includes(PESTANA_BASE)) {
    return { existe: false, pestana: PESTANA_BASE, filas: [], total: 0 };
  }

  const crudas = await leerValores(PESTANA_BASE);
  const estructura = detectarMapaBase(crudas);
  const filas = [];

  for (let i = estructura.filaEncabezado + 1; i < crudas.length; i += 1) {
    const cruda = crudas[i];
    const fila = {
      fila: i + 1,
      dia: normalizarDia(valor(cruda, estructura.mapa.dia)),
      semestre: valor(cruda, estructura.mapa.semestre),
      carrera: valor(cruda, estructura.mapa.carrera),
      asignatura: valor(cruda, estructura.mapa.asignatura),
      seccion: valor(cruda, estructura.mapa.seccion),
      tipo: valor(cruda, estructura.mapa.tipo),
      docente: valor(cruda, estructura.mapa.docente),
      observacion: valor(cruda, estructura.mapa.observacion),
      horaInicio: normalizarHora(valor(cruda, estructura.mapa.horaInicio)),
      horaFin: normalizarHora(valor(cruda, estructura.mapa.horaFin)),
      aula: valor(cruda, estructura.mapa.aula),
    };

    if (!fila.asignatura && !fila.horaInicio && !fila.horaFin) continue;
    filas.push(fila);
  }

  return {
    existe: true,
    pestana: PESTANA_BASE,
    filas,
    total: filas.length,
    porDia: filas.reduce((acumulado, fila) => {
      if (fila.dia) acumulado[fila.dia] = (acumulado[fila.dia] || 0) + 1;
      return acumulado;
    }, {}),
  };
}

/**
 * Elimina una pestaña completa del spreadsheet.
 */
async function eliminarPestana(titulo) {
  const sheets = crearCliente();
  const hojas = await obtenerHojas();
  const hoja = hojas.find((h) => h.titulo === titulo);
  if (!hoja) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: obtenerSpreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteSheet: {
            requestBody: { sheetId: hoja.sheetId },
          },
        },
      ],
    },
  });

  return true;
}

/**
 * Crea la pestaña de disponibilidad de aulas ("DA") si no existe.
 */
async function crearPestanaAulas() {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const hojas = await obtenerHojas();
  const existente = hojas.find((hoja) => hoja.titulo === PESTANA_AULAS);
  if (existente) return { creada: false, sheetId: existente.sheetId };

  let sheetId = null;
  try {
    const { data } = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: PESTANA_AULAS,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    sheetId = data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  } catch (error) {
    if (!/already exists/i.test(String(error.message || ''))) throw error;
    const hojasActualizadas = await obtenerHojas();
    const otra = hojasActualizadas.find((h) => h.titulo === PESTANA_AULAS);
    return { creada: false, sheetId: otra?.sheetId };
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${citarPestana(PESTANA_AULAS)}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNAS_AULAS.map((columna) => columna.label)] },
  });

  await aplicarFormatoPestana(sheetId, COLUMNAS_AULAS, 1);

  return { creada: true, sheetId };
}

/**
 * Lee las ocupaciones de aulas desde la pestaña "DA".
 */
async function leerAulas() {
  const titulos = await obtenerTitulos();
  if (!titulos.includes(PESTANA_AULAS)) {
    return { existe: false, pestana: PESTANA_AULAS, filas: [] };
  }

  const crudas = await leerValores(PESTANA_AULAS);
  const filas = [];

  for (let i = 1; i < crudas.length; i += 1) {
    const cruda = crudas[i];
    const aula = valor(cruda, 0);
    const dia = normalizarDia(valor(cruda, 1));
    const horaInicio = normalizarHora(valor(cruda, 2));
    const horaFin = normalizarHora(valor(cruda, 3));

    if (!aula && !dia && !horaInicio && !horaFin) continue;
    filas.push({ aula, dia, horaInicio, horaFin });
  }

  return { existe: true, pestana: PESTANA_AULAS, filas };
}

/**
 * Busca si hay solapamiento de horario para un aula en un día.
 * `exclusion` permite omitir la propia ocupación (misma aula, día, inicio y fin).
 */
function buscarConflictoAula(
  filas,
  aula,
  dia,
  horaInicio,
  horaFin,
  exclusion = null,
) {
  if (!aula) return null;

  const inicio = String(horaInicio || '');
  const fin = String(horaFin || '');

  for (const fila of filas) {
    if (fila.aula !== aula) continue;
    if (dia && fila.dia !== dia) continue;
    if (!fila.horaInicio && !fila.horaFin) continue;
    if (
      exclusion &&
      exclusion.aula === fila.aula &&
      exclusion.dia === fila.dia &&
      exclusion.horaInicio === fila.horaInicio &&
      exclusion.horaFin === fila.horaFin
    ) {
      continue;
    }

    const solapa =
      String(fin) > String(fila.horaInicio) && String(fila.horaFin) > String(inicio);

    if (solapa) {
      return { conflicto: true, con: fila };
    }
  }

  return null;
}

/**
 * Registra una ocupación de aula en la pestaña "DA".
 */
async function registrarOcupacionAula(aula, dia, horaInicio, horaFin) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const { creada } = await crearPestanaAulas();
  const crudas = await leerValores(PESTANA_AULAS);
  const filaEncabezado =
    crudas.findIndex((fila) =>
      (fila || []).some((celda) => normalizarEncabezado(celda) === 'AULA'),
    ) + 1;

  const primeraFilaDatos = filaEncabezado + 1;

  const duplicada = (await leerAulas()).filas.some(
    (fila) =>
      fila.aula === aula &&
      fila.dia === dia &&
      fila.horaInicio === horaInicio &&
      fila.horaFin === horaFin,
  );

  if (duplicada) {
    return { ok: true, creada, duplicada: true, fila: null };
  }

  const { data } = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${citarPestana(PESTANA_AULAS)}!A${primeraFilaDatos}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[aula, dia, horaInicio, horaFin]] },
  });

  const rangoActualizado = data.updates?.updatedRange || '';
  const coincidencia = /![A-Z]+(\d+)/.exec(rangoActualizado);

  return {
    ok: true,
    creada,
    fila: coincidencia ? Number(coincidencia[1]) : null,
  };
}

/**
 * Aplica formato simple a una pestaña recién creada. Si falla, no
 * interrumpimos el guardado: los datos ya están escritos.
 */
async function aplicarFormatoPestana(sheetId, columnas, filaEncabezado) {
  if (sheetId === undefined || sheetId === null) return;

  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: filaEncabezado },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: filaEncabezado - 1,
          endRowIndex: filaEncabezado,
          startColumnIndex: 0,
          endColumnIndex: columnas.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 },
            textFormat: { bold: true, fontSize: 9 },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    },
  ];

  for (let i = 0; i < columnas.length; i += 1) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: i,
          endIndex: i + 1,
        },
        properties: { pixelSize: columnas[i].ancho || 100 },
        fields: 'pixelSize',
      },
    });
  }

  try {
    const sheets = crearCliente();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: obtenerSpreadsheetId(),
      requestBody: { requests },
    });
  } catch (error) {
    console.warn('[sheets] No se pudo aplicar formato:', error.message);
  }
}

async function crearPestanaBase() {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const hojas = await obtenerHojas();
  const existente = hojas.find((hoja) => hoja.titulo === PESTANA_BASE);
  if (existente) return { creada: false, sheetId: existente.sheetId };

  let sheetId = null;
  try {
    const { data } = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: PESTANA_BASE,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    sheetId = data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  } catch (error) {
    if (!/already exists/i.test(String(error.message || ''))) throw error;
    const hojasActualizadas = await obtenerHojas();
    sheetId = hojasActualizadas.find((h) => h.titulo === PESTANA_BASE)?.sheetId;
    return { creada: false, sheetId };
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${citarPestana(PESTANA_BASE)}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [COLUMNAS_BASE.map((columna) => columna.label)],
    },
  });

  await aplicarFormatoPestana(sheetId, COLUMNAS_BASE, 1);
  return { creada: true, sheetId };
}

async function crearPestanaDia(titulo, fecha) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const hojas = await obtenerHojas();
  const existente = hojas.find((hoja) => hoja.titulo === titulo);
  if (existente) return { creada: false, sheetId: existente.sheetId };

  let sheetId = null;
  try {
    const { data } = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: titulo,
                gridProperties: { frozenRowCount: 4 },
              },
            },
          },
        ],
      },
    });
    sheetId = data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  } catch (error) {
    if (!/already exists/i.test(String(error.message || ''))) throw error;
    const hojasActualizadas = await obtenerHojas();
    sheetId = hojasActualizadas.find((h) => h.titulo === titulo)?.sheetId;
    return { creada: false, sheetId };
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${citarPestana(titulo)}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['DIRECCIÓN ACADÉMICA · DISTRIBUCIÓN DE AULAS · HORARIO DE CLASES'],
        ['DÍA', '', '', formatearPestana(fecha)],
        [
          'P = PRESENTE',
          '',
          '',
          'A = AUSENTE',
          'AA = AUSENTE CON AVISO',
          '',
          'R = REEMPLAZANTE',
        ],
        COLUMNAS.map((columna) => columna.label),
      ],
    },
  });

  await aplicarFormatoPestana(sheetId, COLUMNAS, 4);
  return { creada: true, sheetId };
}

async function asegurarPestanaDia(titulo, fecha) {
  const hojas = await obtenerHojas();
  const existente = hojas.find((hoja) => hoja.titulo === titulo);
  if (existente) return { creada: false, sheetId: existente.sheetId };

  // Puede haber una pestaña creada con otro nombre para la misma fecha.
  const titulos = hojas.map((hoja) => hoja.titulo);
  const real = resolverTituloPestana(fecha, titulos);
  if (real !== titulo) {
    const otra = hojas.find((hoja) => hoja.titulo === real);
    if (otra) return { creada: false, sheetId: otra.sheetId, titulo: real };
  }

  const creada = await crearPestanaDia(titulo, fecha);
  return { ...creada, titulo };
}

function construirFila(datos, mapa, largo) {
  const fila = new Array(Math.max(largo, COLUMNAS.length)).fill('');

  for (const columna of COLUMNAS) {
    const indice = mapa[columna.key];
    if (indice === undefined || indice < 0) continue;
    if (datos[columna.key] === undefined || datos[columna.key] === null) continue;
    fila[indice] = datos[columna.key];
  }

  return fila;
}

async function agregarClase(fecha, datos) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const titulos = await obtenerTitulos();
  const pestanaInicial = resolverTituloPestana(fecha, titulos);

  const creacion = await asegurarPestanaDia(pestanaInicial, fecha);
  const pestana = creacion.titulo || pestanaInicial;
  const estructura = await leerEstructuraDia(pestana);
  const largo = Math.max(estructura.ultimaColumna + 1, COLUMNAS.length);

  // El número es solo el orden de la clase. Si no viene, lo calculamos.
  let numero = datos.numero;
  if (!numero) {
    const numeros = estructura.filas
      .slice(estructura.filaEncabezado + 1)
      .map((fila) => Number(limpiarNumero(valor(fila, estructura.mapa.numero))))
      .filter((n) => Number.isFinite(n));
    numero = (numeros.length ? Math.max(...numeros) : 0) + 1;
  }

  const fila = construirFila(
    {
      ...datos,
      numero: String(numero),
      estado: datos.estado ?? 'P',
    },
    estructura.mapa,
    largo,
  );

  // Si la clase viene con aula, chequeamos que no haya solapamiento y
  // registramos la ocupación en la pestaña de disponibilidad de aulas.
  if (datos.aula) {
    const diaDeLaClase = diaSemanaDeFecha(fecha);
    const disponibilidad = await leerAulas();
    const conflicto = buscarConflictoAula(
      disponibilidad.filas,
      String(datos.aula),
      diaDeLaClase,
      datos.horaInicio,
      datos.horaFin,
    );

    if (conflicto) {
      const error = new Error(`El aula ${datos.aula} ya está ocupada en ese horario.`);
      error.status = 409;
      error.publicMessage = `El aula ${datos.aula} ya está ocupada en ese horario. No se puede cargar otra clase para ese aula en ese horario.`;
      throw error;
    }
  }

  const { data } = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${citarPestana(pestana)}!A${estructura.primeraFilaDatos}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [fila] },
  });

  const rangoActualizado = data.updates?.updatedRange || '';
  const coincidencia = /![A-Z]+(\d+)/.exec(rangoActualizado);

  if (datos.aula) {
    await registrarOcupacionAula(
      String(datos.aula),
      diaSemanaDeFecha(fecha),
      datos.horaInicio,
      datos.horaFin,
    );
  }

  return {
    pestana,
    fila: coincidencia ? Number(coincidencia[1]) : null,
    numero,
    pestanaCreada: creacion.creada,
  };
}

async function actualizarClase(fecha, fila, cambios) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const titulos = await obtenerTitulos();
  const pestana = resolverTituloPestana(fecha, titulos);

  if (!titulos.includes(pestana)) {
    const error = new Error('La pestaña del día todavía no existe.');
    error.status = 404;
    error.publicMessage =
      'La pestaña del día todavía no existe. Cargá primero las clases desde la tabla base.';
    throw error;
  }

  const filaNumero = Number(fila);
  if (!Number.isInteger(filaNumero) || filaNumero < 2) {
    const error = new Error('El número de fila no es válido.');
    error.status = 400;
    error.publicMessage = 'El número de fila no es válido.';
    throw error;
  }

  const estructura = await leerEstructuraDia(pestana);

  if (filaNumero < estructura.primeraFilaDatos) {
    const error = new Error('La fila indicada pertenece al encabezado.');
    error.status = 400;
    error.publicMessage = 'No se pueden modificar las filas de encabezado.';
    throw error;
  }

  const data = [];

  for (const [campo, valorCampo] of Object.entries(cambios)) {
    const indice = estructura.mapa[campo];
    if (indice === undefined) continue;

    const contenido =
      campo === 'estado'
        ? normalizarEstado(valorCampo)
        : campo === 'aula'
          ? texto(valorCampo).toUpperCase()
          : texto(valorCampo);

    data.push({
      range: `${citarPestana(pestana)}!${letraColumna(indice)}${filaNumero}`,
      values: [[contenido]],
    });
  }

  if (!data.length) {
    const error = new Error('No hay cambios para guardar.');
    error.status = 400;
    error.publicMessage = 'No hay cambios para guardar.';
    throw error;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  if (cambios.aula) {
    const contenidoAula = texto(cambios.aula).toUpperCase();
    if (contenidoAula) {
      const diaDeLaClase = diaSemanaDeFecha(fecha);
      const disponibilidad = await leerAulas();
      // filaNumero es 1-based; estructura.filas[] es 0-based (array raw)
      const indiceFila = filaNumero - 1;
      const crudaFila = estructura.filas[indiceFila];
      const horaInicioFila = normalizarHora(valor(crudaFila, estructura.mapa.horaInicio));
      const horaFinFila = normalizarHora(valor(crudaFila, estructura.mapa.horaFin));
      // Aula anterior de esa fila (para excluirla del chequeo)
      const aulaAnterior = texto(valor(crudaFila, estructura.mapa.aula)).toUpperCase();

      const conflicto = buscarConflictoAula(
        disponibilidad.filas,
        contenidoAula,
        diaDeLaClase,
        horaInicioFila,
        horaFinFila,
        // Excluimos la ocupación previa del aula anterior (no la nueva)
        aulaAnterior
          ? {
              aula: aulaAnterior,
              dia: diaDeLaClase,
              horaInicio: horaInicioFila,
              horaFin: horaFinFila,
            }
          : null,
      );

      if (conflicto) {
        const con = conflicto.con;
        const detalle =
          con && con.aula && con.horaInicio
            ? ` (ocupada por ${con.aula} de ${con.horaInicio} a ${con.horaFin})`
            : '';
        const error = new Error(
          `El aula ${contenidoAula} ya está ocupada en ese horario${detalle}.`,
        );
        error.status = 409;
        error.publicMessage = `El aula ${contenidoAula} ya está ocupada en ese horario${detalle}. No se puede asignar otra clase al mismo aula y horario.`;
        throw error;
      }

      await registrarOcupacionAula(
        contenidoAula,
        diaDeLaClase,
        horaInicioFila,
        horaFinFila,
      );
    }
  }

  return { pestana, fila: filaNumero, cambios };
}

async function prepararDia(fecha) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const titulos = await obtenerTitulos();
  const pestanaInicial = resolverTituloPestana(fecha, titulos);
  const dia = diaSemanaDeFecha(fecha);

  if (titulos.includes(pestanaInicial)) {
    const actual = await leerFilas(pestanaInicial, titulos);
    if (actual.total > 0) {
      return {
        pestana: pestanaInicial,
        creado: false,
        yaTeniaClases: true,
        total: actual.total,
        mensaje: 'La pestaña del día ya tiene clases cargadas.',
      };
    }
  }

  const base = await leerBase();
  const clases = base.filas
    .filter((fila) => fila.dia === dia)
    .sort((a, b) => {
      const hora = String(a.horaInicio).localeCompare(String(b.horaInicio));
      if (hora !== 0) return hora;
      return String(a.asignatura).localeCompare(String(b.asignatura));
    });

  if (!clases.length) {
    const error = new Error(`La tabla base no tiene clases para ${etiquetaDia(dia)}.`);
    error.status = 409;
    error.publicMessage = `La tabla base no tiene clases para ${etiquetaDia(
      dia,
    )}. Cargá primero el horario base de ese día.`;
    throw error;
  }

  // Si ya existe la pestaña del día que se quiere cargar, no se vuelve a
  // copiar. Si no existe, se borra la del mismo día de la semana anterior
  // (ej. al cargar el LUNES 2/11/2026 se borra el LUNES 26/10/2026),
  // PERO solo si la pestaña nueva aún no existe (evita borrar el día anterior
  // accidentalmente al recargar un día que ya fue cargado previamente).
  const partesFecha = parseFecha(fecha);
  const fechaAnterior = new Date(
    Date.UTC(partesFecha.anio, partesFecha.mes - 1, partesFecha.dia - 7),
  );
  const isoAnterior = `${String(fechaAnterior.getUTCFullYear()).padStart(4, '0')}-${String(
    fechaAnterior.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(fechaAnterior.getUTCDate()).padStart(2, '0')}`;
  const pestanaAnterior = formatearPestana(isoAnterior);
  const pestanaAnteriorExiste = titulos.includes(pestanaAnterior);
  const pestanaActualExiste = titulos.includes(pestanaInicial);
  // Solo borramos la anterior si la nueva todavía no existe
  if (pestanaAnteriorExiste && !pestanaActualExiste) {
    await eliminarPestana(pestanaAnterior);
  }

  const creacion = await asegurarPestanaDia(pestanaInicial, fecha);
  const pestana = creacion.titulo || pestanaInicial;
  const estructura = await leerEstructuraDia(pestana);
  const largo = Math.max(estructura.ultimaColumna + 1, COLUMNAS.length);

  const filas = clases.map((clase, indice) =>
    construirFila(
      {
        numero: indice + 1,
        semestre: clase.semestre,
        carrera: clase.carrera,
        asignatura: clase.asignatura,
        seccion: clase.seccion,
        tipo: clase.tipo,
        docente: clase.docente,
        observacion: clase.observacion,
        reemplazante: '',
        horaInicio: clase.horaInicio,
        horaFin: clase.horaFin,
        aula: clase.aula,
        // Estado pendiente: la presencia se registra cuando el docente entra
        // al aula. No se copia como "Presente" desde la base.
        estado: '',
      },
      estructura.mapa,
      largo,
    ),
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${citarPestana(pestana)}!A${estructura.primeraFilaDatos}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: filas },
  });

  return {
    pestana,
    creado: creacion.creada,
    yaTeniaClases: false,
    total: filas.length,
    mensaje: `${filas.length} clase(s) cargada(s) desde la tabla base.`,
  };
}

async function agregarBase(datos) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  await crearPestanaBase();
  const estructura = detectarMapaBase(await leerValores(PESTANA_BASE));
  const largo = Math.max(estructura.ultimaColumna + 1, COLUMNAS_BASE.length);
  const fila = new Array(largo).fill('');

  for (const columna of COLUMNAS_BASE) {
    const indice = estructura.mapa[columna.key];
    if (indice === undefined || indice < 0) continue;
    fila[indice] = datos[columna.key] ?? '';
  }

  if (datos.aula) {
    const baseActual = await leerBase();
    const conflicto = buscarConflictoAula(
      baseActual.filas,
      String(datos.aula),
      datos.dia || '',
      datos.horaInicio,
      datos.horaFin,
    );

    if (conflicto) {
      const error = new Error(`El aula ${datos.aula} ya está ocupada en ese horario.`);
      error.status = 409;
      error.publicMessage = `El aula ${datos.aula} ya está ocupada en ese horario. No se puede cargar otra clase para ese aula en ese horario.`;
      throw error;
    }
  }

  const { data } = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${citarPestana(PESTANA_BASE)}!A${estructura.primeraFilaDatos}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [fila] },
  });

  const rangoActualizado = data.updates?.updatedRange || '';
  const coincidencia = /![A-Z]+(\d+)/.exec(rangoActualizado);

  if (datos.aula) {
    await registrarOcupacionAula(
      String(datos.aula),
      datos.dia || '',
      datos.horaInicio,
      datos.horaFin,
    );
  }

  return {
    pestana: PESTANA_BASE,
    fila: coincidencia ? Number(coincidencia[1]) : null,
  };
}

function claveBase(fila) {
  return [
    fila.dia,
    fila.horaInicio,
    fila.horaFin,
    fila.asignatura,
    fila.seccion,
    fila.carrera,
  ].join('|');
}

async function importarBase(filasValidadas) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  await crearPestanaBase();

  const baseActual = await leerBase();
  const existentes = new Set(baseActual.filas.map(claveBase));
  const nuevas = [];

  for (const fila of filasValidadas) {
    const clave = claveBase(fila);
    if (existentes.has(clave)) continue;
    existentes.add(clave);
    nuevas.push(fila);
  }

  if (!nuevas.length) {
    return {
      agregadas: 0,
      duplicadas: filasValidadas.length,
      pestana: PESTANA_BASE,
    };
  }

  const estructura = detectarMapaBase(await leerValores(PESTANA_BASE));
  const largo = Math.max(estructura.ultimaColumna + 1, COLUMNAS_BASE.length);
  const filas = nuevas.map((datos) => {
    const fila = new Array(largo).fill('');
    for (const columna of COLUMNAS_BASE) {
      const indice = estructura.mapa[columna.key];
      if (indice === undefined || indice < 0) continue;
      fila[indice] = datos[columna.key] ?? '';
    }
    return fila;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${citarPestana(PESTANA_BASE)}!A${estructura.primeraFilaDatos}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: filas },
  });

  for (const datos of nuevas) {
    if (!datos.aula) continue;
    await registrarOcupacionAula(
      String(datos.aula),
      datos.dia || '',
      datos.horaInicio,
      datos.horaFin,
    );
  }

  return {
    agregadas: nuevas.length,
    duplicadas: filasValidadas.length - nuevas.length,
    pestana: PESTANA_BASE,
  };
}

async function eliminarBase(fila) {
  const sheets = crearCliente();
  const spreadsheetId = obtenerSpreadsheetId();
  const filaNumero = Number(fila);
  const hojas = await obtenerHojas();
  const hoja = hojas.find((h) => h.titulo === PESTANA_BASE);

  if (!hoja) {
    const error = new Error('La tabla base no existe.');
    error.status = 404;
    error.publicMessage = 'La tabla base todavía no existe.';
    throw error;
  }

  if (!Number.isInteger(filaNumero) || filaNumero < 2) {
    const error = new Error('El número de fila no es válido.');
    error.status = 400;
    error.publicMessage = 'No se puede eliminar la fila de encabezado.';
    throw error;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: hoja.sheetId,
              dimension: 'ROWS',
              startIndex: filaNumero - 1,
              endIndex: filaNumero,
            },
          },
        },
      ],
    },
  });

  return { eliminada: true, fila: filaNumero };
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
  COLUMNAS_BASE,
  PESTANA_BASE,
  FORMATO_REFERENCIA,
  estadoConfiguracion,
  obtenerHojas,
  obtenerTitulos,
  leerFilas,
  leerDia,
  leerBase,
  leerAulas,
  agregarClase,
  actualizarClase,
  prepararDia,
  agregarBase,
  importarBase,
  eliminarBase,
  eliminarPestana,
  registrarOcupacionAula,
  buscarConflictoAula,
  traducirErrorGoogle,
};
