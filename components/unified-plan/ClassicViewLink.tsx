/**
 * Header affordances for the Phase 4 default-flip (COS-469).
 *
 * Two mirror-image icon buttons for the manual header rows on the
 * plan screens:
 *
 *   - `ClassicViewLink` — mounted in `app/Home/unified-plan.tsx`'s
 *     header, wrapped by the caller in a `useUnifiedPlanDefaultEnabled()`
 *     check. Navigates the user back to the legacy Care Plan
 *     (`/Home/health-plan`) OR biopsychosocial plan via `router.replace`
 *     with `?classic=1`. Pre-flip the caller hides it (unified-plan is
 *     only reached via banner-push then, and the pushed stack already
 *     has a working back button).
 *
 *   - `TryUnifiedViewLink` — mounted in `health-plan.tsx` and
 *     `biopsychosocial-plan.tsx`'s manual header rows. Only visible
 *     when `useUnifiedPlanDefaultEnabled() === true`, so pre-flip
 *     users see no dead affordance and no visible UI change.
 *
 * The `?classic=1` search param is the stable bypass hook for any
 * future auto-forward-to-unified redirect (none today); classic
 * screens read it via `useLocalSearchParams` but currently take no
 * action on it — its presence just documents intent.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { useUnifiedPlanDefaultEnabled } from '@/hooks/use-unified-plan-default-flag';

type ClassicTarget = 'health-plan' | 'biopsychosocial-plan';

interface ClassicViewLinkProps {
  /** Which classic screen to push. Defaults to `health-plan`. */
  target?: ClassicTarget;
  /** Icon color — pass the theme's subtext or text token. */
  color: string;
  /** Font-scaled size in px. */
  size: number;
}

/**
 * Icon button that pushes the user from the unified plan to a classic
 * plan screen with `?classic=1`.
 */
export function ClassicViewLink({
  target = 'health-plan',
  color,
  size,
}: ClassicViewLinkProps): React.JSX.Element {
  const onPress = React.useCallback(() => {
    const pathname =
      target === 'biopsychosocial-plan'
        ? '/Home/biopsychosocial-plan'
        : '/Home/health-plan';
    // `router.replace` (not push) — the user is toggling between two peer
    // views of the same plan, not drilling into detail. `push` would grow
    // the stack every toggle and leave a bogus back-button trail on the
    // classic screen once they arrive.
    router.replace({ pathname, params: { classic: '1' } } as never);
  }, [target]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Classic view"
      hitSlop={12}
      style={styles.iconBtn}
      testID="classic-view-link"
    >
      {/* MaterialIcons directly — icon-symbol.tsx MAPPING doesn't include
          `rectangle.stack`, and existing plan-screen headers already use
          MaterialIcons directly (see unified-plan.tsx's back button). */}
      <MaterialIcons name="view-agenda" size={size} color={color} />
    </Pressable>
  );
}

interface TryUnifiedViewLinkProps {
  /** Icon color — pass the theme's tint token. */
  color: string;
  /** Font-scaled size in px. */
  size: number;
}

/**
 * Mirror-image icon button on classic screens that jumps back to the
 * unified plan. Gated on Phase 4's default flag being ON so it never
 * shows to pre-flip users — anyone who sees it just followed
 * `ClassicViewLink` from the unified plan.
 */
export function TryUnifiedViewLink({
  color,
  size,
}: TryUnifiedViewLinkProps): React.JSX.Element | null {
  const defaultFlagOn = useUnifiedPlanDefaultEnabled();
  if (!defaultFlagOn) return null;

  return (
    <Pressable
      onPress={() => router.push('/Home/unified-plan' as never)}
      accessibilityRole="button"
      accessibilityLabel="Try unified view"
      hitSlop={12}
      style={styles.iconBtn}
      testID="try-unified-view-link"
    >
      <MaterialIcons name="auto-awesome" size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    padding: 4,
  },
});
