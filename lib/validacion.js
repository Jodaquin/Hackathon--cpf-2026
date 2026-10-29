'use strict';

const ESTADOS = ['normal', 'ausente', 'reemplazo', 'cambio de aula', 'suspendida'];

const CAMPOS_OBLIGATORIOS = [
  'carrera',
  'semestre',
  'asignatura',
  'seccion',
  'tipo',
  'docente',
  'horaInicio',
  'horaFin',
  'aula',
  'estado',
];

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

function normalizarHora(valor) {
  const original = texto(valor);
  const match = /^(\d{1,2}):(\d{2})$/.exec(original);
  if (!match) return original;

  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return original;

  return `${String(horas).padStart(2, '0')}:${match[2]}`;
}

/**
 * Normaliza y valida una clase antes de escribirla en la planilla.
 * Devuelve los datos limpios y un objeto de errores por campo.
 */
function validarClase(body = {}) {
  const datos = {
    carrera: texto(body.carrera),
    semestre: texto(body.semestre),
    asignatura: texto(body.asignatura),
    seccion: texto(body.seccion),
    tipo: texto(body.tipo),
    docente: texto(body.docente),
    horaInicio: normalizarHora(body.horaInicio),
    horaFin: normalizarHora(body.horaFin),
    aula: texto(body.aula),
    estado: texto(body.estado).toLowerCase(),
    observacion: texto(body.observacion),
    reemplazante: texto(body.reemplazante),
  };

  const errores = {};

  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!datos[campo]) errores[campo] = 'Este campo es obligatorio.';
  }

  if (datos.estado && !ESTADOS.includes(datos.estado)) {
    errores.estado = `Elegí una opción válida: ${ESTADOS.join(', ')}.`;
  }

  for (const campo of ['horaInicio', 'horaFin']) {
    if (datos[campo] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos[campo])) {
      errores[campo] = 'Usá el formato HH:MM (por ejemplo, 09:30).';
    }
  }

  if (datos.horaInicio && datos.horaFin && !errores.horaInicio && !errores.horaFin) {
    if (datos.horaFin <= datos.horaInicio) {
      errores.horaFin = 'La hora de fin debe ser posterior a la hora de inicio.';
    }
  }

  if (datos.observacion.length > 500) {
    errores.observacion = 'La observación no puede superar los 500 caracteres.';
  }

  // El reemplazante solo tiene sentido cuando el estado es "reemplazo".
  if (datos.estado === 'reemplazo') {
    if (!datos.reemplazante) {
      errores.reemplazante = 'Indicá qué docente realiza el reemplazo.';
    }
  } else {
    datos.reemplazante = '';
  }

  return {
    ok: Object.keys(errores).length === 0,
    datos,
    errores,
  };
}

module.exports = { ESTADOS, CAMPOS_OBLIGATORIOS, validarClase, normalizarHora };
