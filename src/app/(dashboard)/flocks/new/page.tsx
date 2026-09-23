'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell, Field, ErrorBox, inputClass, buttonClass } from '@/components/ui/AppShell'

type HouseOption = { id: string; name: string; farm_name: string; has_active_flock: boolean }

const GENETICS = [
  { value: 'cobb_500', label: 'Cobb 500' },
  { value: 'ross_308', label: 'Ross 308' },
  { value: 'ross_708', label: 'Ross 708' },
  { value: 'hubbard',  label: 'Hubbard' },
  { value: 'other',    label: 'Otra' },
]

export default function NewFlockPage() {
  const router = useRouter()
  const [houses, setHouses] = useState<HouseOption[] | null>(null)
  const [first, setFirst] = useState(false)
  const [form, setForm] = useState({
    house_id: '', code: '', genetic: 'cobb_500',
    entry_date: new Date().toISOString().slice(0, 10),
    entry_count: '', entry_weight_g: '', supplier: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFirst(new URLSearchParams(window.location.search).get('first') === '1')
    fetch('/api/houses').then(r => r.json()).then(j => {
      const list: HouseOption[] = j.data ?? []
      setHouses(list)
      const free = list.find(h => !h.has_active_flock)
      if (free) setForm(f => ({ ...f, house_id: free.id }))
    })
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const payload = {
      house_id: form.house_id,
      code: form.code.trim() || undefined,
      genetic: form.genetic,
      entry_date: form.entry_date,
      entry_count: Number(form.entry_count),
      entry_weight_g: form.entry_weight_g ? Number(form.entry_weight_g) : undefined,
      supplier: form.supplier.trim() || undefined,
    }
    const res = await fetch('/api/flocks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'No se pudo crear el lote')
      return
    }
    router.push('/supervisor')
  }

  const freeHouses = houses?.filter(h => !h.has_active_flock) ?? []

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-extrabold">{first ? '¡Listo! Ahora cargá tu primer lote' : 'Nuevo lote'}</h1>
        <p className="mb-6 mt-1 text-sm text-[#94a3b8]">Registrá el ingreso de pollitos a un galpón.</p>

        {houses && freeHouses.length === 0 ? (
          <div className="rounded-2xl border border-[#1a3022] bg-[#0d1810] p-6 text-[#94a3b8]">
            Todos tus galpones tienen un lote activo. Para cargar uno nuevo, primero hay que cerrar el lote actual.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#1a3022] bg-[#0d1810] p-6">
            <ErrorBox message={error} />
            <Field label="Galpón">
              <select className={inputClass} value={form.house_id} onChange={set('house_id')} required disabled={!houses}>
                {!houses && <option>Cargando…</option>}
                {freeHouses.map(h => (
                  <option key={h.id} value={h.id}>{h.farm_name} · {h.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Genética">
                <select className={inputClass} value={form.genetic} onChange={set('genetic')}>
                  {GENETICS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="Fecha de ingreso">
                <input type="date" className={inputClass} value={form.entry_date} onChange={set('entry_date')}
                  max={new Date().toISOString().slice(0, 10)} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pollitos ingresados">
                <input type="number" inputMode="numeric" min={1} className={inputClass} value={form.entry_count}
                  onChange={set('entry_count')} required placeholder="Ej: 25000" />
              </Field>
              <Field label="Peso al ingreso (g)" hint="Opcional">
                <input type="number" inputMode="decimal" min={1} step="0.1" className={inputClass}
                  value={form.entry_weight_g} onChange={set('entry_weight_g')} placeholder="Ej: 42" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código del lote" hint="Si lo dejás vacío se genera solo">
                <input className={inputClass} value={form.code} onChange={set('code')} />
              </Field>
              <Field label="Incubadora / proveedor" hint="Opcional">
                <input className={inputClass} value={form.supplier} onChange={set('supplier')} />
              </Field>
            </div>
            <button type="submit" disabled={loading || !form.house_id} className={buttonClass}>
              {loading ? 'Guardando…' : 'Crear lote'}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  )
}
