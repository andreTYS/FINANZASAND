import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { cifrar, descifrar } from '../../lib/cifrado.js';
import { HttpError } from '../../middleware/errores.js';

const router = Router();
export const MONEDAS = ['PEN', 'USD', 'EUR', 'MXN', 'COP', 'CLP', 'ARS', 'BOB'];

/**
 * Ajustes efectivos del usuario: lo guardado en la app tiene prioridad; si no, se usa la variable de entorno.
 * Uso interno del backend (incluye la API key en claro).
 */
export async function obtenerAjustes(usuarioId) {
  const { rows } = await query('SELECT * FROM ajustes WHERE usuario_id = $1', [usuarioId]);
  const a = rows[0] || {};
  const keyApp = descifrar(a.gemini_api_key_cifrada);
  return {
    geminiApiKey: keyApp || config.geminiApiKey || '',
    geminiApiKeyOrigen: keyApp ? 'app' : config.geminiApiKey ? 'env' : null,
    geminiModel: a.gemini_model || config.geminiModel,
    n8nWebhookUrl: a.n8n_webhook_url ?? config.n8nWebhookUrl ?? '',
    moneda: a.moneda || 'PEN',
  };
}

const enmascarar = (k) => (k ? `••••••••${k.slice(-4)}` : null);

async function vistaPublica(uid) {
  const a = await obtenerAjustes(uid);
  return {
    gemini: { configurada: !!a.geminiApiKey, origen: a.geminiApiKeyOrigen, key_mascara: enmascarar(a.geminiApiKey), modelo: a.geminiModel },
    n8n: { webhook_url: a.n8nWebhookUrl || '' },
    moneda: a.moneda,
  };
}

router.get('/', async (req, res) => res.json(await vistaPublica(req.user.id)));

router.put('/', async (req, res) => {
  const d = z.object({
    gemini_api_key: z.string().trim().max(200).nullable().optional(), // '' o null = borrar la guardada en la app
    gemini_model: z.string().trim().regex(/^[\w.-]{3,80}$/, 'Modelo inválido').optional(),
    n8n_webhook_url: z.union([z.literal(''), z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), 'Debe ser http(s)')]).optional(),
    moneda: z.enum(MONEDAS).optional(),
  }).parse(req.body);

  const campos = {};
  if (d.gemini_api_key !== undefined) campos.gemini_api_key_cifrada = d.gemini_api_key ? cifrar(d.gemini_api_key) : null;
  if (d.gemini_model !== undefined) campos.gemini_model = d.gemini_model;
  if (d.n8n_webhook_url !== undefined) campos.n8n_webhook_url = d.n8n_webhook_url;
  if (d.moneda !== undefined) campos.moneda = d.moneda;
  const cols = Object.keys(campos);
  if (cols.length) {
    await query(
      `INSERT INTO ajustes (usuario_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (usuario_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
      [req.user.id, ...cols.map((c) => campos[c])],
    );
  }
  res.json(await vistaPublica(req.user.id));
});

/** Verifica la API key de Gemini y devuelve los modelos que soportan generateContent. */
router.post('/probar-gemini', async (req, res) => {
  const { gemini_api_key } = z.object({ gemini_api_key: z.string().trim().max(200).optional() }).parse(req.body || {});
  const key = gemini_api_key || (await obtenerAjustes(req.user.id)).geminiApiKey;
  if (!key) throw new HttpError(400, 'No hay API key de Gemini configurada');
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15_000),
  }).catch((e) => { throw new HttpError(502, `No se pudo contactar a Gemini: ${e.message}`); });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(400, r.status === 400 || r.status === 403 ? 'API key inválida o sin permisos' : `Gemini respondió ${r.status}`, data?.error?.message);
  const modelos = (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/i.test(m.name) && !/embedding|tts|audio|live|image-generation/i.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), nombre: m.displayName || m.name }));
  res.json({ ok: true, modelos });
});

/** Envía un evento de prueba al webhook de n8n (no se registra en automatizaciones_log). */
router.post('/probar-n8n', async (req, res) => {
  const { n8n_webhook_url } = z.object({ n8n_webhook_url: z.string().trim().url().optional() }).parse(req.body || {});
  const url = n8n_webhook_url || (await obtenerAjustes(req.user.id)).n8nWebhookUrl;
  if (!url) throw new HttpError(400, 'No hay webhook de n8n configurado');
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'La URL debe ser http(s)');
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ evento: 'prueba', mensaje: 'Evento de prueba desde Finanzas', enviado_en: new Date().toISOString() }),
  }).catch((e) => { throw new HttpError(502, `No se pudo contactar el webhook: ${e.name === 'TimeoutError' ? 'tiempo agotado' : e.message}`); });
  if (!r.ok) throw new HttpError(502, `El webhook respondió ${r.status}`);
  res.json({ ok: true, status: r.status });
});

export default router;
