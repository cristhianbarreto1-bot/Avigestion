import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: granja } = await supabase
    .from('granjas').select('*').eq('owner_id', user.id).single()

  const { data: lotes } = granja
    ? await supabase.from('lotes').select('*, galpones(nombre)').eq('granja_id', granja.id).eq('estado', 'activo')
    : { data: [] }

  const { data: alertas } = granja
    ? await supabase.from('alertas').select('*').eq('granja_id', granja.id).eq('leida', false).order('created_at', { ascending: false }).limit(5)
    : { data: [] }

  const { count: totalInspecciones } = granja
    ? await supabase.from('inspecciones').select('*', { count: 'exact', head: true }).eq('granja_id', granja.id)
    : { count: 0 }

  async function logout() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐔</span>
          <div>
            <h1 className="font-bold text-gray-900">AviGestión</h1>
            {granja && <p className="text-xs text-gray-500">{granja.nombre}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.email}</span>
          <form action={logout}>
            <button className="text-sm text-red-500 hover:text-red-700">Salir</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!granja ? (
          /* Onboarding */
          <div className="bg-white rounded-2xl shadow p-8 text-center max-w-lg mx-auto mt-16">
            <div className="text-5xl mb-4">🏡</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">¡Bienvenido a AviGestión!</h2>
            <p className="text-gray-500 mb-6">Todavía no tenés una granja configurada. Creá la primera para empezar.</p>
            <a href="/granjas/nueva" className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 inline-block font-medium">
              Crear mi primera granja
            </a>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Lotes activos', value: lotes?.length ?? 0, icon: '🐣', color: 'bg-emerald-50 text-emerald-700' },
                { label: 'Alertas pendientes', value: alertas?.length ?? 0, icon: '🔔', color: 'bg-amber-50 text-amber-700' },
                { label: 'Inspecciones', value: totalInspecciones ?? 0, icon: '📋', color: 'bg-blue-50 text-blue-700' },
                { label: 'Plan', value: granja.plan, icon: '⭐', color: 'bg-purple-50 text-purple-700' },
              ].map(stat => (
                <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-sm opacity-75">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Nav rápido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { href: '/lotes', label: 'Lotes', icon: '🐥' },
                { href: '/inspecciones', label: 'Inspecciones', icon: '📋' },
                { href: '/alertas', label: 'Alertas', icon: '🔔' },
                { href: '/reportes', label: 'Reportes', icon: '📊' },
              ].map(nav => (
                <a key={nav.href} href={nav.href}
                  className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow border border-gray-100">
                  <span className="text-3xl">{nav.icon}</span>
                  <span className="font-medium text-gray-700">{nav.label}</span>
                </a>
              ))}
            </div>

            {/* Lotes activos */}
            {lotes && lotes.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <h2 className="font-bold text-gray-900 mb-4">Lotes activos</h2>
                <div className="space-y-3">
                  {lotes.map((lote: any) => {
                    const diasVida = Math.floor((Date.now() - new Date(lote.fecha_ingreso).getTime()) / 86400000)
                    return (
                      <div key={lote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <span className="font-medium text-gray-900">Lote {lote.numero}</span>
                          <span className="text-sm text-gray-500 ml-2">· {lote.galpones?.nombre ?? 'Sin galpón'}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>Día {diasVida}</span>
                          <span>{lote.cantidad_actual ?? lote.cantidad_inicial} aves</span>
                          <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{lote.linea_genetica}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Alertas */}
            {alertas && alertas.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Alertas recientes</h2>
                <div className="space-y-3">
                  {alertas.map((alerta: any) => (
                    <div key={alerta.id} className={`flex items-start gap-3 p-3 rounded-lg ${
                      alerta.severidad === 'critica' ? 'bg-red-50' :
                      alerta.severidad === 'alta' ? 'bg-orange-50' : 'bg-yellow-50'
                    }`}>
                      <span className="text-lg">{alerta.severidad === 'critica' ? '🚨' : alerta.severidad === 'alta' ? '⚠️' : '📢'}</span>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{alerta.titulo}</p>
                        {alerta.descripcion && <p className="text-xs text-gray-500 mt-0.5">{alerta.descripcion}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
