import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { fetchInstruments, type InstrumentSummary } from '@/services/api/instruments'
import { fetchAssessments, type AssessmentRecord } from '@/services/api/assessments'
import { generateAiHealthPlan } from '@/services/api/ai-health-plan'

// SCRUM-230: lowered from 3 → 2 so users get to a personalized plan faster.
const MIN_TO_BUILD_PLAN = 2

const ORDER: readonly string[] = [
  'wellbeing-5',
  'phq-2',
  'phq-9',
  'gad-7',
  'sleep-4',
  'pain-4',
  'loneliness-3',
  'alcohol-3',
  'physical-function-4',
  'adl',
  'iadl',
  'falls-12',
  'nutrition-5',
  'cognition-8',
]

const ICON_BY_ID: Record<string, { name: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  'wellbeing-5':         { name: 'sentiment-satisfied', color: '#10B981' },
  'phq-2':               { name: 'psychology',          color: '#6366F1' },
  'phq-9':               { name: 'psychology',          color: '#6366F1' },
  'gad-7':               { name: 'spa',                 color: '#8B5CF6' },
  'sleep-4':             { name: 'bedtime',             color: '#0EA5E9' },
  'pain-4':              { name: 'healing',             color: '#EF4444' },
  'loneliness-3':        { name: 'groups',              color: '#F59E0B' },
  'alcohol-3':           { name: 'local-bar',           color: '#A855F7' },
  'physical-function-4': { name: 'directions-run',      color: '#22C55E' },
  'adl':                 { name: 'accessible',          color: '#0891B2' },
  'iadl':                { name: 'home',                color: '#0D9488' },
  'falls-12':            { name: 'warning-amber',       color: '#F97316' },
  'nutrition-5':         { name: 'restaurant',          color: '#84CC16' },
  'cognition-8':         { name: 'memory',              color: '#DB2777' },
}

function iconFor(id: string, tint: string): { name: keyof typeof MaterialIcons.glyphMap; color: string } {
  return ICON_BY_ID[id] ?? { name: 'assignment', color: tint }
}

type Palette = typeof Colors['light'] | typeof Colors['dark']

interface Props {
  /** Visual header copy shown above the grid; omit to hide. */
  intro?: string
  /** Hide the per-instrument grid + Build CTA when no instruments at all. */
  emptyMessage?: string
}

/**
 * Shared catalog body: status-aware grid of square check-in cards plus
 * the Build-my-plan CTA. Used both on the standalone catalog screen
 * (with its own header) and inline on the Plan tab as the empty state
 * for advanced/agency users (SCRUM-230).
 */
export function AssessmentCatalogContent({ intro, emptyMessage }: Props): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    staleTime: 5 * 60 * 1000,
  })
  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 30 * 1000,
  })

  const buildPlan = useMutation({
    mutationFn: () => generateAiHealthPlan(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
      router.replace('/Home/health-plan' as never)
    },
  })

  const completedById = React.useMemo(() => {
    const m = new Map<string, AssessmentRecord>()
    for (const r of assessmentsQuery.data ?? []) m.set(r.instrumentId, r)
    return m
  }, [assessmentsQuery.data])

  // PHQ-9 hidden until PHQ-2 completed AND positive (sum ≥ 3)
  const phq2 = completedById.get('phq-2')
  const phq2Sum =
    (typeof phq2?.responses?.q1 === 'number' ? phq2.responses.q1 : 0) +
    (typeof phq2?.responses?.q2 === 'number' ? phq2.responses.q2 : 0)
  const phq9Eligible = phq2Sum >= 3

  const visible = React.useMemo<InstrumentSummary[]>(() => {
    const all = instrumentsQuery.data ?? []
    const byId = new Map(all.map((it) => [it.instrumentId, it]))
    const ordered: InstrumentSummary[] = []
    for (const id of ORDER) {
      if (id === 'phq-9' && !phq9Eligible) continue
      const found = byId.get(id)
      if (found) ordered.push(found)
    }
    for (const it of all) if (!ORDER.includes(it.instrumentId)) ordered.push(it)
    return ordered
  }, [instrumentsQuery.data, phq9Eligible])

  const completedCount = React.useMemo(
    () => visible.filter((it) => completedById.has(it.instrumentId)).length,
    [visible, completedById],
  )
  const canBuildPlan = completedCount >= MIN_TO_BUILD_PLAN

  if (instrumentsQuery.isLoading || assessmentsQuery.isLoading) {
    return (
      <View style={{ alignItems: 'center', padding: 24 }}>
        <ActivityIndicator size="large" color={colors.tint as string} />
      </View>
    )
  }

  if (visible.length === 0) {
    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
          {emptyMessage ?? 'No check-ins are available right now. Check back later.'}
        </Text>
      </View>
    )
  }

  return (
    <View>
      {intro ? (
        <Text style={[styles.intro, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          {intro}
        </Text>
      ) : null}

      <View style={[styles.progressBar, { borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }}>
          {completedCount} of {visible.length} completed
        </Text>
      </View>

      <View style={styles.grid}>
        {visible.map((it) => (
          <CatalogCard
            key={it.id}
            item={it}
            record={completedById.get(it.instrumentId)}
            colors={colors}
            fontSize={getScaledFontSize}
            fontWeight={getScaledFontWeight}
          />
        ))}
      </View>

      <Pressable
        onPress={() => buildPlan.mutate()}
        disabled={!canBuildPlan || buildPlan.isPending}
        style={[
          styles.buildBtn,
          {
            backgroundColor: canBuildPlan ? (colors.tint as string) : (colors.subtext + '60'),
            opacity: buildPlan.isPending ? 0.6 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canBuildPlan }}
      >
        {buildPlan.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
            {canBuildPlan
              ? 'Build my plan'
              : `Complete ${MIN_TO_BUILD_PLAN - completedCount} more to build plan`}
          </Text>
        )}
      </Pressable>
      {buildPlan.error ? (
        <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), textAlign: 'center', marginTop: 10 }}>
          Couldn&apos;t generate your plan right now. Try again in a moment.
        </Text>
      ) : null}
    </View>
  )
}

function statusFor(record: AssessmentRecord | undefined): { label: string; color: string } {
  if (!record) return { label: 'Not started', color: '#6B7280' }
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { label: 'Due', color: '#F59E0B' }
  }
  return { label: 'Done', color: '#10B981' }
}

function CatalogCard({
  item,
  record,
  colors,
  fontSize,
  fontWeight,
}: {
  item: InstrumentSummary
  record: AssessmentRecord | undefined
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}) {
  const status = statusFor(record)
  const icon = iconFor(item.instrumentId, colors.tint as string)

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/Home/assessment-stepper' as never,
          params: { instrumentId: item.instrumentId } as never,
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: icon.color + '22', borderColor: icon.color + '55' }]}>
        <MaterialIcons name={icon.name} size={fontSize(28)} color={icon.color} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: colors.text,
          fontSize: fontSize(14),
          fontWeight: fontWeight(700) as any,
          textAlign: 'center',
          marginTop: 10,
          minHeight: fontSize(18) * 2,
        }}
      >
        {item.name}
      </Text>
      <View style={[styles.statusBadge, { borderColor: status.color }]}>
        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        <Text
          style={{
            color: status.color,
            fontSize: fontSize(10),
            fontWeight: fontWeight(700) as any,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {status.label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  intro: { marginBottom: 12, lineHeight: 19 },
  progressBar: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  emptyWrap: { borderWidth: 1, borderRadius: 12, padding: 24, marginTop: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 'auto',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  buildBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
})
