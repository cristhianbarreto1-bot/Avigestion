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
