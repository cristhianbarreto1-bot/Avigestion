-- ============================================================
-- AVIGESTION - Migration 004: Fase 4
-- Tabla de logs de Edge Functions + caché de predicciones
-- ============================================================

-- ── 1. LOG DE EDGE FUNCTIONS ──────────────────────────────────
-- Para auditar cuándo se ejecutaron los cron jobs y sus resultados

CREATE TABLE edge_function_logs (
  id            BIGSERIAL PRIMARY KEY,
  function_name VARCHAR(100) NOT NULL,
  triggered_by  VARCHAR(50)  NOT NULL DEFAULT 'cron', -- 'cron' | 'webhook' | 'manual'
  status        VARCHAR(20)  NOT NULL DEFAULT 'success', -- 'success' | 'error' | 'skipped'
  result        JSONB,
  error_message TEXT,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eflog_function ON edge_function_logs(function_name, created_at DESC);

-- ── 2. CACHÉ DE PREDICCIONES DE PESO ─────────────────────────
-- Almacena la última predicción calculada por lote
-- Se actualiza cada vez que se agrega un pesaje nuevo

CREATE TABLE weight_predictions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flock_id            UUID NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  -- Datos de la predicción
  current_age_days    INT NOT NULL,
  target_age_days     INT NOT NULL DEFAULT 42,
  data_points_count   INT NOT NULL,
  -- Resultado
  projected_weight_g  INT NOT NULL,
  standard_weight_g   INT NOT NULL,
  deviation_pct       DECIMAL(6,2),
  daily_gain_g        INT,
  trend               VARCHAR(20), -- 'on_track' | 'below' | 'critical' | 'above'
  confidence          VARCHAR(10), -- 'high' | 'medium' | 'low'
  r2                  DECIMAL(5,3),
  -- Timestamps
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flock_id)  -- una predicción por lote (upsert)
);

CREATE INDEX idx_wpred_org ON weight_predictions(organization_id);
CREATE INDEX idx_wpred_trend ON weight_predictions(organization_id, trend) WHERE trend != 'on_track';

ALTER TABLE weight_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_predictions" ON weight_predictions
  FOR SELECT USING (organization_id = public.user_org_id());

-- ── 3. CONFIGURACIÓN DE NOTIFICACIONES POR USUARIO ───────────
-- Permite a cada usuario personalizar qué alertas recibe y cómo

CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Canales
  push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  digest_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  digest_hour     INT     NOT NULL DEFAULT 7,  -- hora local para el digest
  -- Filtros de severidad
  push_critical   BOOLEAN NOT NULL DEFAULT TRUE,
  push_warning    BOOLEAN NOT NULL DEFAULT TRUE,
  push_info       BOOLEAN NOT NULL DEFAULT FALSE,
  email_critical  BOOLEAN NOT NULL DEFAULT TRUE,
  email_warning   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Categorías a ignorar
  muted_categories TEXT[] DEFAULT '{}',
  -- Horario de silencio (no push entre estas horas)
  quiet_start_hour INT,    -- ej: 22 (10pm)
  quiet_end_hour   INT,    -- ej: 7 (7am)
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Insertar preferencias por defecto cuando se crea un perfil
CREATE OR REPLACE FUNCTION create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_default_notif_prefs
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_prefs();

-- ── 4. AGREGAR COLUMNA DE T. EFECTIVA A INSPECTION_ENVIRONMENTAL ──
-- (Si no se agregó en migration 003)

ALTER TABLE inspection_environmental
  ADD COLUMN IF NOT EXISTS air_velocity_ms  DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS effective_temp_c DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS magic_sum        INT,
  ADD COLUMN IF NOT EXISTS thermal_status   VARCHAR(30);

-- ── 5. VISTA: RESUMEN DE PREDICCIONES PARA DASHBOARD ─────────

CREATE OR REPLACE VIEW v_predictions_summary AS
SELECT
  wp.flock_id,
  wp.organization_id,
  wp.projected_weight_g,
  wp.standard_weight_g,
  wp.deviation_pct,
  wp.trend,
  wp.confidence,
  wp.calculated_at,
  f.code         AS flock_code,
  h.name         AS house_name,
  fm.name        AS farm_name,
  wp.target_age_days,
  wp.current_age_days,
  wp.daily_gain_g
FROM weight_predictions wp
JOIN flocks f  ON f.id = wp.flock_id
JOIN houses h  ON h.id = f.house_id
JOIN farms  fm ON fm.id = h.farm_id
WHERE f.status = 'active';
