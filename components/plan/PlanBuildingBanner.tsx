/**
 * COS-822 — "your plan is being built", instead of somebody else's plan.
 *
 * Switching plans marks a rebuild as owed and the build is a Bedrock call
 * taking tens of seconds. The old behaviour showed the previous plan's content
 * throughout — not a spinner, not stale-looking, just a complete and confident
 * care plan for a plan the patient no longer held. Vishal read test-plan-1's
 * assessments while on Advanced and reasonably concluded the switch had failed.
 *
 * Blocking is the point. A banner ABOVE the old plan would leave the wrong
 * goals and the wrong tasks tappable underneath it, and a patient acting on
 * them would be acting on a plan that is about to be replaced.
 *
 * It polls rather than waiting to be told: there is no push for this, the
 * window is short, and a screen that needs a manual refresh to leave is worse
 * than one that costs a few requests.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export function PlanBuildingBanner(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <AppWrapper>
      <View style={styles.wrap} testID="plan-building-banner">
        <ActivityIndicator size="large" color={colors.tint} />
        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never },
          ]}
        >
          Building your plan
        </Text>
        <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          You changed plans, so we are rebuilding your care plan around what the new
          one covers. This usually takes under a minute.
        </Text>
        {/* Says why they cannot simply carry on. Without it, a blocked screen
            reads as the app being stuck rather than as a deliberate wait. */}
        <Text style={[styles.note, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          Your previous plan is not shown here because it was built for a different
          plan — the goals and tasks in it are about to change.
        </Text>
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { marginTop: 6, textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 21 },
  note: { textAlign: 'center', lineHeight: 19, opacity: 0.85, marginTop: 4 },
});
