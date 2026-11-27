import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { HttpError, noEncontrado } from '../../middleware/errores.js';
import { registrarAutomatizacion } from '../automatizaciones/n8n.js';

/**
 * API para que n8n escriba DE VUELTA pasando por el backend (nunca directo a la BD).
 * Autenticación: token de integración generado en Configuración (se guarda solo su hash).
 *   Authorization: Bearer fin_xxx   ó   X-Api-Key: fin_xxx
 */
const router = Router();
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const nuevoToken = () => `fin_${crypto.randomBytes(24).toString('base64url')}`;

router.use(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = (h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key']) || '';
  if (!/^fin_[\w-]{20,}$/.test(token)) return next(new HttpError(401, 'Token de integración inválido'));
  const { rows } = await query('SELECT usuario_id FROM ajustes WHERE n8n_token_hash = $1', [hashToken(token)]);
  if (!rows[0]) return next(new HttpError(401, 'Token de integración inválido'));
  req.user = { id: rows[0].usuario_id };
  next();
});

router.get('/categorias', async (req, res) => {
  const { rows } = await query(
    'SELECT id, nombre, tipo FROM categorias WHERE usuario_id IS NULL OR usuario_id = $1 ORDER BY tipo, nombre', [req.user.id],
  );
  res.json(rows);
});

/** PATCH /api/n8n/movimientos/:id/categoria { categoria_id } | { categoria_nombre } */
router.patch('/movimientos/:id/categoria', async (req, res) => {
  const d = z.object({ categoria_id: z.string().uuid().optional(), categoria_nombre: z.string().trim().min(1).max(60).optional() })
    .refine((x) => x.categoria_id || x.categoria_nombre, 'Envía categoria_id o categoria_nombre').parse(req.body);
  const uid = req.user.id;
  const mov = (await query('SELECT id, tipo, categoria_id, categoria_auto FROM movimientos WHERE id = $1 AND usuario_id = $2', [req.params.id, uid])).rows[0];
  if (!mov) throw noEncontrado('Movimiento');
  if (mov.categoria_id && !mov.categoria_auto) throw new HttpError(409, 'El usuario ya eligió una categoría; no se sobrescribe');
  const tipoCat = mov.tipo.startsWith('prestamo') ? 'prestamo' : mov.tipo;
  const cat = (await query(
    `SELECT id, nombre FROM categorias WHERE (usuario_id IS NULL OR usuario_id = $1) AND tipo = $2
       AND ${d.categoria_id ? 'id = $3' : 'lower(nombre) = lower($3)'} ORDER BY usuario_id NULLS LAST LIMIT 1`,
    [uid, tipoCat, d.categoria_id || d.categoria_nombre],
  )).rows[0];
  if (!cat) throw new HttpError(400, 'Categoría inexistente para este tipo de movimiento');
  await query('UPDATE movimientos SET categoria_id = $1, categoria_auto = true, updated_at = now() WHERE id = $2', [cat.id, mov.id]);
  await registrarAutomatizacion({ usuarioId: uid, movimientoId: mov.id, workflow: 'n8n.categorizar', estado: 'aplicado', payload: { categoria: cat } });
  res.json({ ok: true, movimiento_id: mov.id, categoria: cat });
});

export default router;
