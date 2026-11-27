import { useSesion } from '../store/sesion';

export class ApiError extends Error {
  constructor(status, mensaje, detalles) { super(mensaje); this.status = status; this.detalles = detalles; }
  get sinConexion() { return this.status === 0; }
}

const errorRed = () => new ApiError(0, 'Sin conexión. Inténtalo cuando vuelvas a estar en línea.');
const USUARIO_KEY = 'sesion_usuario';
export const usuarioGuardado = () => { try { return JSON.parse(localStorage.getItem(USUARIO_KEY)); } catch { return null; } };
export const guardarUsuario = (u) => { try { u ? localStorage.setItem(USUARIO_KEY, JSON.stringify(u)) : localStorage.removeItem(USUARIO_KEY); } catch { /* sin storage */ } };

let refrescando = null;

/**
 * Pide un nuevo access token usando la cookie httpOnly. Deduplica llamadas concurrentes.
 * Sin red: lanza ApiError(0) sin cerrar la sesión (modo offline).
 */
export function refrescarSesion() {
  if (!refrescando) {
    refrescando = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .catch(() => { throw errorRed(); })
      .then(async (r) => {
        if (r.status >= 500) throw errorRed(); // backend caído = como sin conexión
        if (!r.ok) throw new ApiError(r.status, 'Sesión expirada');
        const d = await r.json();
        guardarUsuario(d.usuario);
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
  try {
    return await fetch(`/api${ruta}`, { ...opts, headers, body, credentials: 'same-origin' });
  } catch {
    throw errorRed();
  }
}

/** fetch autenticado con reintento automático tras refrescar el token. */
export async function api(ruta, opts = {}) {
  let r = await bruto(ruta, opts, useSesion.getState().accessToken);
  if (r.status === 401 && !ruta.startsWith('/auth/')) {
    let t;
    try {
      t = await refrescarSesion();
    } catch (e) {
      if (e.sinConexion) throw e; // sin red: la sesión offline sigue viva
      useSesion.getState().cerrar();
      throw new ApiError(401, 'Tu sesión expiró, vuelve a iniciar sesión');
    }
    r = await bruto(ruta, opts, t);
  }
  if (r.status === 502 || r.status === 503 || r.status === 504) {
    // Proxy sin backend: lo tratamos como falta de conexión
    const data = await r.clone().json().catch(() => null);
    if (!data?.error) throw errorRed();
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

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
