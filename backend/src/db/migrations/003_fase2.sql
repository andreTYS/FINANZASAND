-- Fase 2: categorización automática, alertas y sincronización offline.

-- Categorización automática: marca cuando la categoría la puso el sistema (o n8n) y no el usuario
ALTER TABLE movimientos ADD COLUMN categoria_auto BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX movimientos_usuario_origen ON movimientos (usuario_id, lower(origen_destino)) WHERE categoria_id IS NOT NULL;

-- Presupuesto mensual por categoría (por usuario, también sobre categorías globales)
CREATE TABLE presupuestos (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  monto_mensual NUMERIC(12,2) NOT NULL CHECK (monto_mensual > 0),
  PRIMARY KEY (usuario_id, categoria_id)
);

-- Ajustes de alertas y token para que n8n escriba de vuelta vía API
ALTER TABLE ajustes
  ADD COLUMN alerta_gasto_grande NUMERIC(12,2),
  ADD COLUMN alerta_presupuesto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN alerta_prestamo_dias INT NOT NULL DEFAULT 3 CHECK (alerta_prestamo_dias BETWEEN 0 AND 60),
  ADD COLUMN n8n_token_hash TEXT;
CREATE UNIQUE INDEX ajustes_n8n_token ON ajustes (n8n_token_hash) WHERE n8n_token_hash IS NOT NULL;

-- Alertas generadas (visibles en la app y enviadas a n8n). "clave" evita duplicados.
CREATE TABLE alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto_grande','presupuesto_80','presupuesto_excedido','prestamo_por_vencer','prestamo_vencido')),
  clave TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  datos JSONB,
  estado_envio TEXT,
  leida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, clave)
);
CREATE INDEX alertas_usuario_fecha ON alertas (usuario_id, created_at DESC);

-- El log de automatizaciones ahora también registra eventos sin movimiento (alertas de préstamos)
ALTER TABLE automatizaciones_log ALTER COLUMN movimiento_id DROP NOT NULL;
ALTER TABLE automatizaciones_log ADD COLUMN usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
UPDATE automatizaciones_log a SET usuario_id = m.usuario_id FROM movimientos m WHERE m.id = a.movimiento_id;
