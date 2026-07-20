/**
 * TryUnifiedPlanBanner (COS-467, Phase 2) — opt-in peer CTA that
 * surfaces the new unified BPS plan view from the legacy Care Plan and
 * Biopsychosocial tabs. Phase 2 goal is peer-only: no default route
 * change, no existing tab retired. Users can dismiss the banner for 7
 * days; storage key namespaced to survive future variants.
 *
 * Renders `null` when:
 *   - `useUnifiedPlan().disabled === true` (BE flag off — no dead CTA).
 *   - The AsyncStorage read hasn't resolved yet (first render, one tick).
 *   - The user dismissed the banner within the last 7 days.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { usePlanScreenV2Enabled } from '@/hooks/use-plan-screen-v2-flag';
import {
  DISMISS_KEY,
  DISMISS_WINDOW_MS,
  EVER_VISITED_KEY,
  isBannerDismissed,
} from '@/lib/unified-plan-banner';

// Re-export for downstream tests / callers that want to reach the pure
// logic through this module.
export { DISMISS_KEY, DISMISS_WINDOW_MS, EVER_VISITED_KEY, isBannerDismissed };

const UNIFIED_ROUTE = '/Home/unified-plan';

export interface TryUnifiedPlanBannerProps {
  /** Analytics attribution — the tab this banner is mounted on. */
  source: 'care-plan' | 'bps';
}

function alpha(hex: string, hh: string): string {
  return hex.length === 7 && hex.startsWith('#') ? hex + hh : hex;
}

export function TryUnifiedPlanBanner({
  source,
}: TryUnifiedPlanBannerProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { disabled } = useUnifiedPlan();
  // COS-475 / Phase 6.4 — when v2 is ON, the banner is inviting the user
  // to a NEW screen even if they visited the legacy v1 during Phase 2.
  // Bypass the EVER_VISITED suppression so v2 is discoverable. The 7-day
  // dismissal window still applies so users who tap dismiss still get quiet.
  const planScreenV2 = usePlanScreenV2Enabled();

  // `undefined` = not yet resolved (avoid flash). Once resolved becomes
  // true/false and drives the visible/dismissed decision. Suppression has
  // two independent sources: the 7-day dismissal window OR a permanent
  // "user has already opened the unified plan once" flag (Phase 2 opt-in
  // memory — bypassed when v2 is enabled, see COS-475 comment above).
  const [dismissed, setDismissed] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, everVisited] = await Promise.all([
          AsyncStorage.getItem(DISMISS_KEY),
          AsyncStorage.getItem(EVER_VISITED_KEY),
        ]);
        if (cancelled) return;
        if (everVisited && !planScreenV2) {
          setDismissed(true);
          return;
        }
        setDismissed(isBannerDismissed(raw, Date.now()));
      } catch {
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planScreenV2]);

  const onDismiss = React.useCallback(() => {
    setDismissed(true);
    // Fire-and-forget — failing to persist just means the banner shows
    // again on next launch; not worth blocking UI.
    AsyncStorage.setItem(DISMISS_KEY, String(Date.now())).catch(() => {});
  }, []);

  const onOpen = React.useCallback(() => {
    router.push(UNIFIED_ROUTE as never);
  }, []);

  if (disabled) return null;
  if (dismissed === undefined) return null; // first-render tick, no flash
  if (dismissed) return null;

  const accent = colors.tint;
  const bgAlpha = settings.isDarkTheme ? '2E' : '1A';
  const isDark = settings.isDarkTheme;
  void source; // reserved for analytics attribution

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: alpha(accent, bgAlpha),
          borderColor: accent,
        },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: alpha(accent, isDark ? '3D' : '26') }]}>
        <MaterialIcons name="auto-awesome" size={getScaledFontSize(18)} color={accent} />
      </View>
      <View style={styles.body}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
          }}
          numberOfLines={2}
        >
          Try the unified plan view
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
            lineHeight: 16,
          }}
          numberOfLines={3}
        >
          Everything from your Care Plan, organized by biopsychosocial.
        </Text>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open unified plan view"
          testID="try-unified-plan-banner-cta"
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Open unified view
          </Text>
          <MaterialIcons
            name="arrow-forward"
            size={getScaledFontSize(14)}
            color="#FFFFFF"
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss unified plan banner"
        hitSlop={12}
        style={styles.dismiss}
      >
        <MaterialIcons name="close" size={getScaledFontSize(18)} color={colors.subtext} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: Spacing.sm,
  },
  dismiss: {
    marginLeft: Spacing.sm,
    padding: 2,
  },
});
