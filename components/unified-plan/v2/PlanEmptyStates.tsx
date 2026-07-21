/**
 * PlanEmptyStates — CHUNK 32 (2026-07-21).
 *
 * Three presentational empty-state components + a `hasPlanContent()`
 * narrowing helper for PlanScreenV2. Ports the empty-state UI patterns
 * from legacy `app/Home/health-plan.tsx` (Basic-tier Generate CTA) and
 * `components/health-plan/BiopsychosocialPlanScreen.tsx` (NoTier +
 * HasTierNoPlan states) into the v2 folder.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY:
 *   View · Text · Pressable · ActivityIndicator · StyleSheet · MaterialIcons
 * Explicitly avoided (all forbidden per crash rules):
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · axios (fetch via ./net only)
 *
 * These are pure leaf components — they never fire a network call
 * themselves. `BasicGenerateEmptyState` receives an `onGenerate`
 * callback; PlanScreenV2 owns the fire-and-forget POST + staged
 * refetch cadence + `generating` state (see chunk 32 handler there).
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

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { UnifiedPlanView } from '@/services/api/unified-plan';

// ── Content narrowing helper ────────────────────────────────────────

/**
 * Returns true iff any BPS section carries at least one bullet, goal,
 * or task. Every field access is null-guarded because the sections
 * object could theoretically be undefined (defensive — `useUnifiedPlan`
 * already folds the __featureDisabled sentinel into `data: null` so it
 * won't reach here, but the guards are cheap and cover any future BE
 * envelope drift).
 */
export function hasPlanContent(view: UnifiedPlanView): boolean {
  const s = view?.sections;
  if (!s) return false;
  const sections = [s.biological, s.psychological, s.socialSpiritual];
  for (const sec of sections) {
    if (!sec) continue;
    if ((sec.planBullets?.length ?? 0) > 0) return true;
    if ((sec.goals?.length ?? 0) > 0) return true;
    if ((sec.tasks?.length ?? 0) > 0) return true;
  }
  return false;
}

// ── NoTierEmptyState ────────────────────────────────────────────────

export interface NoTierEmptyStateProps {
  onChoose: () => void;
}

export function NoTierEmptyState({
  onChoose,
}: NoTierEmptyStateProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = (colors.tint as string) ?? '#0D9488';

  return (
    <View style={styles.emptyWrap} accessible accessibilityLabel="Choose your plan first">
      <View style={[styles.emptyIcon, { backgroundColor: tint + '18' }]}>
        <MaterialIcons name="tune" size={32} color={tint} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: colors.text,
            fontSize: getScaledFontSize(20),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          },
        ]}
      >
        Choose your plan first
      </Text>
      <Text
        style={[
          styles.emptyBody,
          { color: colors.subtext, fontSize: getScaledFontSize(14) },
        ]}
      >
        Pick a plan tier so we know which check-ins to build your care plan from.
      </Text>
      <Pressable
        onPress={onChoose}
        accessibilityRole="button"
        accessibilityLabel="Choose your plan"
        hitSlop={8}
        style={({ pressed }) => [
          styles.pillBtn,
          { backgroundColor: tint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.pillBtnText, { fontSize: getScaledFontSize(14) }]}>
          Choose plan
        </Text>
      </Pressable>
    </View>
  );
}

// ── BasicGenerateEmptyState ─────────────────────────────────────────

export interface BasicGenerateEmptyStateProps {
  onGenerate: () => void;
  generating: boolean;
}

export function BasicGenerateEmptyState({
  onGenerate,
  generating,
}: BasicGenerateEmptyStateProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = (colors.tint as string) ?? '#0D9488';

  return (
    <View style={styles.emptyWrap} accessible accessibilityLabel="Generate your Health Plan">
      <View style={[styles.emptyIcon, { backgroundColor: tint + '18' }]}>
        <MaterialIcons name="auto-awesome" size={32} color={tint} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          },
        ]}
      >
        Generate your Health Plan
      </Text>
      <Text
        style={[
          styles.emptyBody,
          { color: colors.subtext, fontSize: getScaledFontSize(14) },
        ]}
      >
        We&apos;ll analyze your connected health records and build a personalized
        daily plan with goals and tasks tailored to your care.
      </Text>
      <Pressable
        onPress={onGenerate}
        disabled={generating}
        accessibilityRole="button"
        accessibilityLabel="Generate plan"
        accessibilityState={{ disabled: generating }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.pillBtn,
          {
            backgroundColor: tint,
            opacity: generating ? 0.75 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.pillInline}>
            <MaterialIcons name="auto-awesome" size={16} color="#fff" />
            <Text style={[styles.pillBtnText, { fontSize: getScaledFontSize(14) }]}>
              Generate plan
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ── HasTierNoPlanEmptyState ─────────────────────────────────────────

export interface HasTierNoPlanEmptyStateProps {
  planTypeDisplayName: string;
  onChangePlan: () => void;
}

export function HasTierNoPlanEmptyState({
  planTypeDisplayName,
  onChangePlan,
}: HasTierNoPlanEmptyStateProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = (colors.tint as string) ?? '#0D9488';

  return (
    <View style={styles.emptyWrap} accessible accessibilityLabel="Your care plan is being prepared">
      <View style={[styles.emptyIcon, { backgroundColor: tint + '18' }]}>
        <MaterialIcons name="spa" size={32} color={tint} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: colors.text,
            fontSize: getScaledFontSize(20),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          },
        ]}
      >
        Your care plan is being prepared
      </Text>
      <Text
        style={[
          styles.emptyBody,
          { color: colors.subtext, fontSize: getScaledFontSize(14) },
        ]}
      >
        Check back after completing your assessments.
      </Text>
      <Pressable
        onPress={onChangePlan}
        accessibilityRole="button"
        accessibilityLabel={`Change plan. Currently ${planTypeDisplayName}.`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.changePlanLink,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {`Change plan · ${planTypeDisplayName}`}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyWrap: {
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyBody: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
    minWidth: 180,
    gap: 8,
  },
  pillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  changePlanLink: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
});
