'use client'
import { useState } from 'react'

type Tab = 'peso' | 'mortandad' | 'rentabilidad' | 'alimentacion'

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-[#f0ede6] focus:outline-none focus:border-emerald-500"

function CalcPeso() {
  const [v, setV] = useState({ pi: '', pf: '', dias: '', aves: '' })
  const [r, setR] = useState<{ gpd: string, gmt: string, ica: string, total: string } | null>(null)
  function calc() {
    if (!v.pi || !v.pf || !v.dias) return
    const gpd = ((+v.pf - +v.pi) / +v.dias).toFixed(1)
    const gmt = (+v.pf - +v.pi).toFixed(0)
    const ica = (+v.pf / (+v.pf - +v.pi) * 1.85).toFixed(2)
    const total = v.aves ? ((+v.pf / 1000) * +v.aves).toFixed(0) : '—'
    setR({ gpd, gmt, ica, total })
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Peso inicial (g)"><input className={inp} type="number" placeholder="42" value={v.pi} onChange={e => setV({ ...v, pi: e.target.value })} /></Field>
        <Field label="Peso final (g)"><input className={inp} type="number" placeholder="2800" value={v.pf} onChange={e => setV({ ...v, pf: e.target.value })} /></Field>
        <Field label="Días del período"><input className={inp} type="number" placeholder="42" value={v.dias} onChange={e => setV({ ...v, dias: e.target.value })} /></Field>
        <Field label="N° de aves (opcional)"><input className={inp} type="number" placeholder="2000" value={v.aves} onChange={e => setV({ ...v, aves: e.target.value })} /></Field>
      </div>
      <button onClick={calc} className="bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-800">Calcular</button>
      {r && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Ganancia media diaria', value: r.gpd + ' g/día' },
            { label: 'Ganancia total', value: r.gmt + ' g' },
            { label: 'ICA estimado', value: r.ica, note: 'kg alim. / kg ganado' },
            { label: 'Peso total del lote', value: r.total !== '—' ? r.total + ' kg' : '—' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">{item.label}</p>
              <p className="text-2xl font-bold text-emerald-800">{item.value}</p>
              {item.note && <p className="text-xs text-emerald-600 opacity-70">{item.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CalcMort() {
  const [v, setV] = useState({ ini: '', muertos: '', dias: '' })
  const [r, setR] = useState<{ tot: string, dia: string, vivas: string, alerta: string } | null>(null)
  function calc() {
    if (!v.ini || !v.muertos) return
    const tot = (+v.muertos / +v.ini * 100).toFixed(2)
    const dia = v.dias ? (+tot / +v.dias).toFixed(3) : '—'
    const vivas = (+v.ini - +v.muertos).toLocaleString('es-AR')
    const alerta = +tot > 5 ? '🚨 Alta' : +tot > 3 ? '⚠️ Moderada' : '✅ Normal'
    setR({ tot, dia, vivas, alerta })
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Aves ingresadas"><input className={inp} type="number" placeholder="2000" value={v.ini} onChange={e => setV({ ...v, ini: e.target.value })} /></Field>
        <Field label="Aves muertas"><input className={inp} type="number" placeholder="45" value={v.muertos} onChange={e => setV({ ...v, muertos: e.target.value })} /></Field>
        <Field label="Días transcurridos"><input className={inp} type="number" placeholder="42" value={v.dias} onChange={e => setV({ ...v, dias: e.target.value })} /></Field>
      </div>
      <button onClick={calc} className="bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-800">Calcular</button>
      {r && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
          {[
            { label: 'Mortandad acumulada', value: r.tot + '%' },
            { label: 'Mortandad diaria', value: r.dia !== '—' ? r.dia + '%' : '—' },
            { label: 'Aves vivas', value: r.vivas },
            { label: 'Evaluación', value: r.alerta },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center border-b border-emerald-100 pb-2 last:border-0 last:pb-0">
              <span className="text-sm text-emerald-700">{item.label}</span>
              <span className="font-bold text-emerald-800">{item.value}</span>
            </div>
          ))}
          <p className="text-xs text-emerald-600 opacity-70">Referencia: normal al día 45 → 3-5%</p>
        </div>
      )}
    </div>
  )
}

function CalcRent() {
  const [v, setV] = useState({ aves: '', peso: '', precio: '', alimento: '', otros: '' })
  const [r, setR] = useState<{ ib: string, ct: string, gn: string, mr: string } | null>(null)
  function calc() {
    if (!v.aves || !v.peso || !v.precio) return
    const ib = (+v.aves * +v.peso * +v.precio)
    const ct = (+v.alimento || 0) + (+v.otros || 0)
    const gn = ib - ct
    const mr = ib > 0 ? (gn / ib * 100).toFixed(1) : '0'
    setR({ ib: ib.toLocaleString('es-AR'), ct: ct.toLocaleString('es-AR'), gn: gn.toLocaleString('es-AR'), mr })
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Aves vendidas"><input className={inp} type="number" placeholder="2000" value={v.aves} onChange={e => setV({ ...v, aves: e.target.value })} /></Field>
        <Field label="Peso promedio (kg)"><input className={inp} type="number" step="0.1" placeholder="2.4" value={v.peso} onChange={e => setV({ ...v, peso: e.target.value })} /></Field>
        <Field label="Precio venta ($/kg)"><input className={inp} type="number" placeholder="800" value={v.precio} onChange={e => setV({ ...v, precio: e.target.value })} /></Field>
        <Field label="Costo alimento ($)"><input className={inp} type="number" placeholder="180000" value={v.alimento} onChange={e => setV({ ...v, alimento: e.target.value })} /></Field>
        <Field label="Otros costos ($)"><input className={inp} type="number" placeholder="40000" value={v.otros} onChange={e => setV({ ...v, otros: e.target.value })} /></Field>
      </div>
      <button onClick={calc} className="bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-800">Calcular</button>
      {r && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
          {[
            { label: 'Ingreso bruto', value: '$' + r.ib },
            { label: 'Costo total', value: '$' + r.ct },
            { label: 'Ganancia neta', value: '$' + r.gn, highlight: true },
            { label: 'Margen', value: r.mr + '%', highlight: true },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center border-b border-emerald-100 pb-2 last:border-0 last:pb-0">
              <span className="text-sm text-emerald-700">{item.label}</span>
              <span className={`font-bold ${item.highlight ? 'text-xl text-emerald-800' : 'text-emerald-800'}`}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CalcAlim() {
  const [aves, setAves] = useState('')
  const [sem, setSem] = useState('3')
  const consumos = [40, 80, 110, 140, 155, 165, 175]
  const cons = consumos[Math.min(+sem - 1, 6)]
  const total = aves ? Math.round(+aves * cons / 1000) : null
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Cantidad de aves"><input className={inp} type="number" placeholder="2000" value={aves} onChange={e => setAves(e.target.value)} /></Field>
        <Field label="Semana de vida">
          <select className={inp} value={sem} onChange={e => setSem(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map(s => <option key={s} value={s}>Semana {s}</option>)}
          </select>
        </Field>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide mb-1">Consumo estimado por ave/día</p>
        <p className="text-3xl font-bold text-emerald-800">{cons} g</p>
        {total !== null && (
          <>
            <div className="border-t border-emerald-200 mt-3 pt-3">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide mb-1">Total del lote por día</p>
              <p className="text-2xl font-bold text-emerald-800">{total} kg</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const TABS: { id: Tab, label: string }[] = [
  { id: 'peso', label: '⚖️ Peso / GMD' },
  { id: 'mortandad', label: '💀 Mortandad' },
  { id: 'rentabilidad', label: '💰 Rentabilidad' },
  { id: 'alimentacion', label: '🌾 Alimentación' },
]

export default function CalculadorasPage() {
  const [tab, setTab] = useState<Tab>('peso')
  return (
    <div className="p-7">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Calculadoras</h1>
        <p className="text-sm text-gray-500 mt-1">Herramientas de cálculo para la gestión de tu producción</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex gap-1 mb-6 border-b border-gray-200 pb-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-all font-medium ${
                tab === t.id ? 'border-emerald-600 text-emerald-700 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'peso' && <CalcPeso />}
        {tab === 'mortandad' && <CalcMort />}
        {tab === 'rentabilidad' && <CalcRent />}
        {tab === 'alimentacion' && <CalcAlim />}
      </div>
    </div>
  )
}
