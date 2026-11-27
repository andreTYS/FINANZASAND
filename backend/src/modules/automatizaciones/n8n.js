import { query } from '../../db/pool.js';
import { obtenerAjustes } from '../ajustes/ajustes.routes.js';

/**
 * Dispara un evento hacia n8n DESPUÉS de que la transacción se confirmó.
 * Nunca bloquea ni hace fallar la petición del usuario; todo queda en automatizaciones_log.
 */
export function dispararEvento(evento, movimiento, extra = {}) {
  const payload = { evento, movimiento, ...extra, enviado_en: new Date().toISOString() };
  (async () => {
    let estado = 'omitido_sin_webhook';
    const { n8nWebhookUrl } = await obtenerAjustes(movimiento.usuario_id).catch(() => ({}));
    if (n8nWebhookUrl) {
      try {
        const r = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        estado = r.ok ? 'enviado' : `error_http_${r.status}`;
      } catch (e) {
        estado = `error_${e.name === 'TimeoutError' ? 'timeout' : 'red'}`;
      }
    }
    try {
      await query(
        'INSERT INTO automatizaciones_log (movimiento_id, workflow_n8n, estado, payload_json) VALUES ($1,$2,$3,$4)',
        [movimiento.id, evento, estado, payload],
      );
    } catch (e) {
      // El movimiento pudo borrarse entre medio; no es crítico
      if (e.code !== '23503') console.error('No se pudo registrar automatización', e.message);
    }
  })();
}
