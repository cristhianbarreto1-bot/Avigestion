import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InspeccionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
  const { data: inspecciones } = granja
    ? await supabase.from('inspecciones').select('*, lotes(numero), galpones(nombre)').eq('granja_id', granja.id).order('fecha_inspeccion', { ascending: false }).limit(30)
    : { data: [] }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="font-bold text-gray-900">Inspecciones</h1>
        </div>
        <a href="/inspecciones/nueva" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">+ Nueva inspección</a>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-3">
        {!inspecciones?.length ? (
          <div className="text-center py-16 text-gray-500">No hay inspecciones registradas todavía.</div>
        ) : inspecciones.map((insp: any) => {
          const score = insp.score_total
          const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600'
          return (
            <div key={insp.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900">Lote {insp.lotes?.numero}</span>
                  <span className="text-xs text-gray-400">· {insp.galpones?.nombre}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${insp.estado === 'completada' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{insp.estado}</span>
                </div>
                <p className="text-sm text-gray-500">
                  Día {insp.dia_vida ?? '—'} · {new Date(insp.fecha_inspeccion).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              {score != null && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${scoreColor}`}>{score}</p>
                  <p className="text-xs text-gray-400">score</p>
                </div>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}
