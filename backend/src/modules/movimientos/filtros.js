import { z } from 'zod';

const lista = (vals) => z.string().optional().transform((s) => (s ? s.split(',').filter(Boolean) : []))
  .pipe(z.array(z.enum(vals)));

export const esquemaFiltros = z.object({
  tipo: lista(['ingreso', 'gasto', 'prestamo_out', 'prestamo_in']),
  categoria_id: z.string().uuid().optional(),
  sin_categoria: z.enum(['1', 'true']).optional(),
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  q: z.string().trim().max(100).optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  created_via: z.enum(['teclado', 'scan', 'import']).optional(),
});

/**
 * Construye el WHERE de movimientos. SIEMPRE incluye usuario_id (regla de oro).
 * Las fechas se interpretan en la zona horaria TZ del servidor/BD.
 */
export function whereMovimientos(usuarioId, f, alias = 'm') {
  const c = [`${alias}.usuario_id = $1`];
  const p = [usuarioId];
  const add = (sql, v) => { p.push(v); c.push(sql.replaceAll('?', `$${p.length}`)); };
  if (f.tipo?.length) add(`${alias}.tipo = ANY(?)`, f.tipo);
  if (f.categoria_id) add(`${alias}.categoria_id = ?`, f.categoria_id);
  if (f.sin_categoria) c.push(`${alias}.categoria_id IS NULL`);
  if (f.desde) add(`${alias}.fecha_hora >= ?::date`, f.desde);
  if (f.hasta) add(`${alias}.fecha_hora < (?::date + 1)`, f.hasta);
  if (f.q) add(`(${alias}.descripcion ILIKE ? OR ${alias}.origen_destino ILIKE ?)`, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
  if (f.min !== undefined) add(`${alias}.monto >= ?`, f.min);
  if (f.max !== undefined) add(`${alias}.monto <= ?`, f.max);
  if (f.created_via) add(`${alias}.created_via = ?`, f.created_via);
  return { where: c.join(' AND '), params: p };
}

export const SELECT_MOVIMIENTO = `
  SELECT m.id, m.tipo, m.descripcion, m.cantidad, m.monto, m.fecha_hora, m.categoria_id,
         m.origen_destino, m.adjunto_url, m.created_via, m.created_at, m.updated_at, m.categoria_auto,
         c.nombre AS categoria_nombre, c.color AS categoria_color, c.icono AS categoria_icono,
         p.id AS prestamo_id
  FROM movimientos m
  LEFT JOIN categorias c ON c.id = m.categoria_id
  LEFT JOIN prestamos p ON p.movimiento_id = m.id`;
