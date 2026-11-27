import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Wallet, ArrowDownLeft, ArrowUpRight, PiggyBank, HandCoins, Landmark, AlertTriangle, ChevronRight } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useMovimientos } from '../hooks/useMovimientos';
import { usePrestamos } from '../hooks/usePrestamos';
import { useSesion } from '../store/sesion';
import { Card, Kpi, SinDatosOffline, ErrorMsg, Vacio, Cabecera, Tendencia, TooltipGrafico, MesNav, Skeleton } from '../components/ui';
import MovimientoItem from '../components/MovimientoItem';
import { agruparPorDia } from '../lib/agrupar';
import { mesActual, nombreMes, useDinero, fecha, ESTADOS_PRESTAMO } from '../lib/formato';

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const compacto = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : v);

export default function Dashboard() {
  const [mes, setMes] = useState(mesActual());
  const { data: d, isLoading, error } = useDashboard({ mes, meses: 6 });
  const { data: recientes } = useMovimientos({ limit: 7 });
  const { data: prestamos = [] } = usePrestamos({ estado: 'abiertos' });
  const usuario = useSesion((s) => s.usuario);
  const din = useDinero();
  const nav = useNavigate();

  if (error && !d) return <ErrorMsg error={error} />;
  const cabecera = (
    <Cabecera saludo={`${saludo()}, ${usuario?.nombre || ''} 👋`} titulo="Tu panel">
      <MesNav valor={mes} onChange={setMes} max={mesActual()} />
    </Cabecera>
  );
  if (!d && !isLoading) return <>{cabecera}<SinDatosOffline /></>;
  if (isLoading) {
    return (
      <>
        {cabecera}
        <Skeleton alto={170} style={{ borderRadius: 20 }} />
        <div className="grid grid-kpi" style={{ marginTop: 16 }}>{[1, 2, 3, 4].map((i) => <Skeleton key={i} alto={128} style={{ borderRadius: 20 }} />)}</div>
      </>
    );
  }

  const maxCat = Math.max(1, ...d.top_categorias.map((c) => c.total));
  const totalCat = d.top_categorias.reduce((s, c) => s + c.total, 0);
  const ahorro = d.mes.ingresos ? (d.mes.neto / d.mes.ingresos) * 100 : null;

  return (
    <>
      {cabecera}

      <section className="hero">
        <div>
          <div className="etiqueta"><Wallet size={18} /> Balance disponible</div>
          <div className="monto-grande num">{din(d.balance)}</div>
          <div className="nota">Incluye préstamos dados/recibidos y sus abonos</div>
        </div>
        <div className="hero-mini">
          <div><div className="t"><HandCoins size={14} /> Me deben</div><div className="v num">{din(d.prestamos.por_cobrar)}</div></div>
          <div><div className="t"><Landmark size={14} /> Debo</div><div className="v num">{din(d.prestamos.por_pagar)}</div></div>
        </div>
      </section>

      <div className="grid grid-kpi" style={{ marginTop: 16 }}>
        <Kpi etiqueta="Ingresos del mes" valor={din(d.mes.ingresos)} clase="positivo" icono={ArrowDownLeft} chip="verde"
          tendencia={<Tendencia actual={d.mes.ingresos} anterior={d.mes.ingresos_mes_anterior} />} />
        <Kpi etiqueta="Gastos del mes" valor={din(d.mes.gastos)} clase="negativo" icono={ArrowUpRight} chip="rojo"
          tendencia={<Tendencia actual={d.mes.gastos} anterior={d.mes.gastos_mes_anterior} invertir />} />
        <Kpi etiqueta="Neto del mes" valor={din(d.mes.neto)} clase={d.mes.neto >= 0 ? 'positivo' : 'negativo'} icono={Wallet} chip="azul"
          detalle={`${d.mes.num_movimientos} movimientos`} />
        <Kpi etiqueta="Tasa de ahorro" valor={ahorro == null ? '—' : `${ahorro.toFixed(0)}%`} icono={PiggyBank} chip="morado"
          clase={ahorro == null ? '' : ahorro >= 20 ? 'positivo' : ahorro >= 0 ? 'pendiente' : 'negativo'}
          detalle={ahorro == null ? 'Sin ingresos este mes' : ahorro >= 20 ? '¡Muy bien! Meta ≥ 20%' : 'Meta recomendada: 20%'} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card titulo="Flujo de caja" sub="Últimos 6 meses" accion={
          <div className="leyenda">
            <span><span className="punto" style={{ background: '#22c55e' }} />Ingresos</span>
            <span><span className="punto" style={{ background: '#8b5cf6' }} />Gastos</span>
            <span><span className="punto" style={{ background: '#2563eb' }} />Neto</span>
          </div>
        }>
          <div style={{ height: 290 }}>
            <ResponsiveContainer>
              <ComposedChart data={d.flujo_caja.map((r) => ({ ...r, etiqueta: nombreMes(r.mes) }))} margin={{ left: -12, right: 4, top: 8 }} barGap={4} barCategoryGap="28%">
                <defs>
                  <linearGradient id="barIng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c55e" /><stop offset="1" stopColor="#16a34a" stopOpacity={0.85} /></linearGradient>
                  <linearGradient id="barGas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#eeeef5" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={compacto} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(124,58,237,.06)', radius: 8 }} content={<TooltipGrafico formato={din} />} />
                <Bar dataKey="ingresos" name="Ingresos" fill="url(#barIng)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                <Bar dataKey="gastos" name="Gastos" fill="url(#barGas)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                <Line dataKey="neto" name="Neto" type="monotone" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2.5 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card titulo="¿En qué gastas?" sub="Top 5 categorías del mes">
          {d.top_categorias.length === 0 ? <Vacio emoji="🧾">Sin gastos este mes</Vacio> : (
            <div style={{ display: 'grid', gap: 16 }}>
              {d.top_categorias.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="icono-chip" style={{ background: `${c.color}17`, color: c.color, fontSize: 18 }}>{c.icono || '•'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6, gap: 8 }}>
                      <span style={{ fontWeight: 500 }}>{c.nombre}</span>
                      <span><strong className="num">{din(c.total)}</strong> <span className="suave num" style={{ fontSize: 12 }}>{((c.total / totalCat) * 100).toFixed(0)}%</span></span>
                    </div>
                    {c.presupuesto ? (
                      <>
                        <div className="barra-progreso"><div style={{ width: `${Math.min(100, (c.total / c.presupuesto) * 100)}%`, background: c.total > c.presupuesto ? 'var(--rojo-500)' : c.total >= c.presupuesto * 0.8 ? 'var(--amarillo-400)' : c.color }} /></div>
                        <div className="suave" style={{ fontSize: 11, marginTop: 4 }}>
                          {c.total > c.presupuesto ? `Excedido por ${din(c.total - c.presupuesto)}` : `Quedan ${din(c.presupuesto - c.total)} de ${din(c.presupuesto)}`}
                        </div>
                      </>
                    ) : (
                      <div className="barra-progreso"><div style={{ width: `${(c.total / maxCat) * 100}%`, background: c.color }} /></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card titulo="Últimos movimientos" accion={<Link to="/registro" className="btn btn-fantasma btn-sm">Ver todo <ChevronRight /></Link>}>
          {recientes?.items?.length ? (
            <div className="lista">
              {agruparPorDia(recientes.items).map((g) => (
                <div key={g.clave}>
                  <div className="dia-grupo"><span>{g.etiqueta}</span></div>
                  {g.items.map((m) => <MovimientoItem key={m.id} m={m} />)}
                </div>
              ))}
            </div>
          ) : <Vacio emoji="✍️">Aún no registras movimientos</Vacio>}
        </Card>

        <Card titulo="Préstamos abiertos" sub={`${prestamos.length} pendiente(s)`} accion={<Link to="/prestamos" className="btn btn-fantasma btn-sm">Gestionar <ChevronRight /></Link>}>
          {d.prestamos.vencidos > 0 && (
            <div className="alerta alerta-error" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> {d.prestamos.vencidos} préstamo(s) vencido(s)
            </div>
          )}
          <div className="lista">
            {prestamos.slice(0, 5).map((p) => {
              const pct = p.monto_original ? (p.pagado / p.monto_original) * 100 : 0;
              const est = p.vencido ? { etiqueta: 'Vencido', badge: 'badge-rojo' } : ESTADOS_PRESTAMO[p.estado];
              return (
                <div key={p.id} className="item clicable" onClick={() => nav(`/prestamos?id=${p.id}`)}>
                  <div className={`icono-chip ${p.tipo === 'prestamo_out' ? 'chip-amarillo' : 'chip-azul'}`}>
                    {p.tipo === 'prestamo_out' ? <HandCoins /> : <Landmark />}
                  </div>
                  <div className="cuerpo">
                    <div className="principal-txt">{p.persona_lugar}</div>
                    <div className="secundario-txt">{p.tipo === 'prestamo_out' ? 'Me debe' : 'Le debo'} · {p.fecha_limite ? `vence ${fecha(p.fecha_limite + 'T12:00', { day: 'numeric', month: 'short' })}` : 'sin fecha límite'}</div>
                    <div className="barra-progreso" style={{ marginTop: 6, height: 6 }}><div style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="monto num">{din(p.saldo_pendiente)}</div>
                    <span className={`badge ${est.badge}`}>{est.etiqueta}</span>
                  </div>
                </div>
              );
            })}
            {!prestamos.length && <Vacio emoji="🤝">Sin préstamos abiertos</Vacio>}
          </div>
        </Card>
      </div>
    </>
  );
}
