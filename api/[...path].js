'use strict';

// Vercel: todas las rutas /api/* llegan a esta función serverless,
// que reutiliza la misma aplicación Express del entorno local.
module.exports = require('../app');
