# Guía de la demostración (CI/CD + observabilidad)

Objetivo: mostrar en vivo que

1. un commit con un error **rompe las pruebas E2E**, queda **registrado en OpenObserve** y **no se despliega**;
2. un commit válido **pasa todo**, **se despliega** en la EC2 y también queda registrado.

Duración aproximada: 20–25 minutos (cada ejecución del pipeline tarda ~6–10 min).

---

## 0. Preparación (antes de la clase)

- [ ] Secrets de GitHub configurados (ver README → *GitHub Secrets*).
- [ ] En la EC2 están arriba la app, OpenObserve, el Collector y la sonda (`docker compose ps`).
- [ ] Dashboards importados y alertas creadas ([OPENOBSERVE.md](OPENOBSERVE.md)), incluida la
      alerta 4 "Pipeline con pruebas fallidas".
- [ ] Pestañas abiertas:
  1. GitHub → **Actions** del repositorio
  2. La app: `http://3.145.142.235:8080`
  3. Health: `http://3.145.142.235:8080/api/health` (muestra el **commit desplegado** en `api.commit`)
  4. OpenObserve → dashboard **CI/CD - Pipeline de GitHub Actions** (rango "Últimos 7 días", auto-refresco 30 s)
  5. OpenObserve → dashboard **Servidor - EC2**
- [ ] Repo local actualizado: `git checkout main && git pull`.

Anota el commit desplegado antes de empezar:

```bash
curl -s http://3.145.142.235:8080/api/health | jq -r .api.commit
```

---

## 1. Escenario A — commit con error (falla Playwright, NO se despliega)

### El error

En `frontend/nginx.conf` (bloque `location /`, al final del archivo) cambia **una línea**:

```diff
     location / {
         add_header Cache-Control "no-cache";
-        try_files $uri $uri/ /index.html;
+        try_files $uri $uri/ =404;
     }
```

**Qué rompe:** nginx deja de devolver `index.html` para las rutas de Angular. La portada `/` sigue
cargando, pero entrar directamente o **recargar** `/login`, `/register` o `/users` devuelve
**404**. Es un bug realista de configuración de despliegue.

**Por qué es buen ejemplo:** las pruebas unitarias **no** lo detectan (no usan nginx); solo una prueba
E2E que use la app real como un usuario lo descubre. Se verificó en local:

| Suite | Resultado con el error |
|-------|------------------------|
| Backend (Jest) | ✅ 43/43 |
| Frontend unitarias | ✅ 26/26 |
| E2E (Playwright) | ❌ **9 fallan**, 1 pasa (solo `/api/health`, que no pasa por el router de Angular) |

### Pasos

```bash
git checkout main && git pull
# editar frontend/nginx.conf como arriba
git add frontend/nginx.conf
git commit -m "chore(nginx): simplificar configuración de rutas"
git push origin main
```

### Qué mostrar

1. **GitHub Actions**: el run del commit.
   - `Pruebas (backend, frontend, E2E)`: pasan los pasos de backend y frontend y **falla
     "E2E · pruebas Playwright"**. Abre el log: errores `expect(page).toHaveURL(...)` y la página 404.
   - `Desplegar en EC2`: aparece como **skipped** (gris). Ábrelo: no hay ningún paso ejecutado,
     es decir, **nunca se abrió la conexión SSH**.
   - `Notificar pruebas a OpenObserve` y `Notificar despliegue a OpenObserve`: verdes (siempre corren).
   - Abajo, en **Artifacts**, descarga **`playwright-report`**: abre `playwright-report/index.html`,
     entra a un test fallido y muestra la **captura de pantalla** con el 404 y el video.
2. **La app sigue intacta**: `http://3.145.142.235:8080/api/health` → `api.commit` sigue siendo el
   commit anterior. Recarga `http://3.145.142.235:8080/login`: funciona (no llegó el error).
3. **OpenObserve**:
   - Dashboard CI/CD: sube **Pruebas fallidas**, aparece una barra `failure`, en *Fallos por suite*
     sube `e2e (Playwright)` y en *Resultado de despliegues* aparece `skipped`.
   - Tabla *Últimas ejecuciones*: fila `test / failure` con `e2e_tests = failure` y el enlace
     `run_url` al run de GitHub; fila `deploy / skipped` con `tests_result = failure`.
   - **Logs** → stream `cicd_pipeline`:
     ```sql
     SELECT timestamp, type, result, commit_short, commit_message, e2e_tests, tests_result, run_url
     FROM "cicd_pipeline" ORDER BY _timestamp DESC LIMIT 4
     ```
   - **Alertas**: la alerta "Pipeline con pruebas fallidas" se dispara (historial / webhook).

---

## 2. Escenario B — commit válido (pasa todo y SE despliega)

### El cambio

1. Revierte el error en `frontend/nginx.conf` (vuelve a `try_files $uri $uri/ /index.html;`), o:
   ```bash
   git revert --no-edit HEAD
   ```
2. Añade una mejora visible: el número de usuarios en el título. En
   `frontend/src/app/pages/users/users.html`, línea 3:
   ```diff
   -    <h1>Usuarios</h1>
   +    <h1>Usuarios ({{ users().length }})</h1>
   ```

### Pasos

```bash
git add frontend/nginx.conf frontend/src/app/pages/users/users.html
git commit -m "feat(usuarios): mostrar el total de usuarios en el título"
git push origin main
```

(Si usaste `git revert`, haz el cambio del título en un segundo commit y empuja ambos juntos.)

### Qué mostrar

1. **GitHub Actions**: los 4 jobs en verde.
   - `Desplegar en EC2` → paso *Desplegar por SSH*: `git pull`, `docker compose up -d --build`,
     y `>> OK: {"status":"ok",... "commit":"<sha>"}`.
   - Paso *Verificar /api/health desde Internet*: `Despliegue verificado: status=ok commit=<sha>`.
     El pipeline comprueba que el commit que corre en la EC2 es **exactamente** el que pasó las pruebas.
2. **La app**: `http://3.145.142.235:8080/users` muestra **"Usuarios (N)"**; `/api/health` devuelve
   el commit nuevo.
3. **OpenObserve**:
   - Dashboard CI/CD: sube **Pruebas exitosas** y **Despliegues exitosos**; la tasa de éxito cambia.
   - Tabla: filas `test / success` y `deploy / success` con el mensaje del commit.
   - Dashboard **Servidor - EC2**: durante el despliegue se ve el pico de **CPU** y **RAM/swap**
     (compilación de Angular y de las imágenes Docker) y de **red** (descarga de dependencias).
   - Dashboard **Aplicación**: navega por la app y muestra cómo se mueven peticiones/s, latencia y statusCode.

---

## 3. Cierre: preguntas típicas

- **¿Por qué no se desplegó el commit malo?** El job `deploy` tiene `needs: test` y
  `if: ... && needs.test.result == 'success'`. Si las pruebas fallan, GitHub lo marca *skipped* y
  ni siquiera arranca el runner: no hay conexión SSH.
- **¿Y si alguien hace push mientras se despliega?** Los despliegues están serializados
  (`concurrency: deploy-production`) y cada uno despliega exactamente su commit (`git reset --hard <sha>`).
- **¿Cómo sé qué versión está en producción?** `GET /api/health` → `api.commit`, o la consulta
  "¿Qué commit está desplegado ahora?" de OPENOBSERVE.md.
- **¿Y si OpenObserve se cae?** Los pasos de notificación tienen `continue-on-error`: el pipeline sigue
  funcionando y queda un aviso; la app tampoco se ve afectada (la telemetría es asíncrona).
