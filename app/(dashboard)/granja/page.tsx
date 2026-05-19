import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function GranjaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: granja } = await supabase.from('granjas').select('*').eq('owner_id', user.id).single()
  if (!granja) redirect('/granjas/nueva')

  const [{ data: lotes }, { data: galpones }] = await Promise.all([
    supabase.from('lotes').select('*, galpones(nombre)').eq('granja_id', granja.id).order('created_at', { ascending: false }),
    supabase.from('galpones').select('*').eq('granja_id', granja.id).order('nombre'),
  ])

  const estadoColor: Record<string, string> = {
    activo: 'bg-emerald-50 text-emerald-700',
    cerrado: 'bg-gray-100 text-gray-500',
    vendido: 'bg-blue-50 text-blue-700',
    descartado: 'bg-red-50 text-red-600',
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Mi granja</h1>
          <p className="text-sm text-gray-500 mt-1">{granja.nombre} · {granja.ciudad ?? ''} {granja.provincia ?? ''}</p>
        </div>
        <div className="flex gap-2">
          <a href="/galpones/nuevo" className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">+ Galpón</a>
          <a href="/lotes/nuevo" className="text-sm bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800">+ Lote</a>
        </div>
      </div>

      {/* Info granja */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Datos del establecimiento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: 'Línea genética', value: granja.linea_genetica },
            { label: 'Plan', value: granja.plan },
            { label: 'Estado', value: granja.subscription_status },
            { label: 'País', value: granja.pais },
          ].map(item => (
            <div key={item.label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{item.label}</p>
              <p className="font-medium text-gray-800 capitalize">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Galpones */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Galpones ({galpones?.length ?? 0})</h2>
          <a href="/galpones/nuevo" className="text-xs text-emerald-700 hover:underline">+ Agregar</a>
        </div>
        {!galpones?.length ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No hay galpones registrados. <a href="/galpones/nuevo" className="text-emerald-700 hover:underline">Agregar uno</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {galpones.map((g: any) => (
              <div key={g.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">{g.nombre}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${g.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {g.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {g.capacidad && <p>Capacidad: {g.capacidad.toLocaleString('es-AR')} aves</p>}
                  {g.superficie_m2 && <p>Superficie: {g.superficie_m2} m²</p>}
                  <p className="capitalize">{g.tipo} · {g.sistema_ventilacion}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lotes */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Lotes ({lotes?.length ?? 0})</h2>
          <a href="/lotes/nuevo" className="text-xs text-emerald-700 hover:underline">+ Nuevo lote</a>
        </div>
        {!lotes?.length ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No hay lotes registrados. <a href="/lotes/nuevo" className="text-emerald-700 hover:underline">Crear el primero</a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Lote', 'Galpón', 'Línea', 'Aves', 'Días', 'Objetivo', 'Estado'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 uppercase tracking-wide font-semibold py-2 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotes.map((l: any) => {
                  const dias = Math.floor((Date.now() - new Date(l.fecha_ingreso).getTime()) / 86400000)
                  return (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{l.numero}</td>
                      <td className="py-2.5 px-3 text-gray-500">{l.galpones?.nombre ?? '—'}</td>
                      <td className="py-2.5 px-3 text-gray-500 capitalize">{l.linea_genetica}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">{(l.cantidad_actual ?? l.cantidad_inicial).toLocaleString('es-AR')}</td>
                      <td className="py-2.5 px-3 text-gray-500">{dias}</td>
                      <td className="py-2.5 px-3 text-gray-500 capitalize">{l.objetivo}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${estadoColor[l.estado]}`}>{l.estado}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
