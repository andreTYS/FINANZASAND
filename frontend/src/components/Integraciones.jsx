import { useEffect, useState } from 'react';
import { Card, Campo } from './ui';
import { useAjustes, useGuardarAjustes, useProbarGemini, useProbarN8n } from '../hooks/useAjustes';
import { useUi } from '../store/ui';

export default function Integraciones() {
  const { data } = useAjustes();
  const guardar = useGuardarAjustes();
  const probarGemini = useProbarGemini();
  const probarN8n = useProbarN8n();
  const toast = useUi((s) => s.toast);
  const [key, setKey] = useState('');
  const [modelo, setModelo] = useState('');
  const [webhook, setWebhook] = useState('');
  const [modelos, setModelos] = useState([]);

  useEffect(() => {
    if (!data) return;
    setModelo(data.gemini.modelo);
    setWebhook(data.n8n.webhook_url);
  }, [data]);

  const err = (e) => toast(e.message, 'error');

  const guardarGemini = (e) => {
    e.preventDefault();
    const cambios = { gemini_model: modelo.trim() };
    if (key.trim()) cambios.gemini_api_key = key.trim();
    guardar.mutate(cambios, { onSuccess: () => { setKey(''); toast('Ajustes de Gemini guardados'); }, onError: err });
  };

  const probar = () => probarGemini.mutate(key.trim() ? { gemini_api_key: key.trim() } : {}, {
    onSuccess: (r) => { setModelos(r.modelos); toast(`Conexión OK · ${r.modelos.length} modelos disponibles`); },
    onError: err,
  });

  const quitarKey = () => window.confirm('¿Quitar la API key guardada en la app?')
    && guardar.mutate({ gemini_api_key: '' }, { onSuccess: () => toast('API key eliminada'), onError: err });

  const guardarN8n = (e) => {
    e.preventDefault();
    guardar.mutate({ n8n_webhook_url: webhook.trim() }, { onSuccess: () => toast('Webhook guardado'), onError: err });
  };

  if (!data) return null;
  const g = data.gemini;

  return (
    <Card titulo="Integraciones">
      <form onSubmit={guardarGemini} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <strong>📷 Gemini (lectura de tickets)</strong>
          <span className={`badge ${g.configurada ? 'badge-verde' : 'badge-amarillo'}`}>
            {g.configurada ? `Conectado${g.origen === 'env' ? ' (servidor)' : ''}` : 'Sin configurar'}
          </span>
        </div>
        <Campo label="API key" ayuda={g.configurada ? `Guardada: ${g.key_mascara}. Déjalo vacío para mantenerla.` : 'Créala gratis en aistudio.google.com → Get API key.'}>
          <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={g.configurada ? g.key_mascara : 'AIza…'} />
        </Campo>
        <Campo label="Modelo" ayuda="«gemini-flash-latest» apunta siempre al Flash vigente (tiene plan gratuito).">
          {modelos.length ? (
            <select className="select" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {!modelos.some((m) => m.id === modelo) && <option value={modelo}>{modelo}</option>}
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          ) : (
            <input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} />
          )}
        </Campo>
        <div className="acciones" style={{ marginTop: 0 }}>
          {g.origen === 'app' && <button type="button" className="btn btn-fantasma btn-sm negativo" onClick={quitarKey}>Quitar key</button>}
          <button type="button" className="btn btn-secundario btn-sm" onClick={probar} disabled={probarGemini.isPending || (!g.configurada && !key.trim())}>
            {probarGemini.isPending ? 'Probando…' : 'Probar conexión'}
          </button>
          <button className="btn btn-primario btn-sm" disabled={guardar.isPending}>Guardar</button>
        </div>
      </form>

      <hr style={{ border: 0, borderTop: '1px solid var(--color-borde)', margin: '20px 0' }} />

      <form onSubmit={guardarN8n} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <strong>⚡ n8n (automatizaciones)</strong>
          <span className={`badge ${data.n8n.webhook_url ? 'badge-verde' : 'badge-gris'}`}>{data.n8n.webhook_url ? 'Activo' : 'Desactivado'}</span>
        </div>
        <Campo label="URL del webhook" ayuda="Se envía un POST por cada movimiento, préstamo o abono. Vacío = desactivado.">
          <input className="input" type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://n8n.tudominio.com/webhook/finanzas" />
        </Campo>
        <div className="acciones" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-secundario btn-sm" disabled={probarN8n.isPending || !webhook.trim()}
            onClick={() => probarN8n.mutate({ n8n_webhook_url: webhook.trim() }, { onSuccess: (r) => toast(`Webhook respondió ${r.status} ✔`), onError: err })}>
            {probarN8n.isPending ? 'Enviando…' : 'Enviar prueba'}
          </button>
          <button className="btn btn-primario btn-sm" disabled={guardar.isPending}>Guardar</button>
        </div>
      </form>
    </Card>
  );
}
