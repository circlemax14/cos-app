/**
 * The circular dial from the Health Age reference.
 *
 * Replaces ScoreArc, which got the shape wrong in two ways that mattered: it
 * drew a semicircular DOME with the number underneath it, where the reference
 * is a nearly complete RING with the number inside and the scale along the
 * BOTTOM arc. A dome with text below reads as a chart with a caption; a ring
 * around the number reads as a dial. See lib/dial-geometry.ts.
 *
 * Anything passed as `children` is centred inside the ring — the title, the
 * number, the gap phrase, the week-change pill. The gauge is a FRAME, not a
 * sibling graphic.
 *
 * ─── ADR-0003 ────────────────────────────────────────────────────────
 *
 * The envelope bans SVG at cold mount, where render-primitive DENSITY on the
 * first synchronous commit caused the iOS 26.5 crashes. This is a navigated-to
 * detail screen, and the node count here is FIXED at nine regardless of how
 * much data exists — the tick marks are a dash pattern on one path rather than
 * sixty little lines, which is the whole reason they are affordable. No
 * animation, no gradient, no filter.
 */

import React from 'react'
import { StyleSheet, Text as RNText, View } from 'react-native'
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg'
import {
  SCALE_HALF_SWEEP,
  arcPath,
  pointAt,
  positionOf,
  tangentRotation,
  tickDash,
} from '@/lib/dial-geometry'

export interface DialGaugeProps {
  /** The measured figure — health age, or a wellbeing score. */
  value: number
  /** The scale's midpoint: chronological age, or 50 for a 0-100 score. */
  center: number
  /** Half-width of the scale, in the value's own units. */
  span?: number
  /** Outer diameter. Height is slightly greater, to seat the centre label. */
  size?: number
  ringColor: string
  trackColor: string
  /** Graduations on the track. Must differ from trackColor or they vanish. */
  tickColor: string
  fillColor: string
  labelColor: string
  /** Background the two dots punch through; should match the page behind. */
  dotCoreColor: string
  getScaledFontSize: (n: number) => number
  /** Printed at the arc's midpoint, under the ring. Omitted when absent. */
  centerLabel?: string
  /** Printed at each end of the scale, rotated onto the tangent. */
  formatEnd?: (n: number) => string
  children?: React.ReactNode
}

export function DialGauge({
  value,
  center,
  span = 10,
  size = 300,
  ringColor,
  trackColor,
  tickColor,
  fillColor,
  labelColor,
  dotCoreColor,
  getScaledFontSize,
  centerLabel,
  formatEnd = (n) => n.toFixed(1),
  children,
}: DialGaugeProps): React.JSX.Element {
  const stroke = Math.max(8, size * 0.038)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - stroke / 2 - 1

  const valueT = positionOf(value, center, span)
  const centerT = 0.5

  const valuePt = pointAt(valueT, cx, cy, r)
  const centerPt = pointAt(centerT, cx, cy, r)

  // Ticks: faint all the way round, stronger along the measurable arc.
  const ringTicks = tickDash(r, 360, 72, 1.5)
  const scaleTicks = tickDash(r, SCALE_HALF_SWEEP * 2, 34, 1.5)

  const endFont = getScaledFontSize(12)
  // Inside the track, clear of it — the reference seats the end labels within
  // the ring rather than outside, but they must not sit ON the band.
  const labelR = r - stroke / 2 - endFont * 1.15
  const leftLabel = pointAt(0, cx, cy, labelR)
  const rightLabel = pointAt(1, cx, cy, labelR)

  // The centre label goes BELOW the arc's lowest point. Deriving it from the
  // geometry rather than from `size` matters: the first attempt used
  // `size - stroke`, which landed the text directly on top of the arc and the
  // centre dot.
  const centerLabelTop = cy + r + stroke * 0.55
  const height = centerLabel ? centerLabelTop + endFont * 1.5 : size + 4

  return (
    <View style={{ width: size, height, alignSelf: 'center' }}>
      <Svg width={size} height={height} pointerEvents="none">
        {/* 1 — the ring itself, faint. */}
        <Circle cx={cx} cy={cy} r={r} stroke={ringColor} strokeWidth={1} fill="none" />

        {/* 2 — ticks around the whole ring, as ONE dashed path. */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke * 0.42}
          fill="none"
          strokeDasharray={ringTicks.dash}
        />

        {/* 3 — the measurable arc's track, thicker than the ring. */}
        <Path
          d={arcPath(0, 1, cx, cy, r)}
          stroke={trackColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />

        {/* 4 — ticks along the track, so the scale reads as graduated. Drawn
               in tickColor, NOT trackColor: the first attempt used the same
               grey for both and the graduations were invisible. */}
        <Path
          d={arcPath(0, 1, cx, cy, r)}
          stroke={tickColor}
          strokeWidth={stroke * 0.55}
          fill="none"
          strokeDasharray={scaleTicks.dash}
        />

        {/* 5 — the fill runs BETWEEN the two ages rather than from one end, so
               its length reads directly as the size of the gap. */}
        <Path
          d={arcPath(Math.min(valueT, centerT), Math.max(valueT, centerT), cx, cy, r)}
          stroke={fillColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />

        {/* 6, 7 — the two ends of that gap. The centre dot is the reference
               point (real age / midpoint); the value dot is the finding. */}
        <Circle
          cx={centerPt.x}
          cy={centerPt.y}
          r={stroke * 0.42}
          fill={dotCoreColor}
          stroke={tickColor}
          strokeWidth={1}
        />
        <Circle
          cx={valuePt.x}
          cy={valuePt.y}
          r={stroke * 0.42}
          fill={dotCoreColor}
          stroke={fillColor}
          strokeWidth={1.5}
        />

        {/* 8, 9 — end labels, laid along the tangent as in the reference. */}
        <SvgText
          x={leftLabel.x}
          y={leftLabel.y}
          fill={labelColor}
          fontSize={endFont}
          textAnchor="middle"
          transform={`rotate(${tangentRotation(0).toFixed(1)} ${leftLabel.x.toFixed(1)} ${leftLabel.y.toFixed(1)})`}
        >
          {formatEnd(center - span)}
        </SvgText>
        <SvgText
          x={rightLabel.x}
          y={rightLabel.y}
          fill={labelColor}
          fontSize={endFont}
          textAnchor="middle"
          transform={`rotate(${tangentRotation(1).toFixed(1)} ${rightLabel.x.toFixed(1)} ${rightLabel.y.toFixed(1)})`}
        >
          {formatEnd(center + span)}
        </SvgText>
      </Svg>

      {/* The reference seats the midpoint's value just under the arc, upright
          rather than on the tangent — it is a reading, not a scale marking. */}
      {centerLabel ? (
        <RNText
          style={{
            position: 'absolute',
            top: centerLabelTop,
            width: size,
            textAlign: 'center',
            color: labelColor,
            fontSize: endFont,
          }}
        >
          {centerLabel}
        </RNText>
      ) : null}

      {/* Everything the dial is ABOUT lives inside it. */}
      <View style={[styles.inner, { height: size }]} pointerEvents="box-none">
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  inner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the content clear of the ring on both sides.
    paddingHorizontal: '18%',
  },
})

export default DialGauge
