// ============================================================
// AVIGESTION - POST /api/auth/onboarding
// Crea organización + suscripción trial + primera granja y
// galpones, y asocia al usuario como owner. Usa service_role
// porque el usuario todavía no pertenece a ninguna organización.
// ============================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient, handleApiError, apiSuccess, parseBody, ApiError } from '@/lib/utils/api'

const TRIAL_DAYS = 30
const TRIAL_LIMITS = { max_farms: 1, max_houses: 3, max_users: 2 }

const Schema = z.object({
  org_name: z.string().trim().min(2).max(255),
  farm_name: z.string().trim().min(2).max(255),
  farm_city: z.string().trim().max(100).optional(),
  farm_province: z.string().trim().max(100).optional(),
  houses_count: z.number().int().min(1).max(TRIAL_LIMITS.max_houses),
})

function slugify(text: string) {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'org'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ApiError('No autenticado', 401)

    const body = await parseBody(request, Schema)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // El perfil lo crea el trigger al registrarse; por las dudas se asegura acá
    const { data: profile } = await admin
      .from('profiles').select('id, organization_id').eq('id', user.id).maybeSingle()
    if (profile?.organization_id) {
      throw new ApiError('Tu usuario ya tiene una organización configurada', 409)
    }
    if (!profile) {
      const { error } = await admin.from('profiles').insert({
        id: user.id,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email?.split('@')[0],
        role: 'owner',
      })
      if (error) throw error
    }

    // 1. Organización
    const slug = `${slugify(body.org_name)}-${Math.random().toString(36).slice(2, 6)}`
    const { data: org, error: orgError } = await admin
      .from('organizations').insert({ name: body.org_name, slug }).select('id').single()
    if (orgError) throw orgError

    try {
      // 2. Suscripción de prueba
      const { error: subError } = await admin.from('subscriptions').insert({
        organization_id: org.id,
        plan: 'trial',
        status: 'trial',
        trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
        ...TRIAL_LIMITS,
      })
      if (subError) throw subError

      // 3. Granja y galpones
      const { data: farm, error: farmError } = await admin.from('farms').insert({
        organization_id: org.id,
        name: body.farm_name,
        city: body.farm_city || null,
        province: body.farm_province || null,
      }).select('id').single()
      if (farmError) throw farmError

      const houses = Array.from({ length: body.houses_count }, (_, i) => ({
        farm_id: farm.id,
        organization_id: org.id,
        name: `Galpón ${i + 1}`,
        number: i + 1,
      }))
      const { error: housesError } = await admin.from('houses').insert(houses)
      if (housesError) throw housesError

      // 4. Usuario → owner de la organización
      const { error: profileError } = await admin
        .from('profiles').update({ organization_id: org.id, role: 'owner' }).eq('id', user.id)
      if (profileError) throw profileError
    } catch (err) {
      // Deshacer lo creado para que pueda reintentar
      await admin.from('houses').delete().eq('organization_id', org.id)
      await admin.from('farms').delete().eq('organization_id', org.id)
      await admin.from('subscriptions').delete().eq('organization_id', org.id)
      await admin.from('organizations').delete().eq('id', org.id)
      throw err
    }

    return apiSuccess({ organization_id: org.id }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
