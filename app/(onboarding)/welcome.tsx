import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { ConfettiBurst } from '@/components/onboarding/ConfettiBurst';
import { checkSession, markWelcomeSeen } from '@/services/auth';
import { useAccessibility } from '@/stores/accessibility-store';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * One-time welcome screen shown after the user has connected at least one
 * EHR. Waving hand animates on mount; tapping Continue flags
 * `hasSeenWelcome` on the server so the screen never fires again for that
 * account.
 */
export default function WelcomeScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { firstName: firstNameParam } = useLocalSearchParams<{ firstName?: string }>();
  const initialName = firstNameParam?.trim() || null;
  const [firstName, setFirstName] = useState<string | null>(initialName);
  const [continuing, setContinuing] = useState(false);

  const waveRotation = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(16);
  // The popper's own pop. Starts collapsed so it appears to fire, rather than
  // being present from the first frame the way the hand is.
  const popperScale = useSharedValue(0);
  const popperRotate = useSharedValue(-35);

  // Fallback: only fetch from the server if no name was passed via the
  // route param. This avoids the flash where "Hi!" renders first and then
  // swaps to "Hi, {firstName}!" once the async call resolves.
  useEffect(() => {
    if (initialName) return;
    (async () => {
      const res = await checkSession();
      setFirstName(res.user?.firstName?.trim() || null);
    })();
  }, [initialName]);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) });
    contentTranslate.value = withTiming(0, { duration: 550, easing: Easing.out(Easing.quad) });

    // Wave: rotate back and forth 3 times, then rest briefly, then repeat.
    waveRotation.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(-18, { duration: 180 }),
          withTiming(14, { duration: 180 }),
          withTiming(-18, { duration: 180 }),
          withTiming(14, { duration: 180 }),
          withTiming(0, { duration: 180 }),
          withTiming(0, { duration: 1200 }),
        ),
        -1,
      ),
    );

    // Popper fires just after the content has settled, and lands slightly
    // over-scaled before easing back — the small overshoot is what sells it
    // as a pop rather than a fade-in.
    popperScale.value = withDelay(
      260,
      withSequence(
        withTiming(1.25, { duration: 220, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      ),
    );
    popperRotate.value = withDelay(260, withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) }));
  }, [contentOpacity, contentTranslate, waveRotation, popperScale, popperRotate]);

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${waveRotation.value}deg` }],
  }));

  const popperStyle = useAnimatedStyle(() => ({
    opacity: popperScale.value === 0 ? 0 : 1,
    transform: [
      { scale: popperScale.value },
      { rotate: `${popperRotate.value}deg` },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));

  const handleContinue = useCallback(async () => {
    if (continuing) return;
    setContinuing(true);
    await markWelcomeSeen();
    router.replace('/Home' as never);
  }, [continuing]);

  const tintSoft = colors.primary + '1A';
  const tintSofter = colors.primary + '0F';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Decorative soft blobs */}
      <View
        pointerEvents="none"
        style={[styles.blobTopRight, { backgroundColor: tintSoft }]}
      />
      <View
        pointerEvents="none"
        style={[styles.blobBottomLeft, { backgroundColor: tintSofter }]}
      />

      {/* Fires once behind the hero. Self-suppresses under Reduce Motion. */}
      <ConfettiBurst />

      <Animated.View style={[styles.hero, contentStyle]}>
        {/* Waving hand in a soft circle — unchanged; the popper joins it
            rather than replacing it, per "along with existing design". */}
        <View style={[styles.handCircle, { backgroundColor: tintSoft }]}>
          <Animated.Text
            style={[
              styles.handEmoji,
              waveStyle,
              { fontSize: getScaledFontSize(84) },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            👋
          </Animated.Text>

          {/* Party popper, tucked on the circle's shoulder so it reads as
              going off beside the wave instead of competing with it. */}
          <Animated.Text
            style={[
              styles.popperEmoji,
              popperStyle,
              { fontSize: getScaledFontSize(40) },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            🎉
          </Animated.Text>
        </View>

        <Text
          style={[
            styles.eyebrow,
            {
              color: colors.primary,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as '600',
            },
          ]}
        >
          WELCOME
        </Text>

        <Text
          style={[
            styles.greeting,
            {
              color: colors.text,
              fontSize: getScaledFontSize(34),
              fontWeight: getScaledFontWeight(700) as '700',
            },
          ]}
        >
          {firstName ? `Hi, ${firstName}!` : 'Hi!'}
        </Text>

        <Text
          style={[
            styles.subtitle,
            {
              color: colors.subtext,
              fontSize: getScaledFontSize(16),
              lineHeight: getScaledFontSize(24),
            },
          ]}
        >
          Your health records, medications, and appointments — all in one
          secure place. Let&apos;s get started on your care journey.
        </Text>
      </Animated.View>

      <Animated.View style={contentStyle}>
        <Pressable
          onPress={handleContinue}
          disabled={continuing}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Continue to home"
        >
          {continuing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as '600',
                },
              ]}
            >
              Let&apos;s Go
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 56,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  blobTopRight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -140,
    right: -100,
  },
  blobBottomLeft: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    bottom: -100,
    left: -80,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  handCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  popperEmoji: {
    position: 'absolute',
    // Upper-right shoulder of the circle. Outside the fill so it reads as
    // going off beside the wave rather than sharing its space.
    top: -6,
    right: -10,
  },
  handEmoji: {
    // Shift the anchor point so the wave pivots around the wrist, not the center.
    textAlign: 'center',
  },
  eyebrow: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  greeting: {
    textAlign: 'center',
    marginTop: -4,
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: 8,
    marginTop: 6,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
  },
});
