import { useEffect, useMemo, useRef, useState } from 'react';
import { Campo, Segmentado } from './ui';
import { useCategorias } from '../hooks/useCategorias';
import { aInputFechaHora } from '../lib/formato';

const OPCIONES = [
  { valor: 'gasto', etiqueta: 'Gasto' },
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'prestamo_out', etiqueta: 'Presté' },
  { valor: 'prestamo_in', etiqueta: 'Me prestaron' },
];

const vacio = (tipo = 'gasto') => ({
  tipo, monto: '', fecha_hora: aInputFechaHora(), categoria_id: '', descripcion: '', origen_destino: '', cantidad: '', fecha_limite: '',
});

/**
 * Formulario de captura por teclado (también usado para confirmar datos de OCR).
 * permitirPrestamo: muestra los tipos préstamo dado / recibido.
 * onSubmit recibe el payload limpio listo para la API.
 */
export default function MovimientoForm({ inicial, onSubmit, guardando, textoBoton = 'Guardar', permitirPrestamo = true, tiposBloqueados, onCancelar, autoFocus }) {
  const [f, setF] = useState(() => ({ ...vacio(), ...limpiarInicial(inicial) }));
  const [errores, setErrores] = useState({});
  const montoRef = useRef(null);
  const { data: categorias = [] } = useCategorias();

  // Reinicia solo si cambian los datos iniciales (no la identidad del objeto)
  const claveInicial = JSON.stringify(inicial ?? null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (inicial) setF({ ...vacio(), ...limpiarInicial(inicial) });
  }, [claveInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoFocus) montoRef.current?.focus(); }, [autoFocus]);

  const esPrestamo = f.tipo.startsWith('prestamo');
  const tipoCat = esPrestamo ? 'prestamo' : f.tipo;
  const cats = useMemo(() => categorias.filter((c) => c.tipo === tipoCat), [categorias, tipoCat]);
  const opciones = (tiposBloqueados || (permitirPrestamo ? OPCIONES.map((o) => o.valor) : ['gasto', 'ingreso']))
    .map((v) => OPCIONES.find((o) => o.valor === v));

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const cambiarTipo = (tipo) => setF((p) => ({ ...p, tipo, categoria_id: tipo.startsWith('prestamo') === p.tipo.startsWith('prestamo') && tipo === p.tipo ? p.categoria_id : '' }));

  function enviar(e) {
    e.preventDefault();
    const monto = Number(String(f.monto).replace(',', '.'));
    const err = {};
    if (!Number.isFinite(monto) || monto <= 0) err.monto = 'Ingresa un monto mayor a 0';
    if (!f.fecha_hora) err.fecha_hora = 'Indica la fecha';
    if (esPrestamo && !f.origen_destino.trim()) err.origen_destino = 'Indica la persona o lugar';
    setErrores(err);
    if (Object.keys(err).length) return;
    const base = {
      tipo: f.tipo,
      monto,
      fecha_hora: new Date(f.fecha_hora).toISOString(),
      categoria_id: f.categoria_id || null,
      descripcion: f.descripcion.trim() || null,
    };
    const payload = esPrestamo
      ? { ...base, persona_lugar: f.origen_destino.trim(), fecha_limite: f.fecha_limite || null }
      : { ...base, origen_destino: f.origen_destino.trim() || null, cantidad: f.cantidad ? Number(f.cantidad) : null };
    onSubmit(payload, () => { setF(vacio(f.tipo)); montoRef.current?.focus(); });
  }

  return (
    <form onSubmit={enviar} noValidate>
      <div style={{ display: 'grid', gap: 16 }}>
        {opciones.length > 1 && <Segmentado opciones={opciones} valor={f.tipo} onChange={cambiarTipo} />}
        <Campo label="Monto" error={errores.monto}>
          <input ref={montoRef} className="input input-monto num" inputMode="decimal" placeholder="0.00"
            value={f.monto} onChange={set('monto')} aria-invalid={!!errores.monto} />
        </Campo>
        <div className="form-grid">
          <Campo label="Fecha y hora" error={errores.fecha_hora}>
            <input type="datetime-local" className="input" value={f.fecha_hora} onChange={set('fecha_hora')} />
          </Campo>
          <Campo label="Categoría">
            <select className="select" value={f.categoria_id} onChange={set('categoria_id')}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo label={esPrestamo ? 'Persona o lugar *' : f.tipo === 'ingreso' ? 'Origen' : 'Comercio / destino'} error={errores.origen_destino}>
            <input className="input" value={f.origen_destino} onChange={set('origen_destino')} placeholder={esPrestamo ? 'Ej. Juan, Banco…' : 'Opcional'} />
          </Campo>
          {esPrestamo ? (
            <Campo label="Fecha límite">
              <input type="date" className="input" value={f.fecha_limite} onChange={set('fecha_limite')} />
            </Campo>
          ) : (
            <Campo label="Cantidad">
              <input className="input" inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} placeholder="Opcional" />
            </Campo>
          )}
          <Campo label="Descripción" className="completo">
            <input className="input" value={f.descripcion} onChange={set('descripcion')} placeholder="¿En qué fue?" maxLength={300} />
          </Campo>
        </div>
        <div className="acciones" style={{ marginTop: 0 }}>
          {onCancelar && <button type="button" className="btn btn-fantasma" onClick={onCancelar}>Cancelar</button>}
          <button className="btn btn-primario" disabled={guardando} style={{ minWidth: 140 }}>{guardando ? 'Guardando…' : textoBoton}</button>
        </div>
      </div>
    </form>
  );
}

function limpiarInicial(i) {
  if (!i) return {};
  return {
    tipo: i.tipo || 'gasto',
    monto: i.monto ?? i.monto_original ?? '',
    fecha_hora: i.fecha_hora ? aInputFechaHora(i.fecha_hora) : aInputFechaHora(),
    categoria_id: i.categoria_id || '',
    descripcion: i.descripcion || '',
    origen_destino: i.origen_destino || i.persona_lugar || '',
    cantidad: i.cantidad ?? '',
    fecha_limite: i.fecha_limite ? String(i.fecha_limite).slice(0, 10) : '',
  };
}
