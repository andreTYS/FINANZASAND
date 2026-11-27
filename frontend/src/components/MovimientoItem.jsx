import { TIPOS, fechaHora, useDinero } from '../lib/formato';

export default function MovimientoItem({ m, onClick }) {
  const din = useDinero();
  const t = TIPOS[m.tipo];
  const color = m.categoria_color || (m.tipo === 'ingreso' ? '#16a34a' : m.tipo === 'gasto' ? '#7c3aed' : '#ca8a04');
  return (
    <div className={`item ${onClick ? 'clicable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}>
      <div className="avatar" style={{ background: `${color}1a`, color }}>{m.categoria_icono || (m.tipo.startsWith('prestamo') ? '🤝' : m.tipo === 'ingreso' ? '↘' : '↗')}</div>
      <div className="cuerpo">
        <div className="principal-txt">{m.descripcion || m.origen_destino || m.categoria_nombre || t.etiqueta}</div>
        <div className="secundario-txt">
          {fechaHora(m.fecha_hora)} · {m.categoria_nombre || 'Sin categoría'}
          {m.origen_destino && m.descripcion ? ` · ${m.origen_destino}` : ''}
          {m.created_via === 'scan' && ' · 📷'}{m.created_via === 'import' && ' · ⇪'}
        </div>
      </div>
      <div className={`monto num ${t.clase}`}>{t.signo} {din(m.monto)}</div>
    </div>
  );
}
