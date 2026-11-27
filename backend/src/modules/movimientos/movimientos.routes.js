import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { query, transaccion } from '../../db/pool.js';
import { config } from '../../config.js';
import { HttpError, noEncontrado } from '../../middleware/errores.js';
import { categoriaVisible } from '../categorias/categorias.routes.js';
import { dispararEvento } from '../automatizaciones/n8n.js';
import { esquemaFiltros, whereMovimientos, SELECT_MOVIMIENTO } from './filtros.js';
import { leerScanTemporal, limpiarScanTemporal } from '../ocr/ocr.routes.js';

const router = Router();

export const esquemaMovimiento = z.object({
  tipo: z.enum(['ingreso', 'gasto']),
  descripcion: z.string().trim().max(300).optional().nullable(),
  cantidad: z.coerce.number().positive().optional().nullable(),
  monto: z.coerce.number().nonnegative().max(9_999_999_999.99),
  fecha_hora: z.coerce.date(),
  categoria_id: z.string().uuid().optional().nullable(),
  origen_destino: z.string().trim().max(200).optional().nullable(),
  created_via: z.enum(['teclado', 'scan']).default('teclado'),
  scan_token: z.string().uuid().optional().nullable(),
});

export const redondear = (n) => Math.round(n * 100) / 100;

router.get('/', async (req, res) => {
  const f = esquemaFiltros.parse(req.query);
  const { page, limit } = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(req.query);
  const { where, params } = whereMovimientos(req.user.id, f);
  const [items, tot] = await Promise.all([
    query(`${SELECT_MOVIMIENTO} WHERE ${where} ORDER BY m.fecha_hora DESC, m.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
    query(`SELECT count(*)::int AS total,
             COALESCE(sum(monto) FILTER (WHERE tipo='ingreso'),0) AS ingresos,
             COALESCE(sum(monto) FILTER (WHERE tipo='gasto'),0) AS gastos
           FROM movimientos m WHERE ${where}`, params),
  ]);
  res.json({
    items: items.rows,
    total: tot.rows[0].total,
    page,
    limit,
    resumen: { ingresos: tot.rows[0].ingresos, gastos: tot.rows[0].gastos },
  });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_MOVIMIENTO} WHERE m.id = $1 AND m.usuario_id = $2`, [req.params.id, req.user.id]);
  if (!rows[0]) throw noEncontrado('Movimiento');
  const adj = await query('SELECT id, url, tipo, ocr_raw_json FROM adjuntos WHERE movimiento_id = $1', [req.params.id]);
  res.json({ ...rows[0], adjuntos: adj.rows });
});

router.post('/', async (req, res) => {
  const d = esquemaMovimiento.parse(req.body);
  const uid = req.user.id;
  // El scan solo precarga: el movimiento se guarda únicamente aquí, tras la confirmación del usuario.
  const scan = d.scan_token ? await leerScanTemporal(uid, d.scan_token) : null;
  if (d.created_via === 'scan' && !scan) throw new HttpError(400, 'El escaneo expiró, vuelve a subir la foto');

  let archivoMovido = null;
  const mov = await transaccion(async (db) => {
    await categoriaVisible(uid, d.categoria_id, db);
    const { rows } = await db.query(
      `INSERT INTO movimientos (usuario_id, tipo, descripcion, cantidad, monto, fecha_hora, categoria_id, origen_destino, created_via)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [uid, d.tipo, d.descripcion ?? null, d.cantidad ?? null, redondear(d.monto), d.fecha_hora,
        d.categoria_id ?? null, d.origen_destino ?? null, scan ? 'scan' : 'teclado'],
    );
    const m = rows[0];
    if (scan) {
      const destDir = path.join(config.uploadsDir, uid);
      await fs.mkdir(destDir, { recursive: true });
      const nombre = `${m.id}${scan.extension}`;
      const url = `/api/adjuntos/${nombre}`;
      await db.query('INSERT INTO adjuntos (movimiento_id, url, tipo, ocr_raw_json) VALUES ($1,$2,$3,$4)',
        [m.id, url, scan.mime, scan.ocr]);
      await db.query('UPDATE movimientos SET adjunto_url = $1 WHERE id = $2', [url, m.id]);
      m.adjunto_url = url;
      await fs.copyFile(scan.rutaImagen, path.join(destDir, nombre));
      archivoMovido = scan;
    }
    return m;
  });
  if (archivoMovido) await limpiarScanTemporal(archivoMovido);
  dispararEvento('movimiento.creado', mov);
  res.status(201).json(mov);
});

router.put('/:id', async (req, res) => {
  const d = esquemaMovimiento.omit({ created_via: true, scan_token: true }).parse(req.body);
  const uid = req.user.id;
  const mov = await transaccion(async (db) => {
    const actual = (await db.query('SELECT tipo FROM movimientos WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [req.params.id, uid])).rows[0];
    if (!actual) throw noEncontrado('Movimiento');
    if (actual.tipo.startsWith('prestamo')) throw new HttpError(400, 'Los préstamos se editan desde Préstamos');
    await categoriaVisible(uid, d.categoria_id, db);
    const { rows } = await db.query(
      `UPDATE movimientos SET tipo=$3, descripcion=$4, cantidad=$5, monto=$6, fecha_hora=$7, categoria_id=$8,
              origen_destino=$9, updated_at=now()
       WHERE id=$1 AND usuario_id=$2 RETURNING *`,
      [req.params.id, uid, d.tipo, d.descripcion ?? null, d.cantidad ?? null, redondear(d.monto), d.fecha_hora,
        d.categoria_id ?? null, d.origen_destino ?? null],
    );
    return rows[0];
  });
  dispararEvento('movimiento.actualizado', mov);
  res.json(mov);
});

router.delete('/:id', async (req, res) => {
  const uid = req.user.id;
  const { rows } = await query(
    `DELETE FROM movimientos WHERE id=$1 AND usuario_id=$2 AND tipo IN ('ingreso','gasto') RETURNING id, adjunto_url`,
    [req.params.id, uid],
  );
  if (!rows[0]) throw noEncontrado('Movimiento');
  if (rows[0].adjunto_url) {
    await fs.unlink(path.join(config.uploadsDir, uid, path.basename(rows[0].adjunto_url))).catch(() => {});
  }
  res.status(204).end();
});

export default router;
