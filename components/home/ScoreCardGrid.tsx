/**
 * components/home/ScoreCardGrid.tsx — ADR-0003 Phase 1 (Home Redesign)
 *
 * Responsive grid of ScoreCards. Column count comes from
 * HomeResponsiveProvider (via useHomeLayout — see the split-context
 * rationale in that file). This component *does not* subscribe to raw
 * dimensions; that's the whole point of the split, so rotation
 * inertial ticks don't storm-render every card.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5): View / Text / StyleSheet only.
 *   - NO LayoutAnimation (would violate the ADR-0003 envelope AND
 *     would be visually broken for Reduce Motion users).
 *   - The Reduce Motion listener below is currently defensive plumbing
 *     — if this file ever gains a layout transition, the `reduceMotion`
 *     state MUST short-circuit it. Keeping the listener wired now
 *     means enabling motion later is a one-line change, not a
 *     forgotten a11y regression.
 *
 * COLUMN GEOMETRY:
 *   Each row is a flex-row with `flexWrap`. Cards claim a fractional
 *   width computed from column count so the visual grid re-tiles on
 *   breakpoint change without measuring pixels or reflowing children.
 *   We use percentage widths (not measured pixel widths) so a rotation
 *   during a cold-mount doesn't need a second layout pass.
 *
 * DATA CONTRACT:
 *   Consumes ScoreCatalog.rows (from use-score-catalog). The grid does
 *   NOT reach into the catalog for composite / loading / empty — those
 *   belong to the enclosing screen. This keeps the grid a pure
 *   presentational primitive that a future dogfood harness can render
 *   with fixture data.
 */

import React from 'react'
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type EmitterSubscription,
} from 'react-native'

import { ScoreCard } from '@/components/home/ScoreCard'
import { useHomeLayout } from '@/components/home/HomeResponsiveProvider'
import type { ScoreRow } from '@/hooks/use-score-catalog'

export interface ScoreCardGridProps {
  /** Rows to render — one ScoreCard per row, in supplied order. */
  rows: ScoreRow[]
  /** Fires when a card's default action (tap / VO double-tap) is invoked. */
  onOpenRow?: (row: ScoreRow) => void
  /** Fires when a card's "explain" a11y action or long-press is invoked. */
  onExplainRow?: (row: ScoreRow) => void
  /** Optional empty-state string when rows.length === 0. */
  emptyStateText?: string
}

/**
 * Map column count → percentage-width string. Multi-column layouts
 * subtract a small buffer so the horizontal gap (marginRight on
 * children) doesn't push the last card in a row to a new line.
 */
function widthPctForColumns(columns: 1 | 2 | 3): DimensionValue {
  if (columns === 3) return '32%'
  if (columns === 2) return '48%'
  return '100%'
}

export function ScoreCardGrid({
  rows,
  onOpenRow,
  onExplainRow,
  emptyStateText,
}: ScoreCardGridProps): React.JSX.Element {
  const { columns } = useHomeLayout()

  // Reduce Motion — subscribed AND polled once so we catch both
  // in-session toggles and the initial value. Currently unused
  // visually (no layout transitions yet), but wired so a future
  // LayoutAnimation gate never ships without the a11y check.
  const [reduceMotion, setReduceMotion] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (!cancelled) setReduceMotion(rm)
      })
      .catch(() => {
        /* ignore — safe default is false (no reduce) */
      })
    const sub: EmitterSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (rm: boolean) => setReduceMotion(rm),
    )
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])

  // Reference the state so eslint no-unused-vars stays quiet and a
  // future consumer can see the intent. If a LayoutAnimation is added
  // later, gate it with `if (!reduceMotion) LayoutAnimation.configure...`.
  const _reduceMotionRef = reduceMotion // eslint-disable-line @typescript-eslint/no-unused-vars

  const width = widthPctForColumns(columns)

  if (rows.length === 0) {
    return (
      <View style={styles.emptyWrap} accessibilityRole="text">
        <Text style={styles.emptyText}>
          {emptyStateText ?? 'Complete a check-in to see your scores here.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View
          key={row.domain}
          // width is DimensionValue — RN accepts percentage strings.
          style={[styles.cell, { width }]}
        >
          <ScoreCard
            title={row.title}
            score={row.score}
            band={row.band}
            deltaLast7Days={row.deltaLast7Days}
            series7Day={row.series7Day}
            onOpen={onOpenRow ? () => onOpenRow(row) : undefined}
            onExplain={onExplainRow ? () => onExplainRow(row) : undefined}
          />
        </View>
      ))}
    </View>
  )
}

export default ScoreCardGrid

// -------------------------------------------------------------------
// Styles — flex-row wrap. Gaps via child margins (RN `gap` on Views
// is supported on newer RN but we sidestep it for iOS 26.5 caution,
// mirroring the HeroScoreBlock discipline).
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Negative marginRight compensates for the child's marginRight so
    // the grid edge aligns cleanly with its parent's padding.
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  cell: {
    // Vertical stack gap between rows.
    marginBottom: 12,
    // Small horizontal breathing room between cards in multi-col.
    marginRight: 8,
  },
  emptyWrap: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
  },
})
