'use strict';

const DIAS_PESTANA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
];

const DIAS_ETIQUETA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const formClase = document.getElementById('formClase');
const formBase = document.getElementById('formBase');
const fecha = document.getElementById('fecha');
const vistaPestana = document.getElementById('vistaPestana');
const subtituloDia = document.getElementById('subtituloDia');
const badgeDia = document.getElementById('badgeDia');
const badgeBase = document.getElementById('badgeBase');
const tablaDiaWrap = document.getElementById('tablaDiaWrap');
const tablaBaseWrap = document.getElementById('tablaBaseWrap');
const resumenDia = document.getElementById('resumenDia');
const resumenP = document.getElementById('resumenP');
const resumenA = document.getElementById('resumenA');
const resumenAA = document.getElementById('resumenAA');
const resumenR = document.getElementById('resumenR');
const jsonSalida = document.getElementById('jsonSalida');
const btnPrepararDia = document.getElementById('btnPrepararDia');
const btnRefrescarDia = document.getElementById('btnRefrescarDia');
const btnRefrescarBase = document.getElementById('btnRefrescarBase');
const btnCopiarJson = document.getElementById('btnCopiarJson');
const btnGuardarClase = document.getElementById('btnGuardarClase');
const btnGuardarBase = document.getElementById('btnGuardarBase');
const btnImportarBase = document.getElementById('btnImportarBase');
const formClaseError = document.getElementById('formClaseError');
const formBaseError = document.getElementById('formBaseError');
const importTexto = document.getElementById('importTexto');
const importResultado = document.getElementById('importResultado');
const filtroBase = document.getElementById('filtroBase');
const avisoCredenciales = document.getElementById('avisoCredenciales');
const avisoDetalle = document.getElementById('avisoDetalle');
const estadoConexion = document.getElementById('estadoConexion');
const estadoTexto = document.getElementById('estadoTexto');
const pieConfiguracion = document.getElementById('pieConfiguracion');
const toast = document.getElementById('toast');
const toastTexto = document.getElementById('toastTexto');

const estadoApp = {
  catalogo: null,
  base: null,
  dia: null,
  panel: 'registro',
  temporizadorToast: null,
};

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  fecha.value = hoyISO();
  actualizarVistaPestana();
  conectarEventos();

  await Promise.all([cargarEstado(), cargarCatalogo()]);
  await Promise.all([cargarBase(), cargarDia()]);
}

// ------------------------------------------------------------
//  Eventos
// ------------------------------------------------------------
function conectarEventos() {
  document.querySelectorAll('[data-panel]').forEach((boton) => {
    boton.addEventListener('click', () => cambiarPanel(boton.dataset.panel));
  });

  fecha.addEventListener('change', async () => {
    actualizarVistaPestana();
    await cargarDia();
  });

  formClase.addEventListener('submit', guardarClase);
  formBase.addEventListener('submit', guardarEnBase);

  btnPrepararDia.addEventListener('click', prepararDiaDesdeBase);

  btnRefrescarDia.addEventListener('click', async () => {
    girar(btnRefrescarDia);
    await cargarDia();
  });

  btnRefrescarBase.addEventListener('click', async () => {
    girar(btnRefrescarBase);
    await cargarBase();
  });

  btnImportarBase.addEventListener('click', importarFilasBase);
  btnCopiarJson.addEventListener('click', copiarJson);
  filtroBase.addEventListener('change', renderizarTablaBase);

  tablaDiaWrap.addEventListener('change', manejarCambioEnDia);
  tablaDiaWrap.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && evento.target.matches('input[type="text"]')) {
      evento.preventDefault();
      evento.target.blur();
    }
  });

  tablaBaseWrap.addEventListener('click', manejarClickEnBase);

  formClase.addEventListener('input', (evento) => {
    if (evento.target?.name) limpiarErrorCampo(formClase, evento.target.name);
  });

  formBase.addEventListener('input', (evento) => {
    if (evento.target?.name) limpiarErrorCampo(formBase, evento.target.name);
  });
}

function cambiarPanel(nombre) {
  estadoApp.panel = nombre;

  document.querySelectorAll('[data-panel]').forEach((boton) => {
    const activo = boton.dataset.panel === nombre;
    boton.classList.toggle('is-active', activo);
    boton.setAttribute('aria-selected', activo ? 'true' : 'false');
  });

  document.getElementById('panelRegistro').hidden = nombre !== 'registro';
  document.getElementById('panelBase').hidden = nombre !== 'base';

  if (nombre === 'base' && !estadoApp.base) {
    cargarBase();
  }
}

function girar(boton) {
  boton.classList.add('is-spinning');
  setTimeout(() => boton.classList.remove('is-spinning'), 350);
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
  const nombre = DIAS_PESTANA[fechaObj.getUTCDay()];

  return `${nombre} ${dia}/${mes}/${anio}`;
}

function actualizarVistaPestana() {
  vistaPestana.textContent = formatearPestana(fecha.value);
}

function etiquetaDia(valor) {
  const indice = DIAS_PESTANA.indexOf(String(valor || '').toUpperCase());
  return indice >= 0 ? DIAS_ETIQUETA[indice] : String(valor || '');
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escaparAtributo(valor) {
  return escaparHtml(valor).replace(/`/g, '&#096;');
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

function mostrarToast(mensaje, tipo = 'ok') {
  clearTimeout(estadoApp.temporizadorToast);

  toast.className = `toast toast--${tipo}`;
  toastTexto.textContent = mensaje;
  toast.hidden = false;

  estadoApp.temporizadorToast = setTimeout(() => {
    toast.hidden = true;
  }, 4500);
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

  const faltantes =
    Array.isArray(datos.faltantes) && datos.faltantes.length
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
    estadoApp.catalogo = datos;

    llenarSelect('claseSemestre', datos.semestres, 'Seleccionar…');
    llenarSelect('baseSemestre', datos.semestres, 'Seleccionar…');
    llenarSelect('claseCarrera', datos.carreras, 'Seleccionar…');
    llenarSelect('baseCarrera', datos.carreras, 'Seleccionar…');
    llenarSelect('claseSeccion', datos.secciones, 'Seleccionar…');
    llenarSelect('baseSeccion', datos.secciones, 'Seleccionar…');
    llenarSelect('claseTipo', datos.tipos, 'Seleccionar…');
    llenarSelect('baseTipo', datos.tipos, 'Seleccionar…');

    const dias = datos.diasInfo || DIAS_PESTANA.slice(1).map((dia) => ({
      valor: dia,
      etiqueta: etiquetaDia(dia),
    }));

    llenarSelect('baseDia', dias.map((d) => d.valor), 'Elegir…', (valor) => etiquetaDia(valor));
    llenarSelect(
      'filtroBase',
      dias.map((d) => d.valor),
      'Todos los días',
      (valor) => etiquetaDia(valor),
    );

    llenarDatalist('listaAsignaturas', datos.asignaturas);
    llenarDatalist('listaDocentes', datos.docentes);
    llenarDatalist('listaAulas', datos.aulas);
  } catch {
    mostrarToast('No se pudieron cargar los catálogos.', 'error');
  }
}

function llenarSelect(id, opciones = [], textoVacio = '', etiqueta = null) {
  const select = document.getElementById(id);
  if (!select) return;

  const valorPrevio = select.value;
  select.innerHTML = '';

  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = textoVacio;
  select.appendChild(vacia);

  for (const opcion of opciones || []) {
    const elemento = document.createElement('option');
    elemento.value = String(opcion);
    elemento.textContent = etiqueta ? etiqueta(opcion) : String(opcion);
    select.appendChild(elemento);
  }

  if (valorPrevio) select.value = valorPrevio;
}

function llenarDatalist(id, opciones = []) {
  const lista = document.getElementById(id);
  if (!lista) return;
  lista.innerHTML = '';

  for (const opcion of opciones || []) {
    const elemento = document.createElement('option');
    elemento.value = String(opcion);
    lista.appendChild(elemento);
  }
}

// ------------------------------------------------------------
//  Tabla base
// ------------------------------------------------------------
async function cargarBase() {
  try {
    const datos = await api('/api/base');
    estadoApp.base = datos;
    renderizarTablaBase();
  } catch (error) {
    renderizarErrorTabla(
      tablaBaseWrap,
      error,
      'No se pudo leer la tabla base',
      'Revisá la conexión con Google Sheets.',
    );
  }
}

function renderizarTablaBase() {
  const datos = estadoApp.base;

  if (!datos) return;

  const filtro = filtroBase.value;
  const filas = (datos.filas || [])
    .filter((fila) => !filtro || fila.dia === filtro)
    .sort((a, b) => {
      const diaA = DIAS_PESTANA.indexOf(a.dia);
      const diaB = DIAS_PESTANA.indexOf(b.dia);
      if (diaA !== diaB) return diaA - diaB;
      const hora = String(a.horaInicio).localeCompare(String(b.horaInicio));
      if (hora !== 0) return hora;
      return String(a.asignatura).localeCompare(String(b.asignatura));
    });

  badgeBase.textContent = `${datos.total || 0} clase(s)`;

  if (!datos.existe || !datos.total) {
    tablaBaseWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </span>
        <p><strong>La tabla base está vacía.</strong></p>
        <p class="muted">Agregá la primera clase con el formulario de la derecha o pegá varias filas desde Excel.</p>
      </div>
    `;
    return;
  }

  if (!filas.length) {
    tablaBaseWrap.innerHTML = `
      <div class="empty">
        <p><strong>No hay clases para ${escaparHtml(etiquetaDia(filtro))}.</strong></p>
        <p class="muted">Probá con otro día o agregá una clase nueva.</p>
      </div>
    `;
    return;
  }

  const cuerpo = filas
    .map(
      (fila) => `
        <tr>
          <td><span class="dia-pill">${escaparHtml(etiquetaDia(fila.dia))}</span></td>
          <td class="cell-hora">${escaparHtml(fila.horaInicio)}<span>${escaparHtml(fila.horaFin)}</span></td>
          <td>
            <span class="cell-title">${escaparHtml(fila.asignatura)}</span>
            <span class="cell-sub">${escaparHtml(fila.semestre)} · ${escaparHtml(fila.carrera)} · Sec. ${escaparHtml(fila.seccion)} · ${escaparHtml(fila.tipo)}</span>
            ${fila.observacion ? `<span class="cell-note">${escaparHtml(fila.observacion)}</span>` : ''}
          </td>
          <td>${fila.docente ? escaparHtml(fila.docente) : '<span class="muted">—</span>'}</td>
          <td>${fila.aula ? `<span class="aula-pill">${escaparHtml(fila.aula)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="cell-action">
            <button
              type="button"
              class="btn btn--danger btn--mini"
              data-eliminar-base="${fila.fila}"
              data-asignatura="${escaparAtributo(fila.asignatura)}"
              title="Quitar de la tabla base"
            >
              Quitar
            </button>
          </td>
        </tr>
      `,
    )
    .join('');

  tablaBaseWrap.innerHTML = `
    <table class="tabla-base">
      <thead>
        <tr>
          <th>Día</th>
          <th>Hora</th>
          <th>Asignatura</th>
          <th>Docente</th>
          <th>Aula</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${cuerpo}</tbody>
    </table>
  `;
}

async function manejarClickEnBase(evento) {
  const boton = evento.target.closest('[data-eliminar-base]');
  if (!boton) return;

  const fila = Number(boton.dataset.eliminarBase);
  const asignatura = boton.dataset.asignatura || 'esta clase';

  if (!window.confirm(`¿Quitar "${asignatura}" de la tabla base?`)) return;

  boton.disabled = true;
  try {
    await api(`/api/base/${fila}`, { method: 'DELETE' });
    mostrarToast('Fila eliminada de la tabla base.');
    await cargarBase();
    if (estadoApp.dia) await cargarDia();
  } catch (error) {
    manejarErrorApi(error);
    boton.disabled = false;
  }
}

// ------------------------------------------------------------
//  Día seleccionado
// ------------------------------------------------------------
async function cargarDia() {
  if (!fecha.value) {
    subtituloDia.textContent = 'Elegí una fecha para ver las clases.';
    return;
  }

  subtituloDia.textContent = `Leyendo ${formatearPestana(fecha.value)}…`;
  tablaDiaWrap.innerHTML = `
    <div class="skeleton" aria-label="Cargando">
      <span></span><span></span><span></span><span></span>
    </div>
  `;

  try {
    const datos = await api(`/api/dia?fecha=${encodeURIComponent(fecha.value)}`);
    estadoApp.dia = datos;
    renderizarDia();
  } catch (error) {
    estadoApp.dia = null;
    resumenDia.hidden = true;
    badgeDia.textContent = '—';
    renderizarErrorTabla(
      tablaDiaWrap,
      error,
      'No se pudo leer la pestaña del día',
      'Revisá la conexión con Google Sheets.',
    );
    jsonSalida.textContent = JSON.stringify(
      { error: error.message, ...(error.data || {}) },
      null,
      2,
    );
    subtituloDia.textContent = formatearPestana(fecha.value);
  }
}

function renderizarDia() {
  const datos = estadoApp.dia;
  if (!datos) return;

  subtituloDia.textContent = `${datos.total} clase(s) · ${datos.pestana}`;
  badgeDia.textContent = datos.total ? `${datos.total} clase(s)` : 'Sin cargar';
  actualizarResumenDom();
  actualizarJsonDia();

  if (!datos.existe) {
    const dia = etiquetaDia(datos.dia);
    const disponible = Number(datos.baseDisponible || 0);
    tablaDiaWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <p><strong>La pestaña ${escaparHtml(datos.pestana)} todavía no existe.</strong></p>
        <p class="muted">${
          disponible
            ? `La tabla base tiene ${disponible} clase(s) para ${escaparHtml(dia)}. Usá «Cargar desde tabla base».`
            : `La tabla base no tiene clases para ${escaparHtml(dia)}. Cargalas primero en «Horario base».`
        }</p>
      </div>
    `;
    return;
  }

  if (!datos.total) {
    const dia = etiquetaDia(datos.dia);
    const disponible = Number(datos.baseDisponible || 0);
    tablaDiaWrap.innerHTML = `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </span>
        <p><strong>La pestaña está vacía.</strong></p>
        <p class="muted">${
          disponible
            ? `Hay ${disponible} clase(s) de ${escaparHtml(dia)} en la tabla base. Usá «Cargar desde tabla base».`
            : `Cargá las clases de ${escaparHtml(dia)} en la tabla base o agregá una clase suelta.`
        }</p>
      </div>
    `;
    return;
  }

  const filas = datos.filas.map((fila) => filaDiaHtml(fila)).join('');

  tablaDiaWrap.innerHTML = `
    <table class="tabla-dia">
      <thead>
        <tr>
          <th>N°</th>
          <th>Hora</th>
          <th>Asignatura / docente</th>
          <th>Aula</th>
          <th>Estado</th>
          <th>Observación</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function filaDiaHtml(fila) {
  const estado = fila.estado || '';
  const presente = estado === 'P';
  const valorSelect = estado === 'P' ? 'A' : estado;

  return `
    <tr class="clase-row" data-fila="${fila.fila}" data-estado="${estado}">
      <td class="cell-num">${escaparHtml(fila.numero)}</td>
      <td class="cell-hora">${escaparHtml(fila.horaInicio)}<span>${escaparHtml(fila.horaFin)}</span></td>
      <td class="cell-clase">
        <span class="cell-title">${escaparHtml(fila.asignatura)}</span>
        <span class="cell-sub">${escaparHtml(fila.semestre)} · ${escaparHtml(fila.carrera)} · Sec. ${escaparHtml(fila.seccion)} · ${escaparHtml(fila.tipo)}</span>
        <span class="cell-docente">${fila.docente ? escaparHtml(fila.docente) : 'Sin docente asignado'}</span>
      </td>
      <td class="cell-aula">
        <input
          type="text"
          class="input-mini input-aula"
          data-campo="aula"
          data-original="${escaparAtributo(fila.aula)}"
          value="${escaparAtributo(fila.aula)}"
          list="listaAulas"
          placeholder="—"
          aria-label="Aula de ${escaparAtributo(fila.asignatura)}"
        />
      </td>
      <td class="cell-estado">
        <label class="presence">
          <input type="checkbox" data-campo="presente" ${presente ? 'checked' : ''} />
          <span>Presente</span>
        </label>
        <select
          class="input-mini select-estado"
          data-campo="estado"
          aria-label="Estado de ${escaparAtributo(fila.asignatura)}"
          ${presente ? 'hidden' : ''}
        >
          <option value="A" ${valorSelect === 'A' ? 'selected' : ''}>Ausente</option>
          <option value="AA" ${valorSelect === 'AA' ? 'selected' : ''}>Ausente con aviso</option>
          <option value="R" ${valorSelect === 'R' ? 'selected' : ''}>Reemplazante</option>
        </select>
        <input
          type="text"
          class="input-mini input-reemplazo"
          data-campo="reemplazante"
          data-original="${escaparAtributo(fila.reemplazante)}"
          value="${escaparAtributo(fila.reemplazante)}"
          list="listaDocentes"
          placeholder="Nombre del reemplazante"
          aria-label="Reemplazante de ${escaparAtributo(fila.asignatura)}"
          ${estado === 'R' ? '' : 'hidden'}
        />
        ${estado === '' ? '<span class="estado-pendiente">Sin marcar</span>' : ''}
      </td>
      <td class="cell-obs">
        <input
          type="text"
          class="input-mini"
          data-campo="observacion"
          data-original="${escaparAtributo(fila.observacion)}"
          value="${escaparAtributo(fila.observacion)}"
          placeholder="—"
          maxlength="500"
          aria-label="Observación de ${escaparAtributo(fila.asignatura)}"
        />
      </td>
    </tr>
  `;
}

function actualizarJsonDia() {
  if (!estadoApp.dia) {
    jsonSalida.textContent = '{}';
    return;
  }

  estadoApp.dia.resumen = calcularResumen(estadoApp.dia.filas || []);
  estadoApp.dia.total = (estadoApp.dia.filas || []).length;
  jsonSalida.textContent = JSON.stringify(estadoApp.dia, null, 2);
}

function calcularResumen(filas) {
  const resumen = { P: 0, A: 0, AA: 0, R: 0, total: filas.length };
  for (const fila of filas) {
    const estado = fila.estado || '';
    if (resumen[estado] !== undefined) resumen[estado] += 1;
  }
  return resumen;
}

function actualizarResumenDom() {
  const datos = estadoApp.dia;
  if (!datos || !datos.total) {
    resumenDia.hidden = true;
    return;
  }

  const resumen = calcularResumen(datos.filas || []);
  resumenP.textContent = String(resumen.P);
  resumenA.textContent = String(resumen.A);
  resumenAA.textContent = String(resumen.AA);
  resumenR.textContent = String(resumen.R);
  resumenDia.hidden = false;
}

function obtenerRegistroDeFila(tr) {
  const fila = Number(tr.dataset.fila);
  return (estadoApp.dia?.filas || []).find((registro) => registro.fila === fila);
}

async function manejarCambioEnDia(evento) {
  const objetivo = evento.target;
  const tr = objetivo.closest('.clase-row');
  if (!tr) return;

  if (objetivo.matches('[data-campo="presente"]')) {
    await cambiarEstadoFila(tr, objetivo.checked ? 'P' : 'A');
    return;
  }

  if (objetivo.matches('[data-campo="estado"]')) {
    await cambiarEstadoFila(tr, objetivo.value);
    return;
  }

  if (objetivo.matches('[data-campo="aula"]')) {
    await guardarCampoFila(tr, 'aula', objetivo.value);
    return;
  }

  if (objetivo.matches('[data-campo="reemplazante"]')) {
    await guardarCampoFila(tr, 'reemplazante', objetivo.value);
    return;
  }

  if (objetivo.matches('[data-campo="observacion"]')) {
    await guardarCampoFila(tr, 'observacion', objetivo.value);
  }
}

function aplicarEstadoFila(tr, nuevoEstado) {
  const registro = obtenerRegistroDeFila(tr);
  const checkbox = tr.querySelector('[data-campo="presente"]');
  const select = tr.querySelector('[data-campo="estado"]');
  const reemplazo = tr.querySelector('[data-campo="reemplazante"]');
  const pendiente = tr.querySelector('.estado-pendiente');

  const presente = nuevoEstado === 'P';
  if (checkbox) checkbox.checked = presente;

  if (select) {
    select.hidden = presente;
    if (!presente) select.value = nuevoEstado;
  }

  if (reemplazo) {
    reemplazo.hidden = nuevoEstado !== 'R';
    if (nuevoEstado !== 'R') {
      reemplazo.value = '';
      if (registro) registro.reemplazante = '';
    }
  }

  // Ocultar el badge "Sin marcar" en cuanto se asigna cualquier estado
  if (pendiente && nuevoEstado !== '') {
    pendiente.hidden = true;
  }

  tr.dataset.estado = nuevoEstado;
  if (registro) registro.estado = nuevoEstado;
}

async function cambiarEstadoFila(tr, nuevoEstado) {
  const registro = obtenerRegistroDeFila(tr);
  if (!registro) return;

  const anterior = registro.estado || '';
  if (anterior === nuevoEstado) return;

  aplicarEstadoFila(tr, nuevoEstado);
  actualizarResumenDom();
  actualizarJsonDia();
  marcarGuardando(tr, true);

  try {
    await api('/api/clases', {
      method: 'PATCH',
      body: JSON.stringify({
        fecha: fecha.value,
        fila: registro.fila,
        estado: nuevoEstado,
      }),
    });
    marcarGuardado(tr);
  } catch (error) {
    mostrarToast(error.message, 'error');
    await cargarDia();
  } finally {
    marcarGuardando(tr, false);
  }
}

async function guardarCampoFila(tr, campo, valor) {
  const registro = obtenerRegistroDeFila(tr);
  const input = tr.querySelector(`[data-campo="${campo}"]`);
  if (!registro || !input) return;

  let nuevo = String(valor ?? '').trim();
  if (campo === 'aula') {
    // El servidor guarda el aula en mayúsculas; nos quedamos en el mismo formato.
    nuevo = nuevo.toUpperCase();
  }
  if (nuevo === String(input.dataset.original ?? '').trim()) return;

  marcarGuardando(tr, true);

  try {
    await api('/api/clases', {
      method: 'PATCH',
      body: JSON.stringify({
        fecha: fecha.value,
        fila: registro.fila,
        [campo]: nuevo,
      }),
    });

    registro[campo] = nuevo;
    input.dataset.original = nuevo;
    input.value = nuevo;
    marcarGuardado(tr);
    actualizarJsonDia();
  } catch (error) {
    mostrarToast(error.message, 'error');
    await cargarDia();
  } finally {
    marcarGuardando(tr, false);
  }
}

function marcarGuardando(tr, activo) {
  tr.classList.toggle('is-saving', activo);
}

function marcarGuardado(tr) {
  tr.classList.add('is-saved');
  setTimeout(() => tr.classList.remove('is-saved'), 900);
}

// ------------------------------------------------------------
//  Cargar el día desde la tabla base
// ------------------------------------------------------------
async function prepararDiaDesdeBase() {
  if (!fecha.value) {
    mostrarToast('Elegí una fecha primero.', 'error');
    return;
  }

  btnPrepararDia.disabled = true;
  btnPrepararDia.classList.add('is-loading');

  try {
    const resultado = await api('/api/dia/desde-base', {
      method: 'POST',
      body: JSON.stringify({ fecha: fecha.value }),
    });

    mostrarToast(resultado.mensaje || 'Día preparado desde la tabla base.');
    await cargarDia();
  } catch (error) {
    manejarErrorApi(error);
  } finally {
    btnPrepararDia.disabled = false;
    btnPrepararDia.classList.remove('is-loading');
  }
}

// ------------------------------------------------------------
//  Formulario: clase suelta en el día
// ------------------------------------------------------------
async function guardarClase(evento) {
  evento.preventDefault();
  limpiarErroresFormulario(formClase, formClaseError);

  const datos = Object.fromEntries(new FormData(formClase).entries());
  datos.fecha = fecha.value;
  datos.estado = 'P';

  const errores = validarClaseFormulario(datos);
  if (Object.keys(errores).length) {
    mostrarErroresFormulario(formClase, formClaseError, errores);
    return;
  }

  activarBoton(btnGuardarClase, true, 'Agregando…');

  try {
    const resultado = await api('/api/clases', {
      method: 'POST',
      body: JSON.stringify(datos),
    });

    mostrarToast(resultado.mensaje || 'Clase agregada al día.');
    formClase.reset();
    await cargarDia();
  } catch (error) {
    manejarErrorApi(error, formClase, formClaseError);
  } finally {
    activarBoton(btnGuardarClase, false, 'Agregar al día');
  }
}

// ------------------------------------------------------------
//  Formulario: tabla base
// ------------------------------------------------------------
async function guardarEnBase(evento) {
  evento.preventDefault();
  limpiarErroresFormulario(formBase, formBaseError);

  const datos = Object.fromEntries(new FormData(formBase).entries());
  const errores = validarClaseFormulario(datos, true);
  if (Object.keys(errores).length) {
    mostrarErroresFormulario(formBase, formBaseError, errores);
    return;
  }

  activarBoton(btnGuardarBase, true, 'Agregando…');

  try {
    const resultado = await api('/api/base', {
      method: 'POST',
      body: JSON.stringify(datos),
    });

    mostrarToast(resultado.mensaje || 'Clase agregada a la tabla base.');
    formBase.reset();
    await cargarBase();
    if (estadoApp.dia) await cargarDia();
  } catch (error) {
    manejarErrorApi(error, formBase, formBaseError);
  } finally {
    activarBoton(btnGuardarBase, false, 'Agregar a la tabla base');
  }
}

async function importarFilasBase() {
  const texto = importTexto.value.trim();
  if (!texto) {
    mostrarToast('Pegá al menos una fila para importar.', 'error');
    return;
  }

  btnImportarBase.disabled = true;
  btnImportarBase.textContent = 'Importando…';
  importResultado.hidden = true;

  try {
    const datos = await api('/api/base/importar', {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });

    const partes = [];
    if (datos.agregadas) partes.push(`${datos.agregadas} fila(s) agregadas.`);
    if (datos.duplicadas) {
      partes.push(`${datos.duplicadas} ya estaban en la tabla (no se duplicaron).`);
    }
    if (Array.isArray(datos.errores) && datos.errores.length) {
      partes.push(`${datos.errores.length} fila(s) con errores.`);
    }

    importResultado.hidden = false;
    importResultado.className = 'import__result';
    importResultado.innerHTML = renderizarResultadoImportacion(partes, datos.errores);

    mostrarToast(datos.mensaje || 'Importación terminada.');
    importTexto.value = '';
    await cargarBase();
    if (estadoApp.dia) await cargarDia();
  } catch (error) {
    importResultado.hidden = false;
    importResultado.className = 'import__result import__result--error';
    importResultado.innerHTML = renderizarResultadoImportacion(
      [escaparHtml(error.message)],
      error.data?.errores,
    );
    manejarErrorApi(error);
  } finally {
    btnImportarBase.disabled = false;
    btnImportarBase.textContent = 'Importar filas';
  }
}

function renderizarResultadoImportacion(partes, errores) {
  const listaErrores = Array.isArray(errores) && errores.length
    ? `<ul class="import__errors">${errores
        .slice(0, 8)
        .map((item) => {
          if (typeof item === 'string') return `<li>${escaparHtml(item)}</li>`;
          const campos = Object.values(item.errores || {}).join(' ');
          return `<li>Línea ${escaparHtml(item.linea)}: ${escaparHtml(campos)}</li>`;
        })
        .join('')}</ul>`
    : '';

  return `<p>${partes.join(' ')}</p>${listaErrores}`;
}

// ------------------------------------------------------------
//  Validación y errores de formularios
// ------------------------------------------------------------
function validarClaseFormulario(datos, esBase = false) {
  const errores = {};
  const obligatorios = [
    'semestre',
    'carrera',
    'asignatura',
    'seccion',
    'tipo',
    'horaInicio',
    'horaFin',
  ];

  if (esBase && !String(datos.dia || '').trim()) {
    errores.dia = 'Elegí el día de la semana.';
  }

  for (const campo of obligatorios) {
    if (!String(datos[campo] || '').trim()) {
      errores[campo] = 'Completá este campo.';
    }
  }

  if (
    datos.horaInicio &&
    datos.horaFin &&
    String(datos.horaFin) <= String(datos.horaInicio)
  ) {
    errores.horaFin = 'La hora de fin debe ser posterior a la de inicio.';
  }

  if (String(datos.observacion || '').length > 500) {
    errores.observacion = 'Máximo 500 caracteres.';
  }

  return errores;
}

function mostrarErroresFormulario(form, alerta, errores) {
  for (const [campo, mensaje] of Object.entries(errores)) {
    const elemento = form.querySelector(`[data-error-for="${campo}"]`);
    if (elemento) elemento.textContent = mensaje;

    const input = form.querySelector(`[name="${campo}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  alerta.hidden = false;
  alerta.textContent = 'Revisá los campos marcados antes de guardar.';

  const primero = Object.keys(errores)[0];
  const input = form.querySelector(`[name="${primero}"]`);
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  }
}

function limpiarErrorCampo(form, nombre) {
  const elemento = form.querySelector(`[data-error-for="${nombre}"]`);
  if (elemento) elemento.textContent = '';

  const input = form.querySelector(`[name="${nombre}"]`);
  if (input) input.removeAttribute('aria-invalid');

  const alerta = form === formClase ? formClaseError : formBaseError;
  if (!form.querySelector('[data-error-for]:not(:empty)')) {
    alerta.hidden = true;
    alerta.textContent = '';
  }
}

function limpiarErroresFormulario(form, alerta) {
  form.querySelectorAll('[data-error-for]').forEach((elemento) => {
    elemento.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((elemento) => {
    elemento.removeAttribute('aria-invalid');
  });
  alerta.hidden = true;
  alerta.textContent = '';
}

function manejarErrorApi(error, form = null, alerta = null) {
  if (form && alerta && error.data?.errores) {
    mostrarErroresFormulario(form, alerta, error.data.errores);
  } else if (form && alerta) {
    alerta.hidden = false;
    alerta.textContent = error.message;
  }

  if (error.status === 503) {
    cargarEstado();
  }

  mostrarToast(error.message, 'error');
}

function activarBoton(boton, activo, texto) {
  boton.disabled = activo;
  boton.classList.toggle('is-loading', activo);
  boton.setAttribute('aria-busy', activo ? 'true' : 'false');
  const etiqueta = boton.querySelector('.btn__label');
  if (etiqueta) etiqueta.textContent = texto;
}

// ------------------------------------------------------------
//  Estados vacíos / errores de tablas
// ------------------------------------------------------------
function renderizarErrorTabla(contenedor, error, titulo, ayuda) {
  const sinConexion = error.status === 503;
  contenedor.innerHTML = `
    <div class="empty empty--error">
      <span class="empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8v4M12 16h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
      <p><strong>${escaparHtml(sinConexion ? 'Todavía no hay conexión con la planilla.' : titulo)}</strong></p>
      <p class="muted">${escaparHtml(error.message)}</p>
      <p class="muted">${escaparHtml(ayuda)}</p>
    </div>
  `;
}

// ------------------------------------------------------------
//  JSON
// ------------------------------------------------------------
async function copiarJson() {
  const texto = jsonSalida.textContent;

  try {
    await navigator.clipboard.writeText(texto);
    mostrarToast('JSON copiado al portapapeles.');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    mostrarToast('JSON copiado al portapapeles.');
  }
}
