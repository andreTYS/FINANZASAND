import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errores.js';

const router = Router();

const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(MIMES[file.mimetype] ? null : new HttpError(400, 'Formato de imagen no soportado'), !!MIMES[file.mimetype]),
});

const dirTemporal = (uid) => path.join(config.uploadsDir, 'tmp', uid);
const TTL_MS = 2 * 3600 * 1000;

/** Recupera un scan pendiente de confirmar (imagen + respuesta OCR) del propio usuario. */
export async function leerScanTemporal(uid, token) {
  const rutaMeta = path.join(dirTemporal(uid), `${token}.json`);
  try {
    const meta = JSON.parse(await fs.readFile(rutaMeta, 'utf8'));
    if (Date.now() - meta.creado > TTL_MS) return null;
    return { ...meta, rutaMeta, rutaImagen: path.join(dirTemporal(uid), `${token}${meta.extension}`) };
  } catch {
    return null;
  }
}

export async function limpiarScanTemporal(scan) {
  await Promise.all([fs.unlink(scan.rutaMeta), fs.unlink(scan.rutaImagen)].map((p) => p.catch(() => {})));
}

const PROMPT = `Eres un extractor de datos de tickets/boletas/facturas de compra (posiblemente en español).
Analiza la imagen y devuelve SOLO un JSON con esta forma:
{"monto": number|null, "fecha": "YYYY-MM-DD"|null, "hora": "HH:MM"|null, "comercio": string|null,
 "descripcion": string|null, "moneda": string|null, "categoria_sugerida": string|null, "confianza": number}
- "monto" es el TOTAL final pagado (no subtotal), con punto decimal.
- "descripcion" es un resumen corto de lo comprado (máx 80 caracteres).
- "categoria_sugerida" debe ser una de: CATEGORIAS, o null.
- "confianza" entre 0 y 1. Si la imagen no es un comprobante, devuelve todo null y confianza 0.`;

async function extraerConGemini(buffer, mime, categorias) {
  if (!config.geminiApiKey) throw new HttpError(503, 'OCR no configurado (falta GEMINI_API_KEY)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT.replace('CATEGORIAS', categorias.join(', ')) },
          { inline_data: { mime_type: mime, data: buffer.toString('base64') } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  }).catch((e) => { throw new HttpError(502, `No se pudo contactar a Gemini: ${e.message}`); });
  const raw = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `Gemini respondió ${r.status}`, raw?.error?.message);
  const texto = raw?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}';
  let datos;
  try { datos = JSON.parse(texto.replace(/^```(json)?|```$/g, '').trim()); } catch { datos = {}; }
  return { datos, raw };
}

export function normalizarOcr(d, categorias) {
  const monto = typeof d.monto === 'number' ? d.monto : Number(String(d.monto ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? d.fecha : null;
  const hora = /^\d{2}:\d{2}/.test(d.hora || '') ? d.hora.slice(0, 5) : '12:00';
  const cat = categorias.find((c) => c.nombre.toLowerCase() === String(d.categoria_sugerida || '').toLowerCase());
  return {
    tipo: 'gasto',
    monto: Number.isFinite(monto) && monto >= 0 ? Math.round(monto * 100) / 100 : null,
    fecha_hora: fecha ? `${fecha}T${hora}` : null,
    origen_destino: d.comercio || null,
    descripcion: d.descripcion || (d.comercio ? `Compra en ${d.comercio}` : null),
    categoria_id: cat?.id ?? null,
    moneda: d.moneda || null,
    confianza: typeof d.confianza === 'number' ? d.confianza : null,
  };
}

/**
 * POST /api/ocr/scan  (multipart, campo "imagen")
 * Devuelve datos para PRECARGAR el formulario. No crea ningún movimiento.
 */
router.post('/scan', upload.single('imagen'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Adjunta una imagen en el campo "imagen"');
  const uid = req.user.id;
  const { rows: cats } = await query(
    `SELECT id, nombre FROM categorias WHERE tipo = 'gasto' AND (usuario_id IS NULL OR usuario_id = $1)`, [uid],
  );
  const { datos, raw } = await extraerConGemini(req.file.buffer, req.file.mimetype, cats.map((c) => c.nombre));

  const token = crypto.randomUUID();
  const extension = MIMES[req.file.mimetype];
  const dir = dirTemporal(uid);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${token}${extension}`), req.file.buffer);
  await fs.writeFile(path.join(dir, `${token}.json`), JSON.stringify({
    creado: Date.now(), mime: req.file.mimetype, extension, ocr: { extraido: datos, modelo: config.geminiModel, usage: raw?.usageMetadata ?? null },
  }));

  res.json({ scan_token: token, prellenado: normalizarOcr(datos, cats), extraido: datos });
});

export default router;
