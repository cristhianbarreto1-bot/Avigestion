'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import InspectionWizard from '@/components/inspection/InspectionWizard'
import { useInspectionStore } from '@/stores/inspection.store'
import type { Flock } from '@/types'

type Result = { score: number; score_label: string; alerts_generated: number }

export default function InspectPage({ params }: { params: { flockId: string } }) {
  const router = useRouter()
  const [flock, setFlock] = useState<Flock | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    fetch(`/api/flocks/${params.flockId}`)
      .then(r => r.json())
      .then(j => (j.error ? setError(j.error) : setFlock(j.data)))
      .catch(() => setError('No se pudo cargar el lote'))
  }, [params.flockId])

  const handleComplete = (r: Result) => {
    useInspectionStore.getState().reset()
    setResult(r)
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#070d0a] p-6 text-center text-[#f0fdf4]">
        <p className="text-[#fca5a5]">{error}</p>
        <a href="/supervisor" className="font-semibold text-[#22c55e] hover:underline">Volver a mis lotes</a>
      </div>
    )
  }

  if (result) {
    const color = result.score >= 80 ? '#22c55e' : result.score >= 60 ? '#f59e0b' : '#ef4444'
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070d0a] p-6 text-[#f0fdf4]">
        <div className="w-full max-w-sm space-y-5 rounded-3xl border border-[#1a3022] bg-[#0d1810] p-8 text-center">
          <p className="text-sm uppercase tracking-wider text-[#94a3b8]">Inspección finalizada</p>
          <p className="text-6xl font-black" style={{ color }}>{Math.round(result.score)}</p>
          <p className="text-lg font-bold">{result.score_label}</p>
          <p className="text-sm text-[#94a3b8]">
            {result.alerts_generated === 0
              ? 'Sin alertas generadas.'
              : `Se generaron ${result.alerts_generated} alerta${result.alerts_generated > 1 ? 's' : ''}.`}
          </p>
          <div className="space-y-2 pt-2">
            <button onClick={() => router.push('/supervisor')}
              className="w-full rounded-xl bg-[#22c55e] py-3 font-bold text-[#050907]">
              Inspeccionar otro lote
            </button>
            <button onClick={() => router.push('/')}
              className="w-full rounded-xl border border-[#1a3022] py-3 text-[#94a3b8]">
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!flock) {
    return <div className="flex min-h-screen items-center justify-center bg-[#070d0a] text-[#4b5563]">Cargando lote…</div>
  }

  return <InspectionWizard flock={flock} onComplete={handleComplete} />
}
