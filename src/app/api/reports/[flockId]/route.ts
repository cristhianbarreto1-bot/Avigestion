// ============================================================
// AVIGESTION - GET /api/reports/[flockId]
// Genera reportes PDF server-side y los devuelve como stream
// ============================================================
// Tipo de reporte según query param:
//   ?type=weekly    — últimas 7 inspecciones
//   ?type=closure   — reporte completo de cierre del lote
//   ?type=inspection&id=[id] — reporte de una inspección
// ============================================================

import { NextRequest } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import {
  createSupabaseServerClient,
  getAuthContext,
  handleApiError,
  ApiError,
} from '@/lib/utils/api'
import { WeeklyFlockReport, FlockClosureReport } from '@/components/reports/FlockReport'
import React from 'react'

type Params = { params: Promise<{ flockId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx      = await getAuthContext()
    const { flockId } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'weekly'

    const supabase = await createSupabaseServerClient()

    // Verificar acceso al lote
    const { data: flock, error: flockErr } = await supabase
      .from('flocks')
      .select(`
        *,
        houses (name, farms (name, organizations (name)))
      `)
      .eq('id', flockId)
      .eq('organization_id', ctx.orgId)
      .single()

    if (flockErr || !flock) throw new ApiError('Lote no encontrado', 404)

    // Enriquecer el objeto flock
    const enrichedFlock = {
      ...flock,
      house_name: flock.houses?.name ?? '—',
      farm_name:  flock.houses?.farms?.name ?? '—',
      org_name:   flock.houses?.farms?.organizations?.name ?? 'AviGestión',
    }

    let pdfDoc: React.ReactElement

    if (type === 'weekly') {
      // Últimas 7 inspecciones completadas
      const { data: inspections } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_environmental (*),
          inspection_water (*),
          inspection_feeding (*),
          inspection_health (*),
          inspection_weights (*),
          profiles!supervisor_id (full_name)
        `)
        .eq('flock_id', flockId)
        .eq('status', 'completed')
        .order('inspected_at', { ascending: false })
        .limit(7)

      // Alertas de la semana
      const { data: alerts } = await supabase
        .from('alerts')
        .select('severity, title, created_at')
        .eq('flock_id', flockId)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false })

      const enrichedInspections = (inspections ?? []).map(i => ({
        ...i,
        environmental: i.inspection_environmental,
        water:         i.inspection_water,
        feeding:       i.inspection_feeding,
        health:        i.inspection_health,
        weights:       i.inspection_weights,
        supervisor_name: (i.profiles as { full_name: string } | null)?.full_name,
      }))

      pdfDoc = React.createElement(WeeklyFlockReport, {
        flock: enrichedFlock,
        inspections: enrichedInspections.reverse(), // cronológico
        alerts: alerts ?? [],
      })

    } else if (type === 'closure') {
      if (flock.status !== 'closed') {
        throw new ApiError('El lote debe estar cerrado para generar el reporte de cierre', 400)
      }

      // Todas las inspecciones del lote
      const { data: allInspections } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_environmental (*),
          inspection_water (*),
          inspection_health (*),
          inspection_weights (*),
          profiles!supervisor_id (full_name)
        `)
        .eq('flock_id', flockId)
        .eq('status', 'completed')
        .order('inspected_at', { ascending: true })

      const enrichedInspections = (allInspections ?? []).map(i => ({
        ...i,
        environmental: i.inspection_environmental,
        water: i.inspection_water,
        health: i.inspection_health,
        weights: i.inspection_weights,
        supervisor_name: (i.profiles as { full_name: string } | null)?.full_name,
      }))

      pdfDoc = React.createElement(FlockClosureReport, {
        flock: enrichedFlock,
        allInspections: enrichedInspections,
      })

    } else {
      throw new ApiError('Tipo de reporte inválido. Usar: weekly, closure', 400)
    }

    // Generar PDF como stream
    const stream = await renderToStream(pdfDoc)

    const reportNames = {
      weekly:  `AviGestion_Semanal_${enrichedFlock.farm_name}_${flock.code ?? flockId.slice(0,8)}.pdf`,
      closure: `AviGestion_Cierre_${enrichedFlock.farm_name}_${flock.code ?? flockId.slice(0,8)}.pdf`,
    }

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${reportNames[type as keyof typeof reportNames] ?? 'reporte.pdf'}"`,
        'Cache-Control':       'no-store',
      },
    })

  } catch (error) {
    return handleApiError(error)
  }
}
