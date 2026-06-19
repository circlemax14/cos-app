import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import type { AiHealthPlan, TaskOccurrence, TaskType } from '@/services/api/types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { fetchPlanType, type PlanType } from '@/services/api/plan-type';
import { fetchAssessments } from '@/services/api/assessments';
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments';
import { PlanTypeChooser } from '@/components/health-plan/PlanTypeChooser';
import { AssessmentCatalogContent } from '@/components/health-plan/AssessmentCatalogContent';
import { ProgressTab } from '@/components/health-plan/ProgressTab';

// Today's ISO date in the patient's local timezone
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
 *  never shows blank during the initial query load. */
function planTypeLabel(t: PlanType | undefined): string {
  switch (t) {
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

const PRIORITY_STYLE: Record<'high' | 'medium' | 'low', { color: string; bg: string; label: string }> = {
  high: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', label: 'High' },
  medium: { color: '#D97706', bg: 'rgba(217,119,6,0.12)', label: 'Med' },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'Low' },
};

export default function HealthPlanScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [plan, setPlan] = useState<AiHealthPlan | null>(null);
  const [tasks, setTasks] = useState<TaskOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Health Plan v2: Plan / Progress tabs + plan-type chooser
  const [activeTab, setActiveTab] = useState<'plan' | 'progress'>('plan');
  const [showChooser, setShowChooser] = useState(false);

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
          setShowChooser(true);
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
        await load();
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
      }
    },
    [],
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
      }
    },
    [],
  );

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length;
  const progressPct = tasks.length > 0 ? completedCount / tasks.length : 0;

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

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
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
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
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
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.tint + '18' }]}>
              <MaterialIcons name="auto-awesome" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any }]}>
              Generate your Health Plan
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              We’ll analyze your connected health records and build a personalized daily plan with goals and tasks tailored to your care.
            </Text>
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: colors.tint }]}
              onPress={() => onGenerate(false)}
              disabled={generating}>
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="auto-awesome" size={16} color="#fff" />
                  <Text style={[styles.generateBtnText, { fontSize: getScaledFontSize(14) }]}>Generate plan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  // Stats surfaced to the Progress tab — computed once from existing state
  const completedToday = tasks.filter((t) => t.status === 'completed').length;
  const totalToday = tasks.length;
  const adherencePercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  return (
    <AppWrapper>
      <PlanTypeChooser
        visible={showChooser}
        currentType={currentPlanType}
        hasAgency
        onClose={() => setShowChooser(false)}
      />

      {/* Tab bar */}
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

      {activeTab === 'progress' ? (
        <ProgressTab
          streakDays={0 /* TODO: surface from /v1/.../analytics in a follow-up */}
          adherencePercent={adherencePercent}
          completedToday={completedToday}
          totalToday={totalToday}
        />
      ) : (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
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
          <TouchableOpacity
            style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}
            onPress={() => onGenerate(true)}
            disabled={generating}>
            {generating ? (
              <ActivityIndicator color={colors.tint} size="small" />
            ) : (
              <MaterialIcons name="refresh" size={18} color={colors.subtext} />
            )}
          </TouchableOpacity>
        </View>

        {/* Plan-type card — prominent so users can see and switch their
            plan at a glance, instead of buried as a tiny pill in the tab
            bar. SCRUM-252. */}
        <Pressable
          onPress={() => setShowChooser(true)}
          accessibilityRole="button"
          accessibilityLabel={`Plan type: ${planTypeLabel(currentPlanType)}. Tap to change.`}
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
              {planTypeLabel(currentPlanType)}
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
                  {completedCount} of {tasks.length} task{tasks.length === 1 ? '' : 's'} done
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
            <View style={styles.planOverviewItem}>
              <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.appointment.bg }]}>
                <MaterialIcons name={TASK_ICON.appointment.name} size={18} color={TASK_ICON.appointment.color} />
              </View>
              <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                {planTaskCounts.appointment}
              </Text>
              <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Visits</Text>
            </View>
            <View style={styles.planOverviewItem}>
              <View style={[styles.planOverviewIcon, { backgroundColor: TASK_ICON.reminder.bg }]}>
                <MaterialIcons name={TASK_ICON.reminder.name} size={18} color={TASK_ICON.reminder.color} />
              </View>
              <Text style={[styles.planOverviewCount, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(800) as any }]}>
                {planTaskCounts.reminder}
              </Text>
              <Text style={[styles.planOverviewLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>Reminders</Text>
            </View>
          </View>
        </View>

        {/* Goals */}
        {plan.goals.length > 0 && (
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
            {tasksByType
              .filter((g) => g.tasks.length > 0)
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
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText: { letterSpacing: 0.8, textTransform: 'uppercase' },

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
