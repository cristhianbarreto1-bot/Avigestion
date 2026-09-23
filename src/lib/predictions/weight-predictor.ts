// ============================================================
// AVIGESTION - Motor de Predicción de Pesos
// Proyecta el peso al día 42 usando regresión lineal sobre
// los pesajes reales del lote actual
// ============================================================

import type { Flock, FlockGenetic } from '@/types'
import { MAGIC_TEMP_STANDARDS } from '../thermal-comfort'

// ── TIPOS ────────────────────────────────────────────────────

export interface WeightDataPoint {
  ageDays:  number
  weightG:  number
  date:     string
}

export interface WeightPrediction {
  // Datos de entrada
  flockId:         string
  genetic:         FlockGenetic
  targetAgeDays:   number   // típicamente 42
  currentAgeDays:  number
  dataPoints:      WeightDataPoint[]

  // Curva estándar para comparación
  standardAtCurrent: number
  standardAtTarget:  number

  // Proyección
  projectedWeightG:  number
  projectedDate:     string
  deviationFromStd:  number    // % sobre/bajo el estándar al día target
  deviationPct:      number    // % sobre/bajo estándar actual

  // Tendencia
  dailyGainG:        number    // ganancia diaria media (g/día)
  trend:             'on_track' | 'below' | 'critical' | 'above'
  trendLabel:        string

  // Confianza de la proyección
  r2:                number     // coeficiente de determinación (0-1)
  confidence:        'high' | 'medium' | 'low'
  confidenceLabel:   string

  // Alertas predictivas
  alerts:            PredictionAlert[]
  recommendation:    string
}

export interface PredictionAlert {
  severity:    'info' | 'warning' | 'critical'
  title:       string
  description: string
}

// ── ESTÁNDARES GENÉTICOS (simplificados para el predictor) ───

const GENETIC_STANDARDS: Record<FlockGenetic, Record<number, number>> = {
  cobb_500: {
    0: 42, 1: 57, 3: 100, 7: 186, 10: 290, 14: 471, 17: 660,
    21: 930, 24: 1190, 28: 1520, 31: 1810, 35: 2250, 38: 2580, 42: 2950,
  },
  ross_308: {
    0: 40, 1: 54, 3: 98, 7: 180, 10: 280, 14: 460, 17: 650,
    21: 910, 24: 1160, 28: 1490, 31: 1780, 35: 2200, 38: 2520, 42: 2900,
  },
  ross_708: {
    0: 40, 1: 55, 3: 99, 7: 183, 10: 285, 14: 466, 17: 655,
    21: 920, 24: 1175, 28: 1505, 31: 1795, 35: 2225, 38: 2550, 42: 2925,
  },
  hubbard: {
    0: 41, 1: 56, 3: 99, 7: 184, 10: 287, 14: 465, 17: 652,
    21: 915, 24: 1172, 28: 1498, 31: 1788, 35: 2220, 38: 2555, 42: 2920,
  },
  other: {
    0: 41, 7: 182, 14: 463, 21: 920, 28: 1500, 35: 2230, 42: 2930,
  },
}

// ── INTERPOLACIÓN DE ESTÁNDAR ─────────────────────────────────

function getStandardWeight(genetic: FlockGenetic, ageDays: number): number {
  const table = GENETIC_STANDARDS[genetic] ?? GENETIC_STANDARDS.other
  const days   = Object.keys(table).map(Number).sort((a, b) => a - b)

  if (ageDays <= days[0]) return table[days[0]]
  if (ageDays >= days[days.length - 1]) return table[days[days.length - 1]]

  for (let i = 0; i < days.length - 1; i++) {
    if (ageDays >= days[i] && ageDays <= days[i + 1]) {
      const ratio = (ageDays - days[i]) / (days[i + 1] - days[i])
      return Math.round(table[days[i]] + (table[days[i + 1]] - table[days[i]]) * ratio)
    }
  }
  return table[days[days.length - 1]]
}

// ── REGRESIÓN LINEAL ─────────────────────────────────────────

interface LinearReg {
  slope:     number
  intercept: number
  r2:        number
}

function linearRegression(points: { x: number; y: number }[]): LinearReg {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 }

  const sumX  = points.reduce((s, p) => s + p.x, 0)
  const sumY  = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const meanY = sumY / n

  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // R² — qué tan bien se ajusta la línea a los datos
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0)
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0)
  const r2    = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

  return { slope, intercept, r2 }
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────

export function predictFlockWeight(params: {
  flockId:       string
  genetic:       FlockGenetic
  entryDate:     string
  targetAgeDays: number
  dataPoints:    WeightDataPoint[]
}): WeightPrediction | null {
  const { flockId, genetic, entryDate, targetAgeDays, dataPoints } = params

  if (dataPoints.length < 2) return null  // necesitamos al menos 2 puntos

  const today          = new Date()
  const entry          = new Date(entryDate)
  const currentAgeDays = Math.floor((today.getTime() - entry.getTime()) / 86400000)

  // Ordenar por edad
  const sorted = [...dataPoints].sort((a, b) => a.ageDays - b.ageDays)

  // Regresión lineal sobre los datos reales
  const reg = linearRegression(sorted.map(p => ({ x: p.ageDays, y: p.weightG })))

  // Proyectar al día objetivo
  const projectedWeightG = Math.round(reg.slope * targetAgeDays + reg.intercept)

  // Ganancia diaria media
  const dailyGainG = Math.round(reg.slope)

  // Fecha de cierre proyectada
  const daysToTarget = Math.max(0, targetAgeDays - currentAgeDays)
  const projectedDate = new Date(today.getTime() + daysToTarget * 86400000)
    .toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Comparar con estándar
  const standardAtCurrent = getStandardWeight(genetic, currentAgeDays)
  const standardAtTarget  = getStandardWeight(genetic, targetAgeDays)
  const deviationPct      = Math.round(((sorted[sorted.length-1]?.weightG ?? 0) - standardAtCurrent) / standardAtCurrent * 1000) / 10
  const deviationFromStd  = Math.round((projectedWeightG - standardAtTarget) / standardAtTarget * 1000) / 10

  // Tendencia
  let trend: WeightPrediction['trend']
  let trendLabel: string
  if (deviationFromStd >= 2)       { trend = 'above';    trendLabel = 'Por encima del estándar ✓' }
  else if (deviationFromStd >= -5) { trend = 'on_track'; trendLabel = 'En línea con el estándar' }
  else if (deviationFromStd >= -10){ trend = 'below';    trendLabel = 'Por debajo del estándar' }
  else                              { trend = 'critical'; trendLabel = 'Desvío crítico — intervención necesaria' }

  // Confianza
  let confidence: WeightPrediction['confidence']
  let confidenceLabel: string
  if (reg.r2 >= 0.95 && sorted.length >= 4)      { confidence = 'high';   confidenceLabel = `Alta (R²: ${(reg.r2*100).toFixed(0)}%)` }
  else if (reg.r2 >= 0.80 && sorted.length >= 3) { confidence = 'medium'; confidenceLabel = `Media (R²: ${(reg.r2*100).toFixed(0)}%)` }
  else                                             { confidence = 'low';    confidenceLabel = `Baja — agregar más pesajes (R²: ${(reg.r2*100).toFixed(0)}%)` }

  // Alertas predictivas
  const alerts: PredictionAlert[] = []

  if (trend === 'critical') {
    alerts.push({
      severity: 'critical',
      title:    `Proyección ${Math.abs(deviationFromStd).toFixed(1)}% por debajo del estándar al día ${targetAgeDays}`,
      description: `Con la tendencia actual el lote llegará a ${projectedWeightG}g vs ${standardAtTarget}g esperados. Pérdida estimada: ${(standardAtTarget - projectedWeightG).toLocaleString()}g por ave.`,
    })
  } else if (trend === 'below') {
    alerts.push({
      severity: 'warning',
      title:    `Peso proyectado ${Math.abs(deviationFromStd).toFixed(1)}% bajo el estándar`,
      description: `Proyección al día ${targetAgeDays}: ${projectedWeightG}g vs ${standardAtTarget}g estándar. Revisar calidad de alimento y densidad.`,
    })
  }

  if (dailyGainG < 50 && currentAgeDays > 14) {
    alerts.push({
      severity: 'warning',
      title:    `Ganancia diaria baja: ${dailyGainG}g/día`,
      description: 'La ganancia diaria está por debajo del promedio esperado. Verificar FCR y programa de alimentación.',
    })
  }

  // Recomendación
  let recommendation: string
  if (trend === 'critical') {
    recommendation = `INTERVENCIÓN URGENTE: Revisar inmediatamente calidad del alimento, densidad del lote, temperatura efectiva y estado sanitario. Con la tendencia actual el lote perderá ${(standardAtTarget - projectedWeightG).toLocaleString()}g por ave al cierre.`
  } else if (trend === 'below') {
    recommendation = `El lote lleva ${Math.abs(deviationPct).toFixed(1)}% por debajo del estándar. Revisar distribución del alimento, CVr de la uniformidad y condiciones ambientales. Aumentar densidad calórica del alimento si FCR > 1.8.`
  } else if (trend === 'on_track') {
    recommendation = `Lote en línea con el estándar genético. Proyección al día ${targetAgeDays}: ${projectedWeightG.toLocaleString()}g. Mantener condiciones actuales.`
  } else {
    recommendation = `El lote va por encima del estándar. Verificar que el peso no genere problemas locomotores o de bienestar en los últimos días. Considerar cierre anticipado si el mercado lo requiere.`
  }

  return {
    flockId,
    genetic,
    targetAgeDays,
    currentAgeDays,
    dataPoints: sorted,
    standardAtCurrent,
    standardAtTarget,
    projectedWeightG,
    projectedDate,
    deviationFromStd,
    deviationPct,
    dailyGainG,
    trend,
    trendLabel,
    r2:  Math.round(reg.r2 * 1000) / 1000,
    confidence,
    confidenceLabel,
    alerts,
    recommendation,
  }
}

// ── CURVA COMPLETA DE PROYECCIÓN (para gráfico) ───────────────

export interface ProjectionPoint {
  ageDays:   number
  standard:  number
  actual:    number | null   // null = puntos futuros
  projected: number | null   // null = puntos pasados
}

export function buildProjectionCurve(
  prediction: WeightPrediction,
  genetic:    FlockGenetic,
): ProjectionPoint[] {
  const days = [0, 3, 7, 10, 14, 17, 21, 24, 28, 31, 35, 38, 42]
  const reg  = linearRegression(
    prediction.dataPoints.map(p => ({ x: p.ageDays, y: p.weightG }))
  )

  return days
    .filter(d => d <= prediction.targetAgeDays)
    .map(d => {
      const realPoint = prediction.dataPoints.find(p => Math.abs(p.ageDays - d) <= 1)
      const isPast    = d <= prediction.currentAgeDays

      return {
        ageDays:   d,
        standard:  getStandardWeight(genetic, d),
        actual:    realPoint?.weightG ?? null,
        projected: isPast ? null : Math.round(reg.slope * d + reg.intercept),
      }
    })
}
