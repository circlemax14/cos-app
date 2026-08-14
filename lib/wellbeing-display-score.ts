/**
 * The one place that decides which number "your wellbeing score" is.
 *
 * Extracted from WellbeingScoreTile on 2026-08-14 (SCRUM-676), when Ken asked
 * for Wellbeing and Health Age at the top of Home. That put a SECOND wellbeing
 * number on the same screen as the existing tile — and the logic is not a
 * simple field read: it prefers `composite`, and falls back to the mean of the
 * numeric catalog rows when there is no composite yet.
 *
 * Two copies of that would eventually disagree, and a patient seeing two
 * different wellbeing scores on one screen would rightly distrust both. So
 * both surfaces call this.
 */
import type { useScoreCatalog, scoreToBand as ScoreToBand } from '@/hooks/use-score-catalog'
import { scoreToBand } from '@/hooks/use-score-catalog'

export type WellbeingDisplay = {
  score: number | undefined
  band: ReturnType<typeof ScoreToBand>
}

export function pickWellbeingDisplayScore(
  catalog: ReturnType<typeof useScoreCatalog>,
): WellbeingDisplay {
  if (typeof catalog.composite === 'number' && Number.isFinite(catalog.composite)) {
    return { score: catalog.composite, band: catalog.compositeBand }
  }
  const numericRows = catalog.rows.filter(
    (r): r is typeof r & { score: number } =>
      typeof r.score === 'number' && Number.isFinite(r.score),
  )
  if (numericRows.length > 0) {
    const mean = Math.round(
      numericRows.reduce((acc, r) => acc + r.score, 0) / numericRows.length,
    )
    return { score: mean, band: scoreToBand(mean) }
  }
  return { score: undefined, band: undefined }
}
