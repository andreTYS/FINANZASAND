import { api } from './api';
import { useCola } from '../store/cola';
import { useUi } from '../store/ui';
import { queryClient } from './queryClient';

let enCurso = null;

/** Envía en orden las altas pendientes. Se detiene ante la primera falta de red. */
export function sincronizar() {
  if (enCurso) return enCurso;
  const { ops } = useCola.getState();
  if (!ops.some((o) => !o.error) || !navigator.onLine) return Promise.resolve(0);
  enCurso = (async () => {
    const cola = useCola.getState();
    cola.setSincronizando(true);
    let ok = 0;
    try {
      for (const op of useCola.getState().ops.filter((o) => !o.error)) {
        try {
          await api(op.ruta, { method: 'POST', body: op.body });
          useCola.getState().quitar(op.id);
          ok += 1;
        } catch (e) {
          if (e.sinConexion || e.status === 401 || e.status === 429 || e.status >= 500) break; // reintentar luego
          useCola.getState().marcarError(op.id, e.message); // rechazo definitivo: queda para revisión
        }
      }
    } finally {
      useCola.getState().setSincronizando(false);
      enCurso = null;
    }
    if (ok) {
      ['movimientos', 'dashboard', 'metricas', 'prestamos', 'alertas'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      useUi.getState().toast(`${ok} ${ok === 1 ? 'registro sincronizado' : 'registros sincronizados'}`);
    }
    return ok;
  })();
  return enCurso;
}

/** Registra los disparadores de sincronización: volver online, intervalo y arranque. */
export function iniciarSincronizacion() {
  const f = () => { sincronizar(); };
  window.addEventListener('online', f);
  const t = setInterval(f, 30_000);
  setTimeout(f, 1500);
  return () => { window.removeEventListener('online', f); clearInterval(t); };
}
