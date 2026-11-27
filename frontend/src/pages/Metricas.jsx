import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { useMetricas } from '../hooks/useDashboard';
import { Card, Kpi, Cargando, ErrorMsg, Vacio, Cabecera, Segmentado, TooltipGrafico } from '../components/ui';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Receipt } from 'lucide-react';
import { useDinero, aInputFecha } from '../lib/formato';

const compacto = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : v);
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const rangoPreset = (p) => {
  const h = new Date();
  const d = new Date(h);
  if (p === 'mes') d.setDate(1);
  else if (p === '30') d.setDate(h.getDate() - 29);
  else if (p === '90') d.setDate(h.getDate() - 89);
  else if (p === 'anio') { d.setMonth(0); d.setDate(1); }
  return { desde: aInputFecha(d), hasta: aInputFecha(h) };
};

export default function Metricas() {
  const [preset, setPreset] = useState('mes');
  const [rango, setRango] = useState(rangoPreset('mes'));
  const [tipoCat, setTipoCat] = useState('gasto');
  const { data, isLoading, error } = useMetricas(rango);
  const din = useDinero();
  const elegir = (p) => { setPreset(p); if (p !== 'custom') setRango(rangoPreset(p)); };

  const porCat = useMemo(() => (data?.por_categoria || []).filter((c) => c.tipo === tipoCat), [data, tipoCat]);
  const totalCat = porCat.reduce((s, c) => s + c.total, 0);
  const porDia = DIAS.map((n, i) => ({ dia: n, total: data?.por_dia_semana.find((d) => d.dia === i + 1)?.total || 0 }));

  return (
    <>
      <Cabecera titulo="Métricas" subtitulo="Analiza en qué se va tu dinero" />
      <Card style={{ marginBottom: 16 }}>
        <div className="filtros">
          <Segmentado valor={preset} onChange={elegir} opciones={[
            { valor: 'mes', etiqueta: 'Este mes' }, { valor: '30', etiqueta: '30 días' }, { valor: '90', etiqueta: '90 días' },
            { valor: 'anio', etiqueta: 'Este año' }, { valor: 'custom', etiqueta: 'Personalizado' }]} />
          {preset === 'custom' && (
            <>
              <input type="date" className="input" value={rango.desde} max={rango.hasta} onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })} aria-label="Desde" />
              <input type="date" className="input" value={rango.hasta} min={rango.desde} onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })} aria-label="Hasta" />
            </>
          )}
        </div>
      </Card>

      {isLoading ? <Cargando /> : error ? <ErrorMsg error={error} /> : (
        <>
          <div className="grid grid-kpi">
            <Kpi etiqueta="Ingresos" valor={din(data.totales.ingresos)} clase="positivo" icono={ArrowDownLeft} chip="verde" />
            <Kpi etiqueta="Gastos" valor={din(data.totales.gastos)} clase="negativo" icono={ArrowUpRight} chip="rojo" />
            <Kpi icono={PiggyBank} chip="morado" etiqueta="Ahorro" valor={din(data.totales.ingresos - data.totales.gastos)}
              detalle={data.totales.ingresos ? `${(((data.totales.ingresos - data.totales.gastos) / data.totales.ingresos) * 100).toFixed(0)}% de tus ingresos` : null} />
            <Kpi icono={Receipt} chip="azul" etiqueta="Gasto promedio" valor={din(data.totales.ticket_promedio)} detalle={`Mayor: ${din(data.totales.gasto_mayor)}`} />
          </div>

          <div className="grid grid-igual" style={{ marginTop: 16 }}>
            <Card titulo="Por categoría" accion={<Segmentado valor={tipoCat} onChange={setTipoCat} opciones={[{ valor: 'gasto', etiqueta: 'Gastos' }, { valor: 'ingreso', etiqueta: 'Ingresos' }]} />}>
              {porCat.length === 0 ? <Vacio emoji="🥧">Sin datos en este rango</Vacio> : (
                <>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={porCat} dataKey="total" nameKey="nombre" innerRadius={62} outerRadius={95} paddingAngle={3} cornerRadius={6} stroke="none" isAnimationActive={false}>
                          {porCat.map((c) => <Cell key={c.nombre} fill={c.color} />)}
                        </Pie>
                        <Tooltip content={<TooltipGrafico formato={din} />} cursor={{ fill: 'rgba(124,58,237,.06)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="lista">
                    {porCat.map((c) => (
                      <div key={c.nombre} className="item" style={{ padding: '8px 4px' }}>
                        <span className="punto" style={{ background: c.color }} />
                        <div className="cuerpo">{c.nombre} <span className="suave" style={{ fontSize: 12 }}>· {c.n}</span></div>
                        <span className="suave num" style={{ fontSize: 12 }}>{((c.total / totalCat) * 100).toFixed(0)}%</span>
                        <strong className="num">{din(c.total)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
            <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              <Card titulo="Evolución diaria">
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <AreaChart data={data.diario} margin={{ left: -10, right: 8 }}>
                      <defs>
                        <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity={0.35} /><stop offset="1" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c3aed" stopOpacity={0.35} /><stop offset="1" stopColor="#7c3aed" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="#eeeef5" vertical={false} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(f) => f.slice(8) + '/' + f.slice(5, 7)} minTickGap={16} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={compacto} />
                      <Tooltip content={<TooltipGrafico formato={din} etiqueta={(f) => new Date(f + 'T12:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })} />} />
                      <Area dataKey="ingresos" name="Ingresos" stroke="#16a34a" fill="url(#gI)" strokeWidth={2} />
                      <Area dataKey="gastos" name="Gastos" stroke="#7c3aed" fill="url(#gG)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card titulo="Gasto por día de la semana">
                <div style={{ height: 180 }}>
                  <ResponsiveContainer>
                    <BarChart data={porDia} margin={{ left: -10, right: 8 }}>
                      <defs><linearGradient id="gBarDia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#60a5fa" /><stop offset="1" stopColor="#2563eb" /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="#eeeef5" vertical={false} />
                      <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={compacto} />
                      <Tooltip content={<TooltipGrafico formato={din} />} cursor={{ fill: 'rgba(124,58,237,.06)' }} />
                      <Bar dataKey="total" name="Gasto" fill="url(#gBarDia)" radius={[8, 8, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
