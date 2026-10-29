'use strict';

// Nombres que usa la app para las pestañas. Sin tildes y en mayúsculas,
// igual que la pestaña de referencia "LUNES 26/10/2026" de la planilla.
const DIAS_PESTANA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
];

// Nombres lindos para mostrar en pantalla.
const DIAS_ETIQUETA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const DIAS_BASE = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

function quitarTildes(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convierte "miércoles", "MIERCOLES", "Sábado", etc. al valor canónico
 * que se guarda en la tabla base: MIERCOLES, SABADO...
 */
function normalizarDia(valor) {
  const limpio = quitarTildes(valor).replace(/\s+/g, ' ').trim().toUpperCase();
  if (!limpio) return '';
  if (limpio === 'MIÉRCOLES') return 'MIERCOLES';
  return DIAS_BASE.includes(limpio) ? limpio : '';
}

function etiquetaDia(valor) {
  const dia = normalizarDia(valor);
  const indice = DIAS_BASE.indexOf(dia);
  return indice >= 0 ? DIAS_ETIQUETA[indice + 1] : String(valor ?? '');
}

/**
 * Valida y descompone una fecha en formato YYYY-MM-DD.
 * Se trabaja siempre en UTC para que el cambio de zona horaria
 * no mueva el día y el nombre de la pestaña quede siempre igual.
 */
function parseFecha(fecha) {
  if (typeof fecha !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!match) return null;

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);

  const date = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    date.getUTCFullYear() !== anio ||
    date.getUTCMonth() !== mes - 1 ||
    date.getUTCDate() !== dia
  ) {
    return null;
  }

  return { anio, mes, dia, diaSemana: date.getUTCDay() };
}

function fechaValida(fecha) {
  return parseFecha(fecha) !== null;
}

/**
 * Nombre canónico de pestaña: "LUNES 26/10/2026".
 */
function formatearPestana(fecha) {
  const partes = parseFecha(fecha);
  if (!partes) {
    throw new Error(`Fecha inválida: ${fecha}. Se esperaba el formato YYYY-MM-DD.`);
  }
  return `${DIAS_PESTANA[partes.diaSemana]} ${partes.dia}/${partes.mes}/${partes.anio}`;
}

function diaSemanaDeFecha(fecha) {
  const partes = parseFecha(fecha);
  if (!partes) return '';
  return DIAS_PESTANA[partes.diaSemana];
}

/**
 * Lee nombres de pestaña como "Martes 27/10/2026" o "SABADO 31/10/26"
 * y devuelve la fecha y el día que representan.
 */
function parsearTituloPestana(titulo) {
  const texto = quitarTildes(titulo).toUpperCase();
  const dia = DIAS_BASE.find((nombre) => texto.includes(nombre));
  const fecha = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/.exec(texto);

  if (!dia || !fecha) return null;

  let anio = Number(fecha[3]);
  if (anio < 100) anio += 2000;

  const diaNumero = Number(fecha[1]);
  const mes = Number(fecha[2]);
  const iso = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(
    diaNumero,
  ).padStart(2, '0')}`;

  const partes = parseFecha(iso);
  if (!partes) return null;

  return {
    titulo,
    dia,
    anio,
    mes,
    diaNumero,
    fecha: iso,
    diaSemana: DIAS_PESTANA[partes.diaSemana],
  };
}

/**
 * Busca una pestaña existente para la fecha, aceptando las variantes
 * históricas de nombre ("Martes" con mayúscula, "SABADO" sin tilde, etc.).
 * Si no existe, devuelve el nombre canónico que hay que crear.
 */
function resolverTituloPestana(fecha, titulos = []) {
  const partes = parseFecha(fecha);
  if (!partes) {
    throw new Error(`Fecha inválida: ${fecha}. Se esperaba el formato YYYY-MM-DD.`);
  }

  const encontrada = titulos.find((titulo) => {
    const info = parsearTituloPestana(titulo);
    return (
      info &&
      info.fecha === fecha &&
      info.diaSemana === DIAS_PESTANA[partes.diaSemana]
    );
  });

  return encontrada || formatearPestana(fecha);
}

/**
 * Fecha de "hoy" en la zona horaria indicada, como YYYY-MM-DD.
 */
function hoyISO(zonaHoraria = 'America/Argentina/Buenos_Aires') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const partes = formatter.formatToParts(new Date());
    const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
    const anio = valor('year');
    const mes = valor('month');
    const dia = valor('day');
    if (anio && mes && dia) return `${anio}-${mes}-${dia}`;
  } catch {
    // Si la zona horaria no existe, usamos la fecha local del servidor.
  }

  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

module.exports = {
  DIAS_PESTANA,
  DIAS_ETIQUETA,
  DIAS_BASE,
  parseFecha,
  fechaValida,
  formatearPestana,
  diaSemanaDeFecha,
  normalizarDia,
  etiquetaDia,
  parsearTituloPestana,
  resolverTituloPestana,
  hoyISO,
};
