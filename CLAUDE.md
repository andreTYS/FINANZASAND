# CLAUDE.md — Sistema de Finanzas Personales (Ingresos/Gastos/Préstamos)

Este archivo son las instrucciones de proyecto para Claude Code. Léelo completo antes de escribir código. Basado en el PRD acordado con Andre.

> **Cambio de alcance (pedido por Andre):** el sistema es **solo para Andre**. Hay **un único usuario** (Andre), creado por seed. Esthefany no tiene cuenta. El modelo conserva `usuario_id` en todas las tablas y el filtrado por usuario del JWT, así que agregar otra cuenta en el futuro sería solo correr el seed de nuevo.

## 1. Qué estamos construyendo
Una PWA de finanzas personales para **un usuario (Andre)**. Permite registrar ingresos, gastos y préstamos (dados y recibidos), ver un dashboard de KPIs, exportar/importar en CSV/XLS/PDF, capturar movimientos por teclado o por foto de ticket (OCR), y automatizar tareas con n8n.

No construyas nada fuera de esto sin que se indique explícitamente (ver "Fuera de alcance").

## 2. Stack obligatorio (no lo cambies sin confirmar)
* Frontend: React + Vite. PWA real: `manifest.webmanifest` + service worker con Workbox (`vite-plugin-pwa`).
* Estado/UI: TanStack Query para datos del servidor; Zustand para sesión/UI.
* Gráficos: Recharts.
* Backend: Node.js + Express.
* Base de datos: PostgreSQL.
* Auth: JWT (access + refresh token) + bcrypt (`bcryptjs`, implementación JS de bcrypt, sin compilación nativa).
* OCR de tickets: Gemini Vision (API REST).
* Export: `exceljs` (XLSX), `papaparse` (CSV), `pdfkit` (PDF).
* Automatización: n8n self-hosted — el backend dispara eventos hacia n8n, no al revés.
* Infraestructura: Docker + Traefik en el VPS de Hostinger. Postgres y backend solo en la red interna; Traefik enruta al frontend (nginx), que hace proxy de `/api` al backend.

No propongas Next.js, Supabase, Firebase ni otro BaaS externo.

## 3. Estructura de carpetas
```
/backend
  /src
    /modules  (auth, movimientos, prestamos, categorias, dashboard, import-export, ocr, automatizaciones)
    /db       (pool, migrate.js, seed.js, /migrations/*.sql)
    /middleware (auth JWT, errores, uuid)
    app.js, server.js, config.js
  /test       (integración contra Postgres real)
  Dockerfile
/frontend
  /src
    /pages (Login, Dashboard, Registro, Prestamos, Scan, Metricas, Configuracion)
    /components
    /hooks (TanStack Query por módulo)
    /store (Zustand)
    /styles (tokens.css = design system, global.css)
  public/manifest.webmanifest
  Dockerfile, nginx.conf
docker-compose.yml
```

## 4. Modelo de datos (PostgreSQL)
Regla de oro: todo movimiento pertenece a un usuario (`usuario_id`). Nunca una query de movimientos sin filtrar por el usuario autenticado (JWT → `req.user.id`). El esquema vive en `backend/src/db/migrations/001_esquema_inicial.sql` y sigue el PRD, con estos ajustes:
* `categorias.usuario_id` (NULL = categoría global predeterminada; con valor = categoría propia).
* `refresh_tokens` para rotación/revocación del refresh token.
* `usuarios.nombre`, `movimientos.updated_at`, `prestamos.created_at`.
* `ON DELETE CASCADE` desde movimientos hacia prestamos/abonos/adjuntos/log.

Nuevas migraciones: agregar `00N_descripcion.sql`; se aplican al arrancar el backend (o `npm run migrate`).

## 5. Flujo de captura y automatización (implementado tal cual)
1. Captura por teclado (Registro) o foto (Scan).
2. Foto: `POST /api/ocr/scan` → Gemini → devuelve `prellenado` + `scan_token`. **No guarda movimiento.** La imagen y la respuesta OCR quedan en temporal (2 h).
3. El usuario confirma/corrige en el formulario.
4. `POST /api/movimientos` (con `scan_token` si viene de scan) inserta en una transacción (movimiento + adjunto con `ocr_raw_json`) y, tras el commit, dispara el webhook a n8n.
5. n8n nunca escribe en la BD; si necesita escribir, usa los endpoints del backend.
6. Cada disparo queda en `automatizaciones_log` (`enviado`, `error_*`, u `omitido_sin_webhook`).

## 6. Orden de construcción
Fase 1 — MVP (completada). Fase 2 — offline, alertas y categorización (completada, ver checklist 10b). Fase 3 (Google Sheets, resúmenes, integraciones) **no se empieza** sin pedido explícito.

### Fase 2 — cómo está hecho
* **Offline real**: las altas por teclado (movimientos, préstamos, abonos) llevan un `id` UUID generado en el cliente. Sin red se guardan en una cola local (`frontend/src/store/cola.js`, persistida) y `lib/sync.js` las envía en orden al volver la conexión, cada 30 s y al abrir la app. El backend es **idempotente** por ese id (reintento = 200 con el registro existente; id de otro usuario = 409). Las lecturas se persisten con `PersistQueryClientProvider` (7 días) y, sin red al abrir, se entra con el usuario guardado (`iniciarOffline`). Editar, borrar, escanear e importar requieren conexión. Al cerrar sesión se borran la cola y la caché local.
* **Categorización automática** (`backend/src/modules/categorizacion/categorizador.js`): 1) historial del usuario (misma contraparte o descripción, solo categorías elegidas a mano), 2) palabras clave. Si confianza ≥ 0,65 y el usuario no eligió categoría, se asigna al crear/importar con `movimientos.categoria_auto = true`. El formulario muestra la sugerencia en vivo (`GET /api/categorias/sugerir`). Si el usuario cambia la categoría, deja de ser "auto".
* **Alertas** (`backend/src/modules/alertas/`): gasto grande (umbral), presupuesto por categoría al 80 % y 100 % (tabla `presupuestos`), préstamos por vencer (N días) y vencidos. Tabla `alertas` con `clave` única → nunca se repiten. Se evalúan al crear movimientos/préstamos, al abrir la campana y cada hora (programador en el proceso; `ALERTAS_PROGRAMADOR=false` lo apaga). Cada alerta nueva se envía al webhook de n8n (`evento: alerta.<tipo>`) y queda en `automatizaciones_log`.
* **n8n escribe de vuelta** solo vía API: `/api/n8n/*` con token de integración (Configuración → Integraciones; se guarda su hash). Hoy: `GET /api/n8n/categorias` y `PATCH /api/n8n/movimientos/:id/categoria` (no pisa categorías elegidas por el usuario).

## 7. UX/UI
* Paleta: morado y azul primarios, blanco de fondo, verde = positivo, amarillo = pendiente. Tokens en `frontend/src/styles/tokens.css`.
* Pantallas: Login, Panel, Registro, Préstamos, Scan, Métricas, Configuración.
* Navegación: hamburguesa en móvil (<900px), sidebar fija en desktop. Transiciones fade/slide entre pantallas.

## 8. Cosas que NO debe hacer
* No guardar un movimiento desde OCR sin confirmación explícita del usuario.
* No permitir ver/editar movimientos de otro usuario (filtrar siempre por `usuario_id` del JWT).
* No introducir Next.js, Supabase, Firebase ni otro framework/BaaS.
* No construir registro público de usuarios ni roles/permisos — **una sola cuenta (Andre)**.
* No implementar conciliación bancaria automática (open banking).
* No avanzar a Fase 2/3 sin pedido explícito.

## 9. Variables de entorno y ajustes desde la app
```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
GEMINI_API_KEY=
N8N_WEBHOOK_URL=
```
**API key de Gemini, modelo, webhook de n8n y moneda se configuran desde la app** (Configuración → Integraciones), tabla `ajustes` (migración 002). Lo guardado en la app tiene prioridad sobre `GEMINI_API_KEY`/`GEMINI_MODEL`/`N8N_WEBHOOK_URL`, que quedan como valores por defecto opcionales. La API key se guarda cifrada (AES-256-GCM, clave derivada de `SETTINGS_SECRET` o `JWT_SECRET`) y nunca se devuelve al cliente (solo enmascarada). `DATABASE_URL` y los secretos JWT siguen siendo obligatoriamente de entorno.

Opcionales: `ALERTAS_PROGRAMADOR` (false = sin revisión horaria), `SETTINGS_SECRET`, `GEMINI_MODEL` (default `gemini-flash-latest`), `TZ` (zona horaria para "mes actual"; default del contenedor America/Lima), `UPLOADS_DIR`, `COOKIE_SECURE` (false solo en dev http), `CORS_ORIGIN`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DIAS`. Ver `.env.example`.

## 10. Checklist de Fase 1
* [x] Seed del usuario (Andre) — `npm run seed` con `SEED_EMAIL`/`SEED_PASSWORD`
* [x] Login + JWT + refresh (cookie httpOnly, rotación, revocación)
* [x] CRUD movimientos (ingreso/gasto)
* [x] CRUD préstamos (out/in) + abonos
* [x] Dashboard con KPIs
* [x] Export CSV/XLS/PDF
* [x] Import CSV/XLS con detección de duplicados
* [x] Scan de ticket (Gemini Vision) + confirmación
* [x] Categorías y filtros
* [x] PWA instalable (manifest + service worker)

## 10b. Checklist de Fase 2
* [x] Modo offline real (cola local + sync idempotente + caché persistida + sesión offline)
* [x] Alertas por n8n (gasto grande, presupuestos 80/100 %, préstamos por vencer/vencidos) + campana en la app
* [x] Categorización automática (historial + palabras clave) + escritura de vuelta de n8n con token

## Comandos
* Backend dev: `cd backend && npm run dev` (necesita `backend/.env`)
* Tests: `cd backend && DATABASE_URL=postgres://.../finanzas_test npm test` (**vacía esa BD**)
* Frontend dev: `cd frontend && npm run dev` (proxy de `/api` a :3000)
