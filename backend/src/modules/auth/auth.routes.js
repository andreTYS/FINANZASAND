import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errores.js';
import { requiereAuth } from '../../middleware/auth.js';

const router = Router();
const COOKIE = 'refresh_token';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const cookieOpts = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: config.refreshTtlDias * 24 * 3600 * 1000,
});

function firmarAccess(u) {
  return jwt.sign({ sub: u.id, email: u.email }, config.jwtSecret, { expiresIn: config.accessTtl });
}

async function emitirRefresh(res, usuarioId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: usuarioId, jti }, config.jwtRefreshSecret, { expiresIn: `${config.refreshTtlDias}d` });
  await query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [usuarioId, sha256(token), config.refreshTtlDias],
  );
  res.cookie(COOKIE, token, cookieOpts());
}

const publico = (u) => ({ id: u.id, email: u.email, nombre: u.nombre });

// Limitador simple en memoria contra fuerza bruta (1 instancia, 1 usuario)
const intentos = new Map();
function limitar(req) {
  const k = req.ip;
  const ahora = Date.now();
  const e = intentos.get(k) || { n: 0, desde: ahora };
  if (ahora - e.desde > 15 * 60 * 1000) { e.n = 0; e.desde = ahora; }
  e.n += 1;
  intentos.set(k, e);
  if (e.n > 10) throw new HttpError(429, 'Demasiados intentos, espera unos minutos');
}

router.post('/login', async (req, res) => {
  limitar(req);
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const { rows } = await query('SELECT * FROM usuarios WHERE email = lower($1)', [email]);
  const u = rows[0];
  const ok = u && (await bcrypt.compare(password, u.password_hash));
  if (!ok) throw new HttpError(401, 'Credenciales incorrectas');
  intentos.delete(req.ip);
  await emitirRefresh(res, u.id);
  res.json({ accessToken: firmarAccess(u), usuario: publico(u) });
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Sin sesión');
  let p;
  try { p = jwt.verify(token, config.jwtRefreshSecret); } catch { throw new HttpError(401, 'Sesión expirada'); }
  // Rotación: el refresh usado se revoca y se emite uno nuevo
  const { rows } = await query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING usuario_id`,
    [sha256(token)],
  );
  if (!rows[0]) {
    // Reutilización de un token revocado => revocar toda la familia por seguridad
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE usuario_id = $1 AND revoked_at IS NULL', [p.sub]);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    throw new HttpError(401, 'Sesión inválida');
  }
  const u = (await query('SELECT * FROM usuarios WHERE id = $1', [rows[0].usuario_id])).rows[0];
  if (!u) throw new HttpError(401, 'Sesión inválida');
  await emitirRefresh(res, u.id);
  res.json({ accessToken: firmarAccess(u), usuario: publico(u) });
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

router.get('/me', requiereAuth, async (req, res) => {
  const { rows } = await query('SELECT id, email, nombre FROM usuarios WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Usuario no existe');
  res.json(rows[0]);
});

router.post('/cambiar-password', requiereAuth, async (req, res) => {
  const { actual, nueva } = z.object({ actual: z.string().min(1), nueva: z.string().min(8) }).parse(req.body);
  const u = (await query('SELECT * FROM usuarios WHERE id = $1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(actual, u.password_hash))) throw new HttpError(400, 'La contraseña actual no coincide');
  await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(nueva, 12), u.id]);
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE usuario_id = $1 AND revoked_at IS NULL', [u.id]);
  await emitirRefresh(res, u.id);
  res.json({ ok: true });
});

export default router;
