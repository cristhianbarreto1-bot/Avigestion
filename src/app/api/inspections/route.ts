// ============================================================
// AVIGESTION - API: /api/inspections
// POST  — crear nueva inspección
// GET   — listar inspecciones con filtros
// ============================================================

import { NextRequest } from 'next/server'
import { createSupabaseServerClient, getAuthContext, handleApiError, apiSuccess, parseBody, getPagination, auditLog } from '@/lib/utils/api'
import { CreateInspectionSchema } from '@/lib/validators/schemas'
import { processInspection, calculateWeightStats } from '@/lib/scoring-engine'

// ── POST /api/inspections ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (ctx.role === 'viewer') {
      return apiSuccess(null, 403)
    }

    const body = await parseBody(request, CreateInspectionSchema)

    // Verificar que el lote pertenece a la org
    const supabase = await createSupabaseServerClient()
    const { data: flock, error: flockError } = await supabase
      .from('flocks')
      .select('id, house_id, organization_id, entry_count, current_count, entry_date, genetic, status')
      .eq('id', body.flock_id)
      .eq('organization_id', ctx.orgId)
      .single()

    if (flockError || !flock) {
      return apiSuccess({ error: 'Lote no encontrado o sin acceso' }, 404)
    }

    if (flock.status === 'closed') {
      return apiSuccess({ error: 'No se puede inspeccionar un lote cerrado' }, 400)
    }

    // Verificar que no haya otra inspección "draft" del mismo supervisor para este lote hoy
    const today = new Date().toISOString().split('T')[0]
    const { data: existingDraft } = await supabase
      .from('inspections')
      .select('id')
      .eq('flock_id', body.flock_id)
      .eq('supervisor_id', ctx.userId)
      .eq('status', 'draft')
      .gte('inspected_at', `${today}T00:00:00Z`)
      .maybeSingle()

    if (existingDraft) {
      // Devolver el borrador existente en vez de crear uno nuevo
      return apiSuccess({ inspection_id: existingDraft.id, resumed: true })
    }

    // Calcular edad del lote
    const entryDate = new Date(flock.entry_date)
    const ageDays = Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

    // Crear la inspección
    const { data: inspection, error: inspError } = await supabase
      .from('inspections')
      .insert({
        flock_id: body.flock_id,
        organization_id: ctx.orgId,
        supervisor_id: ctx.userId,
        flock_age_days: ageDays,
        inspected_at: body.inspected_at ?? new Date().toISOString(),
        status: 'draft',
        general_notes: body.general_notes,
        images: body.images ?? [],
      })
      .select()
      .single()

    if (inspError) throw inspError

    // Si vinieron secciones al crear, guardarlas ya
    const sectionPromises = []

    if (body.environmental) {
      sectionPromises.push(
        supabase.from('inspection_environmental').insert({
          inspection_id: inspection.id,
          ...body.environmental,
        })
      )
    }

    if (body.health) {
      sectionPromises.push(
        supabase.from('inspection_health').insert({
          inspection_id: inspection.id,
          ...body.health,
        })
      )
    }

    if (body.water) {
      sectionPromises.push(
        supabase.from('inspection_water').insert({
          inspection_id: inspection.id,
          ...body.water,
        })
      )
    }

    if (body.feeding) {
      sectionPromises.push(
        supabase.from('inspection_feeding').insert({
          inspection_id: inspection.id,
          ...body.feeding,
        })
      )
    }

    if (body.weights && body.weights.individual_weights) {
      const stats = calculateWeightStats(body.weights.individual_weights)
      sectionPromises.push(
        supabase.from('inspection_weights').insert({
          inspection_id: inspection.id,
          ...body.weights,
          sample_size: body.weights.individual_weights.length,
          avg_weight_g: stats.avg,
          min_weight_g: stats.min,
          max_weight_g: stats.max,
          stddev_g: stats.stddev,
          cv_pct: stats.cv,
          uniformity_pct: stats.uniformity,
        })
      )
    }

    await Promise.all(sectionPromises)

    await auditLog({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'INSERT',
      table: 'inspections',
      recordId: inspection.id,
      newData: inspection,
    })

    return apiSuccess({ inspection_id: inspection.id, resumed: false }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}

// ── GET /api/inspections ──────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    const { searchParams } = new URL(request.url)
    const { page, pageSize, from, to } = getPagination(searchParams)

    const flockId = searchParams.get('flock_id')
    const farmId = searchParams.get('farm_id')
    const supervisorId = searchParams.get('supervisor_id')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from('v_recent_inspections')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.orgId)

    if (flockId) query = query.eq('flock_id', flockId)
    if (status) query = query.eq('status', status)
    if (dateFrom) query = query.gte('inspected_at', dateFrom)
    if (dateTo) query = query.lte('inspected_at', dateTo)
    if (supervisorId) query = query.eq('supervisor_id', supervisorId)

    // Supervisores solo ven sus propias inspecciones
    if (ctx.role === 'supervisor') {
      query = query.eq('supervisor_id', ctx.userId)
    }

    const { data, count, error } = await query
      .order('inspected_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return apiSuccess({
      data: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
      has_more: (count ?? 0) > to + 1,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
