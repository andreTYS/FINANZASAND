import pg from 'pg';
import { config } from '../config.js';

// NUMERIC -> number (montos con 2 decimales caben sin pérdida en double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE -> 'YYYY-MM-DD' (sin conversión de zona horaria)
pg.types.setTypeParser(1082, (v) => v);

// Misma zona horaria en Node y en Postgres para que "mes actual" y los rangos de fechas coincidan
const tz = (process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone).replace(/[^\w/+-]/g, '');
export const pool = new pg.Pool({ connectionString: config.databaseUrl, options: `-c timezone=${tz}` });

export const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción. */
export async function transaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
