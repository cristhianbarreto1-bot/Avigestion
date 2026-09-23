// ============================================================
// AVIGESTION - Tipos del dominio
// Alineados 1:1 con supabase/migrations/001_initial_schema.sql
// (y columnas agregadas en 003/004). Si cambia el esquema,
// actualizar acá.
// ============================================================

// ── ENUMS ───────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'veterinarian' | 'supervisor' | 'viewer'
export type SubscriptionPlan = 'trial' | 'basic' | 'professional' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused'
export type FlockGenetic = 'cobb_500' | 'ross_308' | 'ross_708' | 'hubbard' | 'other'
export type FlockType = 'broiler' | 'layer' | 'breeder'
export type FlockStatus = 'incoming' | 'active' | 'closed' | 'emergency'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type InspectionStatus = 'draft' | 'completed' | 'reviewed'
export type ThermalStatus =
  | 'FRIO_CRITICO' | 'FRIO' | 'FRESCO' | 'CONFORT'
  | 'CALIDO' | 'CALOR' | 'ESTRES_TERMICO'

// ── ORGANIZACIÓN Y USUARIOS ─────────────────────────────────

export interface Organization {
  id: string
  name: string
  slug: string
  country: string
  currency: string
  timezone: string
  logo_url: string | null
  phone: string | null
  address: string | null
  tax_id: string | null
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Subscription {
  id: string
  organization_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  max_farms: number
  max_houses: number
  max_users: number
  features: Record<string, boolean>
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  mp_preapproval_id: string | null
  price_usd: number | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  organization_id: string | null
  role: UserRole
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  is_active: boolean
  last_login_at: string | null
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── GRANJAS, GALPONES, LOTES ────────────────────────────────

export interface Farm {
  id: string
  organization_id: string
  name: string
  code: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  altitude_m: number | null
  manager_name: string | null
  manager_phone: string | null
  notes: string | null
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface House {
  id: string
  farm_id: string
  organization_id: string
  name: string
  number: number | null
  capacity: number | null
  area_m2: number | null
  length_m: number | null
  width_m: number | null
  ventilation_type: string | null
  has_ac: boolean | null
  has_heating: boolean | null
  drinker_type: string | null
  feeder_type: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Flock {
  id: string
  house_id: string
  organization_id: string
  code: string | null
  batch_number: number | null
  genetic: FlockGenetic
  flock_type: FlockType
  status: FlockStatus
  entry_date: string
  entry_count: number
  entry_weight_g: number | null
  supplier: string | null
  target_weight_g: number | null
  target_age_days: number | null
  feed_program: string | null
  close_date: string | null
  close_count: number | null
  close_weight_g: number | null
  close_fcr: number | null
  mortality_total: number | null
  mortality_pct: number | null
  current_count: number | null
  current_age_days: number | null
  last_inspection_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Fila de la vista v_active_flocks */
export interface ActiveFlock {
  id: string
  code: string | null
  genetic: FlockGenetic
  flock_type: FlockType
  status: FlockStatus
  entry_date: string
  entry_count: number
  current_count: number | null
  age_days: number
  last_inspection_at: string | null
  organization_id: string
  house_name: string
  house_id: string
  farm_name: string
  farm_id: string
  total_mortality: number
  mortality_pct: number | null
}

// ── INSPECCIONES ────────────────────────────────────────────

export interface Inspection {
  id: string
  flock_id: string
  organization_id: string
  supervisor_id: string
  inspected_at: string
  flock_age_days: number
  status: InspectionStatus
  total_score: number | null
  score_label: string | null
  mortality_count: number
  mortality_pct: number | null
  weights_taken: boolean | null
  weight_avg_g: number | null
  weight_stddev: number | null
  weight_cv_pct: number | null
  weight_uniformity_pct: number | null
  general_notes: string | null
  images: string[] | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface InspectionEnvironmental {
  id: string
  inspection_id: string
  temp_actual_c: number | null
  temp_standard_c: number | null
  temp_in_range: boolean | null
  temp_zones: Record<string, number> | null
  humidity_pct: number | null
  humidity_in_range: boolean | null
  ammonia_ppm: number | null
  co2_ppm: number | null
  litter_condition: number | null
  litter_humidity_pct: number | null
  litter_notes: string | null
  ventilation_ok: boolean | null
  inlet_openings_ok: boolean | null
  // Agregadas en 003_thermal_comfort
  air_velocity_ms: number | null
  effective_temp_c: number | null
  magic_sum: number | null
  thermal_status: ThermalStatus | null
  section_score: number | null
  notes: string | null
}

export interface InspectionWater {
  id: string
  inspection_id: string
  consumption_liters: number | null
  consumption_standard: number | null
  consumption_in_range: boolean | null
  water_temp_c: number | null
  pressure_ok: boolean | null
  ph_level: number | null
  chlorine_ppm: number | null
  drinkers_clean: boolean | null
  drinker_height_ok: boolean | null
  drinker_count_ok: boolean | null
  section_score: number | null
  notes: string | null
}

export interface InspectionFeeding {
  id: string
  inspection_id: string
  feed_consumed_kg: number | null
  feed_type: string | null
  distribution_uniform: boolean | null
  feeder_height_ok: boolean | null
  feeder_count_ok: boolean | null
  feed_quality_ok: boolean | null
  feed_storage_ok: boolean | null
  mold_detected: boolean | null
  pests_detected: boolean | null
  section_score: number | null
  notes: string | null
}

export interface InspectionHealth {
  id: string
  inspection_id: string
  dead_count: number
  culled_count: number
  signs_respiratory: boolean | null
  signs_digestive: boolean | null
  signs_nervous: boolean | null
  signs_locomotion: boolean | null
  signs_skin: boolean | null
  signs_ocular: boolean | null
  signs_other: string | null
  behavior_normal: boolean | null
  activity_level: number | null
  distribution_uniform: boolean | null
  vocalization_normal: boolean | null
  medication_active: boolean | null
  medication_detail: string | null
  section_score: number | null
  notes: string | null
}

export interface InspectionWeights {
  id: string
  inspection_id: string
  sample_size: number | null
  standard_weight_g: number | null
  avg_weight_g: number | null
  min_weight_g: number | null
  max_weight_g: number | null
  stddev_g: number | null
  cv_pct: number | null
  uniformity_pct: number | null
  weight_vs_standard: number | null
  individual_weights: number[]
  uniformity_causes: string[] | null
  section_score: number | null
  notes: string | null
}

/** Inspección con todas sus secciones y nombres resueltos */
export interface FullInspection extends Inspection {
  environmental: InspectionEnvironmental | null
  water: InspectionWater | null
  feeding: InspectionFeeding | null
  health: InspectionHealth | null
  weights: InspectionWeights | null
  supervisor_name?: string | null
  flock_code?: string | null
  house_name?: string | null
  farm_name?: string | null
}

// ── ALERTAS Y SCORING ───────────────────────────────────────

export interface Alert {
  id: string
  organization_id: string
  flock_id: string | null
  inspection_id: string | null
  severity: AlertSeverity
  status: AlertStatus
  category: string
  title: string
  description: string | null
  recommended_action: string | null
  trigger_value: number | null
  trigger_threshold: number | null
  assigned_to: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  notified_users: string[]
  push_sent_at: string | null
  email_sent_at: string | null
  created_at: string
  updated_at: string
}

export interface ScoreAlert {
  category: string
  severity: AlertSeverity
  title: string
  description: string
  recommended_action: string
  trigger_value?: number
  trigger_threshold?: number
}

export interface InspectionScoreResult {
  environmental_score: number
  water_score: number
  feeding_score: number
  health_score: number
  weights_score: number
  total_score: number
  score_label: string
  alerts: ScoreAlert[]
}

export interface GeneticStandard {
  id: number
  genetic: FlockGenetic
  age_days: number
  weight_g: number
  weight_min_g: number | null
  weight_max_g: number | null
  water_ml_per_bird: number | null
  temp_min_c: number | null
  temp_max_c: number | null
  feed_g_per_bird: number | null
}

// ── DASHBOARD Y PAGINACIÓN ──────────────────────────────────

export interface FarmSummary {
  farm_id: string
  farm_name: string
  active_flocks: number
  open_alerts: number
  last_inspection_at: string | null
}

export interface DashboardKPIs {
  organization_id: string
  active_flocks: number
  total_active_birds: number
  avg_mortality_7d: number
  open_alerts: number
  critical_alerts: number
  inspections_today: number
  avg_score_7d: number
  farms_summary: FarmSummary[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}
