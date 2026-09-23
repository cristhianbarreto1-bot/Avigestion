// ============================================================
// AVIGESTION - Reporte PDF de Inspección Semanal
// Generado con @react-pdf/renderer (client & server-side)
// ============================================================

import {
  Document, Page, Text, View, StyleSheet, Font, Image,
  PDFDownloadLink, BlobProvider,
} from '@react-pdf/renderer'
import type { FullInspection, Flock, ActiveFlock } from '@/types'

// ── ESTILOS ──────────────────────────────────────────────────

const C = {
  dark:       '#0F172A',
  green:      '#166534',
  greenLight: '#DCFCE7',
  greenText:  '#15803D',
  teal:       '#0F766E',
  tealLight:  '#CCFBF1',
  amber:      '#B45309',
  amberLight: '#FEF3C7',
  red:        '#991B1B',
  redLight:   '#FEE2E2',
  gray:       '#475569',
  lightGray:  '#F8FAFC',
  border:     '#E2E8F0',
  white:      '#FFFFFF',
}

const styles = StyleSheet.create({
  page: {
    fontFamily:      'Helvetica',
    fontSize:        10,
    color:           C.dark,
    backgroundColor: C.white,
    padding:         40,
  },
  // Header
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   20,
    paddingBottom:  12,
    borderBottomWidth: 2,
    borderBottomColor: C.green,
  },
  headerLeft: { flexDirection: 'column' },
  headerTitle: {
    fontSize:    20,
    fontFamily:  'Helvetica-Bold',
    color:       C.dark,
  },
  headerSubtitle: {
    fontSize: 10,
    color:    C.teal,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerMeta: {
    fontSize: 9,
    color:    C.gray,
    marginTop: 2,
  },
  // Secciones
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize:        11,
    fontFamily:      'Helvetica-Bold',
    color:           C.white,
    backgroundColor: C.dark,
    padding:         '6 10',
    marginBottom:    8,
  },
  // Tarjetas de KPI
  kpiGrid: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  12,
  },
  kpiCard: {
    flex:            1,
    backgroundColor: C.lightGray,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    4,
    padding:         8,
    alignItems:      'center',
  },
  kpiValue: {
    fontSize:   18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 8,
    color:    C.gray,
    textAlign: 'center',
  },
  // Tabla
  table: {
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection:   'row',
    backgroundColor: C.dark,
    padding:         '5 8',
  },
  tableHeaderCell: {
    color:      C.white,
    fontSize:   8,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding:       '5 8',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: {
    backgroundColor: C.lightGray,
  },
  tableCell: {
    fontSize: 9,
    color:    C.dark,
  },
  // Score badge
  scoreBadge: {
    borderRadius:    4,
    padding:         '3 8',
    fontSize:        9,
    fontFamily:      'Helvetica-Bold',
    textAlign:       'center',
  },
  // Alerta
  alertBox: {
    flexDirection: 'row',
    marginBottom:  6,
    borderRadius:  4,
    overflow:      'hidden',
  },
  alertStripe: {
    width:           4,
    backgroundColor: C.red,
  },
  alertContent: {
    flex:            1,
    padding:         '6 10',
    backgroundColor: C.redLight,
  },
  alertTitle: {
    fontSize:   9,
    fontFamily: 'Helvetica-Bold',
    color:      C.red,
    marginBottom: 2,
  },
  alertBody: {
    fontSize: 8,
    color:    C.dark,
  },
  // Footer
  footer: {
    position:      'absolute',
    bottom:        20,
    left:          40,
    right:         40,
    flexDirection: 'row',
    justifyContent:'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop:    6,
  },
  footerText: {
    fontSize: 8,
    color:    C.gray,
  },
  // Gráfico de barras simple
  barChart: {
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  4,
    gap:           6,
  },
  barLabel: {
    fontSize: 8,
    color:    C.gray,
    width:    30,
    textAlign: 'right',
  },
  barTrack: {
    flex:            1,
    height:          12,
    backgroundColor: C.border,
    borderRadius:    2,
  },
  barFill: {
    height:       12,
    borderRadius: 2,
  },
  barValue: {
    fontSize: 8,
    color:    C.gray,
    width:    35,
  },
})

// ── HELPERS ──────────────────────────────────────────────────

function scoreColor(score: number) {
  return score >= 80 ? C.greenText : score >= 60 ? C.amber : C.red
}

function scoreLabel(score: number) {
  return score >= 80 ? 'Aprobado' : score >= 60 ? 'Observado' : 'Crítico'
}

function scoreBg(score: number) {
  return score >= 80 ? C.greenLight : score >= 60 ? C.amberLight : C.redLight
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ── COMPONENTES PDF ──────────────────────────────────────────

function PageHeader({
  flockCode, farmName, houseName, genetic, ageDays, reportType, generatedAt,
}: {
  flockCode: string, farmName: string, houseName: string,
  genetic: string, ageDays: number, reportType: string, generatedAt: string,
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>🐔 AviGestión</Text>
        <Text style={styles.headerSubtitle}>{reportType}</Text>
        <Text style={{ ...styles.headerMeta, marginTop: 6, fontFamily: 'Helvetica-Bold', color: C.dark, fontSize: 11 }}>
          {farmName} · {houseName}
        </Text>
        <Text style={{ ...styles.headerMeta, color: C.teal }}>
          Lote: {flockCode} · {genetic.replace('_', ' ').toUpperCase()} · Día {ageDays}
        </Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={{ fontSize: 8, color: C.gray }}>Generado el</Text>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark }}>
          {formatDate(generatedAt)}
        </Text>
        <Text style={{ ...styles.headerMeta, marginTop: 8, color: C.gray }}>Confidencial</Text>
      </View>
    </View>
  )
}

function PageFooter({ pageNum, totalPages, orgName }: {
  pageNum: number, totalPages: number, orgName: string,
}) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{orgName} — Reporte generado por AviGestión</Text>
      <Text style={styles.footerText}>Página {pageNum} de {totalPages}</Text>
    </View>
  )
}

// ── REPORTE SEMANAL DE LOTE ───────────────────────────────────

interface WeeklyReportProps {
  flock:       Flock & { house_name: string; farm_name: string; org_name: string }
  inspections: FullInspection[]   // últimas 7 inspecciones
  alerts:      { severity: string; title: string; created_at: string }[]
}

export function WeeklyFlockReport({ flock, inspections, alerts }: WeeklyReportProps) {
  const ageDays = Math.floor((Date.now() - new Date(flock.entry_date).getTime()) / 86400000)
  const avgScore = inspections.length > 0
    ? Math.round(inspections.reduce((s, i) => s + (i.total_score ?? 0), 0) / inspections.length)
    : 0
  const totalMortality = inspections.reduce((s, i) => s + (i.mortality_count ?? 0), 0)
  const mortalityPct = flock.entry_count > 0 ? (totalMortality / flock.entry_count) * 100 : 0
  const maxMortPct = Math.max(...inspections.map(i => i.mortality_pct ?? 0), 0.01)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <PageHeader
          flockCode={flock.code ?? 'Sin código'}
          farmName={flock.farm_name}
          houseName={flock.house_name}
          genetic={flock.genetic}
          ageDays={ageDays}
          reportType="Reporte Semanal de Lote"
          generatedAt={new Date().toISOString()}
        />

        {/* KPIs Resumen */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RESUMEN DE LA SEMANA</Text>
          <View style={styles.kpiGrid}>
            {[
              { label: 'Score promedio', value: `${avgScore}%`,   color: scoreColor(avgScore) },
              { label: 'Mortalidad semana', value: `${totalMortality} aves`, color: mortalityPct > 0.5 ? C.red : C.greenText },
              { label: 'Mortalidad %',   value: `${mortalityPct.toFixed(2)}%`, color: mortalityPct > 0.5 ? C.red : C.greenText },
              { label: 'Inspecciones',   value: `${inspections.length}/7`, color: C.teal },
              { label: 'Alertas generadas', value: `${alerts.length}`, color: alerts.some(a => a.severity === 'critical') ? C.red : C.amber },
              { label: 'Aves actuales', value: (flock.current_count ?? flock.entry_count).toLocaleString(), color: C.dark },
            ].map((kpi, i) => (
              <View key={i} style={styles.kpiCard}>
                <Text style={{ ...styles.kpiValue, color: kpi.color }}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabla de inspecciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HISTORIAL DE INSPECCIONES</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {['Fecha', 'Día', 'Supervisor', 'Score', 'Mortalidad', 'Temp.', 'Agua', 'Peso prom.'].map(h => (
                <Text key={h} style={{ ...styles.tableHeaderCell, flex: h === 'Supervisor' ? 2 : 1 }}>{h}</Text>
              ))}
            </View>
            {inspections.map((insp, idx) => (
              <View key={insp.id} style={{ ...styles.tableRow, ...(idx % 2 === 1 ? styles.tableRowAlt : {}) }}>
                <Text style={{ ...styles.tableCell, flex: 1 }}>{formatDate(insp.inspected_at)}</Text>
                <Text style={{ ...styles.tableCell, flex: 1 }}>D{insp.flock_age_days}</Text>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{insp.supervisor_name ?? '—'}</Text>
                <Text style={{
                  ...styles.tableCell, flex: 1, fontFamily: 'Helvetica-Bold',
                  color: scoreColor(insp.total_score ?? 0),
                }}>
                  {insp.total_score ?? '—'}%
                </Text>
                <Text style={{
                  ...styles.tableCell, flex: 1,
                  color: (insp.mortality_pct ?? 0) > 0.5 ? C.red : C.dark,
                }}>
                  {insp.mortality_pct?.toFixed(3) ?? '—'}%
                </Text>
                <Text style={{
                  ...styles.tableCell, flex: 1,
                  color: insp.environmental?.temp_in_range === false ? C.red : C.dark,
                }}>
                  {insp.environmental?.temp_actual_c ?? '—'}°C
                </Text>
                <Text style={{
                  ...styles.tableCell, flex: 1,
                  color: insp.water?.consumption_in_range === false ? C.red : C.dark,
                }}>
                  {insp.water?.consumption_liters ?? '—'}L
                </Text>
                <Text style={{ ...styles.tableCell, flex: 1 }}>
                  {insp.weight_avg_g ? `${insp.weight_avg_g}g` : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Gráfico de mortalidad diaria */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MORTALIDAD DIARIA — ÚLTIMOS 7 DÍAS</Text>
          <View style={styles.barChart}>
            {inspections.map(insp => {
              const pct = insp.mortality_pct ?? 0
              const barWidth = Math.min((pct / Math.max(maxMortPct * 1.2, 0.1)) * 100, 100)
              const barColor = pct > 1 ? C.red : pct > 0.5 ? C.amber : C.greenText
              return (
                <View key={insp.id} style={styles.barRow}>
                  <Text style={styles.barLabel}>{formatDate(insp.inspected_at).slice(0, 5)}</Text>
                  <View style={styles.barTrack}>
                    <View style={{ ...styles.barFill, width: `${barWidth}%`, backgroundColor: barColor }} />
                  </View>
                  <Text style={{ ...styles.barValue, color: barColor }}>{pct.toFixed(3)}%</Text>
                </View>
              )
            })}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {[
                { color: C.greenText, label: '≤ 0.5% — Normal' },
                { color: C.amber,     label: '0.5–1% — Atención' },
                { color: C.red,       label: '> 1% — Crítico' },
              ].map(l => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                  <Text style={{ fontSize: 7, color: C.gray }}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Alertas de la semana */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALERTAS GENERADAS EN LA SEMANA</Text>
            {alerts.slice(0, 6).map((alert, i) => {
              const isCritical = alert.severity === 'critical'
              const color = isCritical ? C.red : C.amber
              const bg    = isCritical ? C.redLight : C.amberLight
              return (
                <View key={i} style={styles.alertBox}>
                  <View style={{ ...styles.alertStripe, backgroundColor: color }} />
                  <View style={{ ...styles.alertContent, backgroundColor: bg }}>
                    <Text style={{ ...styles.alertTitle, color }}>
                      [{alert.severity.toUpperCase()}] {formatDate(alert.created_at)}
                    </Text>
                    <Text style={styles.alertBody}>{alert.title}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        <PageFooter pageNum={1} totalPages={1} orgName={flock.org_name} />
      </Page>
    </Document>
  )
}

// ── REPORTE DE CIERRE DE LOTE ─────────────────────────────────

interface ClosureReportProps {
  flock:          Flock & { house_name: string; farm_name: string; org_name: string }
  allInspections: FullInspection[]
}

export function FlockClosureReport({ flock, allInspections }: ClosureReportProps) {
  const totalDays    = flock.close_date
    ? Math.floor((new Date(flock.close_date).getTime() - new Date(flock.entry_date).getTime()) / 86400000)
    : 0
  const mortalityPct = flock.mortality_pct ?? 0
  const avgScore     = allInspections.length > 0
    ? Math.round(allInspections.reduce((s, i) => s + (i.total_score ?? 0), 0) / allInspections.length)
    : 0

  // Agrupar inspecciones por semana
  const byWeek: Record<number, FullInspection[]> = {}
  allInspections.forEach(insp => {
    const week = Math.ceil(insp.flock_age_days / 7)
    if (!byWeek[week]) byWeek[week] = []
    byWeek[week].push(insp)
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PageHeader
          flockCode={flock.code ?? 'Sin código'}
          farmName={flock.farm_name}
          houseName={flock.house_name}
          genetic={flock.genetic}
          ageDays={totalDays}
          reportType="Reporte de Cierre de Lote"
          generatedAt={flock.close_date ?? new Date().toISOString()}
        />

        {/* Datos del lote */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATOS DEL LOTE</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              {[
                ['Entrada', `${formatDate(flock.entry_date)} · ${flock.entry_count.toLocaleString()} aves`],
                ['Cierre', flock.close_date ? `${formatDate(flock.close_date)} · ${flock.close_count?.toLocaleString() ?? '—'} aves` : '—'],
                ['Duración', `${totalDays} días`],
                ['Genética', flock.genetic.replace('_', ' ').toUpperCase()],
                ['Proveedor', flock.supplier ?? 'No registrado'],
              ].map(([label, value]) => (
                <View key={label as string} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ fontSize: 9, color: C.gray, width: 80 }}>{label}:</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1 }}>{value as string}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              {[
                ['Mortalidad total', `${flock.mortality_total ?? 0} aves (${mortalityPct.toFixed(2)}%)`],
                ['Peso promedio final', flock.close_weight_g ? `${flock.close_weight_g}g` : '—'],
                ['FCR final', flock.close_fcr?.toFixed(3) ?? '—'],
                ['Score promedio', `${avgScore}% — ${scoreLabel(avgScore)}`],
                ['Total inspecciones', `${allInspections.length}`],
              ].map(([label, value]) => (
                <View key={label as string} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ fontSize: 9, color: C.gray, width: 110 }}>{label}:</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1 }}>{value as string}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Resumen por semana */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RESUMEN SEMANAL</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {['Semana', 'Días', 'Insp.', 'Score prom.', 'Mortalidad', 'Peso prom.', 'CV pesos'].map(h => (
                <Text key={h} style={{ ...styles.tableHeaderCell, flex: 1 }}>{h}</Text>
              ))}
            </View>
            {Object.entries(byWeek).map(([week, insps], idx) => {
              const avgWeekScore = Math.round(insps.reduce((s, i) => s + (i.total_score ?? 0), 0) / insps.length)
              const weekMort     = insps.reduce((s, i) => s + (i.mortality_count ?? 0), 0)
              const weekMortPct  = (weekMort / (flock.current_count ?? flock.entry_count)) * 100
              const lastWeight   = insps.filter(i => i.weight_avg_g).pop()?.weight_avg_g
              const avgCV        = insps.filter(i => i.weight_cv_pct).reduce((s, i, _, a) => s + (i.weight_cv_pct ?? 0) / a.length, 0)
              const dayRange     = `${(Number(week) - 1) * 7 + 1}–${Number(week) * 7}`

              return (
                <View key={week} style={{ ...styles.tableRow, ...(idx % 2 === 1 ? styles.tableRowAlt : {}) }}>
                  <Text style={{ ...styles.tableCell, flex: 1, fontFamily: 'Helvetica-Bold' }}>Sem. {week}</Text>
                  <Text style={{ ...styles.tableCell, flex: 1 }}>{dayRange}</Text>
                  <Text style={{ ...styles.tableCell, flex: 1 }}>{insps.length}</Text>
                  <Text style={{ ...styles.tableCell, flex: 1, color: scoreColor(avgWeekScore), fontFamily: 'Helvetica-Bold' }}>
                    {avgWeekScore}%
                  </Text>
                  <Text style={{ ...styles.tableCell, flex: 1, color: weekMortPct > 0.5 ? C.red : C.dark }}>
                    {weekMortPct.toFixed(2)}%
                  </Text>
                  <Text style={{ ...styles.tableCell, flex: 1 }}>
                    {lastWeight ? `${lastWeight}g` : '—'}
                  </Text>
                  <Text style={{ ...styles.tableCell, flex: 1, color: avgCV > 8 ? C.amber : C.dark }}>
                    {avgCV > 0 ? `${avgCV.toFixed(1)}%` : '—'}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        <PageFooter pageNum={1} totalPages={1} orgName={flock.org_name} />
      </Page>
    </Document>
  )
}

// ── BOTÓN DE DESCARGA PDF ─────────────────────────────────────

export function DownloadReportButton({
  document: doc,
  filename,
  label = 'Descargar PDF',
}: {
  document: React.ReactElement
  filename: string
  label?:   string
}) {
  return (
    <PDFDownloadLink document={doc} fileName={filename}>
      {(({ loading }: { loading: boolean }) => (
        <button disabled={loading} style={{
          display:         'flex',
          alignItems:      'center',
          gap:             8,
          background:      loading ? '#0d1810' : '#166534',
          border:          '1px solid #22c55e',
          borderRadius:    10,
          padding:         '10px 16px',
          color:           '#22c55e',
          fontSize:        13,
          fontWeight:      600,
          cursor:          loading ? 'default' : 'pointer',
          fontFamily:      'inherit',
          transition:      'all 0.2s',
        }}>
          <span>{loading ? '⟳' : '📄'}</span>
          <span>{loading ? 'Generando PDF...' : label}</span>
        </button>
      )) as unknown as React.ReactNode}
    </PDFDownloadLink>
  )
}
