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
  findNodeHandle,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { NutritionPlanSection } from '@/components/health-plan/NutritionPlanSection';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useCanRender } from '@/hooks/use-entitlement';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import {
  CANCEL_BIO_PLAN_MUTATION_KEY,
  REGENERATE_BIO_PLAN_MUTATION_KEY,
  formatRegenerationElapsed,
  useBioRegenerationStatus,
  useBiopsychosocialPlan,
  useCancelBiopsychosocialRegeneration,
  useRegenerateBiopsychosocialPlan,
} from '@/hooks/use-biopsychosocial-plan';
import { PlanSkeleton } from '@/components/plan-shared/PlanSkeleton';
import { SectionCard, SECTION_STYLE, type BiopsychosocialSectionKey } from './SectionCard';
// SCRUM-658 (2026-07-31): TodaysMedicationsCard / MedicationsSection /
// MedicationsReviewPrompt moved off this surface to /Home/medications.
// Imports removed to silence unused-var warnings; the standalone route
// re-imports them from their canonical paths.
import { BpsWelcomeBanner } from './BpsWelcomeBanner';
import { HabitsBanner } from './HabitsBanner';
import { MedicationsBanner } from './MedicationsBanner';
// SCRUM-655: BpsTodayHeroCard no longer mounted directly by this screen —
// BpsHeroTileRow imports and mounts it on tile-expand. Import removed here
// so the linter doesn't flag it as unused; add back if a future change
// mounts it standalone again.
import { BpsAiSummaryBanner } from './BpsAiSummaryBanner';
import { RetakeRequestInboxCard } from './retake-request/RetakeRequestInboxCard';
import { BpsNotificationCategoriesCard } from './BpsNotificationCategoriesCard';
import { AssessmentDueBanner } from './AssessmentDueBanner';
import IntakeCtaCard from './patient-intake/IntakeCtaCard';
import { SelfAssessmentTrends } from './SelfAssessmentTrends';
// SCRUM-655: BpsWellbeingScoreCard no longer mounted directly by this screen —
// BpsHeroTileRow imports and mounts it on tile-expand.
import { BpsHeroTileRow } from './BpsHeroTileRow';
// SCRUM-640 (2026-08-04): Habit correlation strip mounted below the
// hero tile row. Renders null when the backend flag is OFF (default)
// or when the user has fewer than min_sample_size=10 days of entries.
import { HabitCorrelationStrip } from './HabitCorrelationStrip';
// SCRUM-661 (2026-07-31): match home-screen greeting exactly by reusing
// the same GreetingHeader + useCurrentHour hook that app/Home/index.tsx
// already mounts (SCRUM-653/654). Home + Plan now share ONE greeting
// treatment.
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { useCurrentHour } from '@/hooks/use-current-hour';
// SCRUM-648 (2026-08-04): Biological tile — Blood Glucose (TIR).
// Renders null when the backend flag is OFF (default) or when the
// patient has no glucose samples yet. Tap routes to /Home/glucose.
import { GlucoseTirTile } from './GlucoseTirTile';
import { BpsPlanFocusBanner } from './BpsPlanFocusBanner';
// "Share as PDF" for the care plan. Same expo-print + expo-sharing pipeline
// (and the same RN Share text fallback) that ShareIntakeReportSection already
// ships, so no new native surface and no new npm package — OTA-safe. Self-
// guards on `plan == null`, so mounting it here is inert until a plan exists.
import { SharePlanSection } from './SharePlanSection';
import HeroScoreBlock from './senior/HeroScoreBlock';
import OneThingTodayCard from './senior/OneThingTodayCard';
import WellbeingMapGlimpse from './senior/WellbeingMapGlimpse';
import { DetailsAccordion } from './senior/DetailsAccordion';
import { useWellbeingDerivation } from '@/hooks/use-wellbeing-derivation';
import { bpsToSection } from '@/lib/wellbeing-score';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import { TaskEditorModal, TaskEditorBody } from './TaskEditorModal';
import { TaskDetailModal, TaskDetailBody } from './tasks/TaskDetailModal';
import { BioGoalEditorBody } from './BioGoalEditorModal';
import { useAiHealthPlan } from '@/hooks/use-plan-tasks';
import { fetchTasksForDate } from '@/services/api/ai-health-plan';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import type { PlanType } from '@/services/api/plan-type';
import type { PlanTask, TaskOccurrence } from '@/services/api/types';
import { todayLocalIso } from '@/lib/day-key';
// ADR-0005 P0/P2 — bottom-anchored "Classic view" escape hatch. The
// component self-gates on `isTabSwapBpsEnabled()` (returns null when the
// build-time env is unset), so mounting it inside this ScrollView is a
// no-op on every legacy surface. The reason it lives inside BPS rather
// than in the tab-swap parent (`app/Home/health-plan.tsx`) is so it
// scrolls with the rest of the plan content — bottom-of-content, not
// a floating overlay — and so it appears on both entry points into BPS
// (the tab-swap render AND the peer `/Home/biopsychosocial-plan` route).
// SCRUM-662 (2026-07-31): ClassicViewLink import removed — the
// bottom-anchored "Classic view" affordance was removed from the
// surface per user request.

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
// SCRUM-655 (2026-07-31): flipped false per user request. Reminders /
// notification-category management already lives in the left slider
// menu; the read-only "here's what you'll be notified about" glimpse
// on the BPS surface was duplicating the settings surface without
// adding action. Kept as a module const (not deleted) so a future
// decision can OTA-revert with a one-line flip.
const BPS_NOTIFICATION_CATEGORIES_ENABLED = false;

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
 * CHUNK 64 (2026-07-22): the MEDICATION_REFILL_REMINDER push router
 * now points bio-eligible patients here — the deep-link handler on
 * this screen fires on push tap for BPS users, activating the scroll
 * + VoiceOver announce that has been dormant since chunk 55.
 * Ineligible patients still land on legacy `/Home/health-plan
 * ?focus=medications` so no one is routed to a surface their flags
 * won't render. Kill-switch: `NOTIFICATION_MEDS_ROUTE_BPS_ENABLED` in
 * lib/notification-routing.ts (single-line OTA revert).
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

/**
 * CHUNK 60 (2026-07-22) kill-switch — Ken transcript ask: "our treatment
 * plan needs to change based upon these trends"; "everything is
 * elevating except that domain" — that domain becomes the plan's focus
 * target. Surfaces the wellbeing focus signal (already computed in
 * chunk 59's deriveWellbeing) as two coordinated affordances:
 *
 *   (a) BpsPlanFocusBanner — soft teal callout mounted directly above
 *       the three SectionCards. Copy is strictly generic per the v1
 *       scope gate ("Focus this week: your {mental|physical|social}
 *       health / connection. Explore tasks below."). Tap → scrolls the
 *       ScrollView to the matching SectionCard. Renders NULL when
 *       focus is undefined (all domains flat, no assessment history,
 *       insufficient trend data — genuinely null-when-absent, not a
 *       fixed-height placeholder).
 *
 *   (b) SectionCard `isFocus` pill — small teal "FOCUS" badge under
 *       the header of exactly the one section that matches the focus
 *       domain, so a user who scrolls to it sees why they're there.
 *       Purely visual, no behavior change.
 *
 * v1 scope discipline: strictly generic copy. NO prescriptive language
 * ("talk to your psychiatrist about medication issues", "consider a
 * med change") — that surface is deferred to a future chunk pending
 * Ken sign-off on tone + clinical guardrails.
 *
 * Compute-once guarantee: `useWellbeingDerivation()` runs ONCE at this
 * parent level; the derivation is passed down into
 * BpsWellbeingScoreCard (which skips its internal deriveWellbeing when
 * props are supplied), into the banner (as `focus`), and into each
 * SectionCard (as `isFocus`). Same query keys as before, so the
 * hoisted observer piggybacks on the shared react-query cache —
 * ZERO NEW BE CALLS.
 *
 * Kill-switch flip false → banner AND SectionCard pill both compile
 * out cleanly in one line. Recovery cost: ~30-60s via
 * `npm run eas:update:production` (JS module const, so OTA — not SSM).
 *
 * iOS 26.5 safe: banner + pill use only Pressable/View/Text/
 * MaterialIcons/StyleSheet — same envelope chunks 47/50/57/59 proved
 * safe on iPhone 14 iOS 26.5 build 62.
 */
const BPS_PLAN_FOCUS_SIGNAL_ENABLED = true;

/**
 * COS-479 (2026-07-23) kill-switch — Direction 1 "Hero Score + One Thing
 * Today" layout with wellbeing-map glimpse. Ken-approved composition.
 *
 * DEFAULT FALSE. When false, the screen renders EXACTLY today's UI (zero
 * delta, zero regression). When true, the screen renders the new hero
 * stack — greeting, 96pt composite hero, plain-English caption, three
 * domain dots, OneThingTodayCard, WellbeingMapGlimpse — followed by
 * everything from today's layout hosted verbatim inside a "See details"
 * DetailsAccordion.
 *
 * Compile-time const → revert requires an OTA (~30-60s via
 * `npm run eas:update:production`), NOT the 30-second SSM/Lambda flip.
 * Acceptable for a client-only surface change.
 *
 * iOS 26.5 safety: HeroScoreBlock / OneThingTodayCard / WellbeingMapGlimpse
 * / DetailsAccordion are all View/Text/Pressable/MaterialIcons/StyleSheet
 * only — no Modal, no Animated, no LayoutAnimation, no Portal, no gradient,
 * no blur, no ActivityIndicator, no rotate transforms. Static primitives
 * only. See each component's header block for the primitive envelope
 * commentary.
 *
 * a11y preservation: chunks 82-124 are SHIPPED. When the switch is on,
 * their render trees mount verbatim as DetailsAccordion children — no
 * prop edits, no wrappers that break flex, no accessibility overrides.
 * BpsWellbeingScoreCard / BpsPlanFocusBanner / SectionCard /
 * SelfAssessmentTrends / MedicationsSection render bit-identically to
 * how they render today.
 */
const BPS_HERO_LAYOUT_ENABLED = false as const;

/** Local YYYY-MM-DD for today. Matches auth-prefetch.ts:37 so the
 *  ['plan-tasks', todayIso()] cache key lines up with the pre-warmed
 *  entry — the hero rides that warm read on first render. */
function todayIso(): string {
  return todayLocalIso();
}

const SECTION_ORDER: { key: BiopsychosocialSectionKey; title: string }[] = [
  { key: 'biological', title: 'Biological Wellness' },
  { key: 'psychological', title: 'Psychological Wellness' },
  { key: 'social', title: 'Social & Faith' },
];

// SCRUM-663 cleanup (2026-07-31): greetingForNow + formatGeneratedDate
// deleted — the greeting was swapped for the shared GreetingHeader
// component (SCRUM-661) and the "Updated {date}" caption was removed
// (SCRUM-660). If either affordance comes back, restore locally or
// import from components/home/GreetingHeader (greeting) / write a
// two-liner for the date formatter.

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
 * SCRUM-651: the formatter for "started Xs / Xm ago / generating for a
 * while..." was hoisted to `formatRegenerationElapsed` in
 * `use-biopsychosocial-plan.ts` so the live-ticking selector
 * `useBioRegenerationStatus` and this screen share the same copy contract.
 * Kept as a pure function of `elapsedSec` (not `jobStartedAt`) so the
 * ticker is the sole owner of `Date.now()` — no lingering static snapshot
 * that would drift out of sync with the >5min / >45min transitions.
 *
 * The pre-651 `formatRelativeStartedAt(iso)` snapshot function was
 * intentionally removed rather than aliased: the whole point of SCRUM-651
 * is that the label WAS a snapshot, and now it isn't. Aliasing would
 * invite a caller to reintroduce the snapshot pattern.
 */

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
      {/*
        SCRUM-660 (2026-07-31): pill now shows the plan name only —
        user asked to drop the "Plan: " prefix and "· Change" trailer.
        The swap-horiz icon on the right still hints tappability; the
        pill remains a Pressable so tap-to-change UX is preserved. A11y
        label still says "Tap to change" for VO users.
      */}
      <Text
        style={{
          color: colors.tint,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(700) as any,
        }}
      >
        {label}
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

/**
 * SCRUM-658 — sibling of ViewProgressLink for the medications route.
 * Renders as a pill in the tier row and pushes to `/Home/medications`
 * (which now hosts the full MedicationsSection editor that used to
 * live inline on this BPS surface). Preserves the sleek-pill shape
 * Ken landed on so the header row still reads as a single control
 * strip.
 */
function MedicationsLink({
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
      accessibilityLabel="Medications"
      accessibilityHint="Opens your medications list and editor"
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
        name="medication"
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
        Medications
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
  entitlementGating = false,
  planLabel,
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
  /**
   * COS-803 — apply the per-section entitlement gates.
   *
   * Defaults to FALSE, which is the whole point. The Care Plan tab in the
   * centre of the bottom bar renders this component with the prop absent and
   * is therefore byte-for-byte the screen that ships in production — no gate
   * can hide anything there, whatever a plan does or does not grant.
   *
   * The new Plan+ tab passes it. Two tabs, one component, and the enhanced
   * surface is the only one that can be wrong.
   */
  entitlementGating?: boolean;
  /**
   * COS-805 — what the plan pill SAYS, when that is not the plan type.
   *
   * The pill has always rendered `planTypeDisplayName(currentPlanType)` — the
   * care plan TYPE (basic / advanced / agency), which decides assessment
   * depth. That is the right label on the classic tab, where the pill opens
   * the type chooser.
   *
   * On Plan+ the pill opens the ENTITLEMENT shelf, so showing the type there
   * means the label and the destination disagree: switch to Standard, and a
   * pill still reading "Advanced" takes you to a shelf where Standard is
   * badged YOUR PLAN. Two different fields, one control.
   *
   * Passed = show this. Omitted = the plan type, exactly as before.
   */
  planLabel?: string | null;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();

  /*
   * COS-755 — the care plan is now COMPOSED, not a fixed tier.
   *
   * "Basic" and "Advanced" were hardcoded ladders with a fixed set of things
   * in each. An admin now builds a plan from these sections and can name the
   * result whatever they like, so the gate belongs on each section rather
   * than on the tier — a tier check could not survive being renamed.
   *
   * useCanRender treats the wildcard as a grant, and the wildcard is what
   * prod and staging return while plan_tier_enabled is unset there. So every
   * section still renders everywhere enforcement is off, and this only bites
   * where a plan is genuinely in force.
   */
  /*
   * COS-803 — one place where gating turns on.
   *
   * The hooks run unconditionally (rules of hooks) but the ANSWER is forced
   * open unless this surface opted in. So the classic Care Plan tab keeps
   * every section regardless of plan, and only Plan+ composes.
   */
  const gate = (allowed: boolean): boolean => !entitlementGating || allowed;

  const rawCanWellbeingMap = useCanRender('biopsychosocial-plan.view-wellbeing-map');
  const rawCanSelfAssessments = useCanRender('biopsychosocial-plan.view-self-assessments');
  const rawCanDailyRoutines = useCanRender('biopsychosocial-plan.view-daily-routines');
  const rawCanNutrition = useCanRender('biopsychosocial-plan.view-nutrition-plan');
  const rawCanMedications = useCanRender('biopsychosocial-plan.view-medications');
  const rawCanSharePdf = useCanRender('biopsychosocial-plan.share-plan-pdf');
  /*
   * COS-802 — the blocks COS-755 missed.
   *
   * view-wellbeing-score, view-ai-summary and the three domain keys were in
   * the catalog from the start but had no call site, so an admin could untick
   * them and nothing happened. view-todays-tasks and view-progress did not
   * exist at all — the Today tile was the one block on this screen a plan
   * could not be built without.
   *
   * Every one of these keys is granted by the COS-802 back-fill, so a plan
   * that has been through it renders exactly as it does today.
   */
  const rawCanWellbeingScore = useCanRender('biopsychosocial-plan.view-wellbeing-score');
  const rawCanTodaysTasks = useCanRender('biopsychosocial-plan.view-todays-tasks');
  const rawCanViewProgress = useCanRender('biopsychosocial-plan.view-progress');
  const rawCanAiSummary = useCanRender('biopsychosocial-plan.view-ai-summary');
  const rawCanBioSection = useCanRender('biopsychosocial-plan.view-bio-section');
  const rawCanPsychologicalSection = useCanRender('biopsychosocial-plan.view-psychological-section');
  const rawCanSocialSection = useCanRender('biopsychosocial-plan.view-social-section');

  const canWellbeingMap = gate(rawCanWellbeingMap);
  const canSelfAssessments = gate(rawCanSelfAssessments);
  const canDailyRoutines = gate(rawCanDailyRoutines);
  const canNutrition = gate(rawCanNutrition);
  const canMedications = gate(rawCanMedications);
  const canSharePdf = gate(rawCanSharePdf);
  const canWellbeingScore = gate(rawCanWellbeingScore);
  const canTodaysTasks = gate(rawCanTodaysTasks);
  const canViewProgress = gate(rawCanViewProgress);
  const canAiSummary = gate(rawCanAiSummary);
  const canBioSection = gate(rawCanBioSection);
  const canPsychologicalSection = gate(rawCanPsychologicalSection);
  const canSocialSection = gate(rawCanSocialSection);
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'] as unknown as Record<string, string>;
  const planTypeDisplayName = usePlanTypeDisplayName();

  const planQuery = useBiopsychosocialPlan();
  const regenerateMutation = useRegenerateBiopsychosocialPlan();
  // SCRUM-651: cancel-in-flight mutation. Separate mutation key so the
  // useIsMutating observers below can distinguish "regen pending" from
  // "cancel pending" — the CTA needs to reflect BOTH so a user can't tap
  // Retry while a cancel is still landing server-side.
  const cancelMutation = useCancelBiopsychosocialRegeneration();

  // SCRUM-651: live-ticking selector driven by `jobStartedAt`. Replaces
  // the pre-651 static `REGENERATE_PENDING_WINDOW_MS` latch. The 1-per-sec
  // tick only runs while jobStartedAt is defined (see hook impl), so the
  // idle case pays zero cost. Server-supplied envelope thresholds override
  // the client defaults when the BE ships them (backward-compat: absent →
  // defaults, per SCRUM-651 spec).
  const regenStatus = useBioRegenerationStatus(planQuery.data?.jobStartedAt, {
    clientBannerSwapSeconds: planQuery.data?.clientBannerSwapSeconds,
    stuckJobThresholdSeconds: planQuery.data?.stuckJobThresholdSeconds,
  });

  // CHUNK 77 (2026-07-23): cross-instance observer on the shared regen
  // mutation key so a subtle top banner can render whenever ANY caller
  // (this screen's Refresh button, BpsWellbeingScoreCard's empty-pill
  // picker, a future entry point) has a regen in flight. Matches the
  // chunk 67 pattern in BpsWellbeingScoreCard — `useIsMutating` returns
  // the count of mutations matching the key across every hook instance,
  // so we treat any non-zero as pending. Cheap (subscription only), and
  // this component already renders on regenerateMutation.isPending
  // changes so the extra subscription adds no wasted work. No kill
  // switch — inert (renders null) when count is zero.
  const regenPendingCount = useIsMutating({
    mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY],
  });
  const isRegenPending = regenPendingCount > 0;
  // SCRUM-651: mirror observer for the cancel mutation so any concurrent
  // Cancel tap (from this screen or any future entry point) also disables
  // the CTA cross-instance. Cheap — same subscription shape as regen.
  const cancelPendingCount = useIsMutating({
    mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY],
  });
  const isCancelPending = cancelPendingCount > 0;

  // CHUNK 86 v2 (2026-07-23): explicit VoiceOver/TalkBack announcements for
  // regen start AND end. The chunk-86 v1 wrapper landed accessibilityRole=
  // "alert" + accessibilityLiveRegion="polite" + an `accessible` toggle, but
  // 3-lens verify caught two silent-failure modes those props can't cover:
  //   1) accessibilityLiveRegion is Android-only in RN 0.83 — no-op on iOS.
  //   2) accessibilityRole="alert" only announces on MOUNT; the v1 wrapper is
  //      kept mounted (idle = collapsed style) so the rising-edge alert trait
  //      fires zero times. Result: iOS never announces at all.
  //   3) Android's live-region announces added descendants but NOT removals,
  //      so the regen-END transition is silent on BOTH platforms.
  // Fix mirrors the pattern already in this file at ~L1032 (chunk 55) and in
  // MedicationsSection.tsx L149-157 (rising-edge error announce): a ref tracks
  // the prev value of isRegenPending and an effect fires
  // AccessibilityInfo.announceForAccessibility on the false→true and true→false
  // edges. This is the ONE cross-platform primitive that announces
  // unconditionally on both iOS VoiceOver and Android TalkBack. The chunk-86 v1
  // props stay in place — additive on Android, harmless on iOS.
  const prevIsRegenPendingRef = React.useRef(isRegenPending);
  React.useEffect(() => {
    const prev = prevIsRegenPendingRef.current;
    if (!prev && isRegenPending) {
      AccessibilityInfo.announceForAccessibility('Refreshing your plan');
    } else if (prev && !isRegenPending) {
      AccessibilityInfo.announceForAccessibility('Plan refreshed');
    }
    prevIsRegenPendingRef.current = isRegenPending;
  }, [isRegenPending]);

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

  // CHUNK 60 (2026-07-22): hoisted wellbeing derivation — computed ONCE
  // at this parent level so BpsWellbeingScoreCard, BpsPlanFocusBanner,
  // and each SectionCard's `isFocus` gate all read the SAME focus value
  // from a single deriveWellbeing() pass. Shares react-query cache keys
  // with the card + SelfAssessmentTrends, so this observer adds zero
  // extra network (dedupe on ['assessments-trends'] +
  // ['assessment-history', id]). Hook call is unconditional
  // (rules-of-hooks); the FLAG gates only the render below.
  const wellbeing = useWellbeingDerivation();
  const focusDomain = BPS_PLAN_FOCUS_SIGNAL_ENABLED ? wellbeing.derivation.focus : undefined;
  const focusSectionKey = bpsToSection(focusDomain);
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

  // SCRUM-651: `onRegenerate` + `onCancel` handlers are declared LOWER in
  // this function (right after the `regenerateDisabled` /
  // `isGeneratingFromAnySource` / `inFlightJobId` derivations they close
  // over). Pre-651 `onRegenerate` sat here because it depended on nothing
  // that wasn't in scope yet; the idempotency-guard closure added by 651
  // (`if (regenerateDisabled) return`) forced the move.

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
  // CHUNK 71: node ref for AccessibilityInfo.setAccessibilityFocus so the
  // ?focus=medications deep-link moves VoiceOver focus ONTO the meds
  // section (rotor lands there) instead of only firing an announcement.
  // Attached to the same wrapper View that owns medsSectionYRef's
  // onLayout, so the two stay in lockstep. iOS-only under the hood;
  // findNodeHandle returns null on unmounted refs and setAccessibilityFocus
  // is a no-op on Android — the existing announce below is the
  // graceful-degrade fallback for both cases.
  const medsSectionRef = React.useRef<View | null>(null);
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
  // COS-479: Y-position of the DetailsAccordion header so the three
  // domain dots in HeroScoreBlock can scroll the user down to the
  // shipped content when tapped. Same pattern as
  // selfAssessmentsSectionYRef — parent-owned ref, filled by the
  // accordion's onLayoutHeader callback, consumed by scrollToSeeDetails
  // below. Best-effort: no-op if the accordion hasn't laid out yet.
  // scrollTo({ animated: true }) is a user-initiated navigation
  // (not a cold-mount animation) and matches the shipped
  // scrollToSelfAssessments call — does NOT violate the iOS 26.5
  // Animated ban (that rule targets Animated / LayoutAnimation on
  // render/mount paths, not native ScrollView.scrollTo).
  const detailsAccordionYRef = React.useRef<number | null>(null);
  const scrollToSeeDetails = React.useCallback(() => {
    const y = detailsAccordionYRef.current;
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }, []);
  // CHUNK 60: Y-positions of the three SectionCards, keyed by section
  // key, so BpsPlanFocusBanner can scroll to the matching section on
  // tap. Same pattern as medsSectionYRef / selfAssessmentsSectionYRef —
  // parent-owned Map ref, filled by each section's onLayout wrapper,
  // consumed by scrollToSection below. Best-effort: no-op if the target
  // section hasn't laid out yet (matches meds/self-assessments
  // discipline; do not scroll to y=0 which would jump to the top).
  const sectionYByKey = React.useRef<Map<BiopsychosocialSectionKey, number>>(
    new Map<BiopsychosocialSectionKey, number>(),
  );
  const scrollToSection = React.useCallback((key: BiopsychosocialSectionKey) => {
    const y = sectionYByKey.current.get(key);
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }, []);
  /**
   * Reveal-where-it-landed, after a nutrition suggestion becomes a task.
   *
   * Vishal 2026-08-11: "we are not giving user any info where its added". Two
   * options were on the table — a modal explaining the destination, or
   * navigating to it. This is the second: scroll to the section, open its
   * Tasks accordion, and flash the new row. It uses machinery that already
   * exists here (scrollToSection, the section onLayout map) and leaves no
   * dialog to dismiss.
   *
   * Order matters. The refetch has to RESOLVE first, or we scroll to a
   * section whose task list does not contain the new row yet and the flash
   * lands on nothing.
   */
  const [openTasksSignal, setOpenTasksSignal] = React.useState(0);
  const [highlightTaskId, setHighlightTaskId] = React.useState<string | null>(null);
  const highlightTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Start the clear timer only once the scroll has been issued.
   *
   * Previously the 3.5s began before the scroll, so a slow layout ate most of
   * the window and Vishal never saw the flash. The row is on screen by the
   * time this runs.
   */
  const startHighlightTimer = React.useCallback(() => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightTaskId(null), 3500);
  }, []);

  /** The highlighted row's node, registered by TaskListSection. */
  const highlightNodeRef = React.useRef<View | null>(null);

  /*
   * A screen-level "saving…" banner used to live here. Vishal 2026-08-11:
   * "this message idea is not good" — and he was right: it reported that
   * SOMETHING was happening while saying nothing about WHICH row, so the eye
   * had nowhere to go. Replaced by optimistic rows (see useCreatePlanTask /
   * useDeletePlanTask onMutate): the task appears immediately marked
   * 'creating', or stays put struck through marked 'deleting', and the
   * feedback sits on the thing it is about.
   */
  /** Live scroll offset, needed to convert a screen position into a scroll target. */
  const scrollOffsetY = React.useRef(0);

  /** Cancels an in-flight eased scroll. */
  const scrollAnimRef = React.useRef<number | null>(null);

  /**
   * Scroll with a duration we control.
   *
   * Vishal 2026-08-11: "scroll is still too fast, it can be smooth".
   * ScrollView.scrollTo({animated:true}) runs a fixed ~250-300ms native
   * animation with no duration knob, which reads as a snap on a long travel.
   *
   * So drive it from JS: an easeInOutCubic ramp over 700ms, stepping with
   * scrollTo({animated:false}) each frame. requestAnimationFrame only — no
   * Animated / LayoutAnimation, which this screen's iOS 26.5 envelope
   * excludes.
   *
   * Honours reduce-motion by jumping straight there (same precedent as
   * components/home/ScoreCardGrid.tsx). Motion that exists to orient someone
   * is exactly the motion a vestibular-sensitive user needs skipped.
   */
  const smoothScrollTo = React.useCallback((targetY: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }

    const from = scrollOffsetY.current;
    const distance = targetY - from;
    if (Math.abs(distance) < 2) return;

    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (reduceMotion) {
          scroller.scrollTo({ y: targetY, animated: false });
          return;
        }
        const DURATION = 700;
        const started = Date.now();
        const step = () => {
          const elapsed = Date.now() - started;
          const t = Math.min(1, elapsed / DURATION);
          // easeInOutCubic — slow at both ends, quick through the middle.
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          scroller.scrollTo({ y: from + distance * eased, animated: false });
          if (t < 1) {
            scrollAnimRef.current = requestAnimationFrame(step);
          } else {
            scrollAnimRef.current = null;
          }
        };
        scrollAnimRef.current = requestAnimationFrame(step);
      });
  }, []);

  const revealAddedTask = React.useCallback(
    async (taskId: string) => {
      await aiPlanQuery.refetch();
      setOpenTasksSignal((n) => n + 1);
      setHighlightTaskId(taskId);

      // Start the clear timer HERE, unconditionally.
      //
      // Vishal 2026-08-11: "i can see highlight but it fixed, its not
      // disappearing". My previous attempt started this inside measureLayout's
      // success/failure callbacks — and measureLayout silently fired NEITHER
      // (it no-ops when the relative-to handle is not a valid ancestor), so
      // the timer never armed and the outline stayed forever. The same dead
      // callback is why nothing scrolled.
      //
      // A visual cue must never depend on a measurement succeeding. The scroll
      // may fail; the highlight still clears.
      startHighlightTimer();

      // Position the row using measureInWindow on both the row and the
      // ScrollView, plus the live offset. Every input here is a value that
      // reliably arrives for a mounted view — unlike measureLayout, which
      // needs a valid ancestor handle and fails silently when it does not get
      // one.
      //
      //   target = currentOffset + (rowScreenY - scrollViewScreenY) - headroom
      const scrollToHighlightedRow = () => {
        const node = highlightNodeRef.current;
        const scroller = scrollRef.current;
        if (!node || !scroller) {
          scrollToSection('biological');
          return;
        }

        // Belt: if either measure callback never fires, still move.
        let settled = false;
        const fallback = setTimeout(() => {
          if (!settled) scrollToSection('biological');
        }, 300);

        node.measureInWindow((_rx: number, rowY: number) => {
          (
            scroller as unknown as {
              measureInWindow?: (cb: (x: number, y: number) => void) => void;
            }
          ).measureInWindow?.((_sx: number, svY: number) => {
            settled = true;
            clearTimeout(fallback);
            // 120px of headroom so the row lands below the section header
            // rather than flush against the top edge.
            const target = scrollOffsetY.current + (rowY - svY) - 120;
            smoothScrollTo(Math.max(0, target));
          });
        });
      };

      // Two frames: one for the accordion's state change to commit, one for
      // its children to lay out. rAF rather than a fixed timeout so this
      // tracks the device rather than a guessed duration — scrolling while the
      // accordion is still expanding is what made the motion stutter.
      requestAnimationFrame(() => requestAnimationFrame(scrollToHighlightedRow));
    },
    [aiPlanQuery, scrollToSection, startHighlightTimer, smoothScrollTo],
  );

  React.useEffect(
    () => () => {
      if (scrollAnimRef.current !== null) cancelAnimationFrame(scrollAnimRef.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

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
  // users get a signal that navigation completed. CHUNK 71 promotes
  // this to a real focus move — findNodeHandle(medsSectionRef.current)
  // + AccessibilityInfo.setAccessibilityFocus lands the rotor ON the
  // meds section wrapper (iOS). Android has no setAccessibilityFocus
  // implementation (native no-op), and findNodeHandle returns null on
  // unmounted refs — in both degrade cases the announce still runs so
  // the user gets audible confirmation the deep-link fired.
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
        // CHUNK 71: move VoiceOver focus onto the meds section wrapper
        // so the rotor lands there. iOS-only in practice — Android's
        // AccessibilityInfo.setAccessibilityFocus is a native no-op and
        // findNodeHandle returns null for unmounted refs, so we
        // null-guard and always fall through to the announcement below
        // as a graceful degrade path.
        const medsNode = medsSectionRef.current
          ? findNodeHandle(medsSectionRef.current)
          : null;
        if (medsNode != null) {
          AccessibilityInfo.setAccessibilityFocus(medsNode);
        }
        // Queue the announcement so it fires after any in-flight
        // VoiceOver read (plan header, MedicationsReviewPrompt modal
        // a11y focus) instead of preempting it. Retained as the
        // fallback when setAccessibilityFocus is unavailable (Android)
        // or the node ref hadn't attached yet. announceForAccessibility
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

  const plan = planQuery.data?.plan ?? null;
  // SCRUM-660: generatedDate no longer surfaced on this screen — the
  // "Updated {date}" caption was removed per user request. Keeping the
  // formatter import + this comment so a future revert can re-add the
  // caption with one line.
  // SCRUM-661 (2026-07-31): reactive current-hour for the shared
  // GreetingHeader below. Sampled once per minute + primitive-diff
  // bail (only triggers a re-render when the hour bucket flips) —
  // same wiring as app/Home/index.tsx uses.
  const currentHour = useCurrentHour();
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
  // SCRUM-651: CTA is disabled while ANY of these are true:
  //   - this device's own regen mutation is pending (bridge window)
  //   - server says a job is in flight (`generating: true`)
  //   - a cancel is pending (either the DELETE hasn't landed or the
  //     mirror push hasn't invalidated yet)
  // The `cancelMutation.isPending` extra guard closes the tap-race where a
  // user could tap Cancel then immediately tap Retry before the DELETE
  // landed, leaving a stray REGENERATE_IN_FLIGHT 409 on the server.
  const regenerateDisabled =
    regenerateMutation.isPending || isRegenerating || cancelMutation.isPending || isCancelPending;
  const isGeneratingFromAnySource =
    regenerateMutation.isPending || isRegenerating;
  // Static banner ("started X ago") only when it's specifically another
  // device's job — this device's own tap already shows the button loader.
  const showOtherDeviceGenerating = isRegenerating && !regenerateMutation.isPending;

  // SCRUM-651: past the client-side (or server-supplied) banner-swap
  // threshold — the "generating for a while" active copy hands off to
  // the passive "we'll notify you" banner. Only meaningful when there's
  // actually a job in flight; short-circuit on the guard so a stale
  // jobStartedAt (post-cancel, pre-invalidate) can't trigger the swap.
  const isPast5MinBannerSwap = isGeneratingFromAnySource && regenStatus.isPast5MinBanner;

  // SCRUM-651: Cancel button visibility — mirrors `isGeneratingFromAnySource`
  // per spec ("only shown when isPending || isRegenerating"). Additionally
  // suppress while a cancel is already pending so the button doesn't flicker
  // out from under the user mid-tap.
  const showCancelButton = isGeneratingFromAnySource && !cancelMutation.isPending && !isCancelPending;

  // SCRUM-651: the jobId to hand to the cancel DELETE. Only defined when
  // the server actually reports one — a stale `generating: true` without
  // a `jobStartedAt` (should never happen but the type allows it) means
  // we have no jobId either, and the cancel mutationFn no-ops in that case.
  // The BE contract for SCRUM-651 says the plan envelope carries jobId
  // alongside jobStartedAt; if BE ships the field name differently we'll
  // adapt here rather than requiring another OTA to the mutation layer.
  //
  // Interim: derive jobId from the same source-of-truth used by
  // `showOtherDeviceGenerating`. If the envelope doesn't carry an
  // explicit `jobId`, the mutationFn's `undefined` path still resolves
  // (see hook impl) — the DELETE simply doesn't fire and the user's tap
  // is treated as a request to hide the banner locally on the next
  // invalidate (which the mirror-push branch in use-notifications.ts
  // will trigger regardless).
  const inFlightJobId: string | undefined = (
    planQuery.data as { jobId?: string } | undefined
  )?.jobId;

  // ── SCRUM-651: tap handlers ────────────────────────────────────────────
  // Moved down from the pre-651 slot (~line 948 in git blame) so they can
  // close over `regenerateDisabled` / `isGeneratingFromAnySource` /
  // `inFlightJobId` (all defined immediately above) without a
  // used-before-declaration TS error. CHUNK 40 (2026-07-21) rationale
  // still holds: fire-and-forget under the hood via the hook's rewritten
  // mutationFn; Alert.alert onError removed because Alert opens a native
  // modal whose turbomodule interactions were exactly the crash surface
  // we're leaving. Errors are reconciled on the next
  // ['biopsychosocial-plan'] fetch (either the notifications mirror
  // branch or the ~3-5s hook bridge invalidate).
  const onRegenerate = React.useCallback(() => {
    // SCRUM-651: idempotency guard. The server 409s REGENERATION_IN_FLIGHT
    // when a job is already running for this patient, and the UI has to
    // NOT invite that tap (the disabled state via `regenerateDisabled`
    // covers the sighted-user path; this belt-and-suspenders check covers
    // the a11y "double-tap through disabled" edge and any programmatic
    // callers that might reach this handler off the render tree). Silently
    // dropping is the correct behavior — the user's intent ("kick off a
    // regen") is already satisfied by the in-flight job.
    if (regenerateDisabled) return;
    regenerateMutation.mutate();
  }, [regenerateMutation, regenerateDisabled]);

  const onCancel = React.useCallback(() => {
    if (!isGeneratingFromAnySource) return;
    if (cancelMutation.isPending) return;
    cancelMutation.mutate({ jobId: inFlightJobId });
  }, [cancelMutation, inFlightJobId, isGeneratingFromAnySource]);

  // ── Loading / error guards ───────────────────────────────────────────────
  //
  // MOVED DOWN HERE from just after the query, and they must stay below every
  // hook. They used to sit above useCurrentHour and the onRegenerate/onCancel
  // callbacks, which meant a loading or error render ran THREE FEWER HOOKS
  // than a loaded one. React throws "Rendered more hooks than during the
  // previous render" the moment that flips, and with no error boundary that
  // took the entire app down — which is exactly what IntakeCtaCard did on
  // 2026-08-15 (iOS 26.6, SIGABRT on expo.controller.errorRecoveryQueue).
  //
  // Safe to run the hooks first: nothing between here and the query
  // dereferences `plan`, so the guards protect the RENDER, not the hooks.
  if ((planQuery.isLoading || planQuery.isFetching) && !planQuery.data) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: 'transparent' }]}
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
          style={[styles.container, { backgroundColor: 'transparent' }]}
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
          style={[styles.container, { backgroundColor: 'transparent' }]}
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
          style={[styles.container, { backgroundColor: 'transparent' }]}
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
              label={planLabel ?? planTypeDisplayName(currentPlanType as PlanType)}
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
        // Live offset for revealAddedTask: measureInWindow gives SCREEN
        // coordinates, and converting one into a scroll target needs to know
        // where we currently are. 16ms is one frame — cheap, and the handler
        // only writes a ref so it never triggers a render.
        onScroll={(e) => {
          scrollOffsetY.current = e.nativeEvent.contentOffset.y;
        }}
        // A JS-driven scroll must never fight the user's finger. Touching the
        // list cancels the ramp and hands control straight back.
        onScrollBeginDrag={() => {
          if (scrollAnimRef.current !== null) {
            cancelAnimationFrame(scrollAnimRef.current);
            scrollAnimRef.current = null;
          }
        }}
        scrollEventThrottle={16}
        // SCRUM-658 (2026-07-31): transparent scroll background per
        // user request ("i want to set plan screen background as
        // transparent because its cutting bubbles"). AppWrapper's
        // parent SafeAreaView provides the underlying color; letting
        // this ScrollView be transparent stops the meds-editor pill
        // shadows + score-band chips from being visually clipped by
        // an opaque bg-color rectangle behind them at layout edges.
        style={[styles.container, { backgroundColor: 'transparent' }]}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        {/*
          CHUNK 77 (2026-07-23): subtle top "Refreshing your plan..."
          banner. Chunks 40 + 67 wired regen to run cross-instance
          (BpsWellbeingScoreCard's empty-pill picker fires .mutate()
          then immediately unmounts on router.replace); the Wellbeing
          pill shows "Processing…" but the rest of the BPS surface
          previously had no signal. This soft teal callout reserves
          ~44pt only while ANY regen call is pending (via useIsMutating
          on the shared REGENERATE_BIO_PLAN_MUTATION_KEY) and renders
          null otherwise — one intentional shift on start/finish, no
          jitter.

          iOS 26.5 primitive envelope only: static View / Text /
          MaterialIcons (info-outline). NO ActivityIndicator, NO
          Animated, NO rotate transform, NO Portal, NO gradient — the
          "…" trailing the label is the entire progress affordance. Same
          Modal-free primitive shape chunks 47/50/57/59 proved safe on
          iPhone 14 iOS 26.5 build 62.

          Inert when no regen is pending, so no kill switch is needed —
          removing chunk 77's contribution reverts to zero UI on both
          idle AND regen states. Recovery cost if the observer itself
          misbehaves: ~30-60s via `npm run eas:update:production` to
          delete the block.
        */}
        {/*
          CHUNK 86 v2 (2026-07-23): a11y — VoiceOver/TalkBack must announce
          the regen start AND end. The primary driver is the effect above
          (prevIsRegenPendingRef + AccessibilityInfo.announceForAccessibility
          on both rising and falling edges) — that is the ONE cross-platform
          primitive that fires unconditionally on iOS and Android for both
          transitions. The wrapper View is ALWAYS mounted (collapsed to 0pt
          when idle via styles.regenBannerHidden) so the additive props below
          have a stable node:
            • Android: accessibilityLiveRegion="polite" is a COMPLEMENT to
              the explicit announce — TalkBack also emits when the descendant
              Text appears, giving a belt-and-suspenders behavior on the
              start edge. It does NOT announce descendant removal, which is
              precisely why the falling-edge explicit announce is required.
              Keeping the wrapper mounted means the live-region subscription
              survives across the transition (some Android versions drop the
              first announcement when the region node itself unmounts).
            • iOS: accessibilityLiveRegion is a NO-OP in RN 0.83 (Android-
              only), and accessibilityRole="alert" only announces on MOUNT
              — with the wrapper kept mounted the rising-edge alert trait
              never fires. iOS therefore relies entirely on the explicit
              AccessibilityInfo.announceForAccessibility calls in the effect
              above. The role="alert" + accessible toggle props are retained
              because they are harmless on iOS (no announcement side-effect
              once mounted) and preserve intent for future RN versions that
              may light up cross-platform live-region support.
          Sighted UX is bit-identical to pre-chunk-86: collapsed style zeros
          height/padding/margin/border, so the "one intentional 44pt shift
          on start/finish" behavior from chunk 77 is preserved. When idle we
          also set importantForAccessibility="no-hide-descendants" so
          TalkBack cannot land focus on the empty shell.
          Props-only + one effect; no Modal/Animated/LayoutAnimation/Portal/
          gradient/blur/ActivityIndicator added — iOS 26.5 primitive envelope
          (View/Text/MaterialIcons) unchanged.
        */}
        <View
          style={[
            styles.regenBanner,
            isRegenPending
              ? {
                  backgroundColor: (colors.tint ?? '#0D9488') + '14',
                  borderColor: (colors.tint ?? '#0D9488') + '33',
                }
              : styles.regenBannerHidden,
          ]}
          accessible={isRegenPending}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={isRegenPending ? 'Refreshing your plan' : undefined}
          importantForAccessibility={isRegenPending ? 'yes' : 'no-hide-descendants'}
        >
          {isRegenPending && (
            <>
              <MaterialIcons name="info-outline" size={16} color={colors.tint} />
              <Text
                style={[
                  styles.regenBannerText,
                  { color: colors.text, fontSize: getScaledFontSize(13) },
                ]}
              >
                Refreshing your plan...
              </Text>
            </>
          )}
        </View>

        {/* Header — patient greeting + tier pills */}
        <View style={[styles.headerBlock, { flexDirection: 'row', alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/*
              SCRUM-661 (2026-07-31): swap the inline BPS-specific greeting
              Text (26pt / 800 / letterSpacing -0.4) for the SAME
              GreetingHeader home uses. Same font, same weight, same
              padding. useCurrentHour makes it real-time (updates at
              hour boundary — morning → afternoon → evening) matching
              home's SCRUM-653 behaviour. Wrap with a negative
              paddingHorizontal offset because GreetingHeader bakes 20pt
              horizontal padding into its own View, and this parent
              already lives inside the ScrollView contentContainerStyle's
              Spacing.md (16) padding — total would land the greeting
              36pt from the edge. -6 outer margin lands it back at 30pt,
              a hair further in than the tier row (16pt) which reads
              cleanly as the page anchor.
            */}
            <View style={{ marginHorizontal: -6, marginTop: -12, marginBottom: 8 }}>
              <GreetingHeader
                userFirstName={patientName ?? undefined}
                nowHour={currentHour}
              />
            </View>
            {/*
              SCRUM-659 (2026-07-31): "Updated {date}" meta row moved
              OFF a dedicated line and INTO the tier row below (right-
              aligned). Consolidates the top-of-page chrome into two
              rows total: greeting → [tier pill · view-progress · meds
              · updated date]. Previous shape wasted a full row on the
              date-only meta. Sparkle icon dropped — the "Updated" word
              is self-labeling.
            */}
            {/* CHUNK 50: PlanTierPill + optional ViewProgressLink share a
                row that wraps to a second row on narrow widths (iPhone SE
                class) when both pills + the headerRight banner would
                otherwise overflow. */}
            <View style={styles.tierRow}>
              <PlanTierPill
                label={planLabel ?? planTypeDisplayName(currentPlanType ?? 'basic')}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                onPress={onChangePlanType}
              />
              {/* COS-802 — the pill is gated; the Switch plan pill beside it
                  deliberately is NOT. A patient on a thin plan needs the way
                  OUT of it more than anyone, and gating the escape hatch on
                  the plan you are trying to escape is a trap. */}
              {BPS_PROGRESS_LINK_ENABLED && canViewProgress && (
                <ViewProgressLink
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onPress={() => router.push('/Home/bps-progress' as never)}
                />
              )}
              {/*
                Ken 2026-08-05 — MedicationsLink pill REMOVED from the
                tier row. Replaced by a proper MedicationsBanner as a
                sibling section entry below HabitsBanner (see mount
                point ~L2050 in the same commit). Pill entry lost in a
                dense control row; the banner reads as a proper
                section header and matches the report's medical color.
              */}
              {/*
                SCRUM-660 (2026-07-31): "Updated {date}" removed
                entirely from this surface — user tried two placements
                (its own row / inlined in tier row) and both felt
                cluttered. The date is still available via the plan
                metadata query for callers that need it, but the top-
                of-page chrome now stops at the tier pills. If a "last
                updated" affordance is needed later, wire it into the
                Refresh button label or a tooltip on the tier pill
                rather than a dedicated caption.
              */}
            </View>
          </View>
          {/* COS-469 / Phase 4 — optional Try-unified-view affordance. */}
          {headerRight ? <View>{headerRight}</View> : null}
        </View>

        {/*
          COS-479 (2026-07-23): D1 hero stack — greeting + 96pt composite
          + plain-English caption + three domain dots, then a
          OneThingTodayCard, then the WellbeingMapGlimpse. Gated on
          BPS_HERO_LAYOUT_ENABLED; when false, this block compiles out and
          the screen falls through to the current shipped layout below.
          The three dots scroll to the DetailsAccordion header via the
          detailsAccordionYRef captured in onLayoutHeader below.
        */}
        {BPS_HERO_LAYOUT_ENABLED && (
          <>
            <HeroScoreBlock
              userFirstName={patientName ?? undefined}
              composite={wellbeing.derivation.composite}
              priorComposite={
                typeof wellbeing.derivation.composite === 'number' &&
                wellbeing.derivation.trend
                  ? wellbeing.derivation.composite - wellbeing.derivation.trend.delta
                  : undefined
              }
              // Per-domain trend arrows are not currently exposed on
              // WellbeingDerivation (chunk 60 only carries the overall
              // composite trend). Default all three to 'flat' so the
              // dots always have an arrow. Additive extension to
              // deriveWellbeing is queued as a follow-up.
              domainTrends={{ bio: 'flat', mind: 'flat', social: 'flat' }}
              onDotsPress={scrollToSeeDetails}
              colors={colors as unknown as Record<string, string>}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <OneThingTodayCard
              focusDomain={focusDomain}
              // No actionForFocus() exists yet in lib/wellbeing-caption.ts —
              // OneThingTodayCard hides the action line entirely when this
              // is undefined (spec-compliant), so passing undefined here is
              // the correct v1 wire.
              focusActionSentence={undefined}
              onCompleted={() => undefined}
            />
            {canWellbeingMap && <WellbeingMapGlimpse />}
          </>
        )}
        {/*
          COS-479 IIFE wrap: captures the current shipped body (from the
          Wellbeing Score card through the Refresh button) into a JSX
          const, then either renders it verbatim (flag=false, ZERO delta)
          or hosts it verbatim inside the DetailsAccordion (flag=true).
          Bit-identical to today's layout when BPS_HERO_LAYOUT_ENABLED is
          false — the accordion is never mounted, the const is inlined
          into the ScrollView tree. Chunks 82-124 a11y contracts are
          preserved because the shipped children mount with the same
          props / hooks / render paths in both branches.
        */}
        {(() => {
          const detailsBody = (
            <>
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
        {/*
          SCRUM-655 (2026-07-31): The two hero cards (Wellbeing composite
          + Today %) are now presented as compact side-by-side tiles;
          tapping a tile expands the full shipped card below with a
          native-driver opacity fade. Preserves BOTH shipped cards
          verbatim as the expanded content — no data-shape churn, no
          drill-down affordance regression. Rendered unconditionally
          because the kill-switches (BPS_WELLBEING_SCORE_ENABLED,
          BPS_TODAY_HERO_ENABLED) were both `true` and are now
          module-level dead code the tile-row implicitly always shows.
          If we ever need to hide the row entirely, gate the whole
          <BpsHeroTileRow /> block here on a fresh kill-switch.

          Loading placeholder for today's tasks: the tile-row's Today
          face gracefully renders `— / no tasks today` on empty AND
          during load — the expanded card itself null-renders when
          totalToday === 0, matching the legacy hero's guard. No
          separate skeleton shell needed here because the tiles are
          fixed-height (128pt) — cache-miss + late resolve doesn't
          jitter the surface.
        */}
        <BpsHeroTileRow
          colors={colors as unknown as Record<string, string>}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          onPressWellbeingDetails={scrollToSelfAssessments}
          derivation={wellbeing.derivation}
          isLoading={wellbeing.isLoading}
          isEmpty={wellbeing.isEmpty}
          tasks={todayTasks}
          showWellbeing={canWellbeingScore}
          showToday={canTodaysTasks}
        />

        {/*
          SCRUM-640 (2026-08-04): Habit correlation strip. Dark-launched:
          renders null when `habit_journal_enabled` is OFF (default) OR
          when the user has fewer than min_sample_size=10 days of
          entries for any habit. Once populated, shows the top 3
          habits by |r| against the daily wellbeing composite, with a
          "directional pattern, not a clinical finding" disclaimer.
          Visual polish deferred to Ken; data-testid stable at
          'habit-correlation-strip'. Sits between the hero tile row
          (which owns the wellbeing score band + today hero on
          tile-expand) and the wellbeing-map banner below, so it
          reads as a natural extension of the wellbeing overview
          rather than a competing card.
        */}
        <HabitCorrelationStrip />

        {/*
          SCRUM-648 — Biological tile: Blood Glucose (TIR). Dark-launched:
          the tile self-gates on `cgm_glucose_enabled` AND on data
          presence (renders null if flag OFF, if the query hasn't
          returned yet, or if sampleCount=0). Tap routes to
          /Home/glucose (also flag-gated). Mounted immediately after
          the HabitCorrelationStrip so the two dark-launched Biological
          add-ons sit together as a natural sub-band beneath the
          wellbeing score card, mirroring SCRUM-640's precedent.
          Backend routes are always mounted (inner-branch flag); the
          FE flag is the ONLY visibility gate on this surface.
        */}
        <GlucoseTirTile />

        {/*
          SCRUM-661 (2026-07-31): Wellbeing Map banner — user asked for
          the circular Venn back (SCRUM-660 iteration used just a
          MaterialIcons hub-chip, which lost the visual identity the
          circular map carries). New layout: compact 3-circle Venn on
          the left (Body / Mind / Life circles, 44pt each, 90pt wide
          overall), title + subtitle in the middle, chevron on the
          right. Palette mirrors the home-screen WellbeingMapPreview
          Venn (BIO green, MIND purple, LIFE orange) so both surfaces
          read as one system. iOS 26.5 primitive envelope only:
          View / Text / Pressable / StyleSheet / MaterialIcons.
        */}
        <Pressable
          onPress={() => router.push('/Home/wellbeing-map' as never)}
          accessibilityRole="button"
          accessibilityLabel="Open your Wellbeing map. Explore all 8 areas: Body, Mind, Life, Sleep, Movement, Nutrition, Connection, Purpose."
          accessibilityHint="Shows how your goals cluster across the 8 wellbeing areas"
          style={({ pressed }) => [
            styles.mapCard,
            {
              backgroundColor: (colors.tint as string) + '14',
              borderColor: (colors.tint as string) + '33',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {/* Compact Venn — same shape as WellbeingMapPreview but scaled
              down to fit as a card affordance instead of a full tile. */}
          <View
            style={styles.mapVennWrap}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View
              style={[
                styles.mapVennCircle,
                { left: 0, top: 0, backgroundColor: 'rgba(25,156,79,0.28)', borderColor: '#199C4F' },
              ]}
            />
            <View
              style={[
                styles.mapVennCircle,
                { left: 42, top: 0, backgroundColor: 'rgba(123,63,228,0.28)', borderColor: '#7B3FE4' },
              ]}
            />
            <View
              style={[
                styles.mapVennCircle,
                { left: 21, top: 30, backgroundColor: 'rgba(201,118,0,0.28)', borderColor: '#C97600' },
              ]}
            />
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
              Explore all 8 areas — see which are strong and which need attention.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.tint} />
        </Pressable>

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
                accessibilityRole="header"
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
            {/* Ken 2026-08-14: collapse the three domain groups here, like the
                SECTION_ORDER cards below. Health Trends keeps the open
                carousels — that screen exists to show these results. */}
            {canSelfAssessments && <SelfAssessmentTrends collapsible />}
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
        {/* ─── Pending retake, SCRUM-687 ────────────────────────────────────
            Vishal, 2026-08-15, on the retake work: "if patient go to plan page
            without clicking notification then there should be message to its
            time to take your assessment SO BOTH ARE DIFFERENT FEATURES".

            They are, and only one of them existed. The notification deep-link
            is one path; this is the other, and it is the one that catches the
            patient who never tapped the notification — dismissed it, missed
            it, or has notifications off entirely. That is most patients, so a
            retake feature reachable only from a notification reaches almost
            nobody.

            SAME CARD AS HOME, DELIBERATELY. A second differently-worded
            "time to reassess" surface would read as a second, separate
            request, and a patient who acts on one would still see the other
            sitting there unanswered. One component, one source of truth, one
            request — it disappears from both places when answered.

            Mounted ABOVE the AI summary because a request the care team is
            waiting on outranks a generated recap. It null-renders when there
            is nothing pending (silent-drop, same as Home), so the plan screen
            is unchanged for a patient with no outstanding assessment.

            iOS 26.5 envelope is satisfied by the card itself: View / Text /
            Pressable / StyleSheet / MaterialIcons, no Modal or Animated. Its
            "Not now" path opens a sheet SCREEN, not an overlay, for the same
            reason — see the card's header. Safe on this surface. */}
        <RetakeRequestInboxCard />

        {BPS_AI_SUMMARY_ENABLED && canAiSummary && (
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

        {/* SCRUM-659 Story 4 (2026-08-05) — Routines banner directly below
            the AI summary, styled to match the WellbeingMap card
            treatment. Mounted WITHOUT an extra padding wrapper so it
            inherits the parent ScrollView's horizontal padding — this
            makes it byte-width-matched to the WellbeingMap card + the
            BPS section cards below it.

            NAMING (Ken 2026-08-06): the section READS as "Routines" —
            structure like meals, washing, shopping, classes, which are
            not necessarily good behaviours — to tell it apart from plan
            Tasks, which ARE the positive behaviours we want to grow into
            habits. Everything below the display layer (component name
            HabitsBanner, route /Home/habits, `plan.habits[]`, flag
            `habits_in_plan_enabled`) intentionally keeps the "habits"
            wire name; do not "fix" the mismatch. All the copy lives in
            HabitsBanner.tsx — there are no habit/routine strings on this
            screen. */}
        {canDailyRoutines && (
        <HabitsBanner
          colors={colors as unknown as Record<string, string>}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        )}

        {/* Nutrition plan & support — Ken 2026-08-07 asked for this in the
            BIO part of the plan; Vishal 2026-08-10 placed it BETWEEN Routines
            and Medications and asked that it match them. It copies
            MedicationsBanner's card shape exactly (no horizontal margin, tint
            wash, 48pt icon well) with an amber accent so the three rows read
            as one system without nutrition looking like a meds sub-card. */}
        {canNutrition && (
        <NutritionPlanSection
          colors={{
            card: colors.card as string,
            border: colors.border as string,
            text: colors.text as string,
            subtext: colors.subtext as string,
            // Pass the THEME tint, exactly as HabitsBanner and
            // MedicationsBanner receive it. Both of those resolve
            // `colors?.tint ?? DEFAULT_TINT`, and the theme does define
            // `tint` — so their green/teal DEFAULT_TINT constants are dead
            // fallbacks that never fire here, and both siblings actually
            // render the theme tint. Passing anything else would make this
            // the odd row out, which is the opposite of matching them.
            tint: colors.tint as string,
          }}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          // Derived from the plan, so an already-added suggestion still reads
          // as added after an app restart — local state alone reset every
          // launch and invited duplicate tasks.
          existingTaskTitles={allTasks.map((t) => t.title)}
          // A nutrition task lands in the Biological section (category
          // 'nutrition' falls through sectionForCategory to 'biological'),
          // directly below this card. Refetch so it actually appears.
          onTaskAdded={(taskId) => {
            void revealAddedTask(taskId);
          }}
          onTakeScreener={() =>
            // Straight to the DSQ stepper, NOT the assessments catalog.
            // Vishal 2026-08-10: the catalog shows the plan-generation
            // assessment set, so sending people there to "take the dietary
            // screener" dropped them on a list of unrelated check-ins.
            // `dsq-nci` is a system instrument and GET /v1/instruments
            // returns the full active set for any non-basic tier, so the
            // stepper resolves it even though the AI selector never assigns
            // it (it is in no TIER_POOL). returnTo=plan brings them back
            // here to build the plan rather than to the catalog.
            router.push(
              '/Home/assessment-stepper?instrumentId=dsq-nci&returnTo=plan' as never,
            )
          }
        />
        )}

        {/*
          Ken 2026-08-05 — Medications banner sits directly beneath
          HabitsBanner as a sibling section entry. Replaces the small
          MedicationsLink pill previously in the tier row (removed
          from line ~1642 in the same commit). Same 48pt tinted icon
          + title + subtitle shape as HabitsBanner so both banners
          read as one system, colored green #199C4F to match the
          "Medical conditions & medications" report group. */}
        {canMedications && (
        <MedicationsBanner
          colors={colors as unknown as Record<string, string>}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
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
          SCRUM-658 (2026-07-31): TodaysMedicationsCard + MedicationsReviewPrompt
          moved off this BPS surface to the standalone /Home/medications
          route, reached via the new MedicationsLink pill in the header
          row above. User: "what is use of today's medication in plan
          screen? move it if its not required." The full meds editor
          (MedicationsSection) below is likewise removed and now lives
          on /Home/medications. Preserves ALL functionality (view /
          review-prompt / edit / add) — just relocates the surface so
          the Plan screen owns wellbeing + today, and the meds screen
          owns the full meds story.
        */}

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
        {/*
          SCRUM-658 (2026-07-31): MedicationsSection editor removed from
          this BPS surface — moved to /Home/medications reached via the
          new MedicationsLink pill. The medsSectionRef, medsSectionYRef,
          and openMedsAddSignal wiring in this component is now dead
          weight for the deep-link scrollTo behaviour, but is left in
          place because it also feeds the notifications-routing +
          MEDICATION_REFILL_REMINDER push handling that other surfaces
          consume. Removing the wiring would be a wider refactor —
          parked for a follow-up SCRUM once the standalone meds screen
          soaks.
        */}

        {/*
          SCRUM-660 (2026-07-31): duplicate COS-442 "Your Wellbeing map"
          card removed from this position. The wellbeing-map entry point
          now lives ONLY in the banner directly under the hero tile row
          above (moved there per user's placement request). Kept as a
          removed-code comment so a future decision to relocate can
          re-mount the same card shape without archeology.
        */}

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

        {/*
          CHUNK 60 (2026-07-22): plan-focus banner. Renders NULL when
          BPS_PLAN_FOCUS_SIGNAL_ENABLED is false OR when the wellbeing
          formula couldn't identify a focus domain (all domains flat,
          all elevating together, insufficient signal). Tap → scrolls
          to the matching SectionCard via sectionYByKey. Reuses the
          same derivation the wellbeing card is rendering from —
          single deriveWellbeing() pass, single source of truth.
          Genuinely null-when-absent affordance: no wrapper, no
          reserved height (unlike chunks 47/48 fixed placeholders,
          because there's nothing to WAIT FOR here — focus is either
          computed or absent, not delayed).
        */}
        <BpsPlanFocusBanner
          enabled={BPS_PLAN_FOCUS_SIGNAL_ENABLED}
          focus={focusDomain}
          onPress={scrollToSection}
          colors={colors as unknown as Record<string, string>}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Three section cards */}
        {SECTION_ORDER.filter(({ key }) =>
          key === 'biological'
            ? canBioSection
            : key === 'psychological'
              ? canPsychologicalSection
              : canSocialSection,
        ).map(({ key, title }) => (
          // CHUNK 60: wrap SectionCard in an outer <View onLayout> so
          // the banner's tap handler knows where to scroll. onLayout
          // fires against the wrapper (whose parent is the ScrollView
          // content) — sets sectionYByKey without triggering a re-render
          // (ref write, no state). Deliberately NOT attaching onLayout
          // to SectionCard itself so the section's render tree isn't
          // re-invalidated on layout events.
          <View
            key={key}
            onLayout={(e) => {
              sectionYByKey.current.set(key, e.nativeEvent.layout.y);
            }}
          >
            <SectionCard
              sectionKey={key}
              title={title}
              section={plan.sections[key]}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              // CHUNK 60: mark this card as the focus target when the
              // hoisted focus domain maps to it. When the flag is off,
              // focusSectionKey is undefined and this evaluates false
              // on every card — pill compiles out everywhere in one line.
              isFocus={focusSectionKey === key}
              // Only the section the task landed in reacts, so adding a
              // nutrition task never expands Psychological or Social.
              openTasksSignal={key === 'biological' ? openTasksSignal : undefined}
              highlightTaskId={key === 'biological' ? highlightTaskId : null}
              onHighlightRef={(node) => {
                if (key === 'biological') highlightNodeRef.current = node;
              }}
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

          </View>
        ))}

        {/* Another device's regeneration in flight.
            SCRUM-651 (2026-07-30): TWO banner variants now share this slot,
            selected by `isPast5MinBannerSwap`.
              - ≤5min elapsed: the pre-651 active "generation in progress
                (started Xs ago) — pull down to refresh" copy. Ticks live
                via `regenStatus.elapsedSec` (was a static snapshot pre-651
                per COS-421).
              - >5min elapsed: passive "Still working on your plan — we'll
                notify you when it's ready." No live counter — the copy
                itself acknowledges the extended timeline, so counting
                would just add noise. */}
        {showOtherDeviceGenerating && (
          <View
            style={[
              styles.generatingBanner,
              { backgroundColor: (colors.tint ?? '#0D9488') + '14', borderColor: (colors.tint ?? '#0D9488') + '33' },
            ]}
            accessibilityRole="text"
            accessibilityLabel={
              isPast5MinBannerSwap
                ? "Still working on your plan. We'll notify you when it's ready."
                : "A generation is already in progress on another device. Pull down to refresh once it's done."
            }
          >
            <MaterialIcons name="info-outline" size={16} color={colors.tint} />
            <Text style={[styles.generatingBannerText, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              {isPast5MinBannerSwap ? (
                <>Still working on your plan — we&apos;ll notify you when it&apos;s ready.</>
              ) : (
                <>
                  A generation is already in progress
                  {planQuery.data?.jobStartedAt
                    ? ` (started ${formatRegenerationElapsed(regenStatus.elapsedSec)})`
                    : ''}
                  . Pull down to refresh once it&apos;s done.
                </>
              )}
            </Text>
          </View>
        )}

        {/*
          SCRUM-662 (2026-07-31): "Refresh my plan" primary CTA + the
          companion "Cancel" secondary button both removed from the
          surface per user request ("regenerate plan and classic view
          is not required"). Server-side regenerate hooks
          (regenerateMutation, cancelMutation, onRegenerate, onCancel,
          regenerateDisabled, isGeneratingFromAnySource, showCancelButton)
          and the top-of-page "Refreshing your plan..." banner all
          remain wired but are now callee-less — they auto-fire from
          other surfaces (push notifications, cross-instance polls) and
          the surface still reflects state via the banner if regen
          starts from elsewhere. If a manual "Refresh" affordance is
          needed later, restore this Pressable — no state migration
          required.
        */}

        {/*
          "Share as PDF" — bottom action, in the slot SCRUM-662 freed when
          the Refresh / Classic-view buttons came off this surface. Mirrors
          ShareIntakeReportSection's mechanism exactly (expo-print →
          expo-sharing → RN Share text fallback); the HTML comes from the
          pure `plan-pdf-builder.ts`. Renders null until a plan exists, so
          the empty / skeleton branches above are unaffected.
        */}
        {canSharePdf && <SharePlanSection patientName={patientName} />}
            </>
          );
          if (BPS_HERO_LAYOUT_ENABLED) {
            return (
              <DetailsAccordion
                colors={colors as unknown as Record<string, string>}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                onLayoutHeader={(y) => {
                  detailsAccordionYRef.current = y;
                }}
              >
                {detailsBody}
              </DetailsAccordion>
            );
          }
          return detailsBody;
        })()}
        {/*
          ADR-0005 P0/P2 — bottom-anchored "Classic view" link. Self-gates
          on isTabSwapBpsEnabled() so it renders NULL on the legacy render
          path (flag OFF) and NULL on any other BPS entry when the flag is
          not set. Lives at the tail of the last ScrollView child so it
          scrolls with the plan content instead of floating over it — the
          shape Ken approved in Q1. Placed here (in the child component)
          rather than in the tab-swap parent so it appears on BOTH BPS
          entry points (tab-swap render + the peer
          /Home/biopsychosocial-plan route) without a duplicate mount.
        */}
        {/*
          SCRUM-662 (2026-07-31): ClassicViewLink removed per user
          request ("classic view is not required"). Users still have
          the tab-swap flag override at the SSM level if a rollback is
          ever needed; the in-page link was creating a UX exit hatch
          that we don't want to advertise now that BPS is the intended
          Plan surface.
        */}
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
  // SCRUM-661: compact 3-circle Venn slot on the wellbeing map card.
  // 90pt wide × 74pt tall — the three 44pt circles with the shipped
  // BIO / MIND / LIFE offsets scaled down to fit as a card affordance.
  // Palette mirrors WellbeingMapPreview so both surfaces read as one
  // system.
  mapVennWrap: {
    width: 90,
    height: 74,
    position: 'relative',
  },
  mapVennCircle: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
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
  // SCRUM-651: outlined secondary Cancel button — same footprint as
  // regenerateBtn (paddingVertical 14, radius Radii.md) but transparent
  // background + tint-colored border/label so the primary CTA stays
  // visually dominant. Sits directly under the primary row (marginTop
  // Spacing.xs) so tap targets don't crowd.
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    paddingVertical: 14,
    marginTop: Spacing.xs,
    gap: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  cancelBtnText: { fontWeight: '700' },
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
  // CHUNK 77 (2026-07-23): subtle top "Refreshing your plan..." banner
  // shown while a regen mutation is in flight. ~44pt tall (10+10 vertical
  // padding + ~18 line-height + border) matches the scope spec of
  // reserving ~44pt only when the banner is present. Rendered null when
  // idle so idle layout is unchanged from pre-chunk-77.
  regenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  // SCRUM-660 (2026-07-31): wellbeingMapBanner style removed — the
  // new horizontal banner uses styles.mapCard (defined further down)
  // which already carries the icon-chip + row treatment we want.
  regenBannerText: { flex: 1, lineHeight: 18, fontWeight: '600' },
  // CHUNK 86 (2026-07-23): collapsed state for the always-mounted regen
  // banner wrapper. Zeroes height, padding, margin, and border so idle
  // layout is bit-identical to pre-chunk-86 (when the wrapper unmounted
  // entirely). overflow:hidden guards against any stray descendant text
  // during the render frame where isRegenPending is transitioning.
  regenBannerHidden: {
    height: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
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
