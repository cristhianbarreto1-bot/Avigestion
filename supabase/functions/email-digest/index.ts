// ============================================================
// AVIGESTION - Edge Function: email-digest
// Resumen diario enviado a las 7am (Cron job)
// Deploy: supabase functions deploy email-digest
// Cron: supabase functions schedule email-digest --cron "0 10 * * *"
//       (10 UTC = 7am Argentina / 6am Brasil)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resendKey = Deno.env.get('RESEND_API_KEY')!
const appUrl    = Deno.env.get('APP_URL') ?? 'https://app.avigestion.com'

Deno.serve(async (req) => {
  // Permitir llamada manual con POST o trigger automático
  try {
    // Obtener todas las organizaciones activas con suscripción vigente
    const { data: orgs } = await supabase
      .from('organizations')
      .select(`
        id, name,
        subscriptions!inner (status, plan),
        profiles!inner (id, full_name, role)
      `)
      .in('subscriptions.status', ['active', 'trial'])
      .in('profiles.role', ['owner', 'admin'])
      .eq('profiles.is_active', true)

    if (!orgs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_active_orgs' }))
    }

    let totalSent = 0

    for (const org of orgs) {
      try {
        const digest = await buildDailyDigest(org.id, org.name)
        if (!digest.hasActivity) continue  // no enviar si no hubo actividad

        // Obtener emails de owners y admins
        const { data: authUsers } = await supabase.auth.admin.listUsers()
        const profiles = Array.isArray(org.profiles) ? org.profiles : [org.profiles]
        const userIds  = profiles.map((p: { id: string }) => p.id)
        const emails   = authUsers?.users
          .filter(u => userIds.includes(u.id) && u.email)
          .map(u => ({ email: u.email!, name: authUsers.users.find(au=>au.id===u.id)?.user_metadata?.full_name ?? '' }))
          ?? []

        for (const recipient of emails) {
          await sendDigestEmail(recipient.email, recipient.name, digest)
          totalSent++
        }
      } catch (orgError) {
        console.error(`[email-digest] Error for org ${org.id}:`, orgError)
      }
    }

    return new Response(JSON.stringify({ sent: totalSent, orgs: orgs.length }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[email-digest] Fatal error:', error)
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

// ── CONSTRUIR EL DIGEST DEL DÍA ──────────────────────────────

interface DailyDigest {
  orgName:           string
  date:              string
  hasActivity:       boolean
  // Inspecciones
  inspectionsTotal:  number
  inspectionsDone:   number
  avgScore:          number | null
  scoreLabel:        string
  flocksPending:     number
  // Alertas
  openAlerts:        number
  criticalAlerts:    number
  newAlertsToday:    number
  // Lotes
  activeFlocks:      number
  totalBirds:        number
  avgMortalityPct:   number
  // Top alertas
  topAlerts:         { title: string; severity: string; farm: string }[]
  // Lotes pendientes de inspección
  pendingFlocks:     { houseName: string; farmName: string; lastInspection: string }[]
}

async function buildDailyDigest(orgId: string, orgName: string): Promise<DailyDigest> {
  const today    = new Date().toISOString().split('T')[0]
  const yesterday= new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const [
    activeFlocks,
    todayInspections,
    openAlerts,
    newAlertsToday,
  ] = await Promise.all([
    supabase.from('v_active_flocks').select('id,current_count,house_name,farm_name,last_inspection_at,age_days').eq('organization_id', orgId),
    supabase.from('inspections').select('id,total_score,score_label,flock_id,status').eq('organization_id', orgId).gte('inspected_at', `${today}T00:00:00Z`).eq('status', 'completed'),
    supabase.from('alerts').select('id,severity,title,category,flocks(houses(farms(name)))').eq('organization_id', orgId).in('status', ['open', 'acknowledged']).order('severity', {ascending: false}).limit(5),
    supabase.from('alerts').select('id,severity').eq('organization_id', orgId).gte('created_at', `${today}T00:00:00Z`),
  ])

  const flocks       = activeFlocks.data ?? []
  const inspections  = todayInspections.data ?? []
  const alerts       = openAlerts.data ?? []
  const todayAlerts  = newAlertsToday.data ?? []

  const totalBirds   = flocks.reduce((s, f) => s + (f.current_count ?? 0), 0)
  const avgScore     = inspections.length > 0
    ? Math.round(inspections.reduce((s, i) => s + (i.total_score ?? 0), 0) / inspections.length)
    : null

  // Lotes sin inspección hoy
  const inspectedIds = new Set(inspections.map(i => i.flock_id))
  const pendingFlocks = flocks
    .filter(f => !inspectedIds.has(f.id))
    .slice(0, 5)
    .map(f => ({
      houseName:      f.house_name,
      farmName:       f.farm_name,
      lastInspection: f.last_inspection_at
        ? new Date(f.last_inspection_at).toLocaleDateString('es-AR')
        : 'Nunca',
    }))

  const topAlerts = alerts.slice(0, 4).map(a => ({
    title:    a.title,
    severity: a.severity,
    farm:     (a.flocks as unknown as { houses: { farms: { name: string } } } | null)?.houses?.farms?.name ?? '—',
  }))

  const hasActivity = inspections.length > 0 || todayAlerts.length > 0 || alerts.length > 0

  return {
    orgName,
    date:             new Date().toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long' }),
    hasActivity,
    inspectionsTotal: flocks.length,
    inspectionsDone:  inspections.length,
    avgScore,
    scoreLabel:       avgScore ? (avgScore >= 80 ? 'Aprobado' : avgScore >= 60 ? 'Observado' : 'Crítico') : '—',
    flocksPending:    pendingFlocks.length,
    openAlerts:       alerts.length,
    criticalAlerts:   alerts.filter(a => a.severity === 'critical').length,
    newAlertsToday:   todayAlerts.length,
    activeFlocks:     flocks.length,
    totalBirds,
    avgMortalityPct:  0, // TODO: calcular desde inspecciones de ayer
    topAlerts,
    pendingFlocks,
  }
}

// ── ENVIAR EMAIL ──────────────────────────────────────────────

async function sendDigestEmail(to: string, name: string, d: DailyDigest): Promise<void> {
  const scoreColor = !d.avgScore ? '#64748b' : d.avgScore >= 80 ? '#16a34a' : d.avgScore >= 60 ? '#d97706' : '#dc2626'
  const hasCritical = d.criticalAlerts > 0

  const alertRows = d.topAlerts.map(a => {
    const color = a.severity === 'critical' ? '#ef4444' : '#f59e0b'
    return `<tr>
      <td style="padding:6px 8px;color:${color};font-weight:bold;font-size:12px;text-transform:uppercase;">${a.severity}</td>
      <td style="padding:6px 8px;color:#334155;font-size:12px;">${a.title}</td>
      <td style="padding:6px 8px;color:#64748b;font-size:11px;">${a.farm}</td>
    </tr>`
  }).join('')

  const pendingRows = d.pendingFlocks.map(f =>
    `<tr>
      <td style="padding:5px 8px;color:#334155;font-size:12px;">${f.farmName}</td>
      <td style="padding:5px 8px;color:#334155;font-size:12px;">${f.houseName}</td>
      <td style="padding:5px 8px;color:#94a3b8;font-size:11px;">Último: ${f.lastInspection}</td>
    </tr>`
  ).join('')

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9;">
<div style="max-width:560px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#070d0a;padding:20px 24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <span style="font-size:28px;">🐔</span>
      <div>
        <div style="color:#22c55e;font-size:18px;font-weight:bold;">AviGestión</div>
        <div style="color:#94a3b8;font-size:12px;">Resumen diario · ${d.date}</div>
      </div>
    </div>
    <div style="color:#f0fdf4;font-size:14px;margin-top:8px;">Buenos días${name ? `, ${name.split(' ')[0]}` : ''}. Aquí está el resumen de <strong>${d.orgName}</strong>.</div>
  </div>

  ${hasCritical ? `
  <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 24px;">
    <div style="color:#991b1b;font-size:13px;font-weight:bold;">⚠ ${d.criticalAlerts} alerta${d.criticalAlerts>1?'s':''} crítica${d.criticalAlerts>1?'s':''} requieren atención inmediata</div>
  </div>` : ''}

  <div style="padding:20px 24px;">

    <!-- KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;">
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:22px;font-weight:bold;color:#0f172a;">${d.inspectionsDone}/${d.inspectionsTotal}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Inspecciones hoy</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:22px;font-weight:bold;color:${scoreColor};">${d.avgScore ?? '—'}${d.avgScore ? '%' : ''}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Score promedio</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:22px;font-weight:bold;color:${d.openAlerts>0?'#dc2626':'#0f172a'};">${d.openAlerts}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Alertas abiertas</div>
      </div>
    </div>

    <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <div style="color:#14532d;font-size:12px;">
        <strong>${d.totalBirds.toLocaleString('es-AR')}</strong> aves activas en 
        <strong>${d.activeFlocks}</strong> lote${d.activeFlocks!==1?'s':''}
        ${d.newAlertsToday > 0 ? ` · <strong style="color:#dc2626;">${d.newAlertsToday} nueva${d.newAlertsToday>1?'s':''} alerta${d.newAlertsToday>1?'s':''} generada${d.newAlertsToday>1?'s':''} hoy</strong>` : ''}
      </div>
    </div>

    ${d.topAlerts.length > 0 ? `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:13px;font-weight:bold;color:#0f172a;margin:0 0 8px;">Alertas abiertas</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        ${alertRows}
      </table>
    </div>` : ''}

    ${d.pendingFlocks.length > 0 ? `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:13px;font-weight:bold;color:#0f172a;margin:0 0 8px;">Lotes sin inspeccionar hoy (${d.flocksPending})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        ${pendingRows}
      </table>
    </div>` : `
    <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <div style="color:#15803d;font-size:13px;">✓ Todos los lotes activos fueron inspeccionados hoy</div>
    </div>`}

    <a href="${appUrl}/dashboard" style="display:block;background:#166534;color:#22c55e;text-decoration:none;text-align:center;padding:12px;border-radius:8px;font-weight:bold;font-size:14px;">
      Ver dashboard completo →
    </a>
  </div>

  <div style="background:#f8fafc;padding:14px 24px;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">
      AviGestión · Resumen automático diario · ${new Date().toLocaleDateString('es-AR')}
    </p>
  </div>
</div>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'AviGestión <resumen@avigestion.com>',
      to:      [to],
      subject: `${hasCritical ? '🔴 ' : '📊 '}Resumen diario ${d.orgName} — ${d.date}`,
      html,
    }),
  })
}
