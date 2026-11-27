import { ArrowDownLeft, ArrowUpRight, HandCoins, Camera, FileUp, Sparkles, CloudOff } from 'lucide-react';
import { TIPOS, useDinero } from '../lib/formato';

const hora = (d) => new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export default function MovimientoItem({ m, onClick, conFecha = false }) {
  const din = useDinero();
  const t = TIPOS[m.tipo];
  const color = m.categoria_color || (m.tipo === 'ingreso' ? '#16a34a' : m.tipo === 'gasto' ? '#7c3aed' : '#ca8a04');
  const IconoTipo = m.tipo.startsWith('prestamo') ? HandCoins : m.tipo === 'ingreso' ? ArrowDownLeft : ArrowUpRight;
  const cuando = conFecha
    ? new Date(m.fecha_hora).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) + ' · ' + hora(m.fecha_hora)
    : hora(m.fecha_hora);
  return (
    <div className={`item ${onClick ? 'clicable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}>
      <div className="avatar" style={{ background: `${color}17`, color }}>{m.categoria_icono || <IconoTipo />}</div>
      <div className="cuerpo">
        <div className="principal-txt">{m.descripcion || m.origen_destino || m.categoria_nombre || t.etiqueta}</div>
        <div className="secundario-txt" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span>{cuando}</span>·<span>{m.categoria_nombre || (m.pendiente ? 'Se categoriza al sincronizar' : 'Sin categoría')}</span>
          {m.categoria_auto && <span className="auto-chip" title="Categoría asignada automáticamente"><Sparkles />auto</span>}
          {m.origen_destino && m.descripcion && <>·<span>{m.origen_destino}</span></>}
          {m.created_via === 'scan' && <Camera size={12} aria-label="Escaneado" />}
          {m.created_via === 'import' && <FileUp size={12} aria-label="Importado" />}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={`monto num ${t.clase}`}>{t.signo} {din(m.monto)}</div>
        {m.pendiente && <span className={`badge ${m.error ? 'badge-rojo' : 'badge-pendiente'}`}><CloudOff size={11} />{m.error ? 'Error' : 'Pendiente'}</span>}
      </div>
    </div>
  );
}
