import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { HttpError, noEncontrado } from '../../middleware/errores.js';

const router = Router();

const esquema = z.object({
  nombre: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  icono: z.string().max(8).optional().nullable(),
  tipo: z.enum(['ingreso', 'gasto', 'prestamo']),
});

/** Categorías visibles para el usuario: globales + propias. */
export async function categoriaVisible(usuarioId, categoriaId, db = { query }) {
  if (!categoriaId) return null;
  const { rows } = await db.query(
    'SELECT * FROM categorias WHERE id = $1 AND (usuario_id IS NULL OR usuario_id = $2)',
    [categoriaId, usuarioId],
  );
  if (!rows[0]) throw new HttpError(400, 'Categoría inválida');
  return rows[0];
}

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, nombre, color, icono, tipo, (usuario_id IS NULL) AS global
     FROM categorias WHERE usuario_id IS NULL OR usuario_id = $1
     ORDER BY tipo, global DESC, nombre`,
    [req.user.id],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO categorias (usuario_id, nombre, color, icono, tipo) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, nombre, color, icono, tipo, false AS global`,
    [req.user.id, d.nombre, d.color ?? null, d.icono ?? null, d.tipo],
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await query(
    `UPDATE categorias SET nombre=$3, color=$4, icono=$5, tipo=$6
     WHERE id=$1 AND usuario_id=$2 RETURNING id, nombre, color, icono, tipo, false AS global`,
    [req.params.id, req.user.id, d.nombre, d.color ?? null, d.icono ?? null, d.tipo],
  );
  if (!rows[0]) throw noEncontrado('Categoría propia');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM categorias WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) throw noEncontrado('Categoría propia');
  res.status(204).end();
});

export default router;
