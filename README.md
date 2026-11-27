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
├── docker-compose.yml        # db, backend, frontend (+ perfil "observability": openobserve, otel-collector, thermal-probe)
├── .env.example              # variables para desarrollo/CI (copiar a .env)
├── .env.production.example   # variables para la EC2
├── package.json              # scripts de conveniencia para todo el proyecto
├── .github/
│   ├── workflows/ci-cd.yml   # pipeline: test → notify-tests / deploy → notify-deploy
│   └── scripts/notify-openobserve.sh
├── observability/
│   ├── otel-collector.yaml   # métricas del host (CPU, RAM, red, disco, carga, filesystem, swap)
│   ├── thermal-probe.sh      # sonda de temperatura
│   └── dashboards/           # dashboards importables (JSON) + generador/validador + alertas
├── scripts/prepare-production-env.sh   # arma el .env de producción en la EC2
├── docs/
│   ├── OPENOBSERVE.md        # dashboards y alertas paso a paso
│   └── DEMO.md               # guion de la demostración
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

Variables añadidas para producción (ver `.env.production.example`):

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `COMPOSE_PROFILES` | vacío | `observability` en producción: levanta OpenObserve, Collector y sonda con `docker compose up -d` |
| `DB_BIND_ADDRESS` | `0.0.0.0` | Interfaz donde se publica Postgres (`127.0.0.1` en producción) |
| `APP_COMMIT` | `unknown` | Commit con el que se construye la imagen del backend; lo muestra `/api/health` (lo exporta el pipeline) |
| `ZO_RETENTION_DAYS` | `15` | Retención de datos en OpenObserve |
| `OPENOBSERVE_MEMORY_LIMIT` | `768M` | Límite de memoria del contenedor de OpenObserve |
| `ZO_MEMORY_CACHE_MAX_SIZE`, `ZO_MEMORY_CACHE_DATAFUSION_MAX_SIZE`, `ZO_MEM_TABLE_MAX_SIZE`, `ZO_MAX_FILE_SIZE_IN_MEMORY` | 128 / 128 / 64 / 32 (MB) | Caches internas de OpenObserve (ajustadas a 2 GB de RAM) |
| `OO_OTLP_ENDPOINT` | `http://127.0.0.1:5080/api/default` | Destino OTLP del Collector (usa la red del host) |
| `HOSTMETRICS_INTERVAL` | `30s` | Frecuencia de las métricas del host |
| `THERMAL_PROBE_INTERVAL` | `60` | Frecuencia de la sonda de temperatura (s) |

Si `OTEL_EXPORTER_OTLP_HEADERS` está vacío y existen `ZO_ROOT_USER_EMAIL`/`ZO_ROOT_USER_PASSWORD`,
el backend construye él mismo la cabecera `Authorization: Basic ...` (no hace falta calcular base64).

---

## CI/CD con GitHub Actions

Workflow: `.github/workflows/ci-cd.yml`. Se ejecuta en **push** y **pull_request** a `main`.

```
              ┌──────────────► notify-tests   (siempre) → OpenObserve: evento "test"
  test ───────┤
 (backend,    └──► deploy ───► notify-deploy  (siempre en push a main) → OpenObserve: evento "deploy"
  frontend,       (solo push a main
  E2E)             y si test = success)
```

| Job | Qué hace |
|-----|----------|
| `test` | Postgres 16 como *service* (`TEST_DATABASE_URL`) → Jest + Supertest → pruebas unitarias de Angular → `docker compose up --build --wait` dentro del runner → Playwright. Sube `playwright-report` (reporte HTML, capturas, videos y trazas de los fallos) como artifact. |
| `notify-tests` | `if: always()`. Envía a `http://<EC2>:5080/api/default/cicd_pipeline/_json` (auth básica): `type=test`, `result`, `commit`, `commit_message`, `branch`, `actor`, `run_id`, `run_url`, `timestamp` y el resultado de cada suite. |
| `deploy` | Solo en push a `main` y si `test` pasó; si no, queda *skipped* y **no se abre ninguna conexión SSH**. Por SSH (`appleboy/ssh-action`): `git pull`, fija el commit probado, `docker compose up -d --build`, espera a que `/api/health` responda `ok` **con ese commit** y limpia imágenes viejas. Después vuelve a verificar `/api/health` desde Internet. Despliegues serializados (`concurrency`). |
| `notify-deploy` | `if: always()` en push a `main`. Envía `type=deploy` con `success`, `failure` o `skipped` (no se desplegó porque fallaron las pruebas). |

Los datos sensibles vienen de *secrets*; el mensaje del commit se pasa por variable de entorno
(nunca interpolado en el script) para evitar inyección de comandos. Las notificaciones usan
`continue-on-error`: si OpenObserve no responde, el pipeline no falla (queda un aviso).

Validación de la sintaxis: `npm run lint:workflow` (actionlint + shellcheck).

### GitHub Secrets

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor |
|--------|-------|
| `EC2_HOST` | `3.145.142.235` (IP pública de la EC2; se usa para SSH, para `/api/health` y para OpenObserve en el puerto 5080) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contenido **completo** de la llave privada `.pem` con la que entras a la EC2, incluidas las líneas `-----BEGIN ... KEY-----` y `-----END ... KEY-----` |
| `OPENOBSERVE_USER` | El correo de `ZO_ROOT_USER_EMAIL` del `.env` del servidor |
| `OPENOBSERVE_PASSWORD` | La contraseña de `ZO_ROOT_USER_PASSWORD` del `.env` del servidor |

Requisitos en AWS: el Security Group debe permitir **22** (SSH) desde los runners de GitHub
(sus IPs cambian, así que en la práctica `0.0.0.0/0` con autenticación solo por llave), **8080** (app)
y **5080** (OpenObserve). El repositorio en la EC2 debe poder hacer `git pull` sin pedir credenciales
(repo público o *deploy key*).

> Opcional: en **Settings → Environments → production** puedes exigir aprobación manual antes de cada despliegue.

---

## Producción en EC2

En la EC2 todo corre con `docker compose` y `restart: unless-stopped` (vuelve solo tras un reinicio):

| Servicio | Memoria máx. | Función |
|----------|--------------|---------|
| `db` | 384 MB | PostgreSQL 16 (puerto solo en `127.0.0.1`) |
| `backend` | 384 MB | API; telemetría → `http://openobserve:5080` por la red interna de Docker |
| `frontend` | 64 MB | nginx en el puerto 8080 |
| `openobserve` | 768 MB | OpenObserve v1.2.0, volumen `openobserve_data`, caches limitadas, retención 15 días |
| `otel-collector` | 192 MB | Métricas del host → OpenObserve |
| `thermal-probe` | 32 MB | Sonda de temperatura |

Los logs de Docker rotan (3 × 10 MB por contenedor) para no llenar el disco.

### Comandos para el servidor (una sola vez)

Orden recomendado: 1) crea los secrets en GitHub, 2) haz push (el pipeline desplegará el código
nuevo aunque OpenObserve aún no esté arriba), 3) en la EC2:

```bash
ssh -i /ruta/a/tu-llave.pem ubuntu@3.145.142.235
cd /home/ubuntu/evaluacion-de-pruebas
git pull origin main

# Arma el .env de producción: respalda el actual, CONSERVA la contraseña de Postgres,
# JWT_SECRET y datos del admin, y agrega OpenObserve/OTel/Collector.
# Usa el mismo correo y contraseña que pusiste en los secrets OPENOBSERVE_USER / OPENOBSERVE_PASSWORD.
OO_EMAIL='tu-correo@ejemplo.com' OO_PASSWORD='la-misma-clave-del-secret' bash scripts/prepare-production-env.sh

# Revisa el resultado (no debe quedar ningún "CAMBIAR")
nano .env

# Levanta todo: app + OpenObserve + Collector + sonda (COMPOSE_PROFILES=observability en .env)
export APP_COMMIT="$(git rev-parse HEAD)"
docker compose up -d --build --remove-orphans

# Comprobaciones
docker compose ps
curl -s http://localhost:8080/api/health
curl -s http://localhost:5080/healthz
docker stats --no-stream
docker compose logs --tail 20 otel-collector thermal-probe
```

> - Si OpenObserve **ya estaba corriendo** en el servidor, su usuario admin ya existe: usa en
>   `OO_EMAIL`/`OO_PASSWORD` (y en los secrets) las credenciales con las que ya entras. Cambiar las
>   variables `ZO_ROOT_USER_*` no cambia una contraseña ya creada.
> - Evita el carácter `$` en las contraseñas del `.env` (docker compose lo interpreta); si lo usas, escríbelo `$$`.
> - A partir de aquí cada push a `main` que pase las pruebas se despliega solo.

Después importa los dashboards y crea las alertas: [docs/OPENOBSERVE.md](docs/OPENOBSERVE.md).

---

## Monitoreo del servidor (infraestructura)

El servicio `otel-collector` (`otel/opentelemetry-collector-contrib:0.166.0`, config en
`observability/otel-collector.yaml`) usa el receiver **host_metrics** leyendo el sistema del host
montado en solo lectura (`/proc`, `/sys` y `/` en `/hostfs`) y exporta por **OTLP HTTP** a OpenObserve:

| Scraper | Métricas en OpenObserve |
|---------|-------------------------|
| cpu | `system_cpu_utilization` (por estado: user, system, iowait, **steal**...), `system_cpu_time` |
| memory | `system_memory_utilization`, `system_memory_usage` |
| load | `system_cpu_load_average_1m/5m/15m` |
| network | `system_network_io` (bytes por dirección), paquetes, errores, conexiones |
| disk | `system_disk_io`, `system_disk_operations`, tiempos |
| filesystem | `system_filesystem_utilization`, `system_filesystem_usage` |
| paging | `system_paging_usage` (swap) |

Usa `network_mode: host`: desde la red de Docker solo vería la interfaz virtual del contenedor y no
el tráfico real de la EC2. Con `resource_detection` (detector `ec2`) añade región, tipo e id de instancia.

### Temperatura

**Qué se intentó:** el servicio `thermal-probe` (`observability/thermal-probe.sh`) lee cada 60 s las
dos fuentes estándar de Linux, `/sys/class/thermal/thermal_zone*/temp` y
`/sys/class/hwmon/hwmon*/temp*_input`. Si encuentra sensores, envía cada lectura en °C al stream
`host_temperature` de OpenObserve (verificado con un `/sys` simulado).

**Por qué en EC2 normalmente no hay datos:** una t3.small es una máquina virtual sobre el hipervisor
**AWS Nitro**. El kernel invitado ve CPUs y dispositivos *virtuales*: el hipervisor no le expone zonas
térmicas ACPI ni chips de sensores (hwmon), y drivers como `coretemp` no funcionan porque necesitan leer
registros MSR de la CPU física, que el hipervisor no virtualiza. AWS tampoco publica la temperatura del
hardware en CloudWatch: la salud física la gestiona AWS (status checks del sistema) y, si hay un
problema de hardware, migra o retira la instancia.

**Qué se hace en ese caso (alternativa usada):**

1. La sonda registra cada hora un evento `sensor_available=false` con el número de zonas térmicas y
   dispositivos hwmon encontrados (0) y el motivo. Así queda **evidencia en OpenObserve** de que se
   intentó medir y por qué no hay datos (tabla *Temperatura* del dashboard del servidor).
2. Como indicadores de "estrés térmico/carga" se usan las métricas que sí existen: **uso de CPU**,
   **load average** y sobre todo **CPU steal**: en instancias t3 (burstable) el límite real no es la
   temperatura sino los **créditos de CPU**; cuando se agotan, AWS limita la CPU y el `steal` sube.
3. Complemento opcional en CloudWatch: `CPUCreditBalance` y `StatusCheckFailed_System`.

Para comprobarlo a mano en la EC2:

```bash
ls /sys/class/thermal/ /sys/class/hwmon/ 2>&1
cat /sys/class/thermal/thermal_zone*/temp 2>&1
docker compose logs thermal-probe
```

---

## Despliegue manual (sin pipeline)

```bash
cd /home/ubuntu/evaluacion-de-pruebas && git pull origin main
export APP_COMMIT="$(git rev-parse HEAD)" && docker compose up -d --build
curl -s http://localhost:8080/api/health
```

Las pruebas E2E se pueden correr contra la EC2 con `E2E_BASE_URL=http://3.145.142.235:8080 npm run test:e2e --prefix e2e`.
