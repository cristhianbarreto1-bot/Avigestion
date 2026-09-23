// ============================================================
// AVIGESTION - POST/DELETE /api/push/subscribe
// Guarda y elimina suscripciones de push notifications
// ============================================================

import { NextRequest } from 'next/server'
import { createSupabaseServerClient, getAuthContext, handleApiError, apiSuccess } from '@/lib/utils/api'

// Tabla adicional necesaria en Supabase (agregar a migrations):
// CREATE TABLE push_subscriptions (
//   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
//   organization_id UUID NOT NULL REFERENCES organizations(id),
//   subscription_data JSONB NOT NULL,
//   endpoint        TEXT NOT NULL,
//   device_info     JSONB,
//   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   UNIQUE(user_id, endpoint)
// );
// ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "users_manage_own_subs" ON push_subscriptions
//   FOR ALL USING (user_id = auth.uid());

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    const supabase = await createSupabaseServerClient()

    const body = await request.json()
    const { endpoint, keys, expirationTime } = body

    if (!endpoint || !keys) {
      return apiSuccess({ error: 'Suscripción inválida' }, 400)
    }

    // Upsert de la suscripción (por endpoint único por usuario)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id:           ctx.userId,
        organization_id:   ctx.orgId,
        subscription_data: body,
        endpoint,
        device_info: {
          userAgent: request.headers.get('user-agent'),
          subscribedAt: new Date().toISOString(),
        },
      }, { onConflict: 'user_id,endpoint' })

    if (error) throw error

    return apiSuccess({ subscribed: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    const supabase = await createSupabaseServerClient()
    const { endpoint } = await request.json()

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('endpoint', endpoint)

    return apiSuccess({ unsubscribed: true })
  } catch (error) {
    return handleApiError(error)
  }
}
