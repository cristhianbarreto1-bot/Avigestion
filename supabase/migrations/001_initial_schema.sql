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
