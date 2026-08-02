/**
 * lib/readiness-explain-prompt.ts — SCRUM-639
 *
 * Pure helper that turns a ReadinessScore into a first-person prompt
 * the AI health chat can act on. The prompt is grounded in the day's
 * ACTUAL inputs (drivers array) so the AI's answer is explainable and
 * auditable — the exact metrics that moved the score are named in the
 * prompt itself, not left for the AI to invent.
 *
 * PHI SAFETY: prompt contains only numeric readings (HRV ms, sleep h,
 * resting HR bpm, resp rate bpm) + the composite score. No patient
 * name, no identifiers, no free-text notes. Same PHI envelope as the
 * chat's other prefills.
 */

import type { ReadinessScore, ReadinessDriver } from './readiness-score'

const METRIC_LABEL: Record<ReadinessDriver['metric'], string> = {
  hrv: 'Heart rate variability',
  sleep: 'Sleep',
  restingHr: 'Resting heart rate',
  respRate: 'Respiratory rate',
}

const METRIC_UNIT: Record<ReadinessDriver['metric'], string> = {
  hrv: 'ms',
  sleep: 'hours',
  restingHr: 'bpm',
  respRate: 'breaths/min',
}

/**
 * Format a driver as a short human-readable line. Includes the metric's
 * name, today's raw value (delta + baseline mean = today), subscore,
 * and direction. AI reads this + the composite to explain.
 */
function formatDriver(d: ReadinessDriver): string {
  const label = METRIC_LABEL[d.metric]
  const unit = METRIC_UNIT[d.metric]
  const dir =
    d.direction === 'above'
      ? `+${d.delta}${unit === 'ms' ? 'ms' : unit} above baseline`
      : d.direction === 'below'
        ? `${d.delta}${unit === 'ms' ? 'ms' : unit} below baseline`
        : 'at baseline'
  return `- ${label} (subscore ${d.subscore}/100): ${dir}`
}

/**
 * Build the "Why is my readiness score X?" prompt. Returns undefined
 * when there's nothing to explain (no composite score computed yet).
 */
export function buildReadinessExplainPrompt(score: ReadinessScore): string | undefined {
  if (typeof score.composite !== 'number' || score.drivers.length === 0) {
    return undefined
  }
  const composite = score.composite
  const band = score.band ? ` (${score.band})` : ''
  const baselineNote =
    score.state === 'warming-up'
      ? ` My personal baseline is still learning — only ${score.baselineDays} of 14 days collected so far, so treat the number with some caution.`
      : ''

  const driverLines = score.drivers.map(formatDriver).join('\n')

  return [
    `Why is my Daily Readiness score ${composite}/100${band} today?`,
    ``,
    `Here are the inputs that contributed:`,
    driverLines,
    ``,
    `Please explain in one short paragraph which factors moved the score the most today, and (if any) one small thing I could try tomorrow that fits what my body is showing.${baselineNote}`,
  ].join('\n')
}
