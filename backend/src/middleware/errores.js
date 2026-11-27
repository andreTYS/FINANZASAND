import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

export const noEncontrado = (que = 'Recurso') => new HttpError(404, `${que} no encontrado`);

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Archivo inválido: ${err.message}` });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, detalles: err.detalles });
  }
  if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  if (err?.code === '22P02') return res.status(400).json({ error: 'Identificador inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
