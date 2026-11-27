import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { HttpError, noEncontrado } from '../../middleware/errores.js';
import { sugerirCategoria } from '../categorizacion/categorizador.js';

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
    `SELECT c.id, c.nombre, c.color, c.icono, c.tipo, (c.usuario_id IS NULL) AS global, p.monto_mensual AS presupuesto
     FROM categorias c LEFT JOIN presupuestos p ON p.categoria_id = c.id AND p.usuario_id = $1
     WHERE c.usuario_id IS NULL OR c.usuario_id = $1
     ORDER BY c.tipo, global DESC, c.nombre`,
    [req.user.id],
  );
  res.json(rows);
});

/** GET /api/categorias/sugerir?tipo=gasto&descripcion=..&origen_destino=.. */
router.get('/sugerir', async (req, res) => {
  const q = z.object({
    tipo: z.enum(['ingreso', 'gasto']),
    descripcion: z.string().max(300).optional(),
    origen_destino: z.string().max(200).optional(),
  }).parse(req.query);
  res.json({ sugerencia: await sugerirCategoria(req.user.id, q) });
});

/** PUT /api/categorias/:id/presupuesto { monto_mensual | null } — vale también para categorías globales */
router.put('/:id/presupuesto', async (req, res) => {
  const { monto_mensual } = z.object({ monto_mensual: z.coerce.number().positive().max(9_999_999_999).nullable() }).parse(req.body);
  const cat = await categoriaVisible(req.user.id, req.params.id);
  if (cat.tipo !== 'gasto') throw new HttpError(400, 'Solo las categorías de gasto tienen presupuesto');
  if (monto_mensual == null) {
    await query('DELETE FROM presupuestos WHERE usuario_id = $1 AND categoria_id = $2', [req.user.id, cat.id]);
  } else {
    await query(
      `INSERT INTO presupuestos (usuario_id, categoria_id, monto_mensual) VALUES ($1,$2,$3)
       ON CONFLICT (usuario_id, categoria_id) DO UPDATE SET monto_mensual = EXCLUDED.monto_mensual`,
      [req.user.id, cat.id, Math.round(monto_mensual * 100) / 100],
    );
  }
  res.json({ id: cat.id, presupuesto: monto_mensual });
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
