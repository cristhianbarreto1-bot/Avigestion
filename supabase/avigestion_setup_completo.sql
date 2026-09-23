-- ============================================================
-- AVIGESTION — Instalación completa (migraciones 001 a 006)
-- Pegar TODO en el SQL Editor de Supabase y ejecutar una sola vez.
-- Generado: 2026-09-23
-- ============================================================


-- ############################################################
-- ##  001_initial_schema.sql
-- ############################################################

-- ============================================================
-- AVIGESTION / GRANJACHECK - Schema inicial v1.0
-- PostgreSQL 15 + Supabase RLS
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'veterinarian', 'supervisor', 'viewer');
CREATE TYPE subscription_plan AS ENUM ('trial', 'basic', 'professional', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'trial', 'past_due', 'cancelled', 'paused');
CREATE TYPE flock_genetic AS ENUM ('cobb_500', 'ross_308', 'ross_708', 'hubbard', 'other');
CREATE TYPE flock_type AS ENUM ('broiler', 'layer', 'breeder');
CREATE TYPE flock_status AS ENUM ('incoming', 'active', 'closed', 'emergency');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE inspection_status AS ENUM ('draft', 'completed', 'reviewed');

-- ============================================================
-- ORGANIZATIONS (Tenants principales)
-- ============================================================

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL, -- para URLs: granjacheck.com/org/mi-empresa
  country         CHAR(2) NOT NULL DEFAULT 'AR', -- ISO 3166-1
  currency        CHAR(3) NOT NULL DEFAULT 'ARS',
  timezone        VARCHAR(50) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  logo_url        TEXT,
  phone           VARCHAR(30),
  address         TEXT,
  tax_id          VARCHAR(50), -- CUIT / RUC / NIT según país
  settings        JSONB NOT NULL DEFAULT '{}', -- configuraciones custom por org
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  plan                  subscription_plan NOT NULL DEFAULT 'trial',
  status                subscription_status NOT NULL DEFAULT 'trial',
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  -- Límites del plan
  max_farms             INT NOT NULL DEFAULT 1,
  max_houses            INT NOT NULL DEFAULT 5,
  max_users             INT NOT NULL DEFAULT 2,
  features              JSONB NOT NULL DEFAULT '{}', -- features habilitadas
  -- Datos de pago
  stripe_customer_id    VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  mp_preapproval_id     VARCHAR(100), -- MercadoPago
  price_usd             NUMERIC(10,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- USERS (Perfil extendido sobre auth.users de Supabase)
-- ============================================================

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  role            user_role NOT NULL DEFAULT 'supervisor',
  full_name       VARCHAR(255),
  avatar_url      TEXT,
  phone           VARCHAR(30),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  preferences     JSONB NOT NULL DEFAULT '{}', -- configuraciones UI del usuario
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_org ON profiles(organization_id) WHERE is_active = TRUE;

-- ============================================================
-- FARMS (Granjas por organización)
-- ============================================================

CREATE TABLE farms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50), -- código interno de la empresa
  address         TEXT,
  city            VARCHAR(100),
  province        VARCHAR(100),
  country         CHAR(2) DEFAULT 'AR',
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  altitude_m      INT, -- altitud sobre el nivel del mar (afecta parámetros)
  manager_name    VARCHAR(255),
  manager_phone   VARCHAR(30),
  notes           TEXT,
  settings        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(organization_id, code)
);

CREATE INDEX idx_farms_org ON farms(organization_id) WHERE deleted_at IS NULL AND is_active = TRUE;

-- ============================================================
-- HOUSES (Galpones por granja)
-- ============================================================

CREATE TABLE houses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id         UUID NOT NULL REFERENCES farms(id),
  organization_id UUID NOT NULL REFERENCES organizations(id), -- desnormalizado para RLS
  name            VARCHAR(100) NOT NULL, -- "Galpón 1", "G-A", etc.
  number          INT,
  capacity        INT, -- aves máximas
  area_m2         DECIMAL(10,2),
  length_m        DECIMAL(8,2),
  width_m         DECIMAL(8,2),
  ventilation_type VARCHAR(50), -- 'tunnel', 'cross', 'natural'
  has_ac          BOOLEAN DEFAULT FALSE,
  has_heating     BOOLEAN DEFAULT TRUE,
  drinker_type    VARCHAR(50), -- 'nipple', 'bell', 'pan'
  feeder_type     VARCHAR(50), -- 'pan', 'tube', 'chain'
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_houses_farm ON houses(farm_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_houses_org ON houses(organization_id) WHERE deleted_at IS NULL;

-- ============================================================
-- FLOCKS (Lotes de aves por galpón)
-- ============================================================

CREATE TABLE flocks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  house_id        UUID NOT NULL REFERENCES houses(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  -- Identificación del lote
  code            VARCHAR(100), -- código del lote (ej: "L-2024-045")
  batch_number    INT, -- número de lote en el galpón (histórico)
  -- Datos de entrada
  genetic         flock_genetic NOT NULL DEFAULT 'cobb_500',
  flock_type      flock_type NOT NULL DEFAULT 'broiler',
  status          flock_status NOT NULL DEFAULT 'incoming',
  entry_date      DATE NOT NULL,
  entry_count     INT NOT NULL, -- cantidad de pollitos al ingreso
  entry_weight_g  DECIMAL(8,2), -- peso promedio al ingreso en gramos
  supplier        VARCHAR(255), -- proveedor/incubadora
  -- Datos de manejo
  target_weight_g DECIMAL(8,2), -- peso objetivo al cierre
  target_age_days INT DEFAULT 42,
  feed_program    VARCHAR(100), -- programa de alimentación
  -- Datos de cierre (se llenan al finalizar el lote)
  close_date      DATE,
  close_count     INT,
  close_weight_g  DECIMAL(8,2),
  close_fcr       DECIMAL(5,3), -- Factor de Conversión Alimenticia
  mortality_total INT DEFAULT 0,
  mortality_pct   DECIMAL(5,2),
  -- Métricas calculadas (actualizadas por triggers)
  current_count   INT, -- aves vivas actuales
  current_age_days INT, -- edad en días (calculada)
  last_inspection_at TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_flocks_house ON flocks(house_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_flocks_org ON flocks(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_flocks_status ON flocks(organization_id, status) WHERE deleted_at IS NULL;

-- ============================================================
-- INSPECTIONS (Inspecciones diarias)
-- ============================================================

CREATE TABLE inspections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flock_id        UUID NOT NULL REFERENCES flocks(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  supervisor_id   UUID NOT NULL REFERENCES profiles(id),
  -- Datos de la inspección
  inspected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flock_age_days  INT NOT NULL,
  status          inspection_status NOT NULL DEFAULT 'draft',
  -- Score global (calculado al completar)
  total_score     DECIMAL(5,2), -- 0-100
  score_label     VARCHAR(20), -- 'Aprobado', 'Observado', 'Crítico'
  -- Datos de mortalidad del día
  mortality_count INT NOT NULL DEFAULT 0,
  mortality_pct   DECIMAL(5,3),
  -- Datos de pesos (si se pesó ese día)
  weights_taken   BOOLEAN DEFAULT FALSE,
  weight_avg_g    DECIMAL(8,2),
  weight_stddev   DECIMAL(8,2),
  weight_cv_pct   DECIMAL(5,2), -- Coeficiente de variación
  weight_uniformity_pct DECIMAL(5,2), -- % dentro de ±10% del promedio
  -- Notas y evidencia
  general_notes   TEXT,
  images          TEXT[] DEFAULT '{}', -- URLs de fotos
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspections_flock ON inspections(flock_id, inspected_at DESC);
CREATE INDEX idx_inspections_org ON inspections(organization_id, inspected_at DESC);
CREATE INDEX idx_inspections_supervisor ON inspections(supervisor_id, inspected_at DESC);

-- ============================================================
-- INSPECTION_ENVIRONMENTAL (Sección Ambiental)
-- ============================================================

CREATE TABLE inspection_environmental (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id       UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Temperatura
  temp_actual_c       DECIMAL(5,2),
  temp_standard_c     DECIMAL(5,2), -- estándar según edad
  temp_in_range       BOOLEAN,
  temp_zones          JSONB, -- temperaturas por zona {norte, sur, centro}
  -- Humedad
  humidity_pct        INT,
  humidity_in_range   BOOLEAN,
  -- Calidad del aire
  ammonia_ppm         INT,
  co2_ppm             INT,
  -- Cama
  litter_condition    INT CHECK (litter_condition BETWEEN 1 AND 5), -- 1=muy mala, 5=excelente
  litter_humidity_pct INT,
  litter_notes        TEXT,
  -- Ventilación
  ventilation_ok      BOOLEAN,
  inlet_openings_ok   BOOLEAN,
  -- Score de sección
  section_score       DECIMAL(5,2),
  notes               TEXT
);

CREATE INDEX idx_insp_env_inspection ON inspection_environmental(inspection_id);

-- ============================================================
-- INSPECTION_WATER (Sección Agua)
-- ============================================================

CREATE TABLE inspection_water (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id       UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Consumo
  consumption_liters  DECIMAL(10,2),
  consumption_standard DECIMAL(10,2),
  consumption_in_range BOOLEAN,
  -- Calidad
  water_temp_c        DECIMAL(5,2),
  pressure_ok         BOOLEAN,
  ph_level            DECIMAL(4,2),
  chlorine_ppm        DECIMAL(5,2),
  -- Estado de bebederos
  drinkers_clean      BOOLEAN,
  drinker_height_ok   BOOLEAN,
  drinker_count_ok    BOOLEAN,
  -- Score de sección
  section_score       DECIMAL(5,2),
  notes               TEXT
);

CREATE INDEX idx_insp_water_inspection ON inspection_water(inspection_id);

-- ============================================================
-- INSPECTION_FEEDING (Sección Alimento)
-- ============================================================

CREATE TABLE inspection_feeding (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id         UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Consumo de alimento
  feed_consumed_kg      DECIMAL(10,2),
  feed_type             VARCHAR(100), -- 'pre-inicio', 'inicio', 'crecimiento', 'engorde'
  -- Distribución
  distribution_uniform  BOOLEAN,
  feeder_height_ok      BOOLEAN,
  feeder_count_ok       BOOLEAN,
  -- Calidad del alimento
  feed_quality_ok       BOOLEAN,
  feed_storage_ok       BOOLEAN,
  mold_detected         BOOLEAN DEFAULT FALSE,
  pests_detected        BOOLEAN DEFAULT FALSE,
  -- Score de sección
  section_score         DECIMAL(5,2),
  notes                 TEXT
);

CREATE INDEX idx_insp_feeding_inspection ON inspection_feeding(inspection_id);

-- ============================================================
-- INSPECTION_HEALTH (Sección Sanidad)
-- ============================================================

CREATE TABLE inspection_health (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id         UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Mortalidad
  dead_count            INT NOT NULL DEFAULT 0,
  culled_count          INT NOT NULL DEFAULT 0, -- sacrificados por enfermedad
  -- Signos clínicos (checklist)
  signs_respiratory     BOOLEAN DEFAULT FALSE,
  signs_digestive       BOOLEAN DEFAULT FALSE,
  signs_nervous         BOOLEAN DEFAULT FALSE,
  signs_locomotion      BOOLEAN DEFAULT FALSE,
  signs_skin            BOOLEAN DEFAULT FALSE,
  signs_ocular          BOOLEAN DEFAULT FALSE,
  signs_other           TEXT,
  -- Comportamiento general
  behavior_normal       BOOLEAN DEFAULT TRUE,
  activity_level        INT CHECK (activity_level BETWEEN 1 AND 5),
  distribution_uniform  BOOLEAN,
  vocalization_normal   BOOLEAN DEFAULT TRUE,
  -- Medicación activa
  medication_active     BOOLEAN DEFAULT FALSE,
  medication_detail     TEXT,
  -- Score de sección
  section_score         DECIMAL(5,2),
  notes                 TEXT
);

CREATE INDEX idx_insp_health_inspection ON inspection_health(inspection_id);

-- ============================================================
-- INSPECTION_WEIGHTS (Sección Pesaje)
-- ============================================================

CREATE TABLE inspection_weights (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id         UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Datos del pesaje
  sample_size           INT, -- cuántas aves pesadas
  standard_weight_g     DECIMAL(8,2), -- peso estándar según genética y edad
  -- Métricas calculadas
  avg_weight_g          DECIMAL(8,2),
  min_weight_g          DECIMAL(8,2),
  max_weight_g          DECIMAL(8,2),
  stddev_g              DECIMAL(8,2),
  cv_pct                DECIMAL(5,2), -- coeficiente de variación
  uniformity_pct        DECIMAL(5,2), -- % dentro de ±10%
  weight_vs_standard    DECIMAL(6,2), -- % sobre/bajo el estándar
  -- Valores individuales (para recalcular)
  individual_weights    DECIMAL[] DEFAULT '{}',
  -- Causas de baja uniformidad (si CV > 8%)
  uniformity_causes     TEXT[],
  -- Score de sección
  section_score         DECIMAL(5,2),
  notes                 TEXT
);

CREATE INDEX idx_insp_weights_inspection ON inspection_weights(inspection_id);

-- ============================================================
-- ALERTS (Sistema de alertas automáticas)
-- ============================================================

CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  flock_id        UUID REFERENCES flocks(id),
  inspection_id   UUID REFERENCES inspections(id),
  severity        alert_severity NOT NULL DEFAULT 'warning',
  status          alert_status NOT NULL DEFAULT 'open',
  -- Contenido
  category        VARCHAR(50) NOT NULL, -- 'mortality', 'weight', 'temperature', etc.
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  recommended_action TEXT,
  -- Valor que disparó la alerta
  trigger_value   DECIMAL(10,3),
  trigger_threshold DECIMAL(10,3),
  -- Gestión
  assigned_to     UUID REFERENCES profiles(id),
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by     UUID REFERENCES profiles(id),
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT,
  -- Notificaciones enviadas
  notified_users  UUID[] DEFAULT '{}',
  push_sent_at    TIMESTAMPTZ,
  email_sent_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_org ON alerts(organization_id, status, severity);
CREATE INDEX idx_alerts_flock ON alerts(flock_id) WHERE status != 'resolved';

-- ============================================================
-- FEED_INVENTORY (Inventario de alimento)
-- ============================================================

CREATE TABLE feed_inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  farm_id         UUID NOT NULL REFERENCES farms(id),
  feed_type       VARCHAR(100) NOT NULL,
  brand           VARCHAR(100),
  batch_number    VARCHAR(100),
  quantity_kg     DECIMAL(12,2) NOT NULL,
  unit_price      DECIMAL(10,2),
  entry_date      DATE NOT NULL,
  expiry_date     DATE,
  supplier        VARCHAR(255),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feed_farm ON feed_inventory(farm_id);

-- ============================================================
-- AUDIT_LOG (Auditoría de cambios críticos)
-- ============================================================

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID,
  user_id         UUID,
  action          VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name      VARCHAR(100) NOT NULL,
  record_id       UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas relevantes
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'subscriptions', 'profiles', 'farms',
    'houses', 'flocks', 'inspections', 'alerts'
  ]
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_updated_at_%s
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END;
$$;

-- Función para calcular edad del lote
CREATE OR REPLACE FUNCTION get_flock_age(entry_date DATE)
RETURNS INT AS $$
BEGIN
  RETURN GREATEST(0, CURRENT_DATE - entry_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger para actualizar current_age_days y last_inspection_at en flocks
CREATE OR REPLACE FUNCTION update_flock_on_inspection()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE flocks SET
    last_inspection_at = NEW.inspected_at,
    current_count = current_count - COALESCE((
      SELECT (h.dead_count + h.culled_count)
      FROM inspection_health h WHERE h.inspection_id = NEW.id
    ), 0),
    updated_at = NOW()
  WHERE id = NEW.flock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_flock_on_inspection
AFTER INSERT ON inspections
FOR EACH ROW EXECUTE FUNCTION update_flock_on_inspection();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE flocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_environmental ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_water ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_feeding ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_inventory ENABLE ROW LEVEL SECURITY;

-- Función helper: obtener organization_id del usuario actual
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Función helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Políticas RLS: Organizations
CREATE POLICY "users_see_own_org" ON organizations
  FOR SELECT USING (id = public.user_org_id());

CREATE POLICY "owners_update_org" ON organizations
  FOR UPDATE USING (id = public.user_org_id() AND public.user_role() IN ('owner', 'admin'));

-- Políticas RLS: Farms
CREATE POLICY "users_see_own_farms" ON farms
  FOR SELECT USING (organization_id = public.user_org_id());

CREATE POLICY "admins_manage_farms" ON farms
  FOR ALL USING (organization_id = public.user_org_id() AND public.user_role() IN ('owner', 'admin'));

-- Políticas RLS: Houses
CREATE POLICY "users_see_own_houses" ON houses
  FOR SELECT USING (organization_id = public.user_org_id());

CREATE POLICY "admins_manage_houses" ON houses
  FOR ALL USING (organization_id = public.user_org_id() AND public.user_role() IN ('owner', 'admin'));

-- Políticas RLS: Flocks
CREATE POLICY "users_see_own_flocks" ON flocks
  FOR SELECT USING (organization_id = public.user_org_id());

CREATE POLICY "supervisors_manage_flocks" ON flocks
  FOR ALL USING (organization_id = public.user_org_id() AND public.user_role() != 'viewer');

-- Políticas RLS: Inspections
CREATE POLICY "users_see_org_inspections" ON inspections
  FOR SELECT USING (organization_id = public.user_org_id());

CREATE POLICY "supervisors_create_inspections" ON inspections
  FOR INSERT WITH CHECK (organization_id = public.user_org_id() AND public.user_role() != 'viewer');

CREATE POLICY "supervisors_update_own_drafts" ON inspections
  FOR UPDATE USING (
    organization_id = public.user_org_id() AND
    (supervisor_id = auth.uid() OR public.user_role() IN ('owner', 'admin', 'veterinarian')) AND
    (status = 'draft' OR public.user_role() IN ('owner', 'admin'))
  );

-- Políticas RLS: Inspection sections (heredan del inspection)
CREATE POLICY "users_see_env" ON inspection_environmental FOR SELECT
  USING (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id()));

CREATE POLICY "users_see_water" ON inspection_water FOR SELECT
  USING (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id()));

CREATE POLICY "users_see_feeding" ON inspection_feeding FOR SELECT
  USING (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id()));

CREATE POLICY "users_see_health" ON inspection_health FOR SELECT
  USING (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id()));

CREATE POLICY "users_see_weights" ON inspection_weights FOR SELECT
  USING (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id()));

-- INSERT para secciones
CREATE POLICY "supervisors_insert_env" ON inspection_environmental FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id() AND i.status = 'draft'));

CREATE POLICY "supervisors_insert_water" ON inspection_water FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id() AND i.status = 'draft'));

CREATE POLICY "supervisors_insert_feeding" ON inspection_feeding FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id() AND i.status = 'draft'));

CREATE POLICY "supervisors_insert_health" ON inspection_health FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id() AND i.status = 'draft'));

CREATE POLICY "supervisors_insert_weights" ON inspection_weights FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_id AND i.organization_id = public.user_org_id() AND i.status = 'draft'));

-- Políticas RLS: Alerts
CREATE POLICY "users_see_own_alerts" ON alerts
  FOR SELECT USING (organization_id = public.user_org_id());

-- Políticas RLS: Profiles
CREATE POLICY "users_see_org_profiles" ON profiles
  FOR SELECT USING (organization_id = public.user_org_id());

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "admins_manage_profiles" ON profiles
  FOR ALL USING (organization_id = public.user_org_id() AND public.user_role() IN ('owner', 'admin'));

-- ============================================================
-- VIEWS ÚTILES
-- ============================================================

-- Vista: lotes activos con datos completos
CREATE VIEW v_active_flocks AS
SELECT
  f.id,
  f.code,
  f.genetic,
  f.flock_type,
  f.status,
  f.entry_date,
  f.entry_count,
  f.current_count,
  get_flock_age(f.entry_date) AS age_days,
  f.last_inspection_at,
  f.organization_id,
  h.name AS house_name,
  h.id AS house_id,
  fm.name AS farm_name,
  fm.id AS farm_id,
  -- Mortalidad acumulada
  f.entry_count - COALESCE(f.current_count, f.entry_count) AS total_mortality,
  ROUND(
    (f.entry_count - COALESCE(f.current_count, f.entry_count))::NUMERIC
    / NULLIF(f.entry_count, 0) * 100, 2
  ) AS mortality_pct
FROM flocks f
JOIN houses h ON h.id = f.house_id
JOIN farms fm ON fm.id = h.farm_id
WHERE f.deleted_at IS NULL AND f.status = 'active';

-- Vista: resumen de inspecciones recientes por organización
CREATE VIEW v_recent_inspections AS
SELECT
  i.id,
  i.flock_id,
  i.inspected_at,
  i.flock_age_days,
  i.status,
  i.total_score,
  i.score_label,
  i.mortality_count,
  i.mortality_pct,
  i.weight_avg_g,
  i.weight_cv_pct,
  i.organization_id,
  p.full_name AS supervisor_name,
  f.code AS flock_code,
  h.name AS house_name,
  fm.name AS farm_name
FROM inspections i
JOIN profiles p ON p.id = i.supervisor_id
JOIN flocks f ON f.id = i.flock_id
JOIN houses h ON h.id = f.house_id
JOIN farms fm ON fm.id = h.farm_id;

-- ============================================================
-- DATOS SEMILLA (Estándares genéticos)
-- ============================================================

CREATE TABLE genetic_standards (
  id          SERIAL PRIMARY KEY,
  genetic     flock_genetic NOT NULL,
  age_days    INT NOT NULL,
  -- Pesos
  weight_g    DECIMAL(8,2) NOT NULL,
  weight_min_g DECIMAL(8,2),
  weight_max_g DECIMAL(8,2),
  -- Consumo de agua (ml por ave por día)
  water_ml_per_bird DECIMAL(8,2),
  -- Temperatura ideal
  temp_min_c  DECIMAL(5,2),
  temp_max_c  DECIMAL(5,2),
  -- Consumo de alimento (g por ave por día)
  feed_g_per_bird DECIMAL(8,2),
  UNIQUE(genetic, age_days)
);

-- Datos reales Cobb 500 (broiler, días clave)
INSERT INTO genetic_standards (genetic, age_days, weight_g, weight_min_g, weight_max_g, water_ml_per_bird, temp_min_c, temp_max_c, feed_g_per_bird) VALUES
('cobb_500', 0,   42,    38,    46,    30,   33, 35,  0),
('cobb_500', 1,   57,    51,    63,    30,   32, 34,  13),
('cobb_500', 3,   100,   90,    110,   30,   32, 34,  20),
('cobb_500', 7,   186,   167,   205,   45,   30, 32,  34),
('cobb_500', 10,  290,   261,   319,   60,   28, 30,  49),
('cobb_500', 14,  471,   424,   518,   80,   26, 28,  72),
('cobb_500', 17,  660,   594,   726,   100,  25, 27,  95),
('cobb_500', 21,  930,   837,   1023,  130,  24, 26,  120),
('cobb_500', 24,  1190,  1071,  1309,  160,  22, 24,  145),
('cobb_500', 28,  1520,  1368,  1672,  195,  21, 23,  165),
('cobb_500', 31,  1810,  1629,  1991,  225,  20, 22,  185),
('cobb_500', 35,  2250,  2025,  2475,  265,  20, 22,  200),
('cobb_500', 38,  2580,  2322,  2838,  290,  19, 21,  210),
('cobb_500', 42,  2950,  2655,  3245,  320,  19, 21,  215);

-- Datos reales Ross 308
INSERT INTO genetic_standards (genetic, age_days, weight_g, weight_min_g, weight_max_g, water_ml_per_bird, temp_min_c, temp_max_c, feed_g_per_bird) VALUES
('ross_308', 0,   40,    36,    44,    30,   33, 35,  0),
('ross_308', 1,   54,    49,    59,    30,   32, 34,  12),
('ross_308', 3,   98,    88,    108,   30,   32, 34,  19),
('ross_308', 7,   180,   162,   198,   45,   30, 32,  33),
('ross_308', 10,  280,   252,   308,   58,   28, 30,  47),
('ross_308', 14,  460,   414,   506,   78,   26, 28,  70),
('ross_308', 17,  650,   585,   715,   98,   25, 27,  93),
('ross_308', 21,  910,   819,   1001,  128,  24, 26,  118),
('ross_308', 24,  1160,  1044,  1276,  155,  22, 24,  140),
('ross_308', 28,  1490,  1341,  1639,  190,  21, 23,  162),
('ross_308', 31,  1780,  1602,  1958,  220,  20, 22,  181),
('ross_308', 35,  2200,  1980,  2420,  260,  20, 22,  198),
('ross_308', 38,  2520,  2268,  2772,  285,  19, 21,  208),
('ross_308', 42,  2900,  2610,  3190,  315,  19, 21,  213);


-- ############################################################
-- ##  002_push_subscriptions.sql
-- ############################################################

-- ============================================================
-- AVIGESTION - Migration 002: Push Subscriptions
-- Tabla para guardar suscripciones de Web Push por usuario
-- ============================================================

CREATE TABLE push_subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Datos de la suscripción Web Push
  subscription_data JSONB NOT NULL,  -- { endpoint, keys: { p256dh, auth } }
  endpoint          TEXT NOT NULL,
  -- Metadata del dispositivo
  device_info       JSONB DEFAULT '{}',
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subs_org  ON push_subscriptions(organization_id);
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

CREATE TRIGGER trg_updated_at_push_subscriptions
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_subs" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "admins_see_org_subs" ON push_subscriptions
  FOR SELECT USING (
    organization_id = public.user_org_id()
    AND public.user_role() IN ('owner', 'admin')
  );

-- ============================================================
-- Agregar columna a inspections para tracking offline
-- ============================================================

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS synced_from_offline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS offline_created_at  TIMESTAMPTZ;

COMMENT ON COLUMN inspections.synced_from_offline IS
  'TRUE si fue creada offline y sincronizada después via Background Sync';


-- ############################################################
-- ##  003_thermal_comfort.sql
-- ############################################################

-- ============================================================
-- AVIGESTION - Migration 003: Confort Térmico
-- Temperatura Mágica (T+HR, sin viento, pollitos chicos)
-- Temperatura Efectiva / Sensación Térmica (con ventilación)
-- Fuentes: Fairchild-UGA, Jim Donald-Auburn, Cobb/Ross guides,
--          Tao & Xin THVI, aviNews, Engormix
-- ============================================================

-- ── 1. TABLA: TEMPERATURA MÁGICA POR EDAD ────────────────────
-- Regla de oro: T°C + HR% ≈ 90 (zona de confort)
-- Aplica SOLO cuando no hay corriente de aire (ventilación mínima)
-- Fuente: Colaves, aviNews, Fairchild UGA, guías Cobb/Ross

CREATE TABLE thermal_magic_standards (
  id              SERIAL PRIMARY KEY,
  age_day_from    INT NOT NULL,
  age_day_to      INT NOT NULL,
  -- Temperatura de aire ideal (°C)
  temp_ideal_c    DECIMAL(5,2) NOT NULL,
  temp_min_c      DECIMAL(5,2) NOT NULL,
  temp_max_c      DECIMAL(5,2) NOT NULL,
  -- Humedad relativa ideal (%)
  hr_ideal_pct    INT NOT NULL,
  hr_min_pct      INT NOT NULL,
  hr_max_pct      INT NOT NULL,
  -- Suma T+HR (índice de temperatura mágica)
  magic_sum_ideal INT NOT NULL,  -- típicamente 90
  magic_sum_min   INT NOT NULL,  -- <85 = frío crítico
  magic_sum_max   INT NOT NULL,  -- >95 = calor crítico
  -- Temperatura de suelo (cama) ideal
  floor_temp_ideal_c DECIMAL(5,2),
  -- Notas de manejo
  notes           TEXT,
  CONSTRAINT chk_age CHECK (age_day_from <= age_day_to)
);

-- Datos reales por etapa productiva
INSERT INTO thermal_magic_standards 
  (age_day_from, age_day_to, temp_ideal_c, temp_min_c, temp_max_c,
   hr_ideal_pct, hr_min_pct, hr_max_pct,
   magic_sum_ideal, magic_sum_min, magic_sum_max,
   floor_temp_ideal_c, notes)
VALUES
  -- Llegada: día 0-3 (pollito sin termorregulación)
  (0, 3,
   33.0, 32.0, 35.0,
   60, 50, 70,
   93, 85, 100,
   32.0,
   'Zona de neutralidad térmica muy estrecha. El pollito NO puede regular su temperatura corporal. La temperatura de cama (piso) es crítica: mínimo 32°C al momento de llegada. Con HR < 50% el pollito pierde hasta 10g de humedad en 24hs y se deshidrata. Con HR > 75% aumenta el riesgo de problemas respiratorios.'),

  -- Crianza inicial: día 4-7
  (4, 7,
   32.0, 31.0, 34.0,
   60, 50, 70,
   92, 85, 99,
   31.0,
   'El pollito comienza a consumir alimento y agua activamente. Observar comportamiento: distribuidos uniformemente = confort. Acurrucados = frío. Alejados de criadoras con boca abierta = calor. La temperatura corporal alcanza ~41°C recién al día 5.'),

  -- Crianza: día 8-14 (plumaje emergente)
  (8, 14,
   30.0, 28.0, 32.0,
   60, 50, 70,
   90, 83, 97,
   28.0,
   'El plumaje comienza a desarrollarse pero aún insuficiente. Reducir temperatura 0.5°C por día. El sistema termorregulador madura. Riesgo de corrientes de aire frío en ventilación mínima. Verificar que no haya baches de temperatura nocturna mayores a 3°C.'),

  -- Pre-engorde: día 15-21 (plumaje en desarrollo)
  (15, 21,
   27.0, 25.0, 29.0,
   60, 50, 70,
   87, 80, 94,
   25.0,
   'Desarrollo del plumaje acelerado. Las aves comienzan a regular mejor su temperatura. Momento crítico: se empieza a considerar ventilación de transición cuando T ambiente supera 24°C. Aún vulnerable a corrientes directas de aire frío.'),

  -- Crecimiento I: día 22-28
  (22, 28,
   24.0, 22.0, 26.0,
   60, 50, 70,
   84, 77, 91,
   22.0,
   'Plumaje casi completo. Las aves pueden tolerar mayor variación térmica. Se activa ventilación de transición. Temperatura mágica pierde relevancia relativa frente a temperatura efectiva con velocidad de aire. Monitorear consumo de agua como indicador de confort.'),

  -- Crecimiento II: día 29-35
  (29, 35,
   22.0, 20.0, 24.0,
   60, 50, 70,
   82, 75, 89,
   20.0,
   'Aves con plumaje adulto completo. Alta producción de calor metabólico. La ventilación túnel se vuelve indispensable en climas cálidos. La sensación térmica con viento es el indicador más relevante en esta etapa.'),

  -- Engorde: día 36-42
  (36, 42,
   20.0, 18.0, 22.0,
   60, 50, 70,
   80, 73, 87,
   18.0,
   'Máxima masa corporal y producción de calor. Estrés térmico impacta directamente en FCR y peso final. Objetivo de temperatura efectiva: máximo 28°C. Con ventilación túnel a 2.0-2.5 m/s se pueden compensar ambientes de hasta 33-34°C de temperatura ambiental.');

CREATE INDEX idx_magic_age ON thermal_magic_standards(age_day_from, age_day_to);

-- ── 2. TABLA: REDUCCIÓN POR VELOCIDAD DE AIRE (WIND CHILL) ───
-- Reducción de temperatura efectiva según velocidad de aire
-- Fuente: Jim Donald (Auburn U.), Cobb Management Guide 2019,
--         Tao & Xin THVI model, aviNews ventilación túnel
-- IMPORTANTE: Aplica para aves >21 días con plumaje

CREATE TABLE wind_chill_reduction (
  id              SERIAL PRIMARY KEY,
  air_velocity_ms DECIMAL(4,2) NOT NULL,  -- velocidad en m/s
  air_velocity_fpm INT,                    -- en pies/minuto (referencia US)
  -- Reducción de temperatura efectiva a distintas temp base
  reduction_at_25c DECIMAL(4,2),  -- reducción (°C) si T ambiente = 25°C
  reduction_at_28c DECIMAL(4,2),  -- reducción (°C) si T ambiente = 28°C
  reduction_at_30c DECIMAL(4,2),  -- reducción (°C) si T ambiente = 30°C
  reduction_at_32c DECIMAL(4,2),  -- reducción (°C) si T ambiente = 32°C
  reduction_at_35c DECIMAL(4,2),  -- reducción (°C) si T ambiente = 35°C
  -- Reducción promedio (usada en cálculo simplificado)
  reduction_avg_c  DECIMAL(4,2) NOT NULL,
  -- Descripción del nivel de ventilación
  ventilation_stage VARCHAR(50),
  notes           TEXT
);

-- Datos reales de reducción por wind chill en avicultura
-- Fuente: Jim Donald Auburn + Cobb Management Guide
INSERT INTO wind_chill_reduction
  (air_velocity_ms, air_velocity_fpm,
   reduction_at_25c, reduction_at_28c, reduction_at_30c, reduction_at_32c, reduction_at_35c,
   reduction_avg_c, ventilation_stage, notes)
VALUES
  (0.0,  0,   0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  'Sin ventilación',
   'Sin movimiento de aire. Temperatura mágica (T+HR) es el indicador relevante.'),
  
  (0.5,  98,  -0.5, -0.8, -1.0, -1.2, -1.5, -1.0, 'Ventilación mínima',
   'Ventilación de mínima o transición muy baja. Principalmente para control de humedad y CO2. Efecto wind chill mínimo.'),
  
  (1.0,  197, -1.0, -1.5, -2.0, -2.5, -3.0, -2.0, 'Ventilación transición baja',
   'Inicio de ventilación de transición. Recomendado a partir del día 14-18 cuando T>26°C. El efecto de enfriamiento comienza a ser significativo.'),
  
  (1.5,  295, -1.5, -2.5, -3.0, -3.5, -4.5, -3.0, 'Ventilación transición media',
   'Transición activa. Reducción significativa de estrés térmico en aves >21 días. Cuidado con pollitos <14 días: puede causar estrés por frío.'),
  
  (2.0,  394, -2.0, -3.5, -4.5, -5.0, -6.0, -4.5, 'Ventilación túnel baja',
   'Inicio del modo túnel. La velocidad recomendada por Cobb para días calurosos (>28°C) en aves >25 días. Reducción efectiva de 4-5°C.'),
  
  (2.5,  492, -3.0, -4.5, -5.5, -6.5, -7.5, -5.5, 'Ventilación túnel media',
   'Túnel óptimo para la mayoría de condiciones de verano. Objetivo: sensación térmica < 28°C. La diferencia con 2.0 m/s es notable.'),
  
  (3.0,  591, -3.5, -5.0, -6.5, -7.5, -9.0, -6.5, 'Ventilación túnel alta',
   'Velocidad estándar de túnel en aves >35 días. Permite compensar hasta 8-9°C de temperatura ambiental. Renovación total del aire del galpón en ~60 seg.'),
  
  (3.5,  689, -4.0, -6.0, -7.5, -8.5, -10.0, -7.5, 'Ventilación túnel alta-máxima',
   'Para aves >35 días en climas muy cálidos. Czarick y Fairchild recomiendan hasta 3 m/s para aves pesadas. Por encima de 3 m/s el beneficio marginal decrece.'),
  
  (4.0,  787, -4.5, -6.5, -8.0, -9.5, -11.0, -8.0, 'Ventilación máxima',
   'Velocidad máxima práctica en túnel. Rendimientos decrecientes por encima de 3.5 m/s. Riesgo de que aves pesadas no puedan mantener temperatura corporal si T < 20°C.');

-- ── 3. TABLA: CORRECCIÓN POR HUMEDAD RELATIVA ────────────────
-- La HR modifica la temperatura percibida
-- Fuente: colaves.com (regla de oro T+HR=90), aviNews

CREATE TABLE humidity_correction (
  id          SERIAL PRIMARY KEY,
  hr_pct_from INT NOT NULL,
  hr_pct_to   INT NOT NULL,
  correction_c DECIMAL(4,2) NOT NULL,  -- negativo = enfría, positivo = calienta
  comfort_zone BOOLEAN NOT NULL DEFAULT FALSE,
  label       VARCHAR(50),
  notes       TEXT
);

INSERT INTO humidity_correction (hr_pct_from, hr_pct_to, correction_c, comfort_zone, label, notes) VALUES
  (0,  30,  -3.0, FALSE, 'Muy seca — peligrosa',
   'HR < 30%: el pollito pierde calor rápidamente. Riesgo de deshidratación. Polvo excesivo. Las aves sienten hasta 3°C menos de lo que marca el termómetro. Problema típico en invierno o climas áridos.'),
  
  (31, 45,  -1.5, FALSE, 'Seca — atención',
   'HR 31-45%: ambiente seco. El pollito siente 1-2°C menos. Aumenta la evaporación de las vías respiratorias. Monitorear consumo de agua.'),
  
  (46, 55,  -0.5, FALSE, 'Ligeramente seca — aceptable',
   'Leve efecto refrescante. Aceptable pero no ideal. El pollito siente ~0.5°C menos que el termómetro.'),
  
  (56, 70,   0.0, TRUE,  'Zona de confort',
   'Zona ideal. HR 60-65% es el óptimo absoluto para broilers. La norma de oro T+HR≈90 aplica con HR en este rango. El pollo siente lo que marca el termómetro.'),
  
  (71, 80,  +1.0, FALSE, 'Húmeda — atención',
   'HR 71-80%: el pollito siente ~1°C más. Riesgo de condensación en cama. Favorece coccidiosis. Aumenta amoniaco de la cama. Aumentar ventilación.'),
  
  (81, 90,  +2.5, FALSE, 'Muy húmeda — problemática',
   'HR >80%: el pollito siente hasta 2-3°C más. Efecto jadeo reducido (dificultad para disipar calor por evaporación). Cama deteriorada. Riesgo de problemas respiratorios y sanitarios severos.'),
  
  (91, 100, +4.0, FALSE, 'Saturada — crítica',
   'HR >90%: temperatura mágica peligrosa. El jadeo es inefectivo como mecanismo de disipación de calor. Estrés térmico severo incluso a temperaturas moderadas. Intervención urgente.');

-- ── 4. VISTA: CALCULADORA DE CONFORT TÉRMICO ─────────────────

CREATE OR REPLACE VIEW v_thermal_reference AS
SELECT
  wc.air_velocity_ms,
  wc.air_velocity_fpm,
  wc.ventilation_stage,
  wc.reduction_avg_c       AS wind_chill_avg_c,
  wc.reduction_at_25c,
  wc.reduction_at_28c,
  wc.reduction_at_30c,
  wc.reduction_at_32c,
  wc.reduction_at_35c
FROM wind_chill_reduction wc
ORDER BY wc.air_velocity_ms;

-- ── 5. FUNCIÓN: CALCULAR TEMPERATURA EFECTIVA ────────────────

CREATE OR REPLACE FUNCTION calculate_effective_temp(
  p_temp_c        DECIMAL,   -- temperatura ambiental medida
  p_hr_pct        INT,       -- humedad relativa %
  p_air_velocity  DECIMAL    -- velocidad de aire m/s (0 si no hay)
)
RETURNS TABLE (
  effective_temp_c     DECIMAL,
  magic_sum            INT,
  hr_correction_c      DECIMAL,
  wind_chill_c         DECIMAL,
  comfort_status       VARCHAR,
  comfort_label        VARCHAR,
  recommendation       TEXT
) AS $$
DECLARE
  v_hr_correction  DECIMAL;
  v_wind_chill     DECIMAL;
  v_effective      DECIMAL;
  v_magic_sum      INT;
BEGIN
  -- 1. Corrección por humedad
  SELECT hc.correction_c INTO v_hr_correction
  FROM humidity_correction hc
  WHERE p_hr_pct BETWEEN hc.hr_pct_from AND hc.hr_pct_to
  LIMIT 1;
  v_hr_correction := COALESCE(v_hr_correction, 0);

  -- 2. Wind chill por velocidad de aire
  SELECT
    CASE
      WHEN p_temp_c <= 26 THEN wc.reduction_at_25c
      WHEN p_temp_c <= 29 THEN wc.reduction_at_28c
      WHEN p_temp_c <= 31 THEN wc.reduction_at_30c
      WHEN p_temp_c <= 33 THEN wc.reduction_at_32c
      ELSE wc.reduction_at_35c
    END INTO v_wind_chill
  FROM wind_chill_reduction wc
  WHERE ABS(wc.air_velocity_ms - p_air_velocity) = (
    SELECT MIN(ABS(w2.air_velocity_ms - p_air_velocity))
    FROM wind_chill_reduction w2
  )
  LIMIT 1;
  v_wind_chill := COALESCE(v_wind_chill, 0);

  -- 3. Temperatura efectiva final
  v_effective := p_temp_c + v_hr_correction + v_wind_chill;

  -- 4. Suma temperatura mágica (sin viento)
  v_magic_sum := ROUND(p_temp_c + p_hr_pct);

  -- 5. Estado de confort y recomendación
  RETURN QUERY SELECT
    ROUND(v_effective, 1),
    v_magic_sum,
    ROUND(v_hr_correction, 1),
    ROUND(v_wind_chill, 1),
    CASE
      WHEN v_effective < 18 THEN 'FRIO_CRITICO'
      WHEN v_effective < 21 THEN 'FRIO'
      WHEN v_effective < 24 THEN 'FRESCO'
      WHEN v_effective BETWEEN 24 AND 28 THEN 'CONFORT'
      WHEN v_effective BETWEEN 28 AND 30 THEN 'CALIDO'
      WHEN v_effective BETWEEN 30 AND 33 THEN 'CALOR'
      ELSE 'ESTRES_TERMICO'
    END::VARCHAR,
    CASE
      WHEN v_effective < 18 THEN 'Frío crítico'
      WHEN v_effective < 21 THEN 'Frío'
      WHEN v_effective < 24 THEN 'Fresco — aceptable'
      WHEN v_effective BETWEEN 24 AND 28 THEN 'Zona de confort ✓'
      WHEN v_effective BETWEEN 28 AND 30 THEN 'Cálido — atención'
      WHEN v_effective BETWEEN 30 AND 33 THEN 'Calor — estrés leve'
      ELSE 'Estrés térmico severo'
    END::VARCHAR,
    CASE
      WHEN v_effective < 18 THEN 'URGENTE: Aumentar calefacción. Riesgo de hipotermia y alta mortalidad en pollitos jóvenes.'
      WHEN v_effective < 21 THEN 'Aumentar temperatura o reducir ventilación. Monitorear comportamiento de las aves.'
      WHEN v_effective < 24 THEN 'Temperatura levemente baja. Aumentar calefacción 1-2°C o reducir caudal de aire.'
      WHEN v_effective BETWEEN 24 AND 28 THEN 'Las aves están en zona de confort. Mantener condiciones actuales.'
      WHEN v_effective BETWEEN 28 AND 30 THEN 'Temperatura alta. Aumentar velocidad de aire o activar nebulización.'
      WHEN v_effective BETWEEN 30 AND 33 THEN 'Estrés térmico. Aumentar ventilación túnel a 2.5-3.0 m/s. Activar panel húmedo si disponible.'
      ELSE 'CRÍTICO: Estrés térmico severo. Mortalidad y pérdida de FCR inminentes. Ventilación máxima + enfriamiento evaporativo urgente.'
    END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ── 6. AGREGAR CAMPO AIR_VELOCITY A INSPECTION_ENVIRONMENTAL ─

ALTER TABLE inspection_environmental
  ADD COLUMN IF NOT EXISTS air_velocity_ms    DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS effective_temp_c   DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS magic_sum          INT,
  ADD COLUMN IF NOT EXISTS thermal_status     VARCHAR(30);

COMMENT ON COLUMN inspection_environmental.air_velocity_ms IS
  'Velocidad de aire medida con anemómetro en m/s. 0 = sin corriente (ventilación mínima).';
COMMENT ON COLUMN inspection_environmental.effective_temp_c IS
  'Temperatura efectiva = T + corrección HR + wind chill. Lo que realmente siente el ave.';
COMMENT ON COLUMN inspection_environmental.magic_sum IS
  'Suma T+HR (temperatura mágica). Debe estar cerca de 90 en pollitos <21 días sin ventilación.';
COMMENT ON COLUMN inspection_environmental.thermal_status IS
  'FRIO_CRITICO | FRIO | FRESCO | CONFORT | CALIDO | CALOR | ESTRES_TERMICO';


-- ############################################################
-- ##  004_phase4.sql
-- ############################################################

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


-- ############################################################
-- ##  005_security_beta.sql
-- ############################################################

-- ============================================================
-- AVIGESTION - Migration 005: Seguridad + correcciones para beta
--   1. Helpers de RLS en esquema public (Supabase bloquea el esquema auth)
--   2. Perfiles: un usuario no puede cambiarse rol, org ni estado
--   3. Alta automática de perfil al registrarse
--   4. Vistas con security_invoker (antes filtraban datos entre empresas)
--   5. RLS en audit_log, genetic_standards, edge_function_logs
--   6. Políticas faltantes: subscriptions, feed_inventory, alerts
--   7. Inspecciones: el supervisor puede completar su borrador
--   8. Secciones de inspección: 1 fila por inspección + UPDATE en borrador
-- Idempotente. Requiere 001–004 aplicadas.
-- ============================================================

BEGIN;

-- ── 1. HELPERS DE RLS ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT organization_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

REVOKE ALL ON FUNCTION public.user_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_role()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_role()   TO authenticated, service_role;

-- ── 2. PERFILES: BLOQUEAR ESCALADA DE PRIVILEGIOS ────────────
-- La política users_update_own_profile deja editar el propio perfil.
-- Este trigger impide que alguien cambie su rol, su organización o su
-- estado, salvo un owner/admin de la misma organización o el servidor
-- (service_role, usado por el onboarding).

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role user_role;
  v_caller_org  UUID;
BEGIN
  -- Llamadas del servidor con service_role: sin restricción
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN

    SELECT role, organization_id INTO v_caller_role, v_caller_org
    FROM public.profiles WHERE id = auth.uid();

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'No se puede cambiar la organización de un perfil';
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin')
       OR v_caller_org IS DISTINCT FROM OLD.organization_id
       OR (NEW.id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role) THEN
      RAISE EXCEPTION 'Sin permiso para cambiar rol o estado del perfil';
    END IF;

    -- Solo un owner puede crear otro owner
    IF NEW.role = 'owner' AND OLD.role <> 'owner' AND v_caller_role <> 'owner' THEN
      RAISE EXCEPTION 'Solo un owner puede asignar el rol owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- El usuario solo edita su propio perfil, y el resultado debe seguir siendo suyo
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Cada usuario puede leer su propio perfil aunque todavía no tenga org
DROP POLICY IF EXISTS "users_see_own_profile" ON public.profiles;
CREATE POLICY "users_see_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- ── 3. ALTA AUTOMÁTICA DE PERFIL ─────────────────────────────
-- Al registrarse se crea el perfil sin organización. El onboarding
-- (server-side) crea la organización y lo asocia como owner.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. VISTAS: RESPETAR RLS DEL USUARIO ──────────────────────

-- v_recent_inspections no exponía supervisor_id y la API filtra por él
CREATE OR REPLACE VIEW public.v_recent_inspections AS
SELECT
  i.id, i.flock_id, i.inspected_at, i.flock_age_days, i.status,
  i.total_score, i.score_label, i.mortality_count, i.mortality_pct,
  i.weight_avg_g, i.weight_cv_pct, i.organization_id,
  p.full_name AS supervisor_name,
  f.code AS flock_code, h.name AS house_name, fm.name AS farm_name,
  i.supervisor_id
FROM public.inspections i
JOIN public.profiles p ON p.id = i.supervisor_id
JOIN public.flocks f   ON f.id = i.flock_id
JOIN public.houses h   ON h.id = f.house_id
JOIN public.farms fm   ON fm.id = h.farm_id;

ALTER VIEW public.v_active_flocks       SET (security_invoker = true);
ALTER VIEW public.v_recent_inspections  SET (security_invoker = true);
ALTER VIEW public.v_predictions_summary SET (security_invoker = true);

REVOKE ALL ON public.v_active_flocks, public.v_recent_inspections,
              public.v_predictions_summary FROM anon;

-- ── 5. TABLAS QUE QUEDARON SIN RLS ───────────────────────────

-- audit_log: cada usuario inserta sus propios registros; leen owner/admin
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_insert_own_audit" ON public.audit_log;
CREATE POLICY "users_insert_own_audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.user_org_id() AND user_id = auth.uid());
DROP POLICY IF EXISTS "admins_read_audit" ON public.audit_log;
CREATE POLICY "admins_read_audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() AND public.user_role() IN ('owner', 'admin'));
REVOKE ALL ON public.audit_log FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;

-- genetic_standards: referencia de solo lectura
ALTER TABLE public.genetic_standards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "genetic_standards_read" ON public.genetic_standards;
CREATE POLICY "genetic_standards_read" ON public.genetic_standards
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.genetic_standards FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.genetic_standards FROM authenticated;

-- edge_function_logs: solo service_role (sin políticas)
ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_function_logs FROM anon, authenticated;

-- ── 6. POLÍTICAS FALTANTES ───────────────────────────────────

-- subscriptions: la org puede ver su plan (escritura solo servidor)
DROP POLICY IF EXISTS "users_see_own_subscription" ON public.subscriptions;
CREATE POLICY "users_see_own_subscription" ON public.subscriptions
  FOR SELECT USING (organization_id = public.user_org_id());

-- feed_inventory
DROP POLICY IF EXISTS "users_see_feed" ON public.feed_inventory;
CREATE POLICY "users_see_feed" ON public.feed_inventory
  FOR SELECT USING (organization_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_manage_feed" ON public.feed_inventory;
CREATE POLICY "staff_manage_feed" ON public.feed_inventory
  FOR ALL USING (organization_id = public.user_org_id() AND public.user_role() <> 'viewer')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() <> 'viewer');

-- alerts: el scoring las genera con el usuario que completa la inspección
DROP POLICY IF EXISTS "staff_insert_alerts" ON public.alerts;
CREATE POLICY "staff_insert_alerts" ON public.alerts
  FOR INSERT WITH CHECK (organization_id = public.user_org_id() AND public.user_role() <> 'viewer');
DROP POLICY IF EXISTS "staff_update_alerts" ON public.alerts;
CREATE POLICY "staff_update_alerts" ON public.alerts
  FOR UPDATE USING (organization_id = public.user_org_id() AND public.user_role() <> 'viewer')
  WITH CHECK (organization_id = public.user_org_id());

-- ── 7. INSPECCIONES: PERMITIR COMPLETAR EL BORRADOR ──────────
-- Antes el WITH CHECK implícito exigía status='draft' también en la
-- fila nueva, así que un supervisor nunca podía pasarla a 'completed'.

DROP POLICY IF EXISTS "supervisors_update_own_drafts" ON public.inspections;
CREATE POLICY "supervisors_update_own_drafts" ON public.inspections
  FOR UPDATE
  USING (
    organization_id = public.user_org_id()
    AND (supervisor_id = auth.uid() OR public.user_role() IN ('owner', 'admin', 'veterinarian'))
    AND (status = 'draft' OR public.user_role() IN ('owner', 'admin'))
  )
  WITH CHECK (
    organization_id = public.user_org_id()
    AND (supervisor_id = auth.uid() OR public.user_role() IN ('owner', 'admin', 'veterinarian'))
  );

-- ── 8. SECCIONES DE INSPECCIÓN ───────────────────────────────
-- Una fila por inspección: permite el upsert del wizard y que la API
-- devuelva cada sección como objeto (no como array).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inspection_environmental', 'inspection_water', 'inspection_feeding',
    'inspection_health', 'inspection_weights'
  ]
  LOOP
    -- Si hubiera duplicados, conservar la fila más reciente por ctid
    EXECUTE format(
      'DELETE FROM public.%I a USING public.%I b
        WHERE a.inspection_id = b.inspection_id AND a.ctid < b.ctid', t, t);

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (inspection_id)',
      'uq_' || t || '_inspection', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'supervisors_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE
         USING (EXISTS (SELECT 1 FROM public.inspections i
                        WHERE i.id = inspection_id
                          AND i.organization_id = public.user_org_id()
                          AND i.status = ''draft''))
         WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i
                        WHERE i.id = inspection_id
                          AND i.organization_id = public.user_org_id()
                          AND i.status = ''draft''))',
      'supervisors_update_' || t, t);
  END LOOP;
END $$;

-- ── 9. VARIOS ────────────────────────────────────────────────

-- Depende de CURRENT_DATE: no puede ser IMMUTABLE
CREATE OR REPLACE FUNCTION public.get_flock_age(entry_date DATE)
RETURNS INT LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN GREATEST(0, CURRENT_DATE - entry_date);
END;
$$;

COMMIT;


-- ############################################################
-- ##  006_thermal_comfort_fix.sql
-- ############################################################

-- ============================================================
-- AVIGESTION - Migration 006: Fix Confort Térmico
--   1. RLS + permisos en tablas de referencia (antes expuestas vía API)
--   2. Vista v_thermal_reference con security_invoker
--   3. Índices únicos (permiten seeds idempotentes con ON CONFLICT)
--   4. calculate_effective_temp: rangos por EDAD, interpolación de
--      velocidad de aire, alerta de corriente en pollitos, estado T+HR
--   5. CHECK constraints en inspection_environmental
-- Idempotente: se puede correr más de una vez sin error.
-- Requiere: 001–005 aplicadas.
-- ============================================================

BEGIN;

-- ── 1. RLS Y PERMISOS EN TABLAS DE REFERENCIA ────────────────
-- Lectura: solo usuarios autenticados.
-- Escritura: nadie vía API (sin políticas de INSERT/UPDATE/DELETE).
-- service_role (Edge Functions, dashboard de Supabase) sigue pudiendo
-- escribir porque saltea RLS.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'thermal_magic_standards',
    'wind_chill_reduction',
    'humidity_correction'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t
    );

    -- Defensa en profundidad: permisos a nivel tabla además de RLS
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated',
      t
    );
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);

    -- Secuencias SERIAL: nadie de la API necesita usarlas
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', t || '_id_seq');
  END LOOP;
END $$;

-- ── 2. VISTA: respetar RLS del usuario que consulta ──────────
-- Sin security_invoker, la vista corre con permisos del owner y
-- saltea RLS de las tablas base.

ALTER VIEW public.v_thermal_reference SET (security_invoker = true);
REVOKE ALL ON public.v_thermal_reference FROM anon;
GRANT SELECT ON public.v_thermal_reference TO authenticated;

-- ── 3. ÍNDICES ÚNICOS ────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_magic_age_range
  ON public.thermal_magic_standards (age_day_from, age_day_to);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wind_velocity
  ON public.wind_chill_reduction (air_velocity_ms);

CREATE UNIQUE INDEX IF NOT EXISTS uq_humidity_range
  ON public.humidity_correction (hr_pct_from, hr_pct_to);

-- ── 4. FUNCIÓN: TEMPERATURA EFECTIVA POR EDAD ────────────────
-- Cambios respecto de 003:
--   • Nuevo parámetro p_age_days (opcional). El confort se evalúa
--     contra temp_min_c / temp_max_c de thermal_magic_standards
--     para esa edad, no contra un 24–28 °C fijo.
--   • Sin edad → se usa el rango genérico 24–28 °C de la versión
--     anterior (compatibilidad con llamadas existentes).
--   • Velocidad de aire interpolada linealmente entre filas de
--     wind_chill_reduction (antes: valor más cercano).
--   • draft_warning: corriente de aire sobre pollitos jóvenes.
--   • magic_status: T+HR vs. rango de la edad (solo aves ≤ 21 días).
--   • Recomendaciones distintas para aves jóvenes y adultas.
-- Se elimina la versión de 3 parámetros: con p_age_days DEFAULT NULL
-- las llamadas viejas siguen funcionando contra la nueva.

DROP FUNCTION IF EXISTS public.calculate_effective_temp(DECIMAL, INT, DECIMAL);
DROP FUNCTION IF EXISTS public.calculate_effective_temp(DECIMAL, INT, DECIMAL, INT);

CREATE FUNCTION public.calculate_effective_temp(
  p_temp_c        DECIMAL,            -- temperatura ambiental medida (°C)
  p_hr_pct        INT,                -- humedad relativa (%)
  p_air_velocity  DECIMAL DEFAULT 0,  -- velocidad de aire a altura de las aves (m/s)
  p_age_days      INT     DEFAULT NULL -- edad del lote en días
)
RETURNS TABLE (
  effective_temp_c  DECIMAL,
  magic_sum         INT,
  hr_correction_c   DECIMAL,
  wind_chill_c      DECIMAL,
  comfort_status    VARCHAR,
  comfort_label     VARCHAR,
  recommendation    TEXT,
  target_min_c      DECIMAL,   -- rango objetivo usado
  target_max_c      DECIMAL,
  magic_status      VARCHAR,   -- BAJO | OK | ALTO | NULL (no aplica)
  draft_warning     BOOLEAN    -- corriente de aire sobre pollitos
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  -- Márgenes (°C) respecto del rango objetivo de la edad.
  -- Calibrar con el veterinario/asesor técnico.
  c_cold_critical  CONSTANT DECIMAL := 3.0;  -- < min - 3  → FRIO_CRITICO
  c_cold           CONSTANT DECIMAL := 1.0;  -- < min - 1  → FRIO
  c_warm           CONSTANT DECIMAL := 2.0;  -- ≤ max + 2  → CALIDO
  c_heat           CONSTANT DECIMAL := 5.0;  -- ≤ max + 5  → CALOR
  c_young_age      CONSTANT INT     := 21;   -- aves "jóvenes" (sin plumaje completo)
  c_draft_lt14_ms  CONSTANT DECIMAL := 1.0;  -- corriente peligrosa < 14 días
  c_draft_lt21_ms  CONSTANT DECIMAL := 1.5;  -- corriente peligrosa 14–21 días
  c_generic_min    CONSTANT DECIMAL := 24.0; -- rango sin edad (compatibilidad)
  c_generic_max    CONSTANT DECIMAL := 28.0;

  v_hr          INT;
  v_vel         DECIMAL;
  v_young       BOOLEAN;
  v_std         thermal_magic_standards%ROWTYPE;
  v_has_std     BOOLEAN := FALSE;
  v_min         DECIMAL;
  v_max         DECIMAL;
  v_hr_corr     DECIMAL;
  v_lo          wind_chill_reduction%ROWTYPE;
  v_hi          wind_chill_reduction%ROWTYPE;
  v_red_lo      DECIMAL;
  v_red_hi      DECIMAL;
  v_wind        DECIMAL;
  v_eff         DECIMAL;
  v_magic       INT;
  v_magic_st    VARCHAR;
  v_draft       BOOLEAN := FALSE;
  v_status      VARCHAR;
  v_label       VARCHAR;
  v_reco        TEXT;
BEGIN
  -- 0. Validación y normalización de entradas
  IF p_temp_c IS NULL OR p_hr_pct IS NULL THEN
    RAISE EXCEPTION 'calculate_effective_temp: temperatura y humedad son obligatorias';
  END IF;
  IF p_age_days IS NOT NULL AND p_age_days < 0 THEN
    RAISE EXCEPTION 'calculate_effective_temp: edad inválida (%)', p_age_days;
  END IF;

  v_hr    := LEAST(GREATEST(p_hr_pct, 0), 100);
  v_vel   := GREATEST(COALESCE(p_air_velocity, 0), 0);
  v_young := p_age_days IS NOT NULL AND p_age_days <= c_young_age;

  -- 1. Rango objetivo según edad
  IF p_age_days IS NOT NULL THEN
    SELECT s.* INTO v_std
    FROM thermal_magic_standards s
    WHERE p_age_days BETWEEN s.age_day_from AND s.age_day_to
    ORDER BY s.age_day_from
    LIMIT 1;

    IF NOT FOUND THEN
      -- Edad mayor al último tramo (ej. día 45): usar el último
      SELECT s.* INTO v_std
      FROM thermal_magic_standards s
      WHERE s.age_day_to < p_age_days
      ORDER BY s.age_day_to DESC
      LIMIT 1;
    END IF;

    v_has_std := FOUND;
  END IF;

  IF v_has_std THEN
    v_min := v_std.temp_min_c;
    v_max := v_std.temp_max_c;
  ELSE
    v_min := c_generic_min;
    v_max := c_generic_max;
  END IF;

  -- 2. Corrección por humedad
  SELECT hc.correction_c INTO v_hr_corr
  FROM humidity_correction hc
  WHERE v_hr BETWEEN hc.hr_pct_from AND hc.hr_pct_to
  ORDER BY hc.hr_pct_from
  LIMIT 1;
  v_hr_corr := COALESCE(v_hr_corr, 0);

  -- 3. Wind chill interpolado entre las dos filas vecinas
  SELECT w.* INTO v_lo
  FROM wind_chill_reduction w
  WHERE w.air_velocity_ms <= v_vel
  ORDER BY w.air_velocity_ms DESC
  LIMIT 1;

  SELECT w.* INTO v_hi
  FROM wind_chill_reduction w
  WHERE w.air_velocity_ms >= v_vel
  ORDER BY w.air_velocity_ms ASC
  LIMIT 1;

  IF v_hi.id IS NULL THEN v_hi := v_lo; END IF;  -- por encima de la máxima: tope
  IF v_lo.id IS NULL THEN v_lo := v_hi; END IF;

  v_red_lo := CASE
    WHEN p_temp_c <= 26 THEN v_lo.reduction_at_25c
    WHEN p_temp_c <= 29 THEN v_lo.reduction_at_28c
    WHEN p_temp_c <= 31 THEN v_lo.reduction_at_30c
    WHEN p_temp_c <= 33 THEN v_lo.reduction_at_32c
    ELSE v_lo.reduction_at_35c
  END;
  v_red_hi := CASE
    WHEN p_temp_c <= 26 THEN v_hi.reduction_at_25c
    WHEN p_temp_c <= 29 THEN v_hi.reduction_at_28c
    WHEN p_temp_c <= 31 THEN v_hi.reduction_at_30c
    WHEN p_temp_c <= 33 THEN v_hi.reduction_at_32c
    ELSE v_hi.reduction_at_35c
  END;

  IF v_lo.air_velocity_ms IS NULL OR v_hi.air_velocity_ms IS NULL THEN
    v_wind := 0;
  ELSIF v_hi.air_velocity_ms = v_lo.air_velocity_ms THEN
    v_wind := v_red_lo;
  ELSE
    v_wind := v_red_lo + (v_red_hi - v_red_lo)
              * (LEAST(v_vel, v_hi.air_velocity_ms) - v_lo.air_velocity_ms)
              / (v_hi.air_velocity_ms - v_lo.air_velocity_ms);
  END IF;
  v_wind := COALESCE(v_wind, 0);

  -- 4. Temperatura efectiva
  v_eff := p_temp_c + v_hr_corr + v_wind;

  -- 5. Corriente de aire sobre pollitos
  v_draft := p_age_days IS NOT NULL AND (
       (p_age_days < 14 AND v_vel >= c_draft_lt14_ms)
    OR (p_age_days <= c_young_age AND v_vel >= c_draft_lt21_ms)
  );

  -- 6. Temperatura mágica (T + HR), solo relevante en aves jóvenes
  v_magic := ROUND(p_temp_c + v_hr)::INT;
  IF v_has_std AND v_young THEN
    v_magic_st := CASE
      WHEN v_magic < v_std.magic_sum_min THEN 'BAJO'
      WHEN v_magic > v_std.magic_sum_max THEN 'ALTO'
      ELSE 'OK'
    END;
  END IF;

  -- 7. Estado relativo al rango de la edad
  v_status := CASE
    WHEN v_eff <  v_min - c_cold_critical THEN 'FRIO_CRITICO'
    WHEN v_eff <  v_min - c_cold          THEN 'FRIO'
    WHEN v_eff <  v_min                   THEN 'FRESCO'
    WHEN v_eff <= v_max                   THEN 'CONFORT'
    WHEN v_eff <= v_max + c_warm          THEN 'CALIDO'
    WHEN v_eff <= v_max + c_heat          THEN 'CALOR'
    ELSE 'ESTRES_TERMICO'
  END;

  v_label := CASE v_status
    WHEN 'FRIO_CRITICO'   THEN 'Frío crítico'
    WHEN 'FRIO'           THEN 'Frío'
    WHEN 'FRESCO'         THEN 'Fresco — debajo del rango'
    WHEN 'CONFORT'        THEN 'Zona de confort ✓'
    WHEN 'CALIDO'         THEN 'Cálido — atención'
    WHEN 'CALOR'          THEN 'Calor — estrés leve'
    ELSE                       'Estrés térmico severo'
  END;

  -- 8. Recomendación (distinta para aves jóvenes y adultas)
  v_reco := CASE v_status
    WHEN 'FRIO_CRITICO' THEN format(
      'URGENTE: temperatura efectiva %s °C, por debajo del mínimo de %s °C para la edad. Aumentar calefacción y reducir velocidad de aire. Riesgo de hipotermia y mortalidad.',
      ROUND(v_eff, 1), v_min)
    WHEN 'FRIO' THEN
      'Aumentar calefacción o reducir caudal de aire. Observar si las aves se amontonan.'
    WHEN 'FRESCO' THEN format(
      'Levemente por debajo del rango objetivo (%s–%s °C). Subir calefacción 1 °C o reducir ventilación.',
      v_min, v_max)
    WHEN 'CONFORT' THEN
      'Dentro del rango objetivo para la edad. Mantener condiciones actuales.'
    WHEN 'CALIDO' THEN CASE WHEN v_young
      THEN 'Reducir calefacción 1–2 °C y ampliar ventilación mínima. Observar aves alejadas de las criadoras con pico abierto.'
      ELSE 'Temperatura alta. Aumentar velocidad de aire o activar nebulización.' END
    WHEN 'CALOR' THEN CASE WHEN v_young
      THEN 'Reducir o apagar criadoras y aumentar ventilación de transición sin generar corrientes directas sobre las aves.'
      ELSE 'Estrés térmico. Aumentar ventilación túnel a 2.5–3.0 m/s y activar panel evaporativo si está disponible.' END
    ELSE CASE WHEN v_young
      THEN 'CRÍTICO: cortar calefacción y ventilar de inmediato. Verificar agua a disposición y comportamiento de jadeo.'
      ELSE 'CRÍTICO: estrés térmico severo. Ventilación máxima + enfriamiento evaporativo urgente. Asegurar agua fresca.' END
  END;

  IF v_draft THEN
    v_reco := v_reco || format(
      ' ATENCIÓN: %s m/s sobre aves de %s días puede enfriarlas por corriente; medir a altura de las aves y reducir si es necesario.',
      ROUND(v_vel, 2), p_age_days);
  END IF;

  IF v_magic_st = 'BAJO' THEN
    v_reco := v_reco || format(
      ' Suma T+HR = %s (mínimo %s para la edad): subir temperatura o humedad.',
      v_magic, v_std.magic_sum_min);
  ELSIF v_magic_st = 'ALTO' THEN
    v_reco := v_reco || format(
      ' Suma T+HR = %s (máximo %s para la edad): bajar temperatura o humedad.',
      v_magic, v_std.magic_sum_max);
  END IF;

  IF p_age_days IS NULL THEN
    v_reco := v_reco || format(
      ' (Sin edad del lote: se usó el rango genérico %s–%s °C.)', v_min, v_max);
  END IF;

  RETURN QUERY SELECT
    ROUND(v_eff, 1),
    v_magic,
    ROUND(v_hr_corr, 1),
    ROUND(v_wind, 1),
    v_status,
    v_label,
    v_reco,
    v_min,
    v_max,
    v_magic_st,
    v_draft;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_effective_temp(DECIMAL, INT, DECIMAL, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_effective_temp(DECIMAL, INT, DECIMAL, INT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_effective_temp(DECIMAL, INT, DECIMAL, INT) IS
  'Temperatura efectiva (T + corrección HR + wind chill interpolado) evaluada contra el rango de thermal_magic_standards para la edad del lote. Sin edad usa 24–28 °C.';

-- ── 5. CONSTRAINTS EN INSPECTION_ENVIRONMENTAL ───────────────
-- NOT VALID: se aplican a filas nuevas sin revalidar las existentes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ie_thermal_status'
      AND conrelid = 'public.inspection_environmental'::regclass
  ) THEN
    ALTER TABLE public.inspection_environmental
      ADD CONSTRAINT chk_ie_thermal_status CHECK (
        thermal_status IS NULL OR thermal_status IN (
          'FRIO_CRITICO', 'FRIO', 'FRESCO', 'CONFORT',
          'CALIDO', 'CALOR', 'ESTRES_TERMICO'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ie_air_velocity'
      AND conrelid = 'public.inspection_environmental'::regclass
  ) THEN
    ALTER TABLE public.inspection_environmental
      ADD CONSTRAINT chk_ie_air_velocity CHECK (
        air_velocity_ms IS NULL OR air_velocity_ms BETWEEN 0 AND 10
      ) NOT VALID;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- PRUEBAS (correr a mano después de aplicar; resultados esperados)
-- ============================================================
-- Pollito día 2, 33 °C, 60 %, sin aire → CONFORT, magic 93 OK
--   (la versión 003 devolvía ESTRES_TERMICO)
-- SELECT * FROM calculate_effective_temp(33, 60, 0, 2);
--
-- Pollito día 2, 24 °C, 60 %, sin aire → FRIO_CRITICO, magic 84 BAJO
--   (la versión 003 devolvía CONFORT)
-- SELECT * FROM calculate_effective_temp(24, 60, 0, 2);
--
-- Día 10, 29 °C, 60 %, 1.5 m/s → efectiva 26.5, FRIO, draft_warning = true
-- SELECT * FROM calculate_effective_temp(29, 60, 1.5, 10);
--
-- Día 38, 32 °C, 65 %, 2.5 m/s → efectiva 25.5, CALOR (rango 18–22)
-- SELECT * FROM calculate_effective_temp(32, 65, 2.5, 38);
--
-- Interpolación: 30 °C, 1.25 m/s → wind_chill_c = -2.5
-- SELECT * FROM calculate_effective_temp(30, 60, 1.25, 30);
--
-- Compatibilidad: llamada vieja sin edad → rango 24–28
-- SELECT * FROM calculate_effective_temp(30, 60, 2.0);
--
-- RLS: con la clave anon, esto debe devolver 0 filas
-- SELECT count(*) FROM thermal_magic_standards;

