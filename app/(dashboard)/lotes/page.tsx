import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: granja } = await supabase.from('granjas').select('id,nombre').eq('owner_id', user.id).single()
  const { data: lotes } = granja
    ? await supabase.from('lotes').select('*, galpones(nombre)').eq('granja_id', granja.id).order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="font-bold text-gray-900">Lotes</h1>
        </div>
        <a href="/lotes/nuevo" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">+ Nuevo lote</a>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {!lotes?.length ? (
          <div className="text-center py-16 text-gray-500">No hay lotes creados todavía.</div>
        ) : (
          <div className="space-y-3">
            {lotes.map((lote: any) => {
              const diasVida = Math.floor((Date.now() - new Date(lote.fecha_ingreso).getTime()) / 86400000)
              const estadoColor: Record<string, string> = { activo: 'bg-emerald-100 text-emerald-700', cerrado: 'bg-gray-100 text-gray-600', vendido: 'bg-blue-100 text-blue-700', descartado: 'bg-red-100 text-red-600' }
              return (
                <div key={lote.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">Lote {lote.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[lote.estado]}`}>{lote.estado}</span>
                    </div>
                    <p className="text-sm text-gray-500">{lote.galpones?.nombre ?? 'Sin galpón'} · {lote.linea_genetica} · Día {diasVida}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{(lote.cantidad_actual ?? lote.cantidad_inicial).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">aves</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
