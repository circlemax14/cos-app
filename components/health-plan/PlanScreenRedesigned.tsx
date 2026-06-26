/**
 * PlanScreenRedesigned (COS-404 / SCRUM-539) — CATEGORY-FIRST rebuild.
 *
 * Ken rejected the v1 goals-first redesign because it didn't show the plan
 * CATEGORIES. The plan must be organized BY CATEGORY, and each category flows
 * **STATUS → TASKS → GOALS**, "organized in a way that makes very clear sense to
 * users" (his bar: a 5-year-old can understand it).
 *
 * Rendered ONLY when `PLAN_REDESIGN_ENABLED` is true; otherwise `health-plan.tsx`
 * keeps its original render path byte-for-byte.
 *
 * This component is PRESENTATION-ONLY. It owns no data and no business logic —
 * the plan, the build/refresh + canGenerate gating, the goal-edit flow + modal,
 * goal progress, the medications sections, and the notifications/celebration
 * behavior are all passed in as props from the screen so the two render paths
 * share identical behavior and a single source of truth.
 *
 * Structure (per category, in registry order, present-only):
 *   1. Category header (clear, simple — "Medical", "Mental Health", …).
 *   2. STATUS — the backend's `categoryStatuses` summary, when present. When
 *      absent (backend not yet shipped/enabled) the STATUS block is GRACEFULLY
 *      OMITTED — structure still reads STATUS(optional) → TASKS → GOALS.
 *   3. TASKS — the category's tasks (AI-tagged `task.category`, else a
 *      type→category fallback so it groups correctly BEFORE the backend ships).
 *      Phase A hiding (reminders/visits off) + the Manage-reminders link kept.
 *   4. GOALS — the category's goals as v1's big editable goal cards (plain-
 *      language measure, progress/trend, the unmistakable per-card Edit button).
 *
 * Kept from v1: the single Build/Refresh primary action (canGenerate gating),
 * the personalize banner, the plan-type strip, the plan summary, the medications
 * sections, the goal cards / Edit button / progress, pull-to-refresh.
 */
import React from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AICitationsFooter } from '@/components/ai/ai-citations-footer';
import { MedicationsSection } from '@/components/health-plan/MedicationsSection';
import { MedicationsReviewPrompt } from '@/components/health-plan/MedicationsReviewPrompt';
import type { AiHealthPlan, AiPlanGoal, PlanTask, TaskType } from '@/services/api/types';
import {
  CARE_PLAN_V2_ENABLED,
  GOAL_PROGRESS_ENABLED,
  buildCategorySections,
  formatGoalPlain,
  formatGoalProgress,
  isPlanTaskTypeVisible,
} from '@/lib/care-plan';

type ColorMap = Record<string, string>;

const TASK_ICON: Record<
  TaskType,
  { name: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }
> = {
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

function planTypeLabel(t: string | undefined): string {
  switch (t) {
    case 'advanced':
      return 'Advanced';
    case 'agency-supported':
      return 'Agency Supported';
    case 'agency-managed':
      return 'Agency Managed';
    default:
      return 'Basic';
  }
}

// Format "HH:MM" -> "8:00 AM" / "6:30 PM"
function formatTime(hhmm: string): { time: string; meridiem: string } {
  const [hStr, m] = (hhmm ?? '').split(':');
  const h = parseInt(hStr, 10);
  if (!Number.isFinite(h)) return { time: '', meridiem: '' };
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { time: `${display}:${m}`, meridiem };
}

function recurrenceLabel(r: PlanTask['recurrence']): string {
  return r === 'daily'
    ? 'Daily'
    : r === 'weekdays'
      ? 'Weekdays'
      : r === 'weekly'
        ? 'Weekly'
        : 'Once';
}

export interface PlanScreenRedesignedProps {
  plan: AiHealthPlan;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;

  // Today's tasks (completion summary kept for the per-category task counts).
  tasks: { length: number };
  completedCount: number;
  skippedCount: number;
  progressPct: number;
  tasksByType: { type: TaskType; tasks: PlanTask[] }[];

  // Plan type chooser
  currentPlanType: string | undefined;
  onChangePlanType: () => void;

  // Pull-to-refresh
  refreshing: boolean;
  onRefresh: () => void;

  // Build / refresh the plan (keeps canGenerate gating)
  generating: boolean;
  canGeneratePlan: boolean;
  onGenerate: (force?: boolean) => void;

  // Goal editing (the existing full edit flow lives in the parent + shared modal)
  openGoalEditor: (g: AiPlanGoal) => void;

  // "Personalize your plan" banner
  needsAssessment: boolean;
  onPersonalize: () => void;

  // Manage reminders deep-link (Care Plan v2)
  onManageReminders: () => void;

  // Medications sections — rendered here so the redesign keeps them, but the
  // ref/signal wiring is owned by the screen (deep-link + scroll-to).
  planScrollRef: React.RefObject<ScrollView | null>;
  onMedsSectionLayout: (e: LayoutChangeEvent) => void;
  openMedsAddSignal: number;
  onReviewMedications: () => void;
}

export function PlanScreenRedesigned(props: PlanScreenRedesignedProps) {
  const {
    plan,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    currentPlanType,
    onChangePlanType,
    refreshing,
    onRefresh,
    generating,
    canGeneratePlan,
    onGenerate,
    openGoalEditor,
    needsAssessment,
    onPersonalize,
    onManageReminders,
    planScrollRef,
    onMedsSectionLayout,
    openMedsAddSignal,
    onReviewMedications,
  } = props;

  const tint = colors.tint;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = (colors.card as string) + 'D9';

  // ── Category-first model ──────────────────────────────────────────────────
  // Build one section per present care-plan category (STATUS + TASKS + GOALS),
  // in registry order. Tasks are taken from the plan and grouped by category via
  // the AI tag (`task.category`) with a type→category fallback. Phase A hiding
  // (reminders/visits) is applied BEFORE grouping so hidden types never appear.
  const planTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const visibleTasks = planTasks.filter((t) => isPlanTaskTypeVisible(t.type, CARE_PLAN_V2_ENABLED));
  const goals = Array.isArray(plan.goals) ? plan.goals : [];

  const { sections, leftoverGoals } = buildCategorySections(
    goals,
    visibleTasks,
    plan.categoryStatuses, // optional — graceful omission when absent
  );

  const hasAnyContent = sections.length > 0 || leftoverGoals.length > 0;

  return (
    <ScrollView
      ref={planScrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />}
    >
      {/* Soft, recurring "review your medications" prompt — self-gates internally. */}
      <MedicationsReviewPrompt onReviewNow={onReviewMedications} />

      {needsAssessment ? (
        <Pressable
          onPress={onPersonalize}
          accessibilityRole="button"
          accessibilityLabel="Personalize your plan. Finish your health check-in."
          style={[styles.banner, { backgroundColor: tint + '14', borderColor: tint }]}
        >
          <MaterialIcons name="assignment" size={getScaledFontSize(22)} color={tint} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }}>
              Personalize your plan
            </Text>
            <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginTop: 3, lineHeight: 18 }}>
              Finish your health check-in so your plan fits how you&apos;re really doing.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={getScaledFontSize(24)} color={tint} />
        </Pressable>
      ) : null}

      {/* Header — calm, generous. "Your plan" leads; the body is the categories. */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(30),
              fontWeight: getScaledFontWeight(800) as any,
              letterSpacing: -0.6,
            }}
          >
            Your plan
          </Text>
          <Text style={{ color: subtext, fontSize: getScaledFontSize(14), marginTop: 6, lineHeight: 20 }}>
            Updated{' '}
            {new Date(plan.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {'  ·  '}
            {goals.length} goal{goals.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {/* One clear primary action — Build / Refresh (keeps canGenerate gating). */}
      <TouchableOpacity
        onPress={() => onGenerate(true)}
        disabled={generating || !canGeneratePlan}
        accessibilityRole="button"
        accessibilityLabel={goals.length > 0 ? 'Refresh my plan' : 'Build my plan'}
        accessibilityState={{ disabled: generating || !canGeneratePlan }}
        style={[
          styles.primaryBtn,
          { backgroundColor: tint, opacity: generating || !canGeneratePlan ? 0.5 : 1 },
        ]}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="refresh" size={getScaledFontSize(20)} color="#fff" />
            <Text
              style={{ color: '#fff', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }}
            >
              {goals.length > 0 ? 'Refresh my plan' : 'Build my plan'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Plan-type strip — small, single line. Taps open the chooser. */}
      <Pressable
        onPress={onChangePlanType}
        accessibilityRole="button"
        accessibilityLabel={`Plan type: ${planTypeLabel(currentPlanType)}. Tap to change.`}
        style={({ pressed }) => [
          styles.planTypeStrip,
          { borderColor: border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <MaterialIcons name="tune" size={getScaledFontSize(16)} color={subtext} />
        <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginLeft: 8, flex: 1 }} numberOfLines={1}>
          Plan type: <Text style={{ color: text, fontWeight: getScaledFontWeight(700) as any }}>{planTypeLabel(currentPlanType)}</Text>
        </Text>
        <Text style={{ color: tint, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
          Change
        </Text>
      </Pressable>

      {/* Plan summary — kept, calm. */}
      {!!plan.summary && (
        <View style={[styles.summaryCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.eyebrow, { color: subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
            YOUR PLAN, IN SHORT
          </Text>
          <Text style={{ color: text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: 8 }}>
            {plan.summary}
          </Text>
          <AICitationsFooter compact />
        </View>
      )}

      {/* Medications — self-gating; kept so the redesign loses nothing. */}
      <MedicationsSection onLayout={onMedsSectionLayout} openAddSignal={openMedsAddSignal} />

      {/* Gentle hint: goals are editable. */}
      {goals.length > 0 && (
        <View
          style={styles.editHint}
          accessibilityRole="text"
          accessibilityLabel="You can change any goal. Tap its Edit button to edit it."
        >
          <MaterialIcons name="edit" size={getScaledFontSize(15)} color={subtext} />
          <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginLeft: 6, lineHeight: 18 }}>
            You can change any goal — tap <Text style={{ fontWeight: getScaledFontWeight(700) as any }}>Edit</Text>.
          </Text>
        </View>
      )}

      {/* ── CATEGORY SECTIONS — the hero. One per category: STATUS → TASKS → GOALS. ── */}
      {sections.map((section) => {
        const showRemindersLink =
          CARE_PLAN_V2_ENABLED && section.key === 'medical';
        return (
          <View key={section.key} style={styles.categorySection}>
            {/* 1. Category header — big, simple, the anchor of the section. */}
            <View style={[styles.categoryHeaderRow, { borderColor: border }]}>
              <Text
                style={{
                  color: text,
                  fontSize: getScaledFontSize(22),
                  fontWeight: getScaledFontWeight(800) as any,
                  letterSpacing: -0.4,
                  flex: 1,
                }}
              >
                {section.label}
              </Text>
            </View>

            {/* 2. STATUS — backend baseline summary. Omitted when absent. */}
            {section.status ? (
              <View style={[styles.statusCard, { backgroundColor: tint + '0F', borderColor: tint + '33' }]}>
                <View style={styles.subLabelRow}>
                  <MaterialIcons name="insights" size={getScaledFontSize(14)} color={tint} />
                  <Text
                    style={[
                      styles.subLabel,
                      { color: tint, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(800) as any },
                    ]}
                  >
                    WHERE YOU ARE NOW
                  </Text>
                </View>
                <Text style={{ color: text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: 8 }}>
                  {section.status}
                </Text>
              </View>
            ) : null}

            {/* 3. TASKS — the planned actions for this category. */}
            {(section.tasks.length > 0 || showRemindersLink) && (
              <View style={{ marginTop: 6 }}>
                <View style={[styles.subLabelRow, styles.subLabelInset]}>
                  <MaterialIcons name="checklist" size={getScaledFontSize(14)} color={subtext} />
                  <Text
                    style={[
                      styles.subLabel,
                      { color: subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(800) as any },
                    ]}
                  >
                    WHAT TO DO
                  </Text>
                </View>

                {section.tasks.map((t) => {
                  const icon = TASK_ICON[t.type] ?? TASK_ICON.medication;
                  const { time, meridiem } = formatTime(t.scheduledTime);
                  return (
                    <View key={t.id} style={[styles.taskRow, { backgroundColor: card, borderColor: border }]}>
                      <View style={[styles.taskIcon, { backgroundColor: icon.bg }]}>
                        <MaterialIcons name={icon.name} size={getScaledFontSize(18)} color={icon.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={{ color: text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}
                          numberOfLines={2}
                        >
                          {t.title}
                        </Text>
                        <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginTop: 1 }} numberOfLines={1}>
                          {recurrenceLabel(t.recurrence)}
                        </Text>
                      </View>
                      {!!time && (
                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                          <Text
                            style={{ color: text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}
                          >
                            {time}
                          </Text>
                          <Text style={{ color: subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any }}>
                            {meridiem}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Manage reminders (Care Plan v2) — lives under the Medical section. */}
                {showRemindersLink && (
                  <Pressable
                    onPress={onManageReminders}
                    accessibilityRole="button"
                    accessibilityLabel="Manage reminders"
                    style={[styles.taskRow, { backgroundColor: card, borderColor: border }]}
                  >
                    <View style={[styles.taskIcon, { backgroundColor: TASK_ICON.reminder.bg }]}>
                      <MaterialIcons
                        name={TASK_ICON.reminder.name}
                        size={getScaledFontSize(18)}
                        color={TASK_ICON.reminder.color}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={{ color: text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}
                        numberOfLines={1}
                      >
                        Manage reminders
                      </Text>
                      <Text style={{ color: subtext, fontSize: getScaledFontSize(13) }} numberOfLines={1}>
                        Notifications &amp; reminder settings
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={subtext} />
                  </Pressable>
                )}
              </View>
            )}

            {/* 4. GOALS — the category's measurable goals (v1 editable cards). */}
            {section.goals.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <View style={[styles.subLabelRow, styles.subLabelInset]}>
                  <MaterialIcons name="flag" size={getScaledFontSize(14)} color={subtext} />
                  <Text
                    style={[
                      styles.subLabel,
                      { color: subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(800) as any },
                    ]}
                  >
                    YOUR GOALS
                  </Text>
                </View>
                {section.goals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                    onEdit={openGoalEditor}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* Trailing "Your Goals" group for goals with no/unknown category (legacy). */}
      {leftoverGoals.length > 0 && (
        <View style={styles.categorySection}>
          <View style={[styles.categoryHeaderRow, { borderColor: border }]}>
            <Text
              style={{
                color: text,
                fontSize: getScaledFontSize(22),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: -0.4,
                flex: 1,
              }}
            >
              Your Goals
            </Text>
          </View>
          {leftoverGoals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onEdit={openGoalEditor}
            />
          ))}
        </View>
      )}

      {/* Empty state — no categories, goals, or tasks yet. */}
      {!hasAnyContent && (
        <View style={[styles.emptyCard, { backgroundColor: card, borderColor: border }]}>
          <MaterialIcons name="auto-awesome" size={getScaledFontSize(28)} color={subtext} />
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as any,
              marginTop: 10,
              textAlign: 'center',
            }}
          >
            Your plan is ready to build
          </Text>
          <Text
            style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: 19, marginTop: 6, textAlign: 'center' }}
          >
            Tap “Build my plan” above to create your personalized care plan.
          </Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Goal card — v1's big editable card, extracted so each category reuses it. ──
function GoalCard(props: {
  goal: AiPlanGoal;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEdit: (g: AiPlanGoal) => void;
}) {
  const { goal: g, colors, getScaledFontSize, getScaledFontWeight, onEdit } = props;
  const tint = colors.tint;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = (colors.card as string) + 'D9';

  const pstyle = PRIORITY_STYLE[g.priority];
  const plain = formatGoalPlain(g);
  const prog = GOAL_PROGRESS_ENABLED && g.progress ? formatGoalProgress(g) : null;
  const trendColor =
    prog?.trendSymbol === '↑'
      ? tint
      : prog?.trendSymbol === '↓'
        ? colors.error ?? '#E53E3E'
        : subtext;

  return (
    <View style={[styles.goalCard, { backgroundColor: card, borderColor: border }]}>
      <View style={styles.goalHeadRow}>
        <View style={[styles.goalDot, { backgroundColor: pstyle.bg }]}>
          <MaterialIcons name="flag" size={getScaledFontSize(18)} color={pstyle.color} />
        </View>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(18),
            fontWeight: getScaledFontWeight(700) as any,
            flex: 1,
            lineHeight: 24,
          }}
        >
          {g.title}
        </Text>
      </View>

      {!!g.description && (
        <Text style={{ color: subtext, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: 8 }}>
          {g.description}
        </Text>
      )}

      {!!plain && (
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as any,
            marginTop: 12,
            lineHeight: 21,
          }}
        >
          {plain}
        </Text>
      )}

      {/* Progress bar + trend line (COS-382 data, kept). */}
      {prog && prog.barFraction != null && (
        <View style={[styles.progressTrack, { backgroundColor: border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(1, Math.max(0, prog.barFraction)) * 100}%` as any,
                backgroundColor: tint,
              },
            ]}
          />
        </View>
      )}
      {prog && !!prog.trendSymbol && !!prog.line && (
        <Text
          style={{
            color: trendColor,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(600) as any,
            marginTop: 8,
          }}
          numberOfLines={1}
        >
          {prog.trendSymbol} {prog.line}
        </Text>
      )}

      {/* Footer: priority + the unmistakable per-card Edit button. */}
      <View style={styles.goalFooter}>
        <View style={[styles.priorityPill, { backgroundColor: pstyle.bg }]}>
          <Text
            style={{
              color: pstyle.color,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as any,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {pstyle.label} priority
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onEdit(g)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${g.title}`}
          accessibilityHint="Opens the goal editor to change its target and details"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.editBtn, { borderColor: tint }]}
        >
          <MaterialIcons name="edit" size={getScaledFontSize(16)} color={tint} />
          <Text
            style={{
              color: tint,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 6,
            }}
          >
            Edit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 16,
  },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 56,
  },

  planTypeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },

  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  eyebrow: { letterSpacing: 1, textTransform: 'uppercase' },

  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 2,
  },

  // Category section — clear visual separation between categories.
  categorySection: { marginTop: 26 },
  categoryHeaderRow: {
    marginHorizontal: 20,
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // STATUS / TASKS / GOALS sub-labels within a category.
  subLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subLabelInset: { marginHorizontal: 20, marginTop: 10, marginBottom: 6 },
  subLabel: { letterSpacing: 1, textTransform: 'uppercase' },

  statusCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },

  goalCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  goalHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  goalDot: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: 8, borderRadius: 4 },

  goalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  priorityPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 44,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  taskIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    marginHorizontal: 20,
    marginTop: 26,
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
});
