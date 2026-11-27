import { Router } from 'express';
import path from 'node:path';
import { config } from '../config.js';
import { noEncontrado } from '../middleware/errores.js';

const router = Router();

// Solo sirve archivos de la carpeta del propio usuario autenticado
router.get('/:archivo', (req, res, next) => {
  const archivo = path.basename(req.params.archivo);
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/.test(archivo)) return next(noEncontrado('Adjunto'));
  const ruta = path.resolve(config.uploadsDir, req.user.id, archivo);
  res.sendFile(ruta, { headers: { 'Cache-Control': 'private, max-age=86400' } }, (err) => {
    if (err) next(noEncontrado('Adjunto'));
  });
});

export default router;
