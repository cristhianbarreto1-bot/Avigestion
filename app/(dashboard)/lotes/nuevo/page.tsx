'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NuevoLotePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [galpones, setGalpones] = useState<{id: string, nombre: string}[]>([])
  const [form, setForm] = useState({
    numero: '', galpon_id: '', linea_genetica: 'cobb500',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    cantidad_inicial: '', peso_ingreso_gramos: '42',
    proveedor: '', objetivo: 'engorde', observaciones: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
      if (granja) {
        const { data } = await supabase.from('galpones').select('id,nombre').eq('granja_id', granja.id).eq('activo', true)
        setGalpones(data || [])
      }
    }
    load()
  }, [])

  function set(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
    if (!granja) { setError('No tenés una granja configurada'); setLoading(false); return }
    const { error: err } = await supabase.from('lotes').insert({
      ...form,
      granja_id: granja.id,
      cantidad_inicial: parseInt(form.cantidad_inicial),
      cantidad_actual: parseInt(form.cantidad_inicial),
      peso_ingreso_gramos: parseFloat(form.peso_ingreso_gramos),
      galpon_id: form.galpon_id || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    await supabase.from('onboarding_progress').update({ lote_creado: true }).eq('user_id', user.id)
    router.push('/lotes')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <a href="/lotes" className="text-gray-400 hover:text-gray-600">← Lotes</a>
        <h1 className="font-bold text-gray-900">Nuevo lote</h1>
      </header>
      <main className="max-w-lg mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6"><div className="text-4xl mb-2">🐣</div><h2 className="text-xl font-bold text-gray-900">Cargar nuevo lote</h2></div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de lote *</label>
              <input type="text" required value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Ej: L-2024-001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad inicial *</label>
                <input type="number" required value={form.cantidad_inicial} onChange={e => set('cantidad_inicial', e.target.value)} placeholder="Ej: 10000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha ingreso *</label>
                <input type="date" required value={form.fecha_ingreso} onChange={e => set('fecha_ingreso', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Galpón</label>
              <select value={form.galpon_id} onChange={e => set('galpon_id', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                <option value="">Sin galpón asignado</option>
                {galpones.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
              {galpones.length === 0 && <p className="text-xs text-amber-600 mt-1">No hay galpones. <a href="/galpones/nuevo" className="underline">Crear uno</a></p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Línea genética</label>
              <select value={form.linea_genetica} onChange={e => set('linea_genetica', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                <option value="cobb500">Cobb 500</option>
                <option value="ross308">Ross 308</option>
                <option value="ross708">Ross 708</option>
                <option value="arbor_acres">Arbor Acres</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Objetivo</label>
                <select value={form.objetivo} onChange={e => set('objetivo', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                  <option value="engorde">Engorde</option>
                  <option value="postura">Postura</option>
                  <option value="reproductores">Reproductores</option>
                  <option value="recria">Recría</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso ingreso (g)</label>
                <input type="number" value={form.peso_ingreso_gramos} onChange={e => set('peso_ingreso_gramos', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
              <input type="text" value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Nombre del proveedor"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors">
              {loading ? 'Guardando...' : 'Crear lote'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
