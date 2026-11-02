# Casa en Orden

Aplicación web privada para registrar y controlar los pagos de una familia: gastos por categoría, comprobantes, vencimientos de servicios y presupuestos.

> **Estado:** las 8 fases del plan están completas: varios hogares independientes con
> superadmin, pagos con categorías jerárquicas y comprobantes, vencimientos y calendario,
> presupuestos, resumen de gastos, pruebas de punta a punta, revisión de seguridad y copias
> de seguridad automáticas. Lista para publicarse gratis: ver
> [Publicar gratis en Render + Neon](#publicar-gratis-en-render--neon).

## Publicar gratis en Render + Neon

La aplicación se publica como **un solo servicio** (la API sirve también la web) en **Render**, y
la base de datos va en **Neon**. Las dos tienen plan gratis y ninguna pide tarjeta para empezar
(los planes gratis cambian: revisá las condiciones al crear las cuentas).

| Parte | Dónde | Plan gratis |
|---|---|---|
| La aplicación | [Render](https://render.com) | 750 horas por mes (alcanza para tenerla prendida todo el mes); se duerme a los 15 minutos sin visitas |
| Base de datos | [Neon](https://neon.com) | PostgreSQL sin vencimiento, unos 0,5 GB y 100 horas de cómputo por mes; se duerme sola cuando nadie la usa y se despierta en menos de un segundo |
| Comprobantes | dentro de la base | Render gratis no tiene disco permanente: los archivos van en la tabla `stored_files`. Las fotos se achican antes de subirse (unos 300 KB cada una) |

Archivos del repositorio que se usan:

| Archivo | Para qué |
|---|---|
| [render.yaml](render.yaml) | Le dice a Render cómo armar el servicio: plan gratis, región Virginia, chequeo `/api/health` y las variables secretas que hay que cargar |
| [Dockerfile](Dockerfile) | Compila el frontend y arma el backend con la web incluida. Al arrancar aplica las migraciones y crea el superadmin (`python -m app.predeploy`). Deja el modo producción: cookies solo por HTTPS, HSTS, sin `/api/docs`, IP real detrás del proxy, comprobantes en la base |
| [.dockerignore](.dockerignore) | Deja afuera `.env`, `storage/`, `respaldos/` y dependencias locales |

### 1. Base de datos en Neon

1. Creá una cuenta en [neon.com](https://neon.com) (se puede entrar con GitHub).
2. **New project**: nombre `casa-en-orden`, la versión de PostgreSQL que ofrezca por defecto y
   región **AWS US East 1 (N. Virginia)**, la misma que la app en Render.
3. En el panel del proyecto, **Connect**: **desactivá "Connection pooling"** (la app necesita la
   conexión directa: la dirección **no** debe tener `-pooler`) y copiá la dirección. Tiene esta
   forma: `postgresql://usuario:contraseña@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
   Es secreta: no la compartas ni la subas a GitHub.

### 2. La aplicación en Render

1. Creá una cuenta en [render.com](https://render.com) **con tu cuenta de GitHub** y dale acceso
   al repositorio (privado) `finanzas_casa`.
2. **New → Blueprint** y elegí el repositorio. Render lee el `render.yaml` y pide tres valores:
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la dirección de Neon del paso anterior, tal cual |
   | `SUPERADMIN_USERNAME` | el usuario para administrar los hogares (por ejemplo `admin`) |
   | `SUPERADMIN_PASSWORD` | una contraseña de **al menos 12 caracteres** |
3. **Apply**. La primera vez tarda unos minutos (compila todo). Cuando termine, la app queda en
   `https://casa-en-orden….onrender.com` (la dirección aparece arriba en el panel del servicio).
4. Entrá con el superadmin. Después, en **Environment**, **borrá `SUPERADMIN_PASSWORD`**: ya no
   hace falta (el superadmin existe y no se vuelve a crear).
5. Desde **Hogares**, creá el hogar con su administrador; esa persona agrega al resto.

Cada `git push` a la rama principal vuelve a publicar la app. Si algo falla al arrancar (por
ejemplo, una migración), Render deja funcionando la versión anterior.

### 3. Que no se duerma (recomendado)

Si nadie la usa durante 15 minutos, Render la apaga, y la siguiente persona espera cerca de un
minuto a que arranque. Para evitarlo, un servicio gratis la visita cada 10 minutos:

1. Creá una cuenta en [cron-job.org](https://cron-job.org).
2. **Create cronjob**: dirección `https://TU-APP.onrender.com/api/ping`, cada **10 minutos**.

Usá `/api/ping` y **no** `/api/health`: `/api/ping` responde sin consultar la base, así Neon se
puede dormir cuando nadie usa la app y no se gastan sus horas gratis.

### Copias de la base en internet

Neon guarda el historial de cambios de los últimos días, pero conviene tener copias propias.
Desde tu PC (la que tiene la instalación local):

1. Agregá al archivo `.env` la dirección de Neon:
   `CLOUD_DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require&channel_binding=require`
2. Doble clic en **`respaldo-nube.cmd`** cada tanto (por ejemplo, una vez por semana). Baja una
   copia completa (pagos **y** comprobantes) a `respaldos\nube`. `respaldo-nube listar` muestra
   las que hay.

Son copias como las de tu PC (ver [Copias de seguridad](#copias-de-seguridad)): se pueden
verificar y, si hiciera falta, restaurar en la PC o de vuelta en Neon
(`respaldo-nube restaurar ARCHIVO --confirmar`). Además, desde **Pagos hechos** se exportan los
pagos a Excel.

### Qué cambia en el servidor respecto de tu PC

| | En tu PC | En Render |
|---|---|---|
| Dirección | `http://localhost:8000` | `https://….onrender.com` (HTTPS) |
| `APP_ENV` | `development` | `production` (lo fija el Dockerfile) |
| Superadmin inicial | `create-admin` por consola | variables `SUPERADMIN_*` en el primer arranque |
| IP de cada persona | la de la conexión | la real, informada por el proxy (`TRUST_PROXY=true`) |
| Comprobantes | en la base (`STORAGE_BACKEND=database`) | en la base |
| Copias de seguridad | automáticas, una por día (`respaldos/`) | `respaldo-nube.cmd` desde tu PC (`respaldos\nube`) |

### Alternativa: Railway (pago)

El mismo repositorio sirve para [Railway](https://railway.com) (plan Hobby): **New Project →
Deploy from GitHub repo**, después **+ New → Database → PostgreSQL**, y en las variables del
servicio `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SUPERADMIN_USERNAME` y
`SUPERADMIN_PASSWORD`. El [railway.json](railway.json) aplica las migraciones antes de cada
despliegue y usa `/api/health` para decidir si la versión nueva se pone en línea. Como los
comprobantes van en la base, no hace falta volumen. Para la dirección, **Settings → Networking →
Generate Domain**.

## Lista para uso real

Antes de empezar a cargar los datos de verdad (en tu PC):

- [ ] **Datos de ejemplo:** cuando ya no los necesites, borralos con
      `python -m app.demo_data borrar` (desde `backend`). Borra solo lo generado.
- [ ] **Contraseñas:** cada persona ingresa con su usuario y cambia la contraseña provisoria
      (la app lo exige). La del superadmin (`admin`) ya no es `admin`.
- [ ] **Un administrador por hogar:** desde Hogares (superadmin), cada hogar tiene que tener al
      menos un administrador para gestionar categorías, vencimientos y presupuestos.
- [ ] **Uso diario:** `prod.cmd` (o `prod.cmd -Red` para los celulares de la casa). Hace la copia
      de seguridad del día al iniciar.
- [ ] **Copia fuera de la PC:** copiar cada tanto la carpeta `respaldos/` a un pendrive o a la
      nube. Probar una vez `respaldo.cmd verificar` sobre una copia.
- [ ] **PostgreSQL** tiene que iniciar con Windows (es la configuración por defecto del
      instalador: servicio `postgresql-x64-18`).
- [ ] **Actualizaciones de la aplicación:** al iniciar, se aplican solas las migraciones
      pendientes, después de la copia de seguridad del día.

## Arquitectura

```
movimientos/
├── backend/            API REST (Python, FastAPI, SQLAlchemy 2, Alembic)
│   ├── app/
│   │   ├── api/        rutas HTTP
│   │   ├── core/       configuración, conexión a la base, seguridad
│   │   ├── models/     tablas (SQLAlchemy)
│   │   ├── schemas/    validación de entrada/salida (Pydantic)      [Fase 3+]
│   │   ├── services/   lógica del negocio                           [Fase 3+]
│   │   └── main.py     punto de entrada
│   ├── alembic/        migraciones de la base de datos
│   └── tests/          pruebas automáticas (pytest)
├── frontend/           interfaz (React, TypeScript, Vite)
│   └── src/
│       ├── app/        router, navegación, cliente de TanStack Query
│       ├── components/ componentes reutilizables (ui/ = shadcn/ui, layout/ = estructura)
│       ├── features/   código agrupado por funcionalidad (hooks, componentes, pruebas)
│       ├── lib/        cliente de la API, formato de importes y fechas
│       ├── pages/      pantallas
│       └── test/       configuración y utilidades de pruebas
├── storage/            comprobantes, solo con STORAGE_BACKEND=local (privado, fuera de git)
└── .env                configuración local (fuera de git)
```

- **PostgreSQL** es la única fuente de datos.
- **Autenticación:** ver [Seguridad](#seguridad).
- **Aislamiento entre hogares:** cada tabla tiene `household_id` y la base usa claves foráneas
  compuestas para impedir mezclar datos de distintos hogares, incluso ante un error del código.

## Requisitos previos

- Python 3.12 o superior (verificado con 3.13).
- PostgreSQL 18 (verificado con 18.6, instalado en Windows).
- Node.js 24 LTS (verificado con 24.22.1): `winget install OpenJS.NodeJS.LTS`.

## Instalación

### 1. Base de datos

Como usuario `postgres` (SQL Shell o pgAdmin):

```sql
CREATE ROLE family_finance WITH LOGIN PASSWORD 'una-contraseña-larga';
CREATE DATABASE family_finance OWNER family_finance;
CREATE DATABASE family_finance_test OWNER family_finance;
```

### 2. Variables de entorno

Copiar `.env.example` como `.env` en la raíz y completar las contraseñas en `DATABASE_URL`
y `TEST_DATABASE_URL`. El nombre de la base de pruebas debe terminar en `_test`
(las pruebas la vacían; es una protección contra borrar la base real).

| Variable | Descripción |
|---|---|
| `APP_ENV` | `development`, `test` o `production` |
| `DATABASE_URL` | Conexión a la base principal |
| `TEST_DATABASE_URL` | Conexión a la base de pruebas |
| `CORS_ORIGINS` | URL(s) del frontend, separadas por comas |
| `STORAGE_BACKEND` | Dónde van los comprobantes: `database` (por defecto, dentro de la base) o `local` (en `STORAGE_DIR`) |
| `CLOUD_DATABASE_URL` | Opcional: la base de Neon, para bajar copias con `respaldo-nube.cmd` |
| `MAX_UPLOAD_MB` | Tamaño máximo por archivo |

### 3. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
alembic upgrade head          # crea/actualiza las tablas
uvicorn app.main:app --reload # http://localhost:8000/api/docs
```

### 4. Superadmin

La aplicación admite varios hogares, totalmente separados entre sí. Los administra un
**superadmin**, que se crea con un comando (desde `backend`, con el entorno virtual activado):

```powershell
python -m app.cli create-admin --default   # usuario "admin", contraseña "admin"
python -m app.cli create-admin             # pide nombre, usuario y contraseña por consola
```

Con `--default`, la aplicación **obliga a cambiar la contraseña en el primer ingreso**: hasta
hacerlo, el backend rechaza cualquier otra operación. Lo mismo ocurre con las contraseñas que se
asignan a otra persona (usuarios nuevos o contraseñas restablecidas).

| Rol | Qué hace |
|---|---|
| Superadmin | Sección **Hogares**: crea hogares (con su administrador), los renombra, activa o desactiva, y gestiona sus usuarios. **No ve datos financieros** de ningún hogar. |
| Administrador | Dentro de su hogar: usuarios, categorías, servicios e historial. |
| Integrante | Registra y consulta pagos, comprobantes y vencimientos de su hogar. |

Cada hogar nuevo se crea con las categorías Tarjeta de crédito, Servicio y Auto, vacías. Desactivar un hogar cierra en el acto las sesiones de sus usuarios.
Para convertir un usuario existente (sin pagos cargados) en superadmin:
`python -m app.cli make-superadmin USUARIO`.

### 5. Frontend

En otra terminal (el backend tiene que estar corriendo):

```powershell
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

En desarrollo, Vite redirige las peticiones `/api/*` al backend (puerto 8000; se puede cambiar
con la variable `API_PROXY_TARGET`). Así el navegador ve un único origen y las cookies de sesión
funcionan sin configuración extra.

## Uso diario: todo en una sola terminal

Una vez instalado, desde la carpeta del proyecto:

```powershell
.\dev.cmd
```

(o doble clic sobre `dev.cmd`). El script [dev.ps1](dev.ps1):

1. Verifica que estén las dependencias y que los puertos 8000 y 5173 estén libres.
2. Hace la copia de seguridad del día (si todavía no hay) y aplica las migraciones pendientes
   (no borran datos).
3. Levanta la API y el frontend, con los mensajes de ambos en la misma terminal.
4. Con **Ctrl+C** detiene los dos y cierra todos sus procesos.

La aplicación queda en http://localhost:5173. Se usa `dev.cmd` porque Windows bloquea por
defecto los scripts `.ps1`; `dev.cmd` permite ejecutarlo solo esa vez, sin cambiar la configuración.

### Modo rápido (para usar la aplicación, no para programarla)

```powershell
.\prod.cmd
```

Compila el frontend y lo sirve la propia API en **http://localhost:8000**, comprimido (GZip) y
con caché del navegador (los archivos con hash se guardan un año; `index.html` se revalida
siempre). No recarga al guardar cambios: si se modifica el código, volver a ejecutarlo. Usa el
puerto 8000, así que no puede correr a la vez que `dev.cmd`. **Es el modo recomendado para el
uso diario de la familia.**

#### Desde los celulares de la casa

```powershell
.\prod.cmd -Red
```

Además de `localhost`, la aplicación queda disponible en la red de la casa (Wi-Fi o cable) y el
script muestra la dirección para abrir desde el celular (ej. `http://192.168.0.10:8000`). La
primera vez, Windows pregunta si permitir Python en redes privadas: respondé que sí (solo
**privadas**, nunca públicas). La computadora tiene que estar encendida y con la aplicación
abierta.

Consideraciones:
- Es para la red **de tu casa**. No abras el puerto 8000 en el router ni lo publiques en
  internet: para eso haría falta HTTPS (un dominio con certificado, o una VPN como Tailscale).
- Dentro de la casa la conexión es `http` (sin cifrar): alguien conectado a tu Wi-Fi podría, con
  herramientas especiales, ver el tráfico. Usá una contraseña de Wi-Fi segura.
- Dejá `APP_ENV=development` (ver `.env.example`): `production` exige HTTPS.

### Guía para la familia

[docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md): cómo cargar pagos, pagar vencimientos, leer los
gastos y qué hace cada rol, sin términos técnicos.

En los dos modos cada pantalla se descarga recién cuando hace falta (carga diferida) y las
secciones del menú se precargan al pasar el mouse o cuando el navegador está libre.

## Datos de ejemplo

Para probar la aplicación con datos (desde `backend`, con el entorno virtual activado):

```powershell
python -m app.demo_data cargar "Mi hogar"   # pagos y vencimientos aleatorios desde julio
python -m app.demo_data borrar              # elimina exactamente lo generado
```

Usa el catálogo que el hogar ya tiene (no lo modifica). Lo generado se anota en
`storage/demo_data.json`; `borrar` elimina solo eso, sin tocar lo cargado a mano.

## Migraciones

Las tablas **nunca** se crean ni modifican a mano: siempre con Alembic.

```powershell
alembic upgrade head                              # aplicar migraciones pendientes
alembic revision --autogenerate -m "descripcion"  # crear una migración tras cambiar un modelo
alembic check                                     # verificar que modelos y base coinciden
```

Revisar siempre el archivo generado antes de aplicarlo.

## Pruebas y calidad

```powershell
cd backend
pytest                              # pruebas (usan la base _test)
pytest --cov=app --cov-report=term  # con cobertura (hoy ~97 %)
ruff check .                        # análisis estático
ruff format .                       # formato
```

```powershell
cd frontend
npm test            # pruebas (Vitest + React Testing Library)
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run build       # compilación de producción en dist/
```

### Prueba de punta a punta

```powershell
.\e2e.cmd                 # compila el frontend y recorre toda la aplicación
.\e2e.cmd --sin-compilar  # usa el frontend ya compilado
```

Usa la aplicación en un navegador real (Edge o Chrome, sin ventana) como lo haría la familia:
el superadmin crea un hogar; la administradora arma categorías, vencimientos e integrantes y
carga un pago con comprobante; un integrante comprueba sus permisos y paga un vencimiento; se
fija un presupuesto y se revisan Inicio, gastos y exportación; se prueba el celular y el modo
oscuro; y el superadmin desactiva el hogar. Al final verifica **en PostgreSQL y en disco** que
todo quedó guardado. Cualquier error de JavaScript en la página hace fallar la prueba.

Trabaja sobre la base `_test` (que vacía al empezar), con comprobantes en una carpeta temporal
y en los puertos 8001 y 9223: no toca tus datos y puede correr con `dev.cmd` abierto. Si algo
falla, deja una captura en `e2e/fallas/`.

### Seguridad verificada automáticamente

[tests/test_security.py](backend/tests/test_security.py) toma **todas** las rutas de la API y
comprueba que: ninguna responde sin sesión (salvo login y estado); ninguna operación que cambia
datos funciona sin el token CSRF; con identificadores de otro hogar, todo responde 404. Si se
agrega una ruta nueva sin proteger, la prueba falla sola. También verifica los encabezados de
seguridad (ver [Seguridad](#seguridad)).

## Endpoints disponibles

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/health` | Público | Estado de la API y de la conexión a PostgreSQL |
| GET | `/api/ping` | Público | Responde sin tocar la base (para que Render no duerma la app) |
| GET / POST | `/api/households` | Superadmin | Hogares (nombre, estado, cantidad de usuarios) / crear uno con su administrador |
| GET / PATCH | `/api/households/{id}` | Superadmin | Detalle / renombrar, activar o desactivar |
| GET / POST | `/api/households/{id}/users` | Superadmin | Usuarios de ese hogar / agregar uno |
| GET / PATCH | `/api/households/{id}/users/{user_id}` | Superadmin | Consultar / modificar (ej. nombrar administrador) |
| POST | `/api/households/{id}/users/{user_id}/reset-password` | Superadmin | Contraseña provisoria nueva |
| POST | `/api/auth/login` | Público | Inicia sesión (deja las cookies de sesión y CSRF) |
| POST | `/api/auth/logout` | Sesión | Cierra la sesión actual |
| GET | `/api/auth/me` | Sesión | Usuario y hogar de la sesión |
| POST | `/api/auth/change-password` | Sesión | Cambia la propia contraseña (cierra las otras sesiones) |
| GET | `/api/users` | Admin | Usuarios del hogar |
| POST | `/api/users` | Admin | Crea un usuario |
| GET / PATCH | `/api/users/{id}` | Admin | Consulta / modifica nombre, usuario, rol o estado |
| POST | `/api/users/{id}/reset-password` | Admin | Asigna una contraseña nueva (cierra sus sesiones) |
| GET | `/api/audit-logs` | Admin | Historial de acciones (paginado) |
| GET | `/api/members` | Sesión | Integrantes del hogar (solo nombre) |
| GET | `/api/categories` | Sesión | Categorías con sus tipos y elementos (`?include_inactive=true`: admin) |
| POST / PATCH | `/api/categories[/{id}]` | Admin | Crear / renombrar / cambiar estructura / activar o desactivar |
| POST | `/api/categories/{id}/types` | Admin | Agregar un tipo (ej. Visa) |
| PATCH | `/api/category-types/{id}` | Admin | Renombrar / activar o desactivar un tipo |
| POST | `/api/categories/{id}/items` | Admin | Agregar un elemento (ej. un auto) |
| PATCH | `/api/category-items/{id}` | Admin | Renombrar / activar o desactivar un elemento |
| GET | `/api/transactions` | Sesión | Pagos con filtros, orden, paginación y total |
| POST | `/api/transactions` | Sesión | Registrar un pago |
| GET / PUT / DELETE | `/api/transactions/{id}` | Sesión* | Detalle / editar / eliminar |
| POST | `/api/transactions/{id}/attachments` | Sesión* | Adjuntar un comprobante |
| GET | `/api/attachments/{id}/content` | Sesión | Ver (`?download=true`: descargar) un comprobante |
| DELETE | `/api/attachments/{id}` | Sesión* | Eliminar un comprobante |

\* Solo quien registró el pago o un administrador. Todos los integrantes pueden **ver**
los pagos y comprobantes del hogar.

Filtros de `/api/transactions`: `date_from`, `date_to` (fecha de pago), `category_id`,
`category_type_id`, `item_id`, `created_by_id`, `amount_min`, `amount_max`, `q` (descripción,
observaciones y nombres de categoría, tipo y elemento, sin distinguir tildes), `sort` (`date`,
`amount`, `description`, `created`), `order` (`asc`, `desc`), `page`, `page_size`.

| GET / POST | `/api/services` | Sesión / Admin | Servicios (con su próximo vencimiento) / crear uno |
| GET / PUT | `/api/services/{id}` | Sesión / Admin | Detalle / editar (incluye activar o desactivar) |
| GET | `/api/services/{id}/periods` | Sesión | Historial de vencimientos del servicio |
| GET | `/api/service-periods?date_from=&date_to=` | Sesión | Vencimientos del rango (los genera si faltan) |
| GET | `/api/service-periods/alerts?days=7` | Sesión | Vencidos y por vencer (aviso del menú) |
| GET / PATCH | `/api/service-periods/{id}` | Sesión | Detalle / corregir importe o notas del período |
| POST | `/api/service-periods/{id}/pay` | Sesión | Pagar: crea el pago en Pagos o vincula uno existente |
| POST | `/api/service-periods/{id}/unpay` | Sesión* | Anular el pago (opcionalmente lo elimina de Pagos) |
| GET | `/api/service-periods/{id}/candidates` | Sesión | Pagos ya cargados que podrían corresponder |
| POST | `/api/service-periods/{id}/attachments` | Sesión | Adjuntar factura o comprobante al vencimiento |

| GET | `/api/reports/summary?month=AAAA-MM` | Sesión | Resumen de Inicio: total del mes, del anterior y por categoría |
| GET | `/api/reports/monthly?until=AAAA-MM&months=12` | Sesión | Evolución: total de cada mes (opcional `category_id`) |
| GET | `/api/reports/monthly-grouped?group=…` | Sesión | Evolución desglosada por categoría, tipo o elemento (barras apiladas) |
| GET | `/api/reports/daily?month=AAAA-MM` | Sesión | Total de cada día del mes (gasto acumulado) |
| GET | `/api/reports/patterns` | Sesión | Gasto por día de la semana y por día del mes |
| GET | `/api/reports/punctuality?months=6` | Sesión | Vencimientos pagados a tiempo, tarde o vencidos |
| GET | `/api/reports/projection?month=AAAA-MM` | Sesión | Lo gastado más los vencimientos que faltan pagar |
| GET | `/api/budgets/{category_id}/history` | Sesión | Presupuesto contra gastado, mes a mes |
| GET | `/api/reports/breakdown?group=…` | Sesión | Gasto por `category`, `type`, `item` o `member` en un rango (opcional `category_id`) |
| GET | `/api/reports/export.csv` | Sesión | Pagos del rango en CSV para Excel (`;` y coma decimal) |
| GET | `/api/budgets?month=AAAA-MM` | Sesión | Presupuestos vigentes en el mes, con lo gastado y su estado |
| PUT | `/api/budgets/{category_id}` | Admin | Fija (o quita, con `amount: null`) el límite desde un mes |

### Resumen de gastos y presupuestos

- **Inicio**: tres botones grandes (Cargar un pago, Por pagar, Cuánto gastamos), las cuentas
  para pagar pronto y los últimos pagos.
- **Por pagar**: lo pendiente agrupado en vencidas, de esta semana y más adelante.
- **Cuánto gastamos**: total del mes, comparación con el mes anterior y gasto por categoría.
- **Pagos hechos**: la lista con filtros y **Exportar a Excel** (CSV) del período elegido.
- **Presupuestos**: un límite mensual por categoría que rige desde su mes hasta que se cambia
  (los meses anteriores conservan el suyo). Avisa al llegar al 80 % y cuando se supera.

Todo se calcula en PostgreSQL con importes exactos.

### Servicios y vencimientos

- Los vencimientos se programan en **Categorías (menú principal, solo administradores)**: cada tipo (Luz, Visa,
  Patente…) tiene la opción «Tiene vencimiento» con fecha, frecuencia e importe. En categorías
  con elementos, cada elemento tiene el suyo (la patente de cada auto). Uno solo por tipo y
  elemento (restricción única en la base). Al pagarlo se registra en esa categoría y tipo.
- El **Calendario** tiene dos vistas: **Vencimientos** (lo programado) y **Pagos realizados**
  (lo cargado en Pagos, por fecha de pago, con el total del mes y de cada día).
- Los vencimientos se generan a demanda según la frecuencia, calculados siempre desde el primer
  vencimiento (un servicio que vence el 31 cae el 28/29 de febrero y vuelve al 31 en marzo).
  La restricción única (servicio, fecha) impide duplicados.
- Cada período guarda su importe: un nuevo importe del servicio se aplica solo a los
  vencimientos futuros que no se corrigieron a mano.
- "Vencido" no se guarda: es un pendiente con fecha pasada. Nada se marca pagado solo.
- Pagar crea el gasto en Pagos o vincula uno ya cargado (un pago no puede cancelar dos
  vencimientos). El período se bloquea al pagarlo: dos personas no pueden pagarlo a la vez.

### Categorías

Cada categoría tiene una estructura, que define qué se elige al registrar un pago:

| Estructura | Ejemplo | Al cargar un pago |
|---|---|---|
| Sin subdivisión | Supermercado | Solo la categoría |
| Con tipos | Tarjeta de crédito → Visa, Mastercard | Categoría → tipo |
| Con elementos y tipos | Auto → Fiat Cronos, Ford Ka; tipos: Seguro, Patente | Categoría → auto → tipo |

La base de datos garantiza (con claves foráneas compuestas) que el tipo y el elemento de un pago
pertenecen a su categoría, y la categoría al hogar. La estructura solo se puede cambiar mientras
la categoría no tenga pagos.

La documentación interactiva está en `/api/docs` (deshabilitada en producción).

## Seguridad

- **Contraseñas:** Argon2id. Mínimo 6 caracteres.
- **Sesiones:** token aleatorio en una cookie `HttpOnly` y `SameSite=Lax` (`Secure` en producción).
  En la base se guarda solo su hash SHA-256. Vencen tras 14 días sin actividad.
- **CSRF:** las operaciones que modifican datos exigen el encabezado `X-CSRF-Token`, cuyo valor
  está en la cookie `ff_csrf` y está ligado a la sesión.
- **Usuarios:** se inicia sesión con un nombre de usuario (no con email). No distingue mayúsculas
  y admite letras sin acentos, números, punto, guion y guion bajo.
- **Fuerza bruta:** tras 5 intentos fallidos para un usuario (o 20 desde una IP) en 15 minutos,
  el inicio de sesión se bloquea temporalmente. Los mensajes de error no revelan si un usuario existe.
- **Permisos:** se verifican en el backend en cada petición. Un recurso de otro hogar responde
  404, igual que uno inexistente. El hogar siempre conserva al menos un administrador activo.
- **Hogares:** cada dato lleva su hogar y las claves foráneas compuestas impiden mezclar datos de
  hogares distintos. El superadmin administra hogares y usuarios pero no puede ver pagos,
  categorías, servicios ni comprobantes de ningún hogar. Desactivar un hogar cierra sus sesiones.
- **Encabezados de seguridad:** todas las respuestas llevan `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` (la app no se puede mostrar dentro de otro sitio), `Referrer-Policy` y
  `Permissions-Policy`; en producción, también HSTS. La aplicación web compilada se sirve con una
  política de contenido (CSP) estricta: solo código propio, y el único script en línea (el que
  aplica el tema) se autoriza por su hash exacto.
- **Errores:** ante un error inesperado el cliente recibe un mensaje genérico; el detalle queda
  solo en el registro del servidor. Si falla el guardado de un comprobante, el archivo se borra
  (no quedan archivos huérfanos).
- **Dependencias:** `npm audit --omit=dev` sin vulnerabilidades conocidas en lo que llega al
  navegador.
- **Historial:** las acciones administrativas quedan registradas en `audit_logs` (sin secretos).
- **Comprobantes:** se guardan dentro de la base (tabla `stored_files`, en el mismo commit que
  su registro: nunca queda uno sin el otro) o, con `STORAGE_BACKEND=local`, en `STORAGE_DIR`
  (fuera de git y fuera del frontend), siempre con un nombre generado por el servidor. El tipo se valida por el contenido real
  del archivo (no por la extensión). Solo se entregan a integrantes del hogar, a través de la API.
  La lógica usa una interfaz `Storage` (`backend/app/storage`): para pasar a un servicio
  compatible con S3 alcanza con agregar otra implementación.

## Copias de seguridad

**Automáticas:** `dev.cmd` y `prod.cmd` hacen una copia por día al iniciarse, **antes de aplicar
migraciones** (si una actualización saliera mal, hay una copia de ese mismo día). Se conservan las
últimas 30 (`BACKUP_KEEP`) en la carpeta `respaldos/` (`BACKUP_DIR`).

**Manuales**, desde la carpeta del proyecto:

```powershell
.\respaldo.cmd                                         # crear una copia ahora
.\respaldo.cmd listar                                  # ver las copias guardadas
.\respaldo.cmd verificar respaldos\respaldo_….zip      # comprobar que se pueda leer
.\respaldo.cmd restaurar respaldos\respaldo_….zip --confirmar
```

Cada copia es **un solo archivo .zip** con las dos partes tomadas juntas: la base de datos
(formato de `pg_dump`, que ya incluye los comprobantes guardados en la base) y la carpeta de
comprobantes si se usa `STORAGE_BACKEND=local`, más un resumen (fecha, versión del esquema y
cantidad de registros). Se arma con otro nombre y recién completa recibe el definitivo: nunca
queda una copia a medias que parezca buena. Dos copias nunca se pisan.

**Restaurar** reemplaza todos los datos por los de la copia, por eso:
- sin `--confirmar` solo muestra qué haría;
- exige que la aplicación esté cerrada;
- antes guarda una copia del estado actual (por si se eligió el archivo equivocado);
- la base se restaura en una sola transacción: si algo falla, queda como estaba.

> **Importante:** una copia en la misma computadora no protege si el disco se rompe o se pierde
> la PC. Copiá cada tanto la carpeta `respaldos/` a un pendrive, otro disco o la nube (Google
> Drive, OneDrive…). Contiene todos los datos del hogar: guardala en un lugar privado.

La ida y vuelta (copiar → borrar datos → restaurar → comparar) se probó sobre la base `_test`.
