'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bird, ClipboardCheck, Gauge, RefreshCw } from 'lucide-react'
import { AppShell } from '@/components/ui/AppShell'
import { createClient } from '@/lib/supabase/browser'
import type { ActiveFlock, Alert } from '@/types'

type Kpis = {
  active_flocks: number
  total_active_birds: number
  open_alerts: number
  critical_alerts: number
  inspections_today_completed: number
  avg_score_today: number | null
  flocks_pending_inspection: number
}

type RecentInspection = {
  id: string; inspected_at: string; flock_age_days: number; status: string
  total_score: number | null; score_label: string | null; mortality_count: number
  weight_avg_g: number | null; weight_cv_pct: number | null
  supervisor_name: string | null; house_name: string; farm_name: string
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-[#ef4444] bg-[#ef4444]/10',
  warning:  'border-[#f59e0b] bg-[#f59e0b]/10',
  info:     'border-[#334155] bg-[#0d1810]',
}
const SEVERITY_ICON: Record<string, string> = { critical: '🚨', warning: '⚠️', info: 'ℹ️' }

function scoreColor(score: number | null) {
  if (score == null) return 'text-[#4b5563]'
  return score >= 80 ? 'text-[#22c55e]' : score >= 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [flocks, setFlocks] = useState<ActiveFlock[]>([])
  const [inspections, setInspections] = useState<RecentInspection[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const [k, f, i, a] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/flocks').then(r => r.json()),
        fetch('/api/inspections?page_size=10').then(r => r.json()),
        supabase.from('alerts').select('*').in('status', ['open', 'acknowledged'])
          .order('created_at', { ascending: false }).limit(20),
      ])
      if (k.error) throw new Error(k.error)
      setKpis(k.data)
      setFlocks(f.data ?? [])
      setInspections(i.data?.data ?? [])
      setAlerts((a.data as Alert[] | null) ?? [])
    } catch (e) {
      setError((e as Error).message || 'No se pudo cargar el panel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function resolveAlert(id: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq('id', id)
    if (!error) setAlerts(list => list.filter(a => a.id !== id))
  }

  const cards = kpis ? [
    { icon: Bird, label: 'Aves activas', value: kpis.total_active_birds.toLocaleString('es-AR'), sub: `${kpis.active_flocks} lotes` },
    { icon: ClipboardCheck, label: 'Inspecciones hoy', value: String(kpis.inspections_today_completed), sub: `${kpis.flocks_pending_inspection} lotes pendientes` },
    { icon: Gauge, label: 'Score promedio hoy', value: kpis.avg_score_today != null ? String(kpis.avg_score_today) : '—', sub: 'sobre 100' },
    { icon: AlertTriangle, label: 'Alertas abiertas', value: String(kpis.open_alerts), sub: `${kpis.critical_alerts} críticas` },
  ] : []

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Panel gerencial</h1>
          <p className="text-sm text-[#94a3b8]">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[#1a3022] px-3 py-2 text-sm text-[#94a3b8] hover:text-white disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {error && <p className="mb-4 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-3 text-sm text-[#fca5a5]">{error}</p>}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-[#1a3022] bg-[#0d1810] p-4">
            <c.icon className="mb-2 h-5 w-5 text-[#22c55e]" />
            <p className="text-2xl font-black text-white">{c.value}</p>
            <p className="text-sm text-[#cbd5e1]">{c.label}</p>
            <p className="text-xs text-[#4b5563]">{c.sub}</p>
          </div>
        ))}
      </div>

      {!loading && flocks.length === 0 && (
        <div className="mb-8 rounded-2xl border border-dashed border-[#1a3022] p-8 text-center text-[#94a3b8]">
          No hay lotes activos. <a href="/flocks/new" className="font-semibold text-[#22c55e] hover:underline">Cargá un lote</a> para empezar a inspeccionar.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#4b5563]">Lotes activos</h2>
          <div className="space-y-2">
            {flocks.map(f => {
              const today = f.last_inspection_at && new Date(f.last_inspection_at).toDateString() === new Date().toDateString()
              return (
                <a key={f.id} href={`/flocks/${f.id}/inspect`}
                  className="flex items-center justify-between rounded-xl border border-[#1a3022] bg-[#0d1810] p-4 hover:border-[#22c55e]">
                  <div>
                    <p className="font-bold">{f.farm_name} · {f.house_name}</p>
                    <p className="text-xs text-[#94a3b8]">
                      {f.code} · Día {f.age_days} · {(f.current_count ?? f.entry_count).toLocaleString('es-AR')} aves
                      {f.mortality_pct != null && ` · Mort. ${Number(f.mortality_pct).toFixed(2)}%`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${today ? 'bg-[#166534] text-[#bbf7d0]' : 'bg-[#f59e0b]/15 text-[#fcd34d]'}`}>
                    {today ? 'Inspeccionado' : 'Pendiente'}
                  </span>
                </a>
              )
            })}
          </div>

          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-[#4b5563]">Últimas inspecciones</h2>
          {inspections.length === 0 ? (
            <p className="text-sm text-[#4b5563]">Todavía no hay inspecciones.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#1a3022]">
              <table className="w-full text-sm">
                <thead className="bg-[#0d1810] text-left text-xs uppercase text-[#4b5563]">
                  <tr>
                    <th className="p-3">Fecha</th><th className="p-3">Galpón</th><th className="p-3">Día</th>
                    <th className="p-3">Supervisor</th><th className="p-3 text-right">Peso</th>
                    <th className="p-3 text-right">CV</th><th className="p-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map(i => (
                    <tr key={i.id} className="border-t border-[#1a3022]">
                      <td className="p-3 text-[#94a3b8]">{new Date(i.inspected_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</td>
                      <td className="p-3">{i.house_name}</td>
                      <td className="p-3">{i.flock_age_days}</td>
                      <td className="p-3 text-[#94a3b8]">{i.supervisor_name ?? '—'}</td>
                      <td className="p-3 text-right">{i.weight_avg_g ? `${Math.round(i.weight_avg_g)} g` : '—'}</td>
                      <td className={`p-3 text-right ${i.weight_cv_pct && i.weight_cv_pct > 8 ? 'text-[#f59e0b]' : ''}`}>
                        {i.weight_cv_pct != null ? `${Number(i.weight_cv_pct).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`p-3 text-right font-bold ${scoreColor(i.total_score)}`}>
                        {i.status === 'draft' ? <span className="text-xs font-normal text-[#4b5563]">borrador</span> : Math.round(i.total_score ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#4b5563]">Alertas abiertas</h2>
          {alerts.length === 0 ? (
            <p className="rounded-xl border border-[#1a3022] bg-[#0d1810] p-4 text-sm text-[#94a3b8]">Sin alertas abiertas. 👌</p>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`rounded-xl border-l-4 p-4 ${SEVERITY_STYLE[a.severity]}`}>
                  <p className="font-semibold">{SEVERITY_ICON[a.severity]} {a.title}</p>
                  {a.description && <p className="mt-1 text-xs text-[#cbd5e1]">{a.description}</p>}
                  {a.recommended_action && <p className="mt-2 text-xs text-[#94a3b8]"><strong>Acción:</strong> {a.recommended_action}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[#4b5563]">{new Date(a.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <button onClick={() => resolveAlert(a.id)} className="text-xs font-semibold text-[#22c55e] hover:underline">
                      Marcar resuelta
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
