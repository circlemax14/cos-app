/**
 * lib/wellbeing-trend.ts — Ken 2026-08-06 (Wellbeing V2 Phase 2).
 *
 * Shared visual helpers for the wellbeing trend arrow. Hoisted out of
 * BpsWellbeingScoreCard so the Home tile (WellbeingScoreTile) + the
 * BPS surface card can't drift on icon / color / label choice.
 *
 * PURE — no React, no I/O. Just maps a `TrendArrow` symbol from
 * `lib/wellbeing-score.ts` to the MaterialIcons name, tone, color, and
 * a plain-english label suitable for a text row.
 */

import type { TrendArrow } from './wellbeing-score'

/** MaterialIcons name for the arrow direction. Kept as a string literal
 *  union so consumers get autocompletion on the icon prop. */
export function trendIconName(arrow: TrendArrow): 'trending-up' | 'trending-down' | 'trending-flat' {
  if (arrow === 'up') return 'trending-up'
  if (arrow === 'down') return 'trending-down'
  return 'trending-flat'
}

export type TrendTone = 'good' | 'bad' | 'neutral'

export function trendTone(arrow: TrendArrow): TrendTone {
  if (arrow === 'up') return 'good'
  if (arrow === 'down') return 'bad'
  return 'neutral'
}

/** Palette. Matches Ken 2026-08-06 proposal — green up / red down / grey
 *  neutral. Passes WCAG AA on both light + dark tile backgrounds. */
export const TREND_TONE_COLOR: Record<TrendTone, string> = {
  good: '#10B981',
  bad: '#DC2626',
  neutral: '#6B7280',
}

/**
 * Plain-english label for a trend row. `delta` is the SIGNED point
 * change (positive = improvement, negative = decline). Copy per the
 * V2 proposal §"Trend arrow — the rule":
 *   - "+4" when up (with sign)
 *   - "-3" when down (with sign)
 *   - "Steady" when flat (no numeric — flat means within ±3pt band,
 *     so a specific number would misrepresent the sensitivity).
 */
export function trendLabel(arrow: TrendArrow, delta: number): string {
  if (arrow === 'up') return `+${Math.abs(Math.round(delta))}`
  if (arrow === 'down') return `-${Math.abs(Math.round(delta))}`
  return 'Steady'
}

/**
 * Accessibility-friendly long label for VoiceOver / TalkBack. Reads
 * "Improving by 4 points" rather than "up 4" — clearer for AT users
 * on the compact Home tile.
 */
export function trendA11yLabel(arrow: TrendArrow, delta: number): string {
  const abs = Math.abs(Math.round(delta))
  if (arrow === 'up') return `Improving by ${abs} point${abs === 1 ? '' : 's'}`
  if (arrow === 'down') return `Down ${abs} point${abs === 1 ? '' : 's'}`
  return 'Steady — no meaningful change'
}
