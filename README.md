# Finanzas Andre

PWA personal de ingresos, gastos y préstamos (React + Vite · Express · PostgreSQL · Gemini Vision · n8n).
Instrucciones de proyecto y alcance: [CLAUDE.md](CLAUDE.md).

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
cd backend
cp ../.env.example .env        # completa DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET y pon COOKIE_SECURE=false
npm install
npm run migrate
SEED_EMAIL=tu@correo.com SEED_PASSWORD='una-clave-larga' npm run seed
npm run dev                    # API en :3000
```

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173 (proxy /api → :3000)
```

Tests de integración (usan una BD aparte, que se **vacía**):

```bash
cd backend
DATABASE_URL=postgres://usuario:clave@localhost:5432/finanzas_test npm test
```

## Despliegue en el VPS (Docker + Traefik)

1. Copia `.env.example` a `.env` en la raíz y completa `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` y `DOMINIO`. La API key de Gemini y el webhook de n8n se configuran después **desde la app** (Configuración → Integraciones). Ajusta `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT` y `TRAEFIK_CERTRESOLVER` a como está configurado tu Traefik.
2. Levanta todo:
   ```bash
   docker compose up -d --build
   ```
3. Crea tu usuario (una sola vez):
   ```bash
   docker compose exec -e SEED_EMAIL=tu@correo.com -e SEED_PASSWORD='una-clave-larga' backend node src/db/seed.js
   ```

Las migraciones corren solas al iniciar el backend. Postgres y el backend solo existen en la red interna; Traefik enruta el dominio al contenedor `frontend` (nginx), que sirve la PWA y hace proxy de `/api`.

## Gemini (lectura de tickets)

Crea una API key gratis en [Google AI Studio](https://aistudio.google.com/apikey) y pégala en Configuración → Integraciones → «Probar conexión» → «Guardar». El plan gratuito tiene límites diarios/por minuto (de sobra para uso personal) y Google puede usar los datos enviados para mejorar sus productos; si eso importa, activa facturación en el proyecto. El modelo por defecto `gemini-flash-latest` apunta siempre al Flash vigente.

## Webhook a n8n

Cada alta/edición de movimiento o préstamo y cada abono hace `POST` a `N8N_WEBHOOK_URL` con:

```json
{ "evento": "movimiento.creado", "movimiento": { "...": "fila de movimientos" }, "enviado_en": "ISO-8601" }
```

Eventos: `movimiento.creado`, `movimiento.actualizado`, `prestamo.creado`, `prestamo.actualizado`, `prestamo.abono`. El resultado queda en `automatizaciones_log` y se ve en Configuración.
