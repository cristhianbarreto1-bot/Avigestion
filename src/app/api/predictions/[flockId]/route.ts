// ============================================================
// AVIGESTION - GET /api/predictions/[flockId]
// Devuelve la proyección de peso al día objetivo del lote
// ============================================================

import { NextRequest } from 'next/server'
import {
  createSupabaseServerClient,
  getAuthContext,
  handleApiError,
  apiSuccess,
  ApiError,
} from '@/lib/utils/api'
import { predictFlockWeight, buildProjectionCurve } from '@/lib/predictions/weight-predictor'
import type { WeightDataPoint } from '@/lib/predictions/weight-predictor'

type Params = { params: Promise<{ flockId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    const { flockId } = await params
    const supabase = await createSupabaseServerClient()

    // Cargar el lote
    const { data: flock } = await supabase
      .from('flocks')
      .select('id, genetic, entry_date, target_age_days, entry_count, current_count, status')
      .eq('id', flockId)
      .eq('organization_id', ctx.orgId)
      .single()

    if (!flock) throw new ApiError('Lote no encontrado', 404)

    // Cargar todos los pesajes reales del lote (de las inspecciones completadas)
    const { data: inspections } = await supabase
      .from('inspections')
      .select(`
        flock_age_days,
        inspected_at,
        weight_avg_g
      `)
      .eq('flock_id', flockId)
      .eq('status', 'completed')
      .not('weight_avg_g', 'is', null)
      .order('inspected_at', { ascending: true })

    // Construir puntos de datos
    const dataPoints: WeightDataPoint[] = (inspections ?? [])
      .filter(i => i.weight_avg_g != null)
      .map(i => ({
        ageDays: i.flock_age_days,
        weightG: Number(i.weight_avg_g),
        date:    i.inspected_at,
      }))
      // Eliminar duplicados por edad (quedar con el más reciente)
      .filter((p, idx, arr) =>
        idx === arr.findLastIndex(a => a.ageDays === p.ageDays)
      )

    if (dataPoints.length < 2) {
      return apiSuccess({
        available: false,
        reason:    'Se necesitan al menos 2 pesajes para generar una proyección.',
        dataPoints: dataPoints.length,
        required:  2,
      })
    }

    // Calcular predicción
    const prediction = predictFlockWeight({
      flockId,
      genetic:       flock.genetic,
      entryDate:     flock.entry_date,
      targetAgeDays: flock.target_age_days ?? 42,
      dataPoints,
    })

    if (!prediction) {
      return apiSuccess({ available: false, reason: 'No se pudo calcular la predicción.' })
    }

    // Construir curva para el gráfico
    const curve = buildProjectionCurve(prediction, flock.genetic)

    // Si hay alertas predictivas críticas, guardarlas
    for (const alert of prediction.alerts.filter(a => a.severity !== 'info')) {
      // Verificar si ya existe una alerta similar reciente (últimas 24hs)
      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('flock_id', flockId)
        .eq('category', 'weight_deviation')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())

      if ((count ?? 0) === 0) {
        await supabase.from('alerts').insert({
          organization_id:    ctx.orgId,
          flock_id:           flockId,
          severity:           alert.severity,
          status:             'open',
          category:           'weight_prediction',
          title:              alert.title,
          description:        alert.description,
          recommended_action: prediction.recommendation,
          trigger_value:      prediction.projectedWeightG,
          trigger_threshold:  prediction.standardAtTarget,
        })
      }
    }

    return apiSuccess({
      available:   true,
      prediction,
      curve,
      flock: {
        id:        flock.id,
        genetic:   flock.genetic,
        entry_date: flock.entry_date,
        target_age_days: flock.target_age_days ?? 42,
      },
    })

  } catch (error) {
    return handleApiError(error)
  }
}
