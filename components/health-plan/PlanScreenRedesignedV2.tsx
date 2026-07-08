/**
 * PlanScreenRedesignedV2 (COS-422) — MakeMyTrip-inspired visual redesign.
 *
 * A 100% drop-in for `PlanScreenRedesigned` (v1): IDENTICAL prop interface
 * (`PlanScreenRedesignedProps`, re-exported from v1), identical data flow, and
 * the same category-first structure (per category: STATUS → TASKS → GOALS). It
 * owns NO data and NO business logic — the plan, the build/refresh + canGenerate
 * gating, the goal-edit flow + modal, goal progress, the medications sections,
 * and the notifications behavior are all passed in as props, exactly like v1.
 *
 * Rendered ONLY when `PLAN_REDESIGN_V2_ENABLED` is true; otherwise health-plan.tsx
 * falls through to v1 (`PLAN_REDESIGN_ENABLED`) or the legacy inline ScrollView.
 *
 * What's NEW here is purely PRESENTATION (the "craft"), inspired by MakeMyTrip's
 * information-led cards + care-plan best practices, on the app's existing teal
 * brand:
 *   • Depth/elevation (3 levels) so hierarchy pops instead of flat borders.
 *   • Per-category colored icon chip + accent rail so categories are scannable.
 *   • A 3-state status pill (On track / Needs attention / Just started) that
 *     ALWAYS pairs color + icon + word (accessibility — never color alone).
 *   • STATUS card with a left accent bar + stronger tint as the category anchor.
 *   • "Refresh my plan" demoted to a small header affordance once a plan exists;
 *     the full-width primary button is reserved for the empty/first-build state.
 *   • Goal cards: a % label by the progress bar, priority as a subtle top-right
 *     chip, Edit as the single clear CTA, and a category-tinted left rail.
 *   • Spacing/radii pulled from the design-system token scale (8pt rhythm).
 *   • A warmer empty state — colored icon badge + encouraging copy + one CTA.
 *
 * Accessibility is preserved from v1: every text size flows through
 * getScaledFontSize and every weight through getScaledFontWeight; touch targets
 * stay ≥ 44pt; accessibilityLabel/Role props are kept/ported.
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AICitationsFooter } from '@/components/ai/ai-citations-footer';
import { MedicationsSection } from '@/components/health-plan/MedicationsSection';
import { MedicationsReviewPrompt } from '@/components/health-plan/MedicationsReviewPrompt';
import { TryNewPlanCta } from '@/components/health-plan/TryNewPlanCta';
import type { AiPlanGoal, PlanTask, TaskType } from '@/services/api/types';
import {
  CARE_PLAN_V2_ENABLED,
  GOAL_PROGRESS_ENABLED,
  buildCategorySections,
  formatGoalPlain,
  formatGoalProgress,
  isPlanTaskTypeVisible,
  type CarePlanCategoryKey,
} from '@/lib/care-plan';
import { Radii, Spacing } from '@/constants/design-system';
import type { PlanScreenRedesignedProps } from '@/components/health-plan/PlanScreenRedesigned';
import type { PlanType } from '@/services/api/plan-type';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';

// Re-export so health-plan.tsx (and anyone) can pull the SAME prop type from
// either component — v2 is a literal drop-in.
export type { PlanScreenRedesignedProps } from '@/components/health-plan/PlanScreenRedesigned';

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

// ── Per-category color + icon vocabulary ──────────────────────────────────────
// MakeMyTrip leans on a distinct color + icon per "category" so the eye can scan
// the page. We give each care-plan category a leading colored chip + an accent
// used for its left rail and header underline. Colors are intentionally vivid but
// sit alongside (not replacing) the teal brand, which still owns the primary CTA,
// status pill "on track", and progress fills.
const CATEGORY_STYLE: Record<
  CarePlanCategoryKey,
  { name: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  medical: { name: 'local-hospital', color: '#3B82F6' },
  cognitive: { name: 'psychology', color: '#8B5CF6' },
  adl: { name: 'self-improvement', color: '#0EA5E9' },
  medication: { name: 'medication', color: '#7C3AED' },
  mentalHealth: { name: 'favorite', color: '#EC4899' },
  integrative: { name: 'spa', color: '#10B981' },
  social: { name: 'groups', color: '#F59E0B' },
  spiritual: { name: 'wb-sunny', color: '#F97316' },
};

function categoryStyleFor(key: CarePlanCategoryKey, fallbackTint: string) {
  return CATEGORY_STYLE[key] ?? { name: 'category' as const, color: fallbackTint };
}

// Add an alpha suffix to a 6-digit hex color (e.g. tint + '14'). Mirrors the
// existing `card`/tint+alpha pattern used across this screen.
function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

/**
 * COS-360 / SCRUM-577 — flag-aware plan-type label helper. Accepts an
 * optional resolver from usePlanTypeDisplayName() so the "agency-supported"
 * label switches to "Family Support" when ASSESSMENT_STRATEGY_V2_ENABLED
 * is on. Without a resolver, ships the legacy labels — same behavior
 * as before COS-360, unblocking utility callers.
 */
function planTypeLabel(
  t: string | undefined,
  displayName?: (type: PlanType) => string,
): string {
  const type: PlanType =
    t === 'advanced' || t === 'agency-supported' || t === 'agency-managed'
      ? t
      : 'basic';
  if (displayName) return displayName(type);
  switch (type) {
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

// ── 3-state status pill (color + icon + word — never color alone) ─────────────
// Classifies the backend's free-text category status into one of three friendly
// states. "Just started" is framed as VALID, not failure. Keeps presentation-only:
// no new data — derived purely from the existing `status` string the backend
// already sends (or its absence).
type StatusState = 'onTrack' | 'attention' | 'started';

function classifyStatus(status: string | null): StatusState {
  const s = (status ?? '').toLowerCase();
  if (/attention|behind|overdue|worse|declin|risk|missed|off track|off-track|concern/.test(s)) {
    return 'attention';
  }
  if (/on track|on-track|improv|great|good|stable|steady|progress|going well/.test(s)) {
    return 'onTrack';
  }
  return 'started';
}

function statusPillStyle(
  state: StatusState,
  tint: string,
  colors: ColorMap,
  isDark: boolean,
): { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string; bg: string } {
  switch (state) {
    case 'onTrack':
      return { label: 'On track', icon: 'check-circle', color: tint, bg: alpha(tint, '1F') };
    case 'attention': {
      // theme.ts has no `warning` key, so pick a scheme-aware amber: a fixed
      // dark-amber on a dark background reads too dim (COS-422 review).
      const amber = (colors.warning as string) ?? (isDark ? '#FBBF24' : '#B45309');
      return {
        label: 'Needs attention',
        icon: 'error-outline',
        color: amber,
        bg: alpha(amber, isDark ? '2E' : '22'),
      };
    }
    default:
      return {
        label: 'Just started',
        icon: 'hourglass-empty',
        color: (colors.subtext as string) ?? '#6B7280',
        bg: alpha((colors.subtext as string) ?? '#6B7280', '1A'),
      };
  }
}

// ── Elevation presets (3 levels max) ──────────────────────────────────────────
// iOS shadow + Android elevation so hierarchy pops vs. v1's flat borders.
const elevation = (level: 1 | 2 | 3) =>
  Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: level },
      shadowOpacity: 0.04 + level * 0.03,
      shadowRadius: level * 3 + 2,
    },
    android: { elevation: level * 2 },
    default: {},
  }) as object;

export function PlanScreenRedesignedV2(props: PlanScreenRedesignedProps) {
  const isDark = useColorScheme() === 'dark';
  // COS-360 / SCRUM-577 — 'agency-supported' → "Family Support" when
  // ASSESSMENT_STRATEGY_V2_ENABLED is on.
  const planTypeDisplayName = usePlanTypeDisplayName();
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
  const card = colors.card as string;

  // ── Category-first model (IDENTICAL to v1 — no data ownership changes) ──────
  const planTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const visibleTasks = planTasks
    .filter((t) => isPlanTaskTypeVisible(t.type, CARE_PLAN_V2_ENABLED))
    .slice()
    .sort((a, b) => {
      const at = a.scheduledTime || '';
      const bt = b.scheduledTime || '';
      if (!at && !bt) return 0;
      if (!at) return 1; // a has no time → after b
      if (!bt) return -1; // b has no time → after a
      return at.localeCompare(bt);
    });
  const goals = Array.isArray(plan.goals) ? plan.goals : [];

  const { sections, leftoverGoals } = buildCategorySections(
    goals,
    visibleTasks,
    plan.categoryStatuses, // optional — graceful omission when absent
  );

  const hasAnyContent = sections.length > 0 || leftoverGoals.length > 0;
  const hasPlan = goals.length > 0; // demote Refresh to a header chip once a plan exists

  return (
    <ScrollView
      ref={planScrollRef}
      style={[styles.container]}
      contentContainerStyle={{ paddingBottom: Spacing.xl + Spacing.sm }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />}
    >
      {/* Soft, recurring "review your medications" prompt — self-gates internally. */}
      <MedicationsReviewPrompt onReviewNow={onReviewMedications} />

      {needsAssessment ? (
        <Pressable
          onPress={onPersonalize}
          accessibilityRole="button"
          accessibilityLabel="Personalize your plan. Finish your health check-in."
          style={({ pressed }) => [
            styles.banner,
            elevation(1),
            { backgroundColor: alpha(tint, '14'), borderColor: alpha(tint, '55'), opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={[styles.bannerIcon, { backgroundColor: alpha(tint, '22') }]}>
            <MaterialIcons name="assignment" size={getScaledFontSize(22)} color={tint} />
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.md -4 }}>
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

      {/* Header — "Your plan" leads; once a plan exists, Refresh is a small chip
          on the right (primary CTA reserved for the empty/first-build state). */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: Spacing.md - 4 }}>
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

        {hasPlan ? (
          <TouchableOpacity
            onPress={() => onGenerate(true)}
            disabled={generating || !canGeneratePlan}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Refresh my plan"
            accessibilityState={{ disabled: generating || !canGeneratePlan }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[
              styles.refreshChip,
              elevation(1),
              { backgroundColor: alpha(tint, '14'), borderColor: alpha(tint, '40'), opacity: generating || !canGeneratePlan ? 0.5 : 1 },
            ]}
          >
            {generating ? (
              <ActivityIndicator color={tint} size="small" />
            ) : (
              <MaterialIcons name="refresh" size={getScaledFontSize(18)} color={tint} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* First-build primary action — only the empty/first-build state earns the
          full-width button (keeps canGenerate gating). */}
      {!hasPlan ? (
        <TouchableOpacity
          onPress={() => onGenerate(true)}
          disabled={generating || !canGeneratePlan}
          accessibilityRole="button"
          accessibilityLabel="Build my plan"
          accessibilityState={{ disabled: generating || !canGeneratePlan }}
          style={[
            styles.primaryBtn,
            elevation(2),
            { backgroundColor: tint, opacity: generating || !canGeneratePlan ? 0.5 : 1 },
          ]}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="auto-awesome" size={getScaledFontSize(20)} color="#fff" />
              <Text
                style={{ color: '#fff', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }}
              >
                Build my plan
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {/* Plan-type strip — small, single line. Taps open the chooser. */}
      <Pressable
        onPress={onChangePlanType}
        accessibilityRole="button"
        accessibilityLabel={`Plan type: ${planTypeLabel(currentPlanType, planTypeDisplayName)}. Tap to change.`}
        style={({ pressed }) => [
          styles.planTypeStrip,
          { backgroundColor: card, borderColor: border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <MaterialIcons name="tune" size={getScaledFontSize(16)} color={subtext} />
        <Text style={{ color: subtext, fontSize: getScaledFontSize(13), marginLeft: Spacing.sm, flex: 1 }} numberOfLines={1}>
          Plan type: <Text style={{ color: text, fontWeight: getScaledFontWeight(700) as any }}>{planTypeLabel(currentPlanType, planTypeDisplayName)}</Text>
        </Text>
        <Text style={{ color: tint, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}>
          Change
        </Text>
      </Pressable>

      {/* COS-412: opt-in migration CTA to the biopsychosocial (3-section)
          rebuild. Self-gates internally — renders nothing unless the flag is
          on AND no biopsychosocial plan exists yet, so this is a no-op for
          flag-off users and for users who already migrated (they're routed
          to BiopsychosocialPlanScreen before this component ever mounts). */}
      <TryNewPlanCta />

      {/* Plan summary — one idea per card, lifted with subtle elevation. */}
      {!!plan.summary && (
        <View style={[styles.summaryCard, elevation(1), { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.eyebrow, { color: tint, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
            YOUR PLAN, IN SHORT
          </Text>
          <Text style={{ color: text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: Spacing.sm }}>
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
        const cat = categoryStyleFor(section.key, tint);
        const statusState = classifyStatus(section.status);
        const pill = statusPillStyle(statusState, tint, colors, isDark);
        return (
          <View key={section.key} style={styles.categorySection}>
            {/* 1. Category header — colored icon chip + tinted underline so each
                category is instantly scannable (MakeMyTrip-style). */}
            <View style={[styles.categoryHeaderRow, { borderColor: alpha(cat.color, '33') }]}>
              <View style={[styles.categoryChip, { backgroundColor: alpha(cat.color, '1A') }]}>
                <MaterialIcons name={cat.name} size={getScaledFontSize(18)} color={cat.color} />
              </View>
              <Text
                style={{
                  color: text,
                  fontSize: getScaledFontSize(22),
                  fontWeight: getScaledFontWeight(800) as any,
                  letterSpacing: -0.4,
                  flex: 1,
                  marginLeft: Spacing.md - 4,
                }}
              >
                {section.label}
              </Text>
            </View>

            {/* 2. STATUS — category anchor: left accent bar + stronger tint + a
                3-state pill (color + icon + word). Omitted when status absent. */}
            {section.status ? (
              <View
                style={[
                  styles.statusCard,
                  elevation(2),
                  { backgroundColor: alpha(tint, '12'), borderColor: alpha(tint, '2E') },
                ]}
              >
                <View style={[styles.statusAccentBar, { backgroundColor: tint }]} />
                <View style={styles.statusBody}>
                  <View style={styles.statusTopRow}>
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
                    <View
                      style={[styles.statusPill, { backgroundColor: pill.bg }]}
                      accessibilityRole="text"
                      accessibilityLabel={`Status: ${pill.label}`}
                    >
                      <MaterialIcons name={pill.icon} size={getScaledFontSize(13)} color={pill.color} />
                      <Text
                        style={{
                          color: pill.color,
                          fontSize: getScaledFontSize(11),
                          fontWeight: getScaledFontWeight(800) as any,
                          marginLeft: 4,
                        }}
                      >
                        {pill.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: Spacing.sm }}>
                    {section.status}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 3. TASKS — the planned actions for this category. */}
            {section.tasks.length > 0 && (
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
                    <View
                      key={t.id}
                      style={[styles.taskRow, elevation(1), { backgroundColor: card, borderColor: border }]}
                    >
                      <View style={[styles.taskIcon, { backgroundColor: icon.bg }]}>
                        <MaterialIcons name={icon.name} size={getScaledFontSize(18)} color={icon.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
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
                        <View style={{ alignItems: 'flex-end', marginLeft: Spacing.sm }}>
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
              </View>
            )}

            {/* 4. GOALS — the category's measurable goals (editable cards). */}
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
                    accentColor={cat.color}
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
          <View style={[styles.categoryHeaderRow, { borderColor: alpha(tint, '33') }]}>
            <View style={[styles.categoryChip, { backgroundColor: alpha(tint, '1A') }]}>
              <MaterialIcons name="flag" size={getScaledFontSize(18)} color={tint} />
            </View>
            <Text
              style={{
                color: text,
                fontSize: getScaledFontSize(22),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: -0.4,
                flex: 1,
                marginLeft: Spacing.md - 4,
              }}
            >
              Your Goals
            </Text>
          </View>
          {leftoverGoals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              accentColor={tint}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onEdit={openGoalEditor}
            />
          ))}
        </View>
      )}

      {/* Manage reminders (Care Plan v2) — STABLE trailing block, gated only on
          CARE_PLAN_V2_ENABLED. Always reachable when v2 is on (mirrors v1). */}
      {CARE_PLAN_V2_ENABLED && (
        <View style={styles.categorySection}>
          <View style={[styles.subLabelRow, styles.subLabelInset]}>
            <MaterialIcons name="notifications" size={getScaledFontSize(14)} color={subtext} />
            <Text
              style={[
                styles.subLabel,
                { color: subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(800) as any },
              ]}
            >
              REMINDERS
            </Text>
          </View>
          <Pressable
            onPress={onManageReminders}
            accessibilityRole="button"
            accessibilityLabel="Manage reminders"
            style={({ pressed }) => [
              styles.taskRow,
              elevation(1),
              { backgroundColor: card, borderColor: border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.taskIcon, { backgroundColor: TASK_ICON.reminder.bg }]}>
              <MaterialIcons
                name={TASK_ICON.reminder.name}
                size={getScaledFontSize(18)}
                color={TASK_ICON.reminder.color}
              />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
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
        </View>
      )}

      {/* Empty state — warm: colored icon badge + encouraging copy + one CTA.
          "Just started" is framed as valid, not failure. */}
      {!hasAnyContent && (
        <View style={[styles.emptyCard, elevation(2), { backgroundColor: card, borderColor: border }]}>
          <View style={[styles.emptyBadge, { backgroundColor: alpha(tint, '1A') }]}>
            <MaterialIcons name="auto-awesome" size={getScaledFontSize(34)} color={tint} />
          </View>
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(800) as any,
              marginTop: Spacing.md,
              textAlign: 'center',
            }}
          >
            Let&apos;s build your plan
          </Text>
          <Text
            style={{ color: subtext, fontSize: getScaledFontSize(14), lineHeight: 21, marginTop: 8, textAlign: 'center' }}
          >
            You&apos;re just getting started — that&apos;s exactly where you should be. Tap below and we&apos;ll create a plan that fits you.
          </Text>
          <TouchableOpacity
            onPress={() => onGenerate(true)}
            disabled={generating || !canGeneratePlan}
            accessibilityRole="button"
            accessibilityLabel="Build my plan"
            accessibilityState={{ disabled: generating || !canGeneratePlan }}
            style={[
              styles.emptyCta,
              elevation(1),
              { backgroundColor: tint, opacity: generating || !canGeneratePlan ? 0.5 : 1 },
            ]}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="auto-awesome" size={getScaledFontSize(18)} color="#fff" />
                <Text
                  style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any, marginLeft: 6 }}
                >
                  Build my plan
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: Spacing.lg }} />
    </ScrollView>
  );
}

// ── Goal card — editable card with category-tinted left rail, % progress label,
// priority as a subtle top-right chip, and Edit as the single clear CTA. ───────
/**
 * Exported (COS-360 / SCRUM-518) so the Biopsychosocial Care Plan screen
 * (`BiopsychosocialPlanScreen` / `SectionCard`) can reuse the exact same
 * goal-card presentation for `MeasurableGoal` (a type alias of `AiPlanGoal`)
 * instead of forking it. No behavior change for existing callers.
 */
export function GoalCard(props: {
  goal: AiPlanGoal;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEdit: (g: AiPlanGoal) => void;
}) {
  const { goal: g, accentColor, colors, getScaledFontSize, getScaledFontWeight, onEdit } = props;
  const tint = colors.tint;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = colors.card as string;

  const pstyle = PRIORITY_STYLE[g.priority];
  const plain = formatGoalPlain(g);
  const prog = GOAL_PROGRESS_ENABLED && g.progress ? formatGoalProgress(g) : null;
  // Clamp + finite-guard once: formatGoalProgress only null-checks, so a NaN
  // progressPercent would otherwise render "NaN%" and a NaN-width bar (COS-422 review).
  const frac =
    prog && prog.barFraction != null && Number.isFinite(prog.barFraction)
      ? Math.min(1, Math.max(0, prog.barFraction))
      : null;
  const pctLabel = frac != null ? `${Math.round(frac * 100)}%` : null;
  const trendColor =
    prog?.trendSymbol === '↑'
      ? tint
      : prog?.trendSymbol === '↓'
        ? colors.error ?? '#E53E3E'
        : subtext;

  return (
    <View style={[styles.goalCard, elevation(1), { backgroundColor: card, borderColor: border }]}>
      {/* Category-tinted left rail for instant grouping. */}
      <View style={[styles.goalRail, { backgroundColor: accentColor }]} />

      <View style={styles.goalInner}>
        {/* Top row: flag + title, with the priority chip pinned top-right. */}
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
          <View style={[styles.priorityChip, { backgroundColor: pstyle.bg }]}>
            <Text
              style={{
                color: pstyle.color,
                fontSize: getScaledFontSize(10),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              {pstyle.label}
            </Text>
          </View>
        </View>

        {!!g.description && (
          <Text style={{ color: subtext, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: Spacing.sm }}>
            {g.description}
          </Text>
        )}

        {!!plain && (
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: Spacing.md - 4,
              lineHeight: 21,
            }}
          >
            {plain}
          </Text>
        )}

        {/* Progress: bar + a % label next to it. */}
        {frac != null && (
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${frac * 100}%` as any,
                    backgroundColor: tint,
                  },
                ]}
              />
            </View>
            {!!pctLabel && (
              <Text
                style={{
                  color: tint,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(800) as any,
                  marginLeft: Spacing.sm,
                  minWidth: 38,
                  textAlign: 'right',
                }}
              >
                {pctLabel}
              </Text>
            )}
          </View>
        )}
        {prog && !!prog.trendSymbol && !!prog.line && (
          <Text
            style={{
              color: trendColor,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: Spacing.sm,
            }}
            numberOfLines={1}
          >
            {prog.trendSymbol} {prog.line}
          </Text>
        )}

        {/* Footer: Edit is the single clear CTA. */}
        <View style={styles.goalFooter}>
          <TouchableOpacity
            onPress={() => onEdit(g)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Edit goal: ${g.title}`}
            accessibilityHint="Opens the goal editor to change its target and details"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.editBtn, { backgroundColor: alpha(tint, '12'), borderColor: alpha(tint, '40') }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md - 2,
    borderWidth: 1,
    borderRadius: Radii.xl,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.lg - 4,
    paddingBottom: Spacing.xs,
  },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.full,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 44,
    width: 44,
    height: 44,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.xl,
    minHeight: 56,
  },

  planTypeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md - 2,
    paddingVertical: Spacing.md - 4,
    paddingHorizontal: Spacing.md - 2,
    borderRadius: Radii.md,
    borderWidth: 1,
  },

  summaryCard: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md,
    padding: Spacing.md + 2,
    borderRadius: Radii.xl,
    borderWidth: 1,
  },
  eyebrow: { letterSpacing: 1, textTransform: 'uppercase' },

  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg - 2,
    marginBottom: 2,
  },

  // Category section — clear visual separation between categories.
  categorySection: { marginTop: Spacing.lg + 2 },
  categoryHeaderRow: {
    marginHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.sm + 2,
    marginBottom: Spacing.sm,
    borderBottomWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // STATUS / TASKS / GOALS sub-labels within a category.
  subLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subLabelInset: { marginHorizontal: Spacing.screenPadding, marginTop: Spacing.sm + 2, marginBottom: 6 },
  subLabel: { letterSpacing: 1, textTransform: 'uppercase' },

  statusCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.sm,
    borderRadius: Radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusAccentBar: { width: 5 },
  statusBody: { flex: 1, padding: Spacing.md },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radii.full,
  },

  goalCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.md - 2,
    borderRadius: Radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  goalRail: { width: 5 },
  goalInner: { flex: 1, padding: Spacing.md + 2 },
  goalHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md - 4 },
  goalDot: { width: 38, height: 38, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  priorityChip: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radii.sm },

  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md - 4 },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },

  goalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.md,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    minHeight: 44,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md - 4,
    paddingHorizontal: Spacing.md - 4,
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  taskIcon: { width: 38, height: 38, borderRadius: Radii.md - 1, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg + 2,
    padding: Spacing.lg,
    borderRadius: Radii.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyBadge: {
    width: 72,
    height: 72,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md - 4,
    borderRadius: Radii.md,
    minHeight: 48,
  },
});
