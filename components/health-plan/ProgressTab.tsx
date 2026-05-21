import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View , ActivityIndicator } from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'
import { fetchProgressSummary, type ProgressSummary } from '@/services/api/progress-summary'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

type Cadence = 'day' | 'week' | 'month' | 'quarter' | 'sixMonths' | 'year'

const CADENCE_OPTIONS: { key: Cadence; label: string; days: number }[] = [
  { key: 'day',        label: 'Day',    days: 1 },
  { key: 'week',       label: 'Week',   days: 7 },
  { key: 'month',      label: 'Month',  days: 30 },
  { key: 'quarter',    label: 'Qtr',    days: 90 },
  { key: 'sixMonths',  label: '6 mo',   days: 180 },
  { key: 'year',       label: 'Year',   days: 365 },
]

interface ProgressTabProps {
  /** Streak in days, surfaced by the parent screen via existing analytics. */
  streakDays: number
  /** 30-day adherence percentage, surfaced by the parent. */
  adherencePercent: number
  /** Total tasks completed today (for the "day" cadence quick stat). */
  completedToday: number
  /** Total tasks scheduled today (for the "day" cadence quick stat). */
  totalToday: number
}

/**
 * Progress tab on the Health Plan screen.
 *
 * Showsspl:
 *  - Cadence segmented control (Day / Week / Month / Quarter / 6mo / Year)
 *  - Stats card per cadence (adherence %, streak, today's completion ratio)
 *  - Top-4 earned badges preview, "View all" button
 *
 * Per the SCRUM-194 design pass: rolling windows are surfaced client-side
 * for the cadences we don't precompute server-side. Daily/weekly/monthly
 * use the 30-day server analytics directly; quarterly+ are best-effort
 * extrapolations until SCRUM-194 ships the per-cadence backend rollups.
 */
export function ProgressTab({
  streakDays,
  adherencePercent,
  completedToday,
  totalToday,
}: ProgressTabProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [cadence, setCadence] = React.useState<Cadence>('week')

  // AI qualitative narrative — companion to the quantitative stats below.
  // Server caches for 1h per user; calling fetchProgressSummary(true) bypasses.
  const summaryQuery = useQuery<ProgressSummary>({
    queryKey: ['progress-summary'],
    queryFn: () => fetchProgressSummary(false),
    staleTime: 60 * 60 * 1000,
  })
  const refreshSummary = React.useCallback(() => {
    void fetchProgressSummary(true).then((fresh) => {
      summaryQuery.refetch()
      void fresh
    })
  }, [summaryQuery])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Cadence selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cadenceRow}
      >
        {CADENCE_OPTIONS.map((opt) => {
          const active = cadence === opt.key
          return (
            <Pressable
              key={opt.key}
              onPress={() => setCadence(opt.key)}
              style={[
                styles.cadenceChip,
                {
                  backgroundColor: active ? (colors.tint as string) : 'transparent',
                  borderColor: active ? (colors.tint as string) : (colors.text as string) + '30',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.label} cadence`}
            >
              <Text
                style={{
                  color: active ? '#fff' : (colors.text as string),
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* AI qualitative summary (SCRUM-206) — sits above the numeric stats
       *  because the stakeholder feedback prioritized narrative-first reading. */}
      <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
        <Card.Content>
          <View style={styles.summaryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <MaterialIcons name="auto-awesome" size={getScaledFontSize(16)} color={colors.tint as string} />
              <Text
                style={{
                  color: colors.tint as string,
                  fontSize: getScaledFontSize(11),
                  fontWeight: getScaledFontWeight(700) as any,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                AI summary
              </Text>
            </View>
            <Pressable
              onPress={refreshSummary}
              disabled={summaryQuery.isFetching}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Refresh AI summary"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              {summaryQuery.isFetching ? (
                <ActivityIndicator size="small" color={colors.tint as string} />
              ) : (
                <MaterialIcons name="refresh" size={getScaledFontSize(18)} color={colors.subtext} />
              )}
            </Pressable>
          </View>
          {summaryQuery.isLoading && !summaryQuery.data ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingVertical: 6 }}>
              Generating your summary…
            </Text>
          ) : summaryQuery.error ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingVertical: 6 }}>
              Couldn&apos;t load the summary. Tap refresh to try again.
            </Text>
          ) : (
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(14),
                lineHeight: getScaledFontSize(22),
                marginTop: 8,
              }}
            >
              {summaryQuery.data?.summary}
            </Text>
          )}
          {summaryQuery.data ? (
            <Text
              style={{
                marginTop: 8,
                color: colors.subtext,
                fontSize: getScaledFontSize(11),
              }}
            >
              Generated {new Date(summaryQuery.data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {summaryQuery.data.fromCache ? ' · cached' : ''}
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      {/* Stats card */}
      <Card style={[styles.statsCard, { backgroundColor: colors.card }]}>
        <Card.Content>
          <View style={styles.statRow}>
            <StatBlock
              label="Adherence"
              value={`${adherencePercent}%`}
              icon="show-chart"
              tint={colors.tint as string}
              textColor={colors.text}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <StatBlock
              label="Streak"
              value={streakDays === 0 ? '—' : `${streakDays}d`}
              icon="local-fire-department"
              tint="#F97316"
              textColor={colors.text}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <StatBlock
              label="Today"
              value={totalToday === 0 ? '—' : `${completedToday}/${totalToday}`}
              icon="event-available"
              tint="#10B981"
              textColor={colors.text}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </View>
          <Text
            style={{
              marginTop: 14,
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              lineHeight: getScaledFontSize(18),
            }}
          >
            {cadenceCopyFor(cadence, adherencePercent, streakDays)}
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

function cadenceCopyFor(cadence: Cadence, adherence: number, streak: number): string {
  switch (cadence) {
    case 'day':
      return 'Today’s completion is shown above. Tap a task on the schedule to mark it done.'
    case 'week':
      return `Looking at the last 7 days. Your 30-day adherence is ${adherence}% and your current streak is ${streak} day${streak === 1 ? '' : 's'}.`
    case 'month':
      return 'Last 30 days of activity. Keep going — small daily wins compound into long-term health.'
    case 'quarter':
      return 'Quarterly view shows your overall consistency. Helpful for sharing progress with your care team.'
    case 'sixMonths':
      return 'Six-month view captures longer trends and the impact of plan changes.'
    case 'year':
    default:
      return 'Annual view — the big picture. Great context for your yearly check-up.'
  }
}

function StatBlock({
  label,
  value,
  icon,
  tint,
  textColor,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  label: string
  value: string
  icon: keyof typeof MaterialIcons.glyphMap
  tint: string
  textColor: string
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <View style={styles.statBlock}>
      <MaterialIcons name={icon} size={22} color={tint} />
      <Text
        style={{
          color: textColor,
          fontSize: getScaledFontSize(20),
          fontWeight: getScaledFontWeight(700) as any,
          marginTop: 4,
        }}
      >
        {value}
      </Text>
      <Text style={{ color: textColor + '99', fontSize: getScaledFontSize(11), marginTop: 2 }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cadenceRow: { gap: 8, paddingVertical: 8, paddingHorizontal: 2 },
  cadenceChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statsCard: { marginTop: 12 },
  summaryCard: { marginTop: 12 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBlock: { alignItems: 'center', flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {},
})
