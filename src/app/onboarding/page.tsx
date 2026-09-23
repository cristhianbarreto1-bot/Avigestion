'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Field, ErrorBox, inputClass, buttonClass } from '@/components/ui/AppShell'

export default function OnboardingPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    org_name: '', farm_name: '', farm_city: '', farm_province: 'Entre Ríos', houses_count: 1,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'houses_count' ? Number(e.target.value) : e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? 'No se pudo completar la configuración')
      setLoading(false)
      return
    }
    router.push('/flocks/new?first=1')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050907] p-4 text-[#f0fdf4]">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-3xl border border-[#1a3022]/60 bg-[#0a120c] p-8">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-[#22c55e]" />
          <h1 className="text-2xl font-extrabold">Configuremos tu granja</h1>
          <p className="mt-1 text-sm text-[#94a3b8]">Un paso y empezás a cargar inspecciones</p>
        </div>
        <ErrorBox message={error} />
        <Field label="Empresa o integración" hint="Puede ser tu nombre si trabajás de forma independiente">
          <input className={inputClass} value={form.org_name} onChange={set('org_name')} required minLength={2} />
        </Field>
        <Field label="Nombre de la granja">
          <input className={inputClass} value={form.farm_name} onChange={set('farm_name')} required minLength={2} placeholder="Ej: La Esperanza" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Localidad">
            <input className={inputClass} value={form.farm_city} onChange={set('farm_city')} />
          </Field>
          <Field label="Provincia">
            <input className={inputClass} value={form.farm_province} onChange={set('farm_province')} />
          </Field>
        </div>
        <Field label="Cantidad de galpones" hint="Durante la prueba, hasta 3 galpones">
          <select className={inputClass} value={form.houses_count} onChange={set('houses_count')}>
            {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? 'Guardando…' : 'Continuar'}
        </button>
      </form>
    </div>
  )
}
