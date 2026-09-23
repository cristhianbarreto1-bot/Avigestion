// ============================================================
// AVIGESTION - API Utils
// Context de auth, manejo de errores, rate limiting
// ============================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Profile } from '@/types'

// ── TIPOS ────────────────────────────────────────────────────

export interface AuthContext {
  userId: string
  orgId: string
  role: string
  profile: Profile
}

export class ApiError extends Error {
  constructor(
    public message: string,
    public status: number = 400,
    public code?: string
  ) {
    super(message)
  }
}

// ── SUPABASE SERVER CLIENT ───────────────────────────────────

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// ── OBTENER CONTEXTO DE AUTH ─────────────────────────────────

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new ApiError('No autenticado', 401, 'UNAUTHORIZED')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new ApiError('Perfil no encontrado', 404, 'PROFILE_NOT_FOUND')
  }

  if (!profile.organization_id) {
    throw new ApiError('Sin organización asignada', 403, 'NO_ORGANIZATION')
  }

  if (!profile.is_active) {
    throw new ApiError('Cuenta desactivada', 403, 'ACCOUNT_DISABLED')
  }

  return {
    userId: user.id,
    orgId: profile.organization_id,
    role: profile.role,
    profile,
  }
}

// ── VERIFICAR ROL ────────────────────────────────────────────

export function requireRole(
  ctx: AuthContext,
  roles: string[]
): void {
  if (!roles.includes(ctx.role)) {
    throw new ApiError(
      `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      403,
      'FORBIDDEN'
    )
  }
}

// ── VERIFICAR LÍMITES DE SUSCRIPCIÓN ────────────────────────

export async function checkSubscriptionLimit(
  orgId: string,
  resource: 'farms' | 'houses' | 'users'
): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, max_farms, max_houses, max_users, trial_ends_at')
    .eq('organization_id', orgId)
    .single()

  if (!sub) return // Sin suscripción = trial por defecto

  // Verificar si el trial expiró
  if (sub.status === 'trial' && sub.trial_ends_at) {
    const trialEnd = new Date(sub.trial_ends_at)
    if (trialEnd < new Date()) {
      throw new ApiError(
        'El período de prueba ha vencido. Por favor suscribite para continuar.',
        402,
        'TRIAL_EXPIRED'
      )
    }
  }

  if (['cancelled', 'past_due'].includes(sub.status)) {
    throw new ApiError(
      'Suscripción inactiva. Por favor actualizá tu plan.',
      402,
      'SUBSCRIPTION_INACTIVE'
    )
  }

  // Contar recursos actuales
  const countMap = {
    farms: { table: 'farms', column: 'organization_id', limit: sub.max_farms },
    houses: { table: 'houses', column: 'organization_id', limit: sub.max_houses },
    users: { table: 'profiles', column: 'organization_id', limit: sub.max_users },
  }

  const { table, column, limit } = countMap[resource]
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, orgId)
    .is('deleted_at', null)

  if ((count ?? 0) >= limit) {
    throw new ApiError(
      `Límite alcanzado: tu plan permite máximo ${limit} ${resource}. Actualizá tu plan para continuar.`,
      402,
      'LIMIT_REACHED'
    )
  }
}

// ── MANEJO DE ERRORES ────────────────────────────────────────

export function handleApiError(error: unknown): NextResponse {
  console.error('[API Error]', error)

  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    )
  }

  // Errores de Supabase/PostgreSQL
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; message: string; details?: string }

    if (pgError.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un registro con esos datos', code: 'DUPLICATE' },
        { status: 409 }
      )
    }
    if (pgError.code === '23503') {
      return NextResponse.json(
        { error: 'Referencia inválida', code: 'FOREIGN_KEY_VIOLATION' },
        { status: 400 }
      )
    }
    if (pgError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Registro no encontrado', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }
  }

  return NextResponse.json(
    { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}

// ── RESPUESTA EXITOSA ────────────────────────────────────────

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null }, { status })
}

// ── PARSEAR Y VALIDAR BODY ───────────────────────────────────

export async function parseBody<T>(
  request: Request,
  schema: { parseAsync: (data: unknown) => Promise<T> }
): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('Body inválido: se esperaba JSON', 400, 'INVALID_JSON')
  }

  try {
    return await schema.parseAsync(body)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'errors' in error) {
      const zodError = error as { errors: Array<{ path: string[]; message: string }> }
      const messages = zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      throw new ApiError(`Validación fallida: ${messages}`, 422, 'VALIDATION_ERROR')
    }
    throw new ApiError('Datos inválidos', 422, 'VALIDATION_ERROR')
  }
}

// ── PAGINACIÓN ───────────────────────────────────────────────

export function getPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') ?? '20')))
  return { page, pageSize, from: (page - 1) * pageSize, to: (page - 1) * pageSize + pageSize - 1 }
}

// ── LOG DE AUDITORÍA ─────────────────────────────────────────

export async function auditLog(params: {
  orgId: string
  userId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  recordId?: string
  oldData?: unknown
  newData?: unknown
}): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient()
    await supabase.from('audit_log').insert({
      organization_id: params.orgId,
      user_id: params.userId,
      action: params.action,
      table_name: params.table,
      record_id: params.recordId,
      old_data: params.oldData ? JSON.stringify(params.oldData) : null,
      new_data: params.newData ? JSON.stringify(params.newData) : null,
    })
  } catch (e) {
    // No fallar si el audit log falla
    console.error('[Audit Log Error]', e)
  }
}
