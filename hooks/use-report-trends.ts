import { useQuery } from '@tanstack/react-query'
import { fetchReports } from '@/services/api/reports'
import type {
  LongitudinalTrend,
  TrendDataPoint,
  Report,
  ReportResultEntry,
} from '@/services/api/types'

/**
 * Pivots the structured `results[]` data already returned by
 * `/v1/patients/me/reports` into longitudinal trends, grouped by metric
 * name across all reports the user has.
 *
 * Why this exists: the backend `/v1/patients/me/trends` endpoint only
 * computes trends from FHIR Observations directly attached to the
 * patient, and for many users our cos-integrative / cos-webhook pipeline
 * lands data as DiagnosticReports with embedded result arrays rather
 * than as standalone Observation resources. Those structured results
 * never make it into the trends endpoint, so users see an empty Clinic
 * section even when they have lab values on the Reports screen.
 *
 * This hook fills that gap entirely client-side — no backend change
 * required. The trends produced here are merged into the Clinic
 * section on the Result Trends screen.
 *
 * Limitations: report `value` and `referenceRange` arrive as strings
 * from the backend; we parse "70-100" / "70 - 100" style ranges and
 * skip results whose value isn't a parseable number ("Negative",
 * "Positive", text-only results).
 */
export function useReportTrends() {
  return useQuery({
    queryKey: ['report-trends'],
    queryFn: async (): Promise<LongitudinalTrend[]> => {
      const reports = await fetchReports()
      return buildReportTrends(reports)
    },
    staleTime: 60_000,
  })
}

export function buildReportTrends(reports: Report[]): LongitudinalTrend[] {
  type Accum = { points: TrendDataPoint[]; unit?: string }
  const byMetric = new Map<string, Accum>()

  for (const report of reports) {
    if (!report.results || report.results.length === 0) continue
    const reportDate = (report.date ?? '').trim()
    if (!reportDate) continue

    for (const result of report.results) {
      const value = parseLabValue(result.value)
      if (value === null) continue
      const refRange = parseReferenceRange(result.referenceRange)
      const interpretation = mapInterpretation(result.interpretation)
      const point: TrendDataPoint = {
        date: reportDate,
        value,
        unit: (result.unit ?? '').trim(),
        ...(refRange ? { referenceRange: refRange } : {}),
        ...(interpretation ? { interpretation } : {}),
      }
      const key = result.name.trim().toLowerCase()
      if (key.length === 0) continue
      const acc = byMetric.get(key) ?? { points: [], unit: point.unit }
      acc.points.push(point)
      if (!acc.unit && point.unit) acc.unit = point.unit
      byMetric.set(key, acc)
    }
  }

  const trends: LongitudinalTrend[] = []
  for (const [keyLower, acc] of byMetric) {
    if (acc.points.length === 0) continue
    acc.points.sort((a, b) => a.date.localeCompare(b.date))
    const displayName = titleCaseMetric(keyLower)
    const code = `report-${slugify(keyLower)}`
    trends.push({
      id: code,
      metricCode: code,
      metricName: displayName,
      category: 'lab',
      dataPoints: acc.points,
      trendDirection: computeDirection(acc.points),
      trendPeriod: '90d',
      relatedConditions: [],
      relatedMedications: [],
      source: 'fhir',
    })
  }
  return trends
}

// ─── Parsing helpers ───────────────────────────────────────────────────────

function parseLabValue(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed.length === 0) return null
  // Strip leading "<", ">", "≤", "≥" qualifiers — for trending we treat
  // them as the bare number (good-enough approximation for line charts).
  const cleaned = trimmed.replace(/^[<>≤≥]\s*/, '').replace(/,/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseReferenceRange(
  raw: string | undefined | null,
): { low: number; high: number } | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Common formats: "70-100", "70 - 100", "70 to 100", "70 – 100" (en dash)
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i)
  if (match) {
    const low = parseFloat(match[1])
    const high = parseFloat(match[2])
    if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
      return { low, high }
    }
  }
  return null
}

function mapInterpretation(
  raw: string | undefined | null,
): TrendDataPoint['interpretation'] | undefined {
  if (!raw) return undefined
  // Per HL7 v2: H/HH (high/critical high), L/LL (low/critical low),
  // A/AA (abnormal/critical abnormal), N (normal). Map to the same
  // four-state enum the trends type uses.
  const code = raw.trim().toUpperCase()
  if (code === 'HH' || code === 'LL' || code === 'AA') return 'critical'
  if (code === 'H' || code === 'A') return 'high'
  if (code === 'L') return 'low'
  if (code === 'N' || code === '') return 'normal'
  return undefined
}

function computeDirection(
  points: TrendDataPoint[],
): LongitudinalTrend['trendDirection'] {
  if (points.length < 2) return 'insufficient_data'
  const first = points[0]
  const last = points[points.length - 1]
  const range = first.referenceRange
  // Same heuristic the HealthKit trend builder uses — "improving" if the
  // latest point is closer to (or within) the normal range than the earliest.
  const distance = (v: number, r?: { low: number; high: number }): number => {
    if (!r) return 0
    if (v < r.low) return r.low - v
    if (v > r.high) return v - r.high
    return 0
  }
  const distFirst = distance(first.value, range)
  const distLast = distance(last.value, range)
  const delta = distLast - distFirst
  // Stability band: 5% of the value magnitude — anything smaller is "stable".
  const stableBand = Math.abs(first.value) * 0.05
  if (Math.abs(delta) < stableBand) return 'stable'
  return delta < 0 ? 'improving' : 'worsening'
}

function titleCaseMetric(raw: string): string {
  // "hemoglobin a1c" → "Hemoglobin A1c", "hdl cholesterol" → "HDL Cholesterol"
  const ACRONYMS = new Set(['hdl', 'ldl', 'vldl', 'ldl-c', 'hdl-c', 'rbc', 'wbc', 'mcv', 'mch', 'mchc', 'rdw', 'inr', 'pt', 'ptt', 'bun', 'tsh', 'a1c', 'crp', 'esr', 'alt', 'ast', 'alp', 'ggt', 'co2', 'spo2', 'bmi'])
  return raw
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return word.toUpperCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
