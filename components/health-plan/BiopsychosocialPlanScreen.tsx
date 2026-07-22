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
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
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
import { MedicationsSection } from './MedicationsSection';
import { BpsWelcomeBanner } from './BpsWelcomeBanner';
import { BpsTodayHeroCard } from './BpsTodayHeroCard';
import { BpsAiSummaryBanner } from './BpsAiSummaryBanner';
import { BpsNotificationCategoriesCard } from './BpsNotificationCategoriesCard';
import { AssessmentDueBanner } from './AssessmentDueBanner';
import { TaskEditorModal, TaskEditorBody } from './TaskEditorModal';
import { TaskDetailModal, TaskDetailBody } from './tasks/TaskDetailModal';
import { BioGoalEditorBody } from './BioGoalEditorModal';
import { useAiHealthPlan } from '@/hooks/use-plan-tasks';
import { fetchTasksForDate } from '@/services/api/ai-health-plan';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import type { PlanType } from '@/services/api/plan-type';
import type { PlanTask, TaskOccurrence } from '@/services/api/types';

/**
 * CHUNK 47 kill-switch — port of the SCRUM-252 Today hero card into the
 * BPS surface. One-line OTA flip if the hero regresses in the wild.
 */
const BPS_TODAY_HERO_ENABLED = true;

/**
 * CHUNK 48 kill-switch — port of the legacy AI-summary teal card
 * (PlanScreenRedesignedV2.tsx:422-433) onto the BPS surface. Also
 * carries the Apple 1.4.1 disclaimer + citations footer, which BPS
 * had been missing on its AI-generated bullets. One-line OTA flip if
 * the banner or citations footer regress in the wild. Recovery cost:
 * ~30-60s via `npm run eas:update:production` (JS module constant, so
 * OTA — not SSM). Two-layer defense: BpsAiSummaryBanner itself
 * null-renders when summary is empty, so a data-source outage
 * short-circuits without any flip needed.
 */
const BPS_AI_SUMMARY_ENABLED = true;

/**
 * CHUNK 50 kill-switch — surfaces a compact "View Progress" link in the
 * BPS header row that pushes to `/Home/bps-progress`. Renamed from the
 * originally-proposed BPS_PROGRESS_TAB_ENABLED because there is no tab
 * bar in this surface (unlike legacy health-plan.tsx which owns a
 * Plan/Progress tab pair) — the entry point is a single link. Flipping
 * to false hides the header link; the /Home/bps-progress route file
 * itself remains bundled but becomes UI-orphan (defensive redirect
 * inside that route still handles deep-link entries). Recovery cost:
 * ~30-60s via `npm run eas:update:production`.
 */
const BPS_PROGRESS_LINK_ENABLED = true;

/**
 * CHUNK 51 kill-switch — port of the COS-373 legacy read-only
 * "Here's what you'll be notified about" glimpse card
 * (app/Home/health-plan.tsx:1091-1136) onto the BPS surface. The card
 * self-guards on both the shared client kill-switch
 * (NOTIFICATION_CATEGORIES_ENABLED) and the server `flagEnabled` bit,
 * so a BE flip alone will hide it on both BPS and legacy. This flag is
 * BPS-only: flip false to hide the card on BPS while legacy keeps
 * rendering. Recovery cost: ~30-60s via
 * `npm run eas:update:production` (JS module constant, OTA not SSM).
 */
const BPS_NOTIFICATION_CATEGORIES_ENABLED = true;

/**
 * CHUNK 52 kill-switch — ports the legacy full Medications editor
 * (`MedicationsSection`, mounted today on legacy at
 * PlanScreenRedesignedV2.tsx and app/Home/health-plan.tsx) onto BPS.
 * Ken's audit flagged this as the LARGEST feature gap between BPS
 * and legacy: BPS could VIEW meds via TodaysMedicationsCard but had
 * no way to Add / Edit / Remove. This mounts the same editor
 * component (single source of truth — no fork/wrapper) directly
 * below the read-only glimpse, preserving the "see-then-edit"
 * narrative.
 *
 * iOS 26.5 safety: `MedicationsSection` uses only Modal
 * (animationType='fade', transparent) at its editor + supply
 * surfaces — no Animated / Reanimated / Portal / ActivityIndicator
 * / gradient / blur / rotate. Chunk 46.1 already scrubbed
 * ActivityIndicator from its Save/Add buttons (pending affordance =
 * parent Pressable opacity 0.6 + disabled). Same Modal shape is
 * already prod-hardened on legacy iOS 26.5 mounts, so porting adds
 * ZERO new native rendering surface.
 *
 * Two-layer kill defense: (a) this JS module const — one-line OTA
 * flip hides the editor on BPS while legacy keeps working; (b) the
 * server `flagEnabled` bit on `usePlanMedications` — a BE flip
 * hides the editor on BOTH BPS and legacy in the same second.
 * `MedicationsSection` itself null-renders while flagEnabled is
 * false / loading / errored, so no layout-shift work is needed and
 * older / flag-off users see zero change (back-compat).
 *
 * Recovery cost: ~30-60s via `npm run eas:update:production` (OTA,
 * not SSM). Legacy mount sites (PlanScreenRedesignedV2.tsx,
 * app/Home/health-plan.tsx) are untouched — additive parity, not a
 * swap.
 *
 * NOTE: the legacy "Review your medications" prompt + scroll-to
 * (`onLayout` / `openAddSignal` props on MedicationsSection) is
 * intentionally NOT wired here — deferred to chunk 53 which will
 * port MedicationsReviewPrompt as a sibling above this mount and
 * pass those props at that time.
 */
const BPS_MEDICATIONS_EDITOR_ENABLED = true;

/**
 * CHUNK 53 (2026-07-22) kill-switch — consolidates the three parent-hoisted
 * Modals (TaskEditorModal, TaskDetailModal, BioGoalEditorModal) into a
 * SINGLE parent-hoisted <Modal> node whose child is switched on an
 * `editor.kind` discriminated union. Motivation: iOS 26.5 SIGABRT has fired
 * in the wild when multiple `<Modal transparent>` nodes coexist in the
 * tree at once (working hypothesis, matches project_ios26_biopsychosocial_
 * parked forensic — no MEMORY file yet confirms the exact crash class).
 * With this flag ON, only one Modal node ever mounts; the interior swaps.
 *
 * Kill-switch behavior:
 *   true  → single consolidated Modal (default). BiopsychosocialPlanScreen
 *           also owns bio-goal editor state (fed by `onEditGoal` prop from
 *           the route parent, intercepted locally). Route parent's own
 *           BioGoalEditorModal must be skipped — see biopsychosocial-plan.tsx.
 *   false → original three-Modal shape. onEditGoal fires up to the route
 *           parent as before, TaskEditorModal + TaskDetailModal mount from
 *           this screen. Byte-for-byte behavioral identity with pre-chunk-53.
 *
 * Compile-time constant → revert requires an OTA (~30-60s via
 * `npm run eas:update:production`), NOT the 30-second SSM/Lambda flip
 * available for server-side flags. Acceptable for a client-only refactor
 * but must be called out in the ship report.
 */
export const BPS_MODAL_CONSOLIDATION_ENABLED = true;

/** Local YYYY-MM-DD for today. Matches auth-prefetch.ts:37 so the
 *  ['plan-tasks', todayIso()] cache key lines up with the pre-warmed
 *  entry — the hero rides that warm read on first render. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/**
 * CHUNK 50: compact "View Progress" affordance styled after PlanTierPill so
 * the two sit naturally in the same header row (or wrap to a stacked column
 * on narrow widths — flexWrap on the parent row handles that). Tapping
 * pushes to /Home/bps-progress, which renders legacy ProgressTab against
 * BPS-warmed today-tasks data.
 */
function ViewProgressLink({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPress,
}: {
  colors: Record<string, string>;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel="View Progress"
      accessibilityHint="Opens adherence, streak, and self-reported metrics"
      style={({ pressed }) => [
        styles.tierPill,
        {
          backgroundColor: (colors.tint ?? '#0D9488') + '14',
          borderColor: (colors.tint ?? '#0D9488') + '33',
          marginLeft: 8,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <MaterialIcons
        name="trending-up"
        size={getScaledFontSize(14)}
        color={colors.tint}
        style={{ marginRight: 4 }}
      />
      <Text
        style={{
          color: colors.tint,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(700) as any,
        }}
      >
        View Progress
      </Text>
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

  // CHUNK 47: today's task OCCURRENCES (with .status) for the Today
  // hero card. `allTasks` above is PlanTask[] — the plan template — and
  // has no per-day completion state, so it can't drive the hero's
  // done/skipped/to-go counts. We fetch occurrences under the shared
  // ['plan-tasks', todayIso()] key so we ride the warm cache written
  // by auth-prefetch.ts:96 on sign-in (no cold fetch on first render
  // in the common path). Off-tree failure returns [] and the hero
  // renders null — no throw, no empty-state noise.
  const todayTasksQuery = useQuery<TaskOccurrence[]>({
    queryKey: ['plan-tasks', todayIso()],
    queryFn: () => fetchTasksForDate(todayIso()),
    staleTime: 60_000,
    // Only run when the flag is on — cheap OTA kill-switch (no observer
    // registered when disabled). Also gate on `enabled`-time plan
    // presence check happening downstream (the hero renders only
    // inside the loaded ScrollView branch).
    enabled: BPS_TODAY_HERO_ENABLED,
  });
  const todayTasks: TaskOccurrence[] = todayTasksQuery.data ?? [];
  const tasksBySection = React.useMemo(() => {
    const b: Record<BiopsychosocialSectionKey, PlanTask[]> = { biological: [], psychological: [], social: [] };
    for (const t of allTasks) {
      b[sectionForCategory(t.category)].push(t);
    }
    return b;
  }, [allTasks]);

  const [refreshing, setRefreshing] = React.useState(false);

  // ── CHUNK 53: consolidated editor state ─────────────────────────────────
  // Under BPS_MODAL_CONSOLIDATION_ENABLED, ONE parent-hoisted <Modal> hosts
  // any one of task-editor / task-detail / bio-goal at a time. Discriminated
  // union keeps the create vs. edit vs. detail sessions strictly disjoint
  // (no optional-field collapse) so downstream renders can pattern-match
  // safely.
  //
  // The 300ms `pendingEditor → editor` promotion timer preserves the
  // load-bearing iOS Modal-race guard from the old `pendingTaskModal`
  // pattern: a synchronous detail→edit swap fires from TaskDetailBody
  // (setEditor(null) then setPendingEditor({kind:'task-editor', task})),
  // and iOS silently drops the second presentation if the first hasn't
  // finished dismissing. DO NOT collapse this into a single setState — the
  // 300ms cover accounts for both iOS (~250ms slide-out) and Android.
  type BpsEditor =
    | { kind: 'task-editor'; task?: PlanTask; category?: string }
    | { kind: 'task-detail'; task: PlanTask }
    | { kind: 'bio-goal'; goal: MeasurableGoal };
  const [editor, setEditor] = React.useState<BpsEditor | null>(null);
  const [pendingEditor, setPendingEditor] = React.useState<BpsEditor | null>(null);
  // CHUNK 53 adversarial-verify nit #1 fix: retain the last non-null editor
  // so the consolidated Modal renders its outgoing body during the ~250ms
  // slide-out animation on close. Without this, the child branch swaps to
  // <View /> in the same commit that flips visible=false, and the user sees
  // a blank overlay slide down instead of the outgoing body.
  //
  // sessionNonce (monotonic per open) is spliced into each Body's key so
  // successive sessions of the SAME identity (same task id, same goal id,
  // same category slot) still remount cleanly — TaskDetailBody's
  // `confirming` (chunk 38 delete arm), TaskEditorBody's savedThisSession
  // + form drafts, BioGoalEditorBody's draft fields all reset per session.
  // Increments each null→non-null transition. Without this, the polish
  // fix would leak session-scoped state across reopens (e.g. delete-arm
  // survives a dismiss-then-reopen of the same task — one stray tap
  // deletes the task).
  const lastNonNullEditor = React.useRef<BpsEditor | null>(null);
  const editorSessionNonce = React.useRef(0);
  const prevEditorWasNull = React.useRef(true);
  if (editor !== null) {
    lastNonNullEditor.current = editor;
    if (prevEditorWasNull.current) editorSessionNonce.current += 1;
    prevEditorWasNull.current = false;
  } else {
    prevEditorWasNull.current = true;
  }
  const bodyEditor = editor ?? lastNonNullEditor.current;
  const bodyKeySuffix = editorSessionNonce.current;
  React.useEffect(() => {
    if (!pendingEditor) return;
    const t = setTimeout(() => {
      // CHUNK 53 adversarial-verify minor #4/#6 fix: session-clobber guard.
      // If the user opened a NEW editor (task detail, bio goal, add-task)
      // during the 300ms cover window after a detail→edit swap started,
      // don't overwrite that fresh session with the pending detail→edit
      // promotion. Functional setState reads the latest editor value at
      // the moment the timer fires, avoiding the stale-closure trap the
      // pre-fix `setEditor(pendingEditor)` had. If the guard fires,
      // pendingEditor drops silently — the swap effectively cancels.
      setEditor((current) => (current !== null ? current : pendingEditor));
      setPendingEditor(null);
    }, 300);
    return () => clearTimeout(t);
  }, [pendingEditor]);
  const closeEditor = React.useCallback(() => setEditor(null), []);

  // ── Legacy (flag=false) modal state ─────────────────────────────────────
  // Only these two cells drive the flag-off path (bio-goal continues to be
  // route-parent-owned in that mode via onEditGoal). Kept in-tree at all
  // times so revert = single-flag flip with no state migration.
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

  // CHUNK 40 (2026-07-21): fire-and-forget under the hood via the hook's
  // rewritten mutationFn (see use-biopsychosocial-plan.ts). Alert.alert
  // onError removed — Alert opens a native modal whose turbomodule
  // interactions were exactly the crash surface we're trying to leave.
  // Errors are reconciled on the next ['biopsychosocial-plan'] fetch.
  const onRegenerate = React.useCallback(() => {
    regenerateMutation.mutate();
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
            {/* CHUNK 50: PlanTierPill + optional ViewProgressLink share a
                row that wraps to a second row on narrow widths (iPhone SE
                class) when both pills + the headerRight banner would
                otherwise overflow. */}
            <View style={styles.tierRow}>
              <PlanTierPill
                label={planTypeDisplayName(currentPlanType ?? 'basic')}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                onPress={onChangePlanType}
              />
              {BPS_PROGRESS_LINK_ENABLED && (
                <ViewProgressLink
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onPress={() => router.push('/Home/bps-progress' as never)}
                />
              )}
            </View>
          </View>
          {/* COS-469 / Phase 4 — optional Try-unified-view affordance. */}
          {headerRight ? <View>{headerRight}</View> : null}
        </View>

        {/*
          CHUNK 47 (SCRUM-252 port): Today hero card — big focal
          percent-complete number + progress bar + done/to-go/skipped
          triplet. Sits ABOVE BpsWelcomeBanner so it owns the "how am I
          doing today" glance-signal that BPS was missing. Returns null
          when today has zero task occurrences (matches legacy hero's
          `tasks.length > 0` guard, so patients without a plan-driven
          schedule see NO change). Kill-switch: `BPS_TODAY_HERO_ENABLED`
          at module top — one-line OTA flip.
        */}
        {BPS_TODAY_HERO_ENABLED && (
          // CHUNK 47 fix (adversarial-verify major): reserve fixed-height
          // space while today-tasks fetch is in flight. Without this,
          // a cache miss (deep-link, staleTime expiry, dev build without
          // auth-prefetch) rendered hero=null on first paint then mounted
          // ~150pt of content when the fetch resolved — pushing everything
          // else down. Static View placeholder (chunk-17/39 pattern) fills
          // the slot until data arrives; card renders or stays null based
          // on totalToday. If totalToday === 0 after fetch, placeholder
          // collapses to 0 — one intended shift, not a jitter.
          todayTasksQuery.isLoading && !todayTasksQuery.data ? (
            <View
              style={{
                height: 150,
                marginHorizontal: Spacing.md,
                marginBottom: Spacing.md,
                borderRadius: 16,
                backgroundColor: 'rgba(148,163,184,0.15)',
              }}
              accessible
              accessibilityLabel="Loading today's progress"
            />
          ) : (
            <BpsTodayHeroCard
              tasks={todayTasks}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          )
        )}

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
          CHUNK 48 (port of PlanScreenRedesignedV2.tsx:422-433) —
          teal-tinted "AI SUMMARY" card carrying the Bedrock-generated
          overall plan summary plus the compact AICitationsFooter
          (Apple Review 1.4.1 disclaimer + authoritative-sources
          links). Summary is intentionally sourced from `aiPlanQuery`
          (the legacy AiHealthPlan record) because
          BiopsychosocialPlanRecord has no `summary` field today —
          paired BE follow-up is filed to mirror the summary onto the
          bio-native record (Bedrock prompt update + schema
          v2→v3 in-lockstep, HS-3a pattern). When BE ships, swap the
          `summary` prop source in-place. `aiPlanQuery` is already
          declared once at the top of this component (chunk-47 today
          hero reuse) — do not add a second useAiHealthPlan() call.
          Placement rationale: legacy V2 puts this card immediately
          above MedicationsSection (V2:436); the BPS analog is above
          TodaysMedicationsCard, preserving the first-time-user
          narrative order (learn BPS → why-this-plan → what-to-take →
          drill into Wellbeing map + sections). Kill-switch:
          `BPS_AI_SUMMARY_ENABLED` at module top. Component itself
          null-renders when summary is empty (two-layer defense).
        */}
        {BPS_AI_SUMMARY_ENABLED && (
          // CHUNK 48 fix (adversarial-verify major): reserve fixed-height
          // slot while ai-health-plan is loading. Cold mount had banner
          // paint null → then mount 120-180pt of card once fetch resolved,
          // pushing every downstream card down. auth-prefetch does NOT
          // warm ai-health-plan cache (only patient-info / medications-
          // summary / plan-tasks / self-reported-metrics / appointments),
          // so cold-mount is common. Placeholder collapses to 0 when
          // aiPlanQuery.data.summary is empty (banner returns null),
          // an intended one-shift not jitter — mirrors chunk 47 pattern.
          aiPlanQuery.isLoading && !aiPlanQuery.data ? (
            <View
              style={{
                height: 140,
                marginHorizontal: Spacing.md,
                marginBottom: Spacing.md,
                borderRadius: 16,
                backgroundColor: 'rgba(148,163,184,0.12)',
              }}
              accessible
              accessibilityLabel="Loading AI summary"
            />
          ) : (
            <BpsAiSummaryBanner
              summary={aiPlanQuery.data?.summary}
              colors={colors}
              isDark={settings.isDarkTheme}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          )
        )}

        {/*
          CHUNK 51: read-only "Here's what you'll be notified about"
          preview card — port of the COS-373 legacy glimpse
          (app/Home/health-plan.tsx:1091-1136) onto the BPS surface.
          Lists the 5 notification categories with on/off + a Manage
          link that pushes to /Home/reminder-settings. Component
          self-guards on both the client kill-switch
          (NOTIFICATION_CATEGORIES_ENABLED) and the server flagEnabled
          bit + preferences presence, so this is inert for back-compat /
          older builds / silent load. BPS-only kill-switch here so we
          can hide the card on BPS while legacy keeps rendering.
          Placement rationale: mirrors legacy ordering — sits between
          the AI-summary card and TodaysMedicationsCard so the
          user's read is "here's the plan → here's what you'll hear
          from us → here's what to take today". Static card, no
          animation — iOS 26.5 safe.
        */}
        {BPS_NOTIFICATION_CATEGORIES_ENABLED && (
          <BpsNotificationCategoriesCard
            colors={colors}
            isDark={settings.isDarkTheme}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        )}

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
          CHUNK 52: full legacy Medications editor directly below the
          read-only glimpse above. Reuses the same MedicationsSection
          component mounted on legacy (PlanScreenRedesignedV2.tsx +
          app/Home/health-plan.tsx) — single source of truth, no fork.
          Self-guards on server `flagEnabled` and null-renders on
          cold-mount / flag-off, so back-compat holds. The
          `onLayout` / `openAddSignal` props are intentionally omitted
          — the legacy "Review your medications" prompt + scroll-to
          path is deferred to chunk 53. Modal(fade) is the only iOS 26
          crash-class surface here and is already prod-hardened on
          legacy; two-layer kill: this JS flag + server flagEnabled.
        */}
        {BPS_MEDICATIONS_EDITOR_ENABLED && <MedicationsSection />}

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
            // CHUNK 53: intercept goal-edit locally when consolidation is ON
            // so the bio-goal editor renders inside the one consolidated
            // Modal owned by this screen. Under flag=false, forward to the
            // route parent's Modal as before — byte-for-byte legacy shape.
            onEditGoal={
              BPS_MODAL_CONSOLIDATION_ENABLED
                ? (g) => setEditor({ kind: 'bio-goal', goal: g })
                : onEditGoal
            }
            tasks={tasksBySection[key]}
            // CHUNK 53: same routing rule for add-task and task-row taps —
            // ON writes to `editor`, OFF writes to `taskModal`.
            onAddTask={
              BPS_MODAL_CONSOLIDATION_ENABLED
                ? () =>
                    setEditor({
                      kind: 'task-editor',
                      category: categoryForNewTaskInSection(key),
                    })
                : () =>
                    setTaskModal({
                      mode: 'create',
                      category: categoryForNewTaskInSection(key),
                    })
            }
            onTaskPress={
              BPS_MODAL_CONSOLIDATION_ENABLED
                ? (t) => setEditor({ kind: 'task-detail', task: t })
                : (t) => setTaskModal({ mode: 'detail', task: t })
            }
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
          {/*
            CHUNK 40 (2026-07-21): Text-label swap replaces <ActivityIndicator>
            (v2 chunk-34 RegenerateButton parity). ActivityIndicator is a
            continuously animating native primitive — even post-mount, on
            iOS 26.5 it participates in the turbomodule surface we're
            hardening against. Static Text is safe; the button opacity +
            disabled state still communicate the pending state.
          */}
          {isGeneratingFromAnySource ? (
            <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>
              Regenerating…
            </Text>
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
        CHUNK 53 (2026-07-22): consolidated single-Modal path. When
        BPS_MODAL_CONSOLIDATION_ENABLED is true, exactly ONE <Modal
        transparent> node is mounted for the entire BPS surface — its
        child is switched on `editor.kind`. Removes the "multiple Modal
        transparent nodes in the same tree" primitive that iOS 26.5 has
        crashed on. When the flag is false, the original two-Modal shape
        renders below (bio-goal continues to live at the route parent).

        Modal attributes reconciled across all three prior wrappers were
        IDENTICAL: `animationType="slide" transparent onRequestClose`. No
        divergence, no attribute superset needed. `presentationStyle`,
        `hardwareAccelerated`, `statusBarTranslucent`, and
        `supportedOrientations` were unset on every wrapper → left unset.

        Body identity keying: the `key` on each rendered *Body forces a
        full remount when the session identity changes (task id, goal id,
        or category slot). Session-scoped state (savedThisSession in
        TaskEditorBody, confirming in TaskDetailBody, bio-goal drafts in
        BioGoalEditorBody) resets cleanly across kind transitions and
        across successive sessions of the same kind — no cross-kind leak.

        NOTE: `TaskEditorModal` remains imported (default export) to keep
        the type export chain intact for callers under flag=false and to
        preserve TaskDetailModal / BioGoalEditorModal as stable back-compat
        surfaces (`app/Home/health-plan.tsx` still imports BioGoalEditorModal).
      */}
      {BPS_MODAL_CONSOLIDATION_ENABLED ? (
        <Modal
          visible={editor !== null}
          animationType="slide"
          transparent
          onRequestClose={closeEditor}
        >
          {bodyEditor?.kind === 'task-editor' ? (
            <TaskEditorBody
              key={`task-editor:${bodyEditor.task?.id ?? `new:${bodyEditor.category ?? 'none'}`}:${bodyKeySuffix}`}
              onClose={closeEditor}
              initialTask={bodyEditor.task}
              defaultCategory={bodyEditor.category}
              colors={colors}
              isDark={settings.isDarkTheme}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ) : bodyEditor?.kind === 'task-detail' ? (
            <TaskDetailBody
              key={`task-detail:${bodyEditor.task.id}:${bodyKeySuffix}`}
              task={bodyEditor.task}
              accentColor={SECTION_STYLE[sectionForCategory(bodyEditor.task.category)].color}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onClose={closeEditor}
              onEdit={(t) => {
                // Preserve the load-bearing 300ms staged detail→edit swap.
                // Setting kind directly on the same tick would race iOS's
                // Modal presentation queue (silent drop). Route through
                // pendingEditor + useEffect (mirrors the pre-chunk-53
                // pendingTaskModal → taskModal timer byte-for-byte).
                setEditor(null);
                setPendingEditor({ kind: 'task-editor', task: t });
              }}
              onDeleted={() => setEditor(null)}
            />
          ) : bodyEditor?.kind === 'bio-goal' ? (
            <BioGoalEditorBody
              key={`bio-goal:${bodyEditor.goal.id}:${bodyKeySuffix}`}
              goal={bodyEditor.goal}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onClose={closeEditor}
            />
          ) : (
            /* No editor ever opened this session — still-mounted Modal
               with visible=false needs a child. Render an invisible
               placeholder View so the tree stays valid. Once any editor
               has opened once, lastNonNullEditor pins the outgoing body
               here for the ~250ms slide-out animation on close. */
            <View />
          )}
        </Modal>
      ) : (
        <>
          {/*
            SCRUM-588 Chunk 1c: task editor + detail modals live at the
            screen level so all three BPS SectionCards share one instance
            of each. Preserved verbatim for the flag=false path.
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
        </>
      )}
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
  // CHUNK 50: PlanTierPill + ViewProgressLink share this row; flexWrap
  // lets ViewProgressLink drop under the tier pill on iPhone SE-class
  // widths (or when the headerRight banner is present) without clipping.
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
