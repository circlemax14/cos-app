/**
 * components/home/ScoreCard.tsx — ADR-0003 Phase 1 (Home Redesign)
 *
 * The composed unit tile of the Home v2 grid. Each ScoreCard shows:
 *   - Title    (e.g. "BIO", "MIND", "SOCIAL & FAITH")
 *   - Score    (large tabular-nums number, 0-100)
 *   - Delta    (7-day, tiny signed number next to the chip)
 *   - Chip     (ScoreBandChip — WCAG-AA band label)
 *   - Sparkline (ScoreHistorySparkline — 7-day mini-history)
 *
 * PRIMITIVE ENVELOPE (iOS 26.5 hardening — ADR-0003):
 *   Allowed:    View / Text / Pressable / StyleSheet
 *   Prohibited: Animated, LayoutAnimation, Portal, ActivityIndicator,
 *               gradient, blur, rotate transforms.
 *
 * A11Y ACTIONS:
 *   The card is one Pressable with `accessibilityActions=[explain, open]`
 *   so a VoiceOver user can invoke either behavior via the rotor
 *   without discovering a second on-card control. Default activate
 *   (tap / VO double-tap) fires `onOpen` — the higher-intent action.
 *   `onExplain` is available exclusively via the rotor action or a
 *   long-press hint. Both handlers are optional; the card is still
 *   render-safe with neither wired.
 *
 * COLD-MOUNT DISCIPLINE:
 *   - Numbers use adjustsFontSizeToFit + numberOfLines=1 so XXL Dynamic
 *     Type on a 320pt viewport can't overflow the tile.
 *   - fontVariant tabular-nums keeps 88→89 shifts from re-flowing the
 *     row width day-to-day.
 *   - Sparkline is deferred-mount inside its own component; the card
 *     ships a stable geometry from frame 1.
 */

import React from 'react'
import {
  type AccessibilityActionEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScoreBandChip } from '@/components/home/ScoreBandChip'
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline'
import { ScoreBands, type ScoreBandName } from '@/constants/design-system'

export interface ScoreCardProps {
  /** Human-facing domain title (uppercased at the token layer). */
  title: string
  /** Integer 0-100 or undefined (empty state). */
  score: number | undefined
  /** ScoreBands key or undefined. Drives chip + sparkline color. */
  band: ScoreBandName | undefined
  /** 7-day composite delta or undefined. */
  deltaLast7Days: number | undefined
  /** Sparse newest-last series (sparkline normalizes to 7 bars). */
  series7Day: number[]
  /** VO rotor action + long-press: "explain what this score means". */
  onExplain?: () => void
  /** Default activation (tap / VO double-tap): drill into detail. */
  onOpen?: () => void
}

const A11Y_ACTION_EXPLAIN = 'explain'
const A11Y_ACTION_OPEN = 'open'

/**
 * Format a signed 7-day delta as "+6" / "-8" / "0". Undefined input
 * returns an em dash so the card's footer row has a stable width and
 * VoiceOver never announces the empty string.
 */
function formatDelta(delta: number | undefined): string {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return '—'
  const rounded = Math.round(delta)
  if (rounded > 0) return `+${rounded}`
  return String(rounded)
}

function deltaWord(delta: number | undefined): string {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return 'no trend yet'
  const rounded = Math.round(delta)
  if (rounded > 0) return `up ${rounded} points from a week ago`
  if (rounded < 0) return `down ${Math.abs(rounded)} points from a week ago`
  return 'steady from a week ago'
}

export function ScoreCard({
  title,
  score,
  band,
  deltaLast7Days,
  series7Day,
  onExplain,
  onOpen,
}: ScoreCardProps): React.JSX.Element {
  const hasScore = typeof score === 'number' && Number.isFinite(score)
  const scoreText = hasScore ? String(Math.round(score as number)) : '—'
  const bandLabel = band ? ScoreBands[band].label : 'no band yet'
  const deltaText = formatDelta(deltaLast7Days)

  // Single-utterance a11y label so VoiceOver reads the whole tile in
  // one breath — same pattern as HeroScoreBlock.
  const a11yLabel = `${title}. Score ${
    hasScore ? scoreText : 'not available'
  } out of 100. Band: ${bandLabel}. ${deltaWord(deltaLast7Days)}.`

  const onAccessibilityAction = React.useCallback(
    (event: AccessibilityActionEvent) => {
      // AccessibilityActionEvent.nativeEvent.actionName is the string
      // registered below in accessibilityActions.
      const name = event.nativeEvent.actionName
      if (name === A11Y_ACTION_EXPLAIN) {
        onExplain?.()
        return
      }
      if (name === A11Y_ACTION_OPEN) {
        onOpen?.()
      }
    },
    [onExplain, onOpen],
  )

  const onLongPress = React.useCallback(() => {
    // Long-press falls through to explain — the second action is
    // discoverable without the VO rotor for sighted power users.
    onExplain?.()
  }, [onExplain])

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Double tap to open. Use rotor for explain."
      accessibilityActions={[
        { name: A11Y_ACTION_OPEN, label: 'Open details' },
        { name: A11Y_ACTION_EXPLAIN, label: 'Explain this score' },
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Header row: title (left) + delta (right). Delta is a tiny
          numeric so the pill+delta pair reads left-to-right as
          "band + change" without extra iconography. */}
      <View style={styles.headerRow}>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maxFontSizeMultiplier={1.5}
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </Text>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maxFontSizeMultiplier={1.5}
          numberOfLines={1}
          style={styles.delta}
        >
          {deltaText}
        </Text>
      </View>

      {/* Big score number. tabular-nums keeps day-to-day column widths
          stable so an 88→99 shift doesn't reflow the card. */}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        adjustsFontSizeToFit
        numberOfLines={1}
        maxFontSizeMultiplier={1.5}
        style={styles.score}
      >
        {scoreText}
      </Text>

      {/* Chip row */}
      <View style={styles.chipRow}>
        <ScoreBandChip band={band} />
      </View>

      {/* Sparkline — deferred mount, decorative track when empty. */}
      <View style={styles.sparklineWrap}>
        <ScoreHistorySparkline
          series={series7Day}
          band={band}
          accessibilityLabel={`${title} trend over the last 7 days`}
        />
      </View>
    </Pressable>
  )
}

export default ScoreCard

// -------------------------------------------------------------------
// Styles — static, no shadows on cold-mount paths. The 1pt border
// carries card separation instead of an elevation drop shadow (drop
// shadow on iOS 26.5 first-render is a known-bad pattern for the
// screens in memory:project_ios26_biopsychosocial_parked).
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    // Grid parent controls width; card fills its column. Fixed inner
    // padding keeps the geometry the same across all breakpoints.
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    // minHeight prevents rotation/flex reflow from shrinking the card
    // to a sub-touchable-height when the sparkline is deferred.
    minHeight: 132,
    justifyContent: 'flex-start',
  },
  cardPressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#374151',
  },
  delta: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  score: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '300',
    color: '#111827',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 22,
  },
  sparklineWrap: {
    marginTop: 4,
  },
})
