'use strict';

/**
 * Auditoría opcional en Supabase.
 * Si SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configuradas,
 * la función no hace nada y la app sigue funcionando con Google Sheets.
 */
function leerConfiguracion() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const tabla = String(process.env.SUPABASE_AUDIT_TABLE || 'clases_auditoria').trim();

  return {
    configurada: Boolean(url && key && tabla),
    url,
    key,
    tabla,
  };
}

function estadoAuditoria() {
  const config = leerConfiguracion();
  return {
    configurada: config.configurada,
    tabla: config.tabla,
  };
}

async function registrarAuditoria(registro) {
  const config = leerConfiguracion();
  if (!config.configurada) {
    return { omitida: true, motivo: 'Supabase no está configurado.' };
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 5000);

  try {
    const respuesta = await fetch(
      `${config.url}/rest/v1/${encodeURIComponent(config.tabla)}`,
      {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify([registro]),
        signal: controlador.signal,
      },
    );

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Supabase respondió ${respuesta.status}. ${detalle}`.trim());
    }

    return { ok: true };
  } finally {
    clearTimeout(temporizador);
  }
}

module.exports = { registrarAuditoria, estadoAuditoria };
