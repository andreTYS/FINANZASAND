import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requiereAuth } from './middleware/auth.js';
import { manejarErrores, HttpError } from './middleware/errores.js';
import { validarUuid } from './middleware/uuid.js';
import { query } from './db/pool.js';
import auth from './modules/auth/auth.routes.js';
import categorias from './modules/categorias/categorias.routes.js';
import movimientos from './modules/movimientos/movimientos.routes.js';
import prestamos from './modules/prestamos/prestamos.routes.js';
import dashboard from './modules/dashboard/dashboard.routes.js';
import importExport from './modules/import-export/import-export.routes.js';
import ocr from './modules/ocr/ocr.routes.js';
import automatizaciones from './modules/automatizaciones/automatizaciones.routes.js';
import adjuntos from './modules/adjuntos.routes.js';
import ajustes from './modules/ajustes/ajustes.routes.js';

export function crearApp() {
  const app = express();
  app.set('trust proxy', 1); // detrás de Traefik
  app.use(helmet());
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', auth);

  // Todo lo demás requiere JWT; cada query filtra por req.user.id
  const api = express.Router();
  api.use(requiereAuth);
  for (const r of [movimientos, prestamos, categorias]) r.param('id', validarUuid);
  api.use('/movimientos', movimientos);
  api.use('/prestamos', prestamos);
  api.use('/categorias', categorias);
  api.use('/dashboard', dashboard);
  api.use('/ocr', ocr);
  api.use('/automatizaciones', automatizaciones);
  api.use('/adjuntos', adjuntos);
  api.use('/ajustes', ajustes);
  api.use('/', importExport);
  app.use('/api', api);

  app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
  app.use(manejarErrores);
  return app;
}
