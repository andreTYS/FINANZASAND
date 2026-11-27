import { useState } from 'react';
import { WifiOff, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import { useCola } from '../store/cola';
import { useEnLinea } from '../hooks/useEnLinea';
import { sincronizar } from '../lib/sync';
import { Modal } from './ui';
import { useDinero, fechaHora } from '../lib/formato';

const ETIQUETA = { movimiento: 'Movimiento', prestamo: 'Préstamo', abono: 'Abono' };

/** Franja superior con el estado de conexión y la cola de sincronización. */
export default function EstadoConexion() {
  const enLinea = useEnLinea();
  const { ops, sincronizando } = useCola();
  const [ver, setVer] = useState(false);
  const errores = ops.filter((o) => o.error).length;
  const pendientes = ops.length - errores;
  if (enLinea && !ops.length) return null;

  let clase = 'conexion-offline', icono = <WifiOff />, texto;
  if (!enLinea) texto = `Sin conexión · tus registros se guardan en este dispositivo${ops.length ? ` (${ops.length} pendiente${ops.length > 1 ? 's' : ''})` : ''}`;
  else if (sincronizando) { clase = 'conexion-sync'; icono = <RefreshCw className="girando" />; texto = `Sincronizando ${pendientes}…`; }
  else if (errores) { clase = 'conexion-error'; icono = <AlertCircle />; texto = `${errores} registro(s) no se pudieron sincronizar`; }
  else { clase = 'conexion-sync'; icono = <RefreshCw />; texto = `${pendientes} pendiente(s) de sincronizar`; }

  return (
    <>
      <div className={`franja-conexion ${clase}`} role="status">
        {icono}<span>{texto}</span>
        {ops.length > 0 && <button className="btn btn-sm" onClick={() => setVer(true)}>Ver</button>}
        {enLinea && pendientes > 0 && !sincronizando && <button className="btn btn-sm" onClick={() => sincronizar()}>Reintentar</button>}
      </div>
      {ver && <ColaModal onClose={() => setVer(false)} />}
    </>
  );
}

function ColaModal({ onClose }) {
  const { ops, quitar } = useCola();
  const din = useDinero();
  return (
    <Modal titulo="Pendientes de sincronizar" onClose={onClose}>
      {!ops.length ? <p className="suave">No hay nada pendiente.</p> : (
        <div className="lista">
          {ops.map((o) => (
            <div className="item" key={o.id}>
              <div className="cuerpo">
                <div className="principal-txt">{ETIQUETA[o.clase]} · {o.body.descripcion || o.body.persona_lugar || o.body.origen_destino || 'sin descripción'}</div>
                <div className="secundario-txt">Creado {fechaHora(o.creado)}{o.error && <span className="negativo"> · {o.error}</span>}</div>
              </div>
              <strong className="num">{din(o.body.monto)}</strong>
              <button className="btn btn-fantasma btn-icono negativo" aria-label="Descartar" title="Descartar"
                onClick={() => window.confirm('¿Descartar este registro? No se guardará.') && quitar(o.id)}><Trash2 /></button>
            </div>
          ))}
        </div>
      )}
      <p className="ayuda" style={{ marginTop: 12 }}>Se envían solos al recuperar la conexión. Reintentar nunca duplica registros.</p>
    </Modal>
  );
}
