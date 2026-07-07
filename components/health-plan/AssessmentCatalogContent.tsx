import React from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useFocusEffect } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchInstruments,
  fetchRecommendedInstruments,
  type InstrumentSummary,
} from '@/services/api/instruments'
import { fetchAssessments, type AssessmentRecord } from '@/services/api/assessments'
import { generateAiHealthPlan } from '@/services/api/ai-health-plan'
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments'
import { resolveBuildGate } from '@/lib/build-plan-gate'
import { useAssessmentStrategyV2Flag } from '@/hooks/use-assessment-strategy-v2-flag'

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

// ── Assessment Strategy v2 (COS-360 / SCRUM-518, Phase 2) ────────────────────
// Domain-grouped catalog headers. `spiritual` folds into the "Social &
// Spiritual" bucket (there is no separate spiritual header at the catalog
// layer, matching the 3-section Care Plan grouping). Instruments with no
// `domain` (pre-backfill, or seeded before ASSESSMENT_STRATEGY_V2_ENABLED
// existed) fall into a trailing "Other" bucket — expected to be empty once
// the backend backfill lands.
type CatalogDomainBucket = 'biological' | 'psychological' | 'social' | 'other'

const DOMAIN_BUCKET_LABEL: Record<CatalogDomainBucket, string> = {
  biological: 'Biological',
  psychological: 'Psychological',
  social: 'Social & Spiritual',
  other: 'Other',
}

interface CatalogDomainGroup {
  key: CatalogDomainBucket
  label: string
  items: InstrumentSummary[]
}

/** Buckets instruments by `domain`, present-only, in a fixed display order. */
function groupInstrumentsByDomain(items: InstrumentSummary[]): CatalogDomainGroup[] {
  const buckets: Record<CatalogDomainBucket, InstrumentSummary[]> = {
    biological: [],
    psychological: [],
    social: [],
    other: [],
  }
  for (const it of items) {
    if (it.domain === 'biological') buckets.biological.push(it)
    else if (it.domain === 'psychological') buckets.psychological.push(it)
    else if (it.domain === 'social' || it.domain === 'spiritual') buckets.social.push(it)
    else buckets.other.push(it)
  }
  return (['biological', 'psychological', 'social', 'other'] as const)
    .map((key) => ({ key, label: DOMAIN_BUCKET_LABEL[key], items: buckets[key] }))
    .filter((g) => g.items.length > 0)
}

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
  // COS-360 / SCRUM-518 Phase 2: OFF (default) → flat grid, byte-for-byte
  // today's behavior. ON → instruments group under 3 domain section headers.
  const assessmentStrategyV2Enabled = useAssessmentStrategyV2Flag()

  // SCRUM-231: prefer the AI-recommended subset (per-patient) over the
  // raw list. Backend already falls back to the full set on any AI
  // failure, so this is a soft swap — the client always gets useful
  // data. We additionally have our own client-side fallback to
  // fetchInstruments if the /recommended call fails outright (network
  // error, route 404, etc.).
  const instrumentsQuery = useQuery({
    queryKey: ['instruments-recommended'],
    queryFn: async () => {
      try {
        return await fetchRecommendedInstruments()
      } catch {
        const fallback = await fetchInstruments()
        return { instruments: fallback, rationale: {}, cached: false }
      }
    },
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

  const rationaleById = instrumentsQuery.data?.rationale ?? {}

  const visible = React.useMemo<InstrumentSummary[]>(() => {
    const all = instrumentsQuery.data?.instruments ?? []
    const byId = new Map(all.map((it) => [it.instrumentId, it]))
    const ordered: InstrumentSummary[] = []
    // The backend returns AI-ordered ids; preserve that ordering by
    // iterating `all` first, then applying client-side skip-logic for
    // PHQ-9. ORDER is no longer the primary sort — it's a backstop for
    // ids the AI didn't include but that still exist (e.g. agency
    // additions that weren't in the recommendation context).
    for (const it of all) {
      if (it.instrumentId === 'phq-9' && !phq9Eligible) continue
      ordered.push(it)
    }
    // Any in-order ids we haven't already shown — keep them visible
    // so users with no AI recommendation still get the full library.
    for (const id of ORDER) {
      if (id === 'phq-9' && !phq9Eligible) continue
      if (!byId.has(id)) continue
      if (ordered.find((o) => o.instrumentId === id)) continue
      ordered.push(byId.get(id) as InstrumentSummary)
    }
    return ordered
  }, [instrumentsQuery.data, phq9Eligible])

  const completedCount = React.useMemo(
    () => visible.filter((it) => completedById.has(it.instrumentId)).length,
    [visible, completedById],
  )

  // COS-360 / SCRUM-518 Phase 2: null when the flag is off, so the render
  // below falls through to today's flat grid untouched.
  const domainGroups = React.useMemo(
    () => (assessmentStrategyV2Enabled ? groupInstrumentsByDomain(visible) : null),
    [assessmentStrategyV2Enabled, visible],
  )

  // SCRUM-521 / COS-380: gate button on the backend's canGenerate truth,
  // falling back to the local heuristic only when assignments aren't loaded
  // yet (offline / pre-load). Basic-tier users always get canGenerate=true
  // from the backend, so they are never newly blocked.
  const assignmentsQuery = useHealthPlanAssignments()
  const buildGate = resolveBuildGate(assignmentsQuery.data, completedCount, MIN_TO_BUILD_PLAN)
  const canBuildPlan = buildGate.canBuild

  // SCRUM-535 / COS-397: refetch the gate inputs every time the catalog
  // regains focus. The reload → check-ins → "Build my plan" path crosses
  // routes: completing the final check-in invalidates ['health-plan-assignments']
  // from the stepper, but invalidation only refetches an *active* observer.
  // When the user returns here the cached canGenerate=false snapshot is
  // re-served, so Build stays blocked even though all check-ins are done.
  // Forcing a refetch on focus makes the gate read the live backend truth.
  useFocusEffect(
    React.useCallback(() => {
      void assignmentsQuery.refetch()
      void assessmentsQuery.refetch()
      // refetch fns are stable across renders for a given query
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentsQuery.refetch, assessmentsQuery.refetch]),
  )

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

      {domainGroups ? (
        // COS-360 / SCRUM-518 Phase 2 — grouped under domain section headers.
        domainGroups.map((group) => (
          <View key={group.key} style={styles.domainGroup}>
            <Text style={[styles.domainHeader, { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }]}>
              {group.label.toUpperCase()}
            </Text>
            <View style={styles.grid}>
              {group.items.map((it) => (
                <CatalogCard
                  key={it.id}
                  item={it}
                  record={completedById.get(it.instrumentId)}
                  rationale={rationaleById[it.instrumentId]}
                  colors={colors}
                  fontSize={getScaledFontSize}
                  fontWeight={getScaledFontWeight}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        // Flag OFF (default) — today's flat grid, unchanged.
        <View style={styles.grid}>
          {visible.map((it) => (
            <CatalogCard
              key={it.id}
              item={it}
              record={completedById.get(it.instrumentId)}
              rationale={rationaleById[it.instrumentId]}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))}
        </View>
      )}

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
              : `Complete ${buildGate.remainingCount} more to build plan`}
          </Text>
        )}
      </Pressable>
      {buildPlan.error ? (
        <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), textAlign: 'center', marginTop: 10 }}>
          {(buildPlan.error as Error & { code?: string })?.code === 'AI_AWAITING_ASSESSMENTS'
            ? `Finish all your assigned check-ins first, then build your plan${buildGate.remainingCount > 0 ? ` — ${buildGate.remainingCount} left` : ''}.`
            : "Couldn’t generate your plan right now. Try again in a moment."}
        </Text>
      ) : null}
    </View>
  )
}

function statusFor(record: AssessmentRecord | undefined): { label: string; color: string } {
  if (!record) return { label: 'Not started', color: '#6B7280' }
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { label: 'Retake', color: '#F59E0B' }
  }
  // SCRUM-268 Phase 2: if the record has a frozen band, surface it in
  // place of the generic "Done" label so users see the result at a glance.
  if (record.band?.label) {
    const severityColor =
      record.band.severity === 'high'
        ? '#DC2626'
        : record.band.severity === 'moderate'
          ? '#F59E0B'
          : '#10B981'
    return { label: record.band.label, color: severityColor }
  }
  return { label: 'Done', color: '#10B981' }
}

function CatalogCard({
  item,
  record,
  rationale,
  colors,
  fontSize,
  fontWeight,
}: {
  item: InstrumentSummary
  record: AssessmentRecord | undefined
  /** AI-generated reason this check-in was recommended for this user (SCRUM-231). */
  rationale: string | undefined
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}) {
  const status = statusFor(record)
  const icon = iconFor(item.instrumentId, colors.tint as string)
  const [showRationale, setShowRationale] = React.useState(false)
  // SCRUM-268: instruments seeded with `comingSoon: true` show in the
  // catalog but aren't tappable until the underlying capability ships
  // (MOCA license, clock-draw UI, full-intake question set).
  const isComingSoon = !!item.comingSoon

  return (
    <Pressable
      onPress={() => {
        if (isComingSoon) return
        router.push({
          pathname: '/Home/assessment-stepper' as never,
          params: { instrumentId: item.instrumentId } as never,
        })
      }}
      disabled={isComingSoon}
      accessibilityRole="button"
      accessibilityLabel={isComingSoon ? `${item.name}. Coming soon.` : `Open ${item.name}`}
      accessibilityState={{ disabled: isComingSoon }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border,
          opacity: isComingSoon ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {rationale && !isComingSoon ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.()
            setShowRationale(true)
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Why this check-in was recommended"
          style={styles.infoBtn}
        >
          <MaterialIcons name="info-outline" size={fontSize(16)} color={colors.subtext} />
        </Pressable>
      ) : null}
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
      {isComingSoon ? (
        <View style={[styles.statusBadge, { borderColor: '#9CA3AF', backgroundColor: '#9CA3AF22' }]}>
          <Text
            style={{
              color: '#6B7280',
              fontSize: fontSize(10),
              fontWeight: fontWeight(700) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Coming Soon
          </Text>
        </View>
      ) : (
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
      )}

      <Modal
        visible={showRationale}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRationale(false)}
      >
        <Pressable
          onPress={() => setShowRationale(false)}
          style={styles.rationaleBackdrop}
        >
          <Pressable
            onPress={() => { /* swallow taps on the sheet itself */ }}
            style={[styles.rationaleSheet, { backgroundColor: (colors.card as string) + 'F2', borderColor: colors.border }]}
          >
            <View style={[styles.iconBubble, { backgroundColor: icon.color + '22', borderColor: icon.color + '55', alignSelf: 'center' }]}>
              <MaterialIcons name={icon.name} size={fontSize(28)} color={icon.color} />
            </View>
            <Text style={{ color: colors.text, fontSize: fontSize(16), fontWeight: fontWeight(700) as any, textAlign: 'center', marginTop: 12 }}>
              {item.name}
            </Text>
            <Text style={{ color: colors.subtext, fontSize: fontSize(11), letterSpacing: 1, textAlign: 'center', marginTop: 6, textTransform: 'uppercase' }}>
              Why this check-in
            </Text>
            <Text style={{ color: colors.text, fontSize: fontSize(14), lineHeight: 20, textAlign: 'center', marginTop: 12 }}>
              {rationale}
            </Text>
            <Pressable
              onPress={() => setShowRationale(false)}
              style={[styles.rationaleClose, { backgroundColor: colors.tint as string }]}
              accessibilityRole="button"
            >
              <Text style={{ color: '#fff', fontSize: fontSize(14), fontWeight: fontWeight(700) as any }}>
                Got it
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  intro: { marginBottom: 12, lineHeight: 19 },
  domainGroup: { marginBottom: 18 },
  domainHeader: { marginBottom: 10, letterSpacing: 0.4 },
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
  infoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rationaleBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rationaleSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  rationaleClose: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
})
