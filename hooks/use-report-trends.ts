import { useQuery } from '@tanstack/react-query'
import { fetchProviderLabReports } from '@/services/api/providers'
import type {
  LongitudinalTrend,
  TrendDataPoint,
  LabReport,
} from '@/services/api/types'

/**
 * Pivots structured lab values from `/v1/patients/me/lab-reports` into
 * longitudinal trends grouped by metric name across every report the
 * user has.
 *
 * Why this endpoint specifically: the backend has two report-fetching
 * paths. `/v1/patients/me/reports` (the LIST endpoint) returns
 * DiagnosticReport metadata only — it does NOT resolve Observation
 * references into `results[]`. Only the detail endpoint
 * `/v1/patients/me/reports/:id` does that, via N round-trips per
 * report. The dedicated `/v1/patients/me/lab-reports` endpoint
 * (cos-backend `lab.service.ts`) is purpose-built: it lists all lab
 * DiagnosticReports for the patient AND resolves their linked
 * Observations into structured `results: LabResultValue[]` in one
 * call.
 *
 * This is the right pivot source. Our earlier SCRUM-246 attempt used
 * the wrong list endpoint and silently produced zero trends because
 * `results` was always undefined.
 *
 * Limitations: values arrive as strings, so non-numeric results
 * ("Negative", "Positive", text-only) are skipped — they can't render
 * on a line chart.
 */
export function useReportTrends() {
  return useQuery({
    queryKey: ['report-trends-v2-lab'],
    queryFn: async (): Promise<LongitudinalTrend[]> => {
      const labReports = await fetchProviderLabReports()
      return buildLabReportTrends(labReports)
    },
    staleTime: 60_000,
  })
}

export function buildLabReportTrends(reports: LabReport[]): LongitudinalTrend[] {
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
  // Strip leading qualifiers ("<", ">", "≤", "≥") — for trending we treat
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
  // Common formats: "70-100", "70 - 100", "70 to 100", "70 – 100" (en dash),
  // "70 - 100 mg/dL" (trailing unit ignored by the numeric match).
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

/**
 * Map the interpretation string into our four-state enum. The lab-reports
 * endpoint returns display text (e.g. "High", "Critical Low") because it
 * resolves the FHIR Observation interpretation through `.text` /
 * coding `.display`. We also accept raw HL7 v2 codes (H/HH/L/LL/A/AA/N)
 * for safety — different feeds expose either form.
 */
function mapInterpretation(
  raw: string | undefined | null,
): TrendDataPoint['interpretation'] | undefined {
  if (!raw) return undefined
  const trimmed = String(raw).trim()
  if (trimmed.length === 0) return undefined
  const lower = trimmed.toLowerCase()
  // Plain HL7 v2 codes
  const upper = trimmed.toUpperCase()
  if (upper === 'HH' || upper === 'LL' || upper === 'AA') return 'critical'
  if (upper === 'H' || upper === 'A') return 'high'
  if (upper === 'L') return 'low'
  if (upper === 'N') return 'normal'
  // Display text variants — order matters (critical before high/low)
  if (lower.includes('critical')) return 'critical'
  if (lower.includes('abnormal high') || lower === 'high' || lower === 'abnormal') return 'high'
  if (lower.includes('abnormal low') || lower === 'low') return 'low'
  if (lower === 'normal') return 'normal'
  return undefined
}

function computeDirection(
  points: TrendDataPoint[],
): LongitudinalTrend['trendDirection'] {
  if (points.length < 2) return 'insufficient_data'
  const first = points[0]
  const last = points[points.length - 1]
  const range = first.referenceRange
  // Same heuristic as the HealthKit trend builder — "improving" if the
  // latest point is closer to (or within) the normal range than the
  // earliest. For points with no reference range we fall back to the raw
  // delta sign which is rarely meaningful for labs, but keeps the badge
  // populated rather than always "insufficient_data".
  const distance = (v: number, r?: { low: number; high: number }): number => {
    if (!r) return Math.abs(v)
    if (v < r.low) return r.low - v
    if (v > r.high) return v - r.high
    return 0
  }
  if (range) {
    const distFirst = distance(first.value, range)
    const distLast = distance(last.value, range)
    const delta = distLast - distFirst
    const stableBand = Math.abs(first.value) * 0.05
    if (Math.abs(delta) < stableBand) return 'stable'
    return delta < 0 ? 'improving' : 'worsening'
  }
  const delta = last.value - first.value
  const stableBand = Math.abs(first.value) * 0.05
  if (Math.abs(delta) < stableBand) return 'stable'
  // Without a reference range, we can't tell direction-meaning, so just
  // call any movement "stable" to avoid misleading badges.
  return 'stable'
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
