import { HttpError } from './errores.js';
const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validarUuid(req, _res, next, valor) {
  if (!RE.test(valor)) return next(new HttpError(400, 'Identificador inválido'));
  next();
}
