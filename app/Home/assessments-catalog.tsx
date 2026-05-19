import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { fetchInstruments, type InstrumentSummary } from '@/services/api/instruments'
import { fetchAssessments, type AssessmentRecord } from '@/services/api/assessments'
import { generateAiHealthPlan } from '@/services/api/ai-health-plan'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'

// Explicit display order. Newly-added agency-authored instruments fall
// off the end of the catalog (they still surface — see below).
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

// Per-instrument MaterialIcons (and a sensible accent color) so each
// catalog card reads at a glance. Anything not in the map falls back
// to a generic 'assignment' icon + the screen's tint colour.
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

// User can build their AI plan once at least this many DB instruments
// are complete. Picked to be permissive — the AI generator does its
// best with whatever it gets and getting started early is the goal.
const MIN_TO_BUILD_PLAN = 3

type Palette = typeof Colors['light'] | typeof Colors['dark']

export default function AssessmentsCatalogScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ source?: string }>()
  const fromPlanUpgrade = params.source === 'plan-upgrade'

  const { planType, isLoading: planLoading } = usePlanType()
  const canAccess = meetsTier(planType, 'advanced')

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    enabled: canAccess,
    staleTime: 5 * 60 * 1000,
  })

  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    enabled: canAccess,
    staleTime: 30 * 1000,
  })

  const buildPlan = useMutation({
    mutationFn: () => generateAiHealthPlan(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
      router.replace('/Home/health-plan' as never)
    },
  })

  // Index existing completion records by instrumentId for status badges.
  const completedById = React.useMemo(() => {
    const m = new Map<string, AssessmentRecord>()
    for (const r of assessmentsQuery.data ?? []) m.set(r.instrumentId, r)
    return m
  }, [assessmentsQuery.data])

  // Skip-logic: hide PHQ-9 until PHQ-2 completed AND sum >= 3.
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
    // Append anything not in ORDER (e.g. agency-authored instruments).
    for (const it of all) {
      if (!ORDER.includes(it.instrumentId)) ordered.push(it)
    }
    return ordered
  }, [instrumentsQuery.data, phq9Eligible])

  const completedCount = React.useMemo(
    () => visible.filter((it) => completedById.has(it.instrumentId)).length,
    [visible, completedById],
  )
  const canBuildPlan = completedCount >= MIN_TO_BUILD_PLAN

  if (planLoading || (canAccess && (instrumentsQuery.isLoading || assessmentsQuery.isLoading))) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  if (!canAccess) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="lock-outline" size={getScaledFontSize(56)} color={colors.tint as string} />
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
            Health check-ins are an Advanced feature
          </Text>
          <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Upgrade to access the full set of guided assessments.
          </Text>
          <Pressable
            onPress={() => router.replace('/Home/health-plan' as never)}
            style={[styles.primaryBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
              View plans
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 }]}>
            Health check-ins
          </Text>
        </View>

        <Text style={[styles.subhead, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          {fromPlanUpgrade
            ? 'Pick the check-ins to start with. Your AI plan personalizes itself as you go.'
            : 'Take or revisit check-ins to keep your plan up to date.'}
        </Text>

        <View style={[styles.progressBar, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }}>
            {completedCount} of {visible.length} completed
          </Text>
        </View>

        {visible.length === 0 ? (
          <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              No check-ins are available right now. Check back later.
            </Text>
          </View>
        ) : (
          visible.map((it) => (
            <CatalogRow
              key={it.id}
              item={it}
              record={completedById.get(it.instrumentId)}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))
        )}

        {/* Build-my-plan CTA */}
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
              {canBuildPlan ? 'Build my plan' : `Complete ${MIN_TO_BUILD_PLAN - completedCount} more to build plan`}
            </Text>
          )}
        </Pressable>
        {buildPlan.error ? (
          <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), textAlign: 'center', marginTop: 10 }}>
            Couldn&apos;t generate your plan right now. Try again in a moment.
          </Text>
        ) : null}
      </ScrollView>
    </AppWrapper>
  )
}

function statusFor(record: AssessmentRecord | undefined): {
  label: string
  color: string
  cta: 'Start' | 'Retake' | 'Resume'
} {
  if (!record) return { label: 'Not started', color: '#6B7280', cta: 'Start' }
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { label: 'Due for retake', color: '#F59E0B', cta: 'Retake' }
  }
  return { label: 'Completed', color: '#10B981', cta: 'Retake' }
}

function CatalogRow({
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
  const ownerLabel = item.ownerType === 'system' ? 'System' : 'Your agency'
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
      accessibilityLabel={`${status.cta} ${item.name}`}
      style={({ pressed }) => [
        styles.row,
        {
          // Translucent card — bubble effect over the screen background.
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: icon.color + '22', borderColor: icon.color + '55' }]}>
        <MaterialIcons name={icon.name} size={fontSize(22)} color={icon.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: fontSize(16),
              fontWeight: fontWeight(700) as any,
              flexShrink: 1,
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
        </View>

        <Text
          numberOfLines={2}
          style={{ color: colors.subtext, fontSize: fontSize(13), marginTop: 4 }}
        >
          {item.description}
        </Text>

        <View style={styles.metaRow}>
          <Text
            style={[
              styles.ownerBadge,
              {
                color: colors.subtext,
                borderColor: colors.border,
                fontSize: fontSize(10),
                fontWeight: fontWeight(600) as any,
              },
            ]}
          >
            {ownerLabel}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: fontSize(11) }}>
            ~{Math.max(1, Math.round(item.items.length * 0.25))} min
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
        <Text
          style={{
            color: colors.tint as string,
            fontSize: fontSize(13),
            fontWeight: fontWeight(700) as any,
          }}
        >
          {status.cta}
        </Text>
        <MaterialIcons name="chevron-right" size={fontSize(22)} color={colors.subtext} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  headerTitle: { flex: 1 },
  subhead: { paddingHorizontal: 4, marginBottom: 12 },
  title: { marginTop: 12, textAlign: 'center' },
  body: { marginTop: 6, paddingHorizontal: 8, textAlign: 'center' },
  primaryBtn: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  progressBar: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  emptyWrap: { borderWidth: 1, borderRadius: 12, padding: 24, marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ownerBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buildBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
})
