/**
 * components/home/ScoreHistorySparkline.tsx — ADR-0003 Phase 1
 *
 * A 7-day mini-history sparkline rendered with plain <View> bars —
 * NO SVG, NO Animated, NO ActivityIndicator. Each "day" is a vertical
 * bar whose height encodes the score (0-100 → 0-100% of track height).
 * This is deliberately not a chart library: the ADR-0003 primitive
 * envelope only permits View/Text/Pressable/StyleSheet on cold-mount
 * paths under iOS 26.5 hardening.
 *
 * DEFERRED MOUNT (perf + iOS 26.5 cold-mount discipline):
 *   The sparkline is *below-the-fold* on every ScoreCard, so we don't
 *   need it painted in the first frame. We render null until
 *   InteractionManager.runAfterInteractions fires — this pushes the
 *   ~7-view layout pass out of the initial mount critical path,
 *   avoiding jank on the ScoreCardGrid's first render (up to 9 cards
 *   × 7 bars = 63 nested Views on tabletLandscape).
 *
 * A11Y:
 *   - accessibilityValue exposes min / max / now so VoiceOver rotor
 *     reads the sparkline as an "adjustable" — even though it's not
 *     interactive, the rotor still announces the current value which
 *     is the most patient-useful data point.
 *   - accessibilityLabel is a caller-provided plain-English string
 *     (e.g. "Physical health trend over the last 7 days"); we do NOT
 *     synthesize it here because the domain name lives in the parent.
 *   - Bars themselves are hidden from a11y so VoiceOver hits a single
 *     stop per sparkline, not seven.
 *
 * DEFENSIVE INPUT HANDLING:
 *   - Series shorter than 7 → left-padded with a repeat of the first
 *     point so a 2-point delta still visualizes as a stable-then-jump.
 *   - Series longer than 7 → truncated to the last 7 (newest).
 *   - Values outside 0-100 → clamped, so a bad upstream value can't
 *     overflow the bar into the neighbor card.
 *   - Empty series → renders an inert same-height placeholder track
 *     (no bars) so layout doesn't jump when data arrives.
 */

import React from 'react'
import { InteractionManager, StyleSheet, View } from 'react-native'

import { ScoreBands, type ScoreBandName } from '@/constants/design-system'

const BARS = 7
const TRACK_HEIGHT = 28
const BAR_MIN_HEIGHT = 2 // never zero — a bar with 0 height reads as "missing"
const BAR_GAP = 3

export interface ScoreHistorySparklineProps {
  /**
   * Newest-last score series (0-100). Any length is accepted; the
   * component normalizes to exactly 7 bars. Non-finite values are
   * dropped BEFORE padding so a bad point doesn't turn into a
   * misleading flat bar.
   */
  series: number[]
  /** Plain-English a11y label from the parent (must include domain). */
  accessibilityLabel: string
  /**
   * Optional band to color the bars — falls back to `developing`
   * teal if omitted, which is the calmest of the four palettes and
   * therefore the safest default for a "no band yet" cold-mount.
   */
  band?: ScoreBandName
}

function normalizeSeries(input: number[]): number[] {
  // Drop non-finite BEFORE padding so `series7Day: [NaN, 74]` doesn't
  // become `[74, NaN, NaN, NaN, ...]` — it becomes `[74]` then pads
  // to seven with 74s, which reads honestly as "one known point".
  const clean = input.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (clean.length === 0) return []
  if (clean.length >= BARS) return clean.slice(clean.length - BARS)
  // Left-pad with the first value so the sparkline reads as
  // "stable, then the recent points". Better than zero-pad (which
  // reads as "you had no wellbeing five days ago").
  const pad = BARS - clean.length
  const first = clean[0]
  return [...new Array(pad).fill(first), ...clean]
}

function clamp01to100(v: number): number {
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

export function ScoreHistorySparkline({
  series,
  accessibilityLabel,
  band,
}: ScoreHistorySparklineProps): React.JSX.Element | null {
  // Deferred mount — see file header. `mounted` starts false so the
  // very first render is a cheap track-only View; the bars flip in
  // once idle. On empty series we still respect the defer so the
  // eventual empty-state doesn't paint in frame 1 either.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setMounted(true)
    })
    return () => {
      // InteractionManager returns a subscription-like with cancel();
      // guarded because the RN typings mark it as loosely typed.
      handle.cancel?.()
    }
  }, [])

  const normalized = React.useMemo(() => normalizeSeries(series), [series])
  const barColor = ScoreBands[band ?? 'developing'].fg
  const trackColor = ScoreBands[band ?? 'developing'].bg

  const current = normalized.length > 0 ? clamp01to100(normalized[normalized.length - 1]) : 0
  const min = normalized.length > 0 ? Math.min(...normalized.map(clamp01to100)) : 0
  const max = normalized.length > 0 ? Math.max(...normalized.map(clamp01to100)) : 0

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: current }}
      style={[styles.track, { backgroundColor: trackColor }]}
    >
      {mounted && normalized.length > 0
        ? normalized.map((raw, i) => {
            const v = clamp01to100(raw)
            // Height mapping: 0-100 → BAR_MIN_HEIGHT..TRACK_HEIGHT so
            // even a 0 score renders a visible 2pt nub. Consumers who
            // want "missing" to look empty should pass an empty array.
            const height = Math.max(
              BAR_MIN_HEIGHT,
              Math.round((v / 100) * TRACK_HEIGHT),
            )
            return (
              <View
                key={i}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: barColor,
                    marginLeft: i === 0 ? 0 : BAR_GAP,
                  },
                ]}
              />
            )
          })
        : null}
    </View>
  )
}

export default ScoreHistorySparkline

// -------------------------------------------------------------------
// Styles — flex row, bars align to the bottom so heights read as
// "growing up from the baseline". No transforms, no shadows.
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    // Track color set inline from ScoreBands so a band change re-
    // colors both the track (soft) and the bars (bold) in sync.
  },
  bar: {
    // Fixed width — the parent's fixed track height + 7 fixed-width
    // bars keeps geometry predictable across every viewport. Width
    // chosen so 7 bars + 6 gaps fits comfortably in a ~90pt sparkline
    // area on iPhone SE.
    width: 6,
    borderRadius: 2,
  },
})
