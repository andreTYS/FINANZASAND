import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Sparkles, Check } from 'lucide-react';
import { useAjustes } from '../hooks/useAjustes';
import { useEnLinea } from '../hooks/useEnLinea';
import { useScanTicket } from '../hooks/useOcr';
import { useGuardarMovimiento } from '../hooks/useMovimientos';
import { Card, Cabecera, ErrorMsg } from '../components/ui';
import MovimientoForm from '../components/MovimientoForm';
import { useUi } from '../store/ui';

/**
 * Flujo: foto -> Gemini Vision -> formulario PRECARGADO -> el usuario confirma/corrige -> recién ahí se guarda.
 */
export default function Scan() {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);
  const scan = useScanTicket();
  const guardar = useGuardarMovimiento();
  const toast = useUi((s) => s.toast);
  const nav = useNavigate();
  const { data: ajustes } = useAjustes();
  const enLinea = useEnLinea();

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function elegir(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Selecciona una imagen', 'error');
    if (!navigator.onLine) return toast('Necesitas conexión para leer el ticket', 'error');
    setArchivo(f);
    setPreview(URL.createObjectURL(f));
    scan.reset();
    scan.mutate(f);
  }

  const reiniciar = () => { setArchivo(null); setPreview(null); scan.reset(); };

  const confirmar = (payload) => {
    guardar.mutate({ ...payload, created_via: 'scan', scan_token: scan.data.scan_token }, {
      onSuccess: () => { toast('Gasto guardado desde ticket'); nav('/registro'); },
      onError: (e) => toast(e.message, 'error'),
    });
  };

  const datos = scan.data?.prellenado;
  const confianza = datos?.confianza;

  return (
    <>
      <Cabecera titulo="Escanear ticket" subtitulo="Toma una foto y revisa los datos antes de guardar" />
      <div className="pasos">
        {['Foto', 'Lectura con IA', 'Confirmas', 'Guardado'].map((t, i) => {
          const paso = !archivo ? 0 : scan.isPending ? 1 : datos ? 2 : 1;
          return (
            <span key={t} style={{ display: 'contents' }}>
              {i > 0 && <span className="linea" />}
              <span className={`paso ${i === paso ? 'activo' : i < paso ? 'hecho' : ''}`}>
                <span className="num-paso">{i < paso ? <Check size={13} /> : i + 1}</span>{t}
              </span>
            </span>
          );
        })}
      </div>
      <div className="grid grid-igual" style={{ alignItems: 'start' }}>
        {!enLinea && (
          <div className="alerta alerta-pendiente" style={{ gridColumn: '1 / -1' }}>
            Sin conexión: la lectura de tickets necesita internet. Puedes <Link to="/registro">registrar el gasto a mano</Link> y se sincronizará después.
          </div>
        )}
        {ajustes && !ajustes.gemini.configurada && (
          <div className="alerta alerta-pendiente" style={{ gridColumn: '1 / -1' }}>
            Para leer tickets necesitas una API key de Gemini (gratis). <Link to="/configuracion">Configúrala aquí →</Link>
          </div>
        )}
        <Card titulo="1. Foto del ticket">
          {!archivo ? (
            <div className={`zona-scan ${arrastrando ? 'arrastrando' : ''}`} onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]); }}
              role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}>
              <div className="icono-grande"><Camera /></div>
              <strong>Tomar foto o elegir imagen</strong>
              <p className="suave" style={{ fontSize: 13, marginTop: 4 }}>JPG, PNG, WEBP o HEIC · máx. 8 MB</p>
            </div>
          ) : (
            <>
              <img src={preview} alt="Ticket" className="preview-ticket" />
              <div className="acciones"><button className="btn btn-secundario btn-sm" onClick={reiniciar}>Usar otra foto</button></div>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => elegir(e.target.files?.[0])} />
        </Card>

        <Card titulo="2. Confirma los datos">
          {!archivo && <p className="suave">Cuando subas la foto, aquí aparecerán los datos detectados para que los revises.</p>}
          {scan.isPending && (
            <div className="cargando" style={{ gap: 12 }}><div className="spinner" /><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={16} /> Leyendo ticket con IA…</span></div>
          )}
          {scan.error && (
            <div style={{ display: 'grid', gap: 12 }}>
              <ErrorMsg error={scan.error} />
              <button className="btn btn-secundario" onClick={() => scan.mutate(archivo)}>Reintentar</button>
            </div>
          )}
          {datos && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={`alerta ${confianza != null && confianza < 0.6 ? 'alerta-pendiente' : 'alerta-info'}`}>
                {confianza != null && confianza < 0.6
                  ? '⚠️ La lectura no es muy confiable: revisa bien cada campo.'
                  : 'Revisa y corrige si hace falta. Nada se guarda hasta que confirmes.'}
                {datos.moneda && ` Moneda detectada: ${datos.moneda}.`}
              </div>
              <MovimientoForm inicial={{ ...datos, monto: datos.monto ?? '', fecha_hora: datos.fecha_hora || undefined }}
                permitirPrestamo={false} onSubmit={confirmar} guardando={guardar.isPending} textoBoton="Confirmar y guardar" onCancelar={reiniciar} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
