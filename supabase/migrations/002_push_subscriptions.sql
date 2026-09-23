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
