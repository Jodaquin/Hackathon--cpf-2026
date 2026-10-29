'use strict';

// En Vercel una función serverless puede exportar la app Express completa.
// El catch-all /api/[...path] también la reexporta; este archivo es el
// endpoint principal de la función en Vercel.
module.exports = require('../app');
