'use strict';

const { normalizarDia } = require('./fechas');

const ESTADOS = [
  {
    valor: 'P',
    etiqueta: 'Presente',
    descripcion: 'La clase se dictó con normalidad.',
  },
  {
    valor: 'A',
    etiqueta: 'Ausente',
    descripcion: 'El docente no asistió y no hubo aviso.',
  },
  {
    valor: 'AA',
    etiqueta: 'Ausente con aviso',
    descripcion: 'La ausencia se informó con anticipación.',
  },
  {
    valor: 'R',
    etiqueta: 'Reemplazante',
    descripcion: 'Otra persona cubrió la clase.',
  },
];

const VALORES_ESTADO = ESTADOS.map((estado) => estado.valor);

// Datos mínimos para identificar una clase. Docente, aula y observación
// pueden quedar vacíos porque la planilla real también los deja vacíos.
const CAMPOS_OBLIGATORIOS = [
  'semestre',
  'carrera',
  'asignatura',
  'seccion',
  'tipo',
  'horaInicio',
  'horaFin',
];

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

function textoMayusculas(valor) {
  return texto(valor).toUpperCase();
}

function normalizarHora(valor) {
  const original = texto(valor);
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(original);
  if (!match) return original;

  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return original;

  return `${String(horas).padStart(2, '0')}:${match[2]}`;
}

/**
 * Acepta tanto los códigos nuevos (P, A, AA, R) como las palabras que
 * se usaban antes en la app (normal, ausente, reemplazo...).
 */
function normalizarEstado(valor) {
  const limpio = texto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (VALORES_ESTADO.includes(limpio)) return limpio;

  const palabras = {
    PRESENTE: 'P',
    NORMAL: 'P',
    AUSENTE: 'A',
    'AUSENTE CON AVISO': 'AA',
    AVISO: 'AA',
    REEMPLAZANTE: 'R',
    REEMPLAZO: 'R',
  };

  return palabras[limpio] || '';
}

/**
 * Unifica "1", "1º" y "1°" en "1º". Así los datos nuevos mantienen
 * siempre el mismo tipo de valor.
 */
function normalizarSemestre(valor) {
  const limpio = texto(valor).replace(/°/g, 'º').toUpperCase();

  const soloNumero = /^(\d{1,2})$/.exec(limpio);
  if (soloNumero) return `${Number(soloNumero[1])}º`;

  const conSimbolo = /^(\d{1,2})\s*º$/.exec(limpio);
  if (conSimbolo) return `${Number(conSimbolo[1])}º`;

  return limpio;
}

function validarClase(body = {}, opciones = {}) {
  const esBase = Boolean(opciones.esBase);

  const datos = {
    numero: texto(body.numero),
    dia: esBase ? normalizarDia(body.dia) : '',
    semestre: normalizarSemestre(body.semestre),
    carrera: textoMayusculas(body.carrera),
    asignatura: texto(body.asignatura),
    seccion: textoMayusculas(body.seccion),
    tipo: textoMayusculas(body.tipo),
    docente: texto(body.docente),
    horaInicio: normalizarHora(body.horaInicio),
    horaFin: normalizarHora(body.horaFin),
    aula: textoMayusculas(body.aula),
    observacion: texto(body.observacion),
    reemplazante: texto(body.reemplazante),
    estado: esBase ? '' : normalizarEstado(body.estado || 'P'),
  };

  const errores = {};

  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!datos[campo]) errores[campo] = 'Este campo es obligatorio.';
  }

  if (esBase && !datos.dia) {
    errores.dia = 'Elegí el día de la semana.';
  }

  if (!esBase && !datos.estado) {
    errores.estado = `Elegí uno de estos estados: ${VALORES_ESTADO.join(', ')}.`;
  }

  if (datos.numero && !/^\d+$/.test(datos.numero)) {
    errores.numero = 'El número debe ser un número entero.';
  }

  for (const campo of ['horaInicio', 'horaFin']) {
    if (datos[campo] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos[campo])) {
      errores[campo] = 'Usá el formato HH:MM (por ejemplo, 09:30).';
    }
  }

  if (
    datos.horaInicio &&
    datos.horaFin &&
    !errores.horaInicio &&
    !errores.horaFin &&
    datos.horaFin <= datos.horaInicio
  ) {
    errores.horaFin = 'La hora de fin debe ser posterior a la hora de inicio.';
  }

  if (datos.asignatura.length > 200) {
    errores.asignatura = 'La asignatura no puede superar los 200 caracteres.';
  }

  if (datos.docente.length > 120) {
    errores.docente = 'El docente no puede superar los 120 caracteres.';
  }

  if (datos.aula.length > 60) {
    errores.aula = 'El aula no puede superar los 60 caracteres.';
  }

  if (datos.observacion.length > 500) {
    errores.observacion = 'La observación no puede superar los 500 caracteres.';
  }

  if (datos.reemplazante.length > 120) {
    errores.reemplazante = 'El reemplazante no puede superar los 120 caracteres.';
  }

  // El reemplazante solo tiene sentido con estado R. Puede quedar vacío:
  // muchas veces el nombre se confirma a último momento.
  if (!esBase && datos.estado !== 'R') {
    datos.reemplazante = '';
  }

  datos.numero = datos.numero ? Number(datos.numero) : null;

  return {
    ok: Object.keys(errores).length === 0,
    datos,
    errores,
  };
}

/**
 * Valida los cambios que se hacen desde la tabla del día.
 */
function validarCambios(body = {}) {
  const datos = {};
  const errores = {};
  const permitidos = ['estado', 'aula', 'reemplazante', 'observacion'];

  for (const campo of permitidos) {
    if (!Object.prototype.hasOwnProperty.call(body, campo)) continue;

    if (campo === 'estado') {
      const estado = normalizarEstado(body.estado);
      if (!estado) {
        errores.estado = `Elegí uno de estos estados: ${VALORES_ESTADO.join(', ')}.`;
      } else {
        datos.estado = estado;
      }
      continue;
    }

    const valor = texto(body[campo]);
    if (campo === 'aula') {
      datos.aula = valor.toUpperCase();
      if (datos.aula.length > 60) errores.aula = 'El aula es demasiado larga.';
    }

    if (campo === 'reemplazante') {
      datos.reemplazante = valor;
      if (valor.length > 120) {
        errores.reemplazante = 'El reemplazante es demasiado largo.';
      }
    }

    if (campo === 'observacion') {
      datos.observacion = valor;
      if (valor.length > 500) {
        errores.observacion = 'La observación no puede superar los 500 caracteres.';
      }
    }
  }

  if (Object.keys(datos).length === 0 && Object.keys(errores).length === 0) {
    errores.general = 'No hay cambios para guardar.';
  }

  if (datos.estado && datos.estado !== 'R' && datos.reemplazante === undefined) {
    datos.reemplazante = '';
  }

  return {
    ok: Object.keys(errores).length === 0,
    datos,
    errores,
  };
}

function resumenEstados(filas = []) {
  const resumen = { P: 0, A: 0, AA: 0, R: 0, total: filas.length };
  for (const fila of filas) {
    const estado = normalizarEstado(fila.estado) || '';
    if (resumen[estado] !== undefined) resumen[estado] += 1;
  }
  return resumen;
}

module.exports = {
  ESTADOS,
  VALORES_ESTADO,
  CAMPOS_OBLIGATORIOS,
  texto,
  textoMayusculas,
  normalizarHora,
  normalizarEstado,
  normalizarSemestre,
  validarClase,
  validarCambios,
  resumenEstados,
};
