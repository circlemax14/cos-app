import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TrendDataPoint } from '@/services/api/types'

/**
 * View-based line chart for a single longitudinal trend.
 *
 * We previously rendered this with react-native-svg, but the
 * `react-native-svg` native module is not linked in the current iOS
 * binary (the package was added to package.json after the last
 * `pod install` was committed to Podfile.lock). That meant every chart
 * rendered as RN's `UnimplementedView` placeholder.
 *
 * Rather than gate the trends UI on a new binary cut, this rewrite uses
 * only `<View>` + absolute positioning: the normal-range band is a
 * translucent rectangle, the line is a chain of thin rectangles rotated
 * to the segment angle between consecutive points, and the points are
 * small circular views layered on top. Visually it matches the SVG
 * version closely enough that the chart stays useful.
 */
export function TrendLineChart({
  points,
  referenceRange,
  width,
  height,
  showAxisLabels = true,
  textColor = '#0F172A',
  subtleColor = '#64748B',
  lineColor = '#1D4ED8',
  bandColor = '#16A34A33',
  bandBorderColor = '#16A34A55',
  outOfRangeColor = '#F59E0B',
}: {
  points: TrendDataPoint[]
  referenceRange?: { low: number; high: number }
  width: number
  height: number
  showAxisLabels?: boolean
  textColor?: string
  subtleColor?: string
  lineColor?: string
  bandColor?: string
  bandBorderColor?: string
  outOfRangeColor?: string
}): React.JSX.Element | null {
  if (points.length === 0) return null

  const padLeft = 8
  const padRight = 8
  const padTop = 12
  const padBottom = showAxisLabels ? 22 : 10
  const innerWidth = Math.max(10, width - padLeft - padRight)
  const innerHeight = Math.max(10, height - padTop - padBottom)

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const values = sorted.map((p) => p.value)
  const minV = Math.min(...values, referenceRange?.low ?? Infinity)
  const maxV = Math.max(...values, referenceRange?.high ?? -Infinity)
  const span = Math.max(0.1, maxV - minV)
  const yLo = minV - span * 0.1
  const yHi = maxV + span * 0.1
  const yRange = yHi - yLo

  const xFor = (i: number): number => {
    if (sorted.length === 1) return padLeft + innerWidth / 2
    return padLeft + (i / (sorted.length - 1)) * innerWidth
  }
  const yFor = (v: number): number =>
    padTop + innerHeight - ((v - yLo) / yRange) * innerHeight

  const bandTop = referenceRange ? yFor(referenceRange.high) : 0
  const bandBottom = referenceRange ? yFor(referenceRange.low) : 0
  const bandHeight = referenceRange ? Math.max(0, bandBottom - bandTop) : 0

  // Pre-compute segment params (length + angle) between consecutive points.
  const segments: { left: number; top: number; length: number; angleDeg: number }[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const x1 = xFor(i)
    const y1 = yFor(sorted[i].value)
    const x2 = xFor(i + 1)
    const y2 = yFor(sorted[i + 1].value)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    segments.push({ left: x1, top: y1, length, angleDeg })
  }

  const firstDate = sorted[0]?.date
  const lastDate = sorted[sorted.length - 1]?.date
  const midDate =
    sorted.length >= 3 ? sorted[Math.floor((sorted.length - 1) / 2)]?.date : undefined

  const LINE_THICKNESS = 2.5
  const POINT_DIAMETER = 10

  return (
    <View style={{ width, height }}>
      {/* Normal-range band */}
      {referenceRange ? (
        <>
          <View
            style={{
              position: 'absolute',
              left: padLeft,
              top: bandTop,
              width: innerWidth,
              height: bandHeight,
              backgroundColor: bandColor,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: padLeft,
              top: bandTop,
              width: innerWidth,
              height: StyleSheet.hairlineWidth,
              backgroundColor: bandBorderColor,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: padLeft,
              top: bandBottom,
              width: innerWidth,
              height: StyleSheet.hairlineWidth,
              backgroundColor: bandBorderColor,
            }}
          />
        </>
      ) : null}

      {/* Line segments between consecutive points */}
      {segments.map((s, i) => (
        <View
          key={`seg-${i}`}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top - LINE_THICKNESS / 2,
            width: s.length,
            height: LINE_THICKNESS,
            backgroundColor: lineColor,
            transform: [{ rotate: `${s.angleDeg}deg` }],
            transformOrigin: '0% 50%',
          }}
        />
      ))}

      {/* Point markers, layered on top of the line */}
      {sorted.map((p, i) => {
        const cx = xFor(i)
        const cy = yFor(p.value)
        const outOfRange =
          p.interpretation === 'high' ||
          p.interpretation === 'low' ||
          p.interpretation === 'critical'
        const ringColor = outOfRange ? outOfRangeColor : lineColor
        return (
          <View
            key={`pt-${i}`}
            style={{
              position: 'absolute',
              left: cx - POINT_DIAMETER / 2,
              top: cy - POINT_DIAMETER / 2,
              width: POINT_DIAMETER,
              height: POINT_DIAMETER,
              borderRadius: POINT_DIAMETER / 2,
              backgroundColor: '#FFFFFF',
              borderColor: ringColor,
              borderWidth: LINE_THICKNESS,
            }}
          />
        )
      })}

      {/* Axis labels */}
      {showAxisLabels ? (
        <View
          style={[
            styles.axisRow,
            { width, paddingLeft: padLeft, paddingRight: padRight },
          ]}
        >
          <Text style={[styles.axisLabel, { color: subtleColor }]}>
            {formatAxisDate(firstDate)}
          </Text>
          {midDate && midDate !== firstDate && midDate !== lastDate ? (
            <Text style={[styles.axisLabel, { color: subtleColor }]}>
              {formatAxisDate(midDate)}
            </Text>
          ) : null}
          {lastDate && lastDate !== firstDate ? (
            <Text style={[styles.axisLabel, { color: subtleColor }]}>
              {formatAxisDate(lastDate)}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* Quiet textColor reference to keep the prop in the signature so
          callers can override even though the chart doesn't render any
          numeric values directly — axis ticks use subtleColor. */}
      {textColor.length === 0 ? null : null}
    </View>
  )
}

function formatAxisDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  axisRow: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
})
