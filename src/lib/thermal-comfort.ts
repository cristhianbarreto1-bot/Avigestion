// ============================================================
// AVIGESTION - Motor de Confort Térmico
// Temperatura Mágica (T+HR, sin viento) y
// Temperatura Efectiva / Sensación Térmica (T+HR+velocidad aire)
// Fuentes: Jim Donald Auburn, Cobb Guide, Fairchild UGA, aviNews
// ============================================================

// ── TIPOS ────────────────────────────────────────────────────

export type ThermalStatus =
  | 'FRIO_CRITICO'
  | 'FRIO'
  | 'FRESCO'
  | 'CONFORT'
  | 'CALIDO'
  | 'CALOR'
  | 'ESTRES_TERMICO'

export interface MagicTempStandard {
  ageDayFrom:      number
  ageDayTo:        number
  tempIdeal:       number
  tempMin:         number
  tempMax:         number
  hrIdeal:         number
  hrMin:           number
  hrMax:           number
  magicSumIdeal:   number
  magicSumMin:     number
  magicSumMax:     number
  floorTempIdeal:  number
  notes:           string
}

export interface ThermalResult {
  // Temperatura Mágica (sin viento)
  magicSum:          number      // T + HR
  magicSumIdeal:     number      // objetivo según edad
  magicSumStatus:    ThermalStatus
  magicDeviation:    number      // cuánto se aleja del ideal

  // Corrección por humedad
  hrCorrection:      number      // °C a sumar por HR

  // Wind Chill (con ventilación)
  windChill:         number      // °C a restar por velocidad
  windChillStage:    string      // 'Sin ventilación' | 'Túnel baja' | etc.

  // Temperatura Efectiva final
  effectiveTemp:     number      // lo que el ave realmente siente
  effectiveTempStatus: ThermalStatus
  effectiveTempLabel:  string

  // Diagnóstico
  recommendation:    string
  isUrgent:          boolean

  // Contexto
  tempAmbient:       number
  hrPct:             number
  airVelocityMs:     number
  ageDays:           number
}

// ── TABLAS DE DATOS ──────────────────────────────────────────

export const MAGIC_TEMP_STANDARDS: MagicTempStandard[] = [
  {
    ageDayFrom: 0,  ageDayTo: 3,
    tempIdeal: 33.0, tempMin: 32.0, tempMax: 35.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 93, magicSumMin: 85, magicSumMax: 100,
    floorTempIdeal: 32.0,
    notes: 'Sin termorregulación. T cama ≥ 32°C crítica. Con HR < 50% pierde hasta 10g de humedad en 24hs.',
  },
  {
    ageDayFrom: 4,  ageDayTo: 7,
    tempIdeal: 32.0, tempMin: 31.0, tempMax: 34.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 92, magicSumMin: 85, magicSumMax: 99,
    floorTempIdeal: 31.0,
    notes: 'Temperatura corporal alcanza 41°C al día 5. Observar distribución uniforme.',
  },
  {
    ageDayFrom: 8,  ageDayTo: 14,
    tempIdeal: 30.0, tempMin: 28.0, tempMax: 32.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 90, magicSumMin: 83, magicSumMax: 97,
    floorTempIdeal: 28.0,
    notes: 'Plumaje emergente. Reducir 0.5°C/día. Evitar corrientes directas.',
  },
  {
    ageDayFrom: 15, ageDayTo: 21,
    tempIdeal: 27.0, tempMin: 25.0, tempMax: 29.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 87, magicSumMin: 80, magicSumMax: 94,
    floorTempIdeal: 25.0,
    notes: 'Plumaje en desarrollo. Inicio ventilación transición si T > 24°C.',
  },
  {
    ageDayFrom: 22, ageDayTo: 28,
    tempIdeal: 24.0, tempMin: 22.0, tempMax: 26.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 84, magicSumMin: 77, magicSumMax: 91,
    floorTempIdeal: 22.0,
    notes: 'Plumaje casi completo. Temperatura efectiva más relevante que T mágica.',
  },
  {
    ageDayFrom: 29, ageDayTo: 35,
    tempIdeal: 22.0, tempMin: 20.0, tempMax: 24.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 82, magicSumMin: 75, magicSumMax: 89,
    floorTempIdeal: 20.0,
    notes: 'Alta producción de calor metabólico. Ventilación túnel esencial en verano.',
  },
  {
    ageDayFrom: 36, ageDayTo: 56,
    tempIdeal: 20.0, tempMin: 18.0, tempMax: 22.0,
    hrIdeal: 60, hrMin: 50, hrMax: 70,
    magicSumIdeal: 80, magicSumMin: 73, magicSumMax: 87,
    floorTempIdeal: 18.0,
    notes: 'Máxima masa corporal. T efectiva objetivo: ≤ 28°C. Túnel a 2.0-3.0 m/s.',
  },
]

// Tabla de reducción por wind chill (°C) según velocidad y temperatura base
// Fuente: Jim Donald Auburn + Cobb Management Guide 2019
export const WIND_CHILL_TABLE: {
  velocityMs: number
  stage: string
  reductions: Record<number, number>  // temp base → reducción °C
}[] = [
  { velocityMs: 0.0, stage: 'Sin ventilación',        reductions: { 25: 0,     28: 0,    30: 0,    32: 0,    35: 0    } },
  { velocityMs: 0.5, stage: 'Ventilación mínima',      reductions: { 25: -0.5,  28: -0.8, 30: -1.0, 32: -1.2, 35: -1.5 } },
  { velocityMs: 1.0, stage: 'Transición baja',         reductions: { 25: -1.0,  28: -1.5, 30: -2.0, 32: -2.5, 35: -3.0 } },
  { velocityMs: 1.5, stage: 'Transición media',        reductions: { 25: -1.5,  28: -2.5, 30: -3.0, 32: -3.5, 35: -4.5 } },
  { velocityMs: 2.0, stage: 'Túnel baja',              reductions: { 25: -2.0,  28: -3.5, 30: -4.5, 32: -5.0, 35: -6.0 } },
  { velocityMs: 2.5, stage: 'Túnel media',             reductions: { 25: -3.0,  28: -4.5, 30: -5.5, 32: -6.5, 35: -7.5 } },
  { velocityMs: 3.0, stage: 'Túnel alta',              reductions: { 25: -3.5,  28: -5.0, 30: -6.5, 32: -7.5, 35: -9.0 } },
  { velocityMs: 3.5, stage: 'Túnel alta-máxima',       reductions: { 25: -4.0,  28: -6.0, 30: -7.5, 32: -8.5, 35: -10.0} },
  { velocityMs: 4.0, stage: 'Ventilación máxima',      reductions: { 25: -4.5,  28: -6.5, 30: -8.0, 32: -9.5, 35: -11.0} },
]

// Corrección por humedad relativa (°C)
export const HUMIDITY_CORRECTIONS: {
  hrFrom: number; hrTo: number
  correction: number; label: string; isComfort: boolean
}[] = [
  { hrFrom: 0,  hrTo: 30,  correction: -3.0, label: 'Muy seca — peligrosa',      isComfort: false },
  { hrFrom: 31, hrTo: 45,  correction: -1.5, label: 'Seca — atención',            isComfort: false },
  { hrFrom: 46, hrTo: 55,  correction: -0.5, label: 'Ligeramente seca',           isComfort: false },
  { hrFrom: 56, hrTo: 70,  correction:  0.0, label: 'Zona de confort ✓',          isComfort: true  },
  { hrFrom: 71, hrTo: 80,  correction: +1.0, label: 'Húmeda — atención',          isComfort: false },
  { hrFrom: 81, hrTo: 90,  correction: +2.5, label: 'Muy húmeda — problemática',  isComfort: false },
  { hrFrom: 91, hrTo: 100, correction: +4.0, label: 'Saturada — crítica',         isComfort: false },
]

// ── FUNCIONES DE CÁLCULO ──────────────────────────────────────

export function getMagicStandard(ageDays: number): MagicTempStandard {
  return MAGIC_TEMP_STANDARDS.find(
    s => ageDays >= s.ageDayFrom && ageDays <= s.ageDayTo
  ) ?? MAGIC_TEMP_STANDARDS[MAGIC_TEMP_STANDARDS.length - 1]
}

export function getHumidityCorrection(hrPct: number): { correction: number; label: string; isComfort: boolean } {
  return HUMIDITY_CORRECTIONS.find(h => hrPct >= h.hrFrom && hrPct <= h.hrTo)
    ?? { correction: 0, label: 'Zona de confort', isComfort: true }
}

export function getWindChill(velocityMs: number, tempC: number): { reduction: number; stage: string } {
  // Interpolación: encontrar el punto más cercano
  const sorted = [...WIND_CHILL_TABLE].sort(
    (a, b) => Math.abs(a.velocityMs - velocityMs) - Math.abs(b.velocityMs - velocityMs)
  )
  const closest = sorted[0]

  // Buscar la reducción más apropiada según temperatura base
  const tempKeys = [25, 28, 30, 32, 35]
  const closestTempKey = tempKeys.reduce((prev, curr) =>
    Math.abs(curr - tempC) < Math.abs(prev - tempC) ? curr : prev
  )

  return {
    reduction: closest.reductions[closestTempKey] ?? 0,
    stage: closest.stage,
  }
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────

export function calculateThermalComfort(params: {
  tempC:         number
  hrPct:         number
  airVelocityMs: number
  ageDays:       number
}): ThermalResult {
  const { tempC, hrPct, airVelocityMs, ageDays } = params

  // 1. Obtener estándar para la edad
  const std = getMagicStandard(ageDays)

  // 2. Temperatura mágica (solo T+HR, sin viento)
  const magicSum = Math.round(tempC + hrPct)
  let magicStatus: ThermalStatus
  if      (magicSum < std.magicSumMin - 5)  magicStatus = 'FRIO_CRITICO'
  else if (magicSum < std.magicSumMin)       magicStatus = 'FRIO'
  else if (magicSum < std.magicSumIdeal - 3) magicStatus = 'FRESCO'
  else if (magicSum <= std.magicSumMax)      magicStatus = 'CONFORT'
  else if (magicSum <= std.magicSumMax + 5)  magicStatus = 'CALIDO'
  else if (magicSum <= std.magicSumMax + 10) magicStatus = 'CALOR'
  else                                        magicStatus = 'ESTRES_TERMICO'

  // 3. Corrección por humedad
  const hrData = getHumidityCorrection(hrPct)

  // 4. Wind chill
  const windChillData = getWindChill(airVelocityMs, tempC)

  // 5. Temperatura efectiva
  const effectiveTemp = Math.round((tempC + hrData.correction + windChillData.reduction) * 10) / 10

  let effectiveStatus: ThermalStatus
  if      (effectiveTemp < 18)                      effectiveStatus = 'FRIO_CRITICO'
  else if (effectiveTemp < 21)                      effectiveStatus = 'FRIO'
  else if (effectiveTemp < 24)                      effectiveStatus = 'FRESCO'
  else if (effectiveTemp >= 24 && effectiveTemp <= 28) effectiveStatus = 'CONFORT'
  else if (effectiveTemp <= 30)                     effectiveStatus = 'CALIDO'
  else if (effectiveTemp <= 33)                     effectiveStatus = 'CALOR'
  else                                               effectiveStatus = 'ESTRES_TERMICO'

  const effectiveTempLabel: Record<ThermalStatus, string> = {
    FRIO_CRITICO:   'Frío crítico ❄',
    FRIO:           'Frío',
    FRESCO:         'Fresco — aceptable',
    CONFORT:        'Zona de confort ✓',
    CALIDO:         'Cálido — atención',
    CALOR:          'Calor — estrés leve',
    ESTRES_TERMICO: 'Estrés térmico severo 🔴',
  }

  // 6. Recomendación
  const isUrgent = effectiveStatus === 'FRIO_CRITICO' || effectiveStatus === 'ESTRES_TERMICO'
  const recommendation = buildRecommendation({
    effectiveTemp, effectiveStatus, magicSum, std, airVelocityMs, hrPct, ageDays,
  })

  return {
    magicSum,
    magicSumIdeal:    std.magicSumIdeal,
    magicSumStatus:   magicStatus,
    magicDeviation:   magicSum - std.magicSumIdeal,
    hrCorrection:     hrData.correction,
    windChill:        windChillData.reduction,
    windChillStage:   windChillData.stage,
    effectiveTemp,
    effectiveTempStatus: effectiveStatus,
    effectiveTempLabel:  effectiveTempLabel[effectiveStatus],
    recommendation,
    isUrgent,
    tempAmbient:      tempC,
    hrPct,
    airVelocityMs,
    ageDays,
  }
}

function buildRecommendation(params: {
  effectiveTemp: number
  effectiveStatus: ThermalStatus
  magicSum: number
  std: MagicTempStandard
  airVelocityMs: number
  hrPct: number
  ageDays: number
}): string {
  const { effectiveTemp, effectiveStatus, magicSum, std, airVelocityMs, hrPct, ageDays } = params
  const isYoung = ageDays <= 21

  if (effectiveStatus === 'FRIO_CRITICO') {
    return isYoung
      ? `URGENTE: T efectiva ${effectiveTemp}°C es críicamente baja para pollitos de ${ageDays} días. Aumentar calefacción inmediatamente. T mágica = ${magicSum} (objetivo: ${std.magicSumIdeal}). Riesgo de hipotermia y alta mortalidad.`
      : `URGENTE: T efectiva ${effectiveTemp}°C es demasiado baja. Reducir velocidad de aire o aumentar temperatura de galpón.`
  }
  if (effectiveStatus === 'FRIO') {
    return isYoung
      ? `T mágica ${magicSum} (objetivo ${std.magicSumIdeal}): el pollito siente frío. Aumentar calefacción ${std.magicSumIdeal - magicSum} puntos (subir T o bajar HR).`
      : `T efectiva ${effectiveTemp}°C está por debajo del confort. Reducir velocidad de aire o aumentar temperatura.`
  }
  if (effectiveStatus === 'CONFORT') {
    return `Condiciones óptimas. T efectiva ${effectiveTemp}°C en zona de confort. ${isYoung ? `T mágica ${magicSum} (objetivo ${std.magicSumIdeal})` : `Ventilación: ${airVelocityMs} m/s`}. Mantener condiciones actuales.`
  }
  if (effectiveStatus === 'CALIDO') {
    const velNeeded = airVelocityMs < 1.5 ? 1.5 : airVelocityMs + 0.5
    return `T efectiva ${effectiveTemp}°C supera zona de confort. ${airVelocityMs < 0.5 ? 'Iniciar ventilación de transición' : `Aumentar velocidad de aire a ${velNeeded} m/s`}. ${hrPct > 70 ? 'HR elevada: aumentar ventilación para bajar humedad.' : ''}`
  }
  if (effectiveStatus === 'CALOR') {
    return `ATENCIÓN: T efectiva ${effectiveTemp}°C. Estrés térmico activo. Aumentar velocidad a ${Math.min(airVelocityMs + 1, 3)} m/s. ${hrPct > 65 ? 'Reducir HR con mayor ventilación.' : 'Considerar panel húmedo o nebulización.'} Monitorear consumo de agua.`
  }
  if (effectiveStatus === 'ESTRES_TERMICO') {
    return `CRÍTICO: T efectiva ${effectiveTemp}°C. Estrés severo. Activar todos los ventiladores al máximo (≥ 3 m/s). Panel húmedo obligatorio. Monitorear jadeo y mortalidad cada 30 minutos.`
  }
  return `T efectiva ${effectiveTemp}°C. Condiciones aceptables.`
}

// ── HELPERS PARA LA UI ────────────────────────────────────────

export const THERMAL_STATUS_COLORS: Record<ThermalStatus, { bg: string; text: string; border: string }> = {
  FRIO_CRITICO:   { bg: '#1e3a5f', text: '#93c5fd', border: '#3b82f6' },
  FRIO:           { bg: '#1e3a5f', text: '#bfdbfe', border: '#60a5fa' },
  FRESCO:         { bg: '#0f4c81', text: '#bae6fd', border: '#38bdf8' },
  CONFORT:        { bg: '#166534', text: '#86efac', border: '#22c55e' },
  CALIDO:         { bg: '#78350f', text: '#fde68a', border: '#f59e0b' },
  CALOR:          { bg: '#7c2d12', text: '#fdba74', border: '#f97316' },
  ESTRES_TERMICO: { bg: '#7f1d1d', text: '#fca5a5', border: '#ef4444' },
}

export function formatThermalStatusLabel(status: ThermalStatus): string {
  const labels: Record<ThermalStatus, string> = {
    FRIO_CRITICO:   '❄ Frío crítico',
    FRIO:           '🔵 Frío',
    FRESCO:         '🔷 Fresco',
    CONFORT:        '✅ Confort',
    CALIDO:         '🟡 Cálido',
    CALOR:          '🟠 Calor',
    ESTRES_TERMICO: '🔴 Estrés térmico',
  }
  return labels[status]
}

// Qué velocidad de aire se necesita para llevar la T efectiva al confort
export function getRequiredAirVelocity(tempC: number, hrPct: number): number | null {
  const hrData = getHumidityCorrection(hrPct)
  const tempWithHr = tempC + hrData.correction
  if (tempWithHr <= 28) return 0  // ya está en confort, no necesita viento
  const deficit = tempWithHr - 28  // cuánto hay que reducir
  // Buscar velocidad que logre esa reducción
  for (const row of WIND_CHILL_TABLE) {
    const tempKeys = [25, 28, 30, 32, 35]
    const closestKey = tempKeys.reduce((p, c) => Math.abs(c - tempC) < Math.abs(p - tempC) ? c : p)
    const reduction = Math.abs(row.reductions[closestKey] ?? 0)
    if (reduction >= deficit) return row.velocityMs
  }
  return 4.0  // máximo disponible
}
