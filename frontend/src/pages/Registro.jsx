import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMovimientos, useGuardarMovimiento, useBorrarMovimiento } from '../hooks/useMovimientos';
import { useGuardarPrestamo } from '../hooks/usePrestamos';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Modal, Cargando, Vacio, ErrorMsg, Cabecera, Campo } from '../components/ui';
import MovimientoForm from '../components/MovimientoForm';
import MovimientoItem from '../components/MovimientoItem';
import Filtros, { filtrosVacios } from '../components/Filtros';
import { useUi } from '../store/ui';
import { useDinero } from '../lib/formato';
import { agruparPorDia } from '../lib/agrupar';
import { useCola } from '../store/cola';
import { useCategorias } from '../hooks/useCategorias';

export default function Registro() {
  const [params, setParams] = useSearchParams();
  const [filtros, setFiltros] = useState(filtrosVacios);
  const [page, setPage] = useState(1);
  const [editando, setEditando] = useState(null);
  const consulta = useMemo(() => ({ ...filtros, page, limit: 30 }), [filtros, page]);
  const { data, isLoading, error, isFetching } = useMovimientos(consulta);
  const guardar = useGuardarMovimiento();
  const guardarPrestamo = useGuardarPrestamo();
  const borrar = useBorrarMovimiento();
  const toast = useUi((s) => s.toast);
  const din = useDinero();
  const nuevo = params.get('nuevo') === '1';
  const ops = useCola((st) => st.ops);
  const { data: cats = [] } = useCategorias();
  // Altas hechas sin conexión: se muestran arriba (primera página) hasta que se sincronicen
  const pendientes = useMemo(() => (page !== 1 ? [] : ops.filter((o) => o.clase !== 'abono').map((o) => {
    const c = cats.find((x) => x.id === o.body.categoria_id);
    return {
      ...o.body, pendiente: true, error: o.error, created_via: 'teclado',
      origen_destino: o.body.origen_destino ?? o.body.persona_lugar,
      categoria_nombre: c?.nombre, categoria_color: c?.color, categoria_icono: c?.icono,
    };
  })), [ops, cats, page]);
  const items = data ? [...pendientes.filter((p) => !data.items.some((m) => m.id === p.id)), ...data.items] : pendientes;

  const crear = (payload, reset) => {
    const esPrestamo = payload.tipo.startsWith('prestamo');
    (esPrestamo ? guardarPrestamo : guardar).mutate(payload, {
      onSuccess: (r) => {
        toast(r?.pendiente ? 'Guardado sin conexión: se sincronizará solo' : esPrestamo ? 'Préstamo registrado'
          : r?.categoria_auto ? `Movimiento guardado · categoría: ${cats.find((c) => c.id === r.categoria_id)?.nombre ?? 'auto'}` : 'Movimiento guardado', r?.pendiente ? 'aviso' : 'ok');
        reset(); if (nuevo) setParams({});
      },
      onError: (e) => toast(e.message, 'error'),
    });
  };

  const actualizar = (payload) => guardar.mutate({ id: editando.id, ...payload }, {
    onSuccess: () => { toast('Movimiento actualizado'); setEditando(null); },
    onError: (e) => toast(e.message, 'error'),
  });

  const eliminar = () => {
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    borrar.mutate(editando.id, { onSuccess: () => { toast('Movimiento eliminado'); setEditando(null); }, onError: (e) => toast(e.message, 'error') });
  };

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const cambiarFiltros = (f) => { setFiltros(f); setPage(1); };

  const formulario = (
    <MovimientoForm onSubmit={crear} guardando={guardar.isPending || guardarPrestamo.isPending} textoBoton="Registrar" autoFocus={nuevo} />
  );

  return (
    <>
      <Cabecera titulo="Registro" subtitulo="Captura y consulta tus movimientos" />
      <div className="grid registro-grid" style={{ alignItems: 'start' }}>
        <div className="grid col-lista">
          <Card>
            <Filtros valor={filtros} onChange={cambiarFiltros} />
          </Card>
          <Card titulo={`${data?.total ?? 0} movimientos`} accion={data && (
            <span className="suave num" style={{ fontSize: 13 }}>
              <span className="positivo">+{din(data.resumen.ingresos)}</span> · <span className="negativo">−{din(data.resumen.gastos)}</span>
            </span>
          )}>
            {isLoading && !items.length ? <Cargando /> : error && !items.length ? <ErrorMsg error={error} /> : items.length === 0 ? <Vacio>No hay movimientos con estos filtros</Vacio> : (
              <div className="lista" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
                {agruparPorDia(items).map((g) => (
                  <div key={g.clave}>
                    <div className="dia-grupo">
                      <span>{g.etiqueta}</span>
                      {g.neto !== 0 && <span className={`num ${g.neto > 0 ? 'positivo' : ''}`} style={{ textTransform: 'none', letterSpacing: 0 }}>{g.neto > 0 ? '+' : '−'}{din(Math.abs(g.neto))}</span>}
                    </div>
                    {g.items.map((m) => (
                      <MovimientoItem key={m.id} m={m} onClick={m.tipo.startsWith('prestamo') || m.pendiente ? undefined : () => setEditando(m)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {totalPaginas > 1 && (
              <div className="acciones" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <button className="btn btn-secundario btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
                <span className="suave" style={{ fontSize: 13 }}>{page} / {totalPaginas}</span>
                <button className="btn btn-secundario btn-sm" disabled={page >= totalPaginas} onClick={() => setPage(page + 1)}>Siguiente →</button>
              </div>
            )}
          </Card>
        </div>
        <Card titulo="Nuevo movimiento" sub="Escribe el monto y presiona Enter" className="col-form">
          {formulario}
        </Card>
      </div>

      {editando && (
        <Modal titulo="Editar movimiento" onClose={() => setEditando(null)}>
          <MovimientoForm inicial={editando} onSubmit={actualizar} guardando={guardar.isPending} permitirPrestamo={false} onCancelar={() => setEditando(null)} />
          {editando.adjunto_url && <AdjuntoVista url={editando.adjunto_url} />}
          <hr style={{ border: 0, borderTop: '1px solid var(--color-borde)', margin: '20px 0' }} />
          <button className="btn btn-peligro btn-sm" onClick={eliminar} disabled={borrar.isPending}>Eliminar movimiento</button>
        </Modal>
      )}
    </>
  );
}

function AdjuntoVista({ url }) {
  const { data } = useQuery({
    queryKey: ['adjunto', url],
    queryFn: async () => URL.createObjectURL(await (await api(url.replace(/^\/api/, ''), { crudo: true })).blob()),
    staleTime: Infinity,
  });
  return data ? <Campo label="Ticket adjunto"><img src={data} alt="Ticket" className="preview-ticket" style={{ maxHeight: 260 }} /></Campo> : null;
}
