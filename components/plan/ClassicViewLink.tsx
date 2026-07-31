/**
 * ADR-0005 P0 — "Classic view" bottom-anchored link.
 *
 * Ken's Q1 DECIDED shape: a small text link at the bottom of the new
 * BPS-Plan surface that lets a user reach the retired classic Plan
 * (Health Summary) tab during the ADR-0005 transition window. This is
 * the escape hatch while `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` is ON — the
 * classic Plan surface still exists in the tab bar as its own tab
 * (`/Home/plan`), but users who now land on BPS in the Care Plan slot
 * need a discoverable way to jump back to what they knew before.
 *
 * Self-gates on `isTabSwapBpsEnabled()` — returns null when the flag is
 * OFF so no dead affordance ever appears on the legacy render path. When
 * the flag flips back off (rollback), this component is inert on any
 * surface it happens to be mounted on.
 *
 * iOS 26.5 primitive envelope (see project_ios26_biopsychosocial_parked.md):
 *   - View + Text + Pressable only.
 *   - NO ActivityIndicator, NO Portal, NO Animated, NO Modal, NO gradient,
 *     NO MaterialIcons (this component is text-only per Q1).
 *   - No async work on press — one synchronous `router.push` call.
 *
 * Navigation target: `/Home/plan?classic=1`. `/Home/plan` is the retired
 * classic Plan (Health Summary) tab. The `?classic=1` param mirrors the
 * bypass-hook pattern from `components/unified-plan/ClassicViewLink.tsx`
 * (COS-469 Phase 4) and documents that the user arrived here via the
 * classic-view escape hatch — reserved for future auto-forward logic,
 * consumed by no reader today.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { isTabSwapBpsEnabled } from '@/hooks/use-tab-swap-bps-flag';

interface ClassicViewLinkProps {
  /**
   * Optional override for the press handler. Left unspecified in the
   * P0 mount so the component owns its target — override is provided
   * only for tests and future call sites that need a different
   * destination without touching this file.
   */
  onPress?: () => void;
}

/**
 * Small bottom-anchored "Classic view" text link. Renders null when the
 * tab-swap flag is OFF so it stays invisible on the legacy Care Plan
 * render path (see health-plan.tsx flag-off branch).
 */
export function ClassicViewLink({
  onPress,
}: ClassicViewLinkProps = {}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  if (!isTabSwapBpsEnabled()) return null;

  const handlePress = React.useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    // `push` (not replace) — the user is opting into a peer view, and
    // wants a working back-affordance to return to BPS. Matches how the
    // legacy `TryUnifiedViewLink` navigates.
    router.push({ pathname: '/Home/plan', params: { classic: '1' } } as never);
  }, [onPress]);

  return (
    <View style={styles.wrap} testID="classic-view-link-wrap">
      <Pressable
        onPress={handlePress}
        accessibilityRole="link"
        accessibilityLabel="Classic view"
        accessibilityHint="Opens the previous Plan surface"
        hitSlop={12}
        style={({ pressed }) => [
          styles.press,
          { opacity: pressed ? 0.6 : 1 },
        ]}
        testID="classic-view-link"
      >
        <Text
          style={{
            color: colors.tint,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(600) as any,
            textAlign: 'center',
          }}
        >
          Classic view
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  press: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
});
