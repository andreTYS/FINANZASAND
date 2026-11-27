import { query } from '../../db/pool.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Diccionario base (palabra clave -> nombre de categoría global). Se usa si el historial no decide.
const PALABRAS = {
  gasto: {
    Transporte: ['taxi', 'uber', 'cabify', 'didi', 'indriver', 'bus', 'micro', 'metro', 'combi', 'pasaje', 'gasolina', 'grifo', 'combustible', 'peaje', 'estacionamiento', 'cochera', 'primax', 'repsol', 'pecsa'],
    Supermercado: ['supermercado', 'plaza vea', 'tottus', 'wong', 'metro super', 'vivanda', 'makro', 'mass', 'tambo', 'oxxo', 'mercado', 'bodega', 'minimarket', 'compras semana'],
    Comida: ['almuerzo', 'cena', 'desayuno', 'menu', 'restaurante', 'restaurant', 'pizza', 'pizzeria', 'pollo', 'polleria', 'chifa', 'cafe', 'starbucks', 'kfc', 'bembos', 'mcdonalds', 'burger', 'rappi', 'pedidosya', 'delivery', 'cevicheria', 'sanguche'],
    Vivienda: ['alquiler', 'renta', 'mantenimiento edificio', 'condominio', 'hipoteca', 'depto', 'departamento'],
    Servicios: ['luz', 'enel', 'luz del sur', 'agua', 'sedapal', 'internet', 'movistar', 'claro', 'entel', 'bitel', 'telefono', 'celular', 'gas', 'calidda', 'cable', 'netflix', 'spotify', 'disney', 'hbo', 'youtube premium', 'icloud', 'google one'],
    Salud: ['farmacia', 'inkafarma', 'mifarma', 'boticas', 'clinica', 'doctor', 'medico', 'consulta', 'dentista', 'laboratorio', 'seguro salud', 'eps', 'medicina'],
    Ocio: ['cine', 'cineplanet', 'cinemark', 'concierto', 'teatro', 'bar', 'discoteca', 'juego', 'steam', 'playstation', 'xbox', 'viaje', 'hotel', 'paseo'],
    Educación: ['curso', 'platzi', 'udemy', 'coursera', 'universidad', 'colegio', 'matricula', 'pension', 'libro', 'libreria', 'taller', 'diplomado'],
  },
  ingreso: {
    Sueldo: ['sueldo', 'salario', 'planilla', 'remuneracion', 'quincena', 'gratificacion', 'cts', 'bono'],
    Ventas: ['venta', 'ventas', 'cliente', 'freelance', 'proyecto', 'factura', 'honorarios', 'recibo por honorarios'],
  },
};

/**
 * Sugiere una categoría para un movimiento.
 * 1) Historial del usuario: misma contraparte (origen_destino) o misma descripción → categoría más usada.
 * 2) Palabras clave.
 * Devuelve { categoria_id, nombre, fuente, confianza } o null.
 */
export async function sugerirCategoria(usuarioId, { tipo, descripcion, origen_destino }, db = { query }) {
  if (tipo !== 'ingreso' && tipo !== 'gasto') return null;
  const desc = norm(descripcion);
  const orig = norm(origen_destino);
  if (!desc && !orig) return null;

  // 1) Historial: votos ponderados por coincidencia exacta de contraparte (peso 3) y descripción (peso 2)
  const { rows } = await db.query(
    `SELECT m.categoria_id, c.nombre,
            sum(CASE WHEN $3 <> '' AND lower(trim(m.origen_destino)) = $3 THEN 3 ELSE 0 END
              + CASE WHEN $4 <> '' AND lower(trim(m.descripcion)) = $4 THEN 2 ELSE 0 END) AS votos,
            count(*) AS n
     FROM movimientos m JOIN categorias c ON c.id = m.categoria_id
     WHERE m.usuario_id = $1 AND m.tipo = $2 AND m.categoria_id IS NOT NULL AND m.categoria_auto = false
       AND (($3 <> '' AND lower(trim(m.origen_destino)) = $3) OR ($4 <> '' AND lower(trim(m.descripcion)) = $4))
       AND (c.usuario_id IS NULL OR c.usuario_id = $1)
     GROUP BY 1, 2 ORDER BY votos DESC, n DESC LIMIT 2`,
    [usuarioId, tipo, String(origen_destino ?? '').trim().toLowerCase(), String(descripcion ?? '').trim().toLowerCase()],
  );
  if (rows[0]) {
    const total = rows.reduce((s, r) => s + Number(r.votos), 0);
    const confianza = Math.min(0.99, 0.6 + 0.4 * (Number(rows[0].votos) / total) * Math.min(1, Number(rows[0].n) / 2));
    return { categoria_id: rows[0].categoria_id, nombre: rows[0].nombre, fuente: 'historial', confianza: Math.round(confianza * 100) / 100 };
  }

  // 2) Palabras clave (sobre descripción + contraparte)
  const texto = ` ${desc} ${orig} `;
  let mejor = null;
  for (const [nombre, palabras] of Object.entries(PALABRAS[tipo])) {
    const hit = palabras.find((p) => texto.includes(` ${norm(p)} `) || (norm(p).length > 4 && texto.includes(norm(p))));
    if (hit && (!mejor || hit.length > mejor.hit.length)) mejor = { nombre, hit };
  }
  if (!mejor) return null;
  // Preferir categoría propia del usuario con el mismo nombre, si existe
  const cat = await db.query(
    `SELECT id, nombre FROM categorias WHERE lower(nombre) = lower($1) AND tipo = $2 AND (usuario_id IS NULL OR usuario_id = $3)
     ORDER BY usuario_id NULLS LAST LIMIT 1`,
    [mejor.nombre, tipo, usuarioId],
  );
  if (!cat.rows[0]) return null;
  return { categoria_id: cat.rows[0].id, nombre: cat.rows[0].nombre, fuente: 'palabra_clave', confianza: 0.7, palabra: mejor.hit };
}

export const UMBRAL_AUTO = 0.65;
