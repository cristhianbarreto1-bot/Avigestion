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
