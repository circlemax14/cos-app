import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
      const ok = await completeTask(task.id, task.scheduledFor);
      if (!ok) {
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
      const ok = await skipTask(task.id, task.scheduledFor);
      if (!ok) {
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
  const progressPct = tasks.length > 0 ? completedCount / tasks.length : 0;

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

  // Empty state — no plan yet
  if (!plan) {
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
              We&apos;ll analyze your connected health records and build a personalized daily plan with goals and tasks tailored to your care.
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

  return (
    <AppWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}>
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
            style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => onGenerate(true)}
            disabled={generating}>
            {generating ? (
              <ActivityIndicator color={colors.tint} size="small" />
            ) : (
              <MaterialIcons name="refresh" size={18} color={colors.subtext} />
            )}
          </TouchableOpacity>
        </View>

        {/* AI Summary banner */}
        <View style={[styles.aiBanner, { backgroundColor: colors.tint + '14', borderColor: colors.tint + '30' }]}>
          <View style={styles.aiBannerTop}>
            <MaterialIcons name="auto-awesome" size={16} color={colors.tint} />
            <Text style={[styles.aiBannerLabel, { color: colors.tint, fontSize: getScaledFontSize(11) }]}>AI SUMMARY</Text>
          </View>
          <Text style={[styles.aiBannerText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            {plan.summary}
          </Text>
        </View>

        {/* Today progress */}
        {tasks.length > 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressLabel, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
                Today&apos;s progress
              </Text>
              <Text style={[styles.progressCount, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                {completedCount} of {tasks.length} completed
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View style={[styles.progressBarFill, { backgroundColor: colors.tint, width: `${progressPct * 100}%` }]} />
            </View>
          </View>
        )}

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
                <View key={g.id} style={[styles.goal, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

        {/* Today's tasks */}
        <View style={styles.secHead}>
          <Text style={[styles.secLabel, { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }]}>
            TODAY
          </Text>
          <Text style={[styles.secProgress, { color: colors.tint, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }]}>
            {completedCount} / {tasks.length} done
          </Text>
        </View>

        {tasks.length === 0 ? (
          <View style={[styles.emptyTasksRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTasksText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
              No tasks scheduled for today.
            </Text>
          </View>
        ) : (
          tasks.map((task) => {
            const icon = TASK_ICON[task.type];
            const { time, meridiem } = formatTime(task.scheduledTime);
            const done = task.status === 'completed';
            const skipped = task.status === 'skipped';
            return (
              <TouchableOpacity
                key={`${task.id}#${task.scheduledFor}`}
                activeOpacity={0.7}
                onLongPress={() => onSkip(task)}
                onPress={() => toggleTask(task)}
                style={[
                  styles.taskRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: done || skipped ? 0.55 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.taskCheck,
                    {
                      borderColor: done ? colors.tint : colors.subtext,
                      backgroundColor: done ? colors.tint : 'transparent',
                    },
                  ]}>
                  {done && <MaterialIcons name="check" size={14} color="#fff" />}
                  {skipped && <MaterialIcons name="close" size={14} color={colors.subtext} />}
                </View>
                <View style={[styles.taskIcon, { backgroundColor: icon.bg }]}>
                  <MaterialIcons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={styles.taskBody}>
                  <Text
                    style={[
                      styles.taskTitle,
                      {
                        color: colors.text,
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(600) as any,
                        textDecorationLine: done ? 'line-through' : 'none',
                      },
                    ]}
                    numberOfLines={1}>
                    {task.title}
                  </Text>
                  {!!task.description && (
                    <Text style={[styles.taskSub, { color: colors.subtext, fontSize: getScaledFontSize(12) }]} numberOfLines={1}>
                      {task.description}
                    </Text>
                  )}
                </View>
                <View style={styles.taskTime}>
                  <Text style={[styles.taskTimeVal, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}>
                    {time}
                  </Text>
                  <Text style={[styles.taskTimeMeridiem, { color: colors.subtext, fontSize: getScaledFontSize(10) }]}>
                    {meridiem}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={[styles.hint, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
          Tap a task to complete · Long-press to skip
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </AppWrapper>
  );
}

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
});
