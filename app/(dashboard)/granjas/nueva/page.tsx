'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NuevaGranjaPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: '',
    ciudad: '',
    provincia: '',
    pais: 'AR',
    telefono: '',
    linea_genetica: 'cobb500',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: granja, error: err } = await supabase
      .from('granjas')
      .insert({ ...form, owner_id: user.id })
      .select()
      .single()

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // Actualizar profile con granja_id
    await supabase.from('profiles').update({ granja_id: granja.id }).eq('id', user.id)

    // Marcar onboarding
    await supabase.from('onboarding_progress').update({ granja_creada: true }).eq('user_id', user.id)

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="font-bold text-gray-900">Nueva granja</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏡</div>
            <h2 className="text-xl font-bold text-gray-900">Configurá tu granja</h2>
            <p className="text-gray-500 text-sm mt-1">Podés cambiar estos datos después</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la granja *</label>
              <input
                type="text" required value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Granja San José"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <input
                  type="text" value={form.ciudad}
                  onChange={e => set('ciudad', e.target.value)}
                  placeholder="Ej: Córdoba"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                <input
                  type="text" value={form.provincia}
                  onChange={e => set('provincia', e.target.value)}
                  placeholder="Ej: Entre Ríos"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
              <select value={form.pais} onChange={e => set('pais', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                <option value="AR">Argentina</option>
                <option value="BR">Brasil</option>
                <option value="CL">Chile</option>
                <option value="CO">Colombia</option>
                <option value="MX">México</option>
                <option value="PE">Perú</option>
                <option value="UY">Uruguay</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Línea genética principal</label>
              <select value={form.linea_genetica} onChange={e => set('linea_genetica', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                <option value="cobb500">Cobb 500</option>
                <option value="ross308">Ross 308</option>
                <option value="ross708">Ross 708</option>
                <option value="arbor_acres">Arbor Acres</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="tel" value={form.telefono}
                onChange={e => set('telefono', e.target.value)}
                placeholder="Ej: +54 9 11 1234-5678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors mt-2">
              {loading ? 'Guardando...' : 'Crear granja'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
