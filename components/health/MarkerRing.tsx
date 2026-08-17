/**
 * The circular progress ring from Bevel's biomarker rows.
 *
 * A ring with an icon inside, drawn as two arcs: a full track and a partial
 * sweep whose length is how much of the group has current data. That second
 * meaning is the one worth being careful about — see below.
 *
 * Needs react-native-svg, so it is part of the same binary as ScoreArc.
 *
 * ─── WHAT THE SWEEP MEANS, AND WHAT IT DOES NOT ──────────────────────
 *
 * In the reference the ring appears to encode how the marker is doing. Ours
 * encodes DATA COMPLETENESS — how many of the group's tests have a current
 * reading — and that is a deliberate difference.
 *
 * Encoding "how good is this result" as ring fullness would need a normal
 * range per analyte to scale against, and we do not have one. The contribution
 * in years is not a percentage of anything; a −5.4 year contribution has no
 * natural ceiling to draw it against, so any sweep length would be invented.
 * Meanwhile completeness is a real fraction we can compute honestly, and it is
 * the thing a patient can act on: an empty ring means go and get the test.
 *
 * The DIRECTION (better or worse) is carried by colour and by the text beside
 * it, which is where it belongs — a number can say "5.4 years younger"; a ring
 * cannot.
 */

import React from 'react'
import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

export interface MarkerRingProps {
  /** 0-1 — the fraction of this group's markers with a current reading. */
  fraction: number
  /** Ring colour. Grey when nothing is measured. */
  color: string
  trackColor: string
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  size?: number
}

export function MarkerRing({
  fraction,
  color,
  trackColor,
  icon,
  size = 40,
}: MarkerRingProps): React.JSX.Element {
  const stroke = 3.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const safe = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  // A zero-length dash still paints a round cap, which reads as a small filled
  // pip and implies data that is not there. Suppress the sweep entirely.
  const dash = safe <= 0 ? 0 : c * safe

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {dash > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            // Start at 12 o'clock rather than 3, which is where a person
            // expects a progress ring to begin.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <MaterialIcons name={icon} size={size * 0.45} color={color} />
    </View>
  )
}

export default MarkerRing
