// ============================================================
// AVIGESTION - /api/flocks
// GET  — lotes activos de la organización (con granja/galpón/edad)
// POST — registrar un lote nuevo en un galpón
// ============================================================

import { NextRequest } from 'next/server'
import {
  createSupabaseServerClient, getAuthContext, handleApiError,
  apiSuccess, parseBody, ApiError, auditLog,
} from '@/lib/utils/api'
import { CreateFlockSchema } from '@/lib/validators/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('v_active_flocks')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('farm_name')
      .order('house_name')
    if (error) throw error
    return apiSuccess(data ?? [])
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (ctx.role === 'viewer') throw new ApiError('Tu rol no permite crear lotes', 403)

    const body = await parseBody(request, CreateFlockSchema)
    const supabase = await createSupabaseServerClient()

    const { data: house } = await supabase
      .from('houses').select('id, name, number')
      .eq('id', body.house_id).eq('organization_id', ctx.orgId).is('deleted_at', null)
      .maybeSingle()
    if (!house) throw new ApiError('Galpón no encontrado', 404)

    const { data: busy } = await supabase
      .from('flocks').select('id, code')
      .eq('house_id', body.house_id).eq('status', 'active').is('deleted_at', null)
      .maybeSingle()
    if (busy) {
      throw new ApiError(`El ${house.name} ya tiene un lote activo (${busy.code ?? 'sin código'})`, 409)
    }

    const today = new Date().toISOString().slice(0, 10)
    if (body.entry_date > today) throw new ApiError('La fecha de ingreso no puede ser futura', 400)

    const code = body.code?.trim() ||
      `L-${body.entry_date.replace(/-/g, '')}-G${house.number ?? house.name.replace(/\D/g, '') ?? ''}`

    const { data: flock, error } = await supabase
      .from('flocks')
      .insert({
        ...body,
        code,
        organization_id: ctx.orgId,
        status: 'active',
        current_count: body.entry_count,
        mortality_total: 0,
      })
      .select('*')
      .single()
    if (error) throw error

    await auditLog({
      orgId: ctx.orgId, userId: ctx.userId, action: 'INSERT',
      table: 'flocks', recordId: flock.id, newData: flock,
    })

    return apiSuccess(flock, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
