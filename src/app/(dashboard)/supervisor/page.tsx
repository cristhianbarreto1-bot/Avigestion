'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CalendarDays, Users, ChevronRight, Plus } from 'lucide-react'
import { AppShell } from '@/components/ui/AppShell'
import type { ActiveFlock } from '@/types'

const GENETIC_LABEL: Record<string, string> = {
  cobb_500: 'Cobb 500', ross_308: 'Ross 308', ross_708: 'Ross 708', hubbard: 'Hubbard', other: 'Otra',
}

function inspectedToday(iso: string | null) {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

export default function SupervisorFlockSelection() {
  const router = useRouter()
  const [flocks, setFlocks] = useState<ActiveFlock[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/flocks')
      .then(r => r.json())
      .then(j => (j.error ? setError(j.error) : setFlocks(j.data)))
      .catch(() => setError('No se pudieron cargar los lotes'))
  }, [])

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-3xl font-extrabold text-white">Mis inspecciones</h1>
        <p className="mb-6 text-[#94a3b8]">Elegí un lote activo para cargar la inspección del día.</p>

        <button
          onClick={() => router.push('/supervisor/thermal')}
          className="group mb-8 flex w-full items-center justify-between rounded-2xl border border-[#60a5fa]/30 bg-gradient-to-r from-[#1e3a8a] to-[#3b82f6] p-4 shadow-lg shadow-blue-500/20"
        >
          <div className="flex items-center gap-3 text-left">
            <span className="rounded-lg bg-white/20 p-2 text-xl">🌡️</span>
            <div>
              <h3 className="text-lg font-bold text-white">Calculadora de confort térmico</h3>
              <p className="text-xs text-blue-100">Temperatura mágica y sensación térmica</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-white opacity-70 transition group-hover:translate-x-1" />
        </button>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#4b5563]">Lotes activos</h2>
          <a href="/flocks/new" className="flex items-center gap-1 text-sm font-semibold text-[#22c55e] hover:underline">
            <Plus className="h-4 w-4" /> Nuevo lote
          </a>
        </div>

        {error && <p className="text-[#fca5a5]">{error}</p>}
        {!flocks && !error && <p className="text-[#4b5563]">Cargando…</p>}
        {flocks?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#1a3022] p-8 text-center text-[#94a3b8]">
            Todavía no hay lotes activos.{' '}
            <a href="/flocks/new" className="font-semibold text-[#22c55e] hover:underline">Cargá el primero</a>.
          </div>
        )}

        <div className="space-y-4">
          {flocks?.map(flock => {
            const done = inspectedToday(flock.last_inspection_at)
            return (
              <button
                key={flock.id}
                onClick={() => router.push(`/flocks/${flock.id}/inspect`)}
                className="group relative w-full overflow-hidden rounded-2xl border border-[#1a3022] bg-[#0d1810] p-5 text-left transition hover:border-[#22c55e] hover:bg-[#111f16]"
              >
                {done && (
                  <span className="absolute right-0 top-0 rounded-bl-lg bg-[#166534] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#bbf7d0]">
                    Inspeccionado hoy
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-white group-hover:text-[#22c55e]">{flock.house_name}</h2>
                      <span className="text-sm text-[#4b5563]">•</span>
                      <span className="flex items-center text-sm text-[#94a3b8]">
                        <MapPin className="mr-1 h-3 w-3" />{flock.farm_name}
                      </span>
                    </div>
                    <p className="text-xs text-[#4b5563]">{flock.code}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-[#94a3b8]">
                      <span className="flex items-center rounded border border-[#1a3022] bg-[#070d0a] px-2 py-1">
                        <CalendarDays className="mr-1.5 h-3 w-3 text-[#22c55e]" />Día {flock.age_days}
                      </span>
                      <span className="flex items-center rounded border border-[#1a3022] bg-[#070d0a] px-2 py-1">
                        <Users className="mr-1.5 h-3 w-3 text-[#22c55e]" />
                        {(flock.current_count ?? flock.entry_count).toLocaleString('es-AR')} aves
                      </span>
                      <span className="rounded border border-[#1a3022] bg-[#070d0a] px-2 py-1">
                        {GENETIC_LABEL[flock.genetic] ?? flock.genetic}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-[#4b5563] transition group-hover:translate-x-1 group-hover:text-[#22c55e]" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
