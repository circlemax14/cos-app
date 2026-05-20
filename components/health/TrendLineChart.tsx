import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Rect, Line } from 'react-native-svg'
import type { TrendDataPoint } from '@/services/api/types'

/**
 * Reusable SVG line chart for a single trend (SCRUM-237). Draws the
 * data series as a polyline with circular markers, overlays the
 * normal-range band as a soft green rectangle behind the line, and
 * highlights out-of-range points with yellow rings (matches the
 * stakeholder screenshot from cos-frontend Result Trends).
 *
 * Uses the absolute width/height passed in by the parent so it works
 * both at home-card size (compact) and full-screen.
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

  // Sort oldest → newest for left-to-right time axis.
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const values = sorted.map((p) => p.value)
  const minV = Math.min(...values, referenceRange?.low ?? Infinity)
  const maxV = Math.max(...values, referenceRange?.high ?? -Infinity)
  // Pad y-range by 10% so points don't sit on the edges.
  const span = Math.max(0.1, maxV - minV)
  const yLo = minV - span * 0.1
  const yHi = maxV + span * 0.1
  const yRange = yHi - yLo

  const xFor = (i: number): number => {
    if (sorted.length === 1) return padLeft + innerWidth / 2
    return padLeft + (i / (sorted.length - 1)) * innerWidth
  }
  const yFor = (v: number): number => padTop + innerHeight - ((v - yLo) / yRange) * innerHeight

  const pathD = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.value).toFixed(2)}`)
    .join(' ')

  const bandY = referenceRange ? yFor(referenceRange.high) : 0
  const bandH = referenceRange ? Math.max(0, yFor(referenceRange.low) - yFor(referenceRange.high)) : 0

  const firstDate = sorted[0]?.date
  const lastDate = sorted[sorted.length - 1]?.date
  const midDate = sorted.length >= 3 ? sorted[Math.floor((sorted.length - 1) / 2)]?.date : undefined

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Normal-range band — soft green */}
        {referenceRange ? (
          <>
            <Rect
              x={padLeft}
              y={bandY}
              width={innerWidth}
              height={bandH}
              fill={bandColor}
            />
            <Line
              x1={padLeft}
              x2={padLeft + innerWidth}
              y1={bandY}
              y2={bandY}
              stroke={bandBorderColor}
              strokeWidth={1}
            />
            <Line
              x1={padLeft}
              x2={padLeft + innerWidth}
              y1={bandY + bandH}
              y2={bandY + bandH}
              stroke={bandBorderColor}
              strokeWidth={1}
            />
          </>
        ) : null}
        {/* Connecting polyline */}
        <Path d={pathD} stroke={lineColor} strokeWidth={2.5} fill="none" />
        {/* Point markers */}
        {sorted.map((p, i) => {
          const cx = xFor(i)
          const cy = yFor(p.value)
          const outOfRange =
            p.interpretation === 'high' ||
            p.interpretation === 'low' ||
            p.interpretation === 'critical'
          const ringColor = outOfRange ? outOfRangeColor : lineColor
          return (
            <React.Fragment key={i}>
              <Circle cx={cx} cy={cy} r={5} fill="#FFFFFF" stroke={ringColor} strokeWidth={2.5} />
            </React.Fragment>
          )
        })}
      </Svg>
      {showAxisLabels ? (
        <View style={[styles.axisRow, { width, paddingLeft: padLeft, paddingRight: padRight }]}>
          <Text style={[styles.axisLabel, { color: subtleColor }]}>{formatAxisDate(firstDate)}</Text>
          {midDate && midDate !== firstDate && midDate !== lastDate ? (
            <Text style={[styles.axisLabel, { color: subtleColor }]}>{formatAxisDate(midDate)}</Text>
          ) : null}
          {lastDate && lastDate !== firstDate ? (
            <Text style={[styles.axisLabel, { color: subtleColor }]}>{formatAxisDate(lastDate)}</Text>
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
