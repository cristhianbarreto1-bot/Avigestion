// ============================================================
// AVIGESTION - POST /api/inspections/[id]/complete
// Finaliza la inspección: calcula score, genera alertas, notifica
// ============================================================

import { NextRequest } from 'next/server'
import {
  createSupabaseServerClient,
  getAuthContext,
  handleApiError,
  apiSuccess,
  ApiError,
  auditLog,
} from '@/lib/utils/api'
import { processInspection } from '@/lib/scoring-engine'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    // Cargar inspección completa con todas las secciones
    const { data: inspection, error: fetchError } = await supabase
      .from('inspections')
      .select(`
        *,
        inspection_environmental (*),
        inspection_water (*),
        inspection_feeding (*),
        inspection_health (*),
        inspection_weights (*),
        flocks (id, genetic, current_count, entry_count)
      `)
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .single()

    if (fetchError || !inspection) throw new ApiError('Inspección no encontrada', 404)
    if (inspection.status === 'completed') throw new ApiError('La inspección ya fue completada', 400)

    if (inspection.supervisor_id !== ctx.userId && !['owner', 'admin'].includes(ctx.role)) {
      throw new ApiError('Sin permisos para completar esta inspección', 403)
    }

    const flock = inspection.flocks
    const totalBirds = flock?.current_count ?? flock?.entry_count ?? 1

    // ── Calcular score con el motor ──────────────────────────
    const scoreResult = processInspection({
      environmental: inspection.inspection_environmental ?? undefined,
      water: inspection.inspection_water ?? undefined,
      feeding: inspection.inspection_feeding ?? undefined,
      health: inspection.inspection_health ?? undefined,
      weights: inspection.inspection_weights ?? undefined,
      flock_age_days: inspection.flock_age_days,
      total_birds: totalBirds,
      genetic: flock?.genetic,
    })

    // ── Actualizar inspección como completada ────────────────
    const { error: updateError } = await supabase
      .from('inspections')
      .update({
        status: 'completed',
        total_score: scoreResult.total_score,
        score_label: scoreResult.score_label,
        // Sincronizar datos de peso desde la sección si existen
        weight_avg_g: inspection.inspection_weights?.avg_weight_g ?? null,
        weight_cv_pct: inspection.inspection_weights?.cv_pct ?? null,
        weight_uniformity_pct: inspection.inspection_weights?.uniformity_pct ?? null,
      })
      .eq('id', id)

    if (updateError) throw updateError

    // ── Guardar alertas generadas ────────────────────────────
    if (scoreResult.alerts.length > 0) {
      const alertsToInsert = scoreResult.alerts.map(alert => ({
        organization_id: ctx.orgId,
        flock_id: inspection.flock_id,
        inspection_id: id,
        severity: alert.severity,
        status: 'open',
        category: alert.category,
        title: alert.title,
        description: alert.description,
        recommended_action: alert.recommended_action,
        trigger_value: alert.trigger_value ?? null,
        trigger_threshold: alert.trigger_threshold ?? null,
      }))

      const { error: alertError } = await supabase
        .from('alerts')
        .insert(alertsToInsert)

      if (alertError) console.error('[Alerts Insert Error]', alertError)
    }

    // ── Actualizar mortalidad acumulada en el lote ───────────
    if (inspection.inspection_health) {
      const deadToday =
        (inspection.inspection_health.dead_count ?? 0) +
        (inspection.inspection_health.culled_count ?? 0)

      if (deadToday > 0) {
        const { data: currentFlock } = await supabase
          .from('flocks')
          .select('current_count, mortality_total, entry_count')
          .eq('id', inspection.flock_id)
          .single()

        if (currentFlock) {
          const newCount = Math.max(0, (currentFlock.current_count ?? currentFlock.entry_count) - deadToday)
          const newMortalityTotal = (currentFlock.mortality_total ?? 0) + deadToday
          const newMortalityPct = (newMortalityTotal / currentFlock.entry_count) * 100

          await supabase
            .from('flocks')
            .update({
              current_count: newCount,
              mortality_total: newMortalityTotal,
              mortality_pct: Math.round(newMortalityPct * 100) / 100,
              last_inspection_at: inspection.inspected_at,
            })
            .eq('id', inspection.flock_id)
        }
      }
    }

    await auditLog({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'UPDATE',
      table: 'inspections',
      recordId: id,
      newData: { status: 'completed', score: scoreResult.total_score },
    })

    // TODO Fase 4: enviar notificaciones push si hay alertas críticas

    return apiSuccess({
      inspection_id: id,
      score: scoreResult.total_score,
      score_label: scoreResult.score_label,
      section_scores: {
        environmental: scoreResult.environmental_score,
        water: scoreResult.water_score,
        feeding: scoreResult.feeding_score,
        health: scoreResult.health_score,
        weights: scoreResult.weights_score,
      },
      alerts_generated: scoreResult.alerts.length,
      critical_alerts: scoreResult.alerts.filter(a => a.severity === 'critical').length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
