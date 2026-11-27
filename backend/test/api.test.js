// Pruebas de integración contra una BD real de Postgres.
// Uso: DATABASE_URL=postgres://.../finanzas_test npm test   (¡la BD se vacía!)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

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

let base, server;
const tokens = {};

async function api(quien, metodo, ruta, body, extra = {}) {
  const headers = { ...(extra.headers || {}) };
  if (tokens[quien]) headers.Authorization = `Bearer ${tokens[quien]}`;
  let cuerpo;
  if (body instanceof FormData) cuerpo = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; cuerpo = JSON.stringify(body); }
  const r = await fetch(base + ruta, { method: metodo, headers, body: cuerpo });
  const tipo = r.headers.get('content-type') || '';
  const data = tipo.includes('json') ? await r.json() : await r.arrayBuffer();
  return { status: r.status, data, headers: r.headers };
}

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrar();
  await seed({ email: 'andre@test.local', password: 'clave-andre-1' });
  await seed({ email: 'otro@test.local', password: 'clave-otro-1', nombre: 'Otro' });
  server = crearApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server.close(); await pool.end(); });

test('login inválido y válido + refresh con rotación', async () => {
  assert.equal((await api(null, 'POST', '/auth/login', { email: 'andre@test.local', password: 'mal' })).status, 401);
  const r = await api(null, 'POST', '/auth/login', { email: 'andre@test.local', password: 'clave-andre-1' });
  assert.equal(r.status, 200);
  tokens.andre = r.data.accessToken;
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const ref = await api(null, 'POST', '/auth/refresh', undefined, { headers: { Cookie: cookie } });
  assert.equal(ref.status, 200);
  assert.ok(ref.data.accessToken);
  // reutilizar el refresh viejo => rechazado
  assert.equal((await api(null, 'POST', '/auth/refresh', undefined, { headers: { Cookie: cookie } })).status, 401);
  const o = await api(null, 'POST', '/auth/login', { email: 'otro@test.local', password: 'clave-otro-1' });
  tokens.otro = o.data.accessToken;
  assert.equal((await api(null, 'GET', '/movimientos')).status, 401);
});

let movId;
test('CRUD movimientos + aislamiento por usuario', async () => {
  const cats = (await api('andre', 'GET', '/categorias')).data;
  const comida = cats.find((c) => c.nombre === 'Comida');
  const c = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 25.555, fecha_hora: new Date().toISOString(), descripcion: 'Almuerzo', categoria_id: comida.id });
  assert.equal(c.status, 201);
  assert.equal(c.data.monto, 25.56);
  movId = c.data.id;
  await api('andre', 'POST', '/movimientos', { tipo: 'ingreso', monto: 1000, fecha_hora: new Date().toISOString(), descripcion: 'Sueldo' });

  const l = await api('andre', 'GET', '/movimientos?tipo=gasto&q=almu');
  assert.equal(l.data.total, 1);
  assert.equal(l.data.items[0].categoria_nombre, 'Comida');

  // El otro usuario no ve ni edita ni borra
  assert.equal((await api('otro', 'GET', '/movimientos')).data.total, 0);
  assert.equal((await api('otro', 'GET', `/movimientos/${movId}`)).status, 404);
  assert.equal((await api('otro', 'PUT', `/movimientos/${movId}`, { tipo: 'gasto', monto: 1, fecha_hora: new Date().toISOString() })).status, 404);
  assert.equal((await api('otro', 'DELETE', `/movimientos/${movId}`)).status, 404);

  const u = await api('andre', 'PUT', `/movimientos/${movId}`, { tipo: 'gasto', monto: 30, fecha_hora: new Date().toISOString(), descripcion: 'Almuerzo', categoria_id: comida.id });
  assert.equal(u.data.monto, 30);
  assert.equal((await api('andre', 'GET', '/movimientos/no-es-uuid')).status, 400);
});

test('categorías propias aisladas', async () => {
  const c = await api('otro', 'POST', '/categorias', { nombre: 'Secreta', tipo: 'gasto', color: '#123456' });
  assert.equal(c.status, 201);
  assert.ok(!(await api('andre', 'GET', '/categorias')).data.some((x) => x.nombre === 'Secreta'));
  const r = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 1, fecha_hora: new Date().toISOString(), categoria_id: c.data.id });
  assert.equal(r.status, 400);
});

test('préstamos con abonos y estados', async () => {
  const p = await api('andre', 'POST', '/prestamos', { tipo: 'prestamo_out', persona_lugar: 'Juan', monto: 100, fecha_hora: new Date().toISOString(), fecha_limite: '2020-01-01' });
  assert.equal(p.status, 201);
  assert.equal(p.data.estado, 'pendiente');
  assert.equal((await api('andre', 'POST', `/prestamos/${p.data.id}/abonos`, { monto: 150 })).status, 400);
  const a = await api('andre', 'POST', `/prestamos/${p.data.id}/abonos`, { monto: 40 });
  assert.equal(a.data.prestamo.estado, 'pagado_parcial');
  assert.equal(a.data.prestamo.saldo_pendiente, 60);
  assert.equal((await api('otro', 'POST', `/prestamos/${p.data.id}/abonos`, { monto: 1 })).status, 404);
  const det = await api('andre', 'GET', `/prestamos/${p.data.id}`);
  assert.equal(det.data.vencido, true);
  assert.equal(det.data.abonos.length, 1);
  assert.equal((await api('andre', 'PUT', `/prestamos/${p.data.id}`, { tipo: 'prestamo_out', persona_lugar: 'Juan', monto: 30, fecha_hora: new Date().toISOString() })).status, 400);
  const b = await api('andre', 'POST', `/prestamos/${p.data.id}/abonos`, { monto: 60 });
  assert.equal(b.data.prestamo.estado, 'pagado_cobrado');
  const rev = await api('andre', 'DELETE', `/prestamos/${p.data.id}/abonos/${b.data.abono.id}`);
  assert.equal(rev.data.estado, 'pagado_parcial');
  // no se puede borrar un préstamo como movimiento simple
  assert.equal((await api('andre', 'DELETE', `/movimientos/${p.data.movimiento_id}`)).status, 404);
  await api('andre', 'POST', '/prestamos', { tipo: 'prestamo_in', persona_lugar: 'Banco', monto: 500, fecha_hora: new Date().toISOString() });
});

test('dashboard', async () => {
  const d = await api('andre', 'GET', '/dashboard');
  assert.equal(d.status, 200);
  // 1000 - 30 - 100 + 40 (abono cobrado) + 500 (préstamo recibido)
  assert.equal(d.data.balance, 1410);
  assert.equal(d.data.mes.ingresos, 1000);
  assert.equal(d.data.mes.gastos, 30);
  assert.equal(d.data.prestamos.por_cobrar, 60);
  assert.equal(d.data.prestamos.por_pagar, 500);
  assert.equal(d.data.flujo_caja.length, 6);
  assert.equal(d.data.top_categorias[0].nombre, 'Comida');
  assert.equal((await api('otro', 'GET', '/dashboard')).data.balance, 0);
  const t = new Date();
  const hoy = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const m = await api('andre', 'GET', `/dashboard/metricas?desde=${hoy}&hasta=${hoy}`);
  assert.equal(m.data.totales.gastos, 30);
});

test('import CSV con duplicados + export', async () => {
  const hoy = new Date();
  const f = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
  const csv = `Fecha;Tipo;Concepto;Categoría;Importe\n${f};gasto;Almuerzo;Comida;30,00\n${f};gasto;Taxi;Transporte;12,5\n${f};gasto;Taxi;Transporte;12,5\nmal;gasto;x;;1\n2026-02-01;;Venta;Ventas;200\n`;
  const fd = () => { const x = new FormData(); x.append('archivo', new Blob([csv], { type: 'text/csv' }), 'datos.csv'); return x; };
  const pv = await api('andre', 'POST', '/import?modo=preview', fd());
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.data.resumen, { filas_totales: 5, validas: 4, errores: 1, duplicadas: 2 });
  const im = await api('andre', 'POST', '/import?modo=importar', fd());
  assert.equal(im.data.resumen.importadas, 2);
  const again = await api('andre', 'POST', '/import?modo=preview', fd());
  assert.equal(again.data.resumen.duplicadas, 4);

  for (const formato of ['csv', 'xlsx', 'pdf']) {
    const e = await api('andre', 'GET', `/export?formato=${formato}`);
    assert.equal(e.status, 200, formato);
    assert.ok(e.data.byteLength > 100, formato);
  }
  const ex = await api('andre', 'GET', '/export?formato=xlsx');
  const fd2 = new FormData();
  fd2.append('archivo', new Blob([ex.data]), 'export.xlsx');
  const re = await api('andre', 'POST', '/import?modo=preview', fd2);
  assert.equal(re.status, 200);
  assert.ok(re.data.resumen.duplicadas >= 4, JSON.stringify(re.data.resumen));
});

test('OCR sin API key -> 503 y scan requiere token válido', async () => {
  const fd = new FormData();
  fd.append('imagen', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 't.jpg');
  assert.equal((await api('andre', 'POST', '/ocr/scan', fd)).status, 503);
  const r = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 5, fecha_hora: new Date().toISOString(), created_via: 'scan', scan_token: crypto.randomUUID() });
  assert.equal(r.status, 400);
});

test('scan con Gemini simulado: precarga sin guardar y guarda solo al confirmar', async () => {
  const { config } = await import('../src/config.js');
  const fetchReal = globalThis.fetch;
  config.geminiApiKey = 'clave-falsa';
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ monto: 58.4, fecha: '2026-03-10', hora: '19:05', comercio: 'Tottus', descripcion: 'Compras', categoria_sugerida: 'Supermercado', confianza: 0.92 }) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return fetchReal(url, opts);
  };
  try {
    const antes = (await api('andre', 'GET', '/movimientos')).data.total;
    const fd = new FormData();
    fd.append('imagen', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 't.jpg');
    const s = await api('andre', 'POST', '/ocr/scan', fd);
    assert.equal(s.status, 200);
    assert.equal(s.data.prellenado.monto, 58.4);
    assert.equal(s.data.prellenado.fecha_hora, '2026-03-10T19:05');
    assert.equal(s.data.prellenado.origen_destino, 'Tottus');
    assert.ok(s.data.prellenado.categoria_id);
    assert.equal((await api('andre', 'GET', '/movimientos')).data.total, antes, 'el scan no debe guardar');
    // otro usuario no puede usar el token
    assert.equal((await api('otro', 'POST', '/movimientos', { tipo: 'gasto', monto: 58.4, fecha_hora: new Date().toISOString(), created_via: 'scan', scan_token: s.data.scan_token })).status, 400);
    const c = await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 60, fecha_hora: '2026-03-10T19:05:00', created_via: 'scan', scan_token: s.data.scan_token, categoria_id: s.data.prellenado.categoria_id });
    assert.equal(c.status, 201);
    assert.equal(c.data.created_via, 'scan');
    assert.ok(c.data.adjunto_url);
    const det = await api('andre', 'GET', `/movimientos/${c.data.id}`);
    assert.equal(det.data.adjuntos[0].ocr_raw_json.extraido.comercio, 'Tottus');
    const img = await api('andre', 'GET', c.data.adjunto_url.replace('/api', ''));
    assert.equal(img.status, 200);
    assert.equal((await api('otro', 'GET', c.data.adjunto_url.replace('/api', ''))).status, 404);
    // token ya consumido
    assert.equal((await api('andre', 'POST', '/movimientos', { tipo: 'gasto', monto: 1, fecha_hora: new Date().toISOString(), created_via: 'scan', scan_token: s.data.scan_token })).status, 400);
  } finally {
    globalThis.fetch = fetchReal;
    config.geminiApiKey = '';
  }
});
