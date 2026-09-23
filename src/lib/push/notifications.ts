// ============================================================
// AVIGESTION - Push Notification Service
// Web Push API: suscripción, envío y gestión de notificaciones
// ============================================================
// Instalación requerida:
//   npm install web-push
//   npx web-push generate-vapid-keys
// Variables de entorno:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=BEl62i...
//   VAPID_PRIVATE_KEY=_Gl62i...
//   VAPID_SUBJECT=mailto:admin@avigestion.com
// ============================================================

// ── CLIENTE: suscribirse a push notifications ────────────────

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Push notifications no soportadas en este dispositivo')
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('[Push] Permiso denegado')
      return null
    }

    const reg = await navigator.serviceWorker.ready

    // Verificar si ya tiene suscripción activa
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) throw new Error('VAPID public key no configurada')

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })

    // Guardar en el servidor
    await savePushSubscription(subscription)

    return subscription
  } catch (error) {
    console.error('[Push] Error suscribiendo:', error)
    return null
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    await deletePushSubscription(sub.endpoint)
  }
}

// Guardar suscripción en el servidor
async function savePushSubscription(subscription: PushSubscription) {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
}

async function deletePushSubscription(endpoint: string) {
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

// Convertir VAPID key de base64 a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ── SERVIDOR: enviar notificaciones ──────────────────────────
// Este código va en el API Route o Edge Function

export interface PushPayload {
  title:    string
  body:     string
  severity: 'critical' | 'warning' | 'info'
  farm?:    string
  house?:   string
  url?:     string
}

// Enviar notificación a usuarios específicos de una org
// (llamar desde /api/inspections/[id]/complete después de generar alertas)
export async function sendPushToOrgUsers(
  orgId:        string,
  roles:        string[],   // qué roles reciben la notif
  payload:      PushPayload,
  supabaseAdmin: ReturnType<typeof import('@supabase/supabase-js').createClient>,
): Promise<void> {
  // Obtener suscripciones activas de los usuarios con el rol indicado
  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('subscription_data, user_id, profiles!inner(role)')
    .eq('organization_id', orgId)
    .in('profiles.role', roles)

  if (!subscriptions?.length) return

  // Importar web-push (solo server-side)
  const webpush = await import('web-push')
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  // Enviar a todos en paralelo
  type SubRow = { subscription_data: unknown; user_id: string }
  const sends = (subscriptions as unknown as SubRow[]).map(async sub => {
    try {
      await webpush.sendNotification(
        sub.subscription_data as import('web-push').PushSubscription,
        JSON.stringify(payload),
      )
    } catch (error: unknown) {
      // Suscripción expirada — limpiar de la DB
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const pushError = error as { statusCode: number }
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', sub.user_id)
        }
      }
    }
  })

  await Promise.allSettled(sends)
}
