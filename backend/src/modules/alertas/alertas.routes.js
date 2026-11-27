import { Router } from 'express';
import { query } from '../../db/pool.js';
import { noEncontrado } from '../../middleware/errores.js';
import { evaluarAlertasPrestamos } from './alertas.js';

const router = Router();

router.get('/', async (req, res) => {
  // Revisión perezosa de préstamos al abrir la app (además del programador)
  await evaluarAlertasPrestamos(req.user.id).catch(() => {});
  const [lista, n] = await Promise.all([
    query(`SELECT id, tipo, titulo, mensaje, datos, estado_envio, leida_at, created_at
           FROM alertas WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]),
    query('SELECT count(*)::int AS n FROM alertas WHERE usuario_id = $1 AND leida_at IS NULL', [req.user.id]),
  ]);
  res.json({ items: lista.rows, no_leidas: n.rows[0].n });
});

router.post('/leer-todas', async (req, res) => {
  await query('UPDATE alertas SET leida_at = now() WHERE usuario_id = $1 AND leida_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

router.post('/:id/leida', async (req, res) => {
  const { rowCount } = await query('UPDATE alertas SET leida_at = COALESCE(leida_at, now()) WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw noEncontrado('Alerta');
  res.json({ ok: true });
});

export default router;
