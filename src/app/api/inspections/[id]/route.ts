// ============================================================
// AVIGESTION - API: /api/inspections/[id]
// GET    — inspección completa con todas las secciones
// PUT    — actualizar sección (mientras está en draft)
// DELETE — eliminar borrador
// POST   — /[id]/complete — finalizar y calcular score
// ============================================================

import { NextRequest } from 'next/server'
import {
  createSupabaseServerClient,
  getAuthContext,
  handleApiError,
  apiSuccess,
  parseBody,
  ApiError,
  auditLog,
} from '@/lib/utils/api'
import { UpdateInspectionSectionSchema } from '@/lib/validators/schemas'
import { processInspection, calculateWeightStats, getUniformityCauses } from '@/lib/scoring-engine'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/inspections/[id] ─────────────────────────────────
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('inspections')
      .select(`
        *,
        inspection_environmental (*),
        inspection_water (*),
        inspection_feeding (*),
        inspection_health (*),
        inspection_weights (*),
        profiles!supervisor_id (id, full_name, avatar_url),
        flocks (
          id, code, genetic, entry_date, entry_count, current_count,
          houses (
            id, name,
            farms (id, name)
          )
        )
      `)
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .single()

    if (error || !data) {
      throw new ApiError('Inspección no encontrada', 404)
    }

    // Supervisores solo ven las suyas
    if (ctx.role === 'supervisor' && data.supervisor_id !== ctx.userId) {
      throw new ApiError('Sin acceso a esta inspección', 403)
    }

    return apiSuccess(data)
  } catch (error) {
    return handleApiError(error)
  }
}

// ── PUT /api/inspections/[id] — guardar sección ───────────────
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    // Verificar que la inspección existe, es draft, y pertenece a la org
    const { data: inspection, error: fetchError } = await supabase
      .from('inspections')
      .select('id, status, supervisor_id, flock_id, organization_id, flock_age_days')
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .single()

    if (fetchError || !inspection) throw new ApiError('Inspección no encontrada', 404)

    if (inspection.status === 'completed' && !['owner', 'admin'].includes(ctx.role)) {
      throw new ApiError('No se puede editar una inspección completada', 400)
    }

    if (inspection.supervisor_id !== ctx.userId && !['owner', 'admin', 'veterinarian'].includes(ctx.role)) {
      throw new ApiError('Solo el supervisor asignado puede editar esta inspección', 403)
    }

    const body = await parseBody(request, UpdateInspectionSectionSchema)
    const { section, data: sectionData } = body

    // Tablas de secciones
    const sectionTable = {
      environmental: 'inspection_environmental',
      water: 'inspection_water',
      feeding: 'inspection_feeding',
      health: 'inspection_health',
      weights: 'inspection_weights',
    } as const

    let processedData: Record<string, unknown> = { ...sectionData }

    // Para pesos: calcular estadísticas desde los valores individuales
    if (section === 'weights' && 'individual_weights' in sectionData && sectionData.individual_weights) {
      const stats = calculateWeightStats(sectionData.individual_weights as number[])

      // Buscar peso estándar
      const { data: standard } = await supabase
        .from('flocks')
        .select('genetic')
        .eq('id', inspection.flock_id)
        .single()

      let weightVsStandard = null
      if (standard) {
        const { data: stdData } = await supabase
          .from('genetic_standards')
          .select('weight_g')
          .eq('genetic', standard.genetic)
          .lte('age_days', inspection.flock_age_days)
          .order('age_days', { ascending: false })
          .limit(1)
          .single()

        if (stdData) {
          weightVsStandard = ((stats.avg - stdData.weight_g) / stdData.weight_g) * 100
        }
      }

      processedData = {
        ...sectionData,
        sample_size: (sectionData.individual_weights as number[]).length,
        avg_weight_g: stats.avg,
        min_weight_g: stats.min,
        max_weight_g: stats.max,
        stddev_g: stats.stddev,
        cv_pct: stats.cv,
        uniformity_pct: stats.uniformity,
        weight_vs_standard: weightVsStandard ? Math.round(weightVsStandard * 10) / 10 : null,
        uniformity_causes: stats.cv > 8 ? getUniformityCauses(stats.cv, (sectionData.individual_weights as number[]).length) : [],
      }
    }

    // Upsert de la sección
    const { error: upsertError } = await supabase
      .from(sectionTable[section])
      .upsert(
        { inspection_id: id, ...processedData },
        { onConflict: 'inspection_id' }
      )

    if (upsertError) throw upsertError

    // Actualizar mortalidad en la inspección si es sanidad
    if (section === 'health' && 'dead_count' in sectionData) {
      const { data: flock } = await supabase
        .from('flocks')
        .select('current_count')
        .eq('id', inspection.flock_id)
        .single()

      const totalBirds = flock?.current_count ?? 1
      const deadCount = (sectionData as { dead_count?: number }).dead_count ?? 0
      const culledCount = (sectionData as { culled_count?: number }).culled_count ?? 0
      const mortalityPct = ((deadCount + culledCount) / totalBirds) * 100

      await supabase
        .from('inspections')
        .update({
          mortality_count: deadCount + culledCount,
          mortality_pct: Math.round(mortalityPct * 1000) / 1000,
        })
        .eq('id', id)
    }

    return apiSuccess({ section, saved: true })
  } catch (error) {
    return handleApiError(error)
  }
}

// ── DELETE /api/inspections/[id] — eliminar borrador ─────────
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    const { data: inspection } = await supabase
      .from('inspections')
      .select('id, status, supervisor_id')
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .single()

    if (!inspection) throw new ApiError('Inspección no encontrada', 404)
    if (inspection.status !== 'draft') throw new ApiError('Solo se pueden eliminar borradores', 400)

    if (inspection.supervisor_id !== ctx.userId && !['owner', 'admin'].includes(ctx.role)) {
      throw new ApiError('Sin permisos para eliminar esta inspección', 403)
    }

    const { error } = await supabase.from('inspections').delete().eq('id', id)
    if (error) throw error

    return apiSuccess({ deleted: true })
  } catch (error) {
    return handleApiError(error)
  }
}
