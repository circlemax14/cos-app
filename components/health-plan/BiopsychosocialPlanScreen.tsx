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
  AccessibilityInfo,
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
import { MedicationsReviewPrompt } from './MedicationsReviewPrompt';
import { BpsWelcomeBanner } from './BpsWelcomeBanner';
import { BpsTodayHeroCard } from './BpsTodayHeroCard';
import { BpsAiSummaryBanner } from './BpsAiSummaryBanner';
import { BpsNotificationCategoriesCard } from './BpsNotificationCategoriesCard';
import { AssessmentDueBanner } from './AssessmentDueBanner';
import IntakeCtaCard from './patient-intake/IntakeCtaCard';
import { SelfAssessmentTrends } from './SelfAssessmentTrends';
import { BpsWellbeingScoreCard } from './BpsWellbeingScoreCard';
import { usePatientIntake } from '@/hooks/use-patient-intake';
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
 * NOTE (chunk 52 deferral, RESOLVED by chunk 55 on 2026-07-22): the
 * legacy "Review your medications" prompt + scroll-to
 * (`onLayout` / `openAddSignal` props on MedicationsSection) is now
 * wired in — MedicationsReviewPrompt mounts as a sibling above this
 * section, `onLayout` writes into medsSectionYRef, and
 * `openAddSignal` receives the monotonic counter bumped by
 * onReviewMedications. See BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED
 * below for the chunk-55 kill-switch + the paired deep-link handler.
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

/**
 * CHUNK 55 (2026-07-22) kill-switch — ports the legacy "Review your
 * medications" soft prompt + scroll-to + openAddSignal wiring + the
 * MEDICATION_REFILL_REMINDER `focus=medications` deep-link handler onto
 * the BPS surface. Closes the deferral called out in CHUNK 52's block
 * comment (~lines 129-142 pre-chunk-55): BPS could mount the meds editor
 * but had no persistent nudge to review it and no auto-scroll on push
 * tap.
 *
 * Kill-switch behavior — flip to false to fully inert BOTH the review
 * card AND the deep-link scroll/open path in one line:
 *   - MedicationsReviewPrompt is not mounted (card gone).
 *   - The deepLinkFocus effect early-returns before its timer registers,
 *     so a `?focus=medications` param on the route is silently ignored
 *     (same visual as an older / flag-off build — back-compat holds).
 *
 * Two-layer kill defense on the CARD itself:
 *   (a) this JS module const — one-line OTA flip
 *       (~30-60s via `npm run eas:update:production`).
 *   (b) server `flagEnabled` bit on usePlanMedications — a BE flip hides
 *       the card on BOTH BPS and legacy. MedicationsReviewPrompt
 *       already self-guards on flagEnabled === true, medsReviewNeeded
 *       === true, snoozeUntil not yet read (null), and snoozeUntil >
 *       Date.now() — all four states return null with zero layout
 *       shift, so no fixed-height placeholder wrapper is needed here
 *       (matches the MedicationsSection pattern from chunk 52).
 *
 * iOS 26.5 safety: MedicationsReviewPrompt owns exactly one internal
 * Modal (MedicationsReviewModal, animationType="slide" transparent —
 * default; same shape MedicationsSection uses). Both Modals are
 * already prod-hardened on legacy under the same conditions. Under
 * BPS_MODAL_CONSOLIDATION_ENABLED (true) the consolidated Modal owned
 * by this screen hosts task-editor / task-detail / bio-goal — meds
 * Modals are DISJOINT from that surface (only ever fire in response
 * to a user action inside the meds cards, never simultaneously with
 * a task/goal editor session), so no "multiple Modal transparent at
 * once" hazard is introduced.
 *
 * Deep-link semantics: `deepLinkFocus` prop is the URL `?focus=` param
 * read by the route parent. `focusHandledRef` keys on the VALUE (not
 * on a boolean latch) — a repeat identical value is a no-op, but a
 * re-entry with a fresh param (e.g. leave → tap another refill push →
 * come back) fires the scroll+add-signal again. Matches legacy
 * semantics (app/Home/health-plan.tsx:379-388) modulo legacy's
 * boolean latch, which never re-fires; the value-keyed guard here is
 * strictly more correct.
 *
 * NOTE (out of scope for chunk 55): the MEDICATION_REFILL_REMINDER
 * notification handler (lib/notification-routing.ts:60-64) still hard-
 * routes to `/Home/health-plan?focus=medications`. Tapping the push
 * lands on LEGACY, not BPS. Queued as chunk-56 follow-up. This chunk
 * fully wires the BPS side so re-routing the push is a one-line
 * `notification-routing.ts` change when we're ready.
 */
const BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED = true;

/**
 * CHUNK 56 (2026-07-22) kill-switch — ports the COS-452 / SCRUM-590
 * `IntakeCtaCard` onto the BPS Care Plan surface. Legacy mounts it on the
 * Health Summary tab only (app/Home/plan.tsx:78,159); BPS Care Plan
 * currently has NO entry point to start / finish / view / retake the
 * patient intake, even though HS-3a (see
 * project_hs_health_summary_chunks.md) already shipped the intake INTO the
 * BPS-driving Bedrock prompt. Patients who haven't completed intake see
 * BPS categories driven by FHIR alone with no CTA to close the gap.
 *
 * The card self-guards on `q.isLoading` (returns null) and on
 * `q.data?.intake` shape:
 *   - `complete`   → info card with "COMPLETED" chip, date, answer count,
 *                    "View my intake" primary + "Retake" secondary.
 *   - `in_progress`→ "Finish your health check-in" banner.
 *   - other        → "Complete your health check-in" banner.
 * On query error the card intentionally still renders the pre-intake CTA
 * banner so the patient always has a forward path — the source component
 * documents this ("returning null here would strand them"). BPS keeps
 * that contract intact.
 *
 * iOS 26.5 safety: `IntakeCtaCard` uses ONLY `Pressable` / `View` /
 * `Text` / `MaterialIcons` and StyleSheet. No `Modal`, no `Animated`, no
 * `ActivityIndicator`, no rotate transforms, no `Portal`, no gradient, no
 * blur. Both visual variants are pure static views — cold-mount safe. No
 * new native rendering surface introduced anywhere in the BPS tree.
 *
 * Layout-shift discipline (chunks 47 / 48 pattern): during
 * `intakeQuery.isLoading && !intakeQuery.data` we render a fixed-height
 * placeholder `View` so the first-paint reserves the slot instead of
 * flashing null → then push-down when the fetch resolves. `usePatientIntake`
 * carries a 2 min `staleTime` so intra-session re-visits skip the
 * placeholder entirely (data is fresh). `auth-prefetch.ts` does NOT warm
 * `['patient-intake']` today, so first cold-mount does fire a fetch —
 * hence the placeholder is load-bearing on cold mount only. Placeholder
 * height 100pt approximates the not-started / in-progress banner (the
 * common case). The `complete` variant lands ~180pt taller, producing
 * ONE intended downward shift when the data arrives, not jitter — matches
 * how chunk 47's hero card and chunk 48's AI-summary banner handle the
 * variant-height case.
 *
 * Observer sharing: hoisting `usePatientIntake()` up to the screen level
 * so the placeholder can gate on `isLoading` piggybacks on the SAME
 * `['patient-intake']` query key that `IntakeCtaCard` already subscribes
 * to internally — react-query dedupes by key, so this adds ZERO extra
 * network requests. The hook call is unconditional (rules-of-hooks
 * discipline); only the render is flag-gated.
 *
 * Kill-switch: BPS_INTAKE_CTA_ENABLED=false makes the entire slot inert
 * — no placeholder, no card — in one line. The hoisted `usePatientIntake`
 * observer would still subscribe (cheap; staleTime 2 min; same query
 * legacy plan.tsx already runs), so flag-off produces zero UI change on
 * BPS and zero network delta vs. pre-chunk-56. Recovery cost: ~30-60s via
 * `npm run eas:update:production` (compile-time JS const, so OTA — no
 * SSM flip).
 *
 * Back-compat: `usePatientIntake` / `IntakeCtaCard` shipped with HS-1
 * (SCRUM-590) and are already in prod on legacy — no new endpoint, no new
 * schema, no data model impact. Older builds (flag off) simply don't
 * render the card; flag-on requires no server change. Legacy plan.tsx
 * mount sites are UNTOUCHED — additive parity, not a swap.
 */
/**
 * CHUNK 57 (2026-07-22): Ken dogfood ask #1 — flip false. "Health history
 * intake is not required in plan screen, its already available in health
 * summary." The IntakeCtaCard import + hoisted usePatientIntake() observer
 * are intentionally kept in place so the switch can be flipped back on in
 * one line if we ever want the entry point back on this surface. Under
 * flag=false: no placeholder, no card — inert. Recovery cost: ~30-60s via
 * `npm run eas:update:production`.
 */
const BPS_INTAKE_CTA_ENABLED = false;

/**
 * CHUNK 57 (2026-07-22) kill-switch — Ken dogfood ask #2 — ports the
 * SCRUM-268 Phase 3 Self-Assessments horizontal carousel from
 * app/Home/health-trends.tsx (L343-353) onto the BPS Care Plan surface,
 * mounted in the SLOT previously occupied by IntakeCtaCard (chunk 56).
 * Reuses the SAME <SelfAssessmentTrends /> component that Health Trends
 * mounts — single source of truth, no fork. Section header uses the
 * identical MaterialIcons "assignment" + label pattern for cross-surface
 * consistency.
 *
 * The component self-guards on `query.isLoading` (loading card) and
 * `records.length === 0` (empty card that reads "Take your first check-in
 * to see results trend here.") so cold-mount / no-data cases are handled
 * inside the leaf. Data uses the shared ['assessments-trends'] react-query
 * key with a 60s staleTime.
 *
 * iOS 26.5 safety: SelfAssessmentTrends uses only static Pressable /
 * ScrollView (horizontal) / View / Text / MaterialIcons + StyleSheet. No
 * Modal, no Animated, no ActivityIndicator, no Portal, no gradient, no
 * blur, no rotate. Same primitive envelope BpsNotificationCategoriesCard
 * / BpsWelcomeBanner already sit within — no new native rendering
 * surface.
 *
 * Kill-switch: flip false to fully inert the header + carousel in one
 * line. Recovery cost: ~30-60s via `npm run eas:update:production` (JS
 * module constant, so OTA — not SSM).
 */
const BPS_SELF_ASSESSMENTS_ENABLED = true;

/**
 * CHUNK 59 (2026-07-22) kill-switch — composite "Wellbeing Score" card
 * mounted at the very top of the BPS surface (above the Today hero) as
 * the daily wake-up-and-glance number Ken asked for ("kind of like a
 * flash that somebody wakes up to every day", Oura-sleep-score analogy).
 *
 * The card ONLY consumes self-assessment bands via lib/assessment-bands.ts
 * — no wearables/EHR/labs this chunk (scope discipline; Ken v2 can add).
 * It shares the ['assessments-trends'] + ['assessment-history', id]
 * react-query cache keys with SelfAssessmentTrends so there's exactly
 * one round-trip per instrument even though this card renders above
 * SelfAssessmentTrends in the layout.
 *
 * Flip false to hide the card without a binary cut — OTA-revertible if
 * Ken hates the v1 formula and wants to iterate before re-enabling.
 */
const BPS_WELLBEING_SCORE_ENABLED = true;

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
  deepLinkFocus,
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
   * CHUNK 55: URL `?focus=` param, forwarded from the route parent so
   * this screen can auto-scroll to the meds section + open the add flow
   * when the value is 'medications'. `null` / `undefined` / any other
   * string is a no-op. Value-keyed inside so a repeat identical value
   * doesn't re-fire, but a fresh value on re-entry does. Route parent
   * (app/Home/biopsychosocial-plan.tsx) owns the useLocalSearchParams
   * read; this screen owns the scroll refs + timer + signal so the
   * child is the single source of the "meds focus" behavior across
   * both entry points (in-app card tap + push tap).
   *
   * Optional so health-plan.tsx's flag=false legacy caller (which
   * reaches this component via the pre-COS-438 branch) doesn't need to
   * change — it just doesn't pass this prop and the effect no-ops.
   */
  deepLinkFocus?: string | null;
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

  // CHUNK 56: hoisted observer on the shared ['patient-intake'] key so we
  // can gate a fixed-height placeholder on `isLoading` without adding a
  // second network call — react-query dedupes by key, so this piggybacks
  // on the same fetch IntakeCtaCard's own usePatientIntake() would fire.
  // The hook call is unconditional (rules-of-hooks); the render below is
  // flag-gated. Deliberately NOT `enabled: BPS_INTAKE_CTA_ENABLED` so
  // toggling the flag off doesn't cause the observer to disappear and
  // reappear on flip (compile-time const anyway; adds nothing to net).
  const intakeQuery = usePatientIntake();
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

  // ── CHUNK 55: meds review + scroll-to + deep-link plumbing ─────────────
  // Legacy parity port from app/Home/health-plan.tsx:354-388 + 1142-1146.
  // `scrollRef` targets the outer ScrollView in the loaded branch below
  // (the only branch that mounts MedicationsSection). The three other
  // branches — skeleton / error / no-tier / empty — do not carry the
  // meds section so they intentionally don't set the ref; a deep-link
  // arriving while any of those is rendered would time-out its 350ms
  // scroll attempt with medsSectionYRef.current == null and drop
  // silently (correct back-compat: no crash, no misleading scroll).
  // Once the plan loads and MedicationsSection lays out, subsequent
  // re-entries with `?focus=medications` will fire cleanly.
  //
  // `openMedsAddSignal` is a monotonic counter — MedicationsSection's
  // effect (line ~190 of that file) fires on strict-increment only,
  // guarding against StrictMode double-invocation. `onReviewMedications`
  // bumps it via functional setState so back-to-back taps don't miss.
  const scrollRef = React.useRef<ScrollView | null>(null);
  const medsSectionYRef = React.useRef<number | null>(null);
  // CHUNK 59: Y-position of the Self-Assessments section so the top
  // Wellbeing Score card can scroll the user there on tap. Same
  // pattern as medsSectionYRef — parent-owned ref, filled by the
  // section's onLayout, consumed by scrollToSelfAssessments below.
  // Best-effort: no-op if the section hasn't laid out yet.
  const selfAssessmentsSectionYRef = React.useRef<number | null>(null);
  const scrollToSelfAssessments = React.useCallback(() => {
    const y = selfAssessmentsSectionYRef.current;
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }, []);
  // Value-keyed guard (not a boolean latch): stores the last focus VALUE
  // handled. Repeat identical value = no-op; a fresh value on route
  // re-entry re-fires. Strictly more correct than legacy's boolean
  // `focusHandledRef` which never re-fires.
  const focusHandledRef = React.useRef<string | null>(null);
  const [openMedsAddSignal, setOpenMedsAddSignal] = React.useState(0);
  const onReviewMedications = React.useCallback(() => {
    // Scroll first (best-effort — no-op if the meds section hasn't laid
    // out yet), then bump the add-signal. MedicationsSection reads the
    // signal in its own effect and opens the add editor on strict
    // increment.
    //
    // CHUNK 55 adversarial-verify major fix (Modal fade-out overlap):
    // Called from MedicationsReviewPrompt.handleReviewNow, which does
    // setModalVisible(false) SYNCHRONOUSLY before this. RN Modal's
    // animationType='fade' close takes ~300ms during which the modal
    // is still natively presented. If we bump openMedsAddSignal in the
    // same tick, MedicationEditorModal begins its own fade-in and two
    // <Modal transparent> are natively presented simultaneously →
    // iOS 26.5 SIGABRT class the chunk-53 consolidation targeted.
    // 400ms defer clears the review modal's fade-out with a small
    // safety margin before the editor modal begins its fade-in. On
    // paths where no review modal is being closed (deep-link, direct
    // + Add tap), the 400ms is invisible.
    const y = medsSectionYRef.current;
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
    setTimeout(() => setOpenMedsAddSignal((n) => n + 1), 400);
  }, []);

  // CHUNK 55 deep-link effect: fires when the route arrives with a
  // fresh `?focus=medications` param. Polls medsSectionYRef every
  // 200ms up to ~2s until the meds section has completed its first
  // layout pass, then scrolls to it. Marks the value as handled ONLY
  // after the scroll actually fires — a cold mount where meds haven't
  // laid out at the timer fire no longer silently drops the deep-link
  // (chunk 55 adversarial-verify majors #5 + #9 fix).
  //
  // Chunk 55 adversarial-verify major #6 fix (Modal coexistence): the
  // handler INTENTIONALLY does NOT bump openMedsAddSignal. On a cold
  // mount with an outstanding review cycle, MedicationsReviewPrompt
  // auto-shows its internal Modal; auto-bumping openMedsAddSignal
  // would then mount MedicationEditorModal on top, and two
  // <Modal transparent> visible simultaneously is the iOS 26.5
  // SIGABRT class chunk 53 was built to avoid. Instead, we scroll the
  // user to the meds surface and let them either interact with the
  // review prompt (if shown) or tap "+ Add" themselves. One extra tap
  // in the rare cold-mount push flow is a strictly-better trade than
  // a Modal-over-Modal crash.
  //
  // Chunk 55 adversarial-verify major #7 fix (VoiceOver focus): fires
  // an AccessibilityInfo announcement after the scroll so VoiceOver
  // users get a signal that navigation completed. Full a11y focus
  // move to the meds section would require findNodeHandle + a target
  // ref; deferring to a follow-up in favor of the simpler announce.
  //
  // Kill-switch short-circuit: BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED
  // = false fully inerts BOTH the review card AND this deep-link
  // handler (one-line kill covers everything chunk 55 adds).
  React.useEffect(() => {
    if (!BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED) return;
    if (!deepLinkFocus || deepLinkFocus !== 'medications') return;
    if (focusHandledRef.current === deepLinkFocus) return;
    // The plan must have loaded its data before MedicationsSection
    // mounts and lays out. Effect deps include `planQuery.data` so a
    // slow-cold-mount (Lambda cold-start / API Gateway 29s wall)
    // simply defers the effect run until data lands; the effect then
    // starts fresh polling with a full ~2s window. Without this dep,
    // the effect would exhaust its polls against a skeleton branch
    // and give up before the meds section ever mounted.
    if (!planQuery.data) return;
    // ~2s total polling window covers cold-mount + first-layout
    // typical p99 AFTER planQuery has resolved. Give-up marks
    // handled to prevent an infinite retry loop on legitimate
    // empty-state / flag-off branches where meds never lays out.
    const POLL_MS = 200;
    const MAX_ATTEMPTS = 10;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryScroll = () => {
      const y = medsSectionYRef.current;
      if (y != null && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
        focusHandledRef.current = deepLinkFocus;
        // Queue the announcement so it fires after any in-flight
        // VoiceOver read (plan header, MedicationsReviewPrompt modal
        // a11y focus) instead of preempting it. announceForAccessibility
        // with queue:true is available from RN 0.68+; cos-app is on
        // 0.83.10.
        AccessibilityInfo.announceForAccessibilityWithOptions(
          'Navigated to your medications.',
          { queue: true },
        );
        return;
      }
      if (++attempts >= MAX_ATTEMPTS) {
        // Give up — mark handled so the effect doesn't loop across
        // future re-renders of the same still-unresolved value.
        focusHandledRef.current = deepLinkFocus;
        return;
      }
      timer = setTimeout(tryScroll, POLL_MS);
    };
    timer = setTimeout(tryScroll, POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [deepLinkFocus, planQuery.data]);

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
        ref={scrollRef}
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
          CHUNK 59 (2026-07-22): composite Wellbeing Score card. Sits
          directly under the greeting so the number IS the "wake up and
          glance" flash Ken asked for ("kind of like a flash that
          somebody wakes up to every day", Oura-sleep-score analogy),
          ABOVE the Today hero (task-completion is task-level; wellbeing
          is the person-level headline). Tap → scroll down to the
          Self-Assessments carousel where each contributing instrument
          band is legible.

          Layout-shift discipline: the card ALWAYS renders — LOADING /
          EMPTY / READY share one shell with minHeight so downstream
          cards don't jitter when the composite resolves. Card is
          static View / Text / Pressable / MaterialIcons only (iOS
          26.5 primitive envelope proven by chunks 47/50/57).

          Kill-switch: `BPS_WELLBEING_SCORE_ENABLED` at module top —
          one-line OTA flip. See notes there for scope rationale.
        */}
        {BPS_WELLBEING_SCORE_ENABLED && (
          <BpsWellbeingScoreCard
            colors={colors as unknown as Record<string, string>}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onPressDetails={scrollToSelfAssessments}
          />
        )}

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
                marginBottom: Spacing.md,
                borderRadius: Radii.xl,
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
          CHUNK 56 (2026-07-22): COS-452 / SCRUM-590 IntakeCtaCard port.
          Sits between the BpsWelcomeBanner (first-time education) and
          BpsAiSummaryBanner (AI summary that depends on intake). Narrative
          order: "welcome to BPS → complete your intake so BPS can
          personalize → here's the AI summary that used your intake."
          Legacy plan.tsx mounts this on the Health Summary tab (L78, L159);
          BPS Care Plan had NO intake entry point until now. Card
          self-guards on q.isLoading (returns null) and switches between
          three variants (not-started banner / in-progress banner /
          completed info card). Fixed-height placeholder while loading
          matches chunks 47/48 pattern — 100pt approximates the banner
          height (majority case); the ~280pt completed variant lands as
          one intended downward shift when data arrives, not jitter.
          Kill-switch BPS_INTAKE_CTA_ENABLED at module top; card component
          itself null-renders on loading, giving two-layer defense.
          iOS 26.5 safe: static Pressable/View/Text/MaterialIcons only, no
          Modal / Animated / ActivityIndicator / rotate / Portal / gradient.
        */}
        {BPS_INTAKE_CTA_ENABLED && (
          intakeQuery.isLoading && !intakeQuery.data ? (
            <View
              style={{
                height: 100,
                marginBottom: Spacing.md,
                borderRadius: Radii.xl,
                backgroundColor: 'rgba(148,163,184,0.12)',
              }}
              accessible
              accessibilityLabel="Loading your intake status"
            />
          ) : (
            <IntakeCtaCard />
          )
        )}

        {/*
          CHUNK 57 (2026-07-22): Ken dogfood ask #2 — Self-Assessments
          horizontal carousel ported from Health Trends
          (app/Home/health-trends.tsx L339-353). Mounted in the slot
          previously owned by IntakeCtaCard (chunk 56, flipped OFF in
          chunk 57 ask #1). Reuses the same <SelfAssessmentTrends />
          leaf that Health Trends mounts — single source of truth. See
          BPS_SELF_ASSESSMENTS_ENABLED at module top for the kill-switch
          rationale and iOS 26.5 primitive safety notes.

          Layout-shift discipline: SelfAssessmentTrends self-guards on
          isLoading (renders a loadingCard with its own dimensions) and
          length===0 (emptyCard). Both static View primitives, no
          animation. First cold mount reserves ~50pt for the loading
          card, then swaps to either the ~146pt carousel or the ~90pt
          empty card — one intended shift, not jitter. `assessments`
          react-query cache is warmed by auth-prefetch on sign-in, so
          the common resident-user path skips isLoading entirely and
          hits the carousel on first paint.
        */}
        {BPS_SELF_ASSESSMENTS_ENABLED && (
          <View
            style={styles.selfAssessmentsWrap}
            // CHUNK 59: capture the section's Y position on layout so
            // the top BpsWellbeingScoreCard's onPress can scroll here.
            // Mirrors the medsSectionYRef pattern above. Only writes
            // the ref (no state), so this triggers no re-render cost.
            onLayout={(e) => {
              selfAssessmentsSectionYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.selfAssessmentsHeader}>
              <MaterialIcons
                name="assignment"
                size={getScaledFontSize(16)}
                color={colors.text as string}
              />
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(700) as any,
                  marginLeft: 6,
                }}
              >
                Self-Assessments
              </Text>
            </View>
            <SelfAssessmentTrends />
          </View>
        )}

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
                marginBottom: Spacing.md,
                borderRadius: Radii.xl,
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
          CHUNK 55: soft, recurring "Review your medications" prompt —
          sibling above the full MedicationsSection editor below. Self-
          guards on server flagEnabled + medsReviewNeeded + local
          snooze + first-cycle modal (see MedicationsReviewPrompt.tsx
          for the full four-state gate), so it null-renders during
          load / off / snoozed / not-needed with zero layout shift.
          Tapping "Review now" fires onReviewMedications: scrollTo the
          MedicationsSection y-offset captured in the onLayout wrapper
          below, then bump openMedsAddSignal so the section opens its
          add editor on the next commit. Two-layer kill:
          BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED (client OTA flip) and
          the server flagEnabled bit (BE flip covers both BPS + legacy).
        */}
        {BPS_MEDICATIONS_REVIEW_PROMPT_ENABLED && (
          // CHUNK 57 alignment: MedicationsReviewPrompt bakes
          // `marginHorizontal: 20` into its own StyleSheet (shared with
          // legacy /Home/health-plan). Inside our ScrollView contentContainer
          // padding of Spacing.md=16, that lands the card 36pt from the
          // screen edge — 20pt farther in than sibling BPS cards, which
          // sit at 16pt. Wrapping in a `marginHorizontal: -Spacing.screenPadding`
          // View cancels the built-in 20pt exactly, so the card renders at
          // the same 16pt edge as BpsWelcomeBanner / TodaysMedicationsCard /
          // SectionCard. Legacy /Home/health-plan.tsx is left untouched
          // (its own container has different padding, so its author-intended
          // 20pt inset there still holds).
          <View style={styles.legacyCardWrap}>
            <MedicationsReviewPrompt onReviewNow={onReviewMedications} />
          </View>
        )}

        {/*
          CHUNK 52 + CHUNK 55 (2026-07-22): full legacy Medications
          editor directly below the read-only glimpse above. Reuses the
          same MedicationsSection component mounted on legacy
          (PlanScreenRedesignedV2.tsx + app/Home/health-plan.tsx) —
          single source of truth, no fork. Self-guards on server
          `flagEnabled` and null-renders on cold-mount / flag-off, so
          back-compat holds. Modal(fade) is the only iOS 26 crash-class
          surface here and is already prod-hardened on legacy; two-layer
          kill: this JS flag + server flagEnabled.

          CHUNK 55 closes the chunk-52 deferral: `onLayout` writes the
          section's y-offset into medsSectionYRef so the review-prompt
          "Review now" tap + the `?focus=medications` deep-link handler
          can scrollTo it, and `openAddSignal` is threaded to the
          monotonic counter bumped by onReviewMedications so the same
          tap opens the section's add editor on the next commit. The
          outer <View> wrapper preserves the section's onLayout
          semantics (LayoutChangeEvent fires against the wrapper, not
          the section's own onLayout prop — MedicationsSection accepts
          onLayout as an optional prop but we match the legacy
          app/Home/health-plan.tsx:1142-1146 shape byte-for-byte,
          which passes onLayout directly to the section).
        */}
        {BPS_MEDICATIONS_EDITOR_ENABLED && (
          // CHUNK 57 alignment: MedicationsSection's internal cards and
          // header sit at `paddingHorizontal: 20` / `marginHorizontal: 20`
          // — 36pt from screen edge inside our 16pt-padded ScrollView.
          // The same negative-mH wrapper cancels the 20pt exactly, aligning
          // its cards with the 16pt-edge BPS card baseline. Shared with
          // legacy — leaf styles untouched.
          <View
            style={styles.legacyCardWrap}
            // CHUNK 57 blocker fix: chunk-55 scroll-to-meds requires
            // layout.y measured relative to the ScrollView content, but
            // MedicationsSection's own onLayout fires relative to its
            // IMMEDIATE parent — which is now this wrapper View. Attaching
            // onLayout to the wrapper (whose parent is the ScrollView) gives
            // the correct ScrollView-content y-offset; dropped the
            // section-level onLayout prop.
            onLayout={(e) => {
              medsSectionYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <MedicationsSection openAddSignal={openMedsAddSignal} />
          </View>
        )}

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
        {/* CHUNK 57 alignment: AssessmentDueBanner bakes
            `marginHorizontal: Spacing.screenPadding` (=20) into its own
            StyleSheet (shared with legacy). Wrap in
            `marginHorizontal: -Spacing.screenPadding` so it renders at
            the same 16pt edge as sibling BPS cards. */}
        <View style={styles.legacyCardWrap}>
          <AssessmentDueBanner
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        </View>

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
    // CHUNK 57 alignment: previously marginTop: Spacing.md +
    // marginBottom: Spacing.sm gave asymmetric vertical rhythm vs. the
    // surrounding cards (all use marginBottom: Spacing.md). Standardize
    // on marginBottom: Spacing.md so the wellbeing card sits in the
    // same vertical grid as its siblings; drop marginTop since the
    // preceding card already contributes marginBottom: Spacing.md.
    marginBottom: Spacing.md,
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
  // CHUNK 57 alignment: negative-mH wrapper that cancels the built-in
  // `marginHorizontal: Spacing.screenPadding` (=20) baked into the shared
  // MedicationsReviewPrompt / MedicationsSection / AssessmentDueBanner
  // leaves. Inside our ScrollView contentContainer padding of
  // Spacing.md=16, this pulls them from 36pt-from-edge → 16pt-from-edge,
  // aligning with sibling BPS cards (BpsWelcomeBanner, BpsTodayHeroCard,
  // TodaysMedicationsCard, SectionCard, mapCard) that all sit at the
  // 16pt padding boundary. Legacy /Home/health-plan mounts these
  // components directly (no wrapper) so their author-intended 20pt
  // inset is preserved on that surface. Overflow default (visible)
  // allows the negative margin to extend past the padding without
  // clipping.
  legacyCardWrap: {
    marginHorizontal: -Spacing.screenPadding,
  },
  // CHUNK 57 (ask #2) Self-Assessments carousel wrapper. Its inner
  // horizontal ScrollView already has paddingHorizontal:16 baked into
  // its carousel contentContainerStyle, so we don't add extra mH here.
  // The section header sits at the same 16pt padding boundary as
  // sibling card headers via the ScrollView contentContainer padding.
  selfAssessmentsWrap: {
    marginBottom: Spacing.md,
  },
  selfAssessmentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
});
