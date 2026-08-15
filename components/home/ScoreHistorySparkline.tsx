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
  /**
   * Draw the four score bands as horizontal reference zones behind the bars.
   *
   * Bevel's signature chart reads a trend AGAINST coloured ranges rather than
   * floating in an empty box, and it is the single thing that makes their
   * scores feel legible at a glance — "Turn your body's signals into clear,
   * actionable metrics". Without a reference, a bar's height only says
   * "taller than the one before it"; with one it says where you actually are.
   *
   * The band thresholds are not invented here: ScoreBands in the design system
   * already defines optimal 85-100 / developing 65-84 / foundational 40-64 /
   * initial 0-39, and those are the same numbers the hero chip reports. Drawing
   * them makes an existing rule visible instead of adding a new one.
   *
   * Opt-in, so every current caller renders byte-identically. Zones use each
   * band's own `bg` (the soft half of the WCAG-AA pair), so bars in their
   * `fg` stay legible on top of them.
   */
  showBands?: boolean
  /**
   * Draw a horizontal reference line at this point on the 0-100 axis.
   *
   * The other half of the Bevel read, for charts whose axis is NOT a
   * higher-is-better score and therefore cannot use `showBands`. Health Age is
   * the case that needs it: its axis is a projected year-gap (-10y maps to 0,
   * 0 to 50, +10y to 100) and a TALLER bar is WORSE, so band zones would state
   * the opposite of the truth. What that chart actually needs is one line —
   * where the gap is zero, i.e. your real age — because "am I above or below
   * that line" is the only question the chart is asking.
   *
   * Drawn IN FRONT of the bars, unlike the zones. A threshold that bars can
   * hide is not a threshold.
   */
  referenceAt?: number
}

function normalizeSeries(input: number[]): number[] {
  // Drop non-finite BEFORE padding so `series7Day: [NaN, 74]` doesn't
  // become `[74, NaN, NaN, NaN, ...]` — it becomes `[74]` then pads
  // to seven with 74s, which reads honestly as "one known point".
  const clean = input.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (clean.length === 0) return []
  // Longer than 7 → average into 7 buckets spanning the WHOLE window.
  //
  // This used to be `slice(-BARS)`, which silently drew only the newest 7
  // points. That was invisible while every caller passed exactly 7 days, but
  // the moment the wellbeing screen shipped a 30d/90d range toggle it became
  // a chart lying about its own axis: the "90d" option rendered the last
  // week. Averaging keeps every real reading represented and makes the range
  // toggle actually change the picture.
  if (clean.length > BARS) return downsampleToBars(clean)
  if (clean.length === BARS) return clean
  // Left-pad with the first value so the sparkline reads as
  // "stable, then the recent points". Better than zero-pad (which
  // reads as "you had no wellbeing five days ago").
  const pad = BARS - clean.length
  const first = clean[0]
  return [...new Array(pad).fill(first), ...clean]
}

/**
 * Average a >7-point series into exactly 7 contiguous buckets, oldest-first.
 *
 * Bucket boundaries are computed by proportion rather than a fixed chunk size
 * so 30 and 90 points both spread across the full track — a fixed size would
 * leave a ragged final bucket built from one or two points, which renders as
 * a spike that isn't in the data.
 *
 * Every bucket is guaranteed non-empty because the caller only reaches here
 * with length > BARS.
 */
function downsampleToBars(clean: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < BARS; i++) {
    const start = Math.floor((i * clean.length) / BARS)
    const end = Math.floor(((i + 1) * clean.length) / BARS)
    const slice = clean.slice(start, Math.max(end, start + 1))
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length)
  }
  return out
}

function clamp01to100(v: number): number {
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

/**
 * The four bands as fractions of the track, bottom-up. Derived from the same
 * 0-39 / 40-64 / 65-84 / 85-100 thresholds ScoreBands documents, so the zones
 * and the hero's band chip can never disagree.
 */
const BAND_ZONES: readonly { name: ScoreBandName; from: number; to: number }[] = [
  { name: 'initial', from: 0, to: 40 },
  { name: 'foundational', from: 40, to: 65 },
  { name: 'developing', from: 65, to: 85 },
  { name: 'optimal', from: 85, to: 100 },
]

export function ScoreHistorySparkline({
  series,
  accessibilityLabel,
  band,
  showBands = false,
  referenceAt,
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
      style={[styles.track, { backgroundColor: showBands ? 'transparent' : trackColor }]}
    >
      {/* Reference zones, behind everything. Absolutely positioned so they
          cost the flex row nothing and the bars keep their exact geometry —
          this must not move a single bar by a pixel. Decorative: the band is
          already spoken by the hero chip and by this view's own
          accessibilityValue, so announcing four coloured stripes would be
          noise. */}
      {showBands
        ? BAND_ZONES.map((z) => (
            <View
              key={z.name}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.zone,
                {
                  backgroundColor: ScoreBands[z.name].bg,
                  bottom: `${z.from}%`,
                  height: `${z.to - z.from}%`,
                },
              ]}
            />
          ))
        : null}

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

      {/* In FRONT of the bars, deliberately — a threshold bars can hide is not
          a threshold. Decorative: the value either side of it is already in
          this view's accessibilityValue and spelled out in the caption below
          the chart, so a fifth announced element would only add noise. */}
      {typeof referenceAt === 'number' ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.reference,
            {
              bottom: `${clamp01to100(referenceAt)}%`,
              backgroundColor: ScoreBands[band ?? 'developing'].fg,
            },
          ]}
        />
      ) : null}
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
    // Clips the zone stripes to the rounded track. Without this the topmost
    // and bottommost zones square off the corners.
    overflow: 'hidden',
    // Track color set inline from ScoreBands so a band change re-
    // colors both the track (soft) and the bars (bold) in sync.
  },
  zone: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  reference: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    // Legible over both the track and a bar without shouting.
    opacity: 0.55,
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
