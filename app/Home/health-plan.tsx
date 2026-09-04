import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
 Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AICitationsFooter } from '@/components/ai/ai-citations-footer';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  fetchAiHealthPlan,
  generateAiHealthPlan,
  fetchTasksForDate,
  completeTask,
  skipTask,
} from '@/services/api/ai-health-plan';
import type { AiHealthPlan, AiPlanGoal, TaskOccurrence, TaskType } from '@/services/api/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateWellbeingCaches } from '@/lib/invalidate-wellbeing';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { fetchPlanType, type PlanType } from '@/services/api/plan-type';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import { fetchAssessments } from '@/services/api/assessments';
import { fetchConnectedClinics } from '@/services/api/clinics';
import { useCanRender } from '@/hooks/use-entitlement';
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments';
// PlanTypeChooser Modal removed in COS-430 — the chooser is now a stack-
// pushed route at `app/Home/plan-type-chooser.tsx` to eliminate the
// nested-Modal collision iOS 26.5 crashed on.
import { AssessmentCatalogContent } from '@/components/health-plan/AssessmentCatalogContent';
import PlanStatusSection from '@/components/plan/PlanStatusSection';
import PlanFeaturesSection from '@/components/plan/PlanFeaturesSection';
import { ProgressTab } from '@/components/health-plan/ProgressTab';
import { MedicationsSection } from '@/components/health-plan/MedicationsSection';
import { MedicationsReviewPrompt } from '@/components/health-plan/MedicationsReviewPrompt';
import { withTimeout } from '@/lib/with-timeout';
import {
  NOTIFICATION_CATEGORIES_ENABLED,
  NOTIFICATION_CATEGORY_KEYS,
} from '@/lib/notification-categories';
import { useNotificationCategories } from '@/hooks/use-notification-categories';
import {
  CARE_PLAN_ENABLED,
  GOAL_PROGRESS_ENABLED,
  groupGoalsByCategory,
  formatGoalMeasure,
  formatGoalProgress,
  CARE_PLAN_V2_ENABLED,
  isPlanTaskTypeVisible,
  PLAN_REDESIGN_ENABLED,
  PLAN_REDESIGN_V2_ENABLED,
} from '@/lib/care-plan';
import { PlanScreenRedesigned } from '@/components/health-plan/PlanScreenRedesigned';
import { PlanScreenRedesignedV2 } from '@/components/health-plan/PlanScreenRedesignedV2';
import { BiopsychosocialPlanScreen } from '@/components/health-plan/BiopsychosocialPlanScreen';
import { TryUnifiedPlanBanner } from '@/components/unified-plan/TryUnifiedPlanBanner';
import { TryUnifiedViewLink } from '@/components/unified-plan/ClassicViewLink';
import { BioGoalEditorModal } from '@/components/health-plan/BioGoalEditorModal';
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag';
import { useBiopsychosocialPlan, useUpdateBioGoal } from '@/hooks/use-biopsychosocial-plan';
import { usePatientInfo } from '@/hooks/use-patient';
// ADR-0005 P0/P2 — tab-swap flag + welcome empty state. Both self-gate:
// `isTabSwapBpsEnabled()` returns false unless the build-time env
// `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED === 'true'`. When OFF, the entire
// tab-swap block below is skipped and the legacy render path runs
// byte-for-byte unchanged.
import { isTabSwapBpsEnabled } from '@/hooks/use-tab-swap-bps-flag';
import { BpsWelcomeEmptyState } from '@/components/plan/BpsWelcomeEmptyState';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import { knownSubdomains } from '@/lib/bps-subdomains';
import { useUpdatePlanGoal } from '@/hooks/use-health-plan';
import type { GoalPatch } from '@/services/api/ai-health-plan';
import { todayLocalIso } from '@/lib/day-key';
// One definition of today's adherence, shared with app/Home/today-schedule.tsx.
import { computeAdherence, minutesSinceMidnight } from '@/lib/today-timeline';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * COS-434 experiment #5: dark-launchable local flag around the hoisted bio
 * goal-editor Modal. `true` = ship default. If iOS 26.5 still crashes on
 * bio-branch mount, flip to `false` here + OTA to remove the Modal from
 * the render tree entirely. Bio screen still calls `onEditGoal` on tap;
 * the parent just no-ops. Cheap flip vs. a full refactor.
 */
const BIO_GOAL_EDITOR_MODAL_ENABLED = true;

/**
 * COS-434 experiment #2: pure helper used to derive first name from the
 * shared `patient` query — no hooks — so calling it from the parent
 * doesn't add a query observer.
 */
function firstNameFromPatient(
  patient: { name?: { given?: string[]; family?: string }[] } | undefined,
): string | null {
  const given = patient?.name?.[0]?.given?.[0];
  return given && given.trim() ? given.trim() : null;
}

// COS-362: hard ceiling on the initial full-screen loader so it can never hang
// forever (build 57 "stuck on Health Plan after unlock"). Generous on purpose —
// longer than a typical load, shorter than the 30s per-request axios timeout —
// so a genuinely-slow-but-working load still completes (a late resolve still
// populates the screen), while a wedged load bails to the recoverable empty
// state instead of spinning. Backstops the api-client refresh-queue fix.
const INITIAL_LOAD_TIMEOUT_MS = 20_000;

// Today's ISO date in the patient's local timezone
function todayISO(): string {
  return todayLocalIso();
}

// Format "HH:MM" -> "8:00 AM" / "6:30 PM"
function formatTime(hhmm: string): { time: string; meridiem: string } {
  const [hStr, m] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { time: `${display}:${m}`, meridiem };
}

/** User-friendly label for a plan type. Undefined → "Basic" so the pill
 *  never shows blank during the initial query load.
 *
 *  COS-360 / SCRUM-577 — 'agency-supported' renders as "Family Support"
 *  when ASSESSMENT_STRATEGY_V2_ENABLED is on; the fallback still returns
 *  "Agency Supported" so old builds and flag-off deploys are unchanged.
 *
 *  This function is called from render-time contexts that also read
 *  usePlanTypeDisplayName() at the component scope — we accept an
 *  optional resolver so it can be swapped in without threading the
 *  flag through every call site. When resolver is missing (during
 *  first paint or from utility contexts) we fall back to the legacy
 *  labels — same behavior as before COS-360.
 */
function planTypeLabel(
  t: PlanType | undefined,
  displayName?: (type: PlanType) => string,
): string {
  const type: PlanType = t ?? 'basic';
  if (displayName) return displayName(type);
  switch (type) {
    case 'advanced':         return 'Advanced';
    case 'agency-supported': return 'Agency Supported';
    case 'agency-managed':   return 'Agency Managed';
    case 'basic':
    default:                 return 'Basic';
  }
}

/** One-line description of what each plan type does. Powers the
 *  subhead on the prominent plan-type card (SCRUM-252 / SCRUM-268). */
function planTypeDescription(t: PlanType | undefined): string {
  switch (t) {
    case 'advanced':
      return 'AI-driven plan tailored to your health records.';
    case 'agency-supported':
      return 'AI-driven plan with extra functional + cognitive screens, supported by your care team.';
    case 'agency-managed':
      return 'Managed by your care agency with full intake and cognitive assessment.';
    case 'basic':
    default:
      return 'Self-managed with light AI-picked screeners.';
  }
}

const TASK_ICON: Record<TaskType, { name: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }> = {
  medication: { name: 'medication', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  exercise: { name: 'directions-walk', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  appointment: { name: 'local-hospital', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  reminder: { name: 'notifications', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
};

// COS-373: short labels for the read-only notification-categories glimpse.
const NOTIF_CATEGORY_LABELS: Record<(typeof NOTIFICATION_CATEGORY_KEYS)[number], string> = {
  appointments: 'Appointments',
  reminders: 'Reminders',
  medicationReminders: 'Medication reminders',
  medicationTask: 'Medication tasks',
  otherTask: 'Other tasks',
  nudges: 'Proactive nudges',   // SCRUM-641
  habits: 'Routine reminders',
  healthAlerts: 'Health alerts',  // SCRUM-659 (renamed #13)
};

const PRIORITY_STYLE: Record<'high' | 'medium' | 'low', { color: string; bg: string; label: string }> = {
  high: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', label: 'High' },
  medium: { color: '#D97706', bg: 'rgba(217,119,6,0.12)', label: 'Med' },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'Low' },
};

/*
 * COS-788 — this screen paints NO background of its own.
 *
 * Every container here is already inside <AppWrapper>, which fills the screen
 * with colors.background and then draws two large, very faint brand circles on
 * top of it. Anything below that which also sets backgroundColor is painting
 * the same colour a second time, except now ABOVE the circles — so the circles
 * were being clipped into hard rectangles wherever a card, a scroll container
 * or the loading spinner sat. The loader was the most obvious: a plain white
 * block with two quarter-circles sliced off.
 *
 * If you need a surface to stand out here, use a border or a translucent
 * overlay, not an opaque fill.
 */
export default function HealthPlanScreen() {
  const canViewScreen = useCanRender('health-plan.view');
  const canViewGoals = useCanRender('health-plan.view-goals');
  const canEditGoal = useCanRender('health-plan.edit-goal');
  const canRegeneratePlan = useCanRender('health-plan.regenerate-plan');
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const queryClient = useQueryClient();
  // COS-360 / SCRUM-577 — resolves 'agency-supported' → "Family Support"
  // when ASSESSMENT_STRATEGY_V2_ENABLED is on. Passed into planTypeLabel()
  // at each call site so the flag effect is consistent across the screen.
  const planTypeDisplayName = usePlanTypeDisplayName();

  // COS-360 / SCRUM-518 Phase 3: called unconditionally (rules-of-hooks safe
  // even though the underlying flags query resolves async and this value can
  // flip mid-lifecycle) — every hook below still runs every render regardless
  // of this value. We only branch on JSX, after all hooks have run (see the
  // early return right before "── Render" below).
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag();
  // COS-412: also called unconditionally, same rules-of-hooks reasoning as
  // above. Drives the opt-in routing gate below — the bio screen renders
  // ONLY once a biopsychosocial plan record actually exists (flag on alone
  // is not enough), so existing users on a legacy plan (e.g. Ken) are never
  // force-migrated. They opt in via PlanTypeChooser's tier-change trigger or
  // the "Try our new 3-section plan" CTA on the legacy screen — both call
  // regenerateBiopsychosocialPlan(), which is what makes this query start
  // returning a non-null plan.
  const biopsychosocialPlanQuery = useBiopsychosocialPlan();

  /*
   * COS-434 experiment #2: patient query hoisted from BiopsychosocialPlanScreen.
   * Runs on EVERY HealthPlanScreen render, warmed long before the bio/legacy
   * branch decision. When bio branch fires, the child receives just the
   * first-name string as a prop — zero new query observers on bio mount.
   */
  const patientQuery = usePatientInfo();
  const bioPatientName = firstNameFromPatient(patientQuery.data);

  const [plan, setPlan] = useState<AiHealthPlan | null>(null);
  const [tasks, setTasks] = useState<TaskOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Health Plan v2: Plan / Progress tabs + plan-type chooser
  const [activeTab, setActiveTab] = useState<'plan' | 'progress'>('plan');
  /**
   * COS-430: `showChooser` state is gone — opening the plan-type chooser
   * now pushes the `/Home/plan-type-chooser` route rather than flipping a
   * Modal visibility. `openPlanTypeChooser` is a helper so every call site
   * reads the same.
   */
  const openPlanTypeChooser = useCallback(() => {
    router.push('/Home/plan-type-chooser' as never);
  }, []);

  /*
   * COS-803 — the plan chooser that used to live here has moved to the Plan+
   * tab (app/Home/care-plan-plus.tsx).
   *
   * COS-801 put it in front of THIS screen, which meant the one tab every
   * patient already relies on changed shape while the entitlement work was
   * still being figured out. Keeping the classic Care Plan tab identical to
   * production, and building the new behaviour on a tab beside it, means the
   * two can be compared directly and nothing in progress can break the one
   * that works.
   */

  // COS-377: goal editor state (only active when CARE_PLAN_ENABLED)
  const [editGoal, setEditGoal] = useState<AiPlanGoal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editMetric, setEditMetric] = useState('');
  const [editBaseline, setEditBaseline] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editTimeframe, setEditTimeframe] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'achieved' | 'paused' | 'cancelled'>('active');
  const updateGoalMutation = useUpdatePlanGoal();

  const openGoalEditor = useCallback((g: AiPlanGoal) => {
    setEditGoal(g);
    setEditTitle(g.title);
    setEditDesc(g.description ?? '');
    setEditMetric(g.metric ?? '');
    setEditBaseline(g.baseline ?? '');
    setEditTarget(g.target ?? '');
    setEditTimeframe(g.timeframe ?? '');
    setEditStatus(g.status ?? 'active');
  }, []);

  const closeGoalEditor = useCallback(() => {
    setEditGoal(null);
  }, []);

  const saveGoalEdit = useCallback(async () => {
    if (!editGoal) return;
    const patch: GoalPatch = {};
    if (editTitle !== editGoal.title) patch.title = editTitle;
    if (editDesc !== (editGoal.description ?? '')) patch.description = editDesc;
    if (editMetric !== (editGoal.metric ?? '')) patch.metric = editMetric;
    if (editBaseline !== (editGoal.baseline ?? '')) patch.baseline = editBaseline;
    if (editTarget !== (editGoal.target ?? '')) patch.target = editTarget;
    if (editTimeframe !== (editGoal.timeframe ?? '')) patch.timeframe = editTimeframe;
    if (editStatus !== (editGoal.status ?? 'active')) patch.status = editStatus;
    try {
      const updatedPlan = await updateGoalMutation.mutateAsync({ goalId: editGoal.id, patch });
      setPlan(updatedPlan);
      closeGoalEditor();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  }, [editGoal, editTitle, editDesc, editMetric, editBaseline, editTarget, editTimeframe, editStatus, updateGoalMutation, closeGoalEditor]);

  /*
   * ── COS-433: biopsychosocial goal editor state + mutation, HOISTED into
   * this parent from BiopsychosocialPlanScreen. Mirrors legacy's ownership
   * pattern (state + Modal + mutation all here, on a long-resident parent
   * that predates the bio/legacy branch decision). The child screen just
   * fires `openBioGoalEditor(g)` on tap. See project_ios26_biopsychosocial_
   * parked.md — this is the iOS 26.5 EXUpdates crash experiment.
   *
   * These hooks run on EVERY HealthPlanScreen render regardless of branch,
   * so the state `bioEditGoal === null` is resident well before any bio
   * screen ever mounts. When the flag flips on and bio renders, the Modal
   * (a sibling of the bio screen, not a descendant) mounts with initial
   * state that has been alive for a long time.
   */
  const [bioEditGoal, setBioEditGoal] = useState<MeasurableGoal | null>(null);
  const [bioEditTitle, setBioEditTitle] = useState('');
  const [bioEditDesc, setBioEditDesc] = useState('');
  const [bioEditTarget, setBioEditTarget] = useState('');
  const [bioEditTimeframe, setBioEditTimeframe] = useState('');
  const [bioEditSubdomains, setBioEditSubdomains] = useState<string[]>([]);
  const updateBioGoalMutation = useUpdateBioGoal();

  const openBioGoalEditor = useCallback((g: MeasurableGoal) => {
    setBioEditGoal(g);
    setBioEditTitle(g.title);
    setBioEditDesc(g.description ?? '');
    setBioEditTarget(g.target ?? '');
    setBioEditTimeframe(g.timeframe ?? '');
    setBioEditSubdomains(knownSubdomains(g.subdomains));
  }, []);

  const closeBioGoalEditor = useCallback(() => {
    setBioEditGoal(null);
  }, []);

  const toggleBioSubdomain = useCallback((key: string) => {
    setBioEditSubdomains((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const saveBioGoalEdit = useCallback(async () => {
    if (!bioEditGoal) return;
    const patch: GoalPatch = {};
    if (bioEditTitle !== bioEditGoal.title) patch.title = bioEditTitle;
    if (bioEditDesc !== (bioEditGoal.description ?? '')) patch.description = bioEditDesc;
    if (bioEditTarget !== (bioEditGoal.target ?? '')) patch.target = bioEditTarget;
    if (bioEditTimeframe !== (bioEditGoal.timeframe ?? '')) patch.timeframe = bioEditTimeframe;
    const currentSubs = knownSubdomains(bioEditGoal.subdomains);
    if (
      currentSubs.length !== bioEditSubdomains.length ||
      currentSubs.some((k, i) => k !== bioEditSubdomains[i])
    ) {
      patch.subdomains = bioEditSubdomains;
    }
    try {
      await updateBioGoalMutation.mutateAsync({ goalId: bioEditGoal.id, patch });
      closeBioGoalEditor();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  }, [
    bioEditGoal,
    bioEditTitle,
    bioEditDesc,
    bioEditTarget,
    bioEditTimeframe,
    bioEditSubdomains,
    updateBioGoalMutation,
    closeBioGoalEditor,
  ]);

  // COS-357: "Review your medications" prompt → scroll to the meds section and
  // open its add flow. We track the section's Y offset inside the Plan
  // ScrollView and a monotonic signal that tells the section to open Add.
  const planScrollRef = React.useRef<ScrollView | null>(null);
  const medsSectionYRef = React.useRef<number | null>(null);
  const [openMedsAddSignal, setOpenMedsAddSignal] = useState(0);

  const onReviewMedications = useCallback(() => {
    setActiveTab('plan');
    const y = medsSectionYRef.current;
    if (y != null && planScrollRef.current) {
      planScrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
    // Open the section's add/confirm flow so the patient can act immediately.
    setOpenMedsAddSignal((n) => n + 1);
  }, []);

  // COS-361 (Bug #9): deep-link from a MEDICATION_REFILL_REMINDER push.
  // The notification routes to /Home/health-plan?focus=medications; when
  // that param is present we focus the medications section (same as the
  // in-app "Review medications" prompt). Fire once per arrival — guarded
  // by a ref so a remount with the param still set doesn't re-trigger.
  // The param is optional and additive: a tap without it behaves exactly
  // as before (back-compatible).
  const { focus } = useLocalSearchParams<{ focus?: string; classic?: string }>();
  // COS-469 / Phase 4 — `classic` param is the stable bypass hook when the
  // default-flip is on and the user came in via ClassicViewLink. Read into
  // the search-params types here but take no action today; documented so
  // any future auto-forward-to-unified redirect has an escape.
  const focusHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (focus !== 'medications') return;
    if (focusHandledRef.current) return;
    focusHandledRef.current = true;
    // Defer one tick so the Plan ScrollView + meds section have laid out
    // and medsSectionYRef is populated before we scroll to it.
    const t = setTimeout(() => onReviewMedications(), 350);
    return () => clearTimeout(t);
  }, [focus, onReviewMedications]);

  const planTypeQuery = useQuery({
    queryKey: ['plan-type'],
    queryFn: fetchPlanType,
    staleTime: 5 * 60 * 1000,
  });
  const currentPlanType: PlanType | undefined = planTypeQuery.data;

  // Banner safety net: a user on Advanced/Agency who never finished the
  // intake assessment lands here with no responses. The AI plan can't
  // personalize without that data — surface a Resume CTA.
  // SCRUM-268: any non-basic tier (advanced / agency-supported / agency-managed)
  // needs assessment context to personalize the AI plan.
  const isNonBasicPlan =
    currentPlanType === 'advanced' ||
    currentPlanType === 'agency-supported' ||
    currentPlanType === 'agency-managed';

  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    enabled: isNonBasicPlan,
    staleTime: 60 * 1000,
  });
  // SCRUM-254: backend-driven progress against the per-plan-type
  // assigned set. Drives the "X of Y assessments" copy, the empty
  // state copy, and the Generate Plan gate.
  const assignmentsQuery = useHealthPlanAssignments();
  const assignments = assignmentsQuery.data;
  const assignedCount = assignments?.assignedInstrumentIds.length ?? 0;
  const completedAssignedCount = assignments
    ? assignments.assignedInstrumentIds.length - assignments.remainingInstrumentIds.length
    : 0;
  const canGeneratePlan = assignments?.canGenerate ?? (currentPlanType === 'basic');

  // COS-745 — drives the no-plan-yet copy. Without records there is nothing to
  // build a plan FROM, so "we're building it" would be a lie and the patient
  // would wait forever; with records, generation really is already running.
  const connectedClinicsQuery = useQuery({
    queryKey: ['connected-clinics-count'],
    queryFn: fetchConnectedClinics,
    staleTime: 5 * 60 * 1000,
  });
  // Unknown counts as connected: the alternative shows "connect a clinic" to
  // someone who already has one, which reads as the app losing their data.
  const hasConnectedRecords =
    connectedClinicsQuery.data === undefined || connectedClinicsQuery.data.length > 0;

  // SCRUM-535 / COS-397: the reload icon gates on the backend `canGenerate`
  // (SCRUM-526). When it can't generate yet, the user is routed to check-ins;
  // after they complete all of them the assignments query is invalidated from
  // the stepper, but invalidation only refetches an *active* observer. This
  // screen is unmounted/backgrounded during that flow, so on return the stale
  // canGenerate=false snapshot is re-served and the reload + "Personalize your
  // plan" banner stay blocked. Refetch the gate inputs on focus so they reflect
  // the live backend truth the moment the user comes back.
  const refetchAssignments = assignmentsQuery.refetch;
  const refetchAssessments = assessmentsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchAssignments();
      void refetchAssessments();
    }, [refetchAssignments, refetchAssessments]),
  );

  const needsAssessment =
    isNonBasicPlan &&
    !assessmentsQuery.isLoading &&
    !canGeneratePlan;

  // Surface the chooser on first visit (no record on disk → "first-visit"
  // is signaled by the chooser session flag below). We mark it shown
  // exactly once per app launch so users aren't re-prompted by remounts.
  const promptedRef = React.useRef(false);
  React.useEffect(() => {
    if (promptedRef.current) return;
    if (planTypeQuery.isLoading) return;
    if (planTypeQuery.data === undefined) return;
    // Heuristic: backend defaults to 'basic' for users with no stored
    // choice. We can't distinguish "user explicitly picked basic" from
    // "user never chose" purely from the response. So we only auto-prompt
    // when the React Query first lands with a value AND the local
    // already-prompted flag in AsyncStorage is unset. The hook layer
    // would be cleaner, but inlining keeps the diff focused.
    promptedRef.current = true;
    void (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const KEY = 'health-plan.chooser.acknowledged';
        const acked = await AsyncStorage.getItem(KEY);
        if (!acked) {
          openPlanTypeChooser();
          await AsyncStorage.setItem(KEY, '1');
        }
      } catch {
        /* ignore — failing to prompt is preferable to crashing the screen */
      }
    })();
  }, [planTypeQuery.isLoading, planTypeQuery.data]);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([fetchAiHealthPlan(), fetchTasksForDate(todayISO())]);
    setPlan(p);
    setTasks(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // COS-362: bound the load so the spinner can never hang forever. On
        // timeout/error we fall through to the !plan empty state (which has
        // pull-to-refresh + Generate) rather than spinning indefinitely. If
        // load() is merely slow it keeps running and its setPlan/setTasks
        // still populate the screen when it later resolves.
        await withTimeout(load(), INITIAL_LOAD_TIMEOUT_MS, 'health-plan initial load timed out');
      } catch (err) {
        if (__DEV__) {
          console.warn('[health-plan] initial load failed/timeout:', (err as Error)?.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onGenerate = useCallback(async (force = false) => {
    setGenerating(true);
    try {
      const fresh = await generateAiHealthPlan(force);
      if (fresh) {
        setPlan(fresh);
        const t = await fetchTasksForDate(todayISO());
        setTasks(t);
      }
    } catch (err) {
      // SCRUM-228: advanced/agency users without assessments can't
      // generate a plan — route them to the catalog so they can take
      // their check-ins first.
      const code = (err as { code?: string }).code;
      if (code === 'AI_AWAITING_ASSESSMENTS') {
        router.push('/Home/assessments-catalog?source=plan-upgrade' as never);
      }
    } finally {
      setGenerating(false);
    }
  }, []);

  const toggleTask = useCallback(
    async (task: TaskOccurrence) => {
      if (task.status === 'completed') return; // tap again on detail sheet to un-complete (future)
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor
            ? { ...t, status: 'completed', completedAt: new Date().toISOString() }
            : t,
        ),
      );
      const result = await completeTask(task.id, task.scheduledFor);
      if (!result.ok) {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id && t.scheduledFor === task.scheduledFor
              ? { ...t, status: 'pending', completedAt: undefined }
              : t,
          ),
        );
        return;
      }
      // Ken 2026-08-06 iter 3 — adherence sub-score changed. Refresh
      // the wellbeing tile + detail screen so the composite reflects
      // the new completion without waiting for React Query staleTime.
      invalidateWellbeingCaches(queryClient);
    },
    [queryClient],
  );

  const onSkip = useCallback(
    async (task: TaskOccurrence) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor
            ? { ...t, status: 'skipped' }
            : t,
        ),
      );
      const result = await skipTask(task.id, task.scheduledFor);
      if (!result.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id && t.scheduledFor === task.scheduledFor
              ? { ...t, status: 'pending' }
              : t,
          ),
        );
        return;
      }
      invalidateWellbeingCaches(queryClient);
    },
    [queryClient],
  );

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length;

  /**
   * Ken 2026-08-13, of this hero beside the schedule screen: "Does not match
   * with patient page."
   *
   * It did not, and the reason was two definitions of the same number. This
   * screen divided by EVERY task in the day; the schedule screen divides by
   * the tasks DUE so far (lib/today-timeline.ts, computeAdherence). At 9am
   * with two of six tasks done and only two yet due, one surface said 33% and
   * the other 100%. Both were internally reasonable and the pair was
   * indefensible.
   *
   * There is now one rule, and it lives in one place. The due-so-far rule wins
   * because it is the one that survives contact with a day in progress — a
   * whole-day denominator greets the patient with 12% every morning and reads
   * as failure for most of the day. See computeAdherence for the full argument.
   *
   * The plan tasks are adapted to the timeline shape rather than the rule
   * being reimplemented here; a second copy is how the screens drifted apart
   * in the first place.
   */
  const adherence = React.useMemo(
    () =>
      computeAdherence(
        tasks.map((t) => ({
          id: t.id,
          kind: 'task' as const,
          title: t.title,
          time: t.scheduledTime ?? null,
          done: t.status === 'completed',
        })),
        minutesSinceMidnight(new Date()),
      ),
    [tasks],
  );
  const progressPct = adherence.percent / 100;

  // COS-373: read-only "what you'll be notified about" glimpse on the plan
  // surface. The hook always runs (defensive), but the card only renders when
  // the client kill-switch is on AND the server reports the feature enabled.
  const notifCategoriesQuery = useNotificationCategories();
  const showNotifPreview =
    NOTIFICATION_CATEGORIES_ENABLED && notifCategoriesQuery.data?.flagEnabled === true;
  const notifPrefs = notifCategoriesQuery.data?.preferences;

  // Plan-level breakdown (all tasks in the plan, not just today)
  const planTaskCounts = plan
    ? {
        medication: plan.tasks.filter((t) => t.type === 'medication').length,
        exercise: plan.tasks.filter((t) => t.type === 'exercise').length,
        appointment: plan.tasks.filter((t) => t.type === 'appointment').length,
        reminder: plan.tasks.filter((t) => t.type === 'reminder').length,
      }
    : { medication: 0, exercise: 0, appointment: 0, reminder: 0 };

  // Group all tasks by type for the Full Plan section.
  // Sort within each group by scheduledTime so per-dose tasks show in order.
  const tasksByType = plan
    ? (['medication', 'exercise', 'appointment', 'reminder'] as TaskType[]).map((t) => ({
        type: t,
        tasks: plan.tasks
          .filter((pt) => pt.type === t)
          .slice()
          .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
      }))
    : [];

  // COS-360 / SCRUM-518 Phase 3: flag ON renders the biopsychosocial (3-
  // section) Care Plan rebuild instead of everything below. Flag OFF
  // (default) falls straight through — byte-for-byte today's behavior.
  //
  // COS-411: this used to be a bare `return <BiopsychosocialPlanScreen />`,
  // which short-circuited BEFORE the PlanTypeChooser modal (below, ~line
  // 604) ever mounted — so new users landed straight on the bio screen with
  // no way to pick a tier, and existing users had no in-screen switcher.
  // The auto-prompt effect above (~line 318) still fires regardless (it
  // runs before this early return, unaffected by which branch renders), so
  // wrapping here is enough to restore the chooser for both first-visit and
  // manual "change plan" flows. `currentPlanType` / `onChangePlanType` are
  // threaded into the screen as props so it can render its own tier pill
  // (SCRUM-518 Phase 3 UI) without needing to own the chooser's open state.
  //
  // COS-412: flag-on alone used to force EVERY flagged user onto the bio
  // screen, including existing users already settled on a legacy plan
  // (Ken's case — "until Ken changes plan or requests to go through this
  // option this should not be forced on patients"). The gate now also
  // requires an actual biopsychosocial plan RECORD to exist. No record yet
  // → fall through to the legacy screen below, which surfaces the opt-in
  // "Try our new 3-section plan" CTA (PlanScreenRedesignedV2) so the user
  // can choose to migrate themselves. A record gets created by either that
  // CTA or a plan-type change in PlanTypeChooser (both call
  // regenerateBiopsychosocialPlan()) — once it exists, this query
  // invalidates/refetches and the user is routed here automatically.
  /*
   * COS-438: bio plan is now a PEER of the legacy plan, not a replacement.
   * Removed the `if (hasBiopsychosocialPlan) return <bio + modal>` short-
   * circuit that used to hide legacy whenever a bio record existed.
   * Legacy always renders on this tab; users push to `/Home/biopsychosocial-
   * plan` via the "View your biopsychosocial insights" link on the legacy
   * plan when they want the deeper view. Kenneth's 2026-07-10 feedback:
   * "biopsychosicial plan should be an extension so we can give patients
   * more refined services."
   *
   * Bio Modal state + mutation + BioGoalEditorModal render moved to
   * `app/Home/biopsychosocial-plan.tsx` where they belong to that route
   * as a long-resident parent. All the `bioEdit*` state below is now
   * dead code that's cheap to leave in place; it will get cleaned up in
   * a follow-up commit — for now the key change is the routing behavior.
   */

  // ── Render ────────────────────────────────────────────────────────────
  //
  // ADR-0005 P0/P2 — tab-swap early branch.
  //
  // When `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED === 'true'`, the Care Plan tab
  // becomes the mount point for the BPS surface (the classic Plan tab is
  // temp-retired behind the ClassicViewLink escape hatch rendered at the
  // bottom of BiopsychosocialPlanScreen's scroll — see that component).
  //
  // Rules-of-hooks: every hook in this function has already been called by
  // this line. The branch below is a pure JSX gate — an early return only.
  // Flag OFF (default) falls straight through to the legacy branch below,
  // byte-for-byte identical to pre-ADR-0005 behavior (backward-compat
  // discipline per feedback_backward_compatibility.md).
  //
  // Three sub-branches, mirroring BiopsychosocialPlanScreen's own gating
  // vocabulary (loading / empty / loaded) but resolved by the parent so
  // BPS never mounts against an unknown-plan state:
  //
  //   - bio query in flight  → generic spinner (same envelope as legacy
  //                            loading below).
  //   - no bio plan record   → BpsWelcomeEmptyState (self-contained CTA
  //                            reusing TryNewPlanCta's regen wiring). Once
  //                            regen lands, `useBiopsychosocialPlan`
  //                            invalidates, this branch re-resolves to the
  //                            loaded path, and the empty state unmounts.
  //   - bio plan present     → BiopsychosocialPlanScreen with the same
  //                            props the /Home/biopsychosocial-plan route
  //                            passes today (currentPlanType, chooser
  //                            handler, edit-goal callback, patient name).
  //                            Under BPS_MODAL_CONSOLIDATION_ENABLED the
  //                            child owns the goal-editor Modal, so the
  //                            hoisted `openBioGoalEditor` sets dead state
  //                            here — same shape as
  //                            /Home/biopsychosocial-plan.
  //
  // Rollback: unset the env (or set it to anything other than `"true"`)
  // and OTA. 30-second revert per feedback_dark_launch_via_ssm_before_code.
  if (isTabSwapBpsEnabled()) {
    const hasBioPlan = biopsychosocialPlanQuery.data?.plan != null;
    const bioLoading = biopsychosocialPlanQuery.isLoading;
    if (bioLoading) {
      return (
        <AppWrapper>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Loading your plan…
            </Text>
          </View>
        </AppWrapper>
      );
    }
    if (!hasBioPlan) {
      return (
        <AppWrapper>
          <BpsWelcomeEmptyState />
        </AppWrapper>
      );
    }
    return (
      <BiopsychosocialPlanScreen
        currentPlanType={currentPlanType}
        onChangePlanType={openPlanTypeChooser}
        onEditGoal={openBioGoalEditor}
        patientName={bioPatientName}
      />
    );
  }

  if (loading) {
    return (
      <AppWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Loading your plan…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  // Empty state — no plan yet. Three flavours:
  //   - basic                              → auto-gen via "Generate plan"
  //   - advanced/agency + no assessments   → render the catalog INLINE so
  //                                          users can start any check-in
  //                                          directly with no intermediate
  //                                          screen (SCRUM-230)
  //   - advanced/agency + has assessments  → auto-gen via "Generate plan"
  //     (will use those assessments as context)
  if (!plan) {
    const isNonBasic = isNonBasicPlan;
    // Non-basic users always land on the inline catalog when no plan
    // exists, even if they have past assessments. They can take new
    // check-ins or tap "Build my plan" once 2+ are complete. Showing
    // "Generate plan" here was misleading — the plan is always built
    // from check-in answers for non-basic users.
    const showInlineCatalog = isNonBasic;
    if (showInlineCatalog) {
      // SCRUM-254: copy now reflects the real per-plan-type assigned
      // set returned by /v1/patients/me/health-plan/assignments.
      // SCRUM-268: any agency tier is treated the same way as the
      // single 'agency' tier was.
      const isAgencyTier =
        currentPlanType === 'agency-supported' || currentPlanType === 'agency-managed';
      const isAgencyEmpty = isAgencyTier && assignedCount === 0;
      const headline = isAgencyEmpty
        ? 'Assessments coming'
        : assignedCount > 0
          ? 'Your check-ins'
          : 'Your check-ins';
      const subhead = isAgencyEmpty
        ? 'Your care team will assign assessments here. Check back later or message your agency.'
        : assignedCount > 0
          ? `Complete the ${assignedCount} assessment${assignedCount === 1 ? '' : 's'} ${isAgencyTier ? 'your care team assigned' : 'your AI plan selected'} for you. ${completedAssignedCount} of ${assignedCount} complete.`
          : 'Pick any to start. Complete the ones aligned to your plan to generate it.';
      return (
        <AppWrapper>
          <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
            <PlanStatusSection
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <View style={{ paddingTop: 12, paddingHorizontal: 16 }}>
              <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, textAlign: 'left', marginBottom: 4 }]}>
                {headline}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'left', marginBottom: 16, paddingHorizontal: 0 }]}>
                {subhead}
              </Text>
              {!isAgencyEmpty ? <AssessmentCatalogContent /> : null}
            </View>
          </ScrollView>
        </AppWrapper>
      );
    }
    return (
      <AppWrapper>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
          {/* COS-744 — one line if they have a plan, the chooser if they do
              not. COS-740 rendered the full shelf here unconditionally, so
              someone already on Advanced opened their care plan to a price
              list and had to scroll past it to reach today's tasks. */}
          <PlanStatusSection
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
          {/*
            COS-745 — the Generate button is gone. It was a MANUAL FALLBACK for
            something that already happens by itself: cos-webhook step 5 POSTs
            /v1/internal/health-plan/generate whenever records are ingested.

            What replaces it has to carry the risk of removing it — a patient
            with no plan and nothing to tap is a dead screen. PlanFeaturesSection
            leads with WHY there is no plan yet and, when the answer is "no
            records connected", the screen that fixes it.
          */}
          <PlanFeaturesSection
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            hasConnectedRecords={hasConnectedRecords}
          />
        </ScrollView>
      </AppWrapper>
    );
  }

  // Stats surfaced to the Progress tab — computed once from existing state
  const completedToday = tasks.filter((t) => t.status === 'completed').length;
  const totalToday = tasks.length;
  // Same number as the hero above and the schedule screen. This stat is
  // literally labelled "Adherence" in ProgressTab, so a third definition of it
  // was never defensible — see the `adherence` memo for the full note.
  const adherencePercent = adherence.percent;

  return (
    <AppWrapper>
      {/* CHUNK 61 (Ken 2026-07-22): TryUnifiedPlanBanner removed here too.
          Ken parked unified-plan v2 and asked the CTA to come down; both
          surfaces (this legacy screen + biopsychosocial-plan) no longer
          push v2. Import left in place for a fast revert if the decision
          reverses. */}
      {/* Tab bar */}
      {canViewScreen && (
      <View style={[v2Styles.tabBar, { borderBottomColor: colors.text + '20' }]}>
        {(['plan', 'progress'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                v2Styles.tabItem,
                active && { borderBottomColor: colors.tint as string },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={{
                  color: active ? (colors.tint as string) : colors.subtext,
                  fontWeight: getScaledFontWeight(active ? 700 : 500) as any,
                  fontSize: getScaledFontSize(15),
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}

      {canViewScreen && (activeTab === 'progress' ? (
        <ProgressTab
          streakDays={0 /* TODO: surface from /v1/.../analytics in a follow-up */}
          adherencePercent={adherencePercent}
          completedToday={completedToday}
          totalToday={totalToday}
        />
      ) : PLAN_REDESIGN_V2_ENABLED ? (
        /* COS-422: MakeMyTrip-inspired visual redesign. PRESENTATION-ONLY and a
           100% drop-in for PlanScreenRedesigned — IDENTICAL props/data flow
           (same plan, build/refresh + canGenerate gating, goal-edit flow via the
           shared modal below, goal progress, category grouping, medications
           sections, focus-refetch). Layers above v1: when V2 is OFF we fall
           through to PLAN_REDESIGN_ENABLED (v1) and then the legacy ScrollView. */
        <PlanScreenRedesignedV2
          plan={plan}
          colors={colors as unknown as Record<string, string>}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          currentPlanType={currentPlanType}
          onChangePlanType={() => openPlanTypeChooser()}
          refreshing={refreshing}
          onRefresh={onRefresh}
          generating={generating}
          canGeneratePlan={canGeneratePlan}
          onGenerate={onGenerate}
          openGoalEditor={openGoalEditor}
          needsAssessment={needsAssessment}
          onPersonalize={() =>
            router.push('/Home/assessments-catalog?source=plan-upgrade' as never)
          }
          onManageReminders={() => router.push('/Home/reminder-settings' as never)}
          planScrollRef={planScrollRef}
          onMedsSectionLayout={(e) => {
            medsSectionYRef.current = e.nativeEvent.layout.y;
          }}
          openMedsAddSignal={openMedsAddSignal}
          onReviewMedications={onReviewMedications}
        />
      ) : PLAN_REDESIGN_ENABLED ? (
        /* COS-402 / SCRUM-538: goals-first redesign. Presentation-only — reuses
           the same plan data, build/refresh + canGenerate gating, the goal-edit
           flow (the shared modal below), goal progress, category grouping, the
           medications sections, and the focus-refetch behavior. When the flag is
           OFF the original ScrollView below renders byte-for-byte as today. */
        <PlanScreenRedesigned
          plan={plan}
          colors={colors as unknown as Record<string, string>}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          currentPlanType={currentPlanType}
          onChangePlanType={() => openPlanTypeChooser()}
          refreshing={refreshing}
          onRefresh={onRefresh}
          generating={generating}
          canGeneratePlan={canGeneratePlan}
          onGenerate={onGenerate}
          openGoalEditor={openGoalEditor}
          needsAssessment={needsAssessment}
          onPersonalize={() =>
            router.push('/Home/assessments-catalog?source=plan-upgrade' as never)
          }
          onManageReminders={() => router.push('/Home/reminder-settings' as never)}
          planScrollRef={planScrollRef}
          onMedsSectionLayout={(e) => {
            medsSectionYRef.current = e.nativeEvent.layout.y;
          }}
          openMedsAddSignal={openMedsAddSignal}
          onReviewMedications={onReviewMedications}
        />
      ) : (
      <ScrollView
        ref={planScrollRef}
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
        {/* COS-744 — the plan label sits at the TOP here, consistent with the
            two empty states. COS-740 had to exile the price shelf to the
            bottom because it outranked the daily tasks; a one-line chip does
            not, and hiding it at the very bottom made it unfindable. */}
        <PlanStatusSection
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        {/* COS-357: soft, recurring "review your medications" prompt. Self-
            gates on the GET flagEnabled + medsReviewNeeded and the local
            snooze, so it renders nothing when off/snoozed/back-compat. Sits
            above the rest of the Plan content. */}
        <MedicationsReviewPrompt onReviewNow={onReviewMedications} />
        {needsAssessment ? (
          <Pressable
            onPress={() => router.push('/Home/assessments-catalog?source=plan-upgrade' as never)}
            accessibilityRole="button"
            accessibilityLabel="Complete your health check-in"
            style={[v2Styles.assessmentBanner, { backgroundColor: (colors.tint as string) + '14', borderColor: colors.tint as string }]}
          >
            <MaterialIcons name="assignment" size={getScaledFontSize(20)} color={colors.tint as string} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                Personalize your plan
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                Finish your health check-in so your AI plan reflects how you&apos;re actually doing.
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.tint as string} />
          </Pressable>
        ) : null}
        {/* Header */}
        <View style={styles.screenHead}>
          <View>
            <Text style={[styles.screenTitle, { color: colors.text, fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(800) as any }]}>
              Your Plan
            </Text>
            <View style={styles.metaRow}>
              <MaterialIcons name="auto-awesome" size={12} color={colors.subtext} />
              <Text style={[styles.metaText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                Updated {new Date(plan.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* COS-469 / Phase 4 — "Try unified view" mirror-image affordance.
                Self-gated on the default flag being ON, so pre-flip users see
                no dead affordance. */}
            <TryUnifiedViewLink color={colors.tint as string} size={getScaledFontSize(22)} />
            {canRegeneratePlan && (
            <TouchableOpacity
              style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}
              onPress={() => onGenerate(true)}
              disabled={generating || !canGeneratePlan}> {/* SCRUM-526: also gate when check-ins are incomplete */}
              {generating ? (
                <ActivityIndicator color={colors.tint} size="small" />
              ) : (
                <MaterialIcons name="refresh" size={18} color={colors.subtext} />
              )}
            </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Plan-type card — prominent so users can see and switch their
            plan at a glance, instead of buried as a tiny pill in the tab
            bar. SCRUM-252. */}
        <Pressable
          onPress={() => openPlanTypeChooser()}
          accessibilityRole="button"
          accessibilityLabel={`Plan type: ${planTypeLabel(currentPlanType, planTypeDisplayName)}. Tap to change.`}
          style={({ pressed }) => [
            styles.planTypeCard,
            {
              backgroundColor: (colors.tint as string) + '14',
              borderColor: (colors.tint as string) + '33',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.planTypeIcon, { backgroundColor: (colors.tint as string) + '26' }]}>
            <MaterialIcons
              name={
                currentPlanType === 'advanced'
                  ? 'auto-awesome'
                  : currentPlanType === 'agency-supported'
                    ? 'groups'
                    : currentPlanType === 'agency-managed'
                      ? 'medical-services'
                      : 'check-circle-outline'
              }
              size={getScaledFontSize(22)}
              color={colors.tint as string}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: colors.tint as string,
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(700) as any,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Current plan
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(17),
                fontWeight: getScaledFontWeight(800) as any,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {planTypeLabel(currentPlanType, planTypeDisplayName)}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {planTypeDescription(currentPlanType)}
            </Text>
          </View>
          <View style={[styles.planTypeChevron, { backgroundColor: (colors.tint as string) + '1A' }]}>
            <MaterialIcons name="swap-horiz" size={getScaledFontSize(18)} color={colors.tint as string} />
          </View>
        </Pressable>

        {/* Today hero card — replaces the older progress bar / report-stats
            split with a single big focal card. Combines the % done with
            a thick progress bar and the done / pending / skipped triplet.
            SCRUM-252. */}
        {tasks.length > 0 && (
          <View style={[styles.heroCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
            <View style={styles.heroTopRow}>
              <View>
                <Text style={[styles.heroLabel, { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
                  TODAY
                </Text>
                <Text style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(40),
                  fontWeight: getScaledFontWeight(800) as any,
                  letterSpacing: -0.5,
                  marginTop: 4,
                }}>
                  {Math.round(progressPct * 100)}%
                </Text>
                <Text style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(13),
                  marginTop: 2,
                }}>
                  {/* Reads against the SAME denominator as the percentage
                      above it. "100%" over "2 of 6 tasks done" was the
                      contradiction Ken could see without leaving the screen. */}
                  {adherence.due === 0
                    ? 'Nothing due yet'
                    : `${adherence.done} of ${adherence.due} due so far`}
                </Text>
              </View>
              <View style={[styles.heroBadge, { backgroundColor: progressPct === 1 ? '#16A34A18' : (colors.tint as string) + '18' }]}>
                <MaterialIcons
                  name={progressPct === 1 ? 'check-circle' : 'today'}
                  size={getScaledFontSize(28)}
                  color={progressPct === 1 ? '#16A34A' : (colors.tint as string)}
                />
              </View>
            </View>
            <View style={[styles.heroProgressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.heroProgressFill,
                  {
                    backgroundColor: progressPct === 1 ? '#16A34A' : (colors.tint as string),
                    width: `${Math.max(2, progressPct * 100)}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <View style={[styles.heroStatDot, { backgroundColor: '#16A34A' }]} />
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
                  {completedCount}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginLeft: 4 }}>done</Text>
              </View>
              <View style={styles.heroStat}>
                <View style={[styles.heroStatDot, { backgroundColor: colors.tint as string }]} />
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
                  {tasks.length - completedCount - skippedCount}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginLeft: 4 }}>to go</Text>
              </View>
              <View style={styles.heroStat}>
                <View style={[styles.heroStatDot, { backgroundColor: '#9CA3AF' }]} />
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
                  {skippedCount}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginLeft: 4 }}>skipped</Text>
              </View>
            </View>
          </View>
        )}

        {/* AI Summary banner — kept but de-emphasized below the hero */}
        <View style={[styles.aiBanner, { backgroundColor: colors.tint + '14', borderColor: colors.tint + '30' }]}>
          <View style={styles.aiBannerTop}>
            <MaterialIcons name="auto-awesome" size={16} color={colors.tint} />
            <Text style={[styles.aiBannerLabel, { color: colors.tint, fontSize: getScaledFontSize(11) }]}>AI SUMMARY</Text>
          </View>
          <Text style={[styles.aiBannerText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            {plan.summary}
          </Text>
          <AICitationsFooter compact />
        </View>

        {/* COS-373: read-only "Here's what you'll be notified about" glimpse.
            Lists each notification category and whether it's on/off, with a
            Manage link to the Reminders settings screen. No toggles here — it's
            a glimpse only. Gated by the client kill-switch + the server flag, so
            absent for back-compat / older builds. */}
        {showNotifPreview && notifPrefs ? (
          <View style={[styles.notifPreviewCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
            <View style={styles.notifPreviewHead}>
              <View style={styles.notifPreviewTitleWrap}>
                <MaterialIcons name="notifications-active" size={getScaledFontSize(16)} color={colors.tint as string} />
                <Text style={[styles.notifPreviewTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}>
                  Here&apos;s what you&apos;ll be notified about
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/Home/reminder-settings' as never)}
                accessibilityRole="button"
                accessibilityLabel="Manage notification settings"
                hitSlop={8}
              >
                <Text style={{ color: colors.tint as string, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
                  Manage
                </Text>
              </Pressable>
            </View>
            {NOTIFICATION_CATEGORY_KEYS.map((key) => {
              const on = notifPrefs[key];
              const label = NOTIF_CATEGORY_LABELS[key];
              return (
                <View key={key} style={styles.notifPreviewRow}>
                  <MaterialIcons
                    name={on ? 'check-circle' : 'cancel'}
                    size={getScaledFontSize(16)}
                    color={on ? '#16A34A' : colors.subtext}
                  />
                  <Text style={[styles.notifPreviewLabel, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
                    {label}
                  </Text>
                  <Text style={{ color: on ? '#16A34A' : colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }}>
                    {on ? 'On' : 'Off'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Medication Management (COS-357 / SCRUM-504). Self-gates on the
            GET response's flagEnabled: renders nothing when the flag is off
            (or the endpoint errors), so this is inert for back-compat and
            for older app builds. Shown for Basic AND Advanced plans. */}
        <MedicationsSection
          onLayout={(e) => {
            medsSectionYRef.current = e.nativeEvent.layout.y;
          }}
          openAddSignal={openMedsAddSignal}
        />

        {/* Plan overview — breakdown of all tasks in the plan */}
        <View style={[styles.planOverview, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <Text style={[styles.planOverviewTitle, { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
            COMPLETE PLAN OVERVIEW
          </Text>
          <View style={styles.planOverviewGrid}>
            <View style={styles.planOverviewItem}>
              <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.medication.bg }]}>
                <MaterialIcons name={TASK_ICON.medication.name} size={18} color={TASK_ICON.medication.color} />
              </View>
              <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                {planTaskCounts.medication}
              </Text>
              <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Medications</Text>
            </View>
            <View style={styles.planOverviewItem}>
              <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.exercise.bg }]}>
                <MaterialIcons name={TASK_ICON.exercise.name} size={18} color={TASK_ICON.exercise.color} />
              </View>
              <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                {planTaskCounts.exercise}
              </Text>
              <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Exercise</Text>
            </View>
            {isPlanTaskTypeVisible('appointment', CARE_PLAN_V2_ENABLED) && (
              <View style={styles.planOverviewItem}>
                <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.appointment.bg }]}>
                  <MaterialIcons name={TASK_ICON.appointment.name} size={18} color={TASK_ICON.appointment.color} />
                </View>
                <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                  {planTaskCounts.appointment}
                </Text>
                <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Visits</Text>
              </View>
            )}
            {isPlanTaskTypeVisible('reminder', CARE_PLAN_V2_ENABLED) && (
              <View style={styles.planOverviewItem}>
                <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.reminder.bg }]}>
                  <MaterialIcons name={TASK_ICON.reminder.name} size={18} color={TASK_ICON.reminder.color} />
                </View>
                <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                  {planTaskCounts.reminder}
                </Text>
                <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Reminders</Text>
              </View>
            )}
          </View>
        </View>

        {/* Goals — COS-377: flag-gated category-grouped editable view vs. original flat list */}
        {canViewGoals && plan.goals.length > 0 && (
          CARE_PLAN_ENABLED ? (
            /* NEW: category-grouped, editable — only when CARE_PLAN_ENABLED=true */
            <>
              {/* COS-401 / SCRUM-537: discoverability cue. Goal cards are editable
                  (title, description, target & metrics) but the affordance was
                  invisible — testers found it by accident. This one-liner + the
                  per-card pencil below signpost that goals are tappable to edit. */}
              {canEditGoal && (
              <View
                style={styles.goalEditHint}
                accessibilityRole="text"
                accessibilityLabel="Tap a goal to edit its target and metrics"
              >
                <MaterialIcons name="edit" size={13} color={colors.subtext} />
                <Text
                  style={[styles.goalEditHintText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
                >
                  Tap a goal to edit its target &amp; metrics
                </Text>
              </View>
              )}
              {groupGoalsByCategory(plan.goals).map((group) => (
                <View key={group.key}>
                  <View style={styles.secHead}>
                    <Text style={[styles.secLabel, { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }]}>
                      {group.label.toUpperCase()}
                    </Text>
                    <View style={[styles.countBadge, { backgroundColor: colors.tint + '18' }]}>
                      <Text style={[styles.countBadgeText, { color: colors.tint, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
                        {group.goals.length}
                      </Text>
                    </View>
                  </View>
                  {group.goals.map((g) => {
                    const pstyle = PRIORITY_STYLE[g.priority];
                    const measure = formatGoalMeasure(g);
                    return (
                      <TouchableOpacity
                        key={g.id}
                        onPress={() => openGoalEditor(g)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit goal: ${g.title}`}
                        accessibilityHint="Opens the goal editor to change its target and metrics"
                        style={[styles.goal, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}
                      >
                        <View style={[styles.goalIcon, { backgroundColor: pstyle.bg }]}>
                          <MaterialIcons name="flag" size={16} color={pstyle.color} />
                        </View>
                        <View style={styles.goalBody}>
                          <Text style={[styles.goalTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]} numberOfLines={2}>
                            {g.title}
                          </Text>
                          {!!g.description && (
                            <Text style={[styles.goalDesc, { color: colors.subtext, fontSize: getScaledFontSize(12) }]} numberOfLines={2}>
                              {g.description}
                            </Text>
                          )}
                          {!!measure && (
                            <Text style={[styles.goalDesc, { color: colors.tint, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }]} numberOfLines={1}>
                              {measure}
                            </Text>
                          )}
                          {/* COS-382: goal-progress row — flag-gated, inert when GOAL_PROGRESS_ENABLED=false */}
                          {GOAL_PROGRESS_ENABLED && g.progress && (() => {
                            const prog = formatGoalProgress(g);
                            if (!prog) return null;
                            const trendColor =
                              prog.trendSymbol === '↑' ? colors.tint
                              : prog.trendSymbol === '↓' ? (colors as any).error ?? '#E53E3E'
                              : colors.subtext;
                            return (
                              <View style={styles.progressRow}>
                                {prog.barFraction != null && (
                                  <View style={styles.progressTrack}>
                                    <View
                                      style={[
                                        styles.progressFill,
                                        {
                                          width: `${Math.min(1, Math.max(0, prog.barFraction)) * 100}%` as any,
                                          backgroundColor: colors.tint,
                                        },
                                      ]}
                                    />
                                  </View>
                                )}
                                {!!prog.trendSymbol && !!prog.line && (
                                  <Text style={[styles.goalDesc, { color: trendColor, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any }]} numberOfLines={1}>
                                    {prog.trendSymbol} {prog.line}
                                  </Text>
                                )}
                              </View>
                            );
                          })()}
                        </View>
                        <View style={styles.goalTrailing}>
                          <View style={[styles.priorityPill, { backgroundColor: pstyle.bg }]}>
                            <Text style={[styles.priorityText, { color: pstyle.color, fontSize: getScaledFontSize(10), fontWeight: getScaledFontWeight(700) as any }]}>
                              {pstyle.label}
                            </Text>
                          </View>
                          {/* COS-401 / SCRUM-537: visible per-card "Edit" affordance.
                              Decorative (the whole card is the button + is labeled),
                              so it's hidden from screen readers to avoid a double read. */}
                          {canEditGoal && (
                          <View style={styles.goalEditCue} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                            <MaterialIcons name="edit" size={12} color={colors.tint} />
                            <Text style={[styles.goalEditCueText, { color: colors.tint, fontSize: getScaledFontSize(10), fontWeight: getScaledFontWeight(600) as any }]}>
                              Edit
                            </Text>
                          </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </>
          ) : (
            /* ORIGINAL flat list — byte-for-byte unchanged when CARE_PLAN_ENABLED=false */
            <>
              <View style={styles.secHead}>
                <Text style={[styles.secLabel, { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }]}>
                  GOALS
                </Text>
                <View style={[styles.countBadge, { backgroundColor: colors.tint + '18' }]}>
                  <Text style={[styles.countBadgeText, { color: colors.tint, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
                    {plan.goals.length} Active
                  </Text>
                </View>
              </View>
              {plan.goals.map((g) => {
                const pstyle = PRIORITY_STYLE[g.priority];
                return (
                  <View key={g.id} style={[styles.goal, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
                    <View style={[styles.goalIcon, { backgroundColor: pstyle.bg }]}>
                      <MaterialIcons name="flag" size={16} color={pstyle.color} />
                    </View>
                    <View style={styles.goalBody}>
                      <Text style={[styles.goalTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]} numberOfLines={2}>
                        {g.title}
                      </Text>
                      {!!g.description && (
                        <Text style={[styles.goalDesc, { color: colors.subtext, fontSize: getScaledFontSize(12) }]} numberOfLines={2}>
                          {g.description}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.priorityPill, { backgroundColor: pstyle.bg }]}>
                      <Text style={[styles.priorityText, { color: pstyle.color, fontSize: getScaledFontSize(10), fontWeight: getScaledFontWeight(700) as any }]}>
                        {pstyle.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </>
          )
        )}

        {/* Today's task list is intentionally NOT rendered here — it lives on
            the Today's Schedule screen. Showing it twice was the stakeholder
            complaint (2026-05-18). The progress-bar card above still shows
            today's completion ratio at a glance. */}

        {/* Full plan — all tasks grouped by type */}
        {plan.tasks.length > 0 && (
          <>
            <View style={styles.secHead}>
              <Text style={[styles.secLabel, { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }]}>
                FULL PLAN
              </Text>
              <Text style={[styles.secProgress, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                {plan.tasks.length} tasks
              </Text>
            </View>
            {/* SCRUM-532 Phase A — when Care Plan v2 is on, reminders move off the
                plan into Notifications/Reminders settings; this row deep-links there.
                Not rendered when the flag is OFF (plan is byte-for-byte today's). */}
            {CARE_PLAN_V2_ENABLED && (
              <Pressable
                onPress={() => router.push('/Home/reminder-settings' as never)}
                accessibilityRole="button"
                accessibilityLabel="Manage reminders"
                style={[styles.fullPlanRow, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
                <View style={[styles.taskRail, { backgroundColor: TASK_ICON.reminder.color }]} />
                <View style={[styles.taskIcon, { backgroundColor: TASK_ICON.reminder.bg, marginLeft: 10 }]}>
                  <MaterialIcons name={TASK_ICON.reminder.name} size={getScaledFontSize(18)} color={TASK_ICON.reminder.color} />
                </View>
                <View style={styles.taskBody}>
                  <Text
                    style={[styles.taskTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}
                    numberOfLines={1}>
                    Manage reminders
                  </Text>
                  <Text
                    style={[styles.taskSub, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
                    numberOfLines={1}>
                    Notifications &amp; reminder settings
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.subtext as string} />
              </Pressable>
            )}
            {tasksByType
              .filter((g) => g.tasks.length > 0 && isPlanTaskTypeVisible(g.type, CARE_PLAN_V2_ENABLED))
              .map((group) => {
                const icon = TASK_ICON[group.type];
                const groupLabels: Record<TaskType, string> = {
                  medication: 'Medications',
                  exercise: 'Exercise',
                  appointment: 'Visits',
                  reminder: 'Reminders',
                };
                return (
                  <View key={group.type} style={styles.groupBlock}>
                    <View style={styles.groupHeaderRow}>
                      <View style={[styles.groupHeaderIcon, { backgroundColor: icon.bg }]}>
                        <MaterialIcons name={icon.name} size={getScaledFontSize(14)} color={icon.color} />
                      </View>
                      <Text style={[styles.groupHeader, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}>
                        {groupLabels[group.type]}
                      </Text>
                      <Text style={[styles.groupHeaderCount, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                        {group.tasks.length}
                      </Text>
                    </View>
                    {group.tasks.map((t) => {
                      const { time, meridiem } = formatTime(t.scheduledTime);
                      const recurLabel =
                        t.recurrence === 'daily'
                          ? 'Daily'
                          : t.recurrence === 'weekdays'
                            ? 'Weekdays'
                            : t.recurrence === 'weekly'
                              ? 'Weekly'
                              : 'Once';
                      return (
                        <View
                          key={t.id}
                          style={[styles.fullPlanRow, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
                          {/* Left color rail — color matches task type */}
                          <View style={[styles.taskRail, { backgroundColor: icon.color }]} />
                          <View style={[styles.taskIcon, { backgroundColor: icon.bg, marginLeft: 10 }]}>
                            <MaterialIcons name={icon.name} size={getScaledFontSize(18)} color={icon.color} />
                          </View>
                          <View style={styles.taskBody}>
                            <Text
                              style={[styles.taskTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}
                              numberOfLines={1}>
                              {t.title}
                            </Text>
                            <Text
                              style={[styles.taskSub, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
                              numberOfLines={1}>
                              {recurLabel}
                            </Text>
                          </View>
                          {/* Time block, right-aligned, gives the row a clear schedule cue */}
                          <View style={styles.taskTimeBlock}>
                            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                              {time}
                            </Text>
                            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), marginTop: 1, fontWeight: getScaledFontWeight(600) as any }}>
                              {meridiem}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
      ))}

      {/* COS-377: Goal editor modal — only rendered when CARE_PLAN_ENABLED=true and a goal is selected */}
      {CARE_PLAN_ENABLED && canEditGoal && (
        <Modal
          visible={editGoal !== null}
          animationType="slide"
          transparent
          onRequestClose={closeGoalEditor}
        >
          <View style={goalEditorStyles.overlay}>
            <View style={[goalEditorStyles.sheet, { backgroundColor: colors.card as string }]}>
              <View style={goalEditorStyles.header}>
                <Text style={[goalEditorStyles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }]}>
                  Edit Goal
                </Text>
                <TouchableOpacity onPress={closeGoalEditor} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={22} color={colors.subtext as string} />
                </TouchableOpacity>
              </View>

              <ScrollView style={goalEditorStyles.scrollArea} keyboardShouldPersistTaps="handled">
                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>TITLE</Text>
                <TextInput
                  style={[goalEditorStyles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  maxLength={120}
                  placeholder="Goal title"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>DESCRIPTION</Text>
                <TextInput
                  style={[goalEditorStyles.input, goalEditorStyles.multiline, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  maxLength={300}
                  multiline
                  numberOfLines={3}
                  placeholder="Description"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>METRIC</Text>
                <TextInput
                  style={[goalEditorStyles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editMetric}
                  onChangeText={setEditMetric}
                  maxLength={80}
                  placeholder="What is measured"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>BASELINE</Text>
                <TextInput
                  style={[goalEditorStyles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editBaseline}
                  onChangeText={setEditBaseline}
                  maxLength={40}
                  placeholder="Current value"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>TARGET</Text>
                <TextInput
                  style={[goalEditorStyles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  maxLength={40}
                  placeholder="Goal value"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>TIMEFRAME</Text>
                <TextInput
                  style={[goalEditorStyles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: (colors.background as string) }]}
                  value={editTimeframe}
                  onChangeText={setEditTimeframe}
                  maxLength={40}
                  placeholder="e.g. 3 months"
                  placeholderTextColor={colors.subtext as string}
                />

                <Text style={[goalEditorStyles.fieldLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(12) }]}>STATUS</Text>
                <View style={goalEditorStyles.statusRow}>
                  {(['active', 'achieved', 'paused', 'cancelled'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setEditStatus(s)}
                      style={[
                        goalEditorStyles.statusChip,
                        { borderColor: editStatus === s ? colors.tint as string : colors.border as string },
                        editStatus === s && { backgroundColor: colors.tint + '22' },
                      ]}
                    >
                      <Text style={[goalEditorStyles.statusChipText, { color: editStatus === s ? colors.tint as string : colors.subtext as string, fontSize: getScaledFontSize(12) }]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={saveGoalEdit}
                  disabled={updateGoalMutation.isPending}
                  style={[goalEditorStyles.saveBtn, { backgroundColor: colors.tint as string, opacity: updateGoalMutation.isPending ? 0.6 : 1 }]}
                >
                  <Text style={[goalEditorStyles.saveBtnText, { fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
                    {updateGoalMutation.isPending ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>

                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </AppWrapper>
  );
}

const v2Styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  planTypePill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  assessmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { marginTop: 4 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 500 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { textAlign: 'center', marginBottom: 8, letterSpacing: -0.4 },
  emptyBody: { textAlign: 'center', maxWidth: 280, lineHeight: 20, marginBottom: 24 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 100,
  },
  generateBtnText: { color: '#fff', fontWeight: '700' },

  // Header
  screenHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 16 },
  screenTitle: { letterSpacing: -0.8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: {},
  refreshBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Plan-type card (SCRUM-252) — leads the screen, highlights the current
  // plan, taps open the chooser.
  planTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  planTypeIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  planTypeChevron: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 10,
  },

  // Today hero (SCRUM-252) — replaces the older progressCard split.
  heroCard: {
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroLabel: { letterSpacing: 0.6, textTransform: 'uppercase' },
  heroBadge: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  heroProgressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  heroProgressFill: { height: '100%', borderRadius: 4 },
  heroStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 2 },
  heroStat: { flexDirection: 'row', alignItems: 'center' },
  heroStatDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

  // AI banner
  aiBanner: { marginHorizontal: 20, padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 16 },
  aiBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiBannerLabel: { fontWeight: '700', letterSpacing: 1 },
  aiBannerText: { lineHeight: 20 },

  // Progress
  progressCard: { marginHorizontal: 20, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 4 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressLabel: {},
  progressCount: {},
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // Section header
  secHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  secLabel: { letterSpacing: 0.5, textTransform: 'uppercase' },
  secProgress: {},
  countBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  countBadgeText: { letterSpacing: 0.5 },

  // Goal row
  goal: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginHorizontal: 20, marginBottom: 8, borderRadius: 14, borderWidth: 1 },
  goalIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  goalBody: { flex: 1 },
  goalTitle: { marginBottom: 2 },
  goalDesc: { lineHeight: 16 },
  // COS-382: goal-progress row styles (inert when GOAL_PROGRESS_ENABLED=false)
  progressRow: { marginTop: 6, gap: 4 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText: { letterSpacing: 0.8, textTransform: 'uppercase' },
  // COS-401 / SCRUM-537: goal-edit discoverability cue
  goalEditHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 20, marginTop: 2, marginBottom: 4,
  },
  goalEditHintText: { lineHeight: 16 },
  goalTrailing: { alignItems: 'flex-end', gap: 6 },
  goalEditCue: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  goalEditCueText: { letterSpacing: 0.3 },

  // Task row
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginHorizontal: 20, marginBottom: 8, borderRadius: 14, borderWidth: 1 },
  taskCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  taskBody: { flex: 1 },
  taskTitle: { marginBottom: 2 },
  taskSub: { lineHeight: 16 },
  taskTime: { alignItems: 'flex-end', minWidth: 52 },
  taskTimeVal: { letterSpacing: -0.3 },
  taskTimeMeridiem: {},

  emptyTasksRow: { padding: 20, marginHorizontal: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  emptyTasksText: {},

  hint: { textAlign: 'center', marginTop: 12, paddingHorizontal: 20 },

  // Progress report stats row
  reportStatsRow: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  reportStat: { flex: 1, alignItems: 'center' },
  reportStatValue: { letterSpacing: -0.5, marginBottom: 2 },
  reportStatLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },

  // COS-373: notification-categories preview card
  notifPreviewCard: { marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  notifPreviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  notifPreviewTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  notifPreviewTitle: { flexShrink: 1 },
  notifPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  notifPreviewLabel: { flex: 1 },

  // Plan overview card
  planOverview: { marginHorizontal: 20, marginTop: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  planOverviewTitle: { marginBottom: 12, letterSpacing: 1, textTransform: 'uppercase' },
  planOverviewGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  planOverviewItem: { flex: 1, alignItems: 'center', gap: 6 },
  planOverviewIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  planOverviewCount: { letterSpacing: -0.5 },
  planOverviewLabel: { textAlign: 'center' },

  // Full plan section
  groupBlock: { marginBottom: 14 },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
  },
  groupHeaderIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  groupHeader: { letterSpacing: -0.2, flex: 1 },
  groupHeaderCount: { fontWeight: '600' },
  taskRail: { width: 4, height: 36, borderRadius: 2 },
  taskTimeBlock: {
    alignItems: 'flex-end',
    minWidth: 48,
    marginLeft: 8,
  },
  fullPlanRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10,
    marginHorizontal: 20, marginBottom: 6,
    borderRadius: 12, borderWidth: 1,
  },
});

// COS-377: styles for the goal editor modal (only loaded when CARE_PLAN_ENABLED=true at runtime)
const goalEditorStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerTitle: {},
  scrollArea: { paddingHorizontal: 20, paddingTop: 12 },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusChipText: {},
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {
    color: '#fff',
  },
});
