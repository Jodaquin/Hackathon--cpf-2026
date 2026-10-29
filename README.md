# Registro de clases · MVP

Aplicación web para cargar estados de clases en **Google Sheets** con opciones
cerradas (sin escribir a mano). El formulario valida los datos, genera
automáticamente la pestaña del día con el formato `"LUNES 9/3/2026"` y agrega
una fila debajo de los 4 encabezados de la planilla.

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
2. Arriba a la izquierda, abrí el selector de proyectos y elegí
   **“Proyecto nuevo”**.
3. Poné un nombre (por ejemplo `registro-clases`) y presioná **Crear**.
4. Esperá unos segundos y asegurate de que el proyecto nuevo quede seleccionado
   arriba.

### Paso 2 · Habilitar la API de Google Sheets

1. En el menú de la izquierda buscá **“APIs y servicios” → “Biblioteca”**.
2. Buscá **Google Sheets API**.
3. Entrá y presioná **“Habilitar”**.

### Paso 3 · Crear la cuenta de servicio

1. En el menú, andá a **“APIs y servicios” → “Credenciales”**.
2. Presioná **“Crear credenciales” → “Cuenta de servicio”**.
3. Completá:
   - **Nombre:** `registro-clases`
   - **ID:** se completa solo.
4. Presioná **“Crear y continuar”**.
5. En “Otorgar acceso al proyecto” no agregues roles: presioná
   **“Continuar”** y después **“Listo”**.

### Paso 4 · Descargar el archivo JSON

1. En **“Credenciales”**, dentro de “Cuentas de servicio”, hacé clic en la cuenta
   que creaste.
2. Entrá a la pestaña **“Claves”**.
3. Presioná **“Agregar clave” → “Crear clave nueva”**.
4. Elegí **JSON** y presioná **“Crear”**.
5. Se descarga un archivo `.json`. **Renombralo** a `service-account.json`.
6. Movelo a la carpeta `credentials/` de este proyecto. La ruta final tiene que
   quedar así:

```
repo/
└── credentials/
    └── service-account.json
```

> Si la carpeta `credentials` no existe, creala.

### Paso 5 · Compartir la planilla con la cuenta de servicio

1. Abrí el archivo `service-account.json` con el Bloc de notas (o cualquier
   editor de texto).
2. Buscá la línea que dice `"client_email"`. Copiá el correo, que termina en
   `@....iam.gserviceaccount.com`.
3. Abrí tu Google Sheets.
4. Presioná **“Compartir”**.
5. Pegá ese correo y elegí el permiso **“Editor”**.
6. Desmarcá “Notificar a las personas” y presioná **“Compartir”**.

> La app también te muestra este correo en el aviso amarillo y con
> `npm run setup`.

### Paso 6 · Obtener el ID de la planilla

Abrí la planilla y mirá la URL:

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit
                                      └──────────── este es el ID ────────────┘
```

Copiá solo la parte que está entre `/d/` y `/edit`.

### Paso 7 · Completar el archivo `.env`

El archivo `.env` ya está creado en la raíz del proyecto. Abrilo con un editor de
texto y completá estas dos líneas:

```env
SPREADSHEET_ID=pega_acá_el_id_de_la_planilla
GOOGLE_APPLICATION_CREDENTIALS=credentials/service-account.json
```

Guardá el archivo.

### Paso 8 · Verificar

En la terminal, dentro de la carpeta del proyecto:

```bash
npm run setup
```

Si todo está bien, vas a ver algo así:

```
✓ Archivo .env encontrado.
✓ Credenciales de Google cargadas (archivo).
✓ SPREADSHEET_ID configurado (…123456).
✓ Conexión correcta. La planilla tiene 3 pestaña(s).
```

Si aparece un error, el mismo comando te dice qué revisar.

### Paso 9 · Probar la lectura de la planilla

```bash
npm run test:read
```

Lee la pestaña de hoy y muestra su contenido en formato JSON. También podés
indicar otra fecha:

```bash
npm run test:read -- 2026-03-09
```

### Paso 10 · Usar la app

```bash
npm start
```

Abrí **http://localhost:3000**, completá el formulario y guardá. La app crea la
pestaña del día si no existe y escribe la fila en la fila 5 (o la siguiente
libre).

---

## Cómo funciona la planilla

- Las primeras **4 filas** son encabezados y **no se tocan**.
- La fila 4 contiene los nombres de las columnas.
- Los datos nuevos se agregan a partir de la **fila 5**.
- El orden de las columnas es:

| # | Columna | Campo del formulario |
|---|---------|----------------------|
| A | Carrera | `carrera` |
| B | Semestre | `semestre` |
| C | Asignatura | `asignatura` |
| D | Sección | `seccion` |
| E | Tipo | `tipo` |
| F | Docente | `docente` |
| G | Hora inicio | `horaInicio` |
| H | Hora fin | `horaFin` |
| I | Aula | `aula` |
| J | Estado | `estado` |
| K | Observación | `observacion` |
| L | Reemplazante | `reemplazante` |

> **Si tu planilla real tiene otro orden de columnas**, editá la lista
> `COLUMNAS` en `lib/sheets.js` para que coincida exactamente.

El campo **Estado** solo acepta estas opciones:
`normal`, `ausente`, `reemplazo`, `cambio de aula`, `suspendida`.
El campo **Reemplazante** se habilita únicamente cuando el estado es
`reemplazo`.

---

## Demo para el jurado

La columna derecha de la app muestra en vivo las clases de la pestaña
seleccionada. Además:

- Botón **“Ver JSON de la demo”**: muestra el contenido completo en JSON,
  demostrando que los datos se leen sin errores de formato.
- Botón **“Copiar JSON”**: copia el resultado al portapapeles.
- Endpoint directo: <http://localhost:3000/api/demo-json>
- Otra fecha: <http://localhost:3000/api/demo-json?fecha=2026-03-09>
- Script de consola: `npm run test:read`

---

## Catálogos

Los selectores se alimentan desde `catalogo.json`:

- carreras
- semestres
- asignaturas
- secciones
- tipos
- docentes
- aulas

Podés editar ese archivo y recargar la página para cambiar las opciones.

---

## Supabase (opcional)

Supabase se usa para guardar un **historial de auditoría** de cada clase
cargada. Google Sheets sigue siendo la fuente principal de verdad; si Supabase
no está configurado, la app funciona igual.

### Configurarlo

1. Creá un proyecto en <https://supabase.com/>.
2. Entrá a **SQL Editor**, pegá el contenido de `supabase/schema.sql` y presioná
   **Run**.
3. Andá a **Project Settings → API**.
4. Copiá:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
5. Pegalos en `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_AUDIT_TABLE=clases_auditoria
```

6. Reiniciá el servidor con `npm start`.

> La `service_role key` es secreta: no la compartas ni la subas a GitHub.
> La tabla tiene Row Level Security activado y no tiene políticas públicas, por
> lo que solo el servidor puede leerla y escribirla.

---

## Publicar en Vercel

La app ya incluye `api/[...path].js`, que adapta el servidor Express a una
función serverless de Vercel.

### Opción A · Desde GitHub (recomendada)

1. Subí el proyecto a un repositorio de GitHub. **No subas** `.env`,
   `credentials/` ni `Plan.txt` (ya están en `.gitignore`).
2. Entrá a <https://vercel.com/new> e importá el repositorio.
3. En **Environment Variables** agregá:

| Variable | Valor |
|----------|-------|
| `SPREADSHEET_ID` | El ID de tu planilla |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Todo** el contenido del JSON, en una sola línea |
| `TZ` | `America/Argentina/Buenos_Aires` |
| `SUPABASE_URL` | Opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional |
| `SUPABASE_AUDIT_TABLE` | Opcional (`clases_auditoria`) |

4. Presioná **Deploy**.
5. Abrí la URL que te da Vercel.

> En Vercel no existe el archivo `credentials/service-account.json`, por eso se
> usa la variable `GOOGLE_SERVICE_ACCOUNT_JSON`. El servidor acepta las dos
> formas.

### Opción B · Desde la terminal

```bash
npm install -g vercel
vercel
```

Vercel te va a pedir iniciar sesión y configurar el proyecto. Después cargá las
variables de entorno desde el panel de Vercel y volvé a desplegar con `vercel
--prod`.

---

## Estructura del proyecto

```
repo/
├── api/
│   └── [...path].js          Adaptador para Vercel
├── credentials/              Acá va service-account.json (no se sube)
├── lib/
│   ├── auditoria.js          Envío opcional a Supabase
│   ├── fechas.js             Nombre de pestaña: "LUNES 9/3/2026"
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
Revisá la ruta en `.env` (`GOOGLE_APPLICATION_CREDENTIALS`).

### “Google rechazó el acceso” (error 403)

La planilla no está compartida con la cuenta de servicio. Compartila con el
correo que termina en `@....iam.gserviceaccount.com` con permiso **Editor**.

### “No se encontró la planilla” (error 404)

El `SPREADSHEET_ID` está mal copiado. Tiene que ser solo la parte entre `/d/` y
`/edit` de la URL.

### “La pestaña todavía no existe”

Es normal antes de guardar la primera clase del día. La app la crea
automáticamente al guardar. También se puede crear vacía desde Google Sheets.

### El puerto 3000 está ocupado

Cerrá el otro programa o cambiá el puerto en `.env`:

```env
PORT=3001
```

Después abrí `http://localhost:3001`.

### El nombre de la pestaña no coincide con mi planilla

La app genera `MIÉRCOLES` con tilde. Si tu planilla usa `MIERCOLES` sin tilde,
cambiá la lista `DIAS` en `lib/fechas.js` **y** en `public/app.js` para que
coincidan.

### Quiero cambiar las opciones de los selectores

Editá `catalogo.json` y recargá la página. El campo Estado está fijo por
requisito del desafío.

---

## Seguridad

- `.env`, `credentials/` y `Plan.txt` están en `.gitignore`: no se suben a Git.
- Nunca compartas el JSON de la cuenta de servicio ni la `service_role key` de
  Supabase.
- Si un token o clave se compartió por chat, correo o documento, **regeneralo**
  desde el panel del proveedor.

---

## Comandos disponibles

| Comando | Qué hace |
|---------|----------|
| `npm start` | Inicia el servidor en http://localhost:3000 |
| `npm run dev` | Inicia con recarga automática al guardar cambios |
| `npm run setup` | Verifica credenciales y conexión con Google Sheets |
| `npm run test:read` | Lee la pestaña de hoy y la imprime en JSON |
| `npm run test:read -- 2026-03-09` | Lee una fecha específica |
