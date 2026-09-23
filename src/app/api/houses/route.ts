// GET /api/houses — galpones de la organización, indicando si están ocupados
import {
  createSupabaseServerClient, getAuthContext, handleApiError, apiSuccess,
} from '@/lib/utils/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    const supabase = await createSupabaseServerClient()
    const [houses, active] = await Promise.all([
      supabase.from('houses')
        .select('id, name, number, farm_id, farms(name)')
        .eq('organization_id', ctx.orgId).is('deleted_at', null)
        .order('number'),
      supabase.from('flocks')
        .select('house_id').eq('organization_id', ctx.orgId)
        .eq('status', 'active').is('deleted_at', null),
    ])
    if (houses.error) throw houses.error
    const busy = new Set((active.data ?? []).map(f => f.house_id))
    return apiSuccess((houses.data ?? []).map(h => ({
      id: h.id,
      name: h.name,
      farm_name: (h.farms as unknown as { name: string } | null)?.name ?? '',
      has_active_flock: busy.has(h.id),
    })))
  } catch (error) {
    return handleApiError(error)
  }
}
