import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ReceiptText, PieChart, CalendarClock, CalendarX, CheckCheck } from 'lucide-react';
import { useAlertas, useMarcarAlertas } from '../hooks/useAlertas';
import { useUi } from '../store/ui';
import { fechaHora } from '../lib/formato';

const ICONOS = {
  gasto_grande: [ReceiptText, 'chip-rojo'],
  presupuesto_80: [PieChart, 'chip-amarillo'],
  presupuesto_excedido: [PieChart, 'chip-rojo'],
  prestamo_por_vencer: [CalendarClock, 'chip-amarillo'],
  prestamo_vencido: [CalendarX, 'chip-rojo'],
};

/** Campana con contador y panel desplegable de alertas. */
export default function Alertas({ avisos = false }) {
  const { data } = useAlertas();
  const marcar = useMarcarAlertas();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  const toast = useUi((s) => s.toast);
  const vistas = useRef(null);

  // Aviso tipo toast cuando llega una alerta nueva mientras la app está abierta
  useEffect(() => {
    if (!data || !avisos) return;
    const ids = new Set(data.items.map((a) => a.id));
    if (vistas.current) data.items.filter((a) => !vistas.current.has(a.id) && !a.leida_at).slice(0, 2).forEach((a) => toast(`🔔 ${a.titulo}`, 'aviso'));
    vistas.current = ids;
  }, [data, toast, avisos]);

  useEffect(() => {
    if (!abierto) return undefined;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [abierto]);

  const n = data?.no_leidas || 0;
  const abrirAlerta = (a) => {
    if (!a.leida_at) marcar.mutate(a.id);
    setAbierto(false);
    if (a.datos?.prestamo_id) nav(`/prestamos?id=${a.datos.prestamo_id}`);
    else if (a.tipo.startsWith('presupuesto')) nav('/metricas');
    else nav('/registro');
  };

  return (
    <div className="alertas-wrap" ref={ref}>
      <button className="btn btn-fantasma btn-icono campana" onClick={() => setAbierto(!abierto)} aria-label={`Alertas${n ? ` (${n} sin leer)` : ''}`}>
        <Bell />{n > 0 && <span className="contador">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierto && (
        <div className="panel-alertas" role="dialog" aria-label="Alertas">
          <div className="panel-alertas-cab">
            <strong>Alertas</strong>
            {n > 0 && <button className="btn btn-fantasma btn-sm" onClick={() => marcar.mutate(null)}><CheckCheck /> Marcar leídas</button>}
          </div>
          <div className="panel-alertas-lista">
            {!data?.items.length && <div className="vacio" style={{ padding: 24 }}><span className="emoji">🔕</span>Sin alertas por ahora</div>}
            {data?.items.map((a) => {
              const [Icono, chip] = ICONOS[a.tipo] || [Bell, 'chip-morado'];
              return (
                <button key={a.id} className={`alerta-item ${a.leida_at ? '' : 'nueva'}`} onClick={() => abrirAlerta(a)}>
                  <div className={`icono-chip ${chip}`}><Icono /></div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div className="t">{a.titulo}</div>
                    <div className="m">{a.mensaje}</div>
                    <div className="f">{fechaHora(a.created_at)}{a.estado_envio === 'enviado' && ' · enviada a n8n'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
