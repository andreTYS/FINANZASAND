import { useEffect } from 'react';
import { useUi } from '../store/ui';

export function Card({ titulo, accion, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(titulo || accion) && (
        <div className="card-titulo">
          {titulo && <h3>{titulo}</h3>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, detalle, destacado, clase = '' }) {
  return (
    <div className={`card kpi ${destacado ? 'destacado' : ''}`}>
      <div className="etiqueta">{etiqueta}</div>
      <div className={`valor num ${clase}`}>{valor}</div>
      {detalle && <div className="detalle">{detalle}</div>}
    </div>
  );
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

export function Cabecera({ titulo, subtitulo, children }) {
  return (
    <div className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="suave">{subtitulo}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}
