import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useDashboard } from '../hooks/useDashboard';
import { useMovimientos } from '../hooks/useMovimientos';
import { usePrestamos } from '../hooks/usePrestamos';
import { Card, Kpi, Cargando, ErrorMsg, Vacio, Cabecera } from '../components/ui';
import MovimientoItem from '../components/MovimientoItem';
import { mesActual, nombreMes, useDinero, fecha, ESTADOS_PRESTAMO } from '../lib/formato';

function variacion(actual, anterior) {
  if (!anterior) return null;
  const v = ((actual - anterior) / anterior) * 100;
  return `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(0)}% vs mes anterior`;
}

export default function Dashboard() {
  const [mes, setMes] = useState(mesActual());
  const { data: d, isLoading, error } = useDashboard({ mes, meses: 6 });
  const { data: recientes } = useMovimientos({ limit: 6 });
  const { data: prestamos = [] } = usePrestamos({ estado: 'abiertos' });
  const din = useDinero();
  const nav = useNavigate();

  if (isLoading) return <Cargando />;
  if (error) return <ErrorMsg error={error} />;
  const maxCat = Math.max(1, ...d.top_categorias.map((c) => c.total));

  return (
    <>
      <Cabecera titulo="Panel" subtitulo="Tu resumen financiero">
        <input type="month" className="input" style={{ width: 170 }} value={mes} max={mesActual()} onChange={(e) => setMes(e.target.value || mesActual())} aria-label="Mes" />
      </Cabecera>

      <div className="grid grid-kpi">
        <Kpi destacado etiqueta="Balance disponible" valor={din(d.balance)} detalle="Incluye préstamos y abonos" />
        <Kpi etiqueta="Ingresos del mes" valor={din(d.mes.ingresos)} clase="positivo" detalle={variacion(d.mes.ingresos, d.mes.ingresos_mes_anterior)} />
        <Kpi etiqueta="Gastos del mes" valor={din(d.mes.gastos)} clase="negativo" detalle={variacion(d.mes.gastos, d.mes.gastos_mes_anterior)} />
        <Kpi etiqueta="Neto del mes" valor={din(d.mes.neto)} clase={d.mes.neto >= 0 ? 'positivo' : 'negativo'} detalle={`${d.mes.num_movimientos} movimientos`} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card titulo="Flujo de caja (6 meses)">
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={d.flujo_caja.map((r) => ({ ...r, mes: nombreMes(r.mes) }))} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip formatter={(v) => din(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                <Line dataKey="neto" name="Neto" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card titulo="Top categorías de gasto">
          {d.top_categorias.length === 0 ? <Vacio emoji="🧾">Sin gastos este mes</Vacio> : (
            <div style={{ display: 'grid', gap: 14 }}>
              {d.top_categorias.map((c) => (
                <div key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                    <span>{c.icono} {c.nombre}</span><strong className="num">{din(c.total)}</strong>
                  </div>
                  <div className="barra-progreso"><div style={{ width: `${(c.total / maxCat) * 100}%`, background: c.color }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card titulo="Últimos movimientos" accion={<Link to="/registro" className="btn btn-fantasma btn-sm">Ver todo →</Link>}>
          {recientes?.items?.length ? (
            <div className="lista">{recientes.items.map((m) => <MovimientoItem key={m.id} m={m} />)}</div>
          ) : <Vacio emoji="✍️">Aún no registras movimientos</Vacio>}
        </Card>

        <Card titulo="Préstamos pendientes" accion={<Link to="/prestamos" className="btn btn-fantasma btn-sm">Gestionar →</Link>}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            <div className="alerta alerta-pendiente"><div style={{ fontSize: 12 }}>Me deben</div><strong className="num">{din(d.prestamos.por_cobrar)}</strong></div>
            <div className="alerta alerta-info"><div style={{ fontSize: 12 }}>Debo</div><strong className="num">{din(d.prestamos.por_pagar)}</strong></div>
          </div>
          {d.prestamos.vencidos > 0 && <div className="alerta alerta-error" style={{ marginBottom: 12 }}>⚠️ {d.prestamos.vencidos} préstamo(s) vencido(s)</div>}
          <div className="lista">
            {prestamos.slice(0, 5).map((p) => (
              <div key={p.id} className="item clicable" onClick={() => nav(`/prestamos?id=${p.id}`)}>
                <div className="cuerpo">
                  <div className="principal-txt">{p.tipo === 'prestamo_out' ? '→ ' : '← '}{p.persona_lugar}</div>
                  <div className="secundario-txt">{p.fecha_limite ? `Vence ${fecha(p.fecha_limite + 'T12:00')}` : 'Sin fecha límite'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="monto num">{din(p.saldo_pendiente)}</div>
                  <span className={`badge ${p.vencido ? 'badge-rojo' : ESTADOS_PRESTAMO[p.estado].badge}`}>{p.vencido ? 'Vencido' : ESTADOS_PRESTAMO[p.estado].etiqueta}</span>
                </div>
              </div>
            ))}
            {!prestamos.length && <Vacio emoji="🤝">Sin préstamos abiertos</Vacio>}
          </div>
        </Card>
      </div>
    </>
  );
}
