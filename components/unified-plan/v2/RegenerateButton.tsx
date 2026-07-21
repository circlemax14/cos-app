/**
 * RegenerateButton — CHUNK 34 (2026-07-21).
 *
 * Purely-presentational 40x40 circular hairline button that mirrors the
 * legacy header refresh affordance in app/Home/health-plan.tsx (~line 923-932)
 * and its BPS twin. Tap → parent's handleGenerate(true) → force regeneration
 * of the unified plan.
 *
 * Parent (PlanScreenV2) owns:
 *   - The `disabled` decision (isGeneratingFromAnySource || !data). This
 *     mirrors legacy's `disabled={generating || !canGeneratePlan}` shape
 *     but swaps canGeneratePlan for a data-presence guard until chunk 35
 *     adds the assessments-complete gate.
 *   - The `isGenerating` display state — union of the local `generating`
 *     tap flag AND the server-truth `refreshInFlight` field so a
 *     regeneration kicked off on ANOTHER device also shows the spinner.
 *
 * BELT-AND-SUSPENDERS: onPress body starts with `if (disabled) return;` in
 * addition to the RN Pressable `disabled` prop. Same pattern as chunk 26's
 * CachedPlanBanner handlePress (line 51-54). RN Pressable can occasionally
 * deliver a tap during the ~1 frame between prop write and native accept.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY:
 *   View · Pressable · MaterialIcons · ActivityIndicator · StyleSheet
 * Explicitly avoided (all forbidden per crash rules):
 *   useState · useEffect · useRef · AsyncStorage · setTimeout · setInterval
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · expo-symbols (Portal-crash source) · axios
 *
 * ZERO internal state — all render decisions come from props. Same
 * discipline as CachedPlanBanner and PlanTierPill.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export interface RegenerateButtonProps {
  onPress: () => void;
  disabled: boolean;
  isGenerating: boolean;
}

export function RegenerateButton({
  onPress,
  disabled,
  isGenerating,
}: RegenerateButtonProps): React.JSX.Element {
  const { settings } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const handlePress = React.useCallback(() => {
    if (disabled) return;
    onPress();
  }, [disabled, onPress]);

  return (
    <View>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={isGenerating ? 'Regenerating plan' : 'Regenerate plan'}
        accessibilityState={{ disabled, busy: isGenerating }}
        style={({ pressed }) => [
          styles.btn,
          {
            borderColor: colors.border,
            backgroundColor: (colors.card as string) + 'D9',
            opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          },
        ]}
      >
        {isGenerating ? (
          <ActivityIndicator color={colors.tint} size="small" />
        ) : (
          <MaterialIcons name="refresh" size={18} color={colors.subtext} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
