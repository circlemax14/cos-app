/**
 * COS-829 — a plan with no check-ins has no care plan to show.
 *
 * Vishal, repeatedly: "whenever we are on a plan, the first thing is we need
 * to take the health check-ins... if there are no health check-ins, then I
 * should be given the option that you can switch your plan."
 *
 * The care plan is GENERATED FROM check-in answers. A plan that asks for none
 * has no inputs, so whatever is on screen came from somewhere else — a
 * previous plan, an old ingestion — and presenting it as this plan's is the
 * thing that has made every plan look the same. Showing nothing and offering
 * a way forward is the honest state.
 *
 * ─── ONLY WHEN THE PLAN SAID SO ──────────────────────────────────────
 *
 * An empty assigned set also happens on the old tier path, where it means "no
 * care team has assigned anything yet" — wait, not switch. This screen is for
 * `assignedSource === 'plan'` only; the other case keeps its existing empty
 * state, because telling someone to change plans when a clinician simply has
 * not acted yet would be wrong and expensive.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export function PlanHasNoCheckIns({
  planName,
  onChoosePlan,
}: {
  planName: string | null;
  onChoosePlan: () => void;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.wrap} testID="plan-has-no-checkins">
        <View style={[styles.icon, { backgroundColor: (colors.tint as string) + '1F' }]}>
          <MaterialIcons name="assignment-late" size={getScaledFontSize(26)} color={colors.tint} />
        </View>

        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getScaledFontSize(21), fontWeight: getScaledFontWeight(700) as never },
          ]}
        >
          {planName ? `${planName} has no check-ins` : 'This plan has no check-ins'}
        </Text>
        <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Your care plan is built from your check-in answers, so there is nothing to
          build one from yet. Choosing a plan that includes check-ins will start it.
        </Text>

        <Pressable
          onPress={onChoosePlan}
          accessibilityRole="button"
          accessibilityLabel="Choose a different plan"
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryText, { fontSize: getScaledFontSize(15) }]}>
            Choose a different plan
          </Text>
        </Pressable>
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 6, textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 21 },
  primary: { marginTop: 18, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
});
