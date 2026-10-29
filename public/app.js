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

const form = document.getElementById('formClase');
const fecha = document.getElementById('fecha');
const estado = document.getElementById('estado');
const reemplazante = document.getElementById('reemplazante');
const observacion = document.getElementById('observacion');
const contadorObservacion = document.getElementById('contadorObservacion');
const vistaPestana = document.getElementById('vistaPestana');
const btnGuardar = document.getElementById('btnGuardar');
const btnRefrescar = document.getElementById('btnRefrescar');
const btnCopiarJson = document.getElementById('btnCopiarJson');
const tablaWrap = document.getElementById('tablaWrap');
const subtituloVista = document.getElementById('subtituloVista');
const jsonSalida = document.getElementById('jsonSalida');
const formError = document.getElementById('formError');
const avisoCredenciales = document.getElementById('avisoCredenciales');
const avisoDetalle = document.getElementById('avisoDetalle');
const estadoConexion = document.getElementById('estadoConexion');
const estadoTexto = document.getElementById('estadoTexto');
const pieConfiguracion = document.getElementById('pieConfiguracion');
const toast = document.getElementById('toast');
const toastTexto = document.getElementById('toastTexto');

const idCarreras = {
  carrera: 'carreras',
  semestre: 'semestres',
  asignatura: 'asignaturas',
  seccion: 'secciones',
  tipo: 'tipos',
  docente: 'docentes',
  aula: 'aulas',
};

let temporizadorToast = null;

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  fecha.value = hoyISO();
  actualizarPestana();
  sincronizarReemplazante();
  actualizarContador();
  conectarEventos();

  await Promise.all([cargarEstado(), cargarCatalogo()]);
  await cargarVista();
}

function conectarEventos() {
  fecha.addEventListener('change', async () => {
    actualizarPestana();
    await cargarVista();
  });

  estado.addEventListener('change', sincronizarReemplazante);

  observacion.addEventListener('input', actualizarContador);

  form.addEventListener('input', (evento) => {
    if (evento.target?.name) limpiarErrorCampo(evento.target.name);
  });

  form.addEventListener('submit', guardarClase);

  btnRefrescar.addEventListener('click', async () => {
    btnRefrescar.classList.add('is-spinning');
    await cargarVista();
    setTimeout(() => btnRefrescar.classList.remove('is-spinning'), 350);
  });

  btnCopiarJson.addEventListener('click', copiarJson);
}

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------
function hoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function formatearPestana(valorFecha) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valorFecha || '');
  if (!match) return '—';

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fechaObj = new Date(Date.UTC(anio, mes - 1, dia));

  return `${DIAS[fechaObj.getUTCDay()]} ${dia}/${mes}/${anio}`;
}

function actualizarPestana() {
  vistaPestana.textContent = formatearPestana(fecha.value);
}

function actualizarContador() {
  contadorObservacion.textContent = String(observacion.value.length);
}

function sincronizarReemplazante() {
  const esReemplazo = estado.value === 'reemplazo';
  reemplazante.disabled = !esReemplazo;
  reemplazante.required = esReemplazo;

  if (!esReemplazo) {
    reemplazante.value = '';
    limpiarErrorCampo('reemplazante');
  }

  const pista = document.getElementById('hintReemplazante');
  if (pista) {
    pista.textContent = esReemplazo
      ? 'Obligatorio: elegí quién cubre la clase.'
      : 'Se habilita cuando el estado es “reemplazo”.';
  }
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slug(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

async function api(url, opciones = {}) {
  const respuesta = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const error = new Error(datos?.error || `Error ${respuesta.status}`);
    error.status = respuesta.status;
    error.data = datos;
    throw error;
  }

  return datos;
}

// ------------------------------------------------------------
//  Estado de conexión y catálogos
// ------------------------------------------------------------
async function cargarEstado() {
  try {
    const datos = await api('/api/estado');

    if (datos.configurado) {
      establecerConexion('ok', 'Google Sheets conectado');
      pieConfiguracion.textContent = `Conectado a la planilla ${datos.spreadsheetIdVisible || ''}`.trim();
      avisoCredenciales.hidden = true;
    } else {
      establecerConexion('error', 'Falta configurar');
      pieConfiguracion.textContent = 'Configuración pendiente';
      mostrarAvisoConfiguracion(datos);
    }
  } catch {
    establecerConexion('error', 'Servidor no disponible');
    pieConfiguracion.textContent = 'No se pudo contactar al servidor';
  }
}

function establecerConexion(tipo, texto) {
  estadoConexion.className = `status status--${tipo}`;
  estadoTexto.textContent = texto;
}

function mostrarAvisoConfiguracion(datos) {
  avisoCredenciales.hidden = false;

  const faltantes = Array.isArray(datos.faltantes) && datos.faltantes.length
    ? `Falta completar: <strong>${escaparHtml(datos.faltantes.join(' · '))}</strong>.`
    : 'Revisá el archivo <code>.env</code>.';

  const correo = datos.emailCuentaServicio
    ? `<br />Compartí la planilla con <code>${escaparHtml(datos.emailCuentaServicio)}</code> como <strong>Editor</strong>.`
    : '';

  avisoDetalle.innerHTML = `
    ${faltantes}${correo}
    <br />La guía está en <code>README.md</code> → “Credenciales de Google”.
  `;
}

async function cargarCatalogo() {
  try {
    const datos = await api('/api/catalogo');

    for (const [campo, clave] of Object.entries(idCarreras)) {
      llenarSelect(document.getElementById(campo), datos[clave] || [], 'Seleccionar…');
    }

    llenarSelect(reemplazante, datos.docentes || [], '— Sin reemplazante —');
    sincronizarReemplazante();
  } catch {
    mostrarToast('No se pudieron cargar los catálogos.', 'error');
  }
}

function llenarSelect(select, opciones, textoVacio) {
  if (!select) return;

  const valorPrevio = select.value;
  select.innerHTML = '';

  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = textoVacio;
  select.appendChild(vacia);

  for (const opcion of opciones) {
    const elemento = document.createElement('option');
    elemento.value = String(opcion);
    elemento.textContent = String(opcion);
    select.appendChild(elemento);
  }

  if (valorPrevio) select.value = valorPrevio;
}

// ------------------------------------------------------------
//  Guardar
// ------------------------------------------------------------
async function guardarClase(evento) {
  evento.preventDefault();
  limpiarErrores();

  const datos = Object.fromEntries(new FormData(form).entries());
  datos.fecha = fecha.value;
  datos.reemplazante = estado.value === 'reemplazo' ? datos.reemplazante || '' : '';

  const errores = validarFormulario(datos);

  if (Object.keys(errores).length > 0) {
    mostrarErrores(errores);
    return;
  }

  const fechaGuardada = datos.fecha;
  activarBoton(true);

  try {
    const resultado = await api('/api/clases', {
      method: 'POST',
      body: JSON.stringify(datos),
    });

    const textoFila = resultado.fila ? ` (fila ${resultado.fila})` : '';
    mostrarToast(`Clase guardada en ${resultado.pestana}${textoFila}.`, 'ok');

    form.reset();
    fecha.value = fechaGuardada;
    actualizarPestana();
    sincronizarReemplazante();
    actualizarContador();

    await cargarVista();
  } catch (error) {
    manejarErrorApi(error);
  } finally {
    activarBoton(false);
  }
}

function validarFormulario(datos) {
  const errores = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    errores.fecha = 'Elegí la fecha de la clase.';
  }

  const obligatorios = [
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

  for (const campo of obligatorios) {
    if (!String(datos[campo] || '').trim()) {
      errores[campo] = 'Completá este campo.';
    }
  }

  if (datos.horaInicio && datos.horaFin && datos.horaFin <= datos.horaInicio) {
    errores.horaFin = 'La hora de fin debe ser posterior a la de inicio.';
  }

  if (datos.estado === 'reemplazo' && !datos.reemplazante) {
    errores.reemplazante = 'Indicá qué docente realiza el reemplazo.';
  }

  if (String(datos.observacion || '').length > 500) {
    errores.observacion = 'Máximo 500 caracteres.';
  }

  return errores;
}

function mostrarErrores(errores) {
  for (const [campo, mensaje] of Object.entries(errores)) {
    const elemento = document.querySelector(`[data-error-for="${campo}"]`);
    if (elemento) elemento.textContent = mensaje;

    const input = document.getElementById(campo);
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  formError.hidden = false;
  formError.textContent = 'Revisá los campos marcados antes de guardar.';

  const primero = Object.keys(errores)[0];
  document.getElementById(primero)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  document.getElementById(primero)?.focus({ preventScroll: true });
}

function limpiarErrorCampo(nombre) {
  const elemento = document.querySelector(`[data-error-for="${nombre}"]`);
  if (elemento) elemento.textContent = '';

  const input = document.getElementById(nombre);
  if (input) input.removeAttribute('aria-invalid');

  if (!document.querySelector('[data-error-for]:not(:empty)')) {
    formError.hidden = true;
    formError.textContent = '';
  }
}

function limpiarErrores() {
  document.querySelectorAll('[data-error-for]').forEach((elemento) => {
    elemento.textContent = '';
  });
  document.querySelectorAll('[aria-invalid]').forEach((elemento) => {
    elemento.removeAttribute('aria-invalid');
  });
  formError.hidden = true;
  formError.textContent = '';
}

function manejarErrorApi(error) {
  if (error.data?.errores) {
    mostrarErrores(error.data.errores);
  } else {
    formError.hidden = false;
    formError.textContent = error.message;
  }

  if (error.status === 503) {
    cargarEstado();
  }

  mostrarToast(error.message, 'error');
}

function activarBoton(activo) {
  btnGuardar.disabled = activo;
  btnGuardar.classList.toggle('is-loading', activo);
  btnGuardar.setAttribute('aria-busy', activo ? 'true' : 'false');
  btnGuardar.querySelector('.btn__label').textContent = activo
    ? 'Guardando…'
    : 'Guardar en Google Sheets';
}

// ------------------------------------------------------------
//  Vista previa de la planilla + JSON
// ------------------------------------------------------------
async function cargarVista() {
  if (!fecha.value) {
    subtituloVista.textContent = 'Elegí una fecha';
    tablaWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v4M16 2v4M3 10h18" />
            <rect x="3" y="4" width="18" height="18" rx="2" />
          </svg>
        </span>
        <p><strong>Elegí una fecha.</strong></p>
        <p class="muted">Vas a ver la pestaña correspondiente a ese día.</p>
      </div>
    `;
    jsonSalida.textContent = '{}';
    return;
  }

  subtituloVista.textContent = `Leyendo ${formatearPestana(fecha.value)}…`;
  tablaWrap.innerHTML = `
    <div class="skeleton" aria-label="Cargando">
      <span></span><span></span><span></span><span></span>
    </div>
  `;

  try {
    const datos = await api(`/api/demo-json?fecha=${encodeURIComponent(fecha.value)}`);
    renderizarTabla(datos);
    jsonSalida.textContent = JSON.stringify(datos, null, 2);
    subtituloVista.textContent = `${datos.total} clase(s) · ${datos.pestana}`;
  } catch (error) {
    renderizarErrorVista(error);
    jsonSalida.textContent = JSON.stringify(
      { error: error.message, ...(error.data || {}) },
      null,
      2,
    );
    subtituloVista.textContent = formatearPestana(fecha.value);
  }
}

function renderizarTabla(datos) {
  if (!datos.existe) {
    tablaWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <p><strong>La pestaña todavía no existe.</strong></p>
        <p class="muted">Se crea automáticamente al guardar la primera clase del día.</p>
      </div>
    `;
    return;
  }

  if (!datos.filas.length) {
    tablaWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </span>
        <p><strong>La pestaña está vacía.</strong></p>
        <p class="muted">Guardá la primera clase para verla acá.</p>
      </div>
    `;
    return;
  }

  const filas = datos.filas
    .map(
      (fila) => `
        <tr>
          <td class="cell-hora">${escaparHtml(fila.horaInicio)}–${escaparHtml(fila.horaFin)}</td>
          <td>
            <span class="cell-title">${escaparHtml(fila.asignatura)}</span>
            <span class="cell-sub">${escaparHtml(fila.carrera)} · ${escaparHtml(fila.semestre)} · Sec. ${escaparHtml(fila.seccion)}</span>
          </td>
          <td>${escaparHtml(fila.docente)}</td>
          <td>${escaparHtml(fila.aula)}</td>
          <td><span class="badge badge--${slug(fila.estado)}">${escaparHtml(fila.estado)}</span></td>
          <td>${fila.reemplazante ? escaparHtml(fila.reemplazante) : '<span class="muted">—</span>'}</td>
        </tr>
      `,
    )
    .join('');

  tablaWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Hora</th>
          <th>Asignatura</th>
          <th>Docente</th>
          <th>Aula</th>
          <th>Estado</th>
          <th>Reemplazante</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderizarErrorVista(error) {
  const faltanCredenciales = error.status === 503;

  tablaWrap.innerHTML = `
    <div class="empty empty--error">
      <span class="empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8v4M12 16h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
      <p><strong>${faltanCredenciales ? 'Todavía no hay conexión con la planilla.' : 'No se pudo leer la planilla.'}</strong></p>
      <p class="muted">${escaparHtml(error.message)}</p>
      ${
        faltanCredenciales
          ? '<p class="muted">Completá <code>.env</code> y ejecutá <code>npm run setup</code>.</p>'
          : ''
      }
    </div>
  `;
}

async function copiarJson() {
  const texto = jsonSalida.textContent;

  try {
    await navigator.clipboard.writeText(texto);
    mostrarToast('JSON copiado al portapapeles.', 'ok');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    mostrarToast('JSON copiado al portapapeles.', 'ok');
  }
}

// ------------------------------------------------------------
//  Notificaciones
// ------------------------------------------------------------
function mostrarToast(mensaje, tipo = 'ok') {
  clearTimeout(temporizadorToast);

  toast.className = `toast toast--${tipo}`;
  toastTexto.textContent = mensaje;
  toast.hidden = false;

  temporizadorToast = setTimeout(() => {
    toast.hidden = true;
  }, 4500);
}
