'use strict';

const DIAS = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
];

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
 * Devuelve el nombre de pestaña con el formato acordado:
 * "LUNES 9/3/2026" (sin ceros a la izquierda).
 */
function formatearPestana(fecha) {
  const partes = parseFecha(fecha);
  if (!partes) {
    throw new Error(`Fecha inválida: ${fecha}. Se esperaba el formato YYYY-MM-DD.`);
  }
  return `${DIAS[partes.diaSemana]} ${partes.dia}/${partes.mes}/${partes.anio}`;
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
  DIAS,
  parseFecha,
  fechaValida,
  formatearPestana,
  hoyISO,
};
