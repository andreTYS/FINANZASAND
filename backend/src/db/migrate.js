import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrar() {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ DEFAULT now())`);
  const { rows } = await pool.query('SELECT nombre FROM _migraciones');
  const hechas = new Set(rows.map((r) => r.nombre));
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migraciones (nombre) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`✔ migración ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrar().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
