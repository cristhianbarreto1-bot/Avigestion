'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NuevoGalponPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', capacidad: '', superficie_m2: '', tipo: 'convencional', sistema_ventilacion: 'natural' })
  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
    if (!granja) { setError('No tenés granja configurada'); setLoading(false); return }
    const { error: err } = await supabase.from('galpones').insert({
      ...form, granja_id: granja.id,
      capacidad: form.capacidad ? parseInt(form.capacidad) : null,
      superficie_m2: form.superficie_m2 ? parseFloat(form.superficie_m2) : null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    await supabase.from('onboarding_progress').update({ galpon_creado: true }).eq('user_id', user.id)
    router.push('/lotes/nuevo')
  }

  const inputClass = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <a href="/dashboard" className="text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="font-bold text-gray-900">Nuevo galpón</h1>
      </header>
      <main className="max-w-lg mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6"><div className="text-4xl mb-2">🏠</div><h2 className="text-xl font-bold text-gray-900">Agregar galpón</h2></div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input type="text" required value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Galpón 1" className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Capacidad (aves)</label>
                <input type="number" value={form.capacidad} onChange={e => set('capacidad', e.target.value)} placeholder="10000" className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Superficie (m²)</label>
                <input type="number" step="0.1" value={form.superficie_m2} onChange={e => set('superficie_m2', e.target.value)} placeholder="500" className={inputClass} /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inputClass + " bg-white"}>
                <option value="convencional">Convencional</option>
                <option value="climatizado">Climatizado</option>
                <option value="semi_climatizado">Semi-climatizado</option>
                <option value="dark_house">Dark House</option>
                <option value="cage_free">Cage Free</option>
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Ventilación</label>
              <select value={form.sistema_ventilacion} onChange={e => set('sistema_ventilacion', e.target.value)} className={inputClass + " bg-white"}>
                <option value="natural">Natural</option>
                <option value="forzada">Forzada</option>
                <option value="tunel">Túnel</option>
              </select></div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
              {loading ? 'Guardando...' : 'Crear galpón'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
