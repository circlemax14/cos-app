/**
 * BpsWelcomeBanner (COS-449, SCRUM-586).
 *
 * Chunk 1b of the BPS plan enhancements. One-time dismissible welcome
 * banner that appears at the top of the BiopsychosocialPlanScreen the
 * first time a user lands there after this ships. Explains the BPS
 * organization without over-claiming (there is no server-side data
 * migration; legacy and BPS are peer AI plans — the banner is purely a
 * user-education surface).
 *
 * Dismissal is persisted device-local via AsyncStorage (same pattern
 * MedicationsReviewPrompt uses for its snooze key). Once dismissed, the
 * banner renders null forever — bumping the storage key version below
 * (v1 → v2, etc.) is how we bring it back for a future re-education.
 *
 * OTA-safe (pure JS, no native fingerprint change). Non-breaking additive.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';

/**
 * Device-local storage key for the banner's dismissal state. Bump the
 * version suffix (v1 → v2 → …) when the copy changes materially enough
 * that we want to re-surface the banner to previously-dismissed users.
 */
export const BPS_WELCOME_BANNER_DISMISSED_KEY = 'bps_welcome_banner_dismissed_v1';

type ColorMap = Record<string, string>;

export interface BpsWelcomeBannerProps {
  colors: ColorMap;
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
}

const bannerElevation = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
  },
  android: { elevation: 2 },
  default: {},
}) as object;

function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

export function BpsWelcomeBanner(props: BpsWelcomeBannerProps): React.JSX.Element | null {
  const { colors, isDark, getScaledFontSize, getScaledFontWeight } = props;

  // Three-state: null (not yet read from storage — don't render),
  // false (never dismissed → show), true (dismissed → hide forever).
  const [dismissed, setDismissed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BPS_WELCOME_BANNER_DISMISSED_KEY);
        if (alive) setDismissed(raw === 'true');
      } catch {
        if (alive) setDismissed(false); // treat storage error as "show"
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persistDismissal = React.useCallback(() => {
    setDismissed(true); // optimistic; storage write is fire-and-forget
    AsyncStorage.setItem(BPS_WELCOME_BANNER_DISMISSED_KEY, 'true').catch(() => {
      // Storage failure is non-fatal — banner will just reappear next mount.
    });
  }, []);

  // Suppress the pre-storage flash — wait until the async read resolves.
  if (dismissed !== false) return null;

  const tint = (colors.tint as string) ?? '#0D9488';

  return (
    <View
      style={[
        styles.banner,
        bannerElevation,
        {
          backgroundColor: alpha(tint, isDark ? '22' : '14'),
          borderColor: alpha(tint, '33'),
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Welcome to your biopsychosocial plan"
    >
      <View style={[styles.iconChip, { backgroundColor: alpha(tint, '22') }]}>
        <MaterialIcons name="auto-awesome" size={getScaledFontSize(22)} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(700) as any,
            lineHeight: 20,
          }}
        >
          Welcome to your biopsychosocial plan
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            marginTop: 3,
            lineHeight: 18,
          }}
        >
          Same goals you know, plus a richer view of your body, mind, and social &amp; spiritual wellbeing.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={persistDismissal}
            accessibilityRole="button"
            accessibilityLabel="Take a look at your biopsychosocial plan"
            style={{
              backgroundColor: tint,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: Radii.md,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: getScaledFontSize(13), fontWeight: '700' }}>
              Take a look
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={persistDismissal}
            accessibilityRole="button"
            accessibilityLabel="Dismiss the welcome banner"
            style={{
              backgroundColor: 'transparent',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: Radii.md,
            }}
          >
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
              Not now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <Pressable
        onPress={persistDismissal}
        accessibilityRole="button"
        accessibilityLabel="Close welcome banner"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ padding: 2 }}
      >
        <MaterialIcons name="close" size={18} color={colors.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.xl,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
