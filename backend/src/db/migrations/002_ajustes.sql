-- Ajustes editables desde la app (Configuración). Tienen prioridad sobre las variables de entorno.
-- La API key de Gemini se guarda cifrada (AES-256-GCM) y nunca se devuelve al cliente.
CREATE TABLE ajustes (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  gemini_api_key_cifrada TEXT,
  gemini_model TEXT,
  n8n_webhook_url TEXT,
  moneda TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
