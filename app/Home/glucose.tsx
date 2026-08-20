/**
 * SCRUM-648 — Blood Glucose (TIR) detail screen.
 *
 * Gated by `useCgmGlucoseFlag()`. While the backend flag is OFF
 * (dark launch) this screen is unreachable via any surface and
 * direct-nav renders a "not available" state — mirror of the
 * habit-journal dark-launch pattern in app/Home/habit-journal.tsx.
 *
 * Wired to cos-backend routes:
 *   GET /v1/patients/me/glucose/trend?windowDays=14
 *
 * Reference bands: shaded low (<70 mg/dL) + high (>180 mg/dL) via
 * the existing view-based <TrendLineChart /> (no react-native-svg —
 * native module unlinked in the current binary, see recon).
 *
 * PHI hygiene: no timestamps / raw readings are rendered above the
 * fold — just aggregated TIR % + sample count. Full data table
 * deferred to a follow-up ticket.
 */

import React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useCgmGlucoseFlag } from '@/hooks/use-cgm-glucose-flag'
import { useGlucoseTrend } from '@/hooks/use-cgm-glucose'
import { TrendLineChart } from '@/components/health/TrendLineChart'
import type { TrendDataPoint } from '@/services/api/types'
import type {
  GlucoseSeriesPoint,
  GlucoseTirSummary,
} from '@/services/api/cgm-glucose'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const WINDOW_DAYS = 14

function toTrendPoints(
  series: GlucoseSeriesPoint[],
  bands: { low: number; high: number },
): TrendDataPoint[] {
  return series.map((p) => {
    let interpretation: TrendDataPoint['interpretation'] = 'normal'
    if (p.valueMgDl < bands.low) interpretation = 'low'
    else if (p.valueMgDl > bands.high) interpretation = 'high'
    return {
      date: p.ts,
      value: p.valueMgDl,
      unit: 'mg/dL',
      referenceRange: bands,
      interpretation,
    }
  })
}

function hasData(tir: GlucoseTirSummary | null, seriesLen: number): boolean {
  if (seriesLen > 0) return true
  if (!tir) return false
  return tir.sampleCount > 0
}

export default function GlucoseTirScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const { width: screenWidth } = useWindowDimensions()
  const chartWidth = Math.min(screenWidth - 32, 520)

  const flagEnabled = useCgmGlucoseFlag()
  const { data, isLoading } = useGlucoseTrend(WINDOW_DAYS)

  if (!flagEnabled) {
    return (
      <AppWrapper>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScreenHeader
            title="Blood Glucose (TIR)"
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
              This feature is not available yet.
            </Text>
          </View>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Blood Glucose (TIR)"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {isLoading || !data ? (
            <LoadingSkeleton
              colors={colors}
              getScaledFontSize={getScaledFontSize}
            />
          ) : !hasData(data.tir, data.series.length) ? (
            <EmptyState
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ) : (
            <>
              <TirSummaryTile
                tir={data.tir}
                sampleCount={data.tir?.sampleCount ?? data.series.length}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />

              <Card style={[styles.chartCard, { backgroundColor: colors.card }]}>
                <Card.Content>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(15),
                      fontWeight: getScaledFontWeight(600) as any,
                      marginBottom: 6,
                    }}
                  >
                    Last {WINDOW_DAYS} days
                  </Text>
                  {data.tir?.bands ? (
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: getScaledFontSize(12),
                        marginBottom: 10,
                      }}
                    >
                      Target range: {data.tir.bands.low}–{data.tir.bands.high} mg/dL
                    </Text>
                  ) : null}
                  <View style={{ alignItems: 'center' }}>
                    <TrendLineChart
                      points={toTrendPoints(
                        data.series,
                        data.tir?.bands ?? { low: 70, high: 180 },
                      )}
                      referenceRange={data.tir?.bands ?? { low: 70, high: 180 }}
                      width={chartWidth}
                      height={200}
                      textColor={colors.text as string}
                      subtleColor={colors.subtext as string}
                      lineColor={colors.tint as string}
                    />
                  </View>
                </Card.Content>
              </Card>

              {data.caveat ? (
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(11),
                    marginTop: 12,
                    lineHeight: 15,
                  }}
                >
                  {data.caveat}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </AppWrapper>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

interface HeaderProps {
  title: string
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function ScreenHeader({
  title, colors, getScaledFontSize, getScaledFontWeight,
}: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
      </Pressable>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(22),
          fontWeight: getScaledFontWeight(700) as any,
          marginLeft: 12,
          flex: 1,
        }}
      >
        {title}
      </Text>
    </View>
  )
}

interface TirSummaryProps {
  tir: GlucoseTirSummary | null
  sampleCount: number
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function TirSummaryTile({
  tir, sampleCount, colors, getScaledFontSize, getScaledFontWeight,
}: TirSummaryProps): React.JSX.Element {
  const pct = tir ? Math.round(tir.pct) : 0
  const hypoPct = tir ? Math.round(tir.hypoPct) : 0
  const hyperPct = tir ? Math.round(tir.hyperPct) : 0
  return (
    <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
      <Card.Content>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          Time in range
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(44),
            fontWeight: getScaledFontWeight(700) as any,
            lineHeight: getScaledFontSize(50),
            marginTop: 4,
          }}
          accessibilityLabel={`Time in range ${pct} percent`}
        >
          {pct}%
        </Text>
        <View style={styles.splitRow}>
          <View style={styles.splitItem}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
              Below range
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as any,
                marginTop: 2,
              }}
            >
              {hypoPct}%
            </Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
              Above range
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as any,
                marginTop: 2,
              }}
            >
              {hyperPct}%
            </Text>
          </View>
        </View>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            marginTop: 10,
          }}
        >
          n={sampleCount} readings, last {WINDOW_DAYS} days
        </Text>
      </Card.Content>
    </Card>
  )
}

interface StateProps {
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight?: (n: number) => string
}

function LoadingSkeleton({ colors, getScaledFontSize }: StateProps): React.JSX.Element {
  return (
    <View style={{ marginTop: 12 }}>
      <View style={[styles.skeletonBlock, { backgroundColor: colors.border, height: 120 }]} />
      <View
        style={[
          styles.skeletonBlock,
          { backgroundColor: colors.border, height: 200, marginTop: 12 },
        ]}
      />
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          marginTop: 12,
          textAlign: 'center',
        }}
      >
        Loading…
      </Text>
    </View>
  )
}

function EmptyState({
  colors, getScaledFontSize, getScaledFontWeight,
}: StateProps): React.JSX.Element {
  return (
    <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
      <Card.Content>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: (getScaledFontWeight?.(600) ?? '600') as any,
            marginBottom: 6,
          }}
        >
          No glucose data yet
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            lineHeight: 19,
          }}
        >
          Sync from Apple Health or a connected CGM (Dexcom, Libre) to see
          your time-in-range and 14-day trend.
        </Text>
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 12,
  },
  summaryCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  chartCard: {
    borderRadius: 12,
    marginBottom: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  splitItem: { flex: 1 },
  splitDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#00000022',
    marginHorizontal: 12,
  },
  skeletonBlock: {
    borderRadius: 12,
    opacity: 0.4,
  },
})
