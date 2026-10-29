# Registro de clases · MVP

Aplicación web para que la gente del departamento cargue los **estados de las
clases** en **Google Sheets**, con una app que validá los datos y mantuvo una sola
formato común para toda la planilla.

Google Sheets sigue siendo la **fuente de la verdad**. La app nunca edita lo que
ya existe salvo autorización explícita: solo agrega filas nuevas en las
pestañas de los días y actualiza estados aula/observación/reemplazante.

---

## Idea principal

1. Se canta una vez el **horario base** del semestre (tabla `HORARIO BASE`).
2. Cada día, la app copia las clases de ese día desde la base.
3. El usuario marca el estado (presente / ausente / aviso / reemplazante) y el
   aula de cada clase, en la pestaña de ese día.

Todo con **una sola tabla como formato de referencia**, para que las pestañas no
vayan quedando desiguales entre sí.

---

## Formato canónico de la planilla

La referencia es la pestaña **`LUNES 26/10/2026`** de la planilla real, que se
cargó al proyecto con esos nombres y tipos de datos.

- **Header / encabezado:** fila 4.
- **Primera fila de datos:** fila 5.
- **Columnas:** exactamente de la **A a la M** (13 columnas).
- **Nuevas pestañas que cree la app** se escriben siempre con este mismo formato
  y en este mismo orden.

### Columnas

| Letra | Encabezado en la planilla | Campo interno | Descripción |
|-------|---------------------------|---------------|-------------|
| A | `N` | `numero` | Número de la clase (orden secuencial). |
| B | `SEMESTRE` | `semestre` | Semestre al que pertenece la clase, por ejemplo `1º`. |
| C | `CARRERA` | `carrera` | Carrera, por ejemplo `CB` o `MEDICINA`. |
| D | `ASIGNATURA` | `asignatura` | Nombre de la asignatura. |
| E | `SECC` | `seccion` | Sección de la carrera, por ejemplo `C`. |
| F | `TIPO` | `tipo` | Tipo de clase, por ejemplo `TEO`. |
| G | `DOCENTE` | `docente` | Nombre del docente. |
| H | `OBSERVACION` | `observacion` | Nota opcional. |
| I | `REEMPLAZANTE` | `reemplazante` | Nombre del reemplazante (opcional). |
| J | `HORA INICIO` | `horaInicio` | Hora de inicio, formato `HH:MM`. |
| K | `HORA FIN` | `horaFin` | Hora de fin, formato `HH:MM`. |
| L | `AULA` | `aula` | Aula, por ejemplo `R1`. |
| M | `ESTADO (P/A/AA/R)` | `estado` | Estado de la clase. |

Las columnas se usan siempre **en este orden exacto**: `N`, `SEMESTRE`, `CARRERA`,
`ASIGNATURA`, `SECC`, `TIPO`, `DOCENTE`, `OBSERVACION`, `REEMPLAZANTE`,
`HORA INICIO`, `HORA FIN`, `AULA`, `ESTADO (P/A/AA/R)` (letras **A** a **M**).

### Tipos de datos (importante)

- **Semestres:** siempre se guardan como `1º`, `3º`, `5º`, etc. Lo acepta la app y
  escribe el mismo formato de siempre, sin cambiar los tipos.
- **Estados:** solo se usan los códigos `P`, `A`, `AA` y `R`.
- **Carreras, secciones, tipos y aulas:** en mayúsculas (sin tildes en el código).
- **Horas:** siempre `HH:MM`, por ejemplo `07:30`.
- **Una clase sin estado se lee como `P` (Presente)**, porque “estar presente” es
  el caso habitual.

### Estado

| Código | Significado | Comentario |
|--------|-------------|------------|
| `P` | **Presente** | La clase se dictó. Es el valor por defecto. |
| `A` | **Ausente** | El docente no asistió y no avisó. |
| `AA` | **Ausente con aviso** | La ausencia se informó antes. |
| `R` | **Reemplazante** | Otra persona cubrió la clase. |

El **reemplazante** es opcional: puede cargarse después, cuando la persona se
confirma, aunque el estado ya sea `R`.

---

## Tablas que crea la app

### `HORARIO BASE`

Pestaña nueva (la app la crea sola con `sheet` de Google Sheets) que no tiene
estado. Columnas:

| Columna | Letra | Campo |
|---------|-------|-------|
| A | `DÍA` | Día de la semana |
| B | `SEMESTRE` | Semestre |
| C | `CARRERA` | Carrera |
| D | `ASIGNATURA` | Asignatura |
| E | `SECC` | Sección |
| F | `TIPO` | Tipo |
| G | `DOCENTE` | Docente |
| H | `OBSERVACION` | Observación |
| I | `HORA INICIO` | Hora inicio |
| J | `HORA FIN` | Hora fin |
| K | `AULA` | Aula |

La fila de encabezado es la **fila 1**, los datos a partir de la fila 2.

Contiene la estructura semanal (qué clase tiene cada día), sin estados.

### Pestañas de día

Nombre canónico: `"LUNES 26/10/2026"`, `"MIERCOLES 28/10/2026"`, etc. (mayúsculas,
sin tildes). El nombre se genera a partir de la fecha elegida.

Copia las clases de la base del día (estado `P`) en la pestaña nueva. Después se
edita fila por fila el estado, el aula, la observación o el reemplazante.

Si la pestaña ya existe, no se vuelve a copiar: se editan las clases ya cargadas.

---

## Cómo se lee una planilla con pestañas viejas

La planilla real no está homogénea: el encabezado puede estar en la fila 3, 4 u
5; a veces el estado está en la columna N; a veces hay columnas extra.

La app:

- detecta el encabezado **por nombre de columna** (tolerante a variantes), no por
  posición rígida;
- mapea cada dato a su campo;
- ignora filas de relleno/totales.

Pero **siempre escribe en el formato canónico**: cuando la app crea o actualiza
una pestaña nueva, escribe las 13 columnas con los encabezados del formato
referencia y los datos en los mismos tipos.

---

## Inicio rápido

```bash
npm start
```

Después abrí esta URL en el navegador:

**http://localhost:3000**

> Para detener el servidor: `Ctrl + C` en la terminal.

La app abre aunque todavía no estén las credenciales. Para que pueda **guardar**
y **leer** la planilla, seguí la sección
[Credenciales de Google](#credenciales-de-google).

---

## Credenciales de Google

Necesitás dos cosas: un **archivo JSON** de una cuenta de servicio y el **ID de
tu planilla**. Se hace una sola vez.

### Paso 1 · Crear el proyecto en Google Cloud

1. Entrá a <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba a la izquierda, abrí el selector de proyectos y elegí **“Proyecto nuevo”**.
3. Poné un nombre (por ejemplo `registro-clases`) y presioná **Crear**.

### Paso 2 · Habilitar la API de Google Sheets

1. En el menú de la izquierda buscá **“APIs y servicios” → “Biblioteca”**.
2. Buscá **Google Sheets API**.
3. Entrá y presioná **“Habilitar”**.

### Paso 3 · Crear la cuenta de servicio

1. En el menú, andá a **“APIs y servicios” → “Credenciales”**.
2. Presioná **“Crear credenciales” → “Cuenta de servicio”**.
3. Completá el nombre y presioná **“Crear y continuar”**.

### Paso 4 · Descargar el archivo JSON

1. En **“Credenciales”**, dentro de “Cuentas de servicio”, hacé clic en la cuenta
   que creaste.
2. Entrá a la pestaña **“Claves”**.
3. Presioná **“Agregar clave” → “Crear clave nueva”**.
4. Elegí **JSON** y presioná **“Crear”**.
5. Se descarga un archivo `.json`. **Renombralo** a `service-account.json`.
6. Movelo a la carpeta `credentials/` del proyecto.

### Paso 5 · Compartir la planilla con la cuenta de servicio

1. Abrí el archivo `service-account.json` con el Bloc de notas (o cualquier
   editor de texto).
2. Buscá la línea que dice `"client_email"` y copiá el correo.
3. Abrí tu Google Sheets.
4. Presioná **“Compartir”**.
5. Pegá ese correo y elegí el permiso **“Editor”**.

> La app también te muestra este correo en el aviso amarillo y con `npm run setup`.

### Paso 6 · Obtener el ID de la planilla

Abrí la planilla y copiá el ID que está entre `/d/` y `/edit`.

### Paso 7 · Completar el archivo `.env`

```env
SPREADSHEET_ID=tu_id_de_planilla
GOOGLE_APPLICATION_CREDENTIALS=credentials/service-account.json
```

### Paso 8 · Verificar

```bash
npm run setup
```

### Paso 9 · Probar la lectura de la planilla

```bash
npm run test:read
```

También podés indicar otra fecha:

```bash
npm run test:read -- 2026-10-26
```

### Paso 10 · Usar la app

```bash
npm start
```

---

## Cómo se usa la app

### Paso 1 · Cargar la tabla base (`HORARIO BASE`)

- Entrá al panel **“Horario base”**.
- Cargá una clase con el formulario o **pegá varias filas** desde Excel/Sheets
  (TSV, CSV o separado por `;`).
- Formato de las filas pegadas (orden):
  `DÍA · SEMESTRE · CARRERA · ASIGNATURA · SECC · TIPO · DOCENTE · HORA INICIO ·
  HORA FIN · AULA · OBSERVACIÓN`.
  También podés traer la primera fila con los títulos.
- Las clases repetidas (mismo día/hora/asignatura/sección) no se duplican.

### Paso 2 · Registrar el día

- Elegí la **fecha** de la clase.
- La app muestra (o crea) la pestaña `LUNES 26/10/2026` para esa fecha.
- Precargá el estado **Presente** por defecto; al desmarcarlo se muestran las
  opciones de ausencia o reemplazo.
- Editá aula, observación y reemplazante directamente desde la tabla.
- Usá **“Cargar desde tabla base”** para copiar las clases de esa semana desde la
  base y **marcar** los cambios.

### Paso 3 · Cargar el día

En el panel **“Registro del día”**:

1. Elegí la fecha.
2. Tocá **“Cargar desde tabla base”** (o usá una clase suelta con el formulario).
3. Cada fila muestra: número, hora, asignatura/docente, aula, estado y
   observación.
4. Cambiá el estado con el checkbox “Presente” (solo se muestra el selector de
   ausencia cuando se está ausente) y completá el reemplazante si corresponde.

---

## Catálogos

Los selectores se alimentan desde `catalogo.json`: carreras, semestres,
asignaturas, secciones, tipos, docentes y aulas. Podés editarlo y recargar la
página para cambiar las opciones.

---

## Supabase (opcional)

Supabase guarda un **historial de auditoría** de cada carga. Google Sheets sigue
siendo la fuente principal de verdad.

Ver [supabase/schema.sql](supabase/schema.sql) para crear la tabla.

---

## Publicar en Vercel

La app incluye `api/[...path].js`, que adapta el servidor Express a una función
serverless de Vercel.

### Opción A · Desde GitHub (recomendada)

1. Subí el proyecto a un repositorio de GitHub. **No subas** `.env`,
   `credentials/` ni `Plan.txt` (ya están en `.gitignore`).
2. Entrá a <https://vercel.com/new> e importá el repositorio.
3. En **Environment Variables** agregá:

| Variable | Valor |
|----------|-------|
| `SPREADSHEET_ID` | El ID de tu planilla |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Todo el contenido del JSON, en una sola línea |
| `TZ` | `America/Argentina/Buenos_Aires` |
| `SUPABASE_URL` | Opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional |
| `SUPABASE_AUDIT_TABLE` | Opcional (`clases_auditoria`) |

4. Presioná **Deploy**.

---

## Estructura del proyecto

```
repo/
├── api/
│   └── [...path].js          Adaptador para Vercel
├── credentials/              Acá va service-account.json (no se sube)
├── lib/
│   ├── auditoria.js          Envío opcional a Supabase
│   ├── esquema.js            Columnas canónicas, alias y detección de encabezado
│   ├── fechas.js             Nombres de pestaña: "LUNES 26/10/2026"
│   ├── importar.js           Parser de importación masiva (TSV/CSV/punto y coma)
│   ├── sheets.js             Lectura/escritura en Google Sheets
│   └── validacion.js         Validación y normalización de datos
├── public/
│   ├── app.js                Lógica del formulario y vista previa
│   ├── index.html            Interfaz
│   └── styles.css            Estilos
├── scripts/
│   └── check-setup.js        Verificación de configuración
├── supabase/
│   └── schema.sql            Tabla de auditoría
├── .env                      Tus datos (no se sube)
├── .env.example              Plantilla de variables
├── catalogo.json             Listas de los selectores
├── app.js                    Servidor Express
├── server.js                 Arranque local
├── test-read.js              Script de lectura a JSON
├── package.json
└── README.md
```

---

## Problemas frecuentes

### “No se encontró el archivo de credenciales”

El JSON no está en `credentials/service-account.json` o el nombre no coincide.

### “Google rechazó el acceso” (error 403)

La planilla no está compartida con la cuenta de servicio.

### “No se encontró la planilla” (error 404)

El `SPREADSHEET_ID` está mal copiado.

### “La tabla base no tiene clases para X”

Todavía no cargaste las clases de ese día en `HORARIO BASE`.

### El puerto 3000 está ocupado

Cambiá el puerto en `.env`:

```env
PORT=3001
```

### El nombre de la pestaña no coincide

La app genera nombres canónicos como `MIERCOLES 28/10/2026` (sin tildes). La pestaña
real se detecta tolerante a mayúsculas y tildes.

---

## Seguridad

- `.env`, `credentials/` y `Plan.txt` están en `.gitignore`: no se suben a Git.
- Nunca compartas el JSON de la cuenta de servicio ni la `service_role key` de
  Supabase.
- Si un token o clave se compartió por chat, correo o documento, **regenerala**
  desde el panel del proveedor.

---

## Comandos disponibles

| Comando | Qué hace |
|---------|----------|
| `npm start` | Inicia el servidor en http://localhost:3000 |
| `npm run dev` | Inicia con recarga automática al guardar cambios |
| `npm run setup` | Verifica credenciales y conexión con Google Sheets |
| `npm run test:read` | Lee la pestaña de la fecha indicada y la imprime en JSON |
| `npm run test:read -- 2026-10-26` | Lee una fecha específica |
