// ============================================================
// AVIGESTION - Schemas de Validación (Zod)
// Validación type-safe para todos los inputs de la API
// ============================================================

import { z } from 'zod'

// ── HELPERS ─────────────────────────────────────────────────

const uuid = z.string().uuid()
const positiveInt = z.number().int().positive()
const percentage = z.number().min(0).max(100)
const optionalText = z.string().max(2000).optional()

// ── ORGANIZATION ─────────────────────────────────────────────

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  country: z.string().length(2).default('AR'),
  currency: z.string().length(3).default('ARS'),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
  phone: z.string().max(30).optional(),
  address: optionalText,
  tax_id: z.string().max(50).optional(),
})

// ── FARM ─────────────────────────────────────────────────────

export const CreateFarmSchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().max(50).optional(),
  address: optionalText,
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  altitude_m: z.number().int().optional(),
  manager_name: z.string().max(255).optional(),
  manager_phone: z.string().max(30).optional(),
  notes: optionalText,
})

export const UpdateFarmSchema = CreateFarmSchema.partial()

// ── HOUSE ────────────────────────────────────────────────────

export const CreateHouseSchema = z.object({
  farm_id: uuid,
  name: z.string().min(1).max(100),
  number: z.number().int().positive().optional(),
  capacity: positiveInt.optional(),
  area_m2: z.number().positive().optional(),
  length_m: z.number().positive().optional(),
  width_m: z.number().positive().optional(),
  ventilation_type: z.enum(['tunnel', 'cross', 'natural']).optional(),
  has_ac: z.boolean().default(false),
  has_heating: z.boolean().default(true),
  drinker_type: z.enum(['nipple', 'bell', 'pan']).optional(),
  feeder_type: z.enum(['pan', 'tube', 'chain']).optional(),
  notes: optionalText,
})

// ── FLOCK ────────────────────────────────────────────────────

export const CreateFlockSchema = z.object({
  house_id: uuid,
  code: z.string().max(100).optional(),
  genetic: z.enum(['cobb_500', 'ross_308', 'ross_708', 'hubbard', 'other']),
  flock_type: z.enum(['broiler', 'layer', 'breeder']).default('broiler'),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entry_count: positiveInt,
  entry_weight_g: z.number().positive().optional(),
  supplier: z.string().max(255).optional(),
  target_weight_g: z.number().positive().optional(),
  target_age_days: z.number().int().min(28).max(84).default(42),
  feed_program: z.string().max(100).optional(),
  notes: optionalText,
})

export const CloseFlockSchema = z.object({
  close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close_count: positiveInt,
  close_weight_g: z.number().positive(),
  close_fcr: z.number().min(1).max(5),
  notes: optionalText,
})

// ── INSPECTION ───────────────────────────────────────────────

export const EnvironmentalSectionSchema = z.object({
  temp_actual_c: z.number().min(-10).max(50).optional(),
  temp_standard_c: z.number().min(-10).max(50).optional(),
  temp_in_range: z.boolean().optional(),
  temp_zones: z.record(z.number()).optional(),
  humidity_pct: z.number().int().min(0).max(100).optional(),
  humidity_in_range: z.boolean().optional(),
  ammonia_ppm: z.number().int().min(0).max(200).optional(),
  co2_ppm: z.number().int().min(0).max(10000).optional(),
  litter_condition: z.number().int().min(1).max(5).optional(),
  litter_humidity_pct: z.number().int().min(0).max(100).optional(),
  litter_notes: optionalText,
  ventilation_ok: z.boolean().optional(),
  inlet_openings_ok: z.boolean().optional(),
  notes: optionalText,
})

export const WaterSectionSchema = z.object({
  consumption_liters: z.number().positive().optional(),
  consumption_standard: z.number().positive().optional(),
  consumption_in_range: z.boolean().optional(),
  water_temp_c: z.number().min(0).max(50).optional(),
  pressure_ok: z.boolean().optional(),
  ph_level: z.number().min(0).max(14).optional(),
  chlorine_ppm: z.number().min(0).max(10).optional(),
  drinkers_clean: z.boolean().optional(),
  drinker_height_ok: z.boolean().optional(),
  drinker_count_ok: z.boolean().optional(),
  notes: optionalText,
})

export const FeedingSectionSchema = z.object({
  feed_consumed_kg: z.number().positive().optional(),
  feed_type: z.string().max(100).optional(),
  distribution_uniform: z.boolean().optional(),
  feeder_height_ok: z.boolean().optional(),
  feeder_count_ok: z.boolean().optional(),
  feed_quality_ok: z.boolean().optional(),
  feed_storage_ok: z.boolean().optional(),
  mold_detected: z.boolean().default(false),
  pests_detected: z.boolean().default(false),
  notes: optionalText,
})

export const HealthSectionSchema = z.object({
  dead_count: z.number().int().min(0).default(0),
  culled_count: z.number().int().min(0).default(0),
  signs_respiratory: z.boolean().default(false),
  signs_digestive: z.boolean().default(false),
  signs_nervous: z.boolean().default(false),
  signs_locomotion: z.boolean().default(false),
  signs_skin: z.boolean().default(false),
  signs_ocular: z.boolean().default(false),
  signs_other: optionalText,
  behavior_normal: z.boolean().default(true),
  activity_level: z.number().int().min(1).max(5).optional(),
  distribution_uniform: z.boolean().optional(),
  vocalization_normal: z.boolean().default(true),
  medication_active: z.boolean().default(false),
  medication_detail: optionalText,
  notes: optionalText,
})

export const WeightsSectionSchema = z.object({
  sample_size: positiveInt.optional(),
  individual_weights: z.array(z.number().positive()).min(1).optional(),
  notes: optionalText,
}).refine(
  data => data.sample_size || (data.individual_weights && data.individual_weights.length > 0),
  { message: 'Se requiere sample_size o individual_weights' }
)

export const CreateInspectionSchema = z.object({
  flock_id: uuid,
  inspected_at: z.string().datetime().optional(),
  general_notes: optionalText,
  images: z.array(z.string().url()).max(10).default([]),
  // Secciones opcionales al crear (se van guardando mientras el supervisor avanza)
  environmental: EnvironmentalSectionSchema.optional(),
  water: WaterSectionSchema.optional(),
  feeding: FeedingSectionSchema.optional(),
  health: HealthSectionSchema.optional(),
  weights: WeightsSectionSchema.optional(),
})

export const UpdateInspectionSectionSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('environmental'), data: EnvironmentalSectionSchema }),
  z.object({ section: z.literal('water'), data: WaterSectionSchema }),
  z.object({ section: z.literal('feeding'), data: FeedingSectionSchema }),
  z.object({ section: z.literal('health'), data: HealthSectionSchema }),
  z.object({ section: z.literal('weights'), data: WeightsSectionSchema }),
])

// ── ALERT ────────────────────────────────────────────────────

export const AcknowledgeAlertSchema = z.object({
  notes: optionalText,
})

export const ResolveAlertSchema = z.object({
  resolution_notes: z.string().min(10).max(1000),
})

// ── AUTH / ONBOARDING ────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'La contraseña debe tener mayúsculas, minúsculas y números'
  ),
  full_name: z.string().min(2).max(255),
})

export const OnboardingSchema = z.object({
  org_name: z.string().min(2).max(255),
  org_country: z.string().length(2).default('AR'),
  org_tax_id: z.string().max(50).optional(),
  first_farm_name: z.string().min(2).max(255),
  first_farm_city: z.string().max(100).optional(),
  first_farm_province: z.string().max(100).optional(),
})

// ── TYPES INFERIDOS ──────────────────────────────────────────

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>
export type CreateFarmInput = z.infer<typeof CreateFarmSchema>
export type CreateHouseInput = z.infer<typeof CreateHouseSchema>
export type CreateFlockInput = z.infer<typeof CreateFlockSchema>
export type CloseFlockInput = z.infer<typeof CloseFlockSchema>
export type CreateInspectionInput = z.infer<typeof CreateInspectionSchema>
export type UpdateInspectionSectionInput = z.infer<typeof UpdateInspectionSectionSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type OnboardingInput = z.infer<typeof OnboardingSchema>
