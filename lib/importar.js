'use strict';

const { normalizarEncabezado } = require('./esquema');

const ORDEN_SIN_ENCABEZADO = [
  'dia',
  'semestre',
  'carrera',
  'asignatura',
  'seccion',
  'tipo',
  'docente',
  'horaInicio',
  'horaFin',
  'aula',
  'observacion',
];

const ALIAS_IMPORTACION = {
  dia: ['DIA', 'DÍA'],
  semestre: ['SEMESTRE'],
  carrera: ['CARRERA'],
  asignatura: ['ASIGNATURA'],
  seccion: ['SECC', 'SECCION', 'SECCIÓN'],
  tipo: ['TIPO', 'TIPO DE CLASE'],
  docente: ['DOCENTE'],
  observacion: ['OBSERVACION', 'OBSERVACIÓN'],
  horaInicio: ['HORA INICIO'],
  horaFin: ['HORA FIN'],
  aula: ['AULA'],
};

function detectarDelimitador(linea) {
  if (linea.includes('\t')) return '\t';
  if (linea.includes(';')) return ';';
  return ',';
}

/**
 * Separa una línea respetando comillas dobles, por si se pega desde
 * Excel o desde un CSV.
 */
function dividirLinea(linea, delimitador) {
  const celdas = [];
  let actual = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];

    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }

    if (caracter === delimitador && !entreComillas) {
      celdas.push(actual.trim());
      actual = '';
      continue;
    }

    actual += caracter;
  }

  celdas.push(actual.trim());
  return celdas;
}

function indiceDe(encabezado, campo) {
  const alias = (ALIAS_IMPORTACION[campo] || []).map(normalizarEncabezado);
  return encabezado.findIndex((celda) => {
    const valor = normalizarEncabezado(celda);
    if (!valor) return false;
    return alias.some((nombre) => valor === nombre || valor.includes(nombre));
  });
}

/**
 * Convierte texto pegado (TSV, CSV o separado por punto y coma) en filas.
 *
 * Formato sin encabezado:
 * DÍA; SEMESTRE; CARRERA; ASIGNATURA; SECC; TIPO; DOCENTE; HORA INICIO;
 * HORA FIN; AULA; OBSERVACIÓN
 *
 * Si la primera línea trae encabezados, se usa el nombre de cada columna.
 */
function parsearImportacion(texto) {
  const lineas = String(texto || '')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  if (!lineas.length) {
    return { filas: [], errores: [], total: 0 };
  }

  const delimitador = detectarDelimitador(lineas[0]);
  const primera = dividirLinea(lineas[0], delimitador);
  const primeraNormalizada = primera.map(normalizarEncabezado);
  const tieneEncabezado =
    primeraNormalizada.includes('ASIGNATURA') &&
    (primeraNormalizada.includes('DIA') || primeraNormalizada.includes('DÍA'));

  let mapa = null;
  if (tieneEncabezado) {
    mapa = {};
    for (const campo of ORDEN_SIN_ENCABEZADO) {
      mapa[campo] = indiceDe(primera, campo);
    }
  }

  const filas = [];
  const errores = [];
  const inicio = tieneEncabezado ? 1 : 0;

  for (let i = inicio; i < lineas.length; i += 1) {
    const celdas = dividirLinea(lineas[i], delimitador);
    const datos = {};

    if (mapa) {
      for (const campo of ORDEN_SIN_ENCABEZADO) {
        datos[campo] = mapa[campo] >= 0 ? celdas[mapa[campo]] || '' : '';
      }
    } else {
      ORDEN_SIN_ENCABEZADO.forEach((campo, indice) => {
        datos[campo] = celdas[indice] || '';
      });
    }

    if (!Object.values(datos).some((valor) => String(valor).trim())) continue;
    filas.push({ linea: i + 1, datos });
  }

  return { filas, errores, total: filas.length, tieneEncabezado };
}

module.exports = { parsearImportacion, dividirLinea, detectarDelimitador };
