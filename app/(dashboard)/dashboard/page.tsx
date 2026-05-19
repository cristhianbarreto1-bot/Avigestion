import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: granja } = await supabase.from('granjas').select('*').eq('owner_id', user.id).single()

  if (!granja) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md w-full">
          <div className="text-5xl mb-4">🏡</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">¡Bienvenido a AviGestión!</h2>
          <p className="text-gray-500 text-sm mb-6">Primero configurá tu granja para empezar a gestionar tu producción.</p>
          <a href="/granjas/nueva" className="bg-emerald-700 text-white px-6 py-3 rounded-lg hover:bg-emerald-800 inline-block font-medium text-sm">
            Crear mi granja →
          </a>
        </div>
      </div>
    )
  }

  const [{ data: lotes }, { data: alertas }, { count: totalInsp }] = await Promise.all([
    supabase.from('lotes').select('*, galpones(nombre)').eq('granja_id', granja.id).eq('estado', 'activo'),
    supabase.from('alertas').select('*').eq('granja_id', granja.id).eq('leida', false).order('created_at', { ascending: false }).limit(5),
    supabase.from('inspecciones').select('*', { count: 'exact', head: true }).eq('granja_id', granja.id),
  ])

  const totalAves = lotes?.reduce((s, l) => s + (l.cantidad_actual ?? l.cantidad_inicial), 0) ?? 0
  const lotesActivos = lotes?.length ?? 0

  const actividadReciente = [
    ...(lotes?.slice(0, 2).map(l => ({
      fecha: new Date(l.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
      evento: `Lote ${l.numero} activo`,
      lote: l.galpones?.nombre ?? 'Sin galpón',
      tipo: 'green',
      estado: 'Normal',
    })) ?? []),
    ...(alertas?.slice(0, 3).map(a => ({
      fecha: new Date(a.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
      evento: a.titulo,
      lote: '—',
      tipo: a.severidad === 'critica' ? 'red' : a.severidad === 'alta' ? 'amber' : 'blue',
      estado: a.severidad,
    })) ?? []),
  ].slice(0, 5)

  const badgeColor: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="p-7">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Panel principal</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen de {granja.nombre}</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total aves', value: totalAves.toLocaleString('es-AR'), hint: `${lotesActivos} lotes activos` },
          { label: 'Lotes activos', value: lotesActivos, hint: `Máx. ${granja.max_lotes_activos}` },
          { label: 'Inspecciones', value: totalInsp ?? 0, hint: 'Total registradas' },
          { label: 'Alertas', value: alertas?.length ?? 0, hint: 'Sin leer' },
        ].map(m => (
          <div key={m.label} className="bg-[#f0ede6] rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{m.label}</div>
            <div className="text-2xl font-bold text-gray-900">{m.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{m.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Lotes activos */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Lotes en producción</h2>
            <a href="/lotes/nuevo" className="text-xs text-emerald-700 hover:underline">+ Nuevo</a>
          </div>
          {!lotes?.length ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No hay lotes activos. <a href="/lotes/nuevo" className="text-emerald-700 hover:underline">Crear uno</a>
            </div>
          ) : (
            <div className="space-y-3">
              {lotes.map((lote: any) => {
                const dias = Math.floor((Date.now() - new Date(lote.fecha_ingreso).getTime()) / 86400000)
                const pct = Math.round(((lote.cantidad_actual ?? lote.cantidad_inicial) / lote.cantidad_inicial) * 100)
                return (
                  <div key={lote.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900">Lote {lote.numero}</span>
                      <span className="text-gray-400">{(lote.cantidad_actual ?? lote.cantidad_inicial).toLocaleString('es-AR')} aves · Día {dias}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Accesos rápidos */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/inspecciones/nueva', icon: '📋', label: 'Nueva inspección' },
              { href: '/lotes/nuevo', icon: '🐣', label: 'Nuevo lote' },
              { href: '/galpones/nuevo', icon: '🏠', label: 'Nuevo galpón' },
              { href: '/calculadoras', icon: '🧮', label: 'Calculadoras' },
              { href: '/alertas', icon: '🔔', label: `${alertas?.length ?? 0} alertas` },
              { href: '/reportes', icon: '📈', label: 'Ver reportes' },
            ].map(a => (
              <a key={a.href} href={a.href}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all text-sm text-gray-700 hover:text-emerald-800">
                <span className="text-lg">{a.icon}</span>
                <span className="font-medium">{a.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Actividad reciente</h2>
        {!actividadReciente.length ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin actividad registrada todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Fecha', 'Evento', 'Galpón', 'Estado'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 uppercase tracking-wide font-semibold py-2 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actividadReciente.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-500">{r.fecha}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-800">{r.evento}</td>
                    <td className="py-2.5 px-3 text-gray-500">{r.lote}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor[r.tipo]}`}>{r.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
