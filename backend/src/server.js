import { config } from './config.js';
import { crearApp } from './app.js';
import { migrar } from './db/migrate.js';
import { iniciarProgramador } from './modules/alertas/alertas.js';

if (process.env.MIGRATE_ON_START !== 'false') await migrar();

if (process.env.ALERTAS_PROGRAMADOR !== 'false') iniciarProgramador();

crearApp().listen(config.port, () => {
  console.log(`API escuchando en :${config.port}`);
});
