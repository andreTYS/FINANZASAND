/** Agrupa movimientos por día local con etiqueta Hoy / Ayer / fecha. */
export function agruparPorDia(items) {
  const clave = (d) => { const f = new Date(d); return `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`; };
  const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const grupos = [];
  for (const m of items) {
    const k = clave(m.fecha_hora);
    let g = grupos[grupos.length - 1];
    if (!g || g.clave !== k) {
      const f = new Date(m.fecha_hora);
      const etiqueta = k === clave(hoy) ? 'Hoy' : k === clave(ayer) ? 'Ayer'
        : f.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', ...(f.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) });
      g = { clave: k, etiqueta, items: [], neto: 0 };
      grupos.push(g);
    }
    g.items.push(m);
    g.neto += m.tipo === 'ingreso' ? m.monto : m.tipo === 'gasto' ? -m.monto : 0;
  }
  return grupos;
}
