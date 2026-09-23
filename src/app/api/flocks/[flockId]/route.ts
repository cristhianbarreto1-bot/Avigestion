// GET /api/flocks/[flockId] — un lote de la organización
import {
  createSupabaseServerClient, getAuthContext, handleApiError, apiSuccess, ApiError,
} from '@/lib/utils/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { flockId: string } }) {
  try {
    const ctx = await getAuthContext()
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('flocks')
      .select('*, houses(name, farms(name))')
      .eq('id', params.flockId)
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError('Lote no encontrado', 404)
    return apiSuccess(data)
  } catch (error) {
    return handleApiError(error)
  }
}
