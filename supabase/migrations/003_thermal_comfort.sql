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
