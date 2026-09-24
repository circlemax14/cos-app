/**
 * COS-1096 — the wellbeing dial, drawn ONCE.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * Ken shared two screenshots and asked for that view on Home. They are this
 * app's own detail screens. Twice I built an approximation of them at tile
 * scale and twice it came back wrong, because the target was never a smaller
 * version of the dial — it was THE dial.
 *
 * So the stack that lives inside the ring is extracted here and rendered by
 * both app/Home/wellbeing-score.tsx and the Home hero. Not for tidiness: the
 * entire requirement is that the two agree, and two drawings of the same gauge
 * diverge the moment either is touched.
 *
 * ─── WHY IT CANNOT BE HALF-WIDTH ─────────────────────────────────────
 *
 * The detail screen sizes its dial `min(340, max(240, width - 56))` and puts
 * six things inside it: the number, `/100`, the trend, the band chip, the
 * as-of date, and on Home a title. At two-tiles-across on a phone the ring is
 * ~176px and its usable interior ~110pt. Six stacked elements do not fit in
 * 110pt at a legible size — this is geometry, not styling, and it is why the
 * Home dials are full-width and stacked rather than side by side.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { ScoreBandChip } from '@/components/home/ScoreBandChip'
import {
  trendIconName,
  trendTone,
  trendLabel,
  trendA11yLabel,
  TREND_TONE_COLOR,
} from '@/lib/wellbeing-trend'
import type { TrendArrow } from '@/lib/wellbeing-score'
import type { ScoreBandName } from '@/constants/design-system'

export interface WellbeingTrend {
  arrow: TrendArrow
  delta: number
}

export interface WellbeingDialHeroProps {
  /** The composite score, or null when there is none to place on the dial. */
  composite: number | null
  trend?: WellbeingTrend | null
  band?: ScoreBandName | null
  /** ISO timestamp the score was computed at. Omitted if unparseable. */
  computedAt?: string | null
  textColor: string
  subtextColor: string
  getScaledFontSize: (n: number) => number
  /**
   * Shown above the number. The detail screen passes nothing — its nav bar
   * already says Wellbeing Score — but on Home, where two dials sit stacked
   * with no card headers, each has to name itself.
   */
  title?: string
  /**
   * Scales every element together. 1 is the detail screen; Home passes a
   * smaller factor so the same stack fits a slightly smaller ring without
   * anything being re-tuned by hand.
   */
  scale?: number
  /**
   * COS-1097 — only what FITS inside a half-width ring.
   *
   * DialGauge lays its children out absolutely at a fixed height, so content
   * taller than the ring does not expand it — it spills out and paints over
   * whatever is below. That is exactly what shipped: two dials overlapping,
   * with "Wellbe…" and "4.6 yea…" truncated by an 18% horizontal padding that
   * leaves ~112pt of usable width.
   *
   * Compact keeps ONLY the number and its scale. Vishal, 2026-09-24: "remove
   * this Foundational and Younger text that we are trying to show within the
   * circle." The title and date already live outside it.
   *
   * ⚠️ The band is now carried by COLOUR alone inside the ring — the number
   * takes the band's foreground. That is a deliberate step back from the rule
   * this file records elsewhere (colour alone fails older patients, glare and
   * colour-blindness), taken because he asked for it. The band still has its
   * text label on the detail screen one tap away.
   */
  compact?: boolean
}

export function WellbeingDialHero({
  composite,
  trend,
  band,
  computedAt,
  textColor,
  subtextColor,
  getScaledFontSize,
  title,
  scale = 1,
  compact = false,
}: WellbeingDialHeroProps): React.JSX.Element {
  const asOf = (() => {
    if (!computedAt) return null
    const d = new Date(computedAt)
    /*
     * Omitted rather than guessed when the timestamp is unparseable: a wrong
     * date on a health figure is worse than no date. Carried over verbatim
     * from wellbeing-score.tsx, where the reasoning was first recorded.
     */
    if (Number.isNaN(d.getTime())) return null
    return `as of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  })()

  if (compact) {
    return (
      <>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.number,
              { color: textColor, fontSize: 56 * scale, lineHeight: 60 * scale },
            ]}
            numberOfLines={1}
            // Content that grows with the user's type setting is what pushes
            // it out of the ring. Capped tighter here than on the detail
            // screen, which has the room.
            maxFontSizeMultiplier={1.1}
          >
            {typeof composite === 'number' ? composite : '—'}
          </Text>
          <Text
            style={[styles.scaleLabel, { color: subtextColor, fontSize: 18 * scale }]}
            maxFontSizeMultiplier={1.1}
          >
            /100
          </Text>
        </View>
      </>
    )
  }

  return (
    <>
      {title ? (
        <Text
          style={[styles.title, { color: textColor, fontSize: getScaledFontSize(17 * scale) }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
      ) : null}

      <View style={styles.topRow}>
        <Text
          style={[
            styles.number,
            {
              color: textColor,
              fontSize: 56 * scale,
              lineHeight: 60 * scale,
            },
          ]}
          maxFontSizeMultiplier={1.3}
        >
          {typeof composite === 'number' ? composite : '—'}
        </Text>
        <Text
          style={[styles.scaleLabel, { color: subtextColor, fontSize: 18 * scale }]}
          maxFontSizeMultiplier={1.3}
        >
          /100
        </Text>
      </View>

      {trend ? (
        <View
          style={[styles.trendRow, { marginTop: 8 * scale }]}
          accessible
          accessibilityLabel={trendA11yLabel(trend.arrow, trend.delta)}
        >
          <MaterialIcons
            name={trendIconName(trend.arrow)}
            size={16 * scale}
            color={TREND_TONE_COLOR[trendTone(trend.arrow)]}
          />
          <Text
            style={[
              styles.trendLabel,
              { color: TREND_TONE_COLOR[trendTone(trend.arrow)], fontSize: 15 * scale },
            ]}
            maxFontSizeMultiplier={1.3}
          >
            {trendLabel(trend.arrow, trend.delta)}
          </Text>
        </View>
      ) : null}

      {band ? (
        <View style={[styles.chipRow, { marginTop: 10 * scale }]}>
          <ScoreBandChip band={band} />
        </View>
      ) : null}

      {asOf ? (
        <Text
          style={{
            color: subtextColor,
            fontSize: getScaledFontSize(12 * scale),
            marginTop: 6 * scale,
            textAlign: 'center',
          }}
          maxFontSizeMultiplier={1.3}
        >
          {asOf}
        </Text>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  title: {
    fontWeight: '700',
    marginBottom: 2,
  },
  topRow: {
    flexDirection: 'row',
    // Baseline, so "/100" sits on the number's foot rather than centred
    // against a 56pt figure — the detail: screen's own alignment.
    alignItems: 'baseline',
  },
  number: {
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  scaleLabel: {
    fontWeight: '500',
    marginLeft: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendLabel: {
    fontWeight: '600',
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    alignItems: 'center',
  },
})
