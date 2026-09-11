import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';

/**
 * COS-984 — the "we're rebuilding your summary" banner nobody ever saw.
 *
 * COS-855 built this: a plan switch (and four other activities) enqueues a
 * summary rebuild, and without a banner the patient reads content built for
 * the plan they just left, with nothing on screen saying so, until it silently
 * changes underneath them.
 *
 * It was built inside components/HealthSummaryCard.tsx — which has ZERO
 * importers, on any branch including main. So it has never rendered for
 * anybody. Meanwhile hooks/use-health-summary.ts polls every 5 seconds while
 * `rebuilding === true`, which is the cost of the feature with none of the
 * benefit: we pay for the poll and the patient still gets no feedback.
 *
 * Lifted onto the screen that actually mounts. The behaviour COS-855 argued
 * for is preserved exactly, including the part that is easy to get wrong:
 *
 * ─── IT SITS ABOVE THE CONTENT, NEVER INSTEAD OF IT ──────────────────
 *
 * The care-plan flow replaces its whole screen while regenerating, because
 * behind it sits a plan built for the tier the patient just left and its goals
 * are TAPPABLE — acting on the wrong ones is a real harm. A health status page
 * is read-only prose: what is on screen is still true, just about to be
 * superseded. Hiding it would remove something useful in order to say nothing
 * new.
 *
 * `summary.rebuilding === true` explicitly, not truthiness: the backend field
 * is additive, and a bundle pointed at an older API must behave exactly as
 * before rather than render a permanent banner.
 *
 * iOS 26 envelope (cos-app/CLAUDE.md): a plain `{cond && <View/>}` gate using
 * primitives this file imports directly, no new wrapper components.
 */
function RebuildingBanner() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: summary } = useHealthSummary();

  if (summary?.rebuilding !== true) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="alert"
      accessibilityLabel="We are updating your health status. The information below is still current until it finishes."
      testID="health-status-rebuilding-banner"
    >
      <ActivityIndicator size="small" color={colors.tint as string} />
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(14),
          flex: 1,
          lineHeight: getScaledFontSize(14) * 1.4,
        }}
      >
        We&apos;re updating your health status. What&apos;s below is still current until it
        finishes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
});

export default RebuildingBanner;
