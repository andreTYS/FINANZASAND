import { useEffect, useState } from 'react';
import { useCategorias } from '../hooks/useCategorias';
import { Campo } from './ui';

export const filtrosVacios = { tipo: '', categoria_id: '', desde: '', hasta: '', q: '' };

export default function Filtros({ valor, onChange }) {
  const { data: cats = [] } = useCategorias();
  const [q, setQ] = useState(valor.q);
  // búsqueda con debounce
  useEffect(() => {
    const t = setTimeout(() => q !== valor.q && onChange({ ...valor, q }), 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => onChange({ ...valor, [k]: e.target.value });
  const activos = Object.values(valor).filter(Boolean).length;

  return (
    <div className="filtros">
      <Campo label="Buscar">
        <input className="input" placeholder="Descripción, comercio…" value={q} onChange={(e) => setQ(e.target.value)} />
      </Campo>
      <Campo label="Tipo">
        <select className="select" value={valor.tipo} onChange={set('tipo')}>
          <option value="">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
          <option value="prestamo_out,prestamo_in">Préstamos</option>
        </select>
      </Campo>
      <Campo label="Categoría">
        <select className="select" value={valor.categoria_id} onChange={set('categoria_id')}>
          <option value="">Todas</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </select>
      </Campo>
      <Campo label="Desde"><input type="date" className="input" value={valor.desde} onChange={set('desde')} /></Campo>
      <Campo label="Hasta"><input type="date" className="input" value={valor.hasta} onChange={set('hasta')} /></Campo>
      {activos > 0 && (
        <button className="btn btn-fantasma" onClick={() => { setQ(''); onChange(filtrosVacios); }}>Limpiar ({activos})</button>
      )}
    </div>
  );
}
