// ============================================================
// AVIGESTION - Motor de Scoring e Inspección
// Calcula puntajes por sección y genera alertas automáticas
// ============================================================

import type {
  InspectionEnvironmental,
  InspectionWater,
  InspectionFeeding,
  InspectionHealth,
  InspectionWeights,
  InspectionScoreResult,
  AlertSeverity,
  GeneticStandard,
  FlockGenetic,
} from '@/types';

// ---- CONSTANTES -------------------------------------------

const UNIFORMITY_CAUSES = [
  'Temperatura no uniforme por zonas del galpón',
  'Caudal desigual en bebederos (presión incorrecta)',
  'Altura de comederos inadecuada para el tamaño de aves',
  'Calidad heterogénea del pollito de un día',
  'Densidad excesiva en alguna zona del galpón',
  'Estado de cama deficiente (humedad, costras)',
  'Distribución de luz no uniforme (zonas oscuras)',
];

const GENETIC_DISPLAY: Record<FlockGenetic, string> = {
  cobb_500: 'Cobb 500',
  ross_308: 'Ross 308',
  ross_708: 'Ross 708',
  hubbard: 'Hubbard',
  other: 'Otra',
};

// ---- CÁLCULOS ESTADÍSTICOS --------------------------------

export function calculateWeightStats(weights: number[]): {
  avg: number;
  min: number;
  max: number;
  stddev: number;
  cv: number;
  uniformity: number;
} {
  if (!weights || weights.length === 0) {
    return { avg: 0, min: 0, max: 0, stddev: 0, cv: 0, uniformity: 0 };
  }

  const n = weights.length;
  const avg = weights.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  const variance = weights.reduce((acc, w) => acc + Math.pow(w - avg, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = avg > 0 ? (stddev / avg) * 100 : 0;

  // Uniformidad: % de aves dentro del ±10% del promedio
  const lowerBound = avg * 0.9;
  const upperBound = avg * 1.1;
  const withinRange = weights.filter(w => w >= lowerBound && w <= upperBound).length;
  const uniformity = (withinRange / n) * 100;

  return {
    avg: Math.round(avg),
    min,
    max,
    stddev: Math.round(stddev),
    cv: Math.round(cv * 100) / 100,
    uniformity: Math.round(uniformity * 10) / 10,
  };
}

export function getUniformityCauses(cv: number, count: number): string[] {
  if (cv <= 8) return [];
  // Devuelve todas las posibles causas ordenadas por frecuencia
  // En v2 esto será personalizable por la inspección
  return UNIFORMITY_CAUSES;
}

// ---- SCORING POR SECCIÓN ----------------------------------

/**
 * Ambiental: temperatura, humedad, cama, aire (máx 100 pts)
 */
export function scoreEnvironmental(data: Partial<InspectionEnvironmental>): number {
  let score = 100;
  let checks = 0;

  // Temperatura (35 puntos)
  if (data.temp_actual_c != null && data.temp_in_range != null) {
    checks++;
    if (!data.temp_in_range) {
      const diff = Math.abs((data.temp_actual_c ?? 0) - (data.temp_standard_c ?? 0));
      score -= diff > 5 ? 35 : diff > 3 ? 20 : 10;
    }
  }

  // Humedad (20 puntos)
  if (data.humidity_pct != null && data.humidity_in_range != null) {
    checks++;
    if (!data.humidity_in_range) score -= 20;
  }

  // Amoniaco (20 puntos)
  if (data.ammonia_ppm != null) {
    checks++;
    if (data.ammonia_ppm > 25) score -= 20;
    else if (data.ammonia_ppm > 15) score -= 10;
  }

  // Cama (15 puntos)
  if (data.litter_condition != null) {
    checks++;
    const litScore = ((data.litter_condition ?? 5) / 5) * 15;
    score -= (15 - litScore);
  }

  // Ventilación (10 puntos)
  if (data.ventilation_ok != null) {
    checks++;
    if (!data.ventilation_ok) score -= 10;
  }

  if (checks === 0) return 100; // Sin datos = no penalizar
  return Math.max(0, Math.round(score));
}

/**
 * Agua: consumo, calidad, estado de bebederos (máx 100 pts)
 */
export function scoreWater(data: Partial<InspectionWater>): number {
  let score = 100;

  if (data.consumption_in_range != null && !data.consumption_in_range) {
    const ratio = (data.consumption_liters ?? 0) / Math.max(data.consumption_standard ?? 1, 1);
    score -= ratio < 0.7 ? 40 : ratio < 0.85 ? 25 : 15;
  }

  if (data.pressure_ok != null && !data.pressure_ok) score -= 20;
  if (data.drinkers_clean != null && !data.drinkers_clean) score -= 20;
  if (data.drinker_height_ok != null && !data.drinker_height_ok) score -= 15;

  if (data.ph_level != null) {
    const ph = data.ph_level;
    if (ph < 6 || ph > 8) score -= 15;
    else if (ph < 6.5 || ph > 7.5) score -= 5;
  }

  return Math.max(0, Math.round(score));
}

/**
 * Alimentación: consumo, distribución, calidad (máx 100 pts)
 */
export function scoreFeeding(data: Partial<InspectionFeeding>): number {
  let score = 100;

  if (data.distribution_uniform != null && !data.distribution_uniform) score -= 25;
  if (data.feeder_height_ok != null && !data.feeder_height_ok) score -= 20;
  if (data.feed_quality_ok != null && !data.feed_quality_ok) score -= 25;
  if (data.feed_storage_ok != null && !data.feed_storage_ok) score -= 15;
  if (data.mold_detected) score -= 30;
  if (data.pests_detected) score -= 25;

  return Math.max(0, Math.round(score));
}

/**
 * Sanidad: mortalidad, signos clínicos, comportamiento (máx 100 pts)
 */
export function scoreHealth(
  data: Partial<InspectionHealth>,
  totalBirds: number,
): number {
  let score = 100;

  // Mortalidad diaria (principal indicador)
  const deadPct = totalBirds > 0
    ? ((data.dead_count ?? 0) + (data.culled_count ?? 0)) / totalBirds * 100
    : 0;

  if (deadPct > 1) score -= 50;
  else if (deadPct > 0.5) score -= 30;
  else if (deadPct > 0.3) score -= 15;
  else if (deadPct > 0.2) score -= 5;

  // Signos clínicos
  const signs = [
    data.signs_respiratory,
    data.signs_digestive,
    data.signs_nervous,
    data.signs_locomotion,
    data.signs_skin,
    data.signs_ocular,
  ].filter(Boolean).length;

  score -= signs * 8;

  // Comportamiento
  if (data.behavior_normal === false) score -= 10;
  if (data.distribution_uniform === false) score -= 10;

  return Math.max(0, Math.round(score));
}

/**
 * Pesos: desvío del estándar, coeficiente de variación (máx 100 pts)
 */
export function scoreWeights(data: Partial<InspectionWeights>): number {
  let score = 100;

  // Desvío vs estándar genético
  if (data.weight_vs_standard != null && data.weight_vs_standard !== undefined) {
    const dev = Math.abs(data.weight_vs_standard);
    if (dev > 15) score -= 40;
    else if (dev > 10) score -= 25;
    else if (dev > 5) score -= 10;
  }

  // Coeficiente de variación (uniformidad)
  if (data.cv_pct != null && data.cv_pct !== undefined) {
    if (data.cv_pct > 15) score -= 40;
    else if (data.cv_pct > 10) score -= 25;
    else if (data.cv_pct > 8) score -= 10;
  }

  return Math.max(0, Math.round(score));
}

// ---- SCORE TOTAL ------------------------------------------

export function calculateTotalScore(scores: {
  environmental: number;
  water: number;
  feeding: number;
  health: number;
  weights: number;
}): { total: number; label: 'Aprobado' | 'Observado' | 'Crítico' } {
  // Pesos relativos de cada sección
  const weights = {
    health: 0.35,      // La sanidad es lo más crítico
    environmental: 0.25,
    water: 0.20,
    feeding: 0.12,
    weights: 0.08,
  };

  const total =
    scores.health * weights.health +
    scores.environmental * weights.environmental +
    scores.water * weights.water +
    scores.feeding * weights.feeding +
    scores.weights * weights.weights;

  const rounded = Math.round(total);
  const label =
    rounded >= 80 ? 'Aprobado' :
    rounded >= 60 ? 'Observado' : 'Crítico';

  return { total: rounded, label };
}

// ---- MOTOR DE ALERTAS -------------------------------------

interface AlertCandidate {
  category: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommended_action: string;
  trigger_value?: number;
  trigger_threshold?: number;
}

export function generateAlerts(params: {
  environmental?: Partial<InspectionEnvironmental>;
  water?: Partial<InspectionWater>;
  feeding?: Partial<InspectionFeeding>;
  health?: Partial<InspectionHealth>;
  weights?: Partial<InspectionWeights>;
  flock_age_days: number;
  total_birds: number;
  genetic?: FlockGenetic;
}): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const { environmental, water, feeding, health, weights, total_birds, flock_age_days } = params;

  // ---- ALERTAS DE MORTALIDAD --------------------------------
  if (health) {
    const totalDead = (health.dead_count ?? 0) + (health.culled_count ?? 0);
    const mortalityPct = total_birds > 0 ? (totalDead / total_birds) * 100 : 0;

    if (mortalityPct > 1) {
      alerts.push({
        category: 'mortality',
        severity: 'critical',
        title: `Mortalidad crítica: ${mortalityPct.toFixed(2)}% en un día`,
        description: `Se registraron ${totalDead} bajas (${mortalityPct.toFixed(2)}% del lote). El umbral crítico es 1% diario.`,
        recommended_action: 'Necropsia inmediata de al menos 3 aves. Contactar al veterinario. Verificar agua, alimento y ventilación.',
        trigger_value: mortalityPct,
        trigger_threshold: 1,
      });
    } else if (mortalityPct > 0.5) {
      alerts.push({
        category: 'mortality',
        severity: 'warning',
        title: `Mortalidad elevada: ${mortalityPct.toFixed(2)}% diario`,
        description: `${totalDead} bajas registradas. Supera el umbral de atención (0.5% diario).`,
        recommended_action: 'Realizar necropsia, revisar ventilación y calidad del agua. Monitorear próximas 24hs.',
        trigger_value: mortalityPct,
        trigger_threshold: 0.5,
      });
    }

    // Signos clínicos
    const signs: string[] = [];
    if (health.signs_respiratory) signs.push('respiratorios');
    if (health.signs_digestive) signs.push('digestivos');
    if (health.signs_nervous) signs.push('nerviosos');
    if (health.signs_locomotion) signs.push('locomotores');

    if (signs.length >= 2) {
      alerts.push({
        category: 'clinical_signs',
        severity: 'critical',
        title: `Múltiples signos clínicos detectados (${signs.join(', ')})`,
        description: `Se observaron signos en ${signs.length} sistemas orgánicos. Riesgo de enfermedad infecciosa activa.`,
        recommended_action: 'Intervención veterinaria urgente. Aislar aves afectadas. Revisar programa sanitario.',
      });
    } else if (signs.length === 1) {
      alerts.push({
        category: 'clinical_signs',
        severity: 'warning',
        title: `Signo clínico detectado: ${signs[0]}`,
        description: `Se observaron signos ${signs[0]} en el lote.`,
        recommended_action: 'Monitoreo intensivo. Consultar con el veterinario si persiste en 24hs.',
      });
    }
  }

  // ---- ALERTAS AMBIENTALES ----------------------------------
  if (environmental) {
    if (environmental.temp_in_range === false && environmental.temp_actual_c !== null) {
      const diff = (environmental.temp_actual_c ?? 0) - (environmental.temp_standard_c ?? 0);
      const direction = diff > 0 ? 'por encima' : 'por debajo';
      alerts.push({
        category: 'temperature',
        severity: Math.abs(diff) > 5 ? 'critical' : 'warning',
        title: `Temperatura ${direction} del rango: ${environmental.temp_actual_c}°C`,
        description: `Temperatura actual ${environmental.temp_actual_c}°C vs estándar ${environmental.temp_standard_c}°C (desvío ${Math.abs(diff).toFixed(1)}°C).`,
        recommended_action: diff > 0
          ? 'Aumentar ventilación, revisar sistemas de enfriamiento. En días calurosos: nebulización.'
          : 'Verificar sistemas de calefacción. En pollitos jóvenes el frío puede ser fatal.',
        trigger_value: environmental.temp_actual_c ?? undefined,
        trigger_threshold: environmental.temp_standard_c ?? undefined,
      });
    }

    if (environmental.ammonia_ppm !== null && (environmental.ammonia_ppm ?? 0) > 25) {
      alerts.push({
        category: 'air_quality',
        severity: (environmental.ammonia_ppm ?? 0) > 40 ? 'critical' : 'warning',
        title: `Amoniaco elevado: ${environmental.ammonia_ppm} ppm`,
        description: `Nivel de NH₃ supera el límite aceptable de 25 ppm. Riesgo para las vías respiratorias de las aves.`,
        recommended_action: 'Aumentar ventilación inmediatamente. Revisar estado de la cama. Considerar enmiendas (sulfato de aluminio).',
        trigger_value: environmental.ammonia_ppm ?? undefined,
        trigger_threshold: 25,
      });
    }
  }

  // ---- ALERTAS DE AGUA --------------------------------------
  if (water) {
    if (water.consumption_in_range === false && water.consumption_liters !== null) {
      const ratio = (water.consumption_liters ?? 0) / Math.max(water.consumption_standard ?? 1, 1);
      if (ratio < 0.8) {
        alerts.push({
          category: 'water_consumption',
          severity: ratio < 0.65 ? 'critical' : 'warning',
          title: `Consumo de agua bajo: ${Math.round(ratio * 100)}% del estándar`,
          description: `Consumo actual ${water.consumption_liters}L vs ${water.consumption_standard}L esperados.`,
          recommended_action: 'Verificar presión y funcionamiento de bebederos. Revisar calidad del agua (pH, temperatura). El bajo consumo es precursor de problemas sanitarios.',
          trigger_value: water.consumption_liters ?? undefined,
          trigger_threshold: water.consumption_standard ?? undefined,
        });
      }
    }
  }

  // ---- ALERTAS DE UNIFORMIDAD -------------------------------
  if (weights && weights.cv_pct !== null && (weights.cv_pct ?? 0) > 8) {
    alerts.push({
      category: 'weight_uniformity',
      severity: (weights.cv_pct ?? 0) > 12 ? 'critical' : 'warning',
      title: `Baja uniformidad del lote: CV ${weights.cv_pct?.toFixed(1)}%`,
      description: `Coeficiente de variación de ${weights.cv_pct?.toFixed(1)}% supera el límite de 8%. Uniformidad estimada: ${weights.uniformity_pct?.toFixed(0)}%.`,
      recommended_action: `Investigar causas: ${UNIFORMITY_CAUSES.slice(0, 3).join('; ')}.`,
      trigger_value: weights.cv_pct ?? undefined,
      trigger_threshold: 8,
    });
  }

  // ---- ALERTA DE BAJO PESO vs ESTÁNDAR ----------------------
  if (weights && weights.weight_vs_standard !== null) {
    const deviation = weights.weight_vs_standard ?? 0;
    if (deviation < -10) {
      alerts.push({
        category: 'weight_deviation',
        severity: deviation < -20 ? 'critical' : 'warning',
        title: `Peso ${Math.abs(deviation).toFixed(0)}% por debajo del estándar genético`,
        description: `El peso promedio actual está ${Math.abs(deviation).toFixed(1)}% por debajo del estándar ${params.genetic ? GENETIC_DISPLAY[params.genetic] : 'genético'} para el día ${flock_age_days}.`,
        recommended_action: 'Revisar calidad y densidad del alimento. Evaluar palatabilidad. Revisar si hubo períodos de ayuno involuntario.',
        trigger_value: deviation,
        trigger_threshold: -10,
      });
    }
  }

  return alerts;
}

// ---- FUNCIÓN PRINCIPAL ------------------------------------

export function processInspection(params: {
  environmental?: Partial<InspectionEnvironmental>;
  water?: Partial<InspectionWater>;
  feeding?: Partial<InspectionFeeding>;
  health?: Partial<InspectionHealth>;
  weights?: Partial<InspectionWeights>;
  flock_age_days: number;
  total_birds: number;
  genetic?: FlockGenetic;
}): InspectionScoreResult {
  const { environmental, water, feeding, health, weights, total_birds } = params;

  const envScore = environmental ? scoreEnvironmental(environmental) : 100;
  const waterScore = water ? scoreWater(water) : 100;
  const feedingScore = feeding ? scoreFeeding(feeding) : 100;
  const healthScore = health ? scoreHealth(health, total_birds) : 100;
  const weightsScore = weights ? scoreWeights(weights) : 100;

  const { total, label } = calculateTotalScore({
    environmental: envScore,
    water: waterScore,
    feeding: feedingScore,
    health: healthScore,
    weights: weightsScore,
  });

  const alerts = generateAlerts(params);

  return {
    environmental_score: envScore,
    water_score: waterScore,
    feeding_score: feedingScore,
    health_score: healthScore,
    weights_score: weightsScore,
    total_score: total,
    score_label: label,
    alerts,
  };
}

// ---- HELPERS DE ESTÁNDARES --------------------------------

/**
 * Obtener temperatura estándar por edad y genética
 * Interpolación lineal entre puntos conocidos
 */
export function getStandardTemp(ageDays: number, _genetic: FlockGenetic = 'cobb_500'): {
  min: number;
  max: number;
  ideal: number;
} {
  // Curva de temperatura estándar (válida para todas las genéticas modernas)
  const curve = [
    { day: 0, min: 33, max: 35 },
    { day: 7, min: 30, max: 32 },
    { day: 14, min: 26, max: 28 },
    { day: 21, min: 24, max: 26 },
    { day: 28, min: 21, max: 23 },
    { day: 35, min: 20, max: 22 },
    { day: 42, min: 19, max: 21 },
  ];

  let before = curve[0];
  let after = curve[curve.length - 1];

  for (let i = 0; i < curve.length - 1; i++) {
    if (ageDays >= curve[i].day && ageDays <= curve[i + 1].day) {
      before = curve[i];
      after = curve[i + 1];
      break;
    }
  }

  const ratio = before.day === after.day
    ? 1
    : (ageDays - before.day) / (after.day - before.day);

  const min = before.min + (after.min - before.min) * ratio;
  const max = before.max + (after.max - before.max) * ratio;

  return {
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    ideal: Math.round(((min + max) / 2) * 10) / 10,
  };
}

/**
 * Calcular consumo esperado de agua (litros) por edad y cantidad de aves
 */
export function getExpectedWaterConsumption(ageDays: number, birdCount: number): number {
  // ml por ave por día (curva generalizada)
  const mlCurve = [
    { day: 0, ml: 30 }, { day: 7, ml: 45 }, { day: 14, ml: 80 },
    { day: 21, ml: 130 }, { day: 28, ml: 195 }, { day: 35, ml: 265 },
    { day: 42, ml: 320 },
  ];

  let before = mlCurve[0];
  let after = mlCurve[mlCurve.length - 1];

  for (let i = 0; i < mlCurve.length - 1; i++) {
    if (ageDays >= mlCurve[i].day && ageDays <= mlCurve[i + 1].day) {
      before = mlCurve[i];
      after = mlCurve[i + 1];
      break;
    }
  }

  const ratio = before.day === after.day
    ? 1
    : (ageDays - before.day) / (after.day - before.day);

  const mlPerBird = before.ml + (after.ml - before.ml) * ratio;
  return Math.round((mlPerBird * birdCount) / 1000 * 10) / 10; // litros
}
