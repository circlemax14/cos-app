/**
 * The semicircular gauge from Bevel's Biological Age screen.
 *
 * ─── WHY THIS FILE FORCES A NEW BINARY ───────────────────────────────
 *
 * It is the first thing in this app to import react-native-svg. That library
 * was not installed at all — not a dependency, not transitive — so adding it
 * changes the native fingerprint. Everything shipped up to now went out as an
 * OTA; an arc cannot. This is the piece that needs an Xcode archive and an App
 * Store review, which is why it sat unbuilt while the rest of the screen
 * shipped.
 *
 * ─── ADR-0003 AND WHY SVG IS ACCEPTABLE *HERE* ───────────────────────
 *
 * ADR-0003 bans SVG at COLD MOUNT — specifically Home, where the iOS 26.5
 * crashes happened. The root cause was render-primitive DENSITY on the first
 * synchronous commit: a legacy card put 75-125 native primitives on screen at
 * once and tripped the TurboModule bridge.
 *
 * This is a DETAIL SCREEN reached by navigation, not a cold-mount surface, and
 * one arc is a handful of nodes rather than a hundred. Those are different
 * situations, and treating the ban as absolute is what kept this screen from
 * matching its reference for weeks.
 *
 * That said, the envelope is not relaxed casually:
 *   - the arc is a FIXED node count, independent of how much data exists
 *   - no animation, no gradient, no filter — a static path and two dots
 *   - Home and the other cold-mount surfaces are untouched
 *
 * ─── WHAT IT SHOWS ───────────────────────────────────────────────────
 *
 * A track from (chronological − span) to (chronological + span), the patient's
 * health age as a filled sweep from their own age, and both ends labelled. The
 * midpoint is always the patient's real age, so "left of the middle" reliably
 * means younger — a scale centred on the health age would move the meaning of
 * the middle every week.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'

export interface ScoreArcProps {
  /** The computed health age. */
  value: number
  /** The patient's chronological age — the arc's midpoint. */
  center: number
  /** Half-width of the scale in years. */
  span?: number
  size?: number
  trackColor: string
  fillColor: string
  labelColor: string
  getScaledFontSize: (n: number) => number
  children?: React.ReactNode
}

/** Point on the arc at `t` (0 = left end, 1 = right end). */
function pointAt(t: number, cx: number, cy: number, r: number): { x: number; y: number } {
  // 180° sweep, left to right, opening upward — matching the reference, where
  // the number sits inside the bowl.
  const angle = Math.PI - Math.PI * t
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) }
}

function arcPath(from: number, to: number, cx: number, cy: number, r: number): string {
  const a = pointAt(from, cx, cy, r)
  const b = pointAt(to, cx, cy, r)
  // Always the minor arc: the sweep never exceeds half a circle by construction.
  const large = Math.abs(to - from) > 0.5 ? 1 : 0
  const sweep = to > from ? 1 : 0
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`
}

export function ScoreArc({
  value,
  center,
  span = 10,
  size = 260,
  trackColor,
  fillColor,
  labelColor,
  getScaledFontSize,
  children,
}: ScoreArcProps): React.JSX.Element {
  const min = center - span
  const max = center + span
  const clamp = (v: number): number => Math.max(0, Math.min(1, (v - min) / (max - min)))

  const valueT = clamp(value)
  const centerT = 0.5

  const stroke = 10
  const r = (size - stroke * 2) / 2
  const cx = size / 2
  const cy = size / 2
  // The bowl is the top half only, so the box is half as tall plus the stroke
  // and enough room for the end labels.
  const height = size / 2 + stroke * 2

  const from = Math.min(valueT, centerT)
  const to = Math.max(valueT, centerT)
  const valuePt = pointAt(valueT, cx, cy, r)
  const centerPt = pointAt(centerT, cx, cy, r)

  return (
    <View style={{ width: size, alignSelf: 'center' }}>
      <Svg width={size} height={height} accessibilityRole="image" accessibilityLabel="">
        <Path
          d={arcPath(0, 1, cx, cy, r)}
          stroke={trackColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        {/* The sweep runs BETWEEN the two ages rather than from one end, so its
            length reads directly as the size of the gap. */}
        <Path
          d={arcPath(from, to, cx, cy, r)}
          stroke={fillColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={centerPt.x} cy={centerPt.y} r={5} fill="#FFFFFF" stroke={fillColor} strokeWidth={2.5} />
        <Circle cx={valuePt.x} cy={valuePt.y} r={6} fill={fillColor} />
      </Svg>

      {/* End labels, positioned against the arc's own extremes. */}
      <View style={styles.endLabels}>
        <Text style={{ color: labelColor, fontSize: getScaledFontSize(11) }}>{min.toFixed(1)}</Text>
        <Text style={{ color: labelColor, fontSize: getScaledFontSize(11) }}>{max.toFixed(1)}</Text>
      </View>

      {/* Chronological age, centred under the bowl — the reference labels this
          and it is the only way the two dots mean anything. */}
      <Text
        style={{
          color: labelColor,
          fontSize: getScaledFontSize(13),
          textAlign: 'center',
          marginTop: 2,
        }}
      >
        {center.toFixed(1)}
      </Text>

      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  endLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    paddingHorizontal: 4,
  },
})

export default ScoreArc
