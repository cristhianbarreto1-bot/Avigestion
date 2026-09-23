// ============================================================
// AVIGESTION - API: /api/dashboard
// GET — KPIs en tiempo real para el panel gerencial
// ============================================================

import { NextRequest } from 'next/server'
import {
  createSupabaseServerClient,
  getAuthContext,
  handleApiError,
  apiSuccess,
  requireRole,
} from '@/lib/utils/api'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    requireRole(ctx, ['owner', 'admin', 'veterinarian'])

    const supabase = await createSupabaseServerClient()
    const orgId = ctx.orgId

    // ── Queries paralelas para performance ──────────────────
    const [
      activeFlocks,
      openAlerts,
      todayInspections,
      weeklyMortality,
      supervisorsOnline,
    ] = await Promise.all([
      // Lotes activos
      supabase
        .from('v_active_flocks')
        .select('id, current_count, farm_id, farm_name, house_name, age_days, last_inspection_at')
        .eq('organization_id', orgId),

      // Alertas abiertas
      supabase
        .from('alerts')
        .select('id, severity, category, flock_id, created_at')
        .eq('organization_id', orgId)
        .in('status', ['open', 'acknowledged']),

      // Inspecciones de hoy
      supabase
        .from('inspections')
        .select('id, total_score, score_label, status, supervisor_id, flock_id, inspected_at')
        .eq('organization_id', orgId)
        .gte('inspected_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z'),

      // Mortalidad últimos 7 días por granja
      supabase
        .from('inspections')
        .select('mortality_pct, mortality_count, inspected_at, flocks(houses(farm_id))')
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .gte('inspected_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('inspected_at', { ascending: true }),

      // Inspecciones en progreso (draft activos)
      supabase
        .from('inspections')
        .select('id, supervisor_id, flock_id, status, inspected_at, profiles!supervisor_id(full_name)')
        .eq('organization_id', orgId)
        .eq('status', 'draft')
        .gte('inspected_at', new Date(Date.now() - 4 * 3600000).toISOString()), // últimas 4hs
    ])

    const flocks = activeFlocks.data ?? []
    const alerts = openAlerts.data ?? []
    const inspections = todayInspections.data ?? []
    const drafts = supervisorsOnline.data ?? []

    // ── Calcular KPIs ────────────────────────────────────────
    const totalBirds = flocks.reduce((sum, f) => sum + (f.current_count ?? 0), 0)
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
    const completedToday = inspections.filter(i => i.status === 'completed')
    const avgScore = completedToday.length > 0
      ? completedToday.reduce((sum, i) => sum + (i.total_score ?? 0), 0) / completedToday.length
      : null

    // Granjas que no tuvieron inspección hoy
    const inspectedFlockIds = new Set(inspections.map(i => i.flock_id))
    const flocksWithoutInspectionToday = flocks.filter(f => !inspectedFlockIds.has(f.id))

    // Agrupar por granja
    const farmMap = new Map<string, {
      farm_id: string; farm_name: string; active_flocks: number
      open_alerts: number; last_inspection_at: string | null
      inspections_today: number; total_birds: number
    }>()

    flocks.forEach(f => {
      const key = f.farm_id
      if (!farmMap.has(key)) {
        farmMap.set(key, {
          farm_id: key, farm_name: f.farm_name, active_flocks: 0,
          open_alerts: 0, last_inspection_at: null, inspections_today: 0, total_birds: 0,
        })
      }
      const farm = farmMap.get(key)!
      farm.active_flocks++
      farm.total_birds += f.current_count ?? 0
      if (f.last_inspection_at) {
        if (!farm.last_inspection_at || f.last_inspection_at > farm.last_inspection_at) {
          farm.last_inspection_at = f.last_inspection_at
        }
      }
    })

    alerts.forEach(a => {
      // Alertas por granja requeriría join extra — simplificado
    })

    return apiSuccess({
      // KPIs principales
      active_flocks: flocks.length,
      total_active_birds: totalBirds,
      open_alerts: alerts.length,
      critical_alerts: criticalAlerts,
      inspections_today: inspections.length,
      inspections_today_completed: completedToday.length,
      avg_score_today: avgScore ? Math.round(avgScore) : null,

      // Estado tiempo real
      active_drafts: drafts.length,
      supervisors_inspecting: drafts.map(d => ({
        supervisor_id: d.supervisor_id,
        supervisor_name: (d.profiles as unknown as { full_name: string } | null)?.full_name,
        flock_id: d.flock_id,
        started_at: d.inspected_at,
      })),

      // Alertas por prioridad
      alerts_by_severity: {
        critical: criticalAlerts,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
      },

      // Lotes sin inspección hoy (para control gerencial)
      flocks_pending_inspection: flocksWithoutInspectionToday.length,
      flocks_pending_list: flocksWithoutInspectionToday.slice(0, 10).map(f => ({
        flock_id: f.id,
        house_name: f.house_name,
        farm_name: f.farm_name,
        age_days: f.age_days,
        last_inspection_at: f.last_inspection_at,
      })),

      // Resumen por granja
      farms_summary: Array.from(farmMap.values()),

      // Meta
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/* ============================================================
   HOOK DE REALTIME PARA EL DASHBOARD
   Usar en el componente ManagerDashboard en producción:
============================================================

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/db/supabase'

export function useRealtimeDashboard(orgId: string) {
  const [data, setData] = useState(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Cargar datos iniciales
    fetch('/api/dashboard').then(r => r.json()).then(d => setData(d.data))

    // Suscribir a cambios en tiempo real
    const channel = supabase
      .channel(`dashboard:${orgId}`)

      // Nuevas inspecciones o cambios de estado
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'inspections',
        filter: `organization_id=eq.${orgId}`,
      }, () => {
        // Refrescar KPIs cuando cambia una inspección
        fetch('/api/dashboard').then(r => r.json()).then(d => setData(d.data))
      })

      // Nuevas alertas
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'alerts',
        filter: `organization_id=eq.${orgId}`,
      }, (payload) => {
        // Mostrar notificación inmediata
        if (payload.new.severity === 'critical') {
          // notifyManager(payload.new)
        }
        fetch('/api/dashboard').then(r => r.json()).then(d => setData(d.data))
      })

      // Cambios en lotes (mortalidad acumulada)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'flocks',
        filter: `organization_id=eq.${orgId}`,
      }, () => {
        fetch('/api/dashboard').then(r => r.json()).then(d => setData(d.data))
      })

      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => supabase.removeChannel(channel)
  }, [orgId])

  return { data, isConnected }
}
*/
