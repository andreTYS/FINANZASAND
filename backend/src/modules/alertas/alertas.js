import { query } from '../../db/pool.js';
import { obtenerAjustes } from '../ajustes/ajustes.routes.js';
import { enviarAN8n, registrarAutomatizacion } from '../automatizaciones/n8n.js';

const fmt = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesDe = (d) => { const f = new Date(d); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; };

/**
 * Crea la alerta si no existía (la "clave" evita duplicados) y, solo si es nueva, la envía a n8n.
 * Devuelve la alerta creada o null si ya existía.
 */
export async function crearAlerta(usuarioId, { tipo, clave, titulo, mensaje, datos = {} }) {
  const { rows } = await query(
    `INSERT INTO alertas (usuario_id, tipo, clave, titulo, mensaje, datos) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (usuario_id, clave) DO NOTHING RETURNING *`,
    [usuarioId, tipo, clave, titulo, mensaje, datos],
  );
  const alerta = rows[0];
  if (!alerta) return null;
  const payload = { evento: `alerta.${tipo}`, alerta: { id: alerta.id, tipo, titulo, mensaje, datos }, enviado_en: new Date().toISOString() };
  const estado = await enviarAN8n(usuarioId, payload);
  await query('UPDATE alertas SET estado_envio = $2 WHERE id = $1', [alerta.id, estado]);
  await registrarAutomatizacion({ usuarioId, movimientoId: datos.movimiento_id ?? null, workflow: payload.evento, estado, payload });
  return { ...alerta, estado_envio: estado };
}

/** Alertas que dependen de un movimiento recién creado: gasto grande y presupuesto de su categoría. */
export async function evaluarAlertasMovimiento(mov) {
  if (mov.tipo !== 'gasto') return [];
  const uid = mov.usuario_id;
  const aj = await obtenerAjustes(uid);
  const creadas = [];

  if (aj.alertaGastoGrande && mov.monto >= aj.alertaGastoGrande) {
    creadas.push(await crearAlerta(uid, {
      tipo: 'gasto_grande',
      clave: `gasto_grande:${mov.id}`,
      titulo: 'Gasto grande registrado',
      mensaje: `Registraste un gasto de ${fmt(mov.monto)}${mov.descripcion ? ` (${mov.descripcion})` : ''}, que supera tu umbral de ${fmt(aj.alertaGastoGrande)}.`,
      datos: { movimiento_id: mov.id, monto: mov.monto, umbral: aj.alertaGastoGrande },
    }));
  }

  if (aj.alertaPresupuesto && mov.categoria_id) {
    const mes = mesDe(mov.fecha_hora);
    const { rows } = await query(
      `SELECT p.monto_mensual, c.nombre,
              COALESCE((SELECT sum(m.monto) FROM movimientos m
                        WHERE m.usuario_id = $1 AND m.categoria_id = $2 AND m.tipo = 'gasto'
                          AND m.fecha_hora >= $3::date AND m.fecha_hora < ($3::date + interval '1 month')), 0) AS gastado
       FROM presupuestos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.usuario_id = $1 AND p.categoria_id = $2`,
      [uid, mov.categoria_id, `${mes}-01`],
    );
    const p = rows[0];
    if (p) {
      const pct = (p.gastado / p.monto_mensual) * 100;
      const base = { categoria_id: mov.categoria_id, categoria: p.nombre, mes, gastado: p.gastado, presupuesto: p.monto_mensual, porcentaje: Math.round(pct), movimiento_id: mov.id };
      if (pct >= 100) {
        creadas.push(await crearAlerta(uid, {
          tipo: 'presupuesto_excedido', clave: `presupuesto_excedido:${mov.categoria_id}:${mes}`,
          titulo: `Presupuesto de ${p.nombre} excedido`,
          mensaje: `Llevas ${fmt(p.gastado)} en ${p.nombre} este mes (${Math.round(pct)}% de ${fmt(p.monto_mensual)}).`,
          datos: base,
        }));
      } else if (pct >= 80) {
        creadas.push(await crearAlerta(uid, {
          tipo: 'presupuesto_80', clave: `presupuesto_80:${mov.categoria_id}:${mes}`,
          titulo: `${p.nombre}: 80% del presupuesto`,
          mensaje: `Llevas ${fmt(p.gastado)} de ${fmt(p.monto_mensual)} en ${p.nombre} este mes (${Math.round(pct)}%).`,
          datos: base,
        }));
      }
    }
  }
  return creadas.filter(Boolean);
}

/** Préstamos abiertos por vencer (dentro de N días) o vencidos. Una alerta por préstamo, estado y fecha límite. */
export async function evaluarAlertasPrestamos(usuarioId) {
  const aj = await obtenerAjustes(usuarioId);
  const { rows } = await query(
    `SELECT p.id, p.persona_lugar, p.saldo_pendiente, p.fecha_limite, m.tipo, m.id AS movimiento_id,
            (p.fecha_limite - CURRENT_DATE) AS dias
     FROM prestamos p JOIN movimientos m ON m.id = p.movimiento_id
     WHERE m.usuario_id = $1 AND p.estado <> 'pagado_cobrado' AND p.fecha_limite IS NOT NULL
       AND p.fecha_limite <= CURRENT_DATE + $2::int`,
    [usuarioId, aj.alertaPrestamoDias],
  );
  const creadas = [];
  for (const p of rows) {
    const quien = p.tipo === 'prestamo_out' ? `${p.persona_lugar} te debe` : `Le debes a ${p.persona_lugar}`;
    const datos = { prestamo_id: p.id, movimiento_id: p.movimiento_id, persona: p.persona_lugar, saldo: p.saldo_pendiente, fecha_limite: p.fecha_limite, direccion: p.tipo };
    if (p.dias < 0) {
      creadas.push(await crearAlerta(usuarioId, {
        tipo: 'prestamo_vencido', clave: `prestamo_vencido:${p.id}:${p.fecha_limite}`,
        titulo: `Préstamo vencido: ${p.persona_lugar}`,
        mensaje: `${quien} ${fmt(p.saldo_pendiente)}; venció el ${p.fecha_limite}.`, datos,
      }));
    } else if (aj.alertaPrestamoDias > 0) {
      creadas.push(await crearAlerta(usuarioId, {
        tipo: 'prestamo_por_vencer', clave: `prestamo_por_vencer:${p.id}:${p.fecha_limite}`,
        titulo: `Préstamo por vencer: ${p.persona_lugar}`,
        mensaje: `${quien} ${fmt(p.saldo_pendiente)}; vence ${p.dias === 0 ? 'hoy' : p.dias === 1 ? 'mañana' : `en ${p.dias} días`} (${p.fecha_limite}).`, datos,
      }));
    }
  }
  return creadas.filter(Boolean);
}

/** Revisión periódica (préstamos) para todos los usuarios. */
export async function revisionPeriodica() {
  const { rows } = await query('SELECT id FROM usuarios');
  for (const u of rows) {
    try { await evaluarAlertasPrestamos(u.id); } catch (e) { console.error('revisión de alertas', e.message); }
  }
}

export function iniciarProgramador(intervaloMs = 60 * 60 * 1000) {
  const correr = () => revisionPeriodica().catch((e) => console.error('programador alertas', e.message));
  setTimeout(correr, 10_000).unref();
  setInterval(correr, intervaloMs).unref();
}
