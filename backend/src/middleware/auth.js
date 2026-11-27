import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './errores.js';

/** Exige un access token válido y expone req.user = { id, email }. */
export function requiereAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'No autenticado'));
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: p.sub, email: p.email };
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}
