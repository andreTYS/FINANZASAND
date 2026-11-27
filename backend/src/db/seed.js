// Seed del único usuario del sistema (Andre). No hay registro público.
// Uso: SEED_EMAIL=... SEED_PASSWORD=... npm run seed
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

export async function seed({ email, password, nombre = 'Andre' }) {
  if (!email || !password) throw new Error('Define SEED_EMAIL y SEED_PASSWORD');
  if (password.length < 8) throw new Error('SEED_PASSWORD debe tener al menos 8 caracteres');
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (email, nombre, password_hash) VALUES (lower($1), $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, nombre = EXCLUDED.nombre
     RETURNING id, email`,
    [email, nombre, hash],
  );
  return rows[0];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed({ email: process.env.SEED_EMAIL, password: process.env.SEED_PASSWORD, nombre: process.env.SEED_NOMBRE || 'Andre' })
    .then((u) => { console.log(`✔ usuario ${u.email} listo`); return pool.end(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
