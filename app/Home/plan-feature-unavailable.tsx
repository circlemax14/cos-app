/**
 * COS-917 — where a blocked screen sends you, instead of silently Home.
 *
 * ─── THE BEHAVIOUR THIS REPLACES ─────────────────────────────────────
 *
 * useEnforceScreenAccess redirects any route the patient's plan does not
 * include. That guard is correct and must stay — COS-859 added it because the
 * ~55 push-only screens were reachable regardless of plan. What was wrong is
 * where it sent them: `router.replace('/Home')`, with no message.
 *
 * From the patient's side that is a button that does nothing, or worse, throws
 * them somewhere else. Vishal hit it three times in one session — the plan
 * pill, "view progress", and "Choose a different plan" — and each time the
 * report was the same: "when I click on it, nothing is happening" / "it is
 * taking me to the home screen. I don't know what is happening."
 *
 * A scan found 33 navigation targets the enforcer can bounce. Patching 33 call
 * sites would be the wrong altitude and would miss the 34th. One destination
 * that explains itself covers all of them, including the ones added later.
 *
 * ─── THIS SCREEN MUST NEVER BE GATED ─────────────────────────────────
 *
 * Its route name is deliberately absent from the entitlements catalog and from
 * ROUTE_ALIASES, so `canShow('plan-feature-unavailable')` falls through to the
 * `?? true` default. If it were ever gated, the enforcer would bounce the
 * patient off the screen explaining the bounce — a redirect loop. The hook
 * also skips it by name, belt and braces.
 *
 * iOS 26 envelope: View / Text / Pressable / ScrollView / MaterialIcons only.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useCanShowScreen } from '@/hooks/use-feature-permissions';

export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Plain names for the routes a patient is most likely to be bounced off.
 *
 * A route we have no name for still works — the copy falls back to "this
 * feature" — because a missing entry must never be the reason someone is
 * stuck. This is a courtesy, not a lookup the screen depends on.
 */
const ROUTE_NAMES: Record<string, string> = {
  plans: 'Plans and billing',
  billing: 'Billing',
  'billing-checkout': 'Checkout',
  'health-plan': 'Care plan',
  'care-plan-plus': 'Plan',
  'biopsychosocial-plan': 'Care plan',
  'health-trends': 'Health trends',
  'health-age': 'Health age',
  'daily-read': 'Daily read',
  'apple-health': 'Health Sync',
  appointments: 'Appointments',
  medications: 'Medications',
  habits: 'Habits',
  reports: 'Reports',
  'wellbeing-map': 'Wellbeing map',
  'assessments-catalog': 'Check-ins',
  'connect-clinics': 'Connect a clinic',
  'reminder-settings': 'Reminders',
  nudges: 'Nudges',
};

export default function PlanFeatureUnavailableScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ route?: string }>();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const canShowScreen = useCanShowScreen();

  const route = String(params.route ?? '');
  const name = ROUTE_NAMES[route] ?? 'This feature';

  /*
   * Only offer the plans screen if the patient can actually open it. Sending
   * them from one bounce to another is the bug this screen exists to end —
   * and a plan that grants no `billing.view` is exactly how Vishal got here.
   */
  const canSeePlans = canShowScreen('plans');

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.wrap} testID="plan-feature-unavailable">
        <View style={[styles.icon, { backgroundColor: (colors.tint as string) + '1F' }]}>
          <MaterialIcons name="lock-outline" size={getScaledFontSize(26)} color={colors.tint} />
        </View>

        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(21),
              fontWeight: getScaledFontWeight(700) as never,
            },
          ]}
        >
          {name} isn&apos;t part of your plan
        </Text>

        <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          {canSeePlans
            ? 'Your current plan does not include it. Another plan may — you can compare them and change at any time.'
            : 'Your current plan does not include it. Your care team can move you to a plan that does.'}
        </Text>

        {canSeePlans && (
          <Pressable
            onPress={() => router.replace('/Home/plans' as never)}
            accessibilityRole="button"
            accessibilityLabel="See plans"
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryText, { fontSize: getScaledFontSize(15) }]}>See plans</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.replace('/Home' as never)}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          style={styles.secondary}
        >
          <Text
            style={{
              color: colors.tint,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as never,
            }}
          >
            Back to home
          </Text>
        </Pressable>
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 21 },
  primary: {
    marginTop: 8,
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 26,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '600' },
  secondary: { marginTop: 2, paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
});
