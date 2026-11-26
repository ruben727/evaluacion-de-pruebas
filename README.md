# Sistema de gestión de usuarios — CI/CD, pruebas y observabilidad

Aplicación web sencilla (registro, login con JWT y CRUD de usuarios) pensada como base para un
proyecto universitario de **CI/CD, pruebas automatizadas y observabilidad**, lista para desplegarse
con Docker en AWS EC2.

| Capa | Tecnología |
|------|------------|
| Frontend | Angular 22 (standalone components, signals) servido con **nginx** |
| Backend | Node.js 22 + Express 5 (JavaScript) |
| Base de datos | PostgreSQL 16 (contenedor con volumen persistente) |
| Pruebas | Jest + Supertest (backend), Vitest (frontend, runner por defecto de Angular), Playwright (E2E) |
| Observabilidad | OpenTelemetry (trazas, métricas, logs) → OTLP HTTP → OpenObserve; logs JSON con pino |

---

## Estructura

```
.
├── docker-compose.yml        # db, backend, frontend (+ openobserve opcional)
├── .env.example              # plantilla de variables (copiar a .env)
├── package.json              # scripts de conveniencia para todo el proyecto
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── instrumentation.js    # OpenTelemetry (se carga con --require antes que la app)
│   │   ├── server.js             # espera a la BD → migración → admin inicial → escucha
│   │   ├── app.js                # app Express (sin listen, para Supertest)
│   │   ├── config.js  logger.js  metrics.js
│   │   ├── routes/               # auth, users, health
│   │   ├── controllers/          # lógica de cada endpoint
│   │   ├── middlewares/          # JWT, logger de peticiones, errores
│   │   ├── db/                   # pool, migración, seed del admin, repositorio de usuarios
│   │   └── utils/                # HttpError, validadores
│   └── tests/                    # Jest + Supertest contra Postgres real
├── frontend/
│   ├── Dockerfile                # multi-stage: build Angular → nginx
│   ├── nginx.conf                # SPA + proxy /api → backend:3000
│   └── src/app/
│       ├── core/                 # AuthService, guard, interceptor, UsersService
│       └── pages/                # login, register, users
└── e2e/
    ├── playwright.config.ts
    └── tests/                    # auth, CRUD, health
```

---

## Requisitos

- Docker Desktop (o Docker Engine) con Docker Compose v2
- Node.js 22+ y npm (solo para correr las pruebas desde tu máquina)

## Correr el proyecto en local

```bash
# 1. Variables de entorno
cp .env.example .env
#    Edita .env: como mínimo POSTGRES_PASSWORD y JWT_SECRET
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Levantar todo
docker compose up -d --build

# 3. Comprobar
docker compose ps                       # los 3 servicios deben estar "healthy"
curl http://localhost:8080/api/health
```

- App web: **http://localhost:8080**
- Usuario admin inicial: el definido en `ADMIN_EMAIL` / `ADMIN_PASSWORD` (por defecto `admin@example.com` / `Admin123!`).
- La BD queda publicada en `localhost:5433` (configurable con `DB_HOST_PORT`).

Orden de arranque: `db` (healthcheck `pg_isready`) → `backend` (espera a la BD, además reintenta la conexión,
crea la tabla `users` y el admin; healthcheck sobre `/api/health`) → `frontend` (nginx).

Para parar: `docker compose down` (añade `-v` para borrar también los datos de la BD).

### Desarrollo sin Docker (opcional)

```bash
docker compose up -d db
cd backend && npm install
DATABASE_URL=postgres://postgres:<clave>@localhost:5433/app npm run dev     # API en :3000
cd frontend && npm install && npm start                                      # http://localhost:4200 (proxy /api → :3000)
```

---

## API (prefijo `/api`)

| Método | Ruta | Auth | Respuestas |
|--------|------|------|------------|
| GET | `/health` | — | 200 ok · 503 si la BD no responde |
| POST | `/auth/register` | — | 201 · 400 validación · 409 correo duplicado |
| POST | `/auth/login` | — | 200 `{ token, user }` · 400 · 401 credenciales inválidas |
| GET | `/auth/me` | JWT | 200 · 401 |
| GET | `/users` | JWT | 200 · 401 |
| GET | `/users/:id` | JWT | 200 · 400 id inválido · 401 · 404 |
| POST | `/users` | JWT | 201 · 400 · 401 · 409 |
| PUT | `/users/:id` | JWT | 200 · 400 · 401 · 404 · 409 (la contraseña es opcional) |
| DELETE | `/users/:id` | JWT | 200 · 401 · 404 |

El token se envía como `Authorization: Bearer <token>`. Los errores siempre tienen la forma
`{ "error": { "status": 400, "message": "...", "details": { "campo": "motivo" } } }` y los errores
inesperados devuelven 500 sin exponer detalles internos.

---

## Pruebas

Desde la raíz hay scripts que agrupan todo:

| Comando | Qué hace |
|---------|----------|
| `npm run test:backend` | Jest + Supertest (necesita Postgres) |
| `npm run test:frontend` | Pruebas unitarias de Angular (Vitest) |
| `npm run test:unit` | Las dos anteriores |
| `npm run test:e2e` | Playwright contra la app levantada con docker-compose |
| `npm test` | Todo lo anterior |

Primera vez: `npm run install:all` (instala dependencias de los 3 paquetes y Chromium para Playwright).

### 1. Backend — Jest + Supertest

Corren contra un **PostgreSQL real**. Usan una base separada `app_test` (se crea sola si no existe),
así que no tocan los datos de la app.

```bash
docker compose up -d db
cd backend
npm test                 # o: npm run test:coverage
```

- En local toman usuario/clave/puerto del `.env` de la raíz (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST_PORT`).
- En CI basta con definir `TEST_DATABASE_URL`, p. ej.
  `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/app_test npm test`.
- `TEST_LOG_LEVEL=info npm test` muestra los logs de la API durante las pruebas.

Cubren: registro (éxito, hash bcrypt, correo único sin distinguir mayúsculas, validaciones, JSON mal formado),
login (correcto, contraseña incorrecta, correo inexistente, campos faltantes), acceso sin token / token
inválido / expirado (401) en cada ruta protegida, cada operación del CRUD con sus casos 400/404/409,
health (200 y 503) y el manejador de errores (404 y 500).

### 2. Frontend — unitarias (Vitest)

```bash
cd frontend
npm test                 # una ejecución (ng test --watch=false)
npm run test:watch       # modo watch
```

Cubren `AuthService`, `authGuard`/`guestGuard`, el interceptor JWT, el componente de login y el CRUD
(listar, crear, editar, confirmar/cancelar borrado, errores del backend). Corren en jsdom: no hace falta navegador.

### 3. E2E — Playwright

Requieren la app levantada con docker-compose:

```bash
docker compose up -d --build
cd e2e
npm install && npx playwright install chromium     # solo la primera vez
npm run test:e2e
npm run report                                     # abre el reporte HTML
```

- `E2E_BASE_URL` cambia la URL objetivo (por defecto `http://localhost:8080`), p. ej. la de la instancia EC2.
- Los selectores usan atributos `data-testid`.

Escenarios: registro + login, login con credenciales inválidas, contraseña incorrecta, correo duplicado,
**crear, editar y eliminar un usuario** (con cancelación y confirmación del borrado y comprobando la persistencia
tras recargar), el usuario creado puede iniciar sesión, validaciones del formulario, **cerrar sesión** y
protección de rutas privadas, y `/api/health` a través de nginx.

---

## Observabilidad (OpenTelemetry → OpenObserve)

`backend/src/instrumentation.js` se carga **antes** que la app (`node --require ./src/instrumentation.js`) y
configura el SDK de Node con auto-instrumentaciones (http, **express**, **pg**, **pino**...) exportando por
**OTLP HTTP** trazas, métricas y logs.

- **Si `OTEL_EXPORTER_OTLP_ENDPOINT` no está definido, el SDK no se inicia** y la app funciona igual sin enviar nada.
- **Logs**: JSON estructurado con pino. Cada petición genera un registro con `method`, `route` (plantilla, p. ej.
  `/api/users/:id`), `path`, `statusCode`, `durationMs`, `timestamp` y `userId`; con OTel activo se añaden
  `trace_id`/`span_id` y los registros se envían también por OTLP. Contraseñas y `Authorization` se censuran.
- **Métricas por endpoint** (atributos `http.request.method`, `http.route`, `http.response.status_code`):
  - `app.http.requests` — número de peticiones
  - `app.http.errors` — respuestas con status ≥ 400 (`error.type` = `client_error` / `server_error`)
  - `app.http.request.duration` — histograma de latencia en ms
  - además las automáticas: `http.server.request.duration`, `db.client.operation.duration`, etc.
- **Trazas**: una por petición, con spans de los middlewares/handlers de Express y de cada consulta SQL.

### Enviar a OpenObserve Cloud

En `.env`:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.openobserve.ai/api/<tu_organizacion>
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64 de "usuario:contraseña">
OTEL_SERVICE_NAME=pruebas-final-backend
```

El base64 se obtiene con `node -e "console.log(Buffer.from('usuario@correo.com:contraseña').toString('base64'))"`
(el espacio tras `Basic` se escribe `%20`). Luego `docker compose up -d backend`.

### Probar con un OpenObserve local

```bash
docker compose --profile observability up -d openobserve
# en .env:
#   OTEL_EXPORTER_OTLP_ENDPOINT=http://openobserve:5080/api/default
#   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64 de ZO_ROOT_USER_EMAIL:ZO_ROOT_USER_PASSWORD>
docker compose up -d backend
```

Interfaz en http://localhost:5080 (usuario `ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD`): los logs aparecen en el
stream `default`, las trazas en *Traces* y las métricas como `app_http_requests`, `app_http_request_duration`, etc.

---

## Variables de entorno

Todas están en `.env.example`. **El `.env` real nunca se sube** (está en `.gitignore`).

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `POSTGRES_USER` | `postgres` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | — (**obligatoria**) | Contraseña de PostgreSQL |
| `POSTGRES_DB` | `app` | Nombre de la base de datos |
| `DB_HOST_PORT` | `5433` | Puerto del host donde se publica Postgres |
| `NODE_ENV` | `production` | Entorno del backend |
| `PORT` | `3000` | Puerto interno de la API |
| `JWT_SECRET` | — (**obligatoria**) | Secreto para firmar los JWT |
| `JWT_EXPIRES_IN` | `1h` | Vigencia del token |
| `BCRYPT_ROUNDS` | `10` | Coste de bcrypt |
| `LOG_LEVEL` | `info` | Nivel de log de pino (`debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | `*` | Orígenes permitidos (separados por coma) |
| `ADMIN_NAME` | `Administrador` | Nombre del admin inicial |
| `ADMIN_EMAIL` | — | Correo del admin inicial (si falta, no se crea) |
| `ADMIN_PASSWORD` | — | Contraseña del admin inicial |
| `FRONTEND_PORT` | `8080` | Puerto del host para la app web |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | vacío | Endpoint OTLP HTTP de OpenObserve; vacío = telemetría desactivada |
| `OTEL_EXPORTER_OTLP_HEADERS` | vacío | Cabeceras OTLP (autenticación Basic) |
| `OTEL_SERVICE_NAME` | `pruebas-final-backend` | Nombre del servicio en la telemetría |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | Intervalo de exportación de métricas (ms) |
| `ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD` | ver `.env.example` | Credenciales del OpenObserve local (perfil `observability`) |

Variables solo de pruebas: `TEST_DATABASE_URL` (backend), `TEST_LOG_LEVEL` (backend), `E2E_BASE_URL` (Playwright).

---

## Despliegue en AWS EC2 (resumen)

1. Instancia con Docker y el plugin de Compose; abre el puerto `FRONTEND_PORT` (o 80) en el Security Group.
   No hace falta exponer 5433 públicamente.
2. Clona el repositorio, crea el `.env` con secretos reales y ejecuta `docker compose up -d --build`.
3. Verifica con `curl http://<ip-publica>:8080/api/health` y corre los E2E con `E2E_BASE_URL=http://<ip-publica>:8080`.

> El workflow de GitHub Actions se agregará en una segunda etapa.
