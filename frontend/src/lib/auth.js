import { api } from './api';
import { useSesion } from '../store/sesion';
import { queryClient } from './queryClient';

export async function login(email, password) {
  const d = await api('/auth/login', { method: 'POST', body: { email, password } });
  useSesion.getState().iniciar(d);
}

export async function cerrarSesion() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* igual cerramos local */ }
  queryClient.clear();
  useSesion.getState().cerrar();
}
