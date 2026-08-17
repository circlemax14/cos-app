/**
 * The segmented ring on each biomarker row.
 *
 * ─── WHAT CHANGED, AND WHY ───────────────────────────────────────────
 *
 * The first version drew ONE arc whose length was data completeness. Honest,
 * but it spent a whole ring on a single number and left the reference's second
 * colour unexplained. The reference splits one track between two colours, and
 * that split is where the meaning lives.
 *
 * So the track now divides three ways, every piece computed from data we
 * already hold per member (see splitGroup in lib/health-age-presentation):
 *
 *   green  — measured, pulling the age DOWN
 *   amber  — measured, pulling it UP
 *   grey   — no current reading; the ring stays open by that much
 *
 * The grey is the actionable part: an open ring means a test is missing, not
 * that a result is bad.
 *
 * ─── WHAT IT STILL DOES NOT ENCODE ───────────────────────────────────
 *
 * Segment LENGTH is a count of markers, not a magnitude. Scaling length by
 * years-contributed would need a normal range per analyte to divide against
 * and we have none — a −5.4 year contribution has no natural ceiling, so any
 * length would be invented. Magnitude stays in the words beside the ring,
 * which can say "5.4 years younger" precisely.
 */

import React from 'react'
import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

export interface MarkerRingProps {
  /** Fraction of the group's markers that are measured and helping. */
  helping: number
  /** Fraction measured and hurting. */
  hurting: number
  helpingColor: string
  hurtingColor: string
  /** The unmeasured remainder, and the ring's resting colour. */
  trackColor: string
  /** Thin inner ring echoing the outer one, as in the reference. */
  innerColor: string
  iconColor: string
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  size?: number
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

export function MarkerRing({
  helping,
  hurting,
  helpingColor,
  hurtingColor,
  trackColor,
  innerColor,
  iconColor,
  icon,
  size = 48,
}: MarkerRingProps): React.JSX.Element {
  const stroke = size * 0.1
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  const h = clamp01(helping)
  // Never let rounding push the two segments past a full turn.
  const u = clamp01(Math.min(hurting, 1 - h))

  const innerR = r - stroke * 1.15
  const innerStroke = Math.max(1.5, stroke * 0.42)

  // Start at 12 o'clock, where a person expects a ring to begin.
  const spin = `rotate(-90 ${size / 2} ${size / 2})`

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* The unmeasured remainder — a full track the segments sit on. */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />

        {/* Helping, from 12 o'clock clockwise. */}
        {h > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={helpingColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * h} ${c}`}
            transform={spin}
          />
        ) : null}

        {/* Hurting, picking up exactly where helping stops. A negative
            dashoffset advances the start of the dash around the circle. */}
        {u > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={hurtingColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * u} ${c}`}
            strokeDashoffset={-c * h}
            transform={spin}
          />
        ) : null}

        {/* The reference's inner ring — decorative, and it stops the icon
            from floating in the middle of an empty disc. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={innerR}
          stroke={innerColor}
          strokeWidth={innerStroke}
          fill="none"
        />
      </Svg>
      <MaterialIcons name={icon} size={size * 0.36} color={iconColor} />
    </View>
  )
}

export default MarkerRing
