import { useEffect } from 'react';
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUi } from '../store/ui';

export function Card({ titulo, sub, accion, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(titulo || accion) && (
        <div className="card-titulo">
          {titulo && <div><h3>{titulo}</h3>{sub && <div className="sub">{sub}</div>}</div>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, detalle, destacado, clase = '', icono: Icono, chip = 'morado', tendencia }) {
  return (
    <div className={`card kpi ${destacado ? 'destacado' : ''}`}>
      <div className="kpi-top">
        <div className="etiqueta">{etiqueta}</div>
        {Icono && <div className={`icono-chip chip-${chip}`}><Icono /></div>}
      </div>
      <div className={`valor num ${clase}`}>{valor}</div>
      {tendencia}
      {detalle && <div className="detalle">{detalle}</div>}
    </div>
  );
}

/** Píldora de variación vs periodo anterior. invertir=true cuando subir es malo (gastos). */
export function Tendencia({ actual, anterior, invertir = false }) {
  if (!anterior) return <span className="tendencia neutra">Sin datos del mes anterior</span>;
  const v = ((actual - anterior) / anterior) * 100;
  const sube = v >= 0;
  const buena = invertir ? !sube : sube;
  return (
    <span className={`tendencia ${Math.abs(v) < 1 ? 'neutra' : buena ? 'buena' : 'mala'}`}>
      {sube ? <TrendingUp /> : <TrendingDown />}{Math.abs(v).toFixed(0)}% vs mes anterior
    </span>
  );
}

/** Tooltip de Recharts con el estilo del design system. */
export function TooltipGrafico({ active, payload, label, formato, etiqueta }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-graf">
      <div className="titulo">{etiqueta ? etiqueta(label) : label}</div>
      {payload.map((p) => (
        <div className="fila" key={p.dataKey}>
          <span><span className="punto" style={{ background: p.color || p.payload?.color }} />{p.name}</span>
          <strong className="num">{formato ? formato(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Selector de mes con flechas y etiqueta en español. valor = 'YYYY-MM' */
export function MesNav({ valor, onChange, max }) {
  const [y, m] = valor.split('-').map(Number);
  const mover = (d) => { const f = new Date(y, m - 1 + d, 1); onChange(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`); };
  const nombre = new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long' });
  const etiqueta = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
  return (
    <div className="mes-nav">
      <button onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
      <span>{etiqueta}</span>
      <button onClick={() => mover(1)} disabled={max && valor >= max} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
    </div>
  );
}

export function Skeleton({ alto = 16, ancho = '100%', style }) {
  return <div className="skeleton" style={{ height: alto, width: ancho, ...style }} />;
}

export function Campo({ label, error, ayuda, children, className = '' }) {
  return (
    <div className={`campo ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="error-campo">{error}</span> : ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </div>
  );
}

export function Segmentado({ opciones, valor, onChange }) {
  return (
    <div className="segmentado" role="tablist">
      {opciones.map((o) => (
        <button type="button" key={o.valor} role="tab" aria-selected={valor === o.valor}
          className={`${valor === o.valor ? 'activo' : ''} ${o.valor}`} onClick={() => onChange(o.valor)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titulo, onClose, children }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', f);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', f); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="modal-capa" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabecera">
          <h2>{titulo}</h2>
          <button className="btn btn-fantasma btn-icono" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Cargando = () => <div className="cargando"><div className="spinner" /></div>;
export const Vacio = ({ emoji = '🗂️', children }) => <div className="vacio"><span className="emoji">{emoji}</span>{children}</div>;
export const ErrorMsg = ({ error }) => (error ? <div className="alerta alerta-error">{error.message || String(error)}</div> : null);

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}
    </div>
  );
}

export function Cabecera({ titulo, subtitulo, saludo, children }) {
  return (
    <div className="cabecera">
      <div>
        {saludo && <div className="saludo">{saludo}</div>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="suave">{subtitulo}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}
