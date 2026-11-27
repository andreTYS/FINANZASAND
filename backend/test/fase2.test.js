// Fase 2: categorización automática, alertas + n8n, idempotencia para sync offline.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

process.env.JWT_SECRET ||= 'test_a';
process.env.JWT_REFRESH_SECRET ||= 'test_r';
process.env.COOKIE_SECURE = 'false';
process.env.GEMINI_API_KEY = '';
process.env.N8N_WEBHOOK_URL = '';
process.env.UPLOADS_DIR = './uploads-test';

const { pool } = await import('../src/db/pool.js');
const { migrar } = await import('../src/db/migrate.js');
const { seed } = await import('../src/db/seed.js');
const { crearApp } = await import('../src/app.js');
const { revisionPeriodica } = await import('../src/modules/alertas/alertas.js');

let base, server, hook, hookUrl;
const recibidos = [];
const tokens = {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(quien, metodo, ruta, body, headers = {}) {
  const h = { ...headers };
  if (tokens[quien]) h.Authorization = `Bearer ${tokens[quien]}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(base + ruta, { method: metodo, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: r.status === 204 ? null : await r.json() };
}
const ahora = () => new Date().toISOString();
const cat = async (nombre) => (await api('andre', 'GET', '/categorias')).data.find((c) => c.nombre === nombre);

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrar();
  await seed({ email: 'andre@test.local', password: 'clave-andre-1' });
  await seed({ email: 'otro@test.local', password: 'clave-otro-1', nombre: 'Otro' });
  server = crearApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  // webhook falso de n8n
  hook = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { recibidos.push(JSON.parse(b)); res.end('ok'); });
  }).listen(0);
  hookUrl = `http://127.0.0.1:${hook.address().port}/webhook`;
  for (const [q, e, p] of [['andre', 'andre@test.local', 'clave-andre-1'], ['otro', 'otro@test.local', 'clave-otro-1']]) {
    tokens[q] = (await api(null, 'POST', '/auth/login', { email: e, password: p })).data.accessToken;
  }
});
after(async () => { server.close(); hook.close(); await pool.end(); });

test('categorización automática: palabras clave, historial y respeto a la elección del usuario', async () => {
  const taxi = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 12, fecha_hora: ahora(), descripcion: 'Taxi al trabajo' });
  assert.equal(taxi.data.categoria_auto, true);
  assert.equal(taxi.data.categoria_id, (await cat('Transporte')).id);

  // Historial: "Don Pepe" lo categorizo a mano como Comida → luego se aprende
  const comida = await cat('Comida');
  await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 20, fecha_hora: ahora(), origen_destino: 'Don Pepe', categoria_id: comida.id });
  const sug = await api('andre', 'GET', '/categorias/sugerir?tipo=gasto&origen_destino=don%20pepe');
  assert.equal(sug.data.sugerencia.categoria_id, comida.id);
  assert.equal(sug.data.sugerencia.fuente, 'historial');
  const otro = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 25, fecha_hora: ahora(), origen_destino: 'Don Pepe' });
  assert.equal(otro.data.categoria_id, comida.id);
  assert.equal(otro.data.categoria_auto, true);

  // El historial de otro usuario no influye
  assert.equal((await api('otro', 'GET', '/categorias/sugerir?tipo=gasto&origen_destino=don%20pepe')).data.sugerencia, null);

  // Sin pistas => sin categoría; auto_categorizar=false => respeta
  const nada = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 5, fecha_hora: ahora(), descripcion: 'xyz' });
  assert.equal(nada.data.categoria_id, null);
  const sinAuto = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 5, fecha_hora: ahora(), descripcion: 'Uber', auto_categorizar: false });
  assert.equal(sinAuto.data.categoria_id, null);

  // Al editar y cambiar la categoría deja de ser "auto"
  const ocio = await cat('Ocio');
  const ed = await api('andre', 'PUT', `/movimientos/${taxi.data.id}`, { tipo: 'gasto', monto: 12, fecha_hora: ahora(), descripcion: 'Taxi al trabajo', categoria_id: ocio.id });
  assert.equal(ed.data.categoria_auto, false);
});

test('idempotencia para sincronización offline (id generado en el cliente)', async () => {
  const id = crypto.randomUUID();
  const body = { id, tipo: 'gasto', monto: 9.9, fecha_hora: ahora(), descripcion: 'Offline' };
  const a = await api('andre', 'POST', '/movimientos', body);
  const b = await api('andre', 'POST', '/movimientos', body);
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.data.duplicado, true);
  assert.equal((await pool.query('SELECT count(*)::int n FROM movimientos WHERE id = $1', [id])).rows[0].n, 1);
  assert.equal((await api('otro', 'POST', '/movimientos', body)).status, 409);

  const pid = crypto.randomUUID();
  const pb = { id: pid, tipo: 'prestamo_out', persona_lugar: 'Ana', monto: 100, fecha_hora: ahora() };
  const p1 = await api('andre', 'POST', '/prestamos', pb);
  const p2 = await api('andre', 'POST', '/prestamos', pb);
  assert.equal(p1.data.id, p2.data.id);
  const aid = crypto.randomUUID();
  await api('andre', 'POST', `/prestamos/${p1.data.id}/abonos`, { id: aid, monto: 30 });
  const rep = await api('andre', 'POST', `/prestamos/${p1.data.id}/abonos`, { id: aid, monto: 30 });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.prestamo.saldo_pendiente, 70, 'el abono repetido no descuenta dos veces');
});

test('alertas: gasto grande, presupuesto 80%/100% y envío a n8n sin duplicados', async () => {
  await api('andre', 'PUT', '/ajustes', { n8n_webhook_url: hookUrl, alerta_gasto_grande: 500 });
  const sup = await cat('Supermercado');
  assert.equal((await api('andre', 'PUT', `/categorias/${sup.id}/presupuesto`, { monto_mensual: 100 })).status, 200);
  assert.equal((await api('andre', 'PUT', `/categorias/${(await cat('Sueldo')).id}/presupuesto`, { monto_mensual: 100 })).status, 400);
  assert.equal((await cat('Supermercado')).presupuesto, 100);

  await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 85, fecha_hora: ahora(), categoria_id: sup.id });
  await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 5, fecha_hora: ahora(), categoria_id: sup.id }); // sigue en 80-99%: sin duplicar
  await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 20, fecha_hora: ahora(), categoria_id: sup.id });
  await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 600, fecha_hora: ahora(), descripcion: 'Laptop' });
  await espera(400);

  const al = await api('andre', 'GET', '/alertas');
  const tipos = al.data.items.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ['gasto_grande', 'presupuesto_80', 'presupuesto_excedido']);
  assert.equal(al.data.no_leidas, 3);
  assert.ok(al.data.items.every((a) => a.estado_envio === 'enviado'));
  const evAlertas = recibidos.filter((r) => r.evento.startsWith('alerta.')).map((r) => r.evento).sort();
  assert.deepEqual(evAlertas, ['alerta.gasto_grande', 'alerta.presupuesto_80', 'alerta.presupuesto_excedido']);
  assert.equal((await api('otro', 'GET', '/alertas')).data.items.length, 0);

  await api('andre', 'POST', `/alertas/${al.data.items[0].id}/leida`);
  assert.equal((await api('andre', 'GET', '/alertas')).data.no_leidas, 2);
  await api('andre', 'POST', '/alertas/leer-todas');
  assert.equal((await api('andre', 'GET', '/alertas')).data.no_leidas, 0);
  assert.equal((await api('otro', 'POST', `/alertas/${al.data.items[0].id}/leida`)).status, 404);
});

test('alertas de préstamos por vencer y vencidos (revisión periódica, sin duplicar)', async () => {
  const hoy = new Date();
  const f = (d) => { const x = new Date(hoy); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  await api('andre', 'POST', '/prestamos', { tipo: 'prestamo_out', persona_lugar: 'Beto', monto: 50, fecha_hora: ahora(), fecha_limite: f(2) });
  await api('andre', 'POST', '/prestamos', { tipo: 'prestamo_in', persona_lugar: 'Banco', monto: 80, fecha_hora: ahora(), fecha_limite: f(-1) });
  await api('andre', 'POST', '/prestamos', { tipo: 'prestamo_out', persona_lugar: 'Lejano', monto: 80, fecha_hora: ahora(), fecha_limite: f(30) });
  await espera(300);
  await revisionPeriodica();
  await revisionPeriodica();
  const { rows } = await pool.query(`SELECT tipo, titulo FROM alertas WHERE tipo LIKE 'prestamo%' ORDER BY tipo`);
  assert.deepEqual(rows.map((r) => r.tipo), ['prestamo_por_vencer', 'prestamo_vencido']);
  assert.ok(rows.some((r) => r.titulo.includes('Beto')) && rows.some((r) => r.titulo.includes('Banco')));
  assert.ok(recibidos.some((r) => r.evento === 'alerta.prestamo_vencido'));
});

test('n8n escribe de vuelta con token de integración', async () => {
  const mov = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 7, fecha_hora: ahora(), descripcion: 'cosa rara' });
  assert.equal(mov.data.categoria_id, null);
  assert.equal((await fetch(`${base}/n8n/categorias`)).status, 401);
  assert.equal((await fetch(`${base}/n8n/categorias`, { headers: { Authorization: `Bearer ${tokens.andre}` } })).status, 401, 'el JWT no sirve aquí');

  const { data } = await api('andre', 'POST', '/ajustes/n8n-token');
  assert.match(data.token, /^fin_/);
  assert.equal((await api('andre', 'GET', '/ajustes')).data.n8n_token.configurado, true);
  const n8n = (ruta, init = {}) => fetch(`${base}/n8n${ruta}`, { ...init, headers: { 'X-Api-Key': data.token, 'Content-Type': 'application/json' } });

  assert.ok((await (await n8n('/categorias')).json()).length > 5);
  const r = await n8n(`/movimientos/${mov.data.id}/categoria`, { method: 'PATCH', body: JSON.stringify({ categoria_nombre: 'ocio' }) });
  assert.equal(r.status, 200);
  const det = await api('andre', 'GET', `/movimientos/${mov.data.id}`);
  assert.equal(det.data.categoria_nombre, 'Ocio');
  assert.equal(det.data.categoria_auto, true);

  // No pisa una categoría elegida por el usuario
  const manual = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 7, fecha_hora: ahora(), categoria_id: (await cat('Salud')).id });
  assert.equal((await n8n(`/movimientos/${manual.data.id}/categoria`, { method: 'PATCH', body: JSON.stringify({ categoria_nombre: 'Ocio' }) })).status, 409);
  // No accede a movimientos de otro usuario
  const ajeno = await api('otro', 'POST', '/movimientos', { tipo: 'gasto', monto: 1, fecha_hora: ahora() });
  assert.equal((await n8n(`/movimientos/${ajeno.data.id}/categoria`, { method: 'PATCH', body: JSON.stringify({ categoria_nombre: 'Ocio' }) })).status, 404);

  await api('andre', 'DELETE', '/ajustes/n8n-token');
  assert.equal((await n8n('/categorias')).status, 401);
});

test('import categoriza automáticamente las filas sin categoría', async () => {
  const csv = 'fecha,tipo,descripcion,monto\n2026-01-10,gasto,Uber aeropuerto,30\n2026-01-11,gasto,Algo raro,10\n';
  const fd = new FormData();
  fd.append('archivo', new Blob([csv], { type: 'text/csv' }), 'x.csv');
  const r = await fetch(`${base}/import?modo=preview`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.andre}` }, body: fd });
  const d = await r.json();
  assert.equal(d.filas[0].datos.categoria_nombre, 'Transporte (auto)');
  assert.equal(d.filas[1].datos.categoria_id, null);
});
