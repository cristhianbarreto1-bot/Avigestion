'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NuevaInspeccionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lotes, setLotes] = useState<{id: string, numero: string}[]>([])
  const [step, setStep] = useState(1)
  const [inspeccionId, setInspeccionId] = useState<string | null>(null)
  const [form, setForm] = useState({
    lote_id: '', fecha_inspeccion: new Date().toISOString().slice(0,16),
    // mortalidad
    bajas_dia: '0', bajas_acumuladas: '0', causa_principal: 'desconocida',
    // alimentacion
    consumo_kg: '', consumo_esperado_gramos: '', fase_alimento: 'crecimiento',
    // agua
    consumo_litros: '', calidad_agua: 'buena', bebederos_ok: 'true',
    // ambiente
    temperatura_promedio: '', humedad_relativa: '', amoniaco_ppm: '', calidad_cama: 'buena',
    // sanidad
    signos_respiratorios: 'false', signos_digestivos: 'false',
    signos_neurologicos: 'false', signos_locomotores: 'false',
    condicion_corporal: '3', observaciones_sanidad: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
      if (granja) {
        const { data } = await supabase.from('lotes').select('id,numero').eq('granja_id', granja.id).eq('estado', 'activo')
        setLotes(data || [])
      }
    }
    load()
  }, [])

  function set(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })) }

  async function crearInspeccion() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: granja } = await supabase.from('granjas').select('id').eq('owner_id', user.id).single()
    if (!granja) { setError('No tenés granja'); setLoading(false); return }
    const lote = lotes.find(l => l.id === form.lote_id)
    const { data, error: err } = await supabase.from('inspecciones').insert({
      lote_id: form.lote_id, granja_id: granja.id,
      fecha_inspeccion: form.fecha_inspeccion, estado: 'borrador',
    }).select().single()
    if (err) { setError(err.message); setLoading(false); return }
    setInspeccionId(data.id)
    setStep(2)
    setLoading(false)
  }

  async function guardarYFinalizar() {
    setLoading(true); setError('')
    if (!inspeccionId) return
    // Guardar subsecciones
    await supabase.from('inspeccion_mortalidad').insert({
      inspeccion_id: inspeccionId,
      bajas_dia: parseInt(form.bajas_dia),
      bajas_acumuladas: parseInt(form.bajas_acumuladas),
      causa_principal: form.causa_principal,
    })
    await supabase.from('inspeccion_alimentacion').insert({
      inspeccion_id: inspeccionId,
      consumo_kg: form.consumo_kg ? parseFloat(form.consumo_kg) : null,
      consumo_esperado_gramos: form.consumo_esperado_gramos ? parseFloat(form.consumo_esperado_gramos) : null,
      fase_alimento: form.fase_alimento,
    })
    await supabase.from('inspeccion_agua').insert({
      inspeccion_id: inspeccionId,
      consumo_litros: form.consumo_litros ? parseFloat(form.consumo_litros) : null,
      calidad_agua: form.calidad_agua,
      bebederos_ok: form.bebederos_ok === 'true',
    })
    await supabase.from('inspeccion_ambiente').insert({
      inspeccion_id: inspeccionId,
      temperatura_promedio: form.temperatura_promedio ? parseFloat(form.temperatura_promedio) : null,
      humedad_relativa: form.humedad_relativa ? parseFloat(form.humedad_relativa) : null,
      amoniaco_ppm: form.amoniaco_ppm ? parseFloat(form.amoniaco_ppm) : null,
      calidad_cama: form.calidad_cama,
    })
    await supabase.from('inspeccion_sanidad').insert({
      inspeccion_id: inspeccionId,
      signos_respiratorios: form.signos_respiratorios === 'true',
      signos_digestivos: form.signos_digestivos === 'true',
      signos_neurologicos: form.signos_neurologicos === 'true',
      signos_locomotores: form.signos_locomotores === 'true',
      condicion_corporal: parseInt(form.condicion_corporal),
      observaciones: form.observaciones_sanidad,
    })
    await supabase.from('inspecciones').update({ estado: 'completada' }).eq('id', inspeccionId)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('onboarding_progress').update({ primera_inspeccion: true }).eq('user_id', user.id)
    router.push('/inspecciones')
  }

  const inputClass = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
  const selectClass = inputClass + " bg-white"

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/inspecciones" className="text-gray-400 hover:text-gray-600">← Inspecciones</a>
          <h1 className="font-bold text-gray-900">Nueva inspección</h1>
        </div>
        <div className="flex gap-2">
          {[1,2,3,4,5,6].map(s => (
            <div key={s} className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${step >= s ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">1. Datos generales</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lote *</label>
                <select required value={form.lote_id} onChange={e => set('lote_id', e.target.value)} className={selectClass}>
                  <option value="">Seleccioná un lote</option>
                  {lotes.map(l => <option key={l.id} value={l.id}>Lote {l.numero}</option>)}
                </select>
                {lotes.length === 0 && <p className="text-xs text-amber-600 mt-1">No hay lotes activos. <a href="/lotes/nuevo" className="underline">Crear uno</a></p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora</label>
                <input type="datetime-local" value={form.fecha_inspeccion} onChange={e => set('fecha_inspeccion', e.target.value)} className={inputClass} />
              </div>
              {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
              <button onClick={crearInspeccion} disabled={!form.lote_id || loading}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                {loading ? 'Iniciando...' : 'Continuar →'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">2. Mortalidad 🐓</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bajas del día</label>
                  <input type="number" value={form.bajas_dia} onChange={e => set('bajas_dia', e.target.value)} className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bajas acumuladas</label>
                  <input type="number" value={form.bajas_acumuladas} onChange={e => set('bajas_acumuladas', e.target.value)} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Causa principal</label>
                <select value={form.causa_principal} onChange={e => set('causa_principal', e.target.value)} className={selectClass}>
                  <option value="desconocida">Desconocida</option>
                  <option value="respiratoria">Respiratoria</option>
                  <option value="digestiva">Digestiva</option>
                  <option value="nerviosa">Nerviosa</option>
                  <option value="metabolica">Metabólica</option>
                  <option value="aplastamiento">Aplastamiento</option>
                  <option value="otra">Otra</option>
                </select></div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50">← Atrás</button>
                <button onClick={() => setStep(3)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700">Siguiente →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">3. Alimentación 🌾</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Consumo (kg)</label>
                  <input type="number" step="0.1" value={form.consumo_kg} onChange={e => set('consumo_kg', e.target.value)} placeholder="0.0" className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Esperado (g/ave)</label>
                  <input type="number" step="0.1" value={form.consumo_esperado_gramos} onChange={e => set('consumo_esperado_gramos', e.target.value)} placeholder="0.0" className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Fase alimento</label>
                <select value={form.fase_alimento} onChange={e => set('fase_alimento', e.target.value)} className={selectClass}>
                  <option value="iniciador">Iniciador</option>
                  <option value="crecimiento">Crecimiento</option>
                  <option value="terminacion">Terminación</option>
                  <option value="prefaena">Prefaena</option>
                </select></div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50">← Atrás</button>
                <button onClick={() => setStep(4)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700">Siguiente →</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">4. Agua 💧</h2>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Consumo agua (litros)</label>
                <input type="number" step="0.1" value={form.consumo_litros} onChange={e => set('consumo_litros', e.target.value)} placeholder="0.0" className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Calidad del agua</label>
                <select value={form.calidad_agua} onChange={e => set('calidad_agua', e.target.value)} className={selectClass}>
                  <option value="buena">Buena</option>
                  <option value="regular">Regular</option>
                  <option value="mala">Mala</option>
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Estado bebederos</label>
                <select value={form.bebederos_ok} onChange={e => set('bebederos_ok', e.target.value)} className={selectClass}>
                  <option value="true">OK</option>
                  <option value="false">Con problemas</option>
                </select></div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50">← Atrás</button>
                <button onClick={() => setStep(5)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700">Siguiente →</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">5. Ambiente 🌡️</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Temperatura (°C)</label>
                  <input type="number" step="0.1" value={form.temperatura_promedio} onChange={e => set('temperatura_promedio', e.target.value)} placeholder="25.0" className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Humedad (%)</label>
                  <input type="number" step="0.1" value={form.humedad_relativa} onChange={e => set('humedad_relativa', e.target.value)} placeholder="65.0" className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Amoníaco (ppm)</label>
                <input type="number" step="0.1" value={form.amoniaco_ppm} onChange={e => set('amoniaco_ppm', e.target.value)} placeholder="0.0" className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Calidad cama</label>
                <select value={form.calidad_cama} onChange={e => set('calidad_cama', e.target.value)} className={selectClass}>
                  <option value="seca">Seca</option>
                  <option value="buena">Buena</option>
                  <option value="humeda">Húmeda</option>
                  <option value="muy_humeda">Muy húmeda</option>
                </select></div>
              <div className="flex gap-3">
                <button onClick={() => setStep(4)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50">← Atrás</button>
                <button onClick={() => setStep(6)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700">Siguiente →</button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">6. Sanidad 🏥</h2>
              <div className="space-y-2">
                {[
                  { key: 'signos_respiratorios', label: 'Signos respiratorios' },
                  { key: 'signos_digestivos', label: 'Signos digestivos' },
                  { key: 'signos_neurologicos', label: 'Signos neurológicos' },
                  { key: 'signos_locomotores', label: 'Signos locomotores' },
                ].map(item => (
                  <label key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    <input type="checkbox" checked={form[item.key as keyof typeof form] === 'true'}
                      onChange={e => set(item.key, e.target.checked ? 'true' : 'false')}
                      className="w-5 h-5 text-emerald-600 rounded" />
                  </label>
                ))}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Condición corporal (1-5)</label>
                <select value={form.condicion_corporal} onChange={e => set('condicion_corporal', e.target.value)} className={selectClass}>
                  <option value="1">1 - Muy mala</option>
                  <option value="2">2 - Mala</option>
                  <option value="3">3 - Regular</option>
                  <option value="4">4 - Buena</option>
                  <option value="5">5 - Excelente</option>
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea value={form.observaciones_sanidad} onChange={e => set('observaciones_sanidad', e.target.value)} rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none" /></div>
              {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setStep(5)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50">← Atrás</button>
                <button onClick={guardarYFinalizar} disabled={loading}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                  {loading ? 'Guardando...' : '✅ Finalizar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
