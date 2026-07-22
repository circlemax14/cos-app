/**
 * BiopsychosocialPlanScreen (COS-360 / SCRUM-518, Phase 3) — full-screen
 * rendering of Ken's biopsychosocial Care Plan: a patient greeting + last-
 * generated date, three `SectionCard`s (Biological / Psychological /
 * Social & Spiritual Wellness), and a "Refresh my plan" action (COS-430
 * — Ken's SCRUM-538 language: legacy uses "Refresh my plan" for the same
 * primary CTA; bio now matches for consistency).
 *
 * Rendered by `app/Home/health-plan.tsx` ONLY when `useBiopsychosocialPlanFlag()`
 * is true (which itself requires the upstream `ASSESSMENT_STRATEGY_V2_ENABLED`
 * flag) — otherwise `PlanScreenRedesignedV2` renders unchanged.
 *
 * COS-411: this screen used to own no tier awareness at all — the parent's
 * PlanTypeChooser modal was unreachable once this component rendered
 * (see health-plan.tsx's early-return fix), so users had no way to see or
 * switch their plan tier from here. `currentPlanType` / `onChangePlanType`
 * are threaded in as props so the parent stays the single owner of the
 * chooser's open state (`showChooser`) while this screen can still surface
 * a tier pill and trigger it.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import { useBiopsychosocialPlan, useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { PlanSkeleton } from '@/components/plan-shared/PlanSkeleton';
import { SectionCard, SECTION_STYLE, type BiopsychosocialSectionKey } from './SectionCard';
import { TodaysMedicationsCard } from './TodaysMedicationsCard';
import { BpsWelcomeBanner } from './BpsWelcomeBanner';
import { AssessmentDueBanner } from './AssessmentDueBanner';
import { TaskEditorModal } from './TaskEditorModal';
import { TaskDetailModal } from './tasks/TaskDetailModal';
import { useAiHealthPlan } from '@/hooks/use-plan-tasks';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import type { PlanType } from '@/services/api/plan-type';
import type { PlanTask } from '@/services/api/types';

const SECTION_ORDER: { key: BiopsychosocialSectionKey; title: string }[] = [
  { key: 'biological', title: 'Biological Wellness' },
  { key: 'psychological', title: 'Psychological Wellness' },
  { key: 'social', title: 'Social & Spiritual Wellness' },
];

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}


function formatGeneratedDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Ground truth from cos-backend's `care-plan-categories.ts`: PlanTask.category
 * is one of these 8 keys. NOT 'biological' | 'psychological' | 'social' — those
 * are BPS *section* keys (a different taxonomy). BE POST validation is
 * permissive (z.string().max(64)) so the wrong values won't 4xx, but the
 * care-plan-normalizer's VALID_CATEGORY_KEYS filter drops them and AI
 * regeneration will silently discard tasks tagged with section keys.
 */
type CarePlanCategoryKey =
  | 'medical'
  | 'cognitive'
  | 'adl'
  | 'medication'
  | 'mentalHealth'
  | 'integrative'
  | 'social'
  | 'spiritual';

/**
 * Canonical map from a task's care-plan category → the BPS section it renders
 * under. Unknown/undefined strings fall through a keyword bucket so tasks that
 * arrived tagged with an off-taxonomy label (e.g. Bedrock returning a section
 * key by mistake) still land somewhere reasonable instead of being dropped.
 */
function sectionForCategory(
  category: CarePlanCategoryKey | string | undefined,
): BiopsychosocialSectionKey {
  switch (category) {
    case 'medical':
    case 'medication':
    case 'integrative':
    case 'adl':
    case 'cognitive':
      return 'biological';
    case 'mentalHealth':
      return 'psychological';
    case 'social':
    case 'spiritual':
      return 'social';
    default: {
      if (!category) return 'biological';
      const c = category.toLowerCase();
      if (/med|physical|sleep/.test(c)) return 'biological';
      if (/mental|anxi|depress|stress/.test(c)) return 'psychological';
      if (/social|family|spirit/.test(c)) return 'social';
      return 'biological';
    }
  }
}

/**
 * When the user taps "+ Add task" from a BPS section header, we need a concrete
 * CarePlanCategoryKey to POST — sections are UI groupings, categories are the
 * BE-enforced taxonomy. Each section picks its most-generic category so the
 * task lands back in the same section on re-render.
 */
function categoryForNewTaskInSection(
  section: BiopsychosocialSectionKey,
): CarePlanCategoryKey {
  return { biological: 'medical', psychological: 'mentalHealth', social: 'social' }[section] as CarePlanCategoryKey;
}

/**
 * COS-415: relative "time ago" label for an in-flight regenerate job's
 * `jobStartedAt`. COS-421: with `refetchInterval` polling removed, this is
 * now a one-time snapshot computed whenever `planQuery.data` was last
 * fetched (mount, pull-to-refresh, or a push-triggered invalidation) — it
 * no longer ticks up live while the screen sits idle. Caps at "generating
 * for a while..." past 3 minutes rather than counting up indefinitely — by
 * that point the exact elapsed time isn't useful to the user, just the
 * fact that it's still going.
 */
function formatRelativeStartedAt(iso: string): string {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return 'just now';
  const elapsedMs = Date.now() - started;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  if (elapsedSec < 5) return 'just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 3) return `${elapsedMin}m ago`;
  return 'generating for a while...';
}

/**
 * COS-411: small rounded "Plan: <name> · Change" pill, styled after the
 * prominent plan-type card on the legacy Plan tab (health-plan.tsx
 * ~line 768) but compact enough to sit under the greeting instead of
 * taking a full card row. Tapping it opens the parent's PlanTypeChooser.
 */
function PlanTierPill({
  label,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPress,
  centered,
}: {
  label: string;
  colors: Record<string, string>;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  onPress: () => void;
  /** Center the pill instead of the default left alignment — used in the
   *  empty states, which are already center-aligned columns. */
  centered?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Plan: ${label}. Tap to change.`}
      style={({ pressed }) => [
        styles.tierPill,
        centered && styles.tierPillCentered,
        {
          backgroundColor: (colors.tint ?? '#0D9488') + '14',
          borderColor: (colors.tint ?? '#0D9488') + '33',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: colors.tint,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(700) as any,
        }}
      >
        Plan: {label} · Change
      </Text>
      <MaterialIcons name="swap-horiz" size={getScaledFontSize(14)} color={colors.tint} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

export function BiopsychosocialPlanScreen({
  currentPlanType,
  onChangePlanType,
  onEditGoal,
  patientName,
  headerRight,
}: {
  currentPlanType: PlanType | undefined;
  onChangePlanType: () => void;
  /**
   * COS-469 / Phase 4 — optional slot rendered in the top-right of the
   * header block. Used by the biopsychosocial-plan route to mount
   * `TryUnifiedViewLink` when the default-flip flag is ON. Optional so
   * the health-plan.tsx caller (which reaches this component via the
   * legacy branch) doesn't need to change.
   */
  headerRight?: React.ReactNode;
  /**
   * COS-433: goal editing hoisted to the long-resident `health-plan.tsx`
   * parent — its Modal, its `updatePlanGoal` mutation, and its edit-field
   * state all live there. This screen just fires `onEditGoal(g)` on tap so
   * the parent (already mounted, already resident) manages the sheet, in
   * exactly the same shape legacy `PlanScreenRedesignedV2` already uses.
   * See project_ios26_biopsychosocial_parked.md for the iOS 26.5 crash
   * experiment motivation.
   */
  onEditGoal: (goal: MeasurableGoal) => void;
  /**
   * COS-434 experiment #2: patient's first name for the greeting, hoisted
   * up from an inline `usePatientInfo()` query that used to fire the FIRST
   * time this screen mounted. Now the parent `health-plan.tsx` reads the
   * patient query on every render (warmed long before the bio/legacy
   * branch decides), passes just the first-name string down. Removes the
   * one brand-new query observer this screen used to register on mount —
   * the July 10 forensic (workflow wg1dvszi0) flagged it as one of two
   * unique structural differences bio had vs. legacy.
   */
  patientName: string | null;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'] as unknown as Record<string, string>;
  const planTypeDisplayName = usePlanTypeDisplayName();

  const planQuery = useBiopsychosocialPlan();
  const regenerateMutation = useRegenerateBiopsychosocialPlan();

  // SCRUM-588 Chunk 1c: observer on ['ai-health-plan'] so the plan-tasks
  // mutations' invalidations actually refetch. Legacy consumers use raw
  // fetchAiHealthPlan outside react-query; without this hook the mutations
  // invalidate a key nothing observes and the tasks list would stay stale.
  const aiPlanQuery = useAiHealthPlan();
  const allTasks: PlanTask[] = aiPlanQuery.data?.tasks ?? [];
  const tasksBySection = React.useMemo(() => {
    const b: Record<BiopsychosocialSectionKey, PlanTask[]> = { biological: [], psychological: [], social: [] };
    for (const t of allTasks) {
      b[sectionForCategory(t.category)].push(t);
    }
    return b;
  }, [allTasks]);

  const [refreshing, setRefreshing] = React.useState(false);
  // One consolidated modal state cell. A synchronous detail→edit swap
  // (setTaskModal({mode:'edit'}) fired from TaskDetailModal.onEdit) races
  // iOS's Modal presentation queue: the detail modal is still animating
  // its dismiss when the editor modal tries to present, and iOS silently
  // drops the new presentation. We stage the swap through `pendingTaskModal`
  // instead — close first, then promote after the dismiss animation
  // (~250ms slide-out) completes. TaskDetailModal doesn't surface RN
  // Modal's onDismiss to its parent, so we use a fixed timer that covers
  // both iOS and Android.
  const [taskModal, setTaskModal] = React.useState<{
    mode: 'create' | 'edit' | 'detail';
    task?: PlanTask;
    category?: string;
  } | null>(null);
  const [pendingTaskModal, setPendingTaskModal] = React.useState<{
    mode: 'create' | 'edit' | 'detail';
    task?: PlanTask;
    category?: string;
  } | null>(null);
  React.useEffect(() => {
    if (!pendingTaskModal) return;
    const t = setTimeout(() => {
      setTaskModal(pendingTaskModal);
      setPendingTaskModal(null);
    }, 300);
    return () => clearTimeout(t);
  }, [pendingTaskModal]);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await planQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [planQuery]);

  const onRegenerate = React.useCallback(() => {
    regenerateMutation.mutate(undefined, {
      onError: () => {
        Alert.alert('Error', "Couldn't regenerate your plan right now. Try again in a moment.");
      },
    });
  }, [regenerateMutation]);

  // ── Loading ──────────────────────────────────────────────────────────────
  // CHUNK 39: port v2's static-View PlanSkeleton pattern (chunk 17) to BPS's
  // cold-mount path. The previous <ActivityIndicator size="large"> is the
  // exact iOS-26.5 crash class that flipped BIOPSYCHOSOCIAL_PLAN_ENABLED off
  // on prod on 2026-07-09 — a continuously animating native primitive on the
  // first-paint path. Static Views are safe.
  //
  // Guard on `!planQuery.data` (mirrors PlanScreenV2's `(isLoading || isFetching)
  // && !data` shape) so background refetches do NOT flash the skeleton over
  // already-loaded content — the skeleton is a cold-mount surface only.
  if ((planQuery.isLoading || planQuery.isFetching) && !planQuery.data) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg }}
          refreshControl={
            // CHUNK 39 fix (adversarial-verify minor): every other BPS
            // branch (error/no-tier/empty/loaded) attaches a RefreshControl.
            // Skeleton branch omitted it, so a hung cold-fetch had no
            // in-screen recovery — user had to background the app.
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <PlanSkeleton />
        </ScrollView>
      </AppWrapper>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (planQuery.isError) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <MaterialIcons name="error-outline" size={40} color={colors.error ?? '#DC2626'} />
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
              Couldn&apos;t load your plan
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Pull down to try again.
            </Text>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  const plan = planQuery.data?.plan ?? null;
  const generatedDate = formatGeneratedDate(plan?.generatedAt);
  // COS-415: `generating` is additive on the GET response — undefined on
  // BE deploys that predate this change, which the `=== true` check treats
  // as false. COS-421: this is now a point-in-time snapshot from the last
  // fetch, not a live-updating flag (refetchInterval polling removed in
  // favor of push-triggered invalidation) — it only matters at initial
  // render to detect "another device's job was already running".
  const isRegenerating = planQuery.data?.generating === true;
  /*
   * COS-436: keep the loader state persistent across app close/reopen.
   * Previously `regenerateDisabled = regenerateMutation.isPending` only —
   * on cold start, isPending is false (fresh mutation instance) so the
   * button re-enabled even when the backend job was still running (server
   * returns generating: true). Kenneth reported this 2026-07-10: tapped
   * regenerate → saw loader → closed app → reopened → button back to
   * "Refresh my plan". The fix is to OR in the server-truth `isRegenerating`
   * so the button reflects "a job is in flight, from any source" instead
   * of only "this device's mutation is pending". Any tap during that
   * window still no-ops server-side (409 REGENERATION_IN_FLIGHT), but now
   * the UI never invites the tap.
   */
  const regenerateDisabled = regenerateMutation.isPending || isRegenerating;
  const isGeneratingFromAnySource = regenerateMutation.isPending || isRegenerating;
  // Static banner ("started X ago") only when it's specifically another
  // device's job — this device's own tap already shows the button loader.
  const showOtherDeviceGenerating = isRegenerating && !regenerateMutation.isPending;

  // ── No tier selected yet (COS-411) ──────────────────────────────────────
  // Distinct from the generic "no plan yet" empty state below: without a
  // tier, there's no assigned assessment set for the plan to be built from,
  // so the usual "check back after completing your assessments" copy (and
  // any Generate/Take-assessments CTA) would just dead-end the user. Route
  // them to the chooser instead.
  if (!plan && currentPlanType === undefined) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: (colors.tint ?? '#0D9488') + '18' }]}>
              <MaterialIcons name="tune" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
              Choose your plan first
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Pick a plan tier so we know which check-ins to build your care plan from.
            </Text>
            <TouchableOpacity
              style={[styles.regenerateBtn, { backgroundColor: colors.tint, alignSelf: 'center', paddingHorizontal: Spacing.lg }]}
              onPress={onChangePlanType}
              accessibilityRole="button"
              accessibilityLabel="Choose your plan"
            >
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>Choose plan</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  // ── Empty (has a tier, no plan generated yet) ───────────────────────────
  if (!plan) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: (colors.tint ?? '#0D9488') + '18' }]}>
              <MaterialIcons name="spa" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
              Your care plan is being prepared
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Check back after completing your assessments.
            </Text>
            <PlanTierPill
              label={planTypeDisplayName(currentPlanType as PlanType)}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onPress={onChangePlanType}
              centered
            />
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        {/* Header — patient greeting + last-generated date */}
        <View style={[styles.headerBlock, { flexDirection: 'row', alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(26),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: -0.4,
              }}
            >
              {patientName ? `${greetingForNow()}, ${patientName}` : greetingForNow()}
            </Text>
            {!!generatedDate && (
              <View style={styles.metaRow}>
                <MaterialIcons name="auto-awesome" size={12} color={colors.subtext} />
                <Text style={[styles.metaText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                  Updated {generatedDate}
                  {planQuery.data?.staleness === 'stale' ? ' · may be out of date' : ''}
                </Text>
              </View>
            )}
            <PlanTierPill
              label={planTypeDisplayName(currentPlanType ?? 'basic')}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onPress={onChangePlanType}
            />
          </View>
          {/* COS-469 / Phase 4 — optional Try-unified-view affordance. */}
          {headerRight ? <View>{headerRight}</View> : null}
        </View>

        {/*
          COS-449 (Chunk 1b): one-time welcome banner explaining the BPS
          organization. Dismissible; state persisted via AsyncStorage so
          it only appears once per install. Deliberately does NOT claim a
          data migration — legacy + BPS are peer AI plans (COS-438) and
          this banner is purely user-education.
        */}
        <BpsWelcomeBanner
          colors={colors}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/*
          COS-448: Today's Medications card sits AT THE TOP of the plan
          (above the wellbeing map link) so patients — especially older
          adults — see meds at a glance without scrolling into Bio. Data
          from usePlanMedications (COS-357). Renders null when the meds
          feature flag is off or the endpoint hasn't answered yet, so
          older-app / flag-off users see NO change (back-compat).
        */}
        <TodaysMedicationsCard
          colors={colors}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/*
          COS-442: Wellbeing map entry point. Was a tiny "See your Wellbeing
          map" text link inside the header block — Kenneth 2026-07-10:
          "I was not aware we can click it and what does it do and how it
          will be helpful to patients." Promoted to a proper card with
          icon + title + explanatory subtitle so users can tell what it is
          before tapping. Mirrors ViewBioInsightsLink's layout on the
          legacy plan (COS-438) for visual consistency across the
          bio-related entry points. Route is read-only — safe to open
          mid-generate.
        */}
        <Pressable
          onPress={() => router.push('/Home/wellbeing-map' as never)}
          accessibilityRole="button"
          accessibilityLabel="Open your Wellbeing map"
          accessibilityHint="Shows how your goals cluster across the NovoPsych model"
          style={({ pressed }) => [
            styles.mapCard,
            {
              backgroundColor: (colors.tint as string) + '14',
              borderColor: (colors.tint as string) + '33',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.mapIconChip,
              { backgroundColor: (colors.tint as string) + '22' },
            ]}
          >
            <MaterialIcons name="hub" size={getScaledFontSize(22)} color={colors.tint} />
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              Your Wellbeing map
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 2,
                lineHeight: 17,
              }}
            >
              See how your goals cluster across body, mind, and social
              wellbeing — and which areas may need attention.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.tint} />
        </Pressable>

        {/*
          COS-430: monthly re-assessment nudge. Dark behind
          ASSESSMENT_DUE_BANNER_ENABLED — renders null when off, when
          nothing is due, or when the assessments query errors out. Safe
          to render on every plan-screen mount.
        */}
        <AssessmentDueBanner
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Three section cards */}
        {SECTION_ORDER.map(({ key, title }) => (
          <SectionCard
            key={key}
            sectionKey={key}
            title={title}
            section={plan.sections[key]}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onEditGoal={onEditGoal}
            tasks={tasksBySection[key]}
            onAddTask={() => setTaskModal({ mode: 'create', category: categoryForNewTaskInSection(key) })}
            onTaskPress={(t) => setTaskModal({ mode: 'detail', task: t })}
          />
        ))}

        {/* Another device's regeneration in flight — static message, no
            live polling (COS-421). Snapshot only; updates on next fetch
            (pull-to-refresh, push invalidation, or remount). */}
        {showOtherDeviceGenerating && (
          <View
            style={[
              styles.generatingBanner,
              { backgroundColor: (colors.tint ?? '#0D9488') + '14', borderColor: (colors.tint ?? '#0D9488') + '33' },
            ]}
            accessibilityRole="text"
            accessibilityLabel="A generation is already in progress on another device. Pull down to refresh once it's done."
          >
            <MaterialIcons name="info-outline" size={16} color={colors.tint} />
            <Text style={[styles.generatingBannerText, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              A generation is already in progress
              {planQuery.data?.jobStartedAt
                ? ` (started ${formatRelativeStartedAt(planQuery.data.jobStartedAt)})`
                : ''}
              . Pull down to refresh once it&apos;s done.
            </Text>
          </View>
        )}

        {/* Refresh my plan — COS-430 copy, COS-436 persistent generating state. */}
        <TouchableOpacity
          style={[styles.regenerateBtn, { backgroundColor: colors.tint, opacity: regenerateDisabled ? 0.7 : 1 }]}
          onPress={onRegenerate}
          disabled={regenerateDisabled}
          accessibilityRole="button"
          accessibilityLabel={isGeneratingFromAnySource ? 'Generating your plan' : 'Refresh my plan'}
          accessibilityState={{ disabled: regenerateDisabled, busy: isGeneratingFromAnySource }}
        >
          {isGeneratingFromAnySource ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>
                Generating your plan…
              </Text>
            </>
          ) : (
            <>
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>Refresh my plan</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
      {/*
        COS-433: goal-editor Modal + its state + its updateGoalMutation
        have been HOISTED into the long-resident `health-plan.tsx` parent
        (mirrors legacy PlanScreenRedesignedV2 exactly). This screen no
        longer instantiates a Modal host in its own subtree — it just
        fires `onEditGoal(g)` prop callback on tap. See file header for
        the iOS 26.5 EXUpdates experiment rationale.
      */}
      {/*
        SCRUM-588 Chunk 1c: task editor + detail modals live at the
        screen level so all three BPS SectionCards share one instance
        of each. If a Class-B iOS 26 crash resurfaces, the reversible
        defensive pattern is to hoist these to `biopsychosocial-plan.tsx`
        (mirroring the goal-editor hoist above).
      */}
      <TaskEditorModal
        visible={taskModal?.mode === 'create' || taskModal?.mode === 'edit'}
        onClose={() => setTaskModal(null)}
        initialTask={taskModal?.mode === 'edit' ? taskModal.task : undefined}
        defaultCategory={taskModal?.mode === 'create' ? taskModal.category : undefined}
        colors={colors}
        isDark={settings.isDarkTheme}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        onSaved={() => setTaskModal(null)}
      />
      <TaskDetailModal
        visible={taskModal?.mode === 'detail'}
        task={taskModal?.mode === 'detail' ? taskModal.task ?? null : null}
        accentColor={
          taskModal?.mode === 'detail' && taskModal.task
            ? SECTION_STYLE[sectionForCategory(taskModal.task.category)].color
            : '#0D9488'
        }
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        onClose={() => setTaskModal(null)}
        onEdit={(t) => {
          // Stage the detail→edit swap: close the detail modal now, then
          // let the useEffect above promote the edit modal once the
          // dismiss animation is done (see comment on pendingTaskModal).
          setTaskModal(null);
          setPendingTaskModal({ mode: 'edit', task: t });
        }}
        onDeleted={() => setTaskModal(null)}
      />
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  loadingText: { marginTop: 12 },
  headerBlock: { marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  metaText: {},
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  mapIconChip: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: { textAlign: 'center', marginBottom: 6 },
  emptyBody: { textAlign: 'center', lineHeight: 20 },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    paddingVertical: 14,
    marginTop: Spacing.sm,
    gap: 8,
  },
  regenerateBtnText: { color: '#fff', fontWeight: '700' },
  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: Spacing.sm,
    gap: 8,
  },
  generatingBannerText: { flex: 1, lineHeight: 18 },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  tierPillCentered: { alignSelf: 'center' },
});
