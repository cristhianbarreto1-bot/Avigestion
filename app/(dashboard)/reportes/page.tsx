import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: granja } = await supabase.from('granjas').select('*').eq('owner_id', user.id).single()
  const { data: lotes } = granja
    ? await supabase.from('lotes').select('*, galpones(nombre)').eq('granja_id', granja.id).order('fecha_ingreso', { ascending: false })
    : { data: [] }

  const totalLotes = lotes?.length ?? 0
  const lotesActivos = lotes?.filter((l: any) => l.estado === 'activo').length ?? 0
  const totalAves = lotes?.filter((l: any) => l.estado === 'activo').reduce((acc: number, l: any) => acc + (l.cantidad_actual ?? l.cantidad_inicial), 0) ?? 0

  const { count: totalInspecciones } = granja
    ? await supabase.from('inspecciones').select('*', { count: 'exact', head: true }).eq('granja_id', granja.id)
    : { count: 0 }

  const { count: alertasTotal } = granja
    ? await supabase.from('alertas').select('*', { count: 'exact', head: true }).eq('granja_id', granja.id)
    : { count: 0 }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="font-bold text-gray-900">Reportes</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {!granja ? (
          <div className="text-center py-16 text-gray-500">No hay datos para mostrar.</div>
        ) : (
          <>
            {/* Resumen general */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 mb-4">📊 Resumen general — {granja.nombre}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Lotes activos', value: lotesActivos, icon: '🐣', color: 'bg-emerald-50 text-emerald-700' },
                  { label: 'Total lotes', value: totalLotes, icon: '📦', color: 'bg-blue-50 text-blue-700' },
                  { label: 'Aves en producción', value: totalAves.toLocaleString('es-AR'), icon: '🐔', color: 'bg-amber-50 text-amber-700' },
                  { label: 'Inspecciones', value: totalInspecciones ?? 0, icon: '📋', color: 'bg-purple-50 text-purple-700' },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
                    <div className="text-2xl mb-1">{stat.icon}</div>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs opacity-75 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla de lotes */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 mb-4">🐥 Lotes por estado</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Lote</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Galpón</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Línea</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Aves</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Días</th>
                      <th className="text-center py-2 px-3 text-gray-500 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotes?.map((lote: any) => {
                      const dias = Math.floor((Date.now() - new Date(lote.fecha_ingreso).getTime()) / 86400000)
                      const estadoColor: Record<string, string> = { activo: 'bg-emerald-100 text-emerald-700', cerrado: 'bg-gray-100 text-gray-600', vendido: 'bg-blue-100 text-blue-700', descartado: 'bg-red-100 text-red-600' }
                      return (
                        <tr key={lote.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-900">{lote.numero}</td>
                          <td className="py-2 px-3 text-gray-500">{lote.galpones?.nombre ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-500 capitalize">{lote.linea_genetica}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{(lote.cantidad_actual ?? lote.cantidad_inicial).toLocaleString('es-AR')}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{dias}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[lote.estado]}`}>{lote.estado}</span>
                          </td>
                        </tr>
                      )
                    })}
                    {(!lotes || lotes.length === 0) && (
                      <tr><td colSpan={6} className="py-8 text-center text-gray-400">No hay lotes registrados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Info plan */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 mb-3">⭐ Plan actual</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-emerald-600 capitalize">{granja.plan}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Máx. {granja.max_galpones} galpones · Máx. {granja.max_lotes_activos} lotes activos
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                  granja.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  granja.subscription_status === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {granja.subscription_status === 'trial' ? '🕐 Trial' :
                   granja.subscription_status === 'active' ? '✅ Activo' : granja.subscription_status}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
