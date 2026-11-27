import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { query, transaccion } from '../../db/pool.js';
import { HttpError } from '../../middleware/errores.js';
import { esquemaFiltros, whereMovimientos, SELECT_MOVIMIENTO } from '../movimientos/filtros.js';
import { parsearArchivo, claveDuplicado } from './parseo.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TIPOS = { ingreso: 'Ingreso', gasto: 'Gasto', prestamo_out: 'Préstamo dado', prestamo_in: 'Préstamo recibido' };
const pad = (n) => String(n).padStart(2, '0');
const fmtFecha = (d) => { const f = new Date(d); return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())} ${pad(f.getHours())}:${pad(f.getMinutes())}`; };
const COLUMNAS = ['fecha', 'tipo', 'descripcion', 'categoria', 'monto', 'cantidad', 'origen_destino', 'via'];

const fila = (m) => ({
  fecha: fmtFecha(m.fecha_hora),
  tipo: m.tipo,
  descripcion: m.descripcion ?? '',
  categoria: m.categoria_nombre ?? '',
  monto: m.monto,
  cantidad: m.cantidad ?? '',
  origen_destino: m.origen_destino ?? '',
  via: m.created_via ?? '',
});

// ---------- EXPORT ----------
router.get('/export', async (req, res) => {
  const { formato } = z.object({ formato: z.enum(['csv', 'xlsx', 'pdf']) }).parse(req.query);
  const f = esquemaFiltros.parse(req.query);
  const { where, params } = whereMovimientos(req.user.id, f);
  const { rows } = await query(`${SELECT_MOVIMIENTO} WHERE ${where} ORDER BY m.fecha_hora DESC LIMIT 20000`, params);
  const nombre = `movimientos_${new Date().toISOString().slice(0, 10)}`;

  if (formato === 'csv') {
    const csv = Papa.unparse({ fields: COLUMNAS, data: rows.map((m) => COLUMNAS.map((c) => fila(m)[c])) });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    return res.send(`﻿${csv}`);
  }

  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Finanzas';
    const ws = wb.addWorksheet('Movimientos');
    ws.columns = COLUMNAS.map((c) => ({ header: c, key: c, width: c === 'descripcion' ? 40 : 16 }));
    rows.forEach((m) => ws.addRow(fila(m)));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
    ws.getColumn('monto').numFmt = '#,##0.00';
    ws.autoFilter = { from: 'A1', to: `H${rows.length + 1}` };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  // PDF
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
  doc.pipe(res);
  const ingresos = rows.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const gastos = rows.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
  doc.fillColor('#6d28d9').fontSize(18).text('Reporte de movimientos');
  doc.moveDown(0.3).fillColor('#334155').fontSize(9)
    .text(`Generado: ${fmtFecha(new Date())}   ·   Rango: ${f.desde ?? 'inicio'} → ${f.hasta ?? 'hoy'}   ·   ${rows.length} movimientos`);
  doc.moveDown(0.5).fontSize(11)
    .fillColor('#16a34a').text(`Ingresos: ${ingresos.toFixed(2)}`, { continued: true })
    .fillColor('#334155').text('     ', { continued: true })
    .fillColor('#dc2626').text(`Gastos: ${gastos.toFixed(2)}`, { continued: true })
    .fillColor('#334155').text('     ', { continued: true })
    .fillColor('#2563eb').text(`Neto: ${(ingresos - gastos).toFixed(2)}`);
  doc.moveDown(0.8);

  const cols = [{ k: 'fecha', w: 85 }, { k: 'tipo', w: 75 }, { k: 'descripcion', w: 170 }, { k: 'categoria', w: 85 }, { k: 'monto', w: 70, a: 'right' }, { k: 'origen_destino', w: 0 }];
  cols[5].w = doc.page.width - 72 - cols.slice(0, 5).reduce((s, c) => s + c.w, 0);
  const cab = { fecha: 'Fecha', tipo: 'Tipo', descripcion: 'Descripción', categoria: 'Categoría', monto: 'Monto', origen_destino: 'Origen/Destino' };
  const dibujarFila = (vals, opts = {}) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const y = doc.y;
    let x = 36;
    if (opts.fondo) doc.rect(36, y - 2, doc.page.width - 72, 14).fill(opts.fondo);
    doc.fontSize(8).fillColor(opts.color || '#1e293b');
    cols.forEach((c) => {
      doc.text(String(vals[c.k] ?? ''), x + 2, y, { width: c.w - 4, align: c.a || 'left', lineBreak: false, ellipsis: true });
      x += c.w;
    });
    doc.x = 36;
    doc.y = y + 14;
  };
  dibujarFila(cab, { fondo: '#ede9fe', color: '#4c1d95' });
  rows.forEach((m, i) => dibujarFila({ ...fila(m), tipo: TIPOS[m.tipo], monto: m.monto.toFixed(2) }, { fondo: i % 2 ? '#f8fafc' : undefined }));
  doc.end();
});

// ---------- IMPORT ----------
router.get('/import/plantilla', (_req, res) => {
  const csv = Papa.unparse({
    fields: ['fecha', 'tipo', 'descripcion', 'categoria', 'monto', 'cantidad', 'origen_destino'],
    data: [['2026-01-15 13:30', 'gasto', 'Almuerzo', 'Comida', '25.50', '1', 'Restaurante'], ['2026-01-31', 'ingreso', 'Sueldo enero', 'Sueldo', '3500', '', 'Empresa']],
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_import.csv"');
  res.send(`﻿${csv}`);
});

/**
 * POST /api/import?modo=preview|importar  (multipart "archivo": .csv o .xlsx)
 * preview: devuelve filas parseadas marcando duplicados y errores, sin escribir.
 * importar: inserta (en una transacción) solo las filas válidas no duplicadas.
 */
router.post('/import', upload.single('archivo'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Adjunta un archivo en el campo "archivo"');
  const { modo, incluir_duplicados } = z.object({
    modo: z.enum(['preview', 'importar']).default('preview'),
    incluir_duplicados: z.enum(['1', 'true', '0', 'false']).optional(),
  }).parse(req.query);
  const uid = req.user.id;
  const cats = (await query('SELECT id, nombre, tipo FROM categorias WHERE usuario_id IS NULL OR usuario_id = $1', [uid])).rows;

  let parseado;
  try {
    parseado = await parsearArchivo(req.file.buffer, req.file.originalname, cats);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  if (parseado.faltan.length) throw new HttpError(400, `Faltan columnas obligatorias: ${parseado.faltan.join(', ')}`);
  const validas = parseado.filas.filter((r) => r.datos);
  if (!parseado.filas.length) throw new HttpError(400, 'El archivo no tiene filas de datos');

  // Duplicados contra la BD (mismo rango de fechas) y dentro del propio archivo
  const fechas = validas.map((r) => r.datos.fecha_hora.getTime());
  const existentes = new Set();
  if (validas.length) {
    const desde = new Date(Math.min(...fechas)); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(Math.max(...fechas)); hasta.setHours(23, 59, 59, 999);
    const { rows } = await query(
      `SELECT tipo, fecha_hora, monto, descripcion FROM movimientos WHERE usuario_id = $1 AND fecha_hora BETWEEN $2 AND $3`,
      [uid, desde, hasta],
    );
    rows.forEach((m) => existentes.add(claveDuplicado(m)));
  }
  const vistos = new Set();
  for (const r of validas) {
    const k = claveDuplicado(r.datos);
    if (existentes.has(k)) r.duplicado = 'ya existe';
    else if (vistos.has(k)) r.duplicado = 'repetido en el archivo';
    vistos.add(k);
  }

  const resumen = {
    filas_totales: parseado.filas.length,
    validas: validas.length,
    errores: parseado.filas.length - validas.length,
    duplicadas: validas.filter((r) => r.duplicado).length,
  };

  if (modo === 'preview') return res.json({ resumen, filas: parseado.filas.slice(0, 500) });

  const incluirDup = incluir_duplicados === '1' || incluir_duplicados === 'true';
  const aInsertar = validas.filter((r) => incluirDup || !r.duplicado);
  const imp = await transaccion(async (db) => {
    for (const { datos: d } of aInsertar) {
      await db.query(
        `INSERT INTO movimientos (usuario_id, tipo, descripcion, cantidad, monto, fecha_hora, categoria_id, origen_destino, created_via)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'import')`,
        [uid, d.tipo, d.descripcion, d.cantidad, d.monto, d.fecha_hora, d.categoria_id, d.origen_destino],
      );
    }
    return (await db.query(
      `INSERT INTO importaciones (usuario_id, archivo, filas_totales, filas_importadas, filas_duplicadas)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [uid, req.file.originalname.slice(0, 200), resumen.filas_totales, aInsertar.length, resumen.duplicadas],
    )).rows[0];
  });
  res.status(201).json({ resumen: { ...resumen, importadas: aInsertar.length }, importacion: imp });
});

router.get('/importaciones', async (req, res) => {
  const { rows } = await query('SELECT * FROM importaciones WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json(rows);
});

export default router;
