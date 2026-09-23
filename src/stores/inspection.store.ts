// ============================================================
// AVIGESTION - Store de Inspección (Zustand)
// Maneja el estado del wizard paso a paso
// Auto-save cada 30 segundos mientras se completa
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  InspectionEnvironmental,
  InspectionWater,
  InspectionFeeding,
  InspectionHealth,
  InspectionWeights,
  Flock,
} from '@/types'

// ── TIPOS ────────────────────────────────────────────────────

export type InspectionSection = 'environmental' | 'water' | 'feeding' | 'health' | 'weights'

export const SECTION_ORDER: InspectionSection[] = [
  'environmental', 'water', 'feeding', 'health', 'weights'
]

export const SECTION_META = {
  environmental: { icon: '🌡️', label: 'Ambiental',  description: 'Temperatura, humedad, cama y calidad del aire' },
  water:         { icon: '💧', label: 'Agua',       description: 'Consumo, calidad y estado de bebederos' },
  feeding:       { icon: '🌾', label: 'Alimento',   description: 'Consumo, distribución y calidad del alimento' },
  health:        { icon: '🩺', label: 'Sanidad',    description: 'Mortalidad, signos clínicos y comportamiento' },
  weights:       { icon: '⚖️', label: 'Pesos',      description: 'Pesaje individual y uniformidad del lote' },
} as const

interface InspectionStore {
  // Datos de la sesión
  inspectionId: string | null
  flockId: string | null
  flock: Flock | null

  // Secciones completadas
  completedSections: InspectionSection[]
  currentSection: InspectionSection

  // Datos de cada sección
  environmental: Partial<InspectionEnvironmental>
  water: Partial<InspectionWater>
  feeding: Partial<InspectionFeeding>
  health: Partial<InspectionHealth>
  weights: Partial<InspectionWeights> & { individual_weights?: number[] }

  // Estado de UI
  isLoading: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  error: string | null
  isDirty: boolean  // hay cambios sin guardar

  // Acciones
  startInspection: (flockId: string, flock: Flock) => Promise<void>
  resumeInspection: (inspectionId: string, flock: Flock) => void
  setSection: (section: InspectionSection) => void
  updateEnvironmental: (data: Partial<InspectionEnvironmental>) => void
  updateWater: (data: Partial<InspectionWater>) => void
  updateFeeding: (data: Partial<InspectionFeeding>) => void
  updateHealth: (data: Partial<InspectionHealth>) => void
  updateWeights: (data: Partial<InspectionWeights> & { individual_weights?: number[] }) => void
  saveCurrentSection: () => Promise<void>
  completeInspection: () => Promise<{
    score: number
    score_label: string
    alerts_generated: number
  } | null>
  reset: () => void
}

// ── ESTADO INICIAL ───────────────────────────────────────────

const initialState = {
  inspectionId: null,
  flockId: null,
  flock: null,
  completedSections: [] as InspectionSection[],
  currentSection: 'environmental' as InspectionSection,
  environmental: {},
  water: {},
  feeding: {},
  health: {},
  weights: {},
  isLoading: false,
  isSaving: false,
  lastSavedAt: null,
  error: null,
  isDirty: false,
}

// ── STORE ────────────────────────────────────────────────────

export const useInspectionStore = create<InspectionStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Iniciar nueva inspección (o retomar borrador existente)
      startInspection: async (flockId: string, flock: Flock) => {
        set({ isLoading: true, error: null })
        try {

          const res = await fetch('/api/inspections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flock_id: flockId }),
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error ?? 'Error al crear inspección')
          }

          const { data } = await res.json()
          set({
            inspectionId: data.inspection_id,
            flockId,
            flock,
            currentSection: 'environmental',
            completedSections: [],
            environmental: {},
            water: {},
            feeding: {},
            health: {},
            weights: {},
            isLoading: false,
            isDirty: false,
            lastSavedAt: null,
          })
        } catch (error) {
          set({ isLoading: false, error: (error as Error).message })
        }
      },

      resumeInspection: (inspectionId: string, flock: Flock) => {
        set({ inspectionId, flockId: flock.id, flock })
      },

      setSection: (section) => {
        const { isSaving, isDirty } = get()
        if (isSaving) return
        // Auto-save si hay cambios antes de cambiar de sección
        if (isDirty) get().saveCurrentSection()
        set({ currentSection: section })
      },

      updateEnvironmental: (data) => {
        set(s => ({
          environmental: { ...s.environmental, ...data },
          isDirty: true,
        }))
      },

      updateWater: (data) => {
        set(s => ({
          water: { ...s.water, ...data },
          isDirty: true,
        }))
      },

      updateFeeding: (data) => {
        set(s => ({
          feeding: { ...s.feeding, ...data },
          isDirty: true,
        }))
      },

      updateHealth: (data) => {
        set(s => ({
          health: { ...s.health, ...data },
          isDirty: true,
        }))
      },

      updateWeights: (data) => {
        set(s => ({
          weights: { ...s.weights, ...data },
          isDirty: true,
        }))
      },

      // Guardar la sección actual en la API
      saveCurrentSection: async () => {
        const { inspectionId, currentSection, isDirty } = get()
        if (!inspectionId || !isDirty) return

        set({ isSaving: true })

        const sectionDataMap = {
          environmental: get().environmental,
          water: get().water,
          feeding: get().feeding,
          health: get().health,
          weights: get().weights,
        }

        try {

          const res = await fetch(`/api/inspections/${inspectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              section: currentSection,
              data: sectionDataMap[currentSection],
            }),
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error ?? 'Error al guardar')
          }

          set(s => ({
            isSaving: false,
            isDirty: false,
            lastSavedAt: new Date(),
            completedSections: Array.from(new Set([...s.completedSections, currentSection])),
            error: null,
          }))
        } catch (error) {
          set({ isSaving: false, error: (error as Error).message })
        }
      },

      // Completar la inspección y calcular score
      completeInspection: async () => {
        const { inspectionId } = get()
        if (!inspectionId) return null

        // Guardar sección actual primero
        await get().saveCurrentSection()

        set({ isLoading: true, error: null })

        try {

          const res = await fetch(`/api/inspections/${inspectionId}/complete`, {
            method: 'POST',
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error ?? 'Error al completar inspección')
          }

          const { data } = await res.json()
          set({ isLoading: false })
          return data
        } catch (error) {
          set({ isLoading: false, error: (error as Error).message })
          return null
        }
      },

      reset: () => set(initialState),
    }),
    {
      name: 'avigestion-inspection-v3',
      // Solo persistir datos de las secciones (por si se cierra el navegador)
      partialize: (state) => ({
        inspectionId: state.inspectionId,
        flockId: state.flockId,
        flock: state.flock,
        currentSection: state.currentSection,
        completedSections: state.completedSections,
        environmental: state.environmental,
        water: state.water,
        feeding: state.feeding,
        health: state.health,
        weights: state.weights,
        isDirty: state.isDirty,
      }),
    }
  )
)

// ── AUTO-SAVE HOOK ───────────────────────────────────────────
// Usar en el InspectionWizard:
//   useAutoSave() — guarda automáticamente cada 30s si hay cambios

export function useAutoSave(intervalMs = 30000) {
  const { isDirty, isSaving, saveCurrentSection } = useInspectionStore()

  // En React: usar useEffect con setInterval
  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     if (isDirty && !isSaving) saveCurrentSection()
  //   }, intervalMs)
  //   return () => clearInterval(timer)
  // }, [isDirty, isSaving, intervalMs])

  return { isDirty, isSaving, saveCurrentSection }
}
