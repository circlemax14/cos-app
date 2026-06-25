import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import {
  verifyPin,
  isBiometricEnabled,
  incrementFailedAttempts,
  resetFailedAttempts,
  clearPinData,
} from '@/services/pin-auth';
import { useSecurity } from '@/stores/security-store';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';
import { PRE_LOCK_ROUTE_KEY } from '@/hooks/use-app-lock';
import { consumePendingSignIn, SignInReason, setAppLocked } from '@/lib/lock-gate';
import { resolveUnlockAction, LOCAL_FIRST_UNLOCK } from '@/lib/unlock-decision';
import { checkSession } from '@/services/auth';
import { clearTokens } from '@/lib/auth-tokens';
import { prefetchAfterAuth } from '@/services/auth-prefetch';

/**
 * Resolve the route to land on after a successful unlock. Defaults to
 * /Home, but if useAppLock captured a pre-lock path we restore that so
 * the user lands back where they were (Calendar, Reports, etc.) instead
 * of always bouncing to the Home tab.
 */
async function resumeAfterUnlock() {
  let target = '/Home';
  try {
    const saved = await AsyncStorage.getItem(PRE_LOCK_ROUTE_KEY);
    if (saved && saved.startsWith('/')) target = saved;
    await AsyncStorage.removeItem(PRE_LOCK_ROUTE_KEY);
  } catch {
    // Best-effort; fall through to /Home.
  }
  router.replace(target as never);
}

/**
 * SCRUM-279 (build 44): friendly copy for the deferred-sign-in alert.
 * The user just entered their PIN correctly; if we have to send them
 * to sign-in anyway because the backend session is gone, tell them
 * why instead of silently bouncing.
 */
function describeSignInReason(reason: SignInReason): { title: string; message: string } {
  switch (reason) {
    case 'session_expired':
    case 'refresh_failed':
    case 'splash_revalidate_failed':
      return {
        title: 'Session expired',
        message:
          'For your security, your session has expired and we need you to sign in again with your password.',
      };
    case 'manual_sign_out':
      return {
        title: 'Signed out',
        message: 'Please sign in to continue.',
      };
    case 'splash_no_session':
      return {
        title: 'Sign in required',
        message: 'Please sign in to continue.',
      };
    case 'unrecoverable':
    default:
      return {
        title: 'Sign in required',
        message: 'Something went wrong and we need you to sign in again.',
      };
  }
}

const MAX_ATTEMPTS = 5;

/**
 * Lock screen redesign (SCRUM-236). Removes the heavy "card" chrome
 * and lets the elements float over an ambient backdrop: two soft
 * colored blobs faked with absolute-positioned circles (no
 * expo-linear-gradient dep), a halo-ringed lock icon with a slow
 * breathing pulse so the screen feels alive, a confident title, the
 * existing PIN dots + number pad. Behavior is identical to the
 * previous version — only the visual treatment changes.
 */
export default function LockScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const isDark = settings.isDarkTheme;
  const colors = getColors(isDark);
  const { setIsLocked } = useSecurity();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  // SCRUM-279 (build 45): Ken reported "after PIN entry I'm staring at
  // the same screen for a few seconds — nothing happening, then home".
  // postUnlockNavigate calls checkSession (network round-trip) and that
  // wait is invisible. unlocking=true draws a full-screen overlay with
  // a spinner and "Unlocking…" copy so it's obvious work is happening.
  const [unlocking, setUnlocking] = useState(false);

  // Ambient halo pulse around the lock icon — scale + opacity loop.
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [halo]);

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const enabled = await isBiometricEnabled();
    if (enabled) {
      setShowBiometric(true);
      attemptBiometric();
    }
  };

  const attemptBiometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Circle Support Health',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    if (result.success) {
      await resetFailedAttempts();
      setIsLocked(false);
      await postUnlockNavigate();
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    setError(false);
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 6) {
      setTimeout(() => verifyAndUnlock(newPin), 200);
    }
  };

  /**
   * Post-unlock navigation (COS-351 — local-first unlock).
   *
   * A successful PIN/biometric proves DEVICE-LOCAL identity, so the unlock
   * must NOT block on a network round-trip. The old flow `await
   * checkSession()`d here: on a flaky network after resume that froze the
   * app behind the "Unlocking…" overlay (force-close territory), and ANY
   * non-200 — including a transient network error — wiped a still-valid
   * 30-day session and bounced the user to sign-in. See lib/unlock-decision.ts.
   *
   *   1. If a sign-in was already DEFERRED while locked (api-client's
   *      forceSignOut on a GENUINE auth rejection, or SplashGate) — that is a
   *      confirmed-dead session: wipe tokens, explain, route to sign-in.
   *      No PHI renders.
   *   2. Local-first (default): enter the app IMMEDIATELY on cached data —
   *      the same trust model SplashGate already uses for its optimistic
   *      cached-profile route — and revalidate in the background via prefetch.
   *      The api-client interceptor force-signs-out only on a GENUINE auth
   *      rejection, so a truly-dead session still bounces within ~1–2s while a
   *      transient error neither freezes nor signs the user out.
   *   3. Kill-switch OFF: legacy validate-then-enter (tolerating transient
   *      failures by letting the user in on cached data).
   *
   * `setAppLocked(false)` is called synchronously so that if the background
   * revalidation finds a genuinely-dead session, the interceptor's
   * requestSignIn routes to sign-in immediately instead of being deferred
   * again (and lost) because the module lock-mirror still read `true`.
   */
  const postUnlockNavigate = async () => {
    setAppLocked(false);

    const action = resolveUnlockAction({
      pendingReason: consumePendingSignIn(),
      localFirst: LOCAL_FIRST_UNLOCK,
    });

    // Confirmed-dead session (deferred while locked) — never show PHI.
    if (action.type === 'sign-in') {
      await clearTokens();
      const { title, message } = describeSignInReason(action.reason);
      Alert.alert(title, message, [
        { text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in' as never) },
      ]);
      return;
    }

    // Local-first: enter immediately on cached data; revalidate in background.
    if (action.type === 'enter-app') {
      prefetchAfterAuth();
      await resumeAfterUnlock();
      return;
    }

    // Legacy (kill-switch off): validate against the backend before entering.
    setUnlocking(true);
    try {
      try {
        const result = await checkSession();
        if (!result.authenticated || !result.user) {
          await clearTokens();
          setUnlocking(false);
          Alert.alert(
            'Session expired',
            'For your security, your session has expired and we need you to sign in again with your password.',
            [{ text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in' as never) }],
          );
          return;
        }
      } catch {
        // Network failure — let the user in (cached data only).
      }
      prefetchAfterAuth();
      await resumeAfterUnlock();
    } finally {
      setUnlocking(false);
    }
  };

  const verifyAndUnlock = async (enteredPin: string) => {
    const valid = await verifyPin(enteredPin);
    if (valid) {
      await resetFailedAttempts();
      setIsLocked(false);
      await postUnlockNavigate();
    } else {
      const attempts = await incrementFailedAttempts();
      const remaining = MAX_ATTEMPTS - attempts;
      setAttemptsLeft(remaining);
      setError(true);
      setPin('');

      if (remaining <= 0) {
        Alert.alert(
          'Too Many Attempts',
          'Please sign in again with your email and password.',
          [
            {
              text: 'Sign In',
              onPress: async () => {
                // SCRUM-279 (build 44) security: also wipe the backend
                // session tokens. Previously only PIN data was cleared,
                // so the old access/refresh tokens stayed in SecureStore.
                // If an attacker exhausted PIN attempts they could
                // theoretically still call APIs with the stale token
                // until expiry. Now we force a true fresh sign-in.
                await clearPinData();
                await clearTokens();
                setIsLocked(false);
                router.replace('/(auth)/sign-in' as never);
              },
            },
          ],
        );
      }
    }
  };

  const handleDelete = () => {
    setError(false);
    setPin(prev => prev.slice(0, -1));
  };

  // COS-376: recovery for a user who forgot their PIN and has no biometric
  // fallback. Mirrors the proven 5-attempt escape (clearPinData + clearTokens +
  // route to sign-in) but on demand, behind a confirm. Strictly MORE
  // restrictive than unlocking — it wipes the local PIN + session and forces a
  // full re-login (email OTP / Apple / Google), after which the user sets a new
  // PIN. It cannot bypass auth; it only prevents permanent lockout.
  const handleForgotPin = () => {
    Alert.alert(
      'Forgot your PIN?',
      "You'll be signed out, then you can sign in again with your email, Apple, or Google and set a new PIN.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearPinData();
              await clearTokens();
            } catch {
              // Even if a wipe step fails, still drop the lock + route to
              // sign-in so the user is never trapped.
            }
            setIsLocked(false);
            router.replace('/(auth)/sign-in' as never);
          },
        },
      ],
    );
  };

  // Ambient backdrop palette — base color + two off-screen accent blobs
  // for a gradient-y depth feel without a LinearGradient dep.
  const base = isDark ? '#0B1220' : '#F1F5FF';
  const blobA = colors.primary + (isDark ? '33' : '22'); // brand tint, top-right
  const blobB = isDark ? '#1E1B4B66' : '#C7D2FE55';      // cool secondary, bottom-left

  return (
    <View style={[styles.root, { backgroundColor: base }]}>
      {/* Ambient blobs — pointer-events: none so they don't intercept taps */}
      <View pointerEvents="none" style={[styles.blob, styles.blobTopRight, { backgroundColor: blobA }]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBottomLeft, { backgroundColor: blobB }]} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerArea}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: getScaledFontSize(140), height: getScaledFontSize(56) }}
            contentFit="contain"
            accessibilityLabel="Circle Support Health logo"
          />
        </View>

        <View style={styles.heroArea}>
          {/* Concentric halo + lock icon. Inner ring solid brand fill,
              outer ring animated translucent pulse. */}
          <View style={styles.lockWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.haloOuter,
                {
                  backgroundColor: colors.primary + '22',
                  transform: [{
                    scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }),
                  }],
                  opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.15] }),
                },
              ]}
            />
            <View style={[styles.haloInner, { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '55' }]} />
            <View style={[styles.lockBadge, { backgroundColor: colors.primary }]}>
              <Ionicons
                name="lock-closed"
                size={getScaledFontSize(28)}
                color="#FFFFFF"
                accessibilityLabel="Locked"
              />
            </View>
          </View>

          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: getScaledFontSize(Typography.title1.fontSize + 2),
                fontWeight: getScaledFontWeight(800) as any,
              },
            ]}
            accessibilityRole="header"
          >
            Welcome back
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.secondary,
                fontSize: getScaledFontSize(Typography.callout.fontSize),
                fontWeight: getScaledFontWeight(500) as any,
              },
            ]}
          >
            {showBiometric ? 'Use Face ID or enter your 6-digit PIN' : 'Enter your 6-digit PIN to continue'}
          </Text>

          <View style={styles.dotsRow}>
            <PinDots length={6} filled={pin.length} error={error} />
          </View>

          {error ? (
            <View style={[styles.errorPill, { backgroundColor: colors.error + '14', borderColor: colors.error + '55' }]}>
              <Ionicons name="alert-circle" size={getScaledFontSize(14)} color={colors.error} />
              <Text
                style={[styles.errorText, { color: colors.error, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}
                accessibilityRole="alert"
              >
                Wrong PIN — {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.padArea}>
          <NumberPad
            onDigit={handleDigit}
            onDelete={handleDelete}
            showBiometric={showBiometric}
            onBiometric={attemptBiometric}
          />
        </View>

        {/* COS-376: always-visible recovery so a forgot-PIN user (esp. with no
            Face ID) is never permanently locked out. Wipes PIN + session and
            forces a full re-login — strictly more restrictive than unlocking. */}
        <TouchableOpacity
          onPress={handleForgotPin}
          accessibilityRole="button"
          accessibilityLabel="Forgot your PIN? Sign out and reset it"
          hitSlop={12}
          style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 10, paddingHorizontal: 20 }}
        >
          <Text
            style={{
              color: colors.secondary,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              textDecorationLine: 'underline',
            }}
          >
            Forgot PIN?
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* SCRUM-279 (build 45): "Unlocking…" overlay during postUnlockNavigate.
          checkSession is a network call that can take 1–2 seconds; without
          this overlay the user stares at the lock screen wondering if
          their PIN was accepted. Sits on top of everything (no SafeArea)
          so it covers the keypad cleanly. */}
      {unlocking ? (
        <View
          pointerEvents="auto"
          style={[styles.unlockingOverlay, { backgroundColor: base + 'EE' }]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              styles.unlockingText,
              {
                color: colors.text,
                fontSize: getScaledFontSize(Typography.callout.fontSize),
                fontWeight: getScaledFontWeight(600) as any,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            Unlocking…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const BLOB_SIZE = 360;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  // Ambient backdrop blobs — large soft circles positioned off-screen
  // so only their feathered edges show through. backgroundColor is set
  // inline (uses theme + alpha).
  blob: {
    position: 'absolute',
    width: BLOB_SIZE,
    height: BLOB_SIZE,
    borderRadius: BLOB_SIZE / 2,
  },
  blobTopRight: { top: -BLOB_SIZE * 0.45, right: -BLOB_SIZE * 0.4 },
  blobBottomLeft: { bottom: -BLOB_SIZE * 0.55, left: -BLOB_SIZE * 0.5 },
  headerArea: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  heroArea: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  // Concentric circles around the lock icon for the halo / glow effect.
  lockWrap: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  haloOuter: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  haloInner: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
  },
  lockBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft brand-coloured glow underneath the badge
    shadowColor: '#0D9488',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  title: { textAlign: 'center', marginBottom: 4, letterSpacing: 0.2 },
  subtitle: { textAlign: 'center', marginBottom: Spacing.md, opacity: 0.85 },
  dotsRow: { marginBottom: 8 },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  errorText: { marginLeft: 2 },
  padArea: {
    // SCRUM-237: keypad moves up near the PIN dots instead of being
    // pinned to the bottom of the screen. The dots and the keypad now
    // read as a single input cluster with just a comfortable gap
    // between them; remaining bottom space is shared.
    marginTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  unlockingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 1000,
  },
  unlockingText: {
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
