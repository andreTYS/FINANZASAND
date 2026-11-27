import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrestamos, usePrestamo, useGuardarPrestamo, useBorrarPrestamo, useAbonar, useBorrarAbono } from '../hooks/usePrestamos';
import { Card, Modal, Cargando, Vacio, ErrorMsg, Cabecera, Segmentado, Campo, Kpi } from '../components/ui';
import MovimientoForm from '../components/MovimientoForm';
import { useUi } from '../store/ui';
import { HandCoins, Landmark, Plus } from 'lucide-react';
import { useDinero, fecha, fechaHora, aInputFecha, ESTADOS_PRESTAMO } from '../lib/formato';

export default function Prestamos() {
  const [params, setParams] = useSearchParams();
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('abiertos');
  const [creando, setCreando] = useState(false);
  const { data = [], isLoading, error } = usePrestamos({ tipo, estado });
  const guardar = useGuardarPrestamo();
  const toast = useUi((s) => s.toast);
  const din = useDinero();
  const seleccionado = params.get('id');

  const porCobrar = data.filter((p) => p.tipo === 'prestamo_out').reduce((s, p) => s + p.saldo_pendiente, 0);
  const porPagar = data.filter((p) => p.tipo === 'prestamo_in').reduce((s, p) => s + p.saldo_pendiente, 0);

  return (
    <>
      <Cabecera titulo="Préstamos" subtitulo="Lo que prestaste y lo que te prestaron">
        <button className="btn btn-primario" onClick={() => setCreando(true)}><Plus /> Nuevo préstamo</button>
      </Cabecera>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi etiqueta="Me deben" valor={din(porCobrar)} clase="pendiente" icono={HandCoins} chip="amarillo" detalle="Según el filtro actual" />
        <Kpi etiqueta="Debo" valor={din(porPagar)} clase="negativo" icono={Landmark} chip="azul" detalle="Según el filtro actual" />
      </div>

      <Card>
        <div className="filtros" style={{ marginBottom: 16 }}>
          <Segmentado valor={tipo} onChange={setTipo} opciones={[{ valor: '', etiqueta: 'Todos' }, { valor: 'prestamo_out', etiqueta: 'Presté' }, { valor: 'prestamo_in', etiqueta: 'Me prestaron' }]} />
          <Segmentado valor={estado} onChange={setEstado} opciones={[{ valor: 'abiertos', etiqueta: 'Abiertos' }, { valor: 'pagado_cobrado', etiqueta: 'Saldados' }, { valor: '', etiqueta: 'Todos' }]} />
        </div>
        {isLoading ? <Cargando /> : error ? <ErrorMsg error={error} /> : data.length === 0 ? <Vacio emoji="🤝">No hay préstamos aquí</Vacio> : (
          <div className="lista">
            {data.map((p) => {
              const pct = p.monto_original ? (p.pagado / p.monto_original) * 100 : 0;
              const est = p.vencido ? { etiqueta: 'Vencido', badge: 'badge-rojo' } : ESTADOS_PRESTAMO[p.estado];
              return (
                <div key={p.id} className="item clicable" onClick={() => setParams({ id: p.id })}>
                  <div className={`icono-chip ${p.tipo === 'prestamo_out' ? 'chip-amarillo' : 'chip-azul'}`} style={{ width: 42, height: 42 }}>{p.tipo === 'prestamo_out' ? <HandCoins /> : <Landmark />}</div>
                  <div className="cuerpo">
                    <div className="principal-txt">{p.persona_lugar}</div>
                    <div className="secundario-txt">
                      {p.tipo === 'prestamo_out' ? 'Le presté' : 'Me prestó'} {din(p.monto_original)} · {fecha(p.fecha_hora)}
                      {p.fecha_limite && ` · vence ${fecha(p.fecha_limite + 'T12:00')}`}
                    </div>
                    <div className="barra-progreso" style={{ marginTop: 8, maxWidth: 280 }}><div style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="monto num">{din(p.saldo_pendiente)}</div>
                    <span className={`badge ${est.badge}`}>{est.etiqueta}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {creando && (
        <Modal titulo="Nuevo préstamo" onClose={() => setCreando(false)}>
          <MovimientoForm inicial={{ tipo: 'prestamo_out' }} tiposBloqueados={['prestamo_out', 'prestamo_in']} guardando={guardar.isPending} textoBoton="Registrar préstamo"
            onCancelar={() => setCreando(false)}
            onSubmit={(d) => guardar.mutate(d, { onSuccess: () => { toast('Préstamo registrado'); setCreando(false); }, onError: (e) => toast(e.message, 'error') })} />
        </Modal>
      )}
      {seleccionado && <DetallePrestamo id={seleccionado} onClose={() => setParams({})} />}
    </>
  );
}

function DetallePrestamo({ id, onClose }) {
  const { data: p, isLoading, error } = usePrestamo(id);
  const [editar, setEditar] = useState(false);
  const [monto, setMonto] = useState('');
  const [fechaAbono, setFechaAbono] = useState(aInputFecha());
  const abonar = useAbonar();
  const borrarAbono = useBorrarAbono();
  const guardar = useGuardarPrestamo();
  const borrar = useBorrarPrestamo();
  const toast = useUi((s) => s.toast);
  const din = useDinero();
  const err = (e) => toast(e.message, 'error');

  if (isLoading) return <Modal titulo="Préstamo" onClose={onClose}><Cargando /></Modal>;
  if (error) return <Modal titulo="Préstamo" onClose={onClose}><ErrorMsg error={error} /></Modal>;

  if (editar) {
    return (
      <Modal titulo="Editar préstamo" onClose={() => setEditar(false)}>
        <MovimientoForm inicial={p} tiposBloqueados={['prestamo_out', 'prestamo_in']} guardando={guardar.isPending} onCancelar={() => setEditar(false)}
          onSubmit={(d) => guardar.mutate({ id: p.id, ...d }, { onSuccess: () => { toast('Préstamo actualizado'); setEditar(false); }, onError: err })} />
      </Modal>
    );
  }

  const enviarAbono = (e) => {
    e.preventDefault();
    const n = Number(String(monto).replace(',', '.'));
    if (!(n > 0)) return toast('Monto inválido', 'error');
    const [y, m, d] = fechaAbono.split('-').map(Number);
    abonar.mutate({ id: p.id, monto: n, fecha: new Date(y, m - 1, d, 12).toISOString() }, {
      onSuccess: () => { toast(p.tipo === 'prestamo_out' ? 'Cobro registrado' : 'Pago registrado'); setMonto(''); },
      onError: err,
    });
  };

  return (
    <Modal titulo={p.persona_lugar} onClose={onClose}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16, gap: 8 }}>
        <div><div className="suave" style={{ fontSize: 12 }}>Original</div><strong className="num">{din(p.monto_original)}</strong></div>
        <div><div className="suave" style={{ fontSize: 12 }}>{p.tipo === 'prestamo_out' ? 'Cobrado' : 'Pagado'}</div><strong className="num positivo">{din(p.pagado)}</strong></div>
        <div><div className="suave" style={{ fontSize: 12 }}>Saldo</div><strong className="num pendiente">{din(p.saldo_pendiente)}</strong></div>
      </div>
      <p className="suave" style={{ fontSize: 14, marginBottom: 16 }}>
        {p.tipo === 'prestamo_out' ? 'Le prestaste' : 'Te prestó'} el {fecha(p.fecha_hora)}
        {p.fecha_limite && <> · fecha límite <strong className={p.vencido ? 'negativo' : ''}>{fecha(p.fecha_limite + 'T12:00')}</strong></>}
        {p.descripcion && <><br />{p.descripcion}</>}
      </p>

      {p.estado !== 'pagado_cobrado' && (
        <form onSubmit={enviarAbono} className="card" style={{ background: 'var(--verde-50)', borderColor: 'var(--verde-100)', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>{p.tipo === 'prestamo_out' ? 'Registrar cobro' : 'Registrar pago'}</h3>
          <div className="form-grid">
            <Campo label="Monto"><input className="input num" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={String(p.saldo_pendiente)} /></Campo>
            <Campo label="Fecha"><input type="date" className="input" value={fechaAbono} onChange={(e) => setFechaAbono(e.target.value)} /></Campo>
          </div>
          <div className="acciones">
            <button type="button" className="btn btn-fantasma btn-sm" onClick={() => setMonto(String(p.saldo_pendiente))}>Saldar todo</button>
            <button className="btn btn-primario btn-sm" disabled={abonar.isPending}>Registrar</button>
          </div>
        </form>
      )}

      <h3 style={{ fontSize: 15, marginBottom: 8 }}>Historial de abonos</h3>
      {p.abonos.length === 0 ? <p className="suave" style={{ fontSize: 14 }}>Aún no hay abonos.</p> : (
        <div className="lista">
          {p.abonos.map((a) => (
            <div key={a.id} className="item">
              <div className="cuerpo"><div className="principal-txt num">{din(a.monto)}</div><div className="secundario-txt">{fechaHora(a.fecha)}</div></div>
              <button className="btn btn-fantasma btn-sm" aria-label="Anular abono" disabled={borrarAbono.isPending}
                onClick={() => window.confirm('¿Anular este abono?') && borrarAbono.mutate({ id: p.id, abonoId: a.id }, { onError: err })}>Anular</button>
            </div>
          ))}
        </div>
      )}

      <div className="acciones">
        <button className="btn btn-peligro btn-sm" disabled={borrar.isPending}
          onClick={() => window.confirm('¿Eliminar este préstamo y sus abonos?') && borrar.mutate(p.id, { onSuccess: () => { toast('Préstamo eliminado'); onClose(); }, onError: err })}>Eliminar</button>
        <button className="btn btn-secundario btn-sm" onClick={() => setEditar(true)}>Editar</button>
      </div>
    </Modal>
  );
}
