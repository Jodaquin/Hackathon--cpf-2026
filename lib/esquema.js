'use strict';

/**
 * Formato único de la planilla.
 *
 * Se tomó como referencia la pestaña "LUNES 26/10/2026" de la planilla
 * oficial. Todas las pestañas nuevas que cree la app usan exactamente
 * estas 13 columnas (A a M), con 4 filas de encabezado.
 *
 * La app puede LEER pestañas viejas que tengan otra cantidad de filas de
 * encabezado o una columna extra, pero siempre ESCRIBE este formato.
 */

const COLUMNAS = [
  { key: 'numero', label: 'N', ancho: 55 },
  { key: 'semestre', label: 'SEMESTRE', ancho: 90 },
  { key: 'carrera', label: 'CARRERA', ancho: 90 },
  { key: 'asignatura', label: 'ASIGNATURA', ancho: 270 },
  { key: 'seccion', label: 'SECC', ancho: 65 },
  { key: 'tipo', label: 'TIPO', ancho: 75 },
  { key: 'docente', label: 'DOCENTE', ancho: 220 },
  { key: 'observacion', label: 'OBSERVACION', ancho: 200 },
  { key: 'reemplazante', label: 'REEMPLAZANTE', ancho: 200 },
  { key: 'horaInicio', label: 'HORA INICIO', ancho: 90 },
  { key: 'horaFin', label: 'HORA FIN', ancho: 90 },
  { key: 'aula', label: 'AULA', ancho: 90 },
  { key: 'estado', label: 'ESTADO (P/A/AA/R)', ancho: 150 },
];

const COLUMNAS_BASE = [
  { key: 'dia', label: 'DÍA', ancho: 100 },
  { key: 'semestre', label: 'SEMESTRE', ancho: 90 },
  { key: 'carrera', label: 'CARRERA', ancho: 90 },
  { key: 'asignatura', label: 'ASIGNATURA', ancho: 270 },
  { key: 'seccion', label: 'SECC', ancho: 65 },
  { key: 'tipo', label: 'TIPO', ancho: 75 },
  { key: 'docente', label: 'DOCENTE', ancho: 220 },
  { key: 'observacion', label: 'OBSERVACION', ancho: 200 },
  { key: 'horaInicio', label: 'HORA INICIO', ancho: 90 },
  { key: 'horaFin', label: 'HORA FIN', ancho: 90 },
  { key: 'aula', label: 'AULA', ancho: 90 },
];

const FILAS_ENCABEZADO = 4;
const PRIMERA_FILA_DATOS = FILAS_ENCABEZADO + 1;
const ULTIMA_COLUMNA = 'M';
const PESTANA_BASE = 'HORARIO BASE';

// Alias aceptados al leer planillas viejas. El orden de las columnas
// puede variar, por eso buscamos por nombre de encabezado.
const ALIAS = {
  numero: ['N', 'Nº', 'N°', 'NUMERO', 'NÚMERO', '#'],
  semestre: ['SEMESTRE'],
  carrera: ['CARRERA'],
  asignatura: ['ASIGNATURA'],
  seccion: ['SECC', 'SECCION', 'SECCIÓN'],
  tipo: ['TIPO', 'TIPO DE CLASE'],
  docente: ['DOCENTE'],
  observacion: ['OBSERVACION', 'OBSERVACIÓN'],
  reemplazante: ['REEMPLAZANTE'],
  aula: ['AULA'],
  estado: ['ESTADO'],
  dia: ['DIA', 'DÍA'],
};

function normalizarEncabezado(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function coincideEncabezado(celda, alias) {
  const valor = normalizarEncabezado(celda);
  if (!valor) return false;

  return alias.some((nombre) => {
    const buscado = normalizarEncabezado(nombre);
    if (buscado.length <= 2) return valor === buscado;
    return valor === buscado || valor.includes(buscado);
  });
}

function buscarColumna(encabezado, campo) {
  const alias = ALIAS[campo] || [];
  return encabezado.findIndex((celda) => coincideEncabezado(celda, alias));
}

/**
 * Devuelve la letra de una columna a partir de su índice (0 = A).
 */
function letraColumna(indice) {
  let numero = Number(indice) + 1;
  let letra = '';

  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    numero = Math.floor((numero - 1) / 26);
  }

  return letra;
}

/**
 * Detecta en qué fila está el encabezado y en qué columna está cada dato.
 * Así podemos leer pestañas históricas sin romper nada.
 */
function detectarMapa(filas) {
  let filaEncabezado = -1;

  for (let i = 0; i < Math.min(filas.length, 20); i += 1) {
    const fila = filas[i] || [];
    if (fila.some((celda) => coincideEncabezado(celda, ALIAS.asignatura))) {
      filaEncabezado = i;
      break;
    }
  }

  if (filaEncabezado === -1) {
    filaEncabezado = FILAS_ENCABEZADO - 1;
  }

  const encabezado = filas[filaEncabezado] || [];
  const mapa = {};

  for (const columna of COLUMNAS) {
    const indice = buscarColumna(encabezado, columna.key);
    if (indice >= 0) mapa[columna.key] = indice;
  }

  if (mapa.numero === undefined) mapa.numero = 0;
  if (mapa.asignatura === undefined) mapa.asignatura = 3;
  if (mapa.semestre === undefined) mapa.semestre = 1;
  if (mapa.carrera === undefined) mapa.carrera = 2;
  if (mapa.seccion === undefined) mapa.seccion = 4;
  if (mapa.tipo === undefined) mapa.tipo = 5;
  if (mapa.docente === undefined) mapa.docente = 6;
  if (mapa.observacion === undefined) mapa.observacion = 7;
  if (mapa.reemplazante === undefined) mapa.reemplazante = 8;
  if (mapa.aula === undefined) mapa.aula = 11;

  // Las horas están justo antes de AULA. El encabezado de las horas
  // suele estar combinado y no aparece en la lectura de valores.
  if (mapa.horaInicio === undefined) mapa.horaInicio = Math.max(0, mapa.aula - 2);
  if (mapa.horaFin === undefined) mapa.horaFin = Math.max(0, mapa.aula - 1);

  if (mapa.estado === undefined) {
    const indiceEstado = encabezado.findIndex((celda) => {
      const valor = normalizarEncabezado(celda);
      return valor.includes('P - R') || valor.includes('P-R') || valor.includes('P / R');
    });
    mapa.estado = indiceEstado >= 0 ? indiceEstado : mapa.aula + 1;
  }

  return {
    filaEncabezado,
    primeraFilaDatos: filaEncabezado + 2, // 1-based
    mapa,
    ultimaColumna: Math.max(...Object.values(mapa)),
  };
}

module.exports = {
  COLUMNAS,
  COLUMNAS_BASE,
  FILAS_ENCABEZADO,
  PRIMERA_FILA_DATOS,
  ULTIMA_COLUMNA,
  PESTANA_BASE,
  ALIAS,
  normalizarEncabezado,
  buscarColumna,
  letraColumna,
  detectarMapa,
};
