/**
 * components/home/WellbeingScoreTile.tsx — SCRUM-653 (Home Redesign)
 *
 * Left half of the redesigned Home's wellbeing row. Renders the
 * patient's composite wellbeing score + band, or a "Complete a
 * check-in" empty state when no signal yet.
 *
 * DATA SOURCE:
 *   `useScoreCatalog()` — same aggregator used by ScoreCardGrid on the
 *   full HomeV2 surface, so this tile and the injected grid ALWAYS
 *   read the same composite. `catalog.composite` is authoritative when
 *   present; if the derivation exposes no composite we defensively
 *   fall back to the mean of `catalog.rows[].score`, then finally to
 *   the first row with a score. Every branch renders the SAME visual
 *   affordance so the tile size is stable across states.
 *
 * NAVIGATION:
 *   The recon confirmed NO dedicated `/Home/wellbeing-score` route
 *   exists — the composite depth-link goes to
 *   `/health-plan/bps?section=biological` today. We navigate to
 *   `/Home/wellbeing-map` on tap so the tile always lands somewhere
 *   the user can act on (the map is the composite's most natural
 *   drill-down). If a wellbeing-score route ships later, swap the
 *   route string here in one place.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5):
 *   View / Text / Pressable / MaterialIcons / StyleSheet. Reuses the
 *   shipped ScoreBandChip for the band pill.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { ScoreBandChip } from '@/components/home/ScoreBandChip'
import { useScoreCatalog, scoreToBand } from '@/hooks/use-score-catalog'
// Ken 2026-08-06 (Wellbeing V2 Phase 2) — trend arrow. Pulls the
// composite trend directly from the shared derivation hook so this
// tile and the BPS card render the identical arrow/delta.
import { useWellbeingDerivation } from '@/hooks/use-wellbeing-derivation'
import {
  trendIconName,
  trendTone,
  trendLabel,
  trendA11yLabel,
  TREND_TONE_COLOR,
} from '@/lib/wellbeing-trend'

/**
 * Derive the display score with a triple fallback so the tile always
 * shows a number when the patient has ANY signal:
 *   1. catalog.composite (authoritative from lib/wellbeing-score)
 *   2. mean of catalog.rows[].score (only rows with a number)
 *   3. first row with a defined score
 * Returns undefined only when every row is empty — the tile then
 * renders its empty state.
 */
function pickDisplayScore(catalog: ReturnType<typeof useScoreCatalog>): {
  score: number | undefined
  band: ReturnType<typeof scoreToBand>
} {
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

function WellbeingScoreTileBase(): React.JSX.Element {
  const catalog = useScoreCatalog()
  const { score, band } = pickDisplayScore(catalog)
  const isEmpty = typeof score !== 'number'

  // Ken 2026-08-06 — trend arrow reads the shared derivation directly
  // (useScoreCatalog derives the composite but doesn't expose the
  // `trend` object at its top level). Same source as BpsWellbeingScoreCard,
  // so both surfaces show the identical arrow + delta at all times.
  // TrendResult is optional — undefined when the patient doesn't yet
  // have ≥2 assessment snapshots to compute a delta, in which case we
  // render the score alone (no arrow). Never renders a stale/wrong arrow.
  const { derivation } = useWellbeingDerivation()
  const trend = derivation?.trend

  const onPress = React.useCallback(() => {
    // No dedicated `/Home/wellbeing-score` route today (recon). Map is
    // the natural composite drill-down and always lands somewhere
    // interactive. Swap this string when a score screen ships.
    router.push('/Home/wellbeing-map')
  }, [])

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isEmpty
          ? 'Wellbeing score, not available yet. Complete a check-in.'
          : `Wellbeing score, ${score} out of 100${band ? `, ${band}` : ''}${
              trend ? `. ${trendA11yLabel(trend.arrow, trend.delta)}` : ''
            }.`
      }
      accessibilityHint="Opens your wellbeing map"
      hitSlop={4}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} numberOfLines={1}>
          Wellbeing score
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={18}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {isEmpty ? (
        <View style={styles.emptyBody}>
          <Text style={styles.emptyBig} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            —
          </Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Complete a check-in
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreNumber} maxFontSizeMultiplier={1.3}>
              {score}
            </Text>
            <Text style={styles.scoreScale} maxFontSizeMultiplier={1.3}>
              /100
            </Text>
          </View>
          {trend ? (
            // Ken 2026-08-06 — trend row: colored arrow + signed delta
            // (or "Steady" when within ±3pt). Kept as a sibling row of
            // the number rather than inline with it so the number stays
            // the tile's dominant read at 42pt; the arrow is a supporting
            // detail at 13pt. Color-only cue is paired with a text label
            // (delta / "Steady") per the age-range guidance — colorblind
            // + AT users get the same information.
            <View
              style={styles.trendRow}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <MaterialIcons
                name={trendIconName(trend.arrow)}
                size={16}
                color={TREND_TONE_COLOR[trendTone(trend.arrow)]}
              />
              <Text
                style={[
                  styles.trendLabel,
                  { color: TREND_TONE_COLOR[trendTone(trend.arrow)] },
                ]}
                maxFontSizeMultiplier={1.3}
              >
                {trendLabel(trend.arrow, trend.delta)}
              </Text>
            </View>
          ) : null}
          <View style={styles.chipRow}>
            <ScoreBandChip band={band} />
          </View>
        </View>
      )}
    </Pressable>
  )
}

/**
 * Memoize on identity — no props today. The parent Home re-renders on
 * every calendar / patient / provider cache tick; `useScoreCatalog` is
 * React-Query cached under the hood so this component's projected
 * state is stable across those renders.
 */
export const WellbeingScoreTile = React.memo(WellbeingScoreTileBase)
WellbeingScoreTile.displayName = 'WellbeingScoreTile'

export default WellbeingScoreTile

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    // Card treatment matches the neighbor WellbeingMapPreview: neutral
    // background with a hairline border. No shadows — the wellbeing
    // row sits between the circle and Today's Appointments and heavy
    // shadows would fight both neighbors.
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 148,
  },
  tilePressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#11181C',
    letterSpacing: 0,
    flexShrink: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNumber: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: -1,
  },
  scoreScale: {
    fontSize: 14,
    fontWeight: '500',
    color: '#687076',
    marginLeft: 2,
  },
  chipRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  trendRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  emptyBig: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    color: '#C7CACD',
    letterSpacing: -1,
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: '#687076',
    textAlign: 'center',
  },
})
