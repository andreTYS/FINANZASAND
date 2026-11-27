import { api, guardarUsuario } from './api';
import { useSesion } from '../store/sesion';
import { useCola } from '../store/cola';
import { limpiarCacheLocal } from './queryClient';

export async function login(email, password) {
  const d = await api('/auth/login', { method: 'POST', body: { email, password } });
  guardarUsuario(d.usuario);
  useSesion.getState().iniciar(d);
}

export async function cerrarSesion() {
  const pendientes = useCola.getState().ops.length;
  if (pendientes && !window.confirm(`Tienes ${pendientes} registro(s) sin sincronizar que se perderán. ¿Cerrar sesión igual?`)) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* igual cerramos local */ }
  useCola.getState().vaciar();
  guardarUsuario(null);
  limpiarCacheLocal();
  useSesion.getState().cerrar();
}
