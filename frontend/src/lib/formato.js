import { useUi } from '../store/ui';

const cache = {};
export function dinero(n, moneda = useUi.getState().moneda) {
  const k = moneda;
  cache[k] ||= new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, minimumFractionDigits: 2 });
  return cache[k].format(Number(n) || 0);
}
export const useDinero = () => {
  const moneda = useUi((s) => s.moneda);
  return (n) => dinero(n, moneda);
};

export const fecha = (d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  new Date(d).toLocaleDateString('es-PE', opts);
export const fechaHora = (d) =>
  new Date(d).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const pad = (n) => String(n).padStart(2, '0');
/** Date -> valor para <input type="datetime-local"> en hora local */
export const aInputFechaHora = (d = new Date()) => {
  const f = new Date(d);
  return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T${pad(f.getHours())}:${pad(f.getMinutes())}`;
};
export const aInputFecha = (d = new Date()) => aInputFechaHora(d).slice(0, 10);
export const mesActual = () => aInputFecha().slice(0, 7);
export const nombreMes = (yyyymm) => {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
};

export const TIPOS = {
  ingreso: { etiqueta: 'Ingreso', signo: '+', clase: 'positivo', badge: 'badge-verde' },
  gasto: { etiqueta: 'Gasto', signo: '−', clase: 'negativo', badge: 'badge-rojo' },
  prestamo_out: { etiqueta: 'Préstamo dado', signo: '−', clase: 'pendiente', badge: 'badge-amarillo' },
  prestamo_in: { etiqueta: 'Préstamo recibido', signo: '+', clase: 'pendiente', badge: 'badge-azul' },
};
export const ESTADOS_PRESTAMO = {
  pendiente: { etiqueta: 'Pendiente', badge: 'badge-amarillo' },
  pagado_parcial: { etiqueta: 'Pago parcial', badge: 'badge-azul' },
  pagado_cobrado: { etiqueta: 'Saldado', badge: 'badge-verde' },
};
