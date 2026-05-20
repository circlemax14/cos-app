import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useTrends } from '@/hooks/use-trends'
import { useAccessibility } from '@/stores/accessibility-store'
import { Colors } from '@/constants/theme'
import { TrendLineChart } from '@/components/health/TrendLineChart'
import type { LongitudinalTrend } from '@/services/api/types'

type Palette = typeof Colors['light'] | typeof Colors['dark']

const DIRECTION_BADGE: Record<
  LongitudinalTrend['trendDirection'],
  { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }
> = {
  improving: { label: 'Improving', icon: 'trending-down', color: '#16A34A', bg: '#16A34A18' },
  worsening: { label: 'Worsening', icon: 'trending-up',   color: '#DC2626', bg: '#DC262618' },
  stable:    { label: 'Stable',    icon: 'trending-flat', color: '#6B7280', bg: '#6B728018' },
  insufficient_data: { label: 'Pending', icon: 'help-outline', color: '#6B7280', bg: '#6B728018' },
}

/**
 * Compact Health Trends section for the Home screen (SCRUM-237 +
 * SCRUM-238 visibility fix).
 *
 * Always renders the section header + a "View all →" CTA so users
 * have a discoverable entry point into the trends screen even before
 * any FHIR data has resolved into longitudinal trends. When trends
 * exist, surfaces up to 3 most relevant as mini line charts; otherwise
 * shows a small empty-state stub that still routes into the full
 * trends screen.
 */
export function HomeTrendsCard(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const trendsQuery = useTrends()

  const top = React.useMemo<LongitudinalTrend[]>(() => {
    const all = (trendsQuery.data ?? []) as LongitudinalTrend[]
    if (all.length === 0) return []
    // Sort priority:
    //   1) most recent point out of range first
    //   2) improving/worsening over stable
    //   3) more recent latest-point wins ties
    const latestOutOfRange = (t: LongitudinalTrend): number => {
      const last = [...t.dataPoints].sort((a, b) => b.date.localeCompare(a.date))[0]
      if (!last) return 0
      return last.interpretation && last.interpretation !== 'normal' ? 1 : 0
    }
    const dirRank = (t: LongitudinalTrend): number =>
      t.trendDirection === 'improving' || t.trendDirection === 'worsening' ? 1 : 0
    const latestDate = (t: LongitudinalTrend): string => {
      const last = [...t.dataPoints].sort((a, b) => b.date.localeCompare(a.date))[0]
      return last?.date ?? ''
    }
    return [...all]
      .filter((t) => t.dataPoints.length > 0)
      .sort((a, b) => {
        const o = latestOutOfRange(b) - latestOutOfRange(a)
        if (o !== 0) return o
        const d = dirRank(b) - dirRank(a)
        if (d !== 0) return d
        return latestDate(b).localeCompare(latestDate(a))
      })
      .slice(0, 3)
  }, [trendsQuery.data])

  const goToFullScreen = () => router.push('/Home/health-trends' as never)
  const isLoading = trendsQuery.isLoading

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
            },
          ]}
        >
          Health Trends
        </Text>
        <Pressable
          onPress={goToFullScreen}
          accessibilityRole="button"
          accessibilityLabel="View all health trends"
          hitSlop={8}
        >
          <Text style={{ color: colors.tint as string, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }}>
            View all →
          </Text>
        </Pressable>
      </View>

      {top.length > 0 ? (
        <View style={{ gap: 10 }}>
          {top.map((t) => (
            <TrendMiniCard
              key={t.id}
              trend={t}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))}
        </View>
      ) : (
        // Empty / loading state. Still tappable so users can open the full
        // trends screen, where the same empty-state copy renders with
        // pull-to-refresh.
        <Pressable
          onPress={goToFullScreen}
          accessibilityRole="button"
          accessibilityLabel="Open Health Trends"
          style={({ pressed }) => [
            styles.emptyCard,
            {
              backgroundColor: (colors.card as string) + 'D9',
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.emptyIcon, { backgroundColor: (colors.tint as string) + '18' }]}>
            <MaterialIcons name="show-chart" size={getScaledFontSize(20)} color={colors.tint as string} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
              {isLoading ? 'Loading your trends…' : 'No trends yet'}
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
              {isLoading
                ? 'Hang tight while we line up your latest results.'
                : 'We’ll surface lab and vital trends here as your records flow in. Tap to open the full view.'}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.subtext as string} />
        </Pressable>
      )}
    </View>
  )
}

function TrendMiniCard({
  trend,
  colors,
  fontSize,
  fontWeight,
}: {
  trend: LongitudinalTrend
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}) {
  const dir = DIRECTION_BADGE[trend.trendDirection]
  const points = trend.dataPoints
  const ref = points[0]?.referenceRange
  const latest = [...points].sort((a, b) => b.date.localeCompare(a.date))[0]
  const unit = latest?.unit ?? ''
  return (
    <Pressable
      onPress={() => router.push('/Home/health-trends' as never)}
      accessibilityRole="button"
      accessibilityLabel={`${trend.metricName} trend, ${dir.label}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: fontSize(15),
              fontWeight: fontWeight(700) as any,
            }}
          >
            {trend.metricName}
          </Text>
          {ref ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.subtext,
                fontSize: fontSize(11),
                marginTop: 2,
              }}
            >
              Normal {ref.low}–{ref.high} {unit}
            </Text>
          ) : null}
        </View>
        <View style={[styles.dirBadge, { backgroundColor: dir.bg }]}>
          <MaterialIcons name={dir.icon} size={fontSize(13)} color={dir.color} />
          <Text
            style={{
              color: dir.color,
              fontSize: fontSize(11),
              fontWeight: fontWeight(700) as any,
              marginLeft: 4,
            }}
          >
            {dir.label}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 8 }}>
        <TrendLineChart
          points={points}
          referenceRange={ref}
          width={MINI_CHART_W}
          height={92}
          textColor={colors.text}
          subtleColor={colors.subtext}
          lineColor={colors.tint as string}
        />
      </View>
    </Pressable>
  )
}

const MINI_CHART_W = 300

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 4, marginBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { letterSpacing: 0.2 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
