// ============================================================
// AVIGESTION - Edge Function: alert-dispatcher
// Se dispara automáticamente cada vez que se inserta una alerta
// en la tabla alerts via Supabase Database Webhook
// Deploy: supabase functions deploy alert-dispatcher
// ============================================================
// Configurar en Supabase Dashboard:
//   Database → Webhooks → Create webhook
//   Table: alerts | Event: INSERT
//   URL: https://[PROJECT_REF].supabase.co/functions/v1/alert-dispatcher
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPub     = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPriv    = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT')!
const resendKey    = Deno.env.get('RESEND_API_KEY')!

const supabase = createClient(supabaseUrl, serviceKey)

// ── ROLES QUE RECIBEN CADA TIPO DE ALERTA ────────────────────

const ALERT_RECIPIENTS: Record<string, string[]> = {
  mortality:        ['owner', 'admin', 'veterinarian'],
  clinical_signs:   ['owner', 'admin', 'veterinarian'],
  temperature:      ['owner', 'admin', 'supervisor'],
  air_quality:      ['supervisor'],
  water_consumption:['supervisor', 'admin'],
  weight_uniformity:['supervisor', 'veterinarian'],
  weight_deviation: ['supervisor', 'admin'],
}

Deno.serve(async (req) => {
  // Solo aceptar POST desde Supabase
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const payload = await req.json()
    const alert = payload.record  // el registro insertado

    if (!alert || !alert.id) {
      return new Response('Invalid payload', { status: 400 })
    }

    // Solo despachar alertas críticas y warnings (no info)
    if (alert.severity === 'info') {
      return new Response(JSON.stringify({ skipped: true, reason: 'info_severity' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Cargar datos completos de la alerta con contexto
    const { data: fullAlert } = await supabase
      .from('alerts')
      .select(`
        *,
        flocks (code, houses (name, farms (name))),
        organizations (name, settings)
      `)
      .eq('id', alert.id)
      .single()

    if (!fullAlert) {
      return new Response('Alert not found', { status: 404 })
    }

    const flock    = fullAlert.flocks
    const farm     = flock?.houses?.farms
    const farmName = farm?.name ?? 'Granja desconocida'
    const houseName= flock?.houses?.name ?? 'Galpón'
    const flockCode= flock?.code ?? 'Lote sin código'

    // Determinar destinatarios según categoría
    const recipientRoles = ALERT_RECIPIENTS[fullAlert.category] ?? ['owner', 'admin']

    // Solo escalar al siguiente nivel si es crítico
    const finalRoles = fullAlert.severity === 'critical'
      ? [...new Set([...recipientRoles, 'owner', 'admin'])]
      : recipientRoles

    // Obtener usuarios con esos roles en la organización
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('organization_id', fullAlert.organization_id)
      .in('role', finalRoles)
      .eq('is_active', true)

    if (!users?.length) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const userIds = users.map(u => u.id)

    // ── 1. PUSH NOTIFICATIONS ────────────────────────────────
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('subscription_data, user_id')
      .in('user_id', userIds)

    const pushPayload = JSON.stringify({
      title:    `${fullAlert.severity === 'critical' ? '🔴' : '🟡'} ${fullAlert.title}`,
      body:     `${farmName} · ${houseName} · Lote ${flockCode}`,
      severity: fullAlert.severity,
      farm:     farmName,
      house:    houseName,
      url:      `/alerts`,
    })

    const pushResults = await Promise.allSettled(
      (subscriptions ?? []).map(sub => sendWebPush(sub.subscription_data, pushPayload))
    )

    // Limpiar suscripciones expiradas (410 Gone)
    const expiredSubs = pushResults
      .map((r, i) => ({ r, sub: subscriptions?.[i] }))
      .filter(({ r }) => r.status === 'rejected' &&
        (r as PromiseRejectedResult).reason?.status === 410)

    if (expiredSubs.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('user_id', expiredSubs.map(e => e.sub?.user_id).filter(Boolean))
    }

    // ── 2. EMAIL para alertas críticas ───────────────────────
    let emailsSent = 0
    if (fullAlert.severity === 'critical') {
      const { data: emailUsers } = await supabase
        .from('profiles')
        .select('full_name')
        .in('id', userIds)
        .in('role', ['owner', 'admin', 'veterinarian'])

      // Obtener emails desde auth.users (requiere service role)
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const emails = authUsers?.users
        .filter(u => userIds.includes(u.id) && u.email)
        .map(u => u.email!) ?? []

      for (const email of emails) {
        await sendAlertEmail({
          to:           email,
          alertTitle:   fullAlert.title,
          alertDesc:    fullAlert.description ?? '',
          recommendation: fullAlert.recommended_action ?? '',
          severity:     fullAlert.severity,
          farmName,
          houseName,
          flockCode,
          category:     fullAlert.category,
        })
        emailsSent++
      }
    }

    // ── 3. Marcar alertas como notificadas ───────────────────
    await supabase
      .from('alerts')
      .update({
        push_sent_at:    new Date().toISOString(),
        email_sent_at:   emailsSent > 0 ? new Date().toISOString() : null,
        notified_users:  userIds,
      })
      .eq('id', alert.id)

    return new Response(JSON.stringify({
      dispatched:     true,
      push_sent:      (subscriptions ?? []).length,
      emails_sent:    emailsSent,
      recipients:     users.length,
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[alert-dispatcher] Error:', error)
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

// ── HELPERS ──────────────────────────────────────────────────

async function sendWebPush(subscriptionData: unknown, payload: string): Promise<void> {
  // Implementación simplificada — en producción usar librería web-push compatible con Deno
  // https://deno.land/x/web_push
  const sub = subscriptionData as { endpoint: string; keys: { auth: string; p256dh: string } }
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/octet-stream',
      'Authorization': `vapid public=${vapidPub},t=...`, // JWT generado con VAPID
    },
    body: payload,
  })
  if (!res.ok) {
    const err = new Error(`Push failed: ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
}

async function sendAlertEmail(params: {
  to:             string
  alertTitle:     string
  alertDesc:      string
  recommendation: string
  severity:       string
  farmName:       string
  houseName:      string
  flockCode:      string
  category:       string
}): Promise<void> {
  const severityColor = params.severity === 'critical' ? '#ef4444' : '#f59e0b'
  const severityLabel = params.severity === 'critical' ? 'ALERTA CRÍTICA' : 'ADVERTENCIA'

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9;">
  <div style="max-width:520px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
    
    <div style="background:#070d0a;padding:20px 24px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:28px;">🐔</span>
      <div>
        <div style="color:#22c55e;font-size:18px;font-weight:bold;">AviGestión</div>
        <div style="color:#94a3b8;font-size:12px;">Sistema de alertas automáticas</div>
      </div>
    </div>

    <div style="padding:24px;">
      <div style="background:${severityColor}18;border-left:4px solid ${severityColor};border-radius:4px;padding:12px 16px;margin-bottom:20px;">
        <div style="color:${severityColor};font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${severityLabel}</div>
        <div style="color:#0f172a;font-size:16px;font-weight:bold;">${params.alertTitle}</div>
      </div>

      <table style="width:100%;font-size:13px;margin-bottom:20px;">
        <tr><td style="color:#64748b;padding:4px 0;width:90px;">Granja:</td><td style="color:#0f172a;font-weight:bold;">${params.farmName}</td></tr>
        <tr><td style="color:#64748b;padding:4px 0;">Galpón:</td><td style="color:#0f172a;">${params.houseName}</td></tr>
        <tr><td style="color:#64748b;padding:4px 0;">Lote:</td><td style="color:#0f172a;">${params.flockCode}</td></tr>
        <tr><td style="color:#64748b;padding:4px 0;">Hora:</td><td style="color:#0f172a;">${new Date().toLocaleString('es-AR')}</td></tr>
      </table>

      ${params.alertDesc ? `<p style="font-size:13px;color:#334155;margin:0 0 16px;line-height:1.6;">${params.alertDesc}</p>` : ''}

      ${params.recommendation ? `
      <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <div style="color:#166534;font-size:11px;font-weight:bold;text-transform:uppercase;margin-bottom:4px;">Acción recomendada</div>
        <div style="color:#15803d;font-size:13px;line-height:1.6;">${params.recommendation}</div>
      </div>` : ''}

      <a href="${Deno.env.get('APP_URL') ?? 'https://app.avigestion.com'}/alerts" 
         style="display:block;background:#166534;color:#22c55e;text-decoration:none;text-align:center;padding:12px;border-radius:8px;font-weight:bold;font-size:14px;">
        Ver alerta en AviGestión →
      </a>
    </div>

    <div style="background:#f8fafc;padding:14px 24px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">AviGestión · Gestión avícola profesional</p>
      <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">
        Para dejar de recibir estas alertas, configurá tus notificaciones en la app.
      </p>
    </div>
  </div>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'AviGestión Alertas <alertas@avigestion.com>',
      to:      [params.to],
      subject: `${params.severity === 'critical' ? '🔴' : '🟡'} ${params.alertTitle} — ${params.farmName}`,
      html,
    }),
  })
}
