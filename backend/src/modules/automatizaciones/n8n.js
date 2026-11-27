import { query } from '../../db/pool.js';
import { obtenerAjustes } from '../ajustes/ajustes.routes.js';

/** POST al webhook de n8n del usuario. Devuelve el estado para el log; nunca lanza. */
export async function enviarAN8n(usuarioId, payload) {
  const { n8nWebhookUrl } = await obtenerAjustes(usuarioId).catch(() => ({}));
  if (!n8nWebhookUrl) return 'omitido_sin_webhook';
  try {
    const r = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? 'enviado' : `error_http_${r.status}`;
  } catch (e) {
    return `error_${e.name === 'TimeoutError' ? 'timeout' : 'red'}`;
  }
}

export async function registrarAutomatizacion({ usuarioId, movimientoId = null, workflow, estado, payload }) {
  try {
    await query(
      'INSERT INTO automatizaciones_log (usuario_id, movimiento_id, workflow_n8n, estado, payload_json) VALUES ($1,$2,$3,$4,$5)',
      [usuarioId, movimientoId, workflow, estado, payload],
    );
  } catch (e) {
    // El movimiento pudo borrarse entre medio; no es crítico
    if (e.code !== '23503') console.error('No se pudo registrar automatización', e.message);
  }
}

/**
 * Dispara un evento hacia n8n DESPUÉS de que la transacción se confirmó.
 * Nunca bloquea ni hace fallar la petición del usuario; todo queda en automatizaciones_log.
 */
export function dispararEvento(evento, movimiento, extra = {}) {
  const payload = { evento, movimiento, ...extra, enviado_en: new Date().toISOString() };
  (async () => {
    const estado = await enviarAN8n(movimiento.usuario_id, payload);
    await registrarAutomatizacion({ usuarioId: movimiento.usuario_id, movimientoId: movimiento.id, workflow: evento, estado, payload });
  })();
}
