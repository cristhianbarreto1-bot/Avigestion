// ============================================================
// AVIGESTION - InspectionWizard
// Interfaz móvil para el supervisor en el galpón
// Diseño: industrial/utilitarian, dark, touch-optimized
// ============================================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  useInspectionStore,
  SECTION_ORDER,
  SECTION_META,
  type InspectionSection,
} from '@/stores/inspection.store'
import { getStandardTemp, getExpectedWaterConsumption } from '@/lib/scoring-engine'
import type { Flock } from '@/types'

// ── PALETA (consistente con dashboard) ──────────────────────
const C = {
  bg:       '#070d0a',
  surface:  '#0d1810',
  card:     '#111f16',
  border:   '#1a3022',
  hi:       '#234d32',
  green:    '#22c55e',
  greenDim: '#166534',
  teal:     '#14b8a6',
  amber:    '#f59e0b',
  red:      '#ef4444',
  slate:    '#94a3b8',
  muted:    '#4b5563',
  white:    '#f0fdf4',
}

// ── SUBCOMPONENTES ───────────────────────────────────────────

function SectionBadge({ section, active, completed }: {
  section: InspectionSection
  active: boolean
  completed: boolean
}) {
  const meta = SECTION_META[section]
  return (
    <button
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '8px 4px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        opacity: completed ? 1 : active ? 1 : 0.45,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: completed ? C.greenDim : active ? C.card : C.surface,
        border: `1.5px solid ${completed ? C.green : active ? C.hi : C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        boxShadow: active ? `0 0 12px ${C.greenDim}` : 'none',
        transition: 'all 0.3s',
      }}>
        {completed ? '✓' : meta.icon}
      </div>
      <span style={{
        fontSize: 9, color: active ? C.green : completed ? C.slate : C.muted,
        fontWeight: active ? 700 : 400, letterSpacing: '0.3px',
      }}>
        {meta.label}
      </span>
    </button>
  )
}

function FieldRow({ label, children, required = false }: {
  label: string, children: React.ReactNode, required?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11, color: C.slate,
        marginBottom: 6, fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function NumberInput({ value, onChange, unit, min, max, step = 0.1, placeholder = '—' }: {
  value?: number | null
  onChange: (v: number | null) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        style={{
          flex: 1, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '12px 14px', color: C.white,
          fontSize: 16, fontFamily: 'monospace', outline: 'none',
          WebkitAppearance: 'none',
        }}
      />
      {unit && <span style={{ color: C.muted, fontSize: 12, minWidth: 30 }}>{unit}</span>}
    </div>
  )
}

function ToggleRow({ label, value, onChange, yesLabel = 'Sí', noLabel = 'No', yesGood = true }: {
  label: string
  value?: boolean | null
  onChange: (v: boolean) => void
  yesLabel?: string
  noLabel?: string
  yesGood?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ color: C.white, fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {[true, false].map(v => {
          const isSelected = value === v
          const isGood = v === true ? yesGood : !yesGood
          return (
            <button key={String(v)} onClick={() => onChange(v)} style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              border: `1px solid ${isSelected ? (isGood ? C.green : C.red) : C.border}`,
              background: isSelected ? (isGood ? `${C.green}22` : `${C.red}22`) : C.surface,
              color: isSelected ? (isGood ? C.green : C.red) : C.muted,
              transition: 'all 0.2s',
            }}>
              {v ? yesLabel : noLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ScaleInput({ label, value, onChange, maxValue = 5, goodHigh = true }: {
  label: string, value?: number | null, onChange: (v: number) => void,
  maxValue?: number, goodHigh?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </label>
        {value && <span style={{
          color: goodHigh ? (value >= 4 ? C.green : value >= 3 ? C.amber : C.red)
                          : (value <= 2 ? C.green : value <= 3 ? C.amber : C.red),
          fontSize: 13, fontWeight: 700,
        }}>
          {value}/{maxValue}
        </span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: maxValue }, (_, i) => i + 1).map(n => {
          const isSelected = value === n
          const color = goodHigh
            ? (n >= 4 ? C.green : n === 3 ? C.amber : C.red)
            : (n <= 2 ? C.green : n === 3 ? C.amber : C.red)
          return (
            <button key={n} onClick={() => onChange(n)} style={{
              flex: 1, padding: '10px 0', borderRadius: 8,
              border: `1px solid ${isSelected ? color : C.border}`,
              background: isSelected ? `${color}22` : C.surface,
              color: isSelected ? color : C.muted,
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {n}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: C.muted }}>{goodHigh ? 'Pésimo' : 'Mínimo'}</span>
        <span style={{ fontSize: 9, color: C.muted }}>{goodHigh ? 'Excelente' : 'Máximo'}</span>
      </div>
    </div>
  )
}

// ── SECCIONES DEL WIZARD ──────────────────────────────────────

function EnvironmentalSection() {
  const { environmental: data, updateEnvironmental, flock } = useInspectionStore()
  const ageDays = flock ? Math.floor((Date.now() - new Date(flock.entry_date).getTime()) / 86400000) : 0
  const tempStd = getStandardTemp(ageDays)

  const isOutOfRange = data.temp_actual_c !== undefined && data.temp_actual_c !== null
    ? data.temp_actual_c < tempStd.min || data.temp_actual_c > tempStd.max
    : null

  return (
    <div>
      {/* Indicador de rango */}
      <div style={{
        background: C.surface, borderRadius: 10, padding: 12, marginBottom: 16,
        border: `1px solid ${C.border}`, display: 'flex', gap: 12,
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Temp. estándar día {ageDays}</div>
          <div style={{ color: C.teal, fontSize: 16, fontWeight: 700 }}>
            {tempStd.min}–{tempStd.max}°C
          </div>
        </div>
        {data.temp_actual_c != null && (
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Estado</div>
            <div style={{ color: isOutOfRange ? C.red : C.green, fontSize: 14, fontWeight: 700 }}>
              {isOutOfRange ? '⚠ FUERA' : '✓ OK'}
            </div>
          </div>
        )}
      </div>

      <FieldRow label="Temperatura actual" required>
        <NumberInput
          value={data.temp_actual_c}
          onChange={v => updateEnvironmental({
            temp_actual_c: v,
            temp_standard_c: tempStd.ideal,
            temp_in_range: v != null ? (v >= tempStd.min && v <= tempStd.max) : undefined,
          })}
          unit="°C" min={10} max={45}
        />
      </FieldRow>

      <FieldRow label="Humedad relativa">
        <NumberInput
          value={data.humidity_pct}
          onChange={v => updateEnvironmental({
            humidity_pct: v ?? undefined,
            humidity_in_range: v != null ? (v >= 50 && v <= 70) : undefined,
          })}
          unit="%" min={0} max={100} step={1}
        />
      </FieldRow>

      <FieldRow label="Amoniaco (NH₃)">
        <NumberInput
          value={data.ammonia_ppm}
          onChange={v => updateEnvironmental({ ammonia_ppm: v ?? undefined })}
          unit="ppm" min={0} max={100} step={1}
        />
        {data.ammonia_ppm != null && data.ammonia_ppm > 25 && (
          <div style={{ color: C.red, fontSize: 11, marginTop: 6 }}>
            ⚠ Nivel elevado — aumentar ventilación inmediatamente
          </div>
        )}
      </FieldRow>

      <ScaleInput
        label="Estado de la cama (1=muy mala, 5=excelente)"
        value={data.litter_condition}
        onChange={v => updateEnvironmental({ litter_condition: v })}
      />

      <ToggleRow label="Ventilación funcionando correctamente"
        value={data.ventilation_ok} onChange={v => updateEnvironmental({ ventilation_ok: v })} />
      <ToggleRow label="Aberturas de entrada (inlets) OK"
        value={data.inlet_openings_ok} onChange={v => updateEnvironmental({ inlet_openings_ok: v })} />
    </div>
  )
}

function WaterSection() {
  const { water: data, updateWater, flock } = useInspectionStore()
  const ageDays = flock ? Math.floor((Date.now() - new Date(flock.entry_date).getTime()) / 86400000) : 0
  const birdCount = flock?.current_count ?? flock?.entry_count ?? 0
  const expectedLiters = getExpectedWaterConsumption(ageDays, birdCount)

  return (
    <div>
      <div style={{
        background: C.surface, borderRadius: 10, padding: 12, marginBottom: 16,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Consumo esperado hoy</div>
        <div style={{ color: C.teal, fontSize: 18, fontWeight: 700 }}>{expectedLiters} L</div>
        <div style={{ color: C.muted, fontSize: 10 }}>para {birdCount.toLocaleString()} aves al día {ageDays}</div>
      </div>

      <FieldRow label="Consumo real de agua" required>
        <NumberInput
          value={data.consumption_liters}
          onChange={v => updateWater({
            consumption_liters: v ?? undefined,
            consumption_standard: expectedLiters,
            consumption_in_range: v != null ? (v >= expectedLiters * 0.8 && v <= expectedLiters * 1.2) : undefined,
          })}
          unit="L" min={0} step={1}
        />
      </FieldRow>

      <FieldRow label="pH del agua">
        <NumberInput value={data.ph_level} onChange={v => updateWater({ ph_level: v ?? undefined })}
          unit="pH" min={4} max={10} step={0.1} />
      </FieldRow>

      <FieldRow label="Cloro residual">
        <NumberInput value={data.chlorine_ppm} onChange={v => updateWater({ chlorine_ppm: v ?? undefined })}
          unit="ppm" min={0} max={5} step={0.1} />
      </FieldRow>

      <ToggleRow label="Presión correcta en bebederos" value={data.pressure_ok} onChange={v => updateWater({ pressure_ok: v })} />
      <ToggleRow label="Bebederos limpios" value={data.drinkers_clean} onChange={v => updateWater({ drinkers_clean: v })} />
      <ToggleRow label="Altura de bebederos correcta" value={data.drinker_height_ok} onChange={v => updateWater({ drinker_height_ok: v })} />
    </div>
  )
}

function FeedingSection() {
  const { feeding: data, updateFeeding } = useInspectionStore()
  return (
    <div>
      <FieldRow label="Alimento consumido">
        <NumberInput value={data.feed_consumed_kg} onChange={v => updateFeeding({ feed_consumed_kg: v ?? undefined })}
          unit="kg" min={0} step={1} />
      </FieldRow>

      <FieldRow label="Tipo de alimento">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {['Pre-inicio', 'Inicio', 'Crecimiento', 'Engorde'].map(t => (
            <button key={t} onClick={() => updateFeeding({ feed_type: t })} style={{
              padding: '10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${data.feed_type === t ? C.green : C.border}`,
              background: data.feed_type === t ? `${C.green}18` : C.surface,
              color: data.feed_type === t ? C.green : C.slate, fontSize: 12,
            }}>{t}</button>
          ))}
        </div>
      </FieldRow>

      <ToggleRow label="Distribución uniforme" value={data.distribution_uniform} onChange={v => updateFeeding({ distribution_uniform: v })} />
      <ToggleRow label="Altura de comederos correcta" value={data.feeder_height_ok} onChange={v => updateFeeding({ feeder_height_ok: v })} />
      <ToggleRow label="Calidad visual del alimento OK" value={data.feed_quality_ok} onChange={v => updateFeeding({ feed_quality_ok: v })} />
      <ToggleRow label="Almacenamiento del alimento OK" value={data.feed_storage_ok} onChange={v => updateFeeding({ feed_storage_ok: v })} />
      <ToggleRow label="Presencia de moho" value={data.mold_detected} onChange={v => updateFeeding({ mold_detected: v })}
        yesLabel="Detectado" noLabel="Sin moho" yesGood={false} />
      <ToggleRow label="Presencia de plagas" value={data.pests_detected} onChange={v => updateFeeding({ pests_detected: v })}
        yesLabel="Detectado" noLabel="Sin plagas" yesGood={false} />
    </div>
  )
}

function HealthSection() {
  const { health: data, updateHealth, flock } = useInspectionStore()
  const totalBirds = flock?.current_count ?? flock?.entry_count ?? 1
  const mortalityPct = (((data.dead_count ?? 0) + (data.culled_count ?? 0)) / totalBirds * 100)

  const SIGNS = [
    { key: 'signs_respiratory', label: 'Respiratorio', icon: '🫁' },
    { key: 'signs_digestive',   label: 'Digestivo',    icon: '🫃' },
    { key: 'signs_nervous',     label: 'Nervioso',     icon: '🧠' },
    { key: 'signs_locomotion',  label: 'Locomotor',    icon: '🦿' },
    { key: 'signs_skin',        label: 'Piel/Plumaje', icon: '🪶' },
    { key: 'signs_ocular',      label: 'Ocular',       icon: '👁️' },
  ] as const

  return (
    <div>
      {/* Mortalidad */}
      <div style={{
        background: mortalityPct > 1 ? `${C.red}18` : mortalityPct > 0.5 ? `${C.amber}18` : `${C.green}18`,
        border: `1px solid ${mortalityPct > 1 ? C.red : mortalityPct > 0.5 ? C.amber : C.green}44`,
        borderRadius: 12, padding: 14, marginBottom: 16,
      }}>
        <div style={{ color: C.slate, fontSize: 11, marginBottom: 4 }}>Mortalidad del día</div>
        <div style={{
          color: mortalityPct > 1 ? C.red : mortalityPct > 0.5 ? C.amber : C.green,
          fontSize: 28, fontWeight: 900,
        }}>
          {mortalityPct.toFixed(2)}%
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>
          {(data.dead_count ?? 0) + (data.culled_count ?? 0)} bajas de {totalBirds.toLocaleString()} aves
        </div>
        {mortalityPct > 1 && (
          <div style={{ color: C.red, fontSize: 11, marginTop: 6, fontWeight: 600 }}>
            🔴 CRÍTICO — Contactar veterinario y realizar necropsia
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <FieldRow label="Muertes naturales">
          <NumberInput value={data.dead_count} onChange={v => updateHealth({ dead_count: v ?? 0 })}
            unit="aves" min={0} step={1} />
        </FieldRow>
        <FieldRow label="Sacrificados">
          <NumberInput value={data.culled_count} onChange={v => updateHealth({ culled_count: v ?? 0 })}
            unit="aves" min={0} step={1} />
        </FieldRow>
      </div>

      {/* Signos clínicos */}
      <FieldRow label="Signos clínicos observados">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {SIGNS.map(s => {
            const checked = !!(data as Record<string, unknown>)[s.key]
            return (
              <button key={s.key} onClick={() => updateHealth({ [s.key]: !checked } as Partial<typeof data>)} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                border: `1px solid ${checked ? C.red : C.border}`,
                background: checked ? `${C.red}18` : C.surface,
                color: checked ? C.red : C.slate, fontSize: 12,
              }}>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>
      </FieldRow>

      <ScaleInput label="Nivel de actividad (1=postrado, 5=normal)"
        value={data.activity_level} onChange={v => updateHealth({ activity_level: v })} />

      <ToggleRow label="Comportamiento normal" value={data.behavior_normal} onChange={v => updateHealth({ behavior_normal: v })} />
      <ToggleRow label="Distribución uniforme en el galpón" value={data.distribution_uniform} onChange={v => updateHealth({ distribution_uniform: v })} />
      <ToggleRow label="Medicación activa en este lote" value={data.medication_active} onChange={v => updateHealth({ medication_active: v })}
        yesLabel="Sí" noLabel="No" yesGood={false} />
    </div>
  )
}

function WeightsSection() {
  const { weights: data, updateWeights, flock } = useInspectionStore()
  const [inputValue, setInputValue] = useState('')
  const weights = (data.individual_weights ?? []) as number[]

  const ageDays = flock ? Math.floor((Date.now() - new Date(flock.entry_date).getTime()) / 86400000) : 0
  const { calculateWeightStats, getStandardForAge } = require('@/lib/scoring-engine')

  const addWeight = () => {
    const val = parseFloat(inputValue)
    if (isNaN(val) || val <= 0) return
    const newWeights = [...weights, val]
    const stats = calculateWeightStats(newWeights)
    updateWeights({ individual_weights: newWeights, ...stats })
    setInputValue('')
  }

  const removeWeight = (i: number) => {
    const newWeights = weights.filter((_, idx) => idx !== i)
    const stats = newWeights.length > 0 ? calculateWeightStats(newWeights) : {}
    updateWeights({ individual_weights: newWeights, ...stats })
  }

  const cvPct = data.cv_pct as number | undefined
  const avgWeight = data.avg_weight_g as number | undefined

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>Aves pesadas: {weights.length}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Promedio', value: avgWeight ? `${avgWeight}g` : '—', color: C.green },
            { label: 'CV', value: cvPct ? `${cvPct.toFixed(1)}%` : '—', color: cvPct && cvPct > 8 ? C.red : C.teal },
            { label: 'Uniformidad', value: data.uniformity_pct ? `${(data.uniformity_pct as number).toFixed(0)}%` : '—', color: C.amber },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ color: m.color, fontSize: 16, fontWeight: 800 }}>{m.value}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Input de peso */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="number" inputMode="decimal" value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addWeight()}
          placeholder="Peso del ave (g)"
          style={{
            flex: 1, background: C.surface, border: `1px solid ${C.hi}`,
            borderRadius: 10, padding: '14px', color: C.white, fontSize: 18,
            fontFamily: 'monospace', outline: 'none',
          }}
        />
        <button onClick={addWeight} style={{
          padding: '14px 20px', background: C.greenDim, border: `1px solid ${C.green}`,
          borderRadius: 10, color: C.green, fontSize: 20, cursor: 'pointer',
        }}>+</button>
      </div>

      {/* Lista de pesos */}
      {weights.length > 0 && (
        <div style={{
          maxHeight: 160, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4,
          marginBottom: 14,
        }}>
          {weights.map((w, i) => (
            <div key={i} onClick={() => removeWeight(i)} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '6px 4px', textAlign: 'center',
              cursor: 'pointer',
            }}>
              <div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{w}g</div>
              <div style={{ color: C.muted, fontSize: 9 }}>tap ×</div>
            </div>
          ))}
        </div>
      )}

      {cvPct && cvPct > 8 && (
        <div style={{
          background: `${C.amber}12`, border: `1px solid ${C.amber}33`,
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ color: C.amber, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            ⚠ CV elevado ({cvPct.toFixed(1)}%) — baja uniformidad
          </div>
          <div style={{ color: C.slate, fontSize: 11 }}>
            Verificar: temperatura por zonas, presión de bebederos, estado de cama
          </div>
        </div>
      )}
    </div>
  )
}

// ── WIZARD PRINCIPAL ─────────────────────────────────────────

export function InspectionWizard({ flock, onComplete }: {
  flock: Flock
  onComplete: (result: { score: number; score_label: string; alerts_generated: number }) => void
}) {
  const {
    inspectionId, currentSection, completedSections,
    isLoading, isSaving, isDirty, lastSavedAt, error,
    startInspection, setSection, saveCurrentSection, completeInspection,
  } = useInspectionStore()

  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Iniciar inspección
  // Si hay un borrador guardado de OTRO lote (o viejo), se descarta
  useEffect(() => {
    const s = useInspectionStore.getState()
    if (!s.inspectionId || s.flockId !== flock.id) {
      s.reset()
      startInspection(flock.id, flock)
    }
  }, [flock.id])

  // Auto-save cada 30 segundos
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (isDirty && !isSaving) saveCurrentSection()
    }, 30000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [isDirty, isSaving])

  const handleComplete = async () => {
    const result = await completeInspection()
    if (result) onComplete(result)
  }

  const currentIndex = SECTION_ORDER.indexOf(currentSection)
  const isLastSection = currentIndex === SECTION_ORDER.length - 1
  const canGoNext = completedSections.includes(currentSection) || isDirty

  const handleNext = async () => {
    await saveCurrentSection()
    if (!isLastSection) {
      setSection(SECTION_ORDER[currentIndex + 1])
    }
  }

  const ageDays = Math.floor((Date.now() - new Date(flock.entry_date).getTime()) / 86400000)

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, color: C.white,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input { color-scheme: dark; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '12px 16px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 700 }}>
              {flock.code ?? 'Lote sin código'} · Día {ageDays}
            </div>
            <div style={{ color: C.green, fontSize: 11 }}>
              {(flock.current_count ?? flock.entry_count).toLocaleString()} aves · {flock.genetic.replace('_', ' ').toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {isSaving && (
              <div style={{ color: C.amber, fontSize: 10 }}>💾 Guardando...</div>
            )}
            {!isSaving && lastSavedAt && (
              <div style={{ color: C.muted, fontSize: 10 }}>
                ✓ Guardado {lastSavedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {!isSaving && !lastSavedAt && isDirty && (
              <div style={{ color: C.amber, fontSize: 10 }}>● Sin guardar</div>
            )}
          </div>
        </div>

        {/* Navegación de secciones */}
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {SECTION_ORDER.map(s => (
            <div key={s} onClick={() => setSection(s)}>
              <SectionBadge
                section={s}
                active={s === currentSection}
                completed={completedSections.includes(s)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Título de sección */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>{SECTION_META[currentSection].icon}</span>
          <div>
            <h2 style={{ color: C.white, fontSize: 17, fontWeight: 800, margin: 0 }}>
              {SECTION_META[currentSection].label}
            </h2>
            <p style={{ color: C.muted, fontSize: 11, margin: 0 }}>
              {SECTION_META[currentSection].description}
            </p>
          </div>
        </div>
      </div>

      {/* Contenido de la sección */}
      <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
        {error && (
          <div style={{
            background: `${C.red}18`, border: `1px solid ${C.red}44`,
            borderRadius: 10, padding: 12, marginBottom: 12, color: C.red, fontSize: 12,
          }}>
            ⚠ {error}
          </div>
        )}

        {isLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>
            <div style={{ fontSize: 24, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
            <div style={{ marginTop: 8 }}>Iniciando inspección...</div>
          </div>
        )}

        {!isLoading && currentSection === 'environmental' && <EnvironmentalSection />}
        {!isLoading && currentSection === 'water' && <WaterSection />}
        {!isLoading && currentSection === 'feeding' && <FeedingSection />}
        {!isLoading && currentSection === 'health' && <HealthSection />}
        {!isLoading && currentSection === 'weights' && <WeightsSection />}
      </div>

      {/* Botones de navegación */}
      <div style={{
        padding: '12px 16px', background: C.surface,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 10,
      }}>
        {currentIndex > 0 && (
          <button onClick={() => setSection(SECTION_ORDER[currentIndex - 1])} style={{
            flex: 1, padding: 14, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, color: C.slate, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            ← Anterior
          </button>
        )}

        {!isLastSection ? (
          <button onClick={handleNext} disabled={!canGoNext} style={{
            flex: 2, padding: 14,
            background: canGoNext ? C.greenDim : C.surface,
            border: `1px solid ${canGoNext ? C.green : C.border}`,
            borderRadius: 12,
            color: canGoNext ? C.green : C.muted,
            fontSize: 14, fontWeight: 700, cursor: canGoNext ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}>
            Guardar y continuar →
          </button>
        ) : (
          <button onClick={handleComplete} disabled={isLoading} style={{
            flex: 2, padding: 14,
            background: isLoading ? C.surface : `linear-gradient(135deg,${C.greenDim},${C.teal}44)`,
            border: `1px solid ${C.green}`,
            borderRadius: 12, color: C.green, fontSize: 14, fontWeight: 800,
            cursor: isLoading ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {isLoading ? '⟳ Calculando...' : '✓ Finalizar inspección'}
          </button>
        )}
      </div>
    </div>
  )
}

export default InspectionWizard
