import { useSesion } from '../store/sesion';

export class ApiError extends Error {
  constructor(status, mensaje, detalles) { super(mensaje); this.status = status; this.detalles = detalles; }
}

let refrescando = null;

/** Pide un nuevo access token usando la cookie httpOnly. Deduplica llamadas concurrentes. */
export function refrescarSesion() {
  if (!refrescando) {
    refrescando = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new ApiError(r.status, 'Sesión expirada');
        const d = await r.json();
        useSesion.getState().iniciar(d);
        return d.accessToken;
      })
      .finally(() => { refrescando = null; });
  }
  return refrescando;
}

async function bruto(ruta, opts, token) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = opts.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  return fetch(`/api${ruta}`, { ...opts, headers, body, credentials: 'same-origin' });
}

/** fetch autenticado con reintento automático tras refrescar el token. */
export async function api(ruta, opts = {}) {
  let r = await bruto(ruta, opts, useSesion.getState().accessToken);
  if (r.status === 401 && !ruta.startsWith('/auth/')) {
    try {
      const t = await refrescarSesion();
      r = await bruto(ruta, opts, t);
    } catch {
      useSesion.getState().cerrar();
      throw new ApiError(401, 'Tu sesión expiró, vuelve a iniciar sesión');
    }
  }
  if (opts.crudo) {
    if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error || 'Error');
    return r;
  }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || `Error ${r.status}`, data.detalles);
  return data;
}

/** Descarga un archivo autenticado (export) y dispara el guardado. */
export async function descargar(ruta, nombrePorDefecto) {
  const r = await api(ruta, { crudo: true });
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const nombre = cd.match(/filename="([^"]+)"/)?.[1] || nombrePorDefecto;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, Array.isArray(v) ? v.join(',') : v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
