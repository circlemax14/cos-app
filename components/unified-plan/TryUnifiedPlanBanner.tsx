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
  // COS-475b — when v2 is ON, banner invites into a NEW screen even if
  // the user opened v1 during Phase 2. Bypass EVER_VISITED. 7-day
  // dismiss window still applies.
  const planScreenV2 = usePlanScreenV2Enabled();

  // `undefined` = not yet resolved (avoid flash). Once resolved becomes
  // true/false and drives the visible/dismissed decision.
  const [dismissed, setDismissed] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // COS-475b — when v2 flag is on, show the banner unconditionally so
    // Ken can reach the chunked v2 shell regardless of prior EVER_VISITED
    // or DISMISS state left over from Phase 4 / today's OTA iterations.
    // Legacy path (v2 off) keeps the Phase 2 suppression semantics.
    if (planScreenV2) {
      setDismissed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [raw, everVisited] = await Promise.all([
          AsyncStorage.getItem(DISMISS_KEY),
          AsyncStorage.getItem(EVER_VISITED_KEY),
        ]);
        if (cancelled) return;
        if (everVisited) {
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
