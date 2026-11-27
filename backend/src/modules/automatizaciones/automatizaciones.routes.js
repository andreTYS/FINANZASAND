import { Router } from 'express';
import { query } from '../../db/pool.js';

const router = Router();

// Últimas automatizaciones disparadas para movimientos del usuario
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.movimiento_id, a.workflow_n8n, a.estado, a.created_at
     FROM automatizaciones_log a
     WHERE a.usuario_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json(rows);
});

export default router;
