import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';

const router = Router();

/**
 * Balance disponible =
 *   ingresos − gastos − préstamos dados + préstamos recibidos
 *   + abonos cobrados (de préstamos dados) − abonos pagados (de préstamos recibidos)
 */
const SQL_BALANCE = `
  SELECT
    COALESCE(sum(CASE m.tipo WHEN 'ingreso' THEN m.monto WHEN 'prestamo_in' THEN m.monto
                             WHEN 'gasto' THEN -m.monto WHEN 'prestamo_out' THEN -m.monto END), 0)
    + COALESCE((SELECT sum(CASE mm.tipo WHEN 'prestamo_out' THEN a.monto ELSE -a.monto END)
                FROM abonos_prestamo a JOIN prestamos p ON p.id = a.prestamo_id
                JOIN movimientos mm ON mm.id = p.movimiento_id WHERE mm.usuario_id = $1), 0) AS balance
  FROM movimientos m WHERE m.usuario_id = $1`;

router.get('/', async (req, res) => {
  const { mes, meses } = z.object({
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    meses: z.coerce.number().int().min(3).max(24).default(6),
  }).parse(req.query);
  const uid = req.user.id;
  const inicio = mes ? `${mes}-01` : null;

  const [balance, mesActual, top, prestamos, flujo] = await Promise.all([
    query(SQL_BALANCE, [uid]),
    query(
      `WITH r AS (SELECT date_trunc('month', COALESCE($2::date, CURRENT_DATE)) AS ini)
       SELECT
         COALESCE(sum(monto) FILTER (WHERE tipo='ingreso' AND fecha_hora >= r.ini), 0) AS ingresos,
         COALESCE(sum(monto) FILTER (WHERE tipo='gasto'   AND fecha_hora >= r.ini), 0) AS gastos,
         COALESCE(sum(monto) FILTER (WHERE tipo='ingreso' AND fecha_hora <  r.ini), 0) AS ingresos_ant,
         COALESCE(sum(monto) FILTER (WHERE tipo='gasto'   AND fecha_hora <  r.ini), 0) AS gastos_ant,
         count(*) FILTER (WHERE fecha_hora >= r.ini)::int AS num_movimientos
       FROM movimientos, r
       WHERE usuario_id = $1 AND fecha_hora >= r.ini - interval '1 month' AND fecha_hora < r.ini + interval '1 month'
       GROUP BY r.ini`,
      [uid, inicio],
    ),
    query(
      `SELECT COALESCE(c.id::text, 'sin') AS id, COALESCE(c.nombre, 'Sin categoría') AS nombre,
              COALESCE(c.color, '#94a3b8') AS color, c.icono, sum(m.monto) AS total, count(*)::int AS n
       FROM movimientos m LEFT JOIN categorias c ON c.id = m.categoria_id
       WHERE m.usuario_id = $1 AND m.tipo = 'gasto'
         AND m.fecha_hora >= date_trunc('month', COALESCE($2::date, CURRENT_DATE))
         AND m.fecha_hora <  date_trunc('month', COALESCE($2::date, CURRENT_DATE)) + interval '1 month'
       GROUP BY 1,2,3,4 ORDER BY total DESC LIMIT 5`,
      [uid, inicio],
    ),
    query(
      `SELECT
         COALESCE(sum(p.saldo_pendiente) FILTER (WHERE m.tipo='prestamo_out'), 0) AS por_cobrar,
         COALESCE(sum(p.saldo_pendiente) FILTER (WHERE m.tipo='prestamo_in'), 0)  AS por_pagar,
         count(*) FILTER (WHERE m.tipo='prestamo_out')::int AS n_por_cobrar,
         count(*) FILTER (WHERE m.tipo='prestamo_in')::int  AS n_por_pagar,
         count(*) FILTER (WHERE p.fecha_limite < CURRENT_DATE)::int AS vencidos
       FROM prestamos p JOIN movimientos m ON m.id = p.movimiento_id
       WHERE m.usuario_id = $1 AND p.estado <> 'pagado_cobrado'`,
      [uid],
    ),
    query(
      `WITH meses AS (
         SELECT generate_series(date_trunc('month', COALESCE($2::date, CURRENT_DATE)) - make_interval(months => $3 - 1),
                                date_trunc('month', COALESCE($2::date, CURRENT_DATE)), interval '1 month') AS mes)
       SELECT to_char(meses.mes, 'YYYY-MM') AS mes,
              COALESCE(sum(m.monto) FILTER (WHERE m.tipo='ingreso'), 0) AS ingresos,
              COALESCE(sum(m.monto) FILTER (WHERE m.tipo='gasto'), 0) AS gastos
       FROM meses LEFT JOIN movimientos m
         ON m.usuario_id = $1 AND m.fecha_hora >= meses.mes AND m.fecha_hora < meses.mes + interval '1 month'
       GROUP BY meses.mes ORDER BY meses.mes`,
      [uid, inicio, meses],
    ),
  ]);

  const ma = mesActual.rows[0] || { ingresos: 0, gastos: 0, ingresos_ant: 0, gastos_ant: 0, num_movimientos: 0 };
  res.json({
    balance: balance.rows[0].balance,
    mes: {
      ingresos: ma.ingresos,
      gastos: ma.gastos,
      neto: Math.round((ma.ingresos - ma.gastos) * 100) / 100,
      ingresos_mes_anterior: ma.ingresos_ant,
      gastos_mes_anterior: ma.gastos_ant,
      num_movimientos: ma.num_movimientos,
    },
    top_categorias: top.rows,
    prestamos: prestamos.rows[0],
    flujo_caja: flujo.rows.map((r) => ({ ...r, neto: Math.round((r.ingresos - r.gastos) * 100) / 100 })),
  });
});

router.get('/metricas', async (req, res) => {
  const f = z.object({ desde: z.string().date(), hasta: z.string().date() }).parse(req.query);
  const uid = req.user.id;
  const p = [uid, f.desde, f.hasta];
  const rango = `m.usuario_id = $1 AND m.fecha_hora >= $2::date AND m.fecha_hora < ($3::date + 1)`;
  const [porCategoria, diario, porDia, totales] = await Promise.all([
    query(
      `SELECT m.tipo, COALESCE(c.nombre, 'Sin categoría') AS nombre, COALESCE(c.color, '#94a3b8') AS color,
              sum(m.monto) AS total, count(*)::int AS n
       FROM movimientos m LEFT JOIN categorias c ON c.id = m.categoria_id
       WHERE ${rango} AND m.tipo IN ('ingreso','gasto') GROUP BY 1,2,3 ORDER BY total DESC`, p),
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS fecha,
              COALESCE(sum(m.monto) FILTER (WHERE m.tipo='ingreso'),0) AS ingresos,
              COALESCE(sum(m.monto) FILTER (WHERE m.tipo='gasto'),0) AS gastos
       FROM generate_series($2::date, $3::date, interval '1 day') d
       LEFT JOIN movimientos m ON m.usuario_id = $1 AND m.fecha_hora >= d AND m.fecha_hora < d + interval '1 day'
       GROUP BY d ORDER BY d`, p),
    query(
      `SELECT extract(isodow FROM m.fecha_hora)::int AS dia, sum(m.monto) AS total
       FROM movimientos m WHERE ${rango} AND m.tipo='gasto' GROUP BY 1 ORDER BY 1`, p),
    query(
      `SELECT COALESCE(sum(monto) FILTER (WHERE tipo='ingreso'),0) AS ingresos,
              COALESCE(sum(monto) FILTER (WHERE tipo='gasto'),0) AS gastos,
              COALESCE(avg(monto) FILTER (WHERE tipo='gasto'),0) AS ticket_promedio,
              COALESCE(max(monto) FILTER (WHERE tipo='gasto'),0) AS gasto_mayor,
              count(*)::int AS n
       FROM movimientos m WHERE ${rango}`, p),
  ]);
  res.json({ totales: totales.rows[0], por_categoria: porCategoria.rows, diario: diario.rows, por_dia_semana: porDia.rows });
});

export default router;
