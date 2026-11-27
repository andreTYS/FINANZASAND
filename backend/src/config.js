import 'dotenv/config';

function requerida(nombre) {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: requerida('DATABASE_URL'),
  jwtSecret: requerida('JWT_SECRET'),
  jwtRefreshSecret: requerida('JWT_REFRESH_SECRET'),
  accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshTtlDias: Number(process.env.JWT_REFRESH_TTL_DIAS || 30),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || '',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
  corsOrigin: process.env.CORS_ORIGIN || '',
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
};
