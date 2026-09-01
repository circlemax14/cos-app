/**
 * COS-813 — the assessments a plan asks for, before the plan.
 *
 * ─── WHY A GATE AT ALL ───────────────────────────────────────────────
 *
 * A care plan built from nothing is a care plan about nobody. The plan's
 * instruments ARE its inputs, so generating before they exist produces
 * something that looks personalised and is not — which is worse than making
 * someone wait, because it cannot be told apart from the real thing.
 *
 * ─── THE ESCAPE IS A REVERT, NOT A SKIP ──────────────────────────────
 *
 * Vishal, 2026-09-01: "give the user an option to skip upgrade, and they can
 * go back to their existing plan."
 *
 * That is the right shape and it is worth being explicit about why. A plain
 * "later" would leave a patient holding a plan whose requirements they have
 * not met, with no plan to show — the worst of both, and a state nothing else
 * in the system knows how to resolve. Reverting puts them back somewhere
 * coherent: their old plan, whose assessments they already did, generating
 * exactly as it did before.
 *
 * It only renders when there IS somewhere to go back to. A first-ever choice
 * has no previous plan, and a button that fails when pressed is worse than an
 * absent one.
 *
 * ─── ONE AT A TIME ───────────────────────────────────────────────────
 *
 * The stepper takes a single instrument and returns here, so the gate re-reads
 * and offers the next. A list of four launchers would let someone start the
 * third, abandon it, and lose their place; a queue of one has no place to lose.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / ScrollView / ActivityIndicator only — all already
 * on this surface. No new primitive on a cold-mount screen.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { switchToPlan } from '@/services/api/patient-plans';
import { serverMessage } from '@/lib/server-message';

export function PlanAssessmentGate({
  remaining,
  completedCount,
  totalCount,
  previousPlanKey,
}: {
  remaining: string[];
  completedCount: number;
  totalCount: number;
  previousPlanKey: string | null;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const queryClient = useQueryClient();
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = remaining[0] ?? null;

  async function onRevert() {
    if (!previousPlanKey || reverting) return;
    setReverting(true);
    setError(null);
    try {
      await switchToPlan(previousPlanKey);
      // Both change: the plan you hold, and what it requires of you.
      await queryClient.invalidateQueries({ queryKey: ['patient-plans'] });
      await queryClient.invalidateQueries({ queryKey: ['health-plan-assignments'] });
    } catch (err) {
      setError(serverMessage(err, 'Could not go back to your previous plan. Please try again.'));
    } finally {
      setReverting(false);
    }
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="plan-assessment-gate"
      >
        <View style={[styles.icon, { backgroundColor: (colors.tint as string) + '1F' }]}>
          <MaterialIcons name="assignment" size={getScaledFontSize(26)} color={colors.tint} />
        </View>

        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as never },
          ]}
        >
          A few questions first
        </Text>
        <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Your plan builds itself from your answers, so we need these before there is a plan to
          show you. They are saved as you go.
        </Text>

        {/* The count is the point: without it "a few" is unbounded, and an
            unbounded questionnaire is the thing people abandon. */}
        {totalCount > 0 ? (
          <Text
            style={[
              styles.progress,
              { color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as never },
            ]}
          >
            {`${String(completedCount)} of ${String(totalCount)} complete`}
          </Text>
        ) : null}

        {next ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/Home/assessment-stepper',
                params: { instrumentId: next, returnTo: '/Home/care-plan-plus' },
              } as never)
            }
            accessibilityRole="button"
            accessibilityLabel={completedCount > 0 ? 'Continue your assessments' : 'Start your assessments'}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryText, { fontSize: getScaledFontSize(15) }]}>
              {completedCount > 0 ? 'Continue' : 'Start'}
            </Text>
          </Pressable>
        ) : null}

        {/* COS-813 — the revert. Only when there is somewhere to revert TO. */}
        {previousPlanKey ? (
          <Pressable
            onPress={() => void onRevert()}
            disabled={reverting}
            accessibilityRole="button"
            accessibilityLabel="Skip these and go back to your previous plan"
            accessibilityHint="Returns you to the plan you had before, which is ready to use"
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.border ?? '#E0E0E0', opacity: pressed || reverting ? 0.7 : 1 },
            ]}
          >
            {reverting ? (
              <ActivityIndicator color={colors.tint} />
            ) : (
              <Text style={[styles.secondaryText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                Skip — go back to my previous plan
              </Text>
            )}
          </Pressable>
        ) : null}

        {error !== null ? (
          <Text style={[styles.error, { fontSize: getScaledFontSize(13) }]}>{error}</Text>
        ) : null}
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 40 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 18 },
  body: { marginTop: 8, lineHeight: 21 },
  progress: { marginTop: 16 },
  primary: { marginTop: 22, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  secondary: { marginTop: 12, borderWidth: 1, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  error: { color: '#B91C1C', marginTop: 14, lineHeight: 19 },
});
