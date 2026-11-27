# OpenObserve: dashboards y alertas

Guía paso a paso para crear (o importar) los dashboards y las alertas del proyecto en
OpenObserve **v1.2.0**, que corre en la misma EC2.

- URL: `http://<IP-EC2>:5080` (p. ej. `http://3.145.142.235:5080`)
- Usuario / contraseña: `ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD` del `.env` del servidor
- Organización: `default`

> La interfaz puede aparecer en español o en inglés según tu navegador. Abajo se indica el
> nombre en español y, entre paréntesis, en inglés.

---

## 1. Qué datos llegan y de dónde

| Stream | Tipo | Origen | Campos útiles |
|--------|------|--------|---------------|
| `cicd_pipeline` | logs | GitHub Actions (jobs `notify-tests` y `notify-deploy`, API `/_json`) | `type` (test/deploy), `result`, `success`, `commit`, `commit_short`, `commit_message`, `branch`, `actor`, `run_id`, `run_url`, `timestamp`, `backend_tests`, `frontend_tests`, `e2e_tests`, `tests_result` |
| `default` | logs | Backend (pino → OTLP) | `method`, `route`, `path`, `statuscode`, `durationms`, `userid`, `severity`, `trace_id`, `body` |
| `default` | traces | Backend (OpenTelemetry: http, express, pg) | `operation_name`, `duration`, `span_status`, `service_name` |
| `app_http_requests`, `app_http_errors`, `app_http_request_duration_*` | metrics | Backend (métricas propias por endpoint) | `http_route`, `http_request_method`, `http_response_status_code` |
| `system_*` (cpu, memory, network, disk, filesystem, paging, load) | metrics | OTel Collector (`host_metrics`) | `state`, `direction`, `device`, `mountpoint`, `host_name` |
| `host_temperature` | logs | Sonda `thermal-probe` | `sensor_available`, `celsius`, `sensor`, `reason` |

Para comprobarlo: menú **Datos → Streams** (*Data → Streams*). Los streams aparecen cuando llega el
primer dato (el de `cicd_pipeline`, tras la primera ejecución del pipeline).

> Nota sobre nombres: OpenObserve convierte los puntos en guiones bajos y pasa los campos a
> minúsculas (`statusCode` → `statuscode`, `system.cpu.utilization` → `system_cpu_utilization`).

---

## 2. Opción rápida: importar los dashboards (JSON)

Los tres dashboards están en `observability/dashboards/`:

| Archivo | Dashboard |
|---------|-----------|
| `cicd-pipeline.dashboard.json` | CI/CD - Pipeline de GitHub Actions (11 paneles) |
| `app-backend.dashboard.json` | Aplicación - API backend (13 paneles) |
| `ec2-server.dashboard.json` | Servidor - EC2 (host metrics) (14 paneles) |

**Desde la interfaz:**

1. Menú lateral **Dashboards**.
2. Botón **Importar** (*Import*) arriba a la derecha.
3. Pestaña **Archivo** (*File*) → arrastra los 3 `.dashboard.json` (o pestaña **JSON** y pega el contenido).
4. Elige la carpeta `default` → **Importar**.

**Desde la terminal (alternativa):**

```bash
for f in observability/dashboards/*.dashboard.json; do
  curl -s -u "$OO_USER:$OO_PASSWORD" -H 'Content-Type: application/json' \
       -X POST "http://3.145.142.235:5080/api/default/dashboards" --data-binary "@$f"; echo
done
```

Los JSON se generan con `npm run dashboards` (fuente: `observability/dashboards/generate-dashboards.js`).
Para comprobar que todas las consultas funcionan contra tu servidor:

```bash
OO_URL=http://3.145.142.235:5080 OO_USER=<correo> OO_PASSWORD='<clave>' npm run dashboards:validate
```

(Se probaron así contra OpenObserve v1.2.0 con datos reales: 0 errores.)

---

## 3. Crear los dashboards a mano (paso a paso)

### 3.1 Cómo se crea cualquier panel

1. **Dashboards → Nuevo dashboard** (*New dashboard*). Escribe el nombre → **Guardar**.
2. Dentro del dashboard: **Agregar panel** (*Add Panel*).
3. Arriba a la izquierda elige el **tipo de gráfico** (Línea, Barras apiladas, Métrica, Gauge, Dona, Tabla...).
4. En el panel de consulta (abajo):
   - **SQL** o **PromQL** (*Query type*).
   - Tipo de stream (`logs` / `metrics`) y el stream.
   - Activa **Consulta personalizada** (*Custom query*) y pega la consulta.
5. Para gráficos de tiempo usa `histogram(_timestamp) AS x_axis_1` como eje X; las columnas
   `y_axis_N` son las series y `breakdown_1` separa por colores.
6. En **Config** (panel derecho) ajusta la **Unidad** (*Unit*): porcentaje, milisegundos, bytes...
7. Pon el título → **Aplicar** (*Apply*) → **Guardar** (*Save*). Repite para cada panel.
8. Arrastra/redimensiona los paneles y guarda el dashboard. Arriba eliges el rango
   (p. ej. "Últimos 7 días") y el auto-refresco.

### 3.2 Dashboard del pipeline — stream `cicd_pipeline` (logs, SQL)

| Panel (tipo) | Consulta |
|--------------|----------|
| Ejecuciones de pruebas (Métrica) | `SELECT COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test'` |
| Pruebas exitosas (Métrica) | `SELECT COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test' AND result = 'success'` |
| Pruebas fallidas (Métrica) | `SELECT COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test' AND result = 'failure'` |
| Tasa de éxito % (Métrica, unidad %) | `SELECT ROUND(100.0 * SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test'` |
| Despliegues exitosos (Métrica) | `SELECT COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'deploy' AND result = 'success'` |
| Ejecuciones en el tiempo (Barras apiladas) | `SELECT histogram(_timestamp) AS x_axis_1, result AS breakdown_1, COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1` |
| Despliegues en el tiempo (Barras apiladas) | igual que la anterior con `type = 'deploy'` |
| Éxitos vs fallos (Dona) | `SELECT result AS x_axis_1, COUNT(*) AS y_axis_1 FROM "cicd_pipeline" WHERE type = 'test' GROUP BY x_axis_1 ORDER BY y_axis_1 DESC` |
| Resultado de despliegues (Dona) | igual con `type = 'deploy'` (verás `success` y `skipped` = no se desplegó porque fallaron las pruebas) |
| Últimas ejecuciones (Tabla) | `SELECT timestamp, type, result, branch, commit_short, commit_message, actor, backend_tests, frontend_tests, e2e_tests, run_url FROM "cicd_pipeline" ORDER BY _timestamp DESC LIMIT 50` |

### 3.3 Dashboard de la aplicación — stream `default` (logs, SQL) + métricas (PromQL)

Todas las consultas de logs filtran las líneas de petición HTTP con
`WHERE statuscode IS NOT NULL AND route IS NOT NULL`.

| Panel (tipo, unidad) | Consulta |
|----------------------|----------|
| Peticiones por segundo (Línea) | `SELECT histogram(_timestamp, '1 minute') AS x_axis_1, COUNT(*) / 60.0 AS y_axis_1 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY x_axis_1 ORDER BY x_axis_1` |
| Latencia p50/p95/p99 (Línea, ms) | `SELECT histogram(_timestamp) AS x_axis_1, approx_percentile_cont(durationms, 0.5) AS y_axis_1, approx_percentile_cont(durationms, 0.95) AS y_axis_2, approx_percentile_cont(durationms, 0.99) AS y_axis_3 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY x_axis_1 ORDER BY x_axis_1` |
| Latencia p95 por endpoint (Línea, ms) | `SELECT histogram(_timestamp) AS x_axis_1, concat(method, ' ', route) AS breakdown_1, approx_percentile_cont(durationms, 0.95) AS y_axis_1 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1` |
| Peticiones por statusCode (Barras apiladas) | `SELECT histogram(_timestamp) AS x_axis_1, CAST(statuscode AS VARCHAR) AS breakdown_1, COUNT(*) AS y_axis_1 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1` |
| Tasa de error 5xx % (Métrica, %) | `SELECT ROUND(100.0 * SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / COUNT(*), 2) AS y_axis_1 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL` |
| Errores por endpoint (Tabla) | `SELECT method, route, COUNT(*) AS peticiones, SUM(CASE WHEN statuscode >= 400 AND statuscode < 500 THEN 1 ELSE 0 END) AS errores_4xx, SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) AS errores_5xx, ROUND(100.0 * SUM(CASE WHEN statuscode >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS pct_error, ROUND(approx_percentile_cont(durationms, 0.95), 1) AS p95_ms FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY method, route ORDER BY errores_5xx DESC, errores_4xx DESC` |
| Distribución de statusCode (Dona) | `SELECT CAST(statuscode AS VARCHAR) AS x_axis_1, COUNT(*) AS y_axis_1 FROM "default" WHERE statuscode IS NOT NULL AND route IS NOT NULL GROUP BY x_axis_1 ORDER BY y_axis_1 DESC` |
| Peticiones/s por endpoint (Línea, **PromQL**, stream `app_http_requests`) | `sum by (http_route) (rate(app_http_requests[2m]))` — leyenda `{http_route}` |
| Latencia p95 por endpoint (Línea, **PromQL**, ms) | `histogram_quantile(0.95, sum by (le, http_route) (rate(app_http_request_duration_bucket[5m])))` |

### 3.4 Dashboard del servidor — streams `system_*` (metrics)

| Panel (tipo, unidad) | Consulta |
|----------------------|----------|
| CPU actual (Gauge, %, PromQL) | `100 * (1 - avg(system_cpu_utilization{state="idle"}))` |
| RAM usada (Gauge, %, PromQL) | `100 * sum(system_memory_utilization{state="used"})` |
| Disco `/` usado (Gauge, %, PromQL) | `100 * max(system_filesystem_utilization{mountpoint="/"})` |
| CPU usada en el tiempo (Línea, %, SQL) | `SELECT histogram(_timestamp) AS x_axis_1, ROUND(100 * (1 - AVG(value)), 2) AS y_axis_1 FROM "system_cpu_utilization" WHERE state = 'idle' GROUP BY x_axis_1 ORDER BY x_axis_1` |
| CPU por estado (Área apilada, %, SQL) | `SELECT histogram(_timestamp) AS x_axis_1, state AS breakdown_1, ROUND(100 * AVG(value), 2) AS y_axis_1 FROM "system_cpu_utilization" WHERE state <> 'idle' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1` |
| RAM usada (Línea, %, SQL) | `SELECT histogram(_timestamp) AS x_axis_1, ROUND(100 * AVG(value), 2) AS y_axis_1 FROM "system_memory_utilization" WHERE state = 'used' GROUP BY x_axis_1 ORDER BY x_axis_1` |
| Ancho de banda (Línea, bytes/s, PromQL) | `sum by (direction) (rate(system_network_io[2m]))` — leyenda `{direction}` |
| Disco lectura/escritura (Línea, bytes/s, PromQL) | `sum by (direction) (rate(system_disk_io[2m]))` |
| Uso de filesystems (Línea, %, SQL) | `SELECT histogram(_timestamp) AS x_axis_1, mountpoint AS breakdown_1, ROUND(100 * MAX(value), 2) AS y_axis_1 FROM "system_filesystem_utilization" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1` |
| Swap usada (Línea, bytes, PromQL) | `sum(system_paging_usage{state="used"})` |
| Load average (Línea, PromQL, 3 consultas) | `avg(system_cpu_load_average_1m)`, `..._5m`, `..._15m` |
| Temperatura (Tabla, SQL, stream `host_temperature`) | `SELECT * FROM "host_temperature" ORDER BY _timestamp DESC LIMIT 20` |

> Por qué la CPU es `1 - idle`: el receiver entrega la fracción de tiempo de cada estado
> (`user`, `system`, `iowait`, `steal`...). En una t3 conviene mirar **`steal`**: si sube, la
> instancia agotó sus créditos de CPU y AWS la está limitando.

---

## 4. Alertas

Las alertas **programadas** (*Scheduled*) de OpenObserve ejecutan una consulta SQL cada cierto
tiempo sobre una ventana (periodo) y se disparan si el resultado cumple la condición. Las consultas
de abajo **solo devuelven filas cuando se supera el umbral**, así que la condición es simplemente
"número de eventos ≥ 1".

### 4.1 Destino de notificación (una sola vez)

El destino es opcional: sin destino la alerta igualmente se evalúa y queda en el historial
(**Alertas → historial**). Para recibir avisos:

1. **Alertas → Destinos de notificación** (*Alert Destinations*) → **Agregar destino**.
2. Nombre: `webhook-demo`. Tipo: **Webhook**.
3. URL: un webhook de **Discord** o **Slack**, o para pruebas una URL de <https://webhook.site>
   (te muestra en vivo cada aviso recibido). Método `POST`.
4. Plantilla (*Template*): **Plantillas de destinos → Agregar plantilla**, tipo Webhook, cuerpo:
   ```json
   {
     "content": "🚨 Alerta {alert_name} en {stream_name}: {rows}",
     "alerta": "{alert_name}",
     "stream": "{stream_name}",
     "disparada": "{alert_trigger_time_str}",
     "filas": "{rows}"
   }
   ```
   (`content` es el campo que muestra Discord; Slack usa `text`.) Asigna la plantilla al destino y guarda.

### 4.2 Pasos para crear cada alerta

1. **Alertas → Agregar alerta** (*Add alert*).
2. Nombre (lápiz junto a "Nombre de alerta"). **Tipo de alerta: Programado** (*Scheduled*).
3. **Tipo de stream** y **Nombre del stream** (ver cada alerta).
4. En **Condiciones** cambia de **Constructor** a **SQL** y pega la consulta.
5. **Verificar cada** (*Frequency*): 1 minuto.
6. **Agregación de alertas**: *Alerta simple*. **Alerta de número de eventos → Crítico si `>=` `1`**.
7. **Configuración**: **Período** 5 minutos (ventana analizada), **Silenciar notificación para** 10–15 minutos.
8. **Destino**: `webhook-demo` (opcional). Activa *Notificar al recuperarse* si quieres el aviso de resolución.
9. Revisa la **Vista previa** a la derecha → **Guardar**.

### Alerta 1 — Tasa de errores HTTP > 5 %

- Stream: **logs / `default`** · Periodo: **5 min** · Frecuencia: **1 min** · Condición: **≥ 1** fila

```sql
SELECT COUNT(*) AS total_peticiones,
       SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) AS errores_5xx,
       ROUND(100.0 * SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / COUNT(*), 2) AS tasa_error_pct
FROM "default"
WHERE statuscode IS NOT NULL
HAVING COUNT(*) >= 20
   AND 100.0 * SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / COUNT(*) > 5
```

- Cuenta como error los **5xx** (fallos del servidor). Los 4xx (login incorrecto, 404) son errores
  del cliente y en esta app son normales; si aun así quieres incluirlos, cambia `>= 500` por `>= 400`
  en las dos expresiones.
- `COUNT(*) >= 20` evita falsas alarmas con poco tráfico (1 error de 2 peticiones = 50 %).

**Cómo probarla:** detén la BD para provocar 500/503 y genera tráfico:

```bash
docker compose stop db
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:8080/api/health; done
# espera 1–2 minutos a que la alerta se evalúe, y luego:
docker compose start db
```

### Alerta 2 — CPU del servidor > 80 %

- Stream: **metrics / `system_cpu_utilization`** · Periodo: **5 min** · Frecuencia: **1 min** · Condición: **≥ 1** fila

```sql
SELECT host_name, ROUND(100 * (1 - AVG(value)), 2) AS cpu_pct
FROM "system_cpu_utilization"
WHERE state = 'idle'
GROUP BY host_name
HAVING 100 * (1 - AVG(value)) > 80
```

**Cómo probarla** (satura las 2 vCPU durante 6 minutos):

```bash
docker run --rm alpine sh -c 'for i in 1 2; do timeout 360 sh -c "while :; do :; done" & done; wait'
```

### Alerta 3 (extra) — RAM del servidor > 90 %

- Stream: **metrics / `system_memory_utilization`** · Periodo 5 min · Frecuencia 1 min · ≥ 1

```sql
SELECT host_name, ROUND(100 * AVG(value), 2) AS ram_pct
FROM "system_memory_utilization"
WHERE state = 'used'
GROUP BY host_name
HAVING 100 * AVG(value) > 90
```

### Alerta 4 (extra) — Pipeline con pruebas fallidas

- Stream: **logs / `cicd_pipeline`** · Periodo 10 min · Frecuencia 5 min · ≥ 1

```sql
SELECT branch, commit_short, actor, run_url, e2e_tests, backend_tests, frontend_tests
FROM "cicd_pipeline"
WHERE type = 'test' AND result = 'failure'
```

Útil en la demo: el commit con error (ver [DEMO.md](DEMO.md)) dispara esta alerta.

> Las consultas de las alertas están también en `observability/dashboards/alerts.js` y se validan
> con `npm run dashboards:validate`.

---

## 5. Consultas útiles en la pantalla de Logs

**Logs** → stream `cicd_pipeline` → modo SQL:

```sql
-- Historial del pipeline
SELECT timestamp, type, result, commit_short, commit_message, actor, run_url
FROM "cicd_pipeline" ORDER BY _timestamp DESC

-- ¿Qué commit está desplegado ahora?
SELECT commit, commit_message, timestamp FROM "cicd_pipeline"
WHERE type = 'deploy' AND result = 'success' ORDER BY _timestamp DESC LIMIT 1
```

Stream `default` (logs de la API):

```sql
-- Peticiones lentas (> 200 ms)
SELECT _timestamp, method, path, statuscode, durationms, trace_id
FROM "default" WHERE durationms > 200 ORDER BY durationms DESC
```

Con el `trace_id` de un log puedes abrir **Trazas** (*Traces*) y ver la traza completa de esa
petición (spans de Express y de cada consulta a PostgreSQL).
