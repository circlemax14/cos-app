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
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/*
 * COS-846 — the wait is BOUNDED now.
 *
 * `planRegenPending` has exactly one clearer, and it is skipped when the
 * patient has no FHIR id (assessment-completion-trigger.service.ts:107-113)
 * and when generation throws (swallowed at :126-130). Both leave the flag set
 * forever. This screen was a full-screen spinner with no timeout, no error
 * state, no retry and no exit — so those two cases stranded the patient on it
 * permanently with nothing to press.
 *
 * A spinner that cannot end is worse than an honest failure. After the wait
 * this admits it has taken too long and offers the way out.
 */
const PATIENCE_MS = 90_000;

export function PlanBuildingBanner({ onChoosePlan }: { onChoosePlan?: () => void }): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setTooLong(true); }, PATIENCE_MS);
    return () => { clearTimeout(t); };
  }, []);

  if (tooLong) {
    return (
      <AppWrapper>
        <View style={styles.wrap} testID="plan-building-stalled">
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as never },
            ]}
          >
            This is taking longer than it should
          </Text>
          <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Your plan has not finished rebuilding. Nothing you did caused this and
            nothing has been lost — your answers are saved.
          </Text>
          {onChoosePlan && (
            <Pressable
              onPress={onChoosePlan}
              accessibilityRole="button"
              testID="plan-building-choose"
              style={[styles.action, { borderColor: colors.tint }]}
            >
              <Text style={[styles.actionText, { color: colors.tint, fontSize: getScaledFontSize(15) }]}>
                Choose a different plan
              </Text>
            </Pressable>
          )}
        </View>
      </AppWrapper>
    );
  }

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
  action: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20, marginTop: 6 },
  actionText: { fontWeight: '600' },
  title: { marginTop: 6, textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 21 },
  note: { textAlign: 'center', lineHeight: 19, opacity: 0.85, marginTop: 4 },
});
