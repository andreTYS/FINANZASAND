import { Router } from 'express';
import { z } from 'zod';
import { query, transaccion } from '../../db/pool.js';
import { HttpError, noEncontrado } from '../../middleware/errores.js';
import { categoriaVisible } from '../categorias/categorias.routes.js';
import { dispararEvento } from '../automatizaciones/n8n.js';
import { redondear } from '../movimientos/movimientos.routes.js';

const router = Router();

// prestamo_out = presté dinero (me deben) · prestamo_in = me prestaron (debo)
const esquema = z.object({
  tipo: z.enum(['prestamo_out', 'prestamo_in']),
  persona_lugar: z.string().trim().min(1).max(200),
  monto: z.coerce.number().positive().max(9_999_999_999.99),
  fecha_hora: z.coerce.date(),
  fecha_limite: z.string().date().optional().nullable(),
  descripcion: z.string().trim().max(300).optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
});

const SELECT = `
  SELECT p.id, p.movimiento_id, p.persona_lugar, p.monto_original, p.saldo_pendiente, p.fecha_limite, p.estado,
         m.tipo, m.descripcion, m.fecha_hora, m.categoria_id,
         (p.monto_original - p.saldo_pendiente) AS pagado,
         (p.fecha_limite IS NOT NULL AND p.fecha_limite < CURRENT_DATE AND p.estado <> 'pagado_cobrado') AS vencido
  FROM prestamos p JOIN movimientos m ON m.id = p.movimiento_id`;

export function estadoPara(original, saldo) {
  if (saldo <= 0) return 'pagado_cobrado';
  if (saldo < original) return 'pagado_parcial';
  return 'pendiente';
}

async function prestamoDelUsuario(db, id, uid, bloquear = false) {
  const { rows } = await db.query(
    `SELECT p.*, m.tipo FROM prestamos p JOIN movimientos m ON m.id = p.movimiento_id
     WHERE p.id = $1 AND m.usuario_id = $2 ${bloquear ? 'FOR UPDATE OF p' : ''}`,
    [id, uid],
  );
  if (!rows[0]) throw noEncontrado('Préstamo');
  return rows[0];
}

router.get('/', async (req, res) => {
  const f = z.object({
    tipo: z.enum(['prestamo_out', 'prestamo_in']).optional(),
    estado: z.enum(['pendiente', 'pagado_parcial', 'pagado_cobrado', 'abiertos']).optional(),
    q: z.string().trim().max(100).optional(),
  }).parse(req.query);
  const p = [req.user.id];
  const c = ['m.usuario_id = $1'];
  if (f.tipo) { p.push(f.tipo); c.push(`m.tipo = $${p.length}`); }
  if (f.estado === 'abiertos') c.push(`p.estado <> 'pagado_cobrado'`);
  else if (f.estado) { p.push(f.estado); c.push(`p.estado = $${p.length}`); }
  if (f.q) { p.push(`%${f.q}%`); c.push(`p.persona_lugar ILIKE $${p.length}`); }
  const { rows } = await query(`${SELECT} WHERE ${c.join(' AND ')} ORDER BY (p.estado = 'pagado_cobrado'), p.fecha_limite NULLS LAST, m.fecha_hora DESC`, p);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE p.id = $1 AND m.usuario_id = $2`, [req.params.id, req.user.id]);
  if (!rows[0]) throw noEncontrado('Préstamo');
  const abonos = await query('SELECT id, monto, fecha FROM abonos_prestamo WHERE prestamo_id = $1 ORDER BY fecha DESC', [req.params.id]);
  res.json({ ...rows[0], abonos: abonos.rows });
});

router.post('/', async (req, res) => {
  const d = esquema.parse(req.body);
  const uid = req.user.id;
  const monto = redondear(d.monto);
  const r = await transaccion(async (db) => {
    await categoriaVisible(uid, d.categoria_id, db);
    const m = (await db.query(
      `INSERT INTO movimientos (usuario_id, tipo, descripcion, monto, fecha_hora, categoria_id, origen_destino, created_via)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'teclado') RETURNING *`,
      [uid, d.tipo, d.descripcion ?? null, monto, d.fecha_hora, d.categoria_id ?? null, d.persona_lugar],
    )).rows[0];
    const p = (await db.query(
      `INSERT INTO prestamos (movimiento_id, persona_lugar, monto_original, saldo_pendiente, fecha_limite, estado)
       VALUES ($1,$2,$3,$3,$4,'pendiente') RETURNING *`,
      [m.id, d.persona_lugar, monto, d.fecha_limite ?? null],
    )).rows[0];
    return { movimiento: m, prestamo: p };
  });
  dispararEvento('prestamo.creado', r.movimiento, { prestamo: r.prestamo });
  res.status(201).json({ ...r.prestamo, tipo: r.movimiento.tipo });
});

router.put('/:id', async (req, res) => {
  const d = esquema.parse(req.body);
  const uid = req.user.id;
  const monto = redondear(d.monto);
  const r = await transaccion(async (db) => {
    const actual = await prestamoDelUsuario(db, req.params.id, uid, true);
    await categoriaVisible(uid, d.categoria_id, db);
    const pagado = redondear(actual.monto_original - actual.saldo_pendiente);
    if (monto < pagado) throw new HttpError(400, `El monto no puede ser menor a lo ya abonado (${pagado})`);
    const saldo = redondear(monto - pagado);
    const m = (await db.query(
      `UPDATE movimientos SET tipo=$2, descripcion=$3, monto=$4, fecha_hora=$5, categoria_id=$6, origen_destino=$7, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [actual.movimiento_id, d.tipo, d.descripcion ?? null, monto, d.fecha_hora, d.categoria_id ?? null, d.persona_lugar],
    )).rows[0];
    const p = (await db.query(
      `UPDATE prestamos SET persona_lugar=$2, monto_original=$3, saldo_pendiente=$4, fecha_limite=$5, estado=$6
       WHERE id=$1 RETURNING *`,
      [actual.id, d.persona_lugar, monto, saldo, d.fecha_limite ?? null, estadoPara(monto, saldo)],
    )).rows[0];
    return { movimiento: m, prestamo: p };
  });
  dispararEvento('prestamo.actualizado', r.movimiento, { prestamo: r.prestamo });
  res.json({ ...r.prestamo, tipo: r.movimiento.tipo });
});

router.delete('/:id', async (req, res) => {
  await transaccion(async (db) => {
    const p = await prestamoDelUsuario(db, req.params.id, req.user.id, true);
    await db.query('DELETE FROM movimientos WHERE id = $1 AND usuario_id = $2', [p.movimiento_id, req.user.id]);
  });
  res.status(204).end();
});

router.post('/:id/abonos', async (req, res) => {
  const d = z.object({ monto: z.coerce.number().positive(), fecha: z.coerce.date().optional() }).parse(req.body);
  const monto = redondear(d.monto);
  const r = await transaccion(async (db) => {
    const p = await prestamoDelUsuario(db, req.params.id, req.user.id, true);
    if (monto > p.saldo_pendiente) throw new HttpError(400, `El abono supera el saldo pendiente (${p.saldo_pendiente})`);
    const abono = (await db.query(
      'INSERT INTO abonos_prestamo (prestamo_id, monto, fecha) VALUES ($1,$2,$3) RETURNING *',
      [p.id, monto, d.fecha ?? new Date()],
    )).rows[0];
    const saldo = redondear(p.saldo_pendiente - monto);
    const act = (await db.query(
      'UPDATE prestamos SET saldo_pendiente=$2, estado=$3 WHERE id=$1 RETURNING *',
      [p.id, saldo, estadoPara(p.monto_original, saldo)],
    )).rows[0];
    return { abono, prestamo: act, movimiento_id: p.movimiento_id };
  });
  dispararEvento('prestamo.abono', { id: r.movimiento_id, usuario_id: req.user.id }, { abono: r.abono, prestamo: r.prestamo });
  res.status(201).json(r);
});

router.delete('/:id/abonos/:abonoId', async (req, res) => {
  const r = await transaccion(async (db) => {
    const p = await prestamoDelUsuario(db, req.params.id, req.user.id, true);
    const { rows } = await db.query('DELETE FROM abonos_prestamo WHERE id=$1 AND prestamo_id=$2 RETURNING monto', [req.params.abonoId, p.id]);
    if (!rows[0]) throw noEncontrado('Abono');
    const saldo = redondear(Math.min(p.monto_original, p.saldo_pendiente + rows[0].monto));
    return (await db.query('UPDATE prestamos SET saldo_pendiente=$2, estado=$3 WHERE id=$1 RETURNING *',
      [p.id, saldo, estadoPara(p.monto_original, saldo)])).rows[0];
  });
  res.json(r);
});

export default router;
