/**
 * InlineAssessmentCatalog — CHUNK 36 (2026-07-21).
 *
 * v2-safe rewrite of components/health-plan/AssessmentCatalogContent.tsx
 * for the "non-basic tier, no plan yet" empty-state slot in PlanScreenV2.
 * Legacy shows the same catalog inline via app/Home/health-plan.tsx line
 * 724 — v2 previously fell through to HasTierNoPlanEmptyState ("Your care
 * plan is being prepared") which was a parity gap: advanced/agency users
 * on the v2 surface couldn't start check-ins from the plan tab.
 *
 * ── Diff vs legacy AssessmentCatalogContent ──────────────────────────
 * STRIPPED (forbidden primitives / crash risks on iOS 26.5):
 *   • `Modal` per-card rationale sheet — REPLACED with an in-card inline
 *     rationale overlay that swaps the icon/name/status for the rationale
 *     Text + Close on info-button tap. Preserves aspectRatio: 1 so grid
 *     layout doesn't reflow. Rationale is still discoverable — AISuggestionStrip
 *     upstream returns null when there's no plan (deriveSuggestions() bails
 *     on empty planBullets, see AISuggestionStrip.tsx line 53), so it would
 *     otherwise leave per-instrument rationale unreachable on this branch.
 *   • `useMutation` around `generateAiHealthPlan` / `regenerateBiopsychosocialPlan`
 *     — Build CTA now calls `props.onBuildPlan()`. Parent (PlanScreenV2)
 *     wires that to `handleGenerate`, which uses the chunk-32/34/35
 *     `fireAndForgetPost` + staged-refetch machinery. This is the whole
 *     reason v2 exists — chunk 9.5 proved awaiting axios inside a tap
 *     handler is a repeatable iOS 26.5 SIGABRT source.
 *   • `useFocusEffect` — PlanScreenV2's own focus effect (chunk 35) refetches
 *     assignments; chunk 36 extends it to also invalidate the two query keys
 *     this component reads (`['assessments']`, `['instruments-recommended']`)
 *     so the completed-count subhead refreshes after a check-in.
 *
 * KEPT VERBATIM (pure, iOS-26.5-neutral):
 *   • `ORDER`, `ICON_BY_ID`, `iconFor`
 *   • `DOMAIN_BUCKET_LABEL`, `groupInstrumentsByDomain`
 *   • PHQ-2 → PHQ-9 skip-logic
 *   • `resolveBuildGate` (via @/lib/build-plan-gate)
 *   • `statusFor`
 *   • coming-soon card gating (Modal-less alert path was already absent)
 *
 * ── Query staleTimes ────────────────────────────────────────────────
 *   • `['instruments-recommended']` — 5 minutes (matches legacy line 175)
 *   • `['assessments']` — 60_000 (60s). Legacy uses 30_000; we choose 60s
 *     to align with the v2 AssessmentDueBanner and BPS reads, avoiding a
 *     QPS uptick on /v1/assessments when the banner flag flips ON.
 *
 * ── Follow-up ───────────────────────────────────────────────────────
 * Chunk 37 SCRUM story tracks (a) extracting the pure helpers into a
 * shared module both surfaces import, and (b) retiring the legacy
 * AssessmentCatalogContent once v2 default-flips.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  fetchInstruments,
  fetchRecommendedInstruments,
  type InstrumentSummary,
} from '@/services/api/instruments';
import {
  fetchAssessments,
  type AssessmentRecord,
} from '@/services/api/assessments';
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments';
import { resolveBuildGate } from '@/lib/build-plan-gate';
import { useAssessmentStrategyV2Flag } from '@/hooks/use-assessment-strategy-v2-flag';

// SCRUM-230 parity — Build gate needs at least 2 completed check-ins on
// the legacy (non-biopsychosocial) path. v2 delegates Build to the parent
// so this constant only feeds the gate copy ("Complete N more to build plan").
const MIN_TO_BUILD_PLAN = 2;

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
];

const ICON_BY_ID: Record<
  string,
  { name: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
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
};

function iconFor(
  id: string,
  tint: string,
): { name: keyof typeof MaterialIcons.glyphMap; color: string } {
  return ICON_BY_ID[id] ?? { name: 'assignment', color: tint };
}

type Palette = (typeof Colors)['light'] | (typeof Colors)['dark'];

type CatalogDomainBucket = 'biological' | 'psychological' | 'social' | 'other';

const DOMAIN_BUCKET_LABEL: Record<CatalogDomainBucket, string> = {
  biological: 'Biological',
  psychological: 'Psychological',
  social: 'Social & Spiritual',
  other: 'Other',
};

interface CatalogDomainGroup {
  key: CatalogDomainBucket;
  label: string;
  items: InstrumentSummary[];
}

function groupInstrumentsByDomain(
  items: InstrumentSummary[],
): CatalogDomainGroup[] {
  const buckets: Record<CatalogDomainBucket, InstrumentSummary[]> = {
    biological: [],
    psychological: [],
    social: [],
    other: [],
  };
  for (const it of items) {
    if (it.domain === 'biological') buckets.biological.push(it);
    else if (it.domain === 'psychological') buckets.psychological.push(it);
    else if (it.domain === 'social' || it.domain === 'spiritual')
      buckets.social.push(it);
    else buckets.other.push(it);
  }
  return (['biological', 'psychological', 'social', 'other'] as const)
    .map((key) => ({ key, label: DOMAIN_BUCKET_LABEL[key], items: buckets[key] }))
    .filter((g) => g.items.length > 0);
}

export interface InlineAssessmentCatalogProps {
  /**
   * Parent-owned Build CTA — PlanScreenV2 wires this to its `handleGenerate`
   * (fire-and-forget POST + staged refetch, chunks 32/34/35). Do NOT wire
   * a mutation or an axios call inside this component (iOS 26.5 SIGABRT).
   */
  onBuildPlan: () => void;
  /**
   * True while the parent's generation POST or a cross-device generation is
   * in-flight. Disables the Build CTA + shows spinner.
   */
  generating: boolean;
  /** Optional headline copy shown above the grid. */
  intro?: string;
}

export function InlineAssessmentCatalog({
  onBuildPlan,
  generating,
  intro,
}: InlineAssessmentCatalogProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const assessmentStrategyV2Enabled = useAssessmentStrategyV2Flag();

  const instrumentsQuery = useQuery({
    queryKey: ['instruments-recommended'],
    queryFn: async () => {
      try {
        return await fetchRecommendedInstruments();
      } catch {
        const fallback = await fetchInstruments();
        return { instruments: fallback, rationale: {}, cached: false };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 60_000,
  });

  const completedById = React.useMemo(() => {
    const m = new Map<string, AssessmentRecord>();
    for (const r of assessmentsQuery.data ?? []) m.set(r.instrumentId, r);
    return m;
  }, [assessmentsQuery.data]);

  // PHQ-9 hidden until PHQ-2 completed AND positive (sum ≥ 3) — VERBATIM
  // legacy skip-logic.
  const phq2 = completedById.get('phq-2');
  const phq2Sum =
    (typeof phq2?.responses?.q1 === 'number' ? phq2.responses.q1 : 0) +
    (typeof phq2?.responses?.q2 === 'number' ? phq2.responses.q2 : 0);
  const phq9Eligible = phq2Sum >= 3;

  const rationaleById = instrumentsQuery.data?.rationale ?? {};

  const visible = React.useMemo<InstrumentSummary[]>(() => {
    const all = instrumentsQuery.data?.instruments ?? [];
    const byId = new Map(all.map((it) => [it.instrumentId, it]));
    const ordered: InstrumentSummary[] = [];
    for (const it of all) {
      if (it.instrumentId === 'phq-9' && !phq9Eligible) continue;
      ordered.push(it);
    }
    for (const id of ORDER) {
      if (id === 'phq-9' && !phq9Eligible) continue;
      if (!byId.has(id)) continue;
      if (ordered.find((o) => o.instrumentId === id)) continue;
      ordered.push(byId.get(id) as InstrumentSummary);
    }
    return ordered;
  }, [instrumentsQuery.data, phq9Eligible]);

  const completedCount = React.useMemo(
    () => visible.filter((it) => completedById.has(it.instrumentId)).length,
    [visible, completedById],
  );

  const domainGroups = React.useMemo(
    () =>
      assessmentStrategyV2Enabled ? groupInstrumentsByDomain(visible) : null,
    [assessmentStrategyV2Enabled, visible],
  );

  const assignmentsQuery = useHealthPlanAssignments();
  const buildGate = resolveBuildGate(
    assignmentsQuery.data,
    completedCount,
    MIN_TO_BUILD_PLAN,
  );

  const canBuildPlan = buildGate.canBuild;

  if (instrumentsQuery.isLoading || assessmentsQuery.isLoading) {
    return (
      <View style={{ alignItems: 'center', padding: 24 }}>
        <ActivityIndicator size="large" color={colors.tint as string} />
      </View>
    );
  }

  if (visible.length === 0) {
    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            textAlign: 'center',
          }}
        >
          No check-ins are available right now. Check back later.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {intro ? (
        <Text
          style={[
            styles.intro,
            { color: colors.subtext, fontSize: getScaledFontSize(13) },
          ]}
        >
          {intro}
        </Text>
      ) : null}

      <View style={[styles.progressBar, { borderColor: colors.border }]}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {completedCount} of {visible.length} completed
        </Text>
      </View>

      {domainGroups ? (
        domainGroups.map((group) => (
          <View key={group.key} style={styles.domainGroup}>
            <Text
              style={[
                styles.domainHeader,
                {
                  color: colors.subtext,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                },
              ]}
            >
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
        onPress={onBuildPlan}
        disabled={!canBuildPlan || generating}
        style={[
          styles.buildBtn,
          {
            backgroundColor: canBuildPlan
              ? (colors.tint as string)
              : ((colors.subtext as string) + '60'),
            opacity: generating ? 0.6 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canBuildPlan || generating }}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            style={{
              color: '#fff',
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            {canBuildPlan
              ? 'Build my plan'
              : `Complete ${buildGate.remainingCount} more to build plan`}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function statusFor(
  record: AssessmentRecord | undefined,
): { label: string; color: string } {
  if (!record) return { label: 'Not started', color: '#6B7280' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { label: 'Retake', color: '#F59E0B' };
  }
  if (record.band?.label) {
    const severityColor =
      record.band.severity === 'high'
        ? '#DC2626'
        : record.band.severity === 'moderate'
          ? '#F59E0B'
          : '#10B981';
    return { label: record.band.label, color: severityColor };
  }
  return { label: 'Done', color: '#10B981' };
}

function CatalogCard({
  item,
  record,
  rationale,
  colors,
  fontSize,
  fontWeight,
}: {
  item: InstrumentSummary;
  record: AssessmentRecord | undefined;
  rationale: string | undefined;
  colors: Palette;
  fontSize: (n: number) => number;
  fontWeight: (n: number) => number | string;
}) {
  const status = statusFor(record);
  const icon = iconFor(item.instrumentId, colors.tint as string);
  // Inline rationale overlay — v2-safe replacement for legacy's Modal.
  // Toggle swaps the card body between icon/name/status and rationale
  // text + Close, so grid aspectRatio never reflows.
  const [showRationale, setShowRationale] = React.useState(false);
  const isComingSoon = !!item.comingSoon;
  const canShowRationale = !!rationale && !isComingSoon;

  return (
    <Pressable
      onPress={() => {
        if (isComingSoon) return;
        // While rationale overlay is showing, tap-anywhere closes it
        // instead of navigating (matches legacy Modal backdrop UX).
        if (showRationale) {
          setShowRationale(false);
          return;
        }
        router.push({
          pathname: '/Home/assessment-stepper' as never,
          params: { instrumentId: item.instrumentId } as never,
        });
      }}
      disabled={isComingSoon}
      accessibilityRole="button"
      accessibilityLabel={
        isComingSoon ? `${item.name}. Coming soon.` : `Open ${item.name}`
      }
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
      {canShowRationale ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            setShowRationale((v) => !v);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            showRationale
              ? 'Close rationale'
              : 'Why this check-in was recommended'
          }
          style={styles.infoBtn}
        >
          <MaterialIcons
            name={showRationale ? 'close' : 'info-outline'}
            size={fontSize(16)}
            color={colors.subtext}
          />
        </Pressable>
      ) : null}

      {showRationale && canShowRationale ? (
        <View style={styles.rationaleInline}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: fontSize(10),
              letterSpacing: 1,
              textAlign: 'center',
              marginTop: 2,
              textTransform: 'uppercase',
            }}
          >
            Why this
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize(12),
              lineHeight: 16,
              textAlign: 'center',
              marginTop: 6,
            }}
            numberOfLines={5}
          >
            {rationale}
          </Text>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.iconBubble,
              {
                backgroundColor: icon.color + '22',
                borderColor: icon.color + '55',
              },
            ]}
          >
            <MaterialIcons
              name={icon.name}
              size={fontSize(28)}
              color={icon.color}
            />
          </View>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontSize: fontSize(14),
              fontWeight: fontWeight(700) as TextStyle['fontWeight'],
              textAlign: 'center',
              marginTop: 10,
              minHeight: fontSize(18) * 2,
            }}
          >
            {item.name}
          </Text>
          {isComingSoon ? (
            <View
              style={[
                styles.statusBadge,
                { borderColor: '#9CA3AF', backgroundColor: '#9CA3AF22' },
              ]}
            >
              <Text
                style={{
                  color: '#6B7280',
                  fontSize: fontSize(10),
                  fontWeight: fontWeight(700) as TextStyle['fontWeight'],
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Coming Soon
              </Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { borderColor: status.color }]}>
              <View
                style={[styles.statusDot, { backgroundColor: status.color }]}
              />
              <Text
                style={{
                  color: status.color,
                  fontSize: fontSize(10),
                  fontWeight: fontWeight(700) as TextStyle['fontWeight'],
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {status.label}
              </Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
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
    zIndex: 2,
  },
  rationaleInline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
