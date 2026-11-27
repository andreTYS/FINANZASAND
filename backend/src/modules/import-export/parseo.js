import Papa from 'papaparse';
import ExcelJS from 'exceljs';

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const ALIAS = {
  fecha: ['fecha', 'fecha_hora', 'date', 'dia', 'fecha y hora'],
  hora: ['hora', 'time'],
  tipo: ['tipo', 'type', 'movimiento'],
  descripcion: ['descripcion', 'description', 'concepto', 'detalle', 'glosa'],
  categoria: ['categoria', 'category', 'rubro'],
  monto: ['monto', 'importe', 'amount', 'total', 'valor'],
  cantidad: ['cantidad', 'qty', 'unidades'],
  origen_destino: ['origen_destino', 'origen/destino', 'origen', 'destino', 'comercio', 'persona', 'lugar'],
};

function mapearCabeceras(cabeceras) {
  const mapa = {};
  cabeceras.forEach((h, i) => {
    const n = sinAcentos(h);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (alias.includes(n) && mapa[campo] === undefined) mapa[campo] = i;
    }
  });
  return mapa;
}

/** Monto tolerante: "1.234,56", "1,234.56", "S/ 45.90", "-20" */
export function parsearMonto(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return Number(s);
}

/** Fecha tolerante: Date, ISO, dd/mm/yyyy [hh:mm], dd-mm-yyyy, serial Excel. Devuelve Date local o null. */
export function parsearFecha(v, hora) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // exceljs entrega las fechas como UTC "de pared"
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes());
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return parsearFecha(d);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  let y, mo, d, h = 12, mi = 0;
  if (m) { [, y, mo, d] = m.map(Number); if (m[4]) { h = +m[4]; mi = +m[5]; } }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (m[4]) { h = +m[4]; mi = +m[5]; }
  }
  if (hora) { const hm = String(hora).match(/(\d{1,2}):(\d{2})/); if (hm) { h = +hm[1]; mi = +hm[2]; } }
  const f = new Date(y, mo - 1, d, h, mi);
  if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
  return f;
}

function parsearTipo(v, monto) {
  const t = sinAcentos(v);
  if (['ingreso', 'ingresos', 'income', 'entrada', 'abono', '+'].includes(t)) return 'ingreso';
  if (['gasto', 'gastos', 'expense', 'egreso', 'salida', 'cargo', '-'].includes(t)) return 'gasto';
  if (!t && Number.isFinite(monto)) return monto < 0 ? 'gasto' : 'ingreso';
  return null;
}

async function leerFilas(buffer, nombre) {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') {
    const texto = buffer.toString('utf8').replace(/^﻿/, '');
    const r = Papa.parse(texto, { skipEmptyLines: 'greedy', delimiter: '' });
    return r.data;
  }
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const filas = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        let v = cell.value;
        if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.text ?? v.richText?.map((t) => t.text).join('') ?? '';
        vals[col - 1] = v;
      });
      filas.push(vals);
    });
    return filas;
  }
  throw new Error('Formato no soportado: usa .csv o .xlsx');
}

/**
 * Convierte un archivo en filas normalizadas { fila, datos?, error? }.
 * categorias: [{id, nombre, tipo}] visibles para el usuario.
 */
export async function parsearArchivo(buffer, nombre, categorias) {
  const filas = await leerFilas(buffer, nombre);
  if (filas.length < 2) return { filas: [], faltan: [] };
  const mapa = mapearCabeceras(filas[0]);
  const faltan = ['fecha', 'monto'].filter((c) => mapa[c] === undefined);
  if (faltan.length) return { filas: [], faltan };
  const val = (f, campo) => (mapa[campo] === undefined ? undefined : f[mapa[campo]]);

  const res = filas.slice(1).map((f, i) => {
    const fila = i + 2;
    const montoBruto = parsearMonto(val(f, 'monto'));
    const tipo = parsearTipo(val(f, 'tipo'), montoBruto);
    const fecha = parsearFecha(val(f, 'fecha'), val(f, 'hora'));
    if (!fecha) return { fila, error: 'Fecha inválida' };
    if (!Number.isFinite(montoBruto)) return { fila, error: 'Monto inválido' };
    if (!tipo) return { fila, error: 'Tipo inválido (usa ingreso o gasto)' };
    const catNombre = sinAcentos(val(f, 'categoria'));
    const cat = catNombre ? categorias.find((c) => sinAcentos(c.nombre) === catNombre && c.tipo === tipo) : null;
    const cantidad = parsearMonto(val(f, 'cantidad'));
    const texto = (v) => { const s = String(v ?? '').trim(); return s ? s.slice(0, 300) : null; };
    return {
      fila,
      datos: {
        tipo,
        fecha_hora: fecha,
        monto: Math.round(Math.abs(montoBruto) * 100) / 100,
        descripcion: texto(val(f, 'descripcion')),
        categoria_id: cat?.id ?? null,
        categoria_nombre: cat?.nombre ?? (catNombre ? `${texto(val(f, 'categoria'))} (no existe)` : null),
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : null,
        origen_destino: texto(val(f, 'origen_destino')),
      },
    };
  });
  return { filas: res, faltan: [] };
}

/** Clave de duplicado: mismo tipo, día, monto y descripción normalizada. */
export function claveDuplicado({ tipo, fecha_hora, monto, descripcion }) {
  const f = new Date(fecha_hora);
  const dia = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  return `${tipo}|${dia}|${Number(monto).toFixed(2)}|${sinAcentos(descripcion).replace(/\s+/g, ' ')}`;
}
