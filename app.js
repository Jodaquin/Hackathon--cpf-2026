'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');

const catalogo = require('./catalogo.json');
const {
  fechaValida,
  hoyISO,
  etiquetaDia,
  DIAS_BASE,
  diaSemanaDeFecha,
} = require('./lib/fechas');
const {
  ESTADOS,
  VALORES_ESTADO,
  validarClase,
  validarCambios,
} = require('./lib/validacion');
const {
  estadoConfiguracion,
  leerDia,
  leerBase,
  leerAulas,
  agregarClase,
  actualizarClase,
  prepararDia,
  agregarBase,
  importarBase,
  eliminarBase,
  obtenerHojas,
  traducirErrorGoogle,
} = require('./lib/sheets');
const { parsearImportacion } = require('./lib/importar');
const { registrarAuditoria, estadoAuditoria } = require('./lib/auditoria');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function zonaHoraria() {
  return process.env.TZ || 'America/Argentina/Buenos_Aires';
}

function fechaDeHoy() {
  return hoyISO(zonaHoraria());
}

function responderError(res, error) {
  if (error?.status && error?.publicMessage) {
    return res.status(error.status).json({ error: error.publicMessage });
  }

  if (error?.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: 'El cuerpo de la solicitud no es un JSON válido.' });
  }

  const traducido = traducirErrorGoogle(error);
  return res.status(traducido.status).json({ error: traducido.message });
}

function asyncHandler(manejador) {
  return (req, res, next) => {
    Promise.resolve(manejador(req, res, next)).catch(next);
  };
}

function leerFecha(req, res) {
  const fecha = String(
    req.body?.fecha ?? req.query?.fecha ?? fechaDeHoy(),
  ).trim();

  if (!fechaValida(fecha)) {
    res.status(400).json({
      error: 'La fecha no es válida. Usá el formato YYYY-MM-DD.',
      errores: { fecha: 'Elegí una fecha válida.' },
    });
    return null;
  }

  return fecha;
}

// ------------------------------------------------------------
//  Estado de la configuración
// ------------------------------------------------------------
app.get('/api/estado', (req, res) => {
  const estado = estadoConfiguracion();
  res.json({
    ...estado,
    fechaHoy: fechaDeHoy(),
    auditoria: estadoAuditoria(),
  });
});

// ------------------------------------------------------------
//  Catálogos para los selectores del formulario
// ------------------------------------------------------------
app.get('/api/catalogo', (req, res) => {
  res.json({
    ...catalogo,
    estados: ESTADOS,
    valoresEstado: VALORES_ESTADO,
    diasInfo: DIAS_BASE.map((dia) => ({
      valor: dia,
      etiqueta: etiquetaDia(dia),
    })),
  });
});

// ------------------------------------------------------------
//  Leer la pestaña de un día
// ------------------------------------------------------------
app.get(
  '/api/dia',
  asyncHandler(async (req, res) => {
    const fecha = leerFecha(req, res);
    if (!fecha) return;

    const resultado = await leerDia(fecha);
    res.json({ configurado: true, ...resultado });
  }),
);

// Alias viejo, para no romper enlaces de la demo anterior.
app.get(
  '/api/demo-json',
  asyncHandler(async (req, res) => {
    const fecha = leerFecha(req, res);
    if (!fecha) return;

    const resultado = await leerDia(fecha);
    res.json({ configurado: true, ...resultado });
  }),
);

// ------------------------------------------------------------
//  Tabla base semanal
// ------------------------------------------------------------
app.get(
  '/api/base',
  asyncHandler(async (req, res) => {
    const resultado = await leerBase();
    res.json({
      configurado: true,
      ...resultado,
      dias: DIAS_BASE.map((dia) => ({
        valor: dia,
        etiqueta: etiquetaDia(dia),
        total: resultado.porDia?.[dia] || 0,
      })),
    });
  }),
);

app.post(
  '/api/base',
  asyncHandler(async (req, res) => {
    const { ok, datos, errores } = validarClase(req.body || {}, { esBase: true });
    if (!ok) {
      return res.status(400).json({
        error: 'Revisá los campos marcados.',
        errores,
      });
    }

    const resultado = await agregarBase(datos);
    res.status(201).json({
      ok: true,
      mensaje: 'Clase agregada a la tabla base.',
      ...resultado,
    });
  }),
);

app.post(
  '/api/base/importar',
  asyncHandler(async (req, res) => {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) {
      return res.status(400).json({
        error: 'Pegá al menos una fila para importar.',
      });
    }

    const parseado = parsearImportacion(texto);
    if (!parseado.total) {
      return res.status(400).json({
        error: 'No se encontraron filas con datos.',
      });
    }

    const validas = [];
    const errores = [];

    for (const fila of parseado.filas) {
      const resultado = validarClase(fila.datos, { esBase: true });
      if (resultado.ok) {
        validas.push(resultado.datos);
      } else {
        errores.push({ linea: fila.linea, errores: resultado.errores });
      }
    }

    if (!validas.length) {
      return res.status(400).json({
        error: 'Ninguna fila es válida. Revisá el formato.',
        errores,
      });
    }

    const resultado = await importarBase(validas);

    res.status(201).json({
      ok: true,
      mensaje: `${resultado.agregadas} fila(s) agregadas a la tabla base.`,
      ...resultado,
      errores,
    });
  }),
);

app.delete(
  '/api/base/:fila',
  asyncHandler(async (req, res) => {
    const resultado = await eliminarBase(req.params.fila);
    res.json({ ok: true, mensaje: 'Fila eliminada de la tabla base.', ...resultado });
  }),
);

// ------------------------------------------------------------
//  Disponibilidad de aulas (pestaña "DA")
// ------------------------------------------------------------
app.get(
  '/api/aulas',
  asyncHandler(async (req, res) => {
    const resultado = await leerAulas();
    res.json({
      configurado: true,
      ...resultado,
      porAula: resultado.filas.reduce((acumulado, fila) => {
        const clave = fila.aula || 'SIN AULA';
        acumulado[clave] = acumulado[clave] || [];
        acumulado[clave].push(fila);
        return acumulado;
      }, {}),
    });
  }),
);

// ------------------------------------------------------------
//  Preparar el día desde la tabla base
// ------------------------------------------------------------
app.post(
  '/api/dia/desde-base',
  asyncHandler(async (req, res) => {
    const fecha = leerFecha(req, res);
    if (!fecha) return;

    const resultado = await prepararDia(fecha);
    res.status(resultado.creado ? 201 : 200).json({
      ok: true,
      ...resultado,
    });
  }),
);

// ------------------------------------------------------------
//  Guardar una clase nueva en el día
// ------------------------------------------------------------
app.post(
  '/api/clases',
  asyncHandler(async (req, res) => {
    const cuerpo = req.body || {};
    const fecha = String(
      cuerpo.fecha === undefined ? fechaDeHoy() : cuerpo.fecha,
    ).trim();

    if (!fechaValida(fecha)) {
      return res.status(400).json({
        error: 'La fecha no es válida.',
        errores: { fecha: 'Elegí una fecha válida.' },
      });
    }

    const { ok, datos, errores } = validarClase(cuerpo);
    if (!ok) {
      return res.status(400).json({
        error: 'Revisá los campos marcados.',
        errores,
      });
    }

    datos.estado = datos.estado || 'P';
    const resultado = await agregarClase(fecha, datos);

    registrarAuditoria({
      fecha,
      pestana: resultado.pestana,
      fila: resultado.fila,
      carrera: datos.carrera,
      semestre: datos.semestre,
      asignatura: datos.asignatura,
      seccion: datos.seccion,
      tipo: datos.tipo,
      docente: datos.docente,
      hora_inicio: datos.horaInicio,
      hora_fin: datos.horaFin,
      aula: datos.aula,
      estado: datos.estado,
      observacion: datos.observacion,
      reemplazante: datos.reemplazante,
    }).catch((error) => {
      console.warn('[auditoría] No se pudo registrar en Supabase:', error.message);
    });

    res.status(201).json({
      ok: true,
      mensaje: `Clase guardada en la pestaña ${resultado.pestana}.`,
      ...resultado,
    });
  }),
);

// ------------------------------------------------------------
//  Actualizar presencia, aula, reemplazante u observación
// ------------------------------------------------------------
app.patch(
  '/api/clases',
  asyncHandler(async (req, res) => {
    const cuerpo = req.body || {};
    const fecha = String(cuerpo.fecha || '').trim();

    if (!fechaValida(fecha)) {
      return res.status(400).json({
        error: 'La fecha no es válida.',
        errores: { fecha: 'Elegí una fecha válida.' },
      });
    }

    const fila = Number(cuerpo.fila);
    if (!Number.isInteger(fila) || fila < 2) {
      return res.status(400).json({
        error: 'La fila no es válida.',
        errores: { fila: 'La fila indicada no es válida.' },
      });
    }

    const { ok, datos, errores } = validarCambios(cuerpo);
    if (!ok) {
      return res.status(400).json({
        error: 'No se pudo actualizar la clase.',
        errores,
      });
    }

    const resultado = await actualizarClase(fecha, fila, datos);
    res.json({
      ok: true,
      mensaje: 'Clase actualizada.',
      ...resultado,
    });
  }),
);

// ------------------------------------------------------------
//  Diagnóstico
// ------------------------------------------------------------
app.get(
  '/api/pestanas',
  asyncHandler(async (req, res) => {
    const hojas = await obtenerHojas();
    res.json({
      total: hojas.length,
      pestanas: hojas.map((hoja) => hoja.titulo),
      diaSemanaHoy: diaSemanaDeFecha(fechaDeHoy()),
    });
  }),
);

// ------------------------------------------------------------
//  Manejo de errores
// ------------------------------------------------------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Esa ruta de la API no existe.' });
});

app.use((error, req, res, next) => {
  console.error('[error]', error?.message || error);
  if (res.headersSent) return next(error);
  responderError(res, error);
});

module.exports = app;
