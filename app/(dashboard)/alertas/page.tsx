import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AlertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
  const { data: alertas } = granja
    ? await supabase.from('alertas').select('*, lotes(numero)').eq('granja_id', granja.id).order('created_at', { ascending: false }).limit(50)
    : { data: [] }

  const severidadColor: Record<string, string> = { critica: 'border-red-400 bg-red-50', alta: 'border-orange-400 bg-orange-50', media: 'border-yellow-400 bg-yellow-50', baja: 'border-gray-300 bg-gray-50' }
  const severidadIcon: Record<string, string> = { critica: '🚨', alta: '⚠️', media: '📢', baja: 'ℹ️' }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="font-bold text-gray-900">Alertas</h1>
        <span className="text-sm text-gray-500">({alertas?.filter((a: any) => !a.leida).length} sin leer)</span>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-3">
        {!alertas?.length ? (
          <div className="text-center py-16 text-gray-500">No hay alertas registradas.</div>
        ) : alertas.map((alerta: any) => (
          <div key={alerta.id} className={`rounded-xl border-l-4 p-4 ${severidadColor[alerta.severidad]} ${!alerta.leida ? 'opacity-100' : 'opacity-60'}`}>
            <div className="flex items-start gap-3">
              <span className="text-xl">{severidadIcon[alerta.severidad]}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{alerta.titulo}</p>
                  {!alerta.leida && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Nueva</span>}
                </div>
                {alerta.descripcion && <p className="text-sm text-gray-600 mt-1">{alerta.descripcion}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  {alerta.lotes?.numero ? `Lote ${alerta.lotes.numero} · ` : ''}{new Date(alerta.created_at).toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
