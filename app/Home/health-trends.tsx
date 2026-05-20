import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useTrends } from '@/hooks/use-trends'
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends'
import { TrendLineChart } from '@/components/health/TrendLineChart'
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

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

const MAX_SELECTED = 10
const MOST_RECENT_LIMIT = 10

type Palette = typeof Colors['light'] | typeof Colors['dark']

export default function HealthTrendsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [refreshing, setRefreshing] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('most-recent')
  const [selectedCodes, setSelectedCodes] = useState<Set<string> | null>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useTrends()
  const { data: healthKitTrends, refetch: refetchHealthKit } = useHealthKitTrends()

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([refetch(), refetchHealthKit()])
    setRefreshing(false)
  }, [refetch, refetchHealthKit])

  // Merge FHIR-sourced (backend) and HealthKit-sourced trends, preferring
  // FHIR if the same metricCode appears in both (clinic-recorded data wins
  // over on-device samples for the same measurement). SCRUM-240.
  const allTrends = useMemo<LongitudinalTrend[]>(() => {
    const fhir = ((data ?? []) as LongitudinalTrend[]).map((t) => ({
      ...t,
      source: t.source ?? ('fhir' as const),
    }))
    const hk = (healthKitTrends ?? []) as LongitudinalTrend[]
    const codes = new Set(fhir.map((t) => t.metricCode))
    return [...fhir, ...hk.filter((t) => !codes.has(t.metricCode))]
  }, [data, healthKitTrends])

  // First render: auto-pick the most "interesting" trends as the
  // initial selection — anything with out-of-range points or
  // improving/worsening direction, up to MAX_SELECTED.
  const effectiveSelection = useMemo<Set<string>>(() => {
    if (selectedCodes !== null) return selectedCodes
    const auto = pickInitialSelection(allTrends, MAX_SELECTED)
    return auto
  }, [selectedCodes, allTrends])

  const visible = useMemo<LongitudinalTrend[]>(() => {
    return allTrends
      .filter((t) => effectiveSelection.has(t.metricCode))
      .map((t) => applyTimeFilter(t, timeFilter))
      .filter((t) => t.dataPoints.length > 0)
  }, [allTrends, effectiveSelection, timeFilter])

  const toggleCode = useCallback((code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev ?? pickInitialSelection(allTrends, MAX_SELECTED))
      if (next.has(code)) {
        next.delete(code)
      } else if (next.size < MAX_SELECTED) {
        next.add(code)
      }
      return next
    })
  }, [allTrends])

  const clearSelections = useCallback(() => setSelectedCodes(new Set()), [])

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
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any }]}>
            Result Trends
          </Text>
        </View>

        {/* Time period filter chips */}
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

        {/* Component selector — collapsible */}
        <View style={[styles.selectorCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <Pressable
            onPress={() => setSelectorOpen((v) => !v)}
            style={styles.selectorHeader}
            accessibilityRole="button"
            accessibilityState={{ expanded: selectorOpen }}
          >
            <View>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                Select components
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                {effectiveSelection.size} of {Math.min(MAX_SELECTED, allTrends.length)} selected
              </Text>
            </View>
            <MaterialIcons
              name={selectorOpen ? 'expand-less' : 'expand-more'}
              size={getScaledFontSize(22)}
              color={colors.subtext as string}
            />
          </Pressable>
          {selectorOpen ? (
            <View style={{ marginTop: 10 }}>
              {allTrends.length === 0 ? (
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>No components yet.</Text>
              ) : (
                <>
                  <View style={styles.chipWrap}>
                    {allTrends.map((t) => {
                      const checked = effectiveSelection.has(t.metricCode)
                      const disabledNew = !checked && effectiveSelection.size >= MAX_SELECTED
                      return (
                        <Pressable
                          key={t.metricCode}
                          onPress={() => toggleCode(t.metricCode)}
                          disabled={disabledNew}
                          style={[
                            styles.selChip,
                            {
                              backgroundColor: checked ? (colors.tint as string) + '22' : 'transparent',
                              borderColor: checked ? (colors.tint as string) : colors.border,
                              opacity: disabledNew ? 0.4 : 1,
                            },
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                        >
                          <MaterialIcons
                            name={checked ? 'check-box' : 'check-box-outline-blank'}
                            size={getScaledFontSize(14)}
                            color={checked ? (colors.tint as string) : (colors.subtext as string)}
                          />
                          <Text style={{ marginLeft: 6, color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(checked ? 600 : 500) as any }}>
                            {t.metricName}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Pressable
                    onPress={clearSelections}
                    style={[styles.clearBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.tint as string, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }}>
                      Clear selections
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </View>

        {/* Trend cards */}
        {visible.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: colors.border }]}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              Nothing in this view. Pick components above or expand the time range.
            </Text>
          </View>
        ) : (
          visible.map((t) => (
            <TrendCard
              key={t.id}
              trend={t}
              chartWidth={chartWidth}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))
        )}

        {/* Download results footer */}
        <View style={[styles.downloadCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.downloadHeaderRow}>
              <MaterialIcons name="description" size={getScaledFontSize(18)} color={colors.tint as string} />
              <Text style={{ marginLeft: 8, color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                Download results
              </Text>
            </View>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 4 }}>
              Save a table of your results as a PDF document.
            </Text>
          </View>
          <Pressable
            onPress={() => {/* TODO: wire to /trends/export when backend lands */}}
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
      </ScrollView>
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

function pickInitialSelection(trends: LongitudinalTrend[], cap: number): Set<string> {
  const score = (t: LongitudinalTrend): number => {
    let s = 0
    for (const p of t.dataPoints) {
      if (p.interpretation && p.interpretation !== 'normal') s += 2
    }
    if (t.trendDirection === 'worsening') s += 3
    else if (t.trendDirection === 'improving') s += 2
    return s
  }
  return new Set(
    [...trends]
      .sort((a, b) => score(b) - score(a) || a.metricName.localeCompare(b.metricName))
      .slice(0, cap)
      .map((t) => t.metricCode),
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

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
  title: { flex: 1, letterSpacing: 0.2 },
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
})
