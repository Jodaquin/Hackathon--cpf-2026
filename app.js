'use strict';

require('dotenv').config({ quiet: true });

const path = require('node:path');
const express = require('express');
const cors = require('cors');

const catalogo = require('./catalogo.json');
const { fechaValida, hoyISO } = require('./lib/fechas');
const { ESTADOS, validarClase } = require('./lib/validacion');
const {
  estadoConfiguracion,
  leerDemo,
  agregarClase,
  obtenerTitulos,
  traducirErrorGoogle,
} = require('./lib/sheets');
const { registrarAuditoria, estadoAuditoria } = require('./lib/auditoria');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '64kb' }));
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
  });
});

// ------------------------------------------------------------
//  Demo: leer la pestaña del día y devolver JSON
// ------------------------------------------------------------
app.get(
  '/api/demo-json',
  asyncHandler(async (req, res) => {
    const fecha = String(req.query.fecha || fechaDeHoy()).trim();

    if (!fechaValida(fecha)) {
      return res.status(400).json({
        error: 'La fecha no es válida. Usá el formato YYYY-MM-DD.',
      });
    }

    const resultado = await leerDemo(fecha);
    res.json({ configurado: true, ...resultado });
  }),
);

// ------------------------------------------------------------
//  Guardar una clase
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
//  Diagnóstico: listar pestañas existentes
// ------------------------------------------------------------
app.get(
  '/api/pestanas',
  asyncHandler(async (req, res) => {
    const pestanas = await obtenerTitulos();
    res.json({ total: pestanas.length, pestanas });
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
