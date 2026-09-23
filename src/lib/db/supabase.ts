// ============================================================
// AVIGESTION - Supabase Client & DB Helpers
// ============================================================
// Instalación requerida:
//   npm install @supabase/supabase-js @supabase/ssr
// Variables de entorno (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
//   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (solo server-side)
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type {
  Organization, Profile, Farm, House, Flock,
  Inspection, FullInspection, ActiveFlock,
  GeneticStandard, FlockGenetic, DashboardKPIs,
  PaginatedResponse,
} from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente para el browser (con RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin (bypass RLS — solo usar en server-side)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- AUTH HELPERS -----------------------------------------

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return data;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  return data;
}

// ---- FARMS ------------------------------------------------

export async function getFarms(orgId: string): Promise<Farm[]> {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export async function getFarmWithHouses(farmId: string) {
  const { data, error } = await supabase
    .from('farms')
    .select(`
      *,
      houses (
        *,
        flocks (
          id, code, genetic, status, entry_date, entry_count, current_count,
          last_inspection_at
        )
      )
    `)
    .eq('id', farmId)
    .is('deleted_at', null)
    .single();

  if (error) throw error;
  return data;
}

// ---- FLOCKS -----------------------------------------------

export async function getActiveFlocks(orgId: string): Promise<ActiveFlock[]> {
  const { data, error } = await supabase
    .from('v_active_flocks')
    .select('*')
    .eq('organization_id', orgId)
    .order('entry_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActiveFlock[];
}

export async function getFlockById(flockId: string): Promise<Flock | null> {
  const { data, error } = await supabase
    .from('flocks')
    .select('*')
    .eq('id', flockId)
    .single();

  if (error) return null;
  return data;
}

export async function createFlock(flock: Omit<Flock, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Flock> {
  const { data, error } = await supabase
    .from('flocks')
    .insert({ ...flock, current_count: flock.entry_count })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function closeFlock(flockId: string, closeData: {
  close_date: string;
  close_count: number;
  close_weight_g: number;
  close_fcr: number;
  notes?: string;
}): Promise<void> {
  const flock = await getFlockById(flockId);
  if (!flock) throw new Error('Lote no encontrado');

  const mortalityTotal = flock.entry_count - closeData.close_count;
  const mortalityPct = (mortalityTotal / flock.entry_count) * 100;

  const { error } = await supabase
    .from('flocks')
    .update({
      status: 'closed',
      ...closeData,
      mortality_total: mortalityTotal,
      mortality_pct: mortalityPct,
    })
    .eq('id', flockId);

  if (error) throw error;
}

// ---- INSPECTIONS ------------------------------------------

export async function getInspectionsByFlock(
  flockId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<Inspection>> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('inspections')
    .select('*', { count: 'exact' })
    .eq('flock_id', flockId)
    .order('inspected_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
    has_more: (count ?? 0) > to + 1,
  };
}

export async function getFullInspection(inspectionId: string): Promise<FullInspection | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select(`
      *,
      inspection_environmental (*),
      inspection_water (*),
      inspection_feeding (*),
      inspection_health (*),
      inspection_weights (*),
      profiles!supervisor_id (full_name),
      flocks (code, houses (name, farms (name)))
    `)
    .eq('id', inspectionId)
    .single();

  if (error) return null;

  return {
    ...data,
    environmental: data.inspection_environmental,
    water: data.inspection_water,
    feeding: data.inspection_feeding,
    health: data.inspection_health,
    weights: data.inspection_weights,
    supervisor_name: data.profiles?.full_name,
    flock_code: data.flocks?.code,
    house_name: data.flocks?.houses?.name,
    farm_name: data.flocks?.houses?.farms?.name,
  } as FullInspection;
}

export async function createInspection(
  inspectionData: Omit<Inspection, 'id' | 'created_at' | 'updated_at'>,
): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .insert(inspectionData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveInspectionSection(
  table: 'inspection_environmental' | 'inspection_water' | 'inspection_feeding' | 'inspection_health' | 'inspection_weights',
  sectionData: Record<string, unknown>,
): Promise<void> {
  // Upsert por inspection_id (solo puede haber 1 por inspección)
  const { error } = await supabase
    .from(table)
    .upsert(sectionData, { onConflict: 'inspection_id' });

  if (error) throw error;
}

export async function completeInspection(
  inspectionId: string,
  scoreResult: { total_score: number; score_label: string },
): Promise<void> {
  const { error } = await supabase
    .from('inspections')
    .update({
      status: 'completed',
      total_score: scoreResult.total_score,
      score_label: scoreResult.score_label,
    })
    .eq('id', inspectionId);

  if (error) throw error;
}

// ---- ALERTS -----------------------------------------------

export async function getOpenAlerts(orgId: string) {
  const { data, error } = await supabase
    .from('alerts')
    .select('*, flocks(code), profiles!assigned_to(full_name)')
    .eq('organization_id', orgId)
    .in('status', ['open', 'acknowledged'])
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createAlerts(alerts: {
  organization_id: string;
  flock_id?: string;
  inspection_id?: string;
  severity: string;
  category: string;
  title: string;
  description?: string;
  recommended_action?: string;
  trigger_value?: number;
  trigger_threshold?: number;
}[]): Promise<void> {
  if (!alerts.length) return;
  const { error } = await supabase.from('alerts').insert(alerts);
  if (error) throw error;
}

export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'acknowledged', acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) throw error;
}

// ---- GENETIC STANDARDS ------------------------------------

export async function getGeneticStandards(genetic: FlockGenetic): Promise<GeneticStandard[]> {
  const { data, error } = await supabase
    .from('genetic_standards')
    .select('*')
    .eq('genetic', genetic)
    .order('age_days');

  if (error) throw error;
  return data ?? [];
}

export async function getStandardForAge(
  genetic: FlockGenetic,
  ageDays: number,
): Promise<GeneticStandard | null> {
  // Buscar el estándar más cercano a la edad actual
  const { data } = await supabase
    .from('genetic_standards')
    .select('*')
    .eq('genetic', genetic)
    .lte('age_days', ageDays)
    .order('age_days', { ascending: false })
    .limit(1)
    .single();

  return data;
}

// ---- DASHBOARD --------------------------------------------

export async function getDashboardKPIs(orgId: string): Promise<DashboardKPIs> {
  // Query paralelas para performance
  const [activeFlocks, openAlerts, todayInspections] = await Promise.all([
    supabase
      .from('v_active_flocks')
      .select('id, current_count, farm_id, farm_name, last_inspection_at')
      .eq('organization_id', orgId),
    supabase
      .from('alerts')
      .select('id, severity')
      .eq('organization_id', orgId)
      .in('status', ['open', 'acknowledged']),
    supabase
      .from('inspections')
      .select('id, total_score')
      .eq('organization_id', orgId)
      .gte('inspected_at', new Date().toISOString().split('T')[0]),
  ]);

  const flocks = activeFlocks.data ?? [];
  const alerts = openAlerts.data ?? [];
  const inspections = todayInspections.data ?? [];

  const totalBirds = flocks.reduce((sum, f) => sum + (f.current_count ?? 0), 0);
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;

  // Agrupar por granja
  const farmMap = new Map<string, {
    farm_id: string;
    farm_name: string;
    active_flocks: number;
    open_alerts: number;
    last_inspection_at: string | null;
  }>();

  flocks.forEach(f => {
    if (!farmMap.has(f.farm_id)) {
      farmMap.set(f.farm_id, {
        farm_id: f.farm_id,
        farm_name: f.farm_name,
        active_flocks: 0,
        open_alerts: 0,
        last_inspection_at: null,
      });
    }
    const farm = farmMap.get(f.farm_id)!;
    farm.active_flocks++;
    if (f.last_inspection_at &&
      (!farm.last_inspection_at || f.last_inspection_at > farm.last_inspection_at)) {
      farm.last_inspection_at = f.last_inspection_at;
    }
  });

  const avgScore = inspections.length > 0
    ? inspections.reduce((sum, i) => sum + (i.total_score ?? 0), 0) / inspections.length
    : 0;

  return {
    organization_id: orgId,
    active_flocks: flocks.length,
    total_active_birds: totalBirds,
    avg_mortality_7d: 0, // TODO: calcular con query histórica
    open_alerts: alerts.length,
    critical_alerts: criticalAlerts,
    inspections_today: inspections.length,
    avg_score_7d: Math.round(avgScore),
    farms_summary: Array.from(farmMap.values()),
  };
}
