import { useEffect, useState } from 'react';
import { Bell, KeyRound, Copy, RotateCw, Trash2 } from 'lucide-react';
import { Card, Campo } from './ui';
import { useAjustes, useGuardarAjustes } from '../hooks/useAjustes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useUi } from '../store/ui';

export default function AjustesAlertas() {
  const { data } = useAjustes();
  const guardar = useGuardarAjustes();
  const toast = useUi((s) => s.toast);
  const [umbral, setUmbral] = useState('');
  const [presupuesto, setPresupuesto] = useState(true);
  const [dias, setDias] = useState(3);

  useEffect(() => {
    if (!data?.alertas) return;
    setUmbral(data.alertas.gasto_grande ?? '');
    setPresupuesto(data.alertas.presupuesto);
    setDias(data.alertas.prestamo_dias);
  }, [data]);

  if (!data) return null;
  const enviar = (e) => {
    e.preventDefault();
    guardar.mutate({
      alerta_gasto_grande: umbral === '' ? null : Number(String(umbral).replace(',', '.')),
      alerta_presupuesto: presupuesto,
      alerta_prestamo_dias: Number(dias),
    }, { onSuccess: () => toast('Alertas guardadas'), onError: (er) => toast(er.message, 'error') });
  };

  return (
    <Card titulo="Alertas" sub="Se muestran en la campana y se envían a n8n (si hay webhook)">
      <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
        <Campo label="Avisarme de gastos mayores a" ayuda="Vacío = desactivado">
          <input className="input num" inputMode="decimal" value={umbral} onChange={(e) => setUmbral(e.target.value)} placeholder="Ej. 500" />
        </Campo>
        <Campo label="Préstamos por vencer: avisar con" ayuda="Los vencidos siempre generan alerta. 0 = solo vencidos.">
          <select className="select" value={dias} onChange={(e) => setDias(e.target.value)}>
            {[0, 1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 0 ? 'Solo vencidos' : `${d} día${d > 1 ? 's' : ''} de anticipación`}</option>)}
          </select>
        </Campo>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={presupuesto} onChange={(e) => setPresupuesto(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--morado-600)' }} />
          Avisar al llegar al 80% y al 100% del presupuesto de una categoría
        </label>
        <p className="ayuda" style={{ marginTop: -6 }}>Los presupuestos se definen en cada categoría de gasto (tarjeta Categorías).</p>
        <div className="acciones" style={{ marginTop: 0 }}><button className="btn btn-primario btn-sm" disabled={guardar.isPending}><Bell /> Guardar alertas</button></div>
      </form>
    </Card>
  );
}

/** Token para que n8n escriba de vuelta vía /api/n8n (se muestra una sola vez). */
export function TokenN8n() {
  const { data } = useAjustes();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [nuevo, setNuevo] = useState(null);
  const generar = useMutation({
    mutationFn: () => api('/ajustes/n8n-token', { method: 'POST' }),
    onSuccess: (r) => { setNuevo(r.token); qc.invalidateQueries({ queryKey: ['ajustes'] }); },
    onError: (e) => toast(e.message, 'error'),
  });
  const revocar = useMutation({
    mutationFn: () => api('/ajustes/n8n-token', { method: 'DELETE' }),
    onSuccess: () => { setNuevo(null); qc.invalidateQueries({ queryKey: ['ajustes'] }); toast('Token revocado'); },
  });
  if (!data) return null;
  const configurado = data.n8n_token?.configurado;
  const copiar = () => navigator.clipboard?.writeText(nuevo).then(() => toast('Token copiado'));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={18} /> Token para que n8n escriba</strong>
        <span className={`badge ${configurado ? 'badge-verde' : 'badge-gris'}`}>{configurado ? 'Activo' : 'Sin token'}</span>
      </div>
      <p className="ayuda">n8n puede categorizar movimientos llamando a <code>PATCH /api/n8n/movimientos/:id/categoria</code> con la cabecera <code>X-Api-Key</code>. Nunca escribe directo en la base de datos.</p>
      {nuevo && (
        <div className="alerta alerta-pendiente" style={{ display: 'grid', gap: 8 }}>
          <span>Cópialo ahora: no se volverá a mostrar.</span>
          <code style={{ wordBreak: 'break-all', fontSize: 12, background: '#fff', padding: 8, borderRadius: 8 }}>{nuevo}</code>
          <button type="button" className="btn btn-secundario btn-sm" onClick={copiar}><Copy /> Copiar</button>
        </div>
      )}
      <div className="acciones" style={{ marginTop: 0 }}>
        {configurado && <button type="button" className="btn btn-fantasma btn-sm negativo" onClick={() => window.confirm('¿Revocar el token? n8n dejará de poder escribir.') && revocar.mutate()}><Trash2 /> Revocar</button>}
        <button type="button" className="btn btn-secundario btn-sm" disabled={generar.isPending}
          onClick={() => (!configurado || window.confirm('Se reemplazará el token actual. ¿Continuar?')) && generar.mutate()}>
          <RotateCw /> {configurado ? 'Regenerar' : 'Generar token'}
        </button>
      </div>
    </div>
  );
}
