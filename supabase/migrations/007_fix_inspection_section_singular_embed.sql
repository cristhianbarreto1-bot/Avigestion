-- ============================================================
-- AVIGESTION - 007: PostgREST embeds singulares para secciones
-- ============================================================
-- La 005 creó un índice único (inspection_id) en cada tabla de
-- sección con la intención de que PostgREST devolviera
-- `inspection_<seccion>(*)` como objeto y no como array al hacer
-- GET /api/inspections/[id] o el select de /complete. Un índice
-- único por sí solo no alcanza: PostgREST solo infiere relación
-- 1-a-1 (y por lo tanto objeto singular) a partir de una
-- CONSTRAINT UNIQUE o PRIMARY KEY sobre la FK, no de un índice
-- suelto. Sin esto, `scoring-engine.ts` recibe un array en vez
-- de un objeto (ej. inspection.inspection_environmental[0]), sus
-- checks de `data.campo != null` nunca matchean, y el motor de
-- scoring devuelve 100 en todas las secciones sin importar los
-- datos reales, además de no generar ninguna alerta.
--
-- Esta migración convierte los índices existentes (creados en la
-- 005) en constraints UNIQUE reales, sin reescribir las tablas.

BEGIN;

DO $$
DECLARE
  t TEXT;
  idx TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inspection_environmental', 'inspection_water', 'inspection_feeding',
    'inspection_health', 'inspection_weights'
  ]
  LOOP
    idx := 'uq_' || t || '_inspection';

    IF EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = idx
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = idx
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE USING INDEX %I',
        t, idx, idx
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Después de aplicar esto, recargar el schema cache de PostgREST:
--   NOTIFY pgrst, 'reload schema';
-- (Supabase lo hace automáticamente al correr una migración, pero
-- si se pega este SQL a mano en el SQL Editor, ejecutar el NOTIFY
-- o esperar unos segundos a que el cache se refresque solo.)
NOTIFY pgrst, 'reload schema';
