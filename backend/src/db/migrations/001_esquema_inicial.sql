-- Esquema base (CLAUDE.md §4) + ajustes mínimos documentados:
--   * categorias.usuario_id: NULL = categoría global por defecto, con valor = categoría propia del usuario.
--   * refresh_tokens: rotación/revocación de refresh tokens.
--   * movimientos.updated_at y prestamos.created_at para auditoría.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  color TEXT,
  icono TEXT,
  tipo TEXT CHECK (tipo IN ('ingreso','gasto','prestamo'))
);
CREATE UNIQUE INDEX categorias_unicas ON categorias (COALESCE(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre), tipo);

CREATE TABLE movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto','prestamo_out','prestamo_in')),
  descripcion TEXT,
  cantidad NUMERIC,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_hora TIMESTAMPTZ NOT NULL,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  origen_destino TEXT,
  adjunto_url TEXT,
  created_via TEXT CHECK (created_via IN ('teclado','scan','import')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX movimientos_usuario_fecha ON movimientos (usuario_id, fecha_hora DESC);

CREATE TABLE prestamos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL UNIQUE REFERENCES movimientos(id) ON DELETE CASCADE,
  persona_lugar TEXT,
  monto_original NUMERIC(12,2),
  saldo_pendiente NUMERIC(12,2),
  fecha_limite DATE,
  estado TEXT CHECK (estado IN ('pendiente','pagado_parcial','pagado_cobrado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE abonos_prestamo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id UUID NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) CHECK (monto > 0),
  fecha TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  url TEXT,
  tipo TEXT,
  ocr_raw_json JSONB
);

CREATE TABLE importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  archivo TEXT,
  filas_totales INT,
  filas_importadas INT,
  filas_duplicadas INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE automatizaciones_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  workflow_n8n TEXT,
  estado TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categorías globales por defecto
INSERT INTO categorias (nombre, color, icono, tipo) VALUES
  ('Sueldo',          '#16a34a', '💼', 'ingreso'),
  ('Ventas',          '#22c55e', '🛒', 'ingreso'),
  ('Otros ingresos',  '#4ade80', '➕', 'ingreso'),
  ('Comida',          '#7c3aed', '🍽️', 'gasto'),
  ('Supermercado',    '#6d28d9', '🧺', 'gasto'),
  ('Transporte',      '#2563eb', '🚌', 'gasto'),
  ('Vivienda',        '#1d4ed8', '🏠', 'gasto'),
  ('Servicios',       '#4f46e5', '💡', 'gasto'),
  ('Salud',           '#0ea5e9', '🩺', 'gasto'),
  ('Ocio',            '#a855f7', '🎉', 'gasto'),
  ('Educación',       '#3b82f6', '📚', 'gasto'),
  ('Otros gastos',    '#64748b', '📦', 'gasto'),
  ('Préstamo',        '#eab308', '🤝', 'prestamo');
