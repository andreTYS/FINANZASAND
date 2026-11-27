import { api, uuid } from './api';
import { useCola } from '../store/cola';
import { sincronizar } from './sync';

/**
 * Crea un registro en el servidor o, si no hay conexión, lo deja en la cola local.
 * El id se genera aquí para que el reintento sea idempotente.
 * Devuelve el objeto creado o { ...body, pendiente: true }.
 */
export async function crearOEncolar(clase, ruta, body, { permitirCola = true } = {}) {
  const conId = { ...body, id: body.id || uuid() };
  const encolar = () => {
    useCola.getState().encolar({ id: conId.id, clase, ruta, body: conId });
    return { ...conId, pendiente: true };
  };
  if (permitirCola && !navigator.onLine) return encolar();
  try {
    const r = await api(ruta, { method: 'POST', body: conId });
    if (useCola.getState().ops.length) sincronizar(); // hay red: aprovechar para vaciar la cola
    return r;
  } catch (e) {
    if (permitirCola && e.sinConexion) return encolar();
    throw e;
  }
}
