import crypto from 'node:crypto';
import { config } from '../config.js';

// Clave derivada de SETTINGS_SECRET (o JWT_SECRET si no se define). Si cambia, hay que volver a ingresar la API key.
const clave = () => crypto.createHash('sha256').update(`ajustes:${config.settingsSecret}`).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

export function descifrar(valor) {
  if (!valor) return null;
  try {
    const [, iv, tag, datos] = valor.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null; // clave cambiada o dato corrupto
  }
}
