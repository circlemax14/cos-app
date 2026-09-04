import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useTrends } from '@/hooks/use-trends'
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends'
import { useReportTrends } from '@/hooks/use-report-trends'
import { TrendLineChart } from '@/components/health/TrendLineChart'
import { SelfAssessmentTrends } from '@/components/health-plan/SelfAssessmentTrends'
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types'
import { fetchTrendsSummary, type TrendsSummary } from '@/services/api/trends'
import { AICitationsFooter } from '@/components/ai/ai-citations-footer'
import { useAppleHealthPreference } from '@/hooks/use-apple-health-preference'
import { router, useFocusEffect } from 'expo-router'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import * as FileSystem from 'expo-file-system/legacy'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { todayLocalIso } from '@/lib/day-key';
import { groupTrendsByBodySystem } from '@/lib/body-system-grouping';
import { useCanRender } from '@/hooks/use-entitlement'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Result Trends — redesigned (SCRUM-237).
 *
 * Mirrors the stakeholder reference screenshots from the web:
 *   - Time-period filter chips at the top
 *   - Component multi-select (compact, collapsible on mobile)
 *   - Per-metric cards with a real line chart + green-shaded normal-range
 *     band + "Data table" disclosure
 *   - Download results footer card (placeholder until the backend
 *     /trends/export endpoint lands)
 *
 * Chart rendering lives in <TrendLineChart /> so the home compact card
 * and this full screen share the same SVG primitive.
 */

type TimeFilter = 'most-recent' | 'all' | 'month' | 'year'
const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'most-recent', label: 'Most Recent' },
  { id: 'all',         label: 'All Data' },
  { id: 'month',       label: 'Month' },
  { id: 'year',        label: 'Year' },
]

const MOST_RECENT_LIMIT = 10

type Palette = typeof Colors['light'] | typeof Colors['dark']

export default function HealthTrendsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [refreshing, setRefreshing] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('most-recent')
  const [activeTrend, setActiveTrend] = useState<LongitudinalTrend | null>(null)
  const canView = useCanRender('health-trends.view')
  const canViewTrendChart = useCanRender('health-trends.view-trend-chart')
  const canFilterMetric = useCanRender('health-trends.filter-metric')
  const canShareTrend = useCanRender('health-trends.share-trend')

  const { data, isLoading, isError, refetch } = useTrends()
  const { data: healthKitTrends, refetch: refetchHealthKit, disabled: appleHealthDisabled } = useHealthKitTrends()
  const { data: reportTrends, isLoading: isLoadingReportTrends, refetch: refetchReportTrends } = useReportTrends()

  // COS-397 / SCRUM-535: the Apple Health preference is the authoritative
  // switch. Re-read it whenever this screen regains focus so a disable on the
  // Apple Health screen takes effect immediately when the user comes back here
  // (otherwise the stale "enabled" snapshot would keep Apple Health trends up).
  const refetchApplePreference = useAppleHealthPreference().refetch
  useFocusEffect(
    useCallback(() => {
      void refetchApplePreference()
    }, [refetchApplePreference]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([refetch(), refetchHealthKit(), refetchReportTrends(), refetchApplePreference()])
    setRefreshing(false)
  }, [refetch, refetchHealthKit, refetchReportTrends, refetchApplePreference])

  // Split trends by provenance — Apple Health goes in the carousel at the
  // top, clinic-sourced (FHIR + report-derived) trends go in the selector
  // + full-card layout below. SCRUM-244 / SCRUM-246.
  //
  // Two sources contribute to the clinic section:
  //   1. /v1/patients/me/trends — backend-computed from FHIR Observations
  //      attached directly to the patient.
  //   2. /v1/patients/me/reports — structured `results[]` arrays from the
  //      Reports tab, pivoted client-side into trends grouped by metric
  //      name. Fills the gap when reports land as DiagnosticReports with
  //      embedded results that never make it into Observation form.
  //
  // Backend trends win on metricCode conflict (it's higher-fidelity), so
  // report-derived trends only contribute metric names not already covered.
  const clinicTrends = useMemo<LongitudinalTrend[]>(() => {
    const backend = ((data ?? []) as LongitudinalTrend[]).map((t) => ({
      ...t,
      source: t.source ?? ('fhir' as const),
    }))
    const fromReports = (reportTrends ?? []) as LongitudinalTrend[]
    const codes = new Set(backend.map((t) => t.metricCode.toLowerCase()))
    const names = new Set(backend.map((t) => t.metricName.toLowerCase()))
    const extras = fromReports.filter(
      (t) => !codes.has(t.metricCode.toLowerCase()) && !names.has(t.metricName.toLowerCase()),
    )
    return [...backend, ...extras]
  }, [data, reportTrends])

  const appleHealthTrends = useMemo<LongitudinalTrend[]>(() => {
    const hk = (healthKitTrends ?? []) as LongitudinalTrend[]
    const clinicCodes = new Set(clinicTrends.map((t) => t.metricCode))
    return hk
      .filter((t) => !clinicCodes.has(t.metricCode))
      .map((t) => applyTimeFilter(t, timeFilter))
      .filter((t) => t.dataPoints.length > 0)
  }, [healthKitTrends, clinicTrends, timeFilter])

  /**
   * SCRUM-265 #13 made this a slider and capped it at the ten most
   * interesting trends — out-of-range points, or a clear direction. That cap
   * existed because ONE flat row of every lab a clinic has ever sent is
   * unreadable.
   *
   * SCRUM-671 removed that premise: the row is now grouped by body system, so
   * ten results spread over seven organ headings looked sparse and arbitrary —
   * a patient with a full panel saw Liver with one card and no idea the rest
   * existed. Ken 2026-08-15 confirmed lifting it.
   *
   * The RANKING IS KEPT and now does real work. It previously returned an
   * unordered Set that the caller filtered by, so it chose WHICH trends
   * appeared and never their order. rankByInterest returns an ordered array
   * instead, so within each organ heading the out-of-range and moving results
   * lead and the flat ones trail. We show everything; we show the interesting
   * things first.
   */
  const clinicSliderTrends = useMemo<LongitudinalTrend[]>(
    () =>
      rankByInterest(clinicTrends)
        .map((t) => applyTimeFilter(t, timeFilter))
        .filter((t) => t.dataPoints.length > 0),
    [clinicTrends, timeFilter],
  )

  // Download results — build a CSV of everything currently on-screen
  // (Apple Health carousel + visible clinic trends) and hand it to the
  // OS share sheet. No backend round-trip needed.
  const onDownloadResults = useCallback(async () => {
    const allVisible = [...appleHealthTrends, ...clinicSliderTrends]
    if (allVisible.length === 0) {
      Alert.alert('Nothing to download', 'Pick or expand some components first.')
      return
    }
    try {
      const csv = buildTrendsCsv(allVisible)
      const filename = `trends-${todayLocalIso()}.csv`
      const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${filename}`
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      if (Platform.OS === 'ios') {
        await Share.share({ url: path, title: 'Health Trends' })
      } else {
        // Android Share doesn't honor file: URLs from cacheDirectory in
        // the same way iOS does; fall back to sharing CSV text directly.
        await Share.share({ message: csv, title: 'Health Trends' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to export trends.'
      Alert.alert('Download failed', msg)
    }
  }, [appleHealthTrends, clinicSliderTrends])

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint as string} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading health trends…
          </Text>
        </View>
      </AppWrapper>
    )
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={48} color={colors.subtext as string} />
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginTop: 12 }}>
            Failed to load health trends
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    )
  }

  const screenWidth = Dimensions.get('window').width
  const chartWidth = Math.min(screenWidth - 64, 520)

  return (
    <AppWrapper>
      {canView && (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* SCRUM-265 #10: renamed "Result Trends" → "Health Trends", more
            attractive header with an accent icon chip + subtitle. */}
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: (colors.tint as string) + '1A' }]}>
            <MaterialIcons name="insights" size={getScaledFontSize(22)} color={colors.tint as string} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(800) as any }]}>
              Health Trends
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
              Labs, vitals and Apple Health, over time
            </Text>
          </View>
        </View>

        {/* SCRUM-279 (2026-06-08): Summarize CTA — generates a
            cross-metric narrative + key takeaways + next steps via
            the new /v1/patients/me/trends/summarize endpoint (cached
            24h server-side). */}
        <SummarizeCard />

        {/* Time period filter chips */}
        {canFilterMetric && (
        <View style={[styles.filterCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <View style={styles.filterRow}>
            {TIME_FILTERS.map((f) => {
              const active = timeFilter === f.id
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setTimeFilter(f.id)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? (colors.tint as string) : 'transparent',
                      borderColor: active ? (colors.tint as string) : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={{ color: active ? '#fff' : (colors.text as string), fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(active ? 700 : 500) as any }}>
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 10 }}>
            {filterSubtitle(timeFilter)}
          </Text>
        </View>
        )}

        {/* COS-397 / SCRUM-535: Apple Health is turned off in the app
            preference. Show a clear "turned off" card (instead of any stale
            Apple Health trends) with a button to the enable screen. iOS only
            — `appleHealthDisabled` is false on Android. */}
        {appleHealthDisabled ? (
          <View style={{ marginTop: 4 }}>
            <View style={styles.sectionHeaderRow}>
              <MaterialIcons
                name="favorite"
                size={getScaledFontSize(16)}
                color={colors.text as string}
              />
              <Text style={[styles.sectionHeader, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
                Apple Health
              </Text>
            </View>
            <View style={[styles.appleHealthOffCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
              <MaterialIcons name="favorite-border" size={getScaledFontSize(28)} color={colors.subtext as string} />
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any, marginTop: 10, textAlign: 'center' }}>
                Apple Health is turned off
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 4, textAlign: 'center' }}>
                Turn Apple Health back on to see steps, heart rate, sleep, and more from your iPhone and Apple Watch here.
              </Text>
              <Pressable
                onPress={() => router.push('/Home/apple-health' as never)}
                style={[styles.appleHealthOffBtn, { backgroundColor: colors.tint as string }]}
                accessibilityRole="button"
                accessibilityLabel="Turn on Apple Health"
              >
                <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                  Turn on Apple Health
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Apple Health — horizontal carousel of every available metric.
            No selector — the slider IS the picker. Only renders when we
            actually have data (iOS only; Android returns []), and the app
            preference is enabled (appleHealthDisabled gates the off-state
            above). */}
        {!appleHealthDisabled && appleHealthTrends.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            <View style={styles.sectionHeaderRow}>
              <MaterialIcons
                name="favorite"
                size={getScaledFontSize(16)}
                color={colors.text as string}
              />
              <Text style={[styles.sectionHeader, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
                Apple Health
              </Text>
            </View>
            {/* Ken 2026-08-14: group by body system / organ. One carousel per
                group — a single scroller with headings interleaved would put a
                heading mid-scroll, reading as a label for whatever card is
                beside it. groupTrendsByBodySystem returns ONE unlabelled group
                when it recognises nothing, which renders exactly the flat row
                that shipped before. */}
            {groupTrendsByBodySystem(appleHealthTrends).map((group) => (
              <View key={group.label || 'ungrouped'}>
                {group.label ? (
                  <Text
                    accessibilityRole="header"
                    style={[
                      styles.systemGroupLabel,
                      {
                        color: colors.subtext as string,
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(700) as any,
                      },
                    ]}
                  >
                    {group.label.toUpperCase()}
                  </Text>
                ) : null}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  decelerationRate="fast"
                >
                  {group.metrics.map((t) => (
                    <AppleHealthMiniCard
                      key={t.id}
                      trend={t}
                      colors={colors}
                      fontSize={getScaledFontSize}
                      fontWeight={getScaledFontWeight}
                      onPress={() => setActiveTrend(t)}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}

        {/* SCRUM-268 Phase 3: Self-Assessments trend section. Shows
            the latest result + descriptive band for every check-in the
            user has completed; tap a card to open per-instrument
            history in a follow-up. */}
        <View style={styles.sectionHeaderRow}>
          <MaterialIcons
            name="assignment"
            size={getScaledFontSize(16)}
            color={colors.text as string}
          />
          <Text style={[styles.sectionHeader, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
            Self-Assessments
          </Text>
        </View>
        <SelfAssessmentTrends />

        {/* From Your Clinic header. SCRUM-265 #13: replaced the
            select-components + full-card layout with a horizontal slider
            of mini cards, matching the Apple Health carousel pattern.
            Capped at the top 10 most-interesting metrics; tap any card
            to open the same TrendCard modal Apple Health uses. */}
        {(clinicTrends.length > 0 || isLoading || isLoadingReportTrends) ? (
          <View style={styles.sectionHeaderRow}>
            <MaterialIcons
              name="local-hospital"
              size={getScaledFontSize(16)}
              color={colors.text as string}
            />
            <Text style={[styles.sectionHeader, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
              From Your Clinic
            </Text>
          </View>
        ) : null}

        {/* SCRUM-265 #12: per-section loader while lab + report trends
            are still being fetched. Today's top-level isLoading gate
            already covers the initial /trends call, but report-trends
            via /lab-reports can be slow on accounts with many reports
            — surface a clear "Loading lab trends…" instead of an empty
            section. */}
        {clinicTrends.length === 0 && (isLoading || isLoadingReportTrends) ? (
          <View style={[styles.clinicLoadingCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
            <ActivityIndicator color={colors.tint as string} />
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginLeft: 12 }}>
              Loading lab trends…
            </Text>
          </View>
        ) : null}

        {clinicTrends.length > 0 ? (
          <View>
            {groupTrendsByBodySystem(clinicSliderTrends).map((group) => (
              <View key={group.label || 'ungrouped'}>
                {group.label ? (
                  <Text
                    accessibilityRole="header"
                    style={[
                      styles.systemGroupLabel,
                      {
                        color: colors.subtext as string,
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(700) as any,
                      },
                    ]}
                  >
                    {group.label.toUpperCase()}
                  </Text>
                ) : null}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  decelerationRate="fast"
                >
                  {group.metrics.map((t) => (
                    <AppleHealthMiniCard
                      key={t.id}
                      trend={t}
                      colors={colors}
                      fontSize={getScaledFontSize}
                      fontWeight={getScaledFontWeight}
                      onPress={() => setActiveTrend(t)}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}

        {/* Truly empty — no Apple Health AND no Clinic data. When Apple Health
            is turned off we already show the dedicated "turned off" card above,
            so drop the Apple-Health mention here to avoid a mixed message. */}
        {clinicTrends.length === 0 && appleHealthTrends.length === 0 && !appleHealthDisabled ? (
          <View style={[styles.emptyCard, { borderColor: colors.border }]}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              No trends yet. Lab values and Apple Health data will appear here as your records flow in.
            </Text>
          </View>
        ) : null}

        {/* Download results footer */}
        {canShareTrend && (
        <View style={[styles.downloadCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.downloadHeaderRow}>
              <MaterialIcons name="description" size={getScaledFontSize(18)} color={colors.tint as string} />
              <Text style={{ marginLeft: 8, color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                Download results
              </Text>
            </View>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 4 }}>
              Save the data on this screen as a CSV file.
            </Text>
          </View>
          <Pressable
            onPress={onDownloadResults}
            style={[styles.downloadBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
            accessibilityLabel="Download results"
          >
            <MaterialIcons name="download" size={getScaledFontSize(16)} color="#fff" />
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any, marginLeft: 6 }}>
              Download
            </Text>
          </Pressable>
        </View>
        )}
      </ScrollView>
      )}

      {/* Apple Health card detail modal — slide-up sheet hosting the full
          TrendCard (line chart + data-table disclosure). Tapping a card
          in the carousel opens this; tapping the X dismisses. */}
      <Modal
        visible={activeTrend !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveTrend(null)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: colors.background }]}>
          {activeTrend ? (
            <>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <View style={[
                  styles.miniIconChip,
                  { backgroundColor: metricVisual(activeTrend.metricCode).accent + '1A', marginRight: 12 },
                ]}>
                  <MaterialIcons
                    name={metricVisual(activeTrend.metricCode).icon}
                    size={getScaledFontSize(20)}
                    color={metricVisual(activeTrend.metricCode).accent}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.text as string,
                      fontSize: getScaledFontSize(18),
                      fontWeight: getScaledFontWeight(700) as any,
                    }}
                  >
                    {activeTrend.metricName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(12),
                      marginTop: 2,
                    }}
                  >
                    Apple Health · {activeTrend.dataPoints.length} {activeTrend.dataPoints.length === 1 ? 'reading' : 'readings'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setActiveTrend(null)}
                  style={[styles.modalCloseBtn, { backgroundColor: (colors.card as string) + 'D9' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close details"
                  hitSlop={8}
                >
                  <MaterialIcons name="close" size={getScaledFontSize(20)} color={colors.text as string} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                {canViewTrendChart && (
                <TrendCard
                  trend={activeTrend}
                  chartWidth={chartWidth}
                  colors={colors}
                  fontSize={getScaledFontSize}
                  fontWeight={getScaledFontWeight}
                />
                )}
              </ScrollView>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>
    </AppWrapper>
  )
}

// ─── Per-card with chart + data-table disclosure ────────────────────────────

function TrendCard({
  trend,
  chartWidth,
  colors,
  fontSize,
  fontWeight,
}: {
  trend: LongitudinalTrend
  chartWidth: number
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}) {
  const [tableOpen, setTableOpen] = useState(false)
  const ref = trend.dataPoints[0]?.referenceRange
  const unit = trend.dataPoints[0]?.unit ?? ''

  // Newest first for the data table.
  const rows = [...trend.dataPoints].sort((a, b) => b.date.localeCompare(a.date))

  const isAppleHealth = trend.source === 'apple-health'

  return (
    <View style={[styles.trendCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
      <View style={styles.trendCardTitleRow}>
        <Text style={{ color: colors.text, fontSize: fontSize(16), fontWeight: fontWeight(700) as any, flexShrink: 1 }}>
          {trend.metricName}
        </Text>
        <View
          style={[
            styles.sourceBadge,
            {
              backgroundColor: isAppleHealth ? '#0F172A18' : '#00808018',
              borderColor: isAppleHealth ? '#0F172A33' : '#00808033',
            },
          ]}
        >
          <MaterialIcons
            name={isAppleHealth ? 'favorite' : 'local-hospital'}
            size={fontSize(11)}
            color={isAppleHealth ? '#0F172A' : '#008080'}
          />
          <Text
            style={{
              marginLeft: 4,
              color: isAppleHealth ? '#0F172A' : '#008080',
              fontSize: fontSize(10),
              fontWeight: fontWeight(600) as any,
            }}
          >
            {isAppleHealth ? 'Apple Health' : 'Clinic'}
          </Text>
        </View>
      </View>
      {ref ? (
        <Text style={{ color: colors.subtext, fontSize: fontSize(12), marginTop: 2 }}>
          Normal range: {ref.low}–{ref.high} {unit}
        </Text>
      ) : null}

      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <TrendLineChart
          points={trend.dataPoints}
          referenceRange={ref}
          width={chartWidth}
          height={170}
          textColor={colors.text as string}
          subtleColor={colors.subtext as string}
          lineColor={colors.tint as string}
        />
      </View>

      <Pressable
        onPress={() => setTableOpen((v) => !v)}
        style={styles.tableToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: tableOpen }}
      >
        <Text style={{ color: colors.tint as string, fontSize: fontSize(13), fontWeight: fontWeight(600) as any }}>
          Data table
        </Text>
        <MaterialIcons
          name={tableOpen ? 'expand-less' : 'expand-more'}
          size={fontSize(18)}
          color={colors.tint as string}
        />
      </Pressable>

      {tableOpen ? (
        <View style={styles.dataTable}>
          <View style={[styles.dataRow, styles.dataHeaderRow]}>
            <Text style={[styles.dataCellLeft, { color: colors.subtext, fontSize: fontSize(11), fontWeight: fontWeight(600) as any }]}>Date</Text>
            <Text style={[styles.dataCellMid, { color: colors.subtext, fontSize: fontSize(11), fontWeight: fontWeight(600) as any }]}>Value</Text>
            <Text style={[styles.dataCellRight, { color: colors.subtext, fontSize: fontSize(11), fontWeight: fontWeight(600) as any }]}>Normal Range</Text>
          </View>
          {rows.map((p, i) => (
            <View key={i} style={[styles.dataRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.dataCellLeft, { color: colors.text, fontSize: fontSize(13) }]}>{formatRowDate(p.date)}</Text>
              <View style={styles.dataCellMid}>
                <Text style={{ color: colors.text, fontSize: fontSize(13), fontWeight: fontWeight(700) as any }}>
                  {p.value} {p.unit}
                </Text>
                {p.interpretation && p.interpretation !== 'normal' ? (
                  <Text style={[
                    styles.interpPill,
                    {
                      color: '#A16207',
                      backgroundColor: '#FDE68A',
                      fontSize: fontSize(10),
                      fontWeight: fontWeight(700) as any,
                    },
                  ]}>
                    {capitalize(p.interpretation)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.dataCellRight, { color: colors.subtext, fontSize: fontSize(12) }]}>
                {p.referenceRange ? `${p.referenceRange.low}–${p.referenceRange.high} ${p.unit}` : '—'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// ─── Apple Health mini card (horizontal carousel) ───────────────────────────

/**
 * Per-metric icon + accent colour. Drives the small icon chip at the top
 * of each Apple Health card and the modal-header chip. Keys are the
 * `metricCode` values from VITAL_SPECS in services/health.ts.
 */
const METRIC_VISUAL: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; accent: string }> = {
  'hk-heart-rate':       { icon: 'favorite',         accent: '#DC2626' },
  'hk-resting-hr':       { icon: 'favorite-border',  accent: '#DC2626' },
  'hk-walking-hr':       { icon: 'directions-walk',  accent: '#F97316' },
  'hk-hrv':              { icon: 'show-chart',       accent: '#DC2626' },
  'hk-bp-systolic':      { icon: 'monitor-heart',    accent: '#DC2626' },
  'hk-bp-diastolic':     { icon: 'monitor-heart',    accent: '#DC2626' },
  'hk-glucose':          { icon: 'bloodtype',        accent: '#B91C1C' },
  'hk-body-temp':        { icon: 'thermostat',       accent: '#F59E0B' },
  'hk-spo2':             { icon: 'air',              accent: '#0EA5E9' },
  'hk-resp-rate':        { icon: 'air',              accent: '#0EA5E9' },
  'hk-weight':           { icon: 'monitor-weight',   accent: '#16A34A' },
  'hk-bmi':              { icon: 'monitor-weight',   accent: '#16A34A' },
  'hk-steps':            { icon: 'directions-walk',  accent: '#F97316' },
  'hk-active-energy':    { icon: 'local-fire-department', accent: '#F97316' },
  'hk-distance-walking': { icon: 'place',            accent: '#F97316' },
  'hk-flights':          { icon: 'stairs',           accent: '#F97316' },
  'hk-exercise-time':    { icon: 'fitness-center',   accent: '#F97316' },
  'hk-sleep':            { icon: 'bedtime',          accent: '#6366F1' },
}

function metricVisual(metricCode: string): { icon: keyof typeof MaterialIcons.glyphMap; accent: string } {
  return METRIC_VISUAL[metricCode] ?? { icon: 'show-chart', accent: '#008080' }
}

function AppleHealthMiniCard({
  trend,
  colors,
  fontSize,
  fontWeight,
  onPress,
}: {
  trend: LongitudinalTrend
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
  onPress: () => void
}) {
  const sorted = [...trend.dataPoints].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const latestDate = latest?.date
  const unit = latest?.unit ?? ''
  const outOfRange =
    latest?.interpretation === 'high' ||
    latest?.interpretation === 'low' ||
    latest?.interpretation === 'critical'
  const visual = metricVisual(trend.metricCode)
  const dir = trend.trendDirection
  const statusLabel =
    dir === 'improving' ? 'Improving' :
    dir === 'worsening' ? 'Worsening' :
    dir === 'stable' ? 'Stable' :
    'New'
  const statusIcon: keyof typeof MaterialIcons.glyphMap =
    dir === 'improving' ? 'trending-down' :
    dir === 'worsening' ? 'trending-up' :
    dir === 'stable' ? 'trending-flat' :
    'help-outline'
  // For metrics where "up = better" (steps, distance, sleep, exercise time,
  // HRV), invert the improving/worsening colour so users see green on the
  // right cue. For most clinical vitals "improving = toward range" → green.
  const upIsGood = ['hk-steps', 'hk-distance-walking', 'hk-flights', 'hk-active-energy', 'hk-exercise-time', 'hk-sleep', 'hk-hrv'].includes(trend.metricCode)
  let statusColor = '#6B7280'
  if (dir === 'improving') statusColor = '#16A34A'
  else if (dir === 'worsening') statusColor = '#DC2626'
  if (upIsGood && (dir === 'improving' || dir === 'worsening')) {
    // For up-is-good metrics, the slope sign carries different meaning —
    // re-derive from latest vs earliest value.
    const earliest = sorted[0]?.value ?? 0
    const last = latest?.value ?? 0
    statusColor = last > earliest ? '#16A34A' : last < earliest ? '#DC2626' : '#6B7280'
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${trend.metricName} details`}
      style={({ pressed }) => [
        styles.miniCard,
        {
          backgroundColor: colors.card as string,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Header: icon chip + metric name */}
      <View style={styles.miniHeaderRow}>
        <View style={[styles.miniIconChip, { backgroundColor: visual.accent + '1A' }]}>
          <MaterialIcons name={visual.icon} size={fontSize(18)} color={visual.accent} />
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: colors.text as string,
            fontSize: fontSize(13),
            fontWeight: fontWeight(700) as any,
            flex: 1,
            marginLeft: 10,
          }}
        >
          {trend.metricName}
        </Text>
      </View>

      {/* Latest value */}
      <View style={styles.miniValueRow}>
        <Text
          style={{
            color: outOfRange ? '#A16207' : (colors.text as string),
            fontSize: fontSize(28),
            fontWeight: fontWeight(700) as any,
            letterSpacing: -0.3,
          }}
        >
          {latest?.value ?? '—'}
        </Text>
        {unit ? (
          <Text
            style={{
              color: colors.subtext,
              fontSize: fontSize(12),
              fontWeight: fontWeight(500) as any,
              marginLeft: 5,
              marginBottom: 6,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {/* Status pill */}
      <View style={[styles.miniStatusPill, { backgroundColor: statusColor + '18', alignSelf: 'flex-start' }]}>
        <MaterialIcons name={statusIcon} size={fontSize(12)} color={statusColor} />
        <Text
          style={{
            color: statusColor,
            fontSize: fontSize(11),
            fontWeight: fontWeight(700) as any,
            marginLeft: 4,
          }}
        >
          {statusLabel}
        </Text>
      </View>

      {/* Sparkline */}
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <TrendLineChart
          points={sorted}
          referenceRange={latest?.referenceRange}
          width={MINI_CHART_WIDTH}
          height={70}
          showAxisLabels={false}
          textColor={colors.text as string}
          subtleColor={colors.subtext as string}
          lineColor={visual.accent}
        />
      </View>

      {/* Footer: last-updated date + View details affordance */}
      <View style={styles.miniFooterRow}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.subtext,
            fontSize: fontSize(11),
            fontWeight: fontWeight(500) as any,
            flex: 1,
          }}
        >
          {latestDate ? formatRowDate(latestDate) : ''}
        </Text>
        <Text
          style={{
            color: visual.accent,
            fontSize: fontSize(11),
            fontWeight: fontWeight(700) as any,
          }}
        >
          Details ›
        </Text>
      </View>
    </Pressable>
  )
}

const MINI_CARD_WIDTH = 260
const MINI_CHART_WIDTH = MINI_CARD_WIDTH - 24

/**
 * Order clinic trends by how much they warrant attention: out-of-range points
 * first, then a worsening direction, then improving, then alphabetical.
 *
 * This REPLACES pickInitialSelection, which returned an unordered Set of the
 * top N codes. The caller then filtered the source array by that Set — which
 * preserved the SOURCE order, so the ranking only ever chose *which* trends
 * appeared, never the order they appeared in. Once SCRUM-671 grouped the row
 * by body system and the cap was lifted, that Set matched everything and the
 * ranking silently did nothing at all.
 *
 * Returning an array makes the ordering real, which is what the grouping
 * needs: within each organ heading, the results worth looking at lead.
 */
function rankByInterest(trends: LongitudinalTrend[]): LongitudinalTrend[] {
  const score = (t: LongitudinalTrend): number => {
    let s = 0
    for (const p of t.dataPoints) {
      if (p.interpretation && p.interpretation !== 'normal') s += 2
    }
    if (t.trendDirection === 'worsening') s += 3
    else if (t.trendDirection === 'improving') s += 2
    return s
  }
  return [...trends].sort(
    (a, b) => score(b) - score(a) || a.metricName.localeCompare(b.metricName),
  )
}

function applyTimeFilter(trend: LongitudinalTrend, filter: TimeFilter): LongitudinalTrend {
  if (filter === 'all' || trend.dataPoints.length === 0) return trend
  const sorted = [...trend.dataPoints].sort((a, b) => a.date.localeCompare(b.date))
  let kept: TrendDataPoint[] = sorted
  if (filter === 'most-recent') {
    kept = sorted.slice(-MOST_RECENT_LIMIT)
  } else if (filter === 'month' || filter === 'year') {
    const now = Date.now()
    const cutoff = now - (filter === 'month' ? 30 : 365) * 24 * 60 * 60 * 1000
    kept = sorted.filter((p) => new Date(p.date).getTime() >= cutoff)
  }
  return { ...trend, dataPoints: kept }
}

function filterSubtitle(filter: TimeFilter): string {
  switch (filter) {
    case 'most-recent': return `Showing up to ${MOST_RECENT_LIMIT} most recent results`
    case 'all':         return 'Showing all available results'
    case 'month':       return 'Showing results from the last month'
    case 'year':        return 'Showing results from the last year'
    default:            return ''
  }
}

function formatRowDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildTrendsCsv(trends: LongitudinalTrend[]): string {
  const escape = (v: string | number | undefined | null): string => {
    if (v === undefined || v === null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'Source',
    'Metric',
    'Date',
    'Value',
    'Unit',
    'Normal Low',
    'Normal High',
    'Interpretation',
  ].join(',')
  const rows: string[] = [header]
  for (const t of trends) {
    const source = t.source === 'apple-health' ? 'Apple Health' : 'Clinic'
    for (const p of t.dataPoints) {
      rows.push(
        [
          escape(source),
          escape(t.metricName),
          escape(p.date),
          escape(p.value),
          escape(p.unit),
          escape(p.referenceRange?.low),
          escape(p.referenceRange?.high),
          escape(p.interpretation ?? ''),
        ].join(','),
      )
    }
  }
  return rows.join('\n') + '\n'
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

const styles = StyleSheet.create({
  // Body-system group heading. Sits between the section header
  // ("From Your Clinic" / "Apple Health") and that group's carousel.
  systemGroupLabel: { marginHorizontal: 16, marginTop: 10, marginBottom: 2, letterSpacing: 0.6 },
  container: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 14 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { letterSpacing: -0.3 },
  clinicLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  selectorCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  selectorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  selChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 18, marginTop: 4 },
  appleHealthOffCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  appleHealthOffBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionHeader: {
    letterSpacing: 0.2,
  },
  carouselContent: {
    paddingRight: 4,
    paddingBottom: 4,
    gap: 10,
  },
  miniCard: {
    width: 260,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  miniHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  miniIconChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 14,
  },
  miniStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 8,
  },
  miniFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalSafe: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  trendCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  trendCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tableToggle: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginTop: 4,
  },
  dataTable: { marginTop: 4 },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dataHeaderRow: { borderTopWidth: 0 },
  dataCellLeft: { flex: 1.2 },
  dataCellMid: { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dataCellRight: { flex: 1.4, textAlign: 'right' },
  interpPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    textTransform: 'capitalize',
  },
  downloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    gap: 12,
  },
  downloadHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  summarizeCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summarizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summarizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
})

/* SCRUM-279 (2026-06-08): Summarize CTA + result panel.
 * Single tap → POST /trends/summarize → renders narrative,
 * key takeaways list, next-steps line. State stays in component so
 * the rest of the screen doesn't re-render while waiting.
 */
function SummarizeCard() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [summary, setSummary] = useState<TrendsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPress = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchTrendsSummary()
      setSummary(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate summary right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <View style={[styles.summarizeCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
      <View style={styles.summarizeRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
            Summary
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
            A plain-language read on all your trends together.
          </Text>
        </View>
        <Pressable
          onPress={onPress}
          disabled={loading}
          style={[styles.summarizeBtn, { backgroundColor: (colors.tint as string), opacity: loading ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Summarize my trends"
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialIcons name="auto-awesome" size={getScaledFontSize(15)} color="#fff" />
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
                Summarize
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {error && (
        <Text style={{ color: '#FF3B30', fontSize: getScaledFontSize(13), marginTop: 12 }}>
          {error}
        </Text>
      )}

      {summary && (
        <View style={{ marginTop: 14 }}>
          {!!summary.summary && (
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), lineHeight: getScaledFontSize(20) }}>
              {summary.summary}
            </Text>
          )}
          {summary.keyTakeaways.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                KEY TAKEAWAYS
              </Text>
              {summary.keyTakeaways.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                  <Text style={{ color: colors.tint as string, fontSize: getScaledFontSize(13), marginRight: 6 }}>•</Text>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), flex: 1, lineHeight: getScaledFontSize(18) }}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {!!summary.nextSteps && (
            <View style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: (colors.tint as string) + '14' }}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>
                NEXT STEPS
              </Text>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(18) }}>
                {summary.nextSteps}
              </Text>
            </View>
          )}
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), marginTop: 8, textAlign: 'right' }}>
            Generated {new Date(summary.generatedAt).toLocaleString()}
          </Text>
          <AICitationsFooter compact />
        </View>
      )}
    </View>
  )
}
