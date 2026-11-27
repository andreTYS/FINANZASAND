import { useRef, useState } from 'react';
import { useCategorias, useGuardarCategoria, useBorrarCategoria } from '../hooks/useCategorias';
import { usePreviewImport, useImportar, useImportaciones, useAutomatizaciones } from '../hooks/useImportExport';
import { Card, Cabecera, Campo, Modal, ErrorMsg, Segmentado, Vacio } from '../components/ui';
import Filtros, { filtrosVacios } from '../components/Filtros';
import { api, descargar, qs } from '../lib/api';
import { useUi } from '../store/ui';
import { useSesion } from '../store/sesion';
import { cerrarSesion } from '../lib/auth';
import { fechaHora, TIPOS, useDinero } from '../lib/formato';
import Integraciones from '../components/Integraciones';
import AjustesAlertas from '../components/AjustesAlertas';
import { useQueryClient } from '@tanstack/react-query';
import { useGuardarAjustes } from '../hooks/useAjustes';

export default function Configuracion() {
  return (
    <>
      <Cabecera titulo="Configuración" subtitulo="Categorías, importar/exportar y tu cuenta" />
      <div className="grid grid-igual" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Integraciones />
          <Categorias />
          <Cuenta />
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <AjustesAlertas />
          <Exportar />
          <Importar />
          <Automatizaciones />
        </div>
      </div>
    </>
  );
}

const COLORES = ['#7c3aed', '#6d28d9', '#2563eb', '#0ea5e9', '#16a34a', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#64748b'];

function Categorias() {
  const { data = [] } = useCategorias();
  const [tipo, setTipo] = useState('gasto');
  const [edit, setEdit] = useState(null);
  const borrar = useBorrarCategoria();
  const toast = useUi((s) => s.toast);
  const lista = data.filter((c) => c.tipo === tipo);
  const [pres, setPres] = useState(null);
  const din = useDinero();
  return (
    <Card titulo="Categorías" accion={<button className="btn btn-secundario btn-sm" onClick={() => setEdit({ nombre: '', color: COLORES[0], icono: '', tipo })}>＋ Nueva</button>}>
      <Segmentado valor={tipo} onChange={setTipo} opciones={[{ valor: 'gasto', etiqueta: 'Gastos' }, { valor: 'ingreso', etiqueta: 'Ingresos' }, { valor: 'prestamo', etiqueta: 'Préstamos' }]} />
      <div className="lista" style={{ marginTop: 12 }}>
        {lista.map((c) => (
          <div key={c.id} className="item">
            <div className="avatar" style={{ background: `${c.color || '#94a3b8'}1a`, color: c.color }}>{c.icono || '•'}</div>
            <div className="cuerpo">
              <div className="principal-txt">{c.nombre}</div>
              <div className="secundario-txt">{c.global ? 'Predeterminada' : 'Propia'}{c.presupuesto ? ` · Presupuesto ${din(c.presupuesto)}/mes` : ''}</div>
            </div>
            {c.tipo === 'gasto' && <button className="btn btn-fantasma btn-sm" onClick={() => setPres(c)}>{c.presupuesto ? 'Presupuesto' : '+ Presupuesto'}</button>}
            {!c.global && (
              <>
                <button className="btn btn-fantasma btn-sm" onClick={() => setEdit(c)}>Editar</button>
                <button className="btn btn-fantasma btn-sm negativo" aria-label={`Eliminar ${c.nombre}`}
                  onClick={() => window.confirm(`¿Eliminar "${c.nombre}"? Sus movimientos quedarán sin categoría.`) && borrar.mutate(c.id, { onSuccess: () => toast('Categoría eliminada'), onError: (e) => toast(e.message, 'error') })}>✕</button>
              </>
            )}
          </div>
        ))}
      </div>
      {edit && <EditorCategoria cat={edit} onClose={() => setEdit(null)} />}
      {pres && <EditorPresupuesto cat={pres} onClose={() => setPres(null)} />}
    </Card>
  );
}

function EditorPresupuesto({ cat, onClose }) {
  const [monto, setMonto] = useState(cat.presupuesto ?? '');
  const [guardando, setGuardando] = useState(false);
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const guardar = async (valor) => {
    setGuardando(true);
    try {
      await api(`/categorias/${cat.id}/presupuesto`, { method: 'PUT', body: { monto_mensual: valor } });
      qc.invalidateQueries({ queryKey: ['categorias'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(valor == null ? 'Presupuesto quitado' : 'Presupuesto guardado');
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo={`Presupuesto: ${cat.nombre}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); const n = Number(String(monto).replace(',', '.')); if (n > 0) guardar(n); }} style={{ display: 'grid', gap: 12 }}>
        <Campo label="Monto máximo al mes" ayuda="Recibirás alertas al llegar al 80% y al 100%.">
          <input className="input input-monto num" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus placeholder="0.00" />
        </Campo>
        <div className="acciones">
          {cat.presupuesto && <button type="button" className="btn btn-fantasma negativo" onClick={() => guardar(null)} disabled={guardando}>Quitar</button>}
          <button className="btn btn-primario" disabled={guardando || !(Number(String(monto).replace(',', '.')) > 0)}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function EditorCategoria({ cat, onClose }) {
  const [f, setF] = useState(cat);
  const guardar = useGuardarCategoria();
  const toast = useUi((s) => s.toast);
  const enviar = (e) => {
    e.preventDefault();
    guardar.mutate({ id: cat.id, nombre: f.nombre, color: f.color, icono: f.icono || null, tipo: f.tipo }, {
      onSuccess: () => { toast('Categoría guardada'); onClose(); }, onError: (er) => toast(er.message, 'error'),
    });
  };
  return (
    <Modal titulo={cat.id ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <div className="form-grid">
          <Campo label="Nombre"><input className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={60} autoFocus /></Campo>
          <Campo label="Icono (emoji)"><input className="input" value={f.icono || ''} onChange={(e) => setF({ ...f, icono: e.target.value })} maxLength={4} placeholder="🍕" /></Campo>
        </div>
        <Campo label="Tipo">
          <Segmentado valor={f.tipo} onChange={(tipo) => setF({ ...f, tipo })} opciones={[{ valor: 'gasto', etiqueta: 'Gasto' }, { valor: 'ingreso', etiqueta: 'Ingreso' }, { valor: 'prestamo', etiqueta: 'Préstamo' }]} />
        </Campo>
        <Campo label="Color">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORES.map((c) => (
              <button type="button" key={c} onClick={() => setF({ ...f, color: c })} aria-label={c}
                style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: f.color === c ? '3px solid #0f172a' : '3px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer' }} />
            ))}
          </div>
        </Campo>
        <div className="acciones"><button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button><button className="btn btn-primario" disabled={guardar.isPending}>Guardar</button></div>
      </form>
    </Modal>
  );
}

function Exportar() {
  const [filtros, setFiltros] = useState(filtrosVacios);
  const [cargando, setCargando] = useState(null);
  const toast = useUi((s) => s.toast);
  const exp = async (formato) => {
    setCargando(formato);
    try { await descargar(`/export${qs({ ...filtros, formato })}`, `movimientos.${formato}`); } catch (e) { toast(e.message, 'error'); } finally { setCargando(null); }
  };
  return (
    <Card titulo="Exportar movimientos">
      <Filtros valor={filtros} onChange={setFiltros} />
      <div className="acciones">
        {['csv', 'xlsx', 'pdf'].map((f) => (
          <button key={f} className="btn btn-secundario" disabled={!!cargando} onClick={() => exp(f)}>{cargando === f ? '…' : `⬇ ${f.toUpperCase()}`}</button>
        ))}
      </div>
    </Card>
  );
}

function Importar() {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [incluirDup, setIncluirDup] = useState(false);
  const preview = usePreviewImport();
  const importar = useImportar();
  const { data: historial = [] } = useImportaciones();
  const toast = useUi((s) => s.toast);
  const din = useDinero();

  const elegir = (f) => { if (!f) return; setArchivo(f); importar.reset(); preview.mutate(f); };
  const cerrar = () => { setArchivo(null); preview.reset(); if (inputRef.current) inputRef.current.value = ''; };
  const confirmar = () => importar.mutate({ archivo, incluirDuplicados: incluirDup }, {
    onSuccess: (r) => { toast(`${r.resumen.importadas} movimientos importados`); cerrar(); },
    onError: (e) => toast(e.message, 'error'),
  });
  const r = preview.data?.resumen;
  const aImportar = r ? r.validas - (incluirDup ? 0 : r.duplicadas) : 0;

  return (
    <Card titulo="Importar CSV / XLSX" accion={<button className="btn btn-fantasma btn-sm" onClick={() => descargar('/import/plantilla', 'plantilla.csv').catch((e) => toast(e.message, 'error'))}>Plantilla</button>}>
      <p className="suave" style={{ fontSize: 14, marginBottom: 12 }}>
        Columnas: <code>fecha</code>, <code>monto</code> (obligatorias), <code>tipo</code>, <code>descripcion</code>, <code>categoria</code>, <code>cantidad</code>, <code>origen_destino</code>.
        Se detectan duplicados (mismo día, tipo, monto y descripción).
      </p>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => elegir(e.target.files?.[0])} />
      <button className="btn btn-secundario btn-bloque" onClick={() => inputRef.current?.click()} disabled={preview.isPending}>{preview.isPending ? 'Analizando…' : 'Elegir archivo'}</button>
      {preview.error && <div style={{ marginTop: 12 }}><ErrorMsg error={preview.error} /></div>}
      {historial.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="suave" style={{ fontSize: 12, marginBottom: 4 }}>Últimas importaciones</div>
          {historial.slice(0, 3).map((h) => (
            <div key={h.id} style={{ fontSize: 13 }} className="suave">{fechaHora(h.created_at)} · {h.archivo} · {h.filas_importadas}/{h.filas_totales} importadas · {h.filas_duplicadas} dup.</div>
          ))}
        </div>
      )}

      {r && archivo && (
        <Modal titulo={`Vista previa: ${archivo.name}`} onClose={cerrar}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="badge badge-gris">{r.filas_totales} filas</span>
            <span className="badge badge-verde">{r.validas - r.duplicadas} nuevas</span>
            <span className="badge badge-amarillo">{r.duplicadas} duplicadas</span>
            {r.errores > 0 && <span className="badge badge-rojo">{r.errores} con error</span>}
          </div>
          <div className="tabla-wrap" style={{ maxHeight: 320 }}>
            <table className="tabla">
              <thead><tr><th>Fila</th><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {preview.data.filas.map((f) => (
                  <tr key={f.fila}>
                    <td className="suave">{f.fila}</td>
                    {f.datos ? (
                      <>
                        <td>{fechaHora(f.datos.fecha_hora)}</td>
                        <td>{TIPOS[f.datos.tipo].etiqueta}</td>
                        <td>{f.datos.descripcion}</td>
                        <td>{f.datos.categoria_nombre || '—'}</td>
                        <td className="num">{din(f.datos.monto)}</td>
                        <td>{f.duplicado ? <span className="badge badge-amarillo">Duplicado ({f.duplicado})</span> : <span className="badge badge-verde">Nuevo</span>}</td>
                      </>
                    ) : <td colSpan={6}><span className="badge badge-rojo">{f.error}</span></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.duplicadas > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 14 }}>
              <input type="checkbox" checked={incluirDup} onChange={(e) => setIncluirDup(e.target.checked)} /> Importar también los duplicados
            </label>
          )}
          <div className="acciones">
            <button className="btn btn-fantasma" onClick={cerrar}>Cancelar</button>
            <button className="btn btn-primario" disabled={!aImportar || importar.isPending} onClick={confirmar}>{importar.isPending ? 'Importando…' : `Importar ${aImportar}`}</button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Cuenta() {
  const usuario = useSesion((s) => s.usuario);
  const { moneda, toast } = useUi();
  const guardarAjustes = useGuardarAjustes();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState(null);
  const cambiar = async (e) => {
    e.preventDefault();
    setError(null);
    try { await api('/auth/cambiar-password', { method: 'POST', body: { actual, nueva } }); toast('Contraseña actualizada'); setActual(''); setNueva(''); } catch (er) { setError(er); }
  };
  return (
    <Card titulo="Cuenta">
      <p style={{ marginBottom: 16 }}>{usuario?.nombre} · <span className="suave">{usuario?.email}</span></p>
      <Campo label="Moneda">
        <select className="select" value={moneda} onChange={(e) => guardarAjustes.mutate({ moneda: e.target.value }, { onSuccess: () => toast('Moneda actualizada'), onError: (er) => toast(er.message, 'error') })}>
          {['PEN', 'USD', 'EUR', 'MXN', 'COP', 'CLP', 'ARS', 'BOB'].map((m) => <option key={m}>{m}</option>)}
        </select>
      </Campo>
      <form onSubmit={cambiar} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <div className="form-grid">
          <Campo label="Contraseña actual"><input type="password" className="input" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required /></Campo>
          <Campo label="Nueva (mín. 8)"><input type="password" className="input" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} minLength={8} required /></Campo>
        </div>
        <ErrorMsg error={error} />
        <div className="acciones" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-peligro" onClick={cerrarSesion}>Cerrar sesión</button>
          <button className="btn btn-secundario">Cambiar contraseña</button>
        </div>
      </form>
    </Card>
  );
}

function Automatizaciones() {
  const { data = [] } = useAutomatizaciones();
  return (
    <Card titulo="Automatizaciones (n8n)">
      {data.length === 0 ? <Vacio emoji="⚡">Aún no se dispararon eventos</Vacio> : (
        <div className="lista">
          {data.slice(0, 8).map((a) => (
            <div key={a.id} className="item" style={{ padding: '8px 4px' }}>
              <div className="cuerpo"><div className="principal-txt" style={{ fontSize: 14 }}>{a.workflow_n8n}</div><div className="secundario-txt">{fechaHora(a.created_at)}</div></div>
              <span className={`badge ${a.estado === 'enviado' ? 'badge-verde' : a.estado.startsWith('omitido') ? 'badge-gris' : 'badge-rojo'}`}>{a.estado}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
