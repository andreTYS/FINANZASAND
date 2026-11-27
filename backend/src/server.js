import { config } from './config.js';
import { crearApp } from './app.js';
import { migrar } from './db/migrate.js';

if (process.env.MIGRATE_ON_START !== 'false') await migrar();

crearApp().listen(config.port, () => {
  console.log(`API escuchando en :${config.port}`);
});
