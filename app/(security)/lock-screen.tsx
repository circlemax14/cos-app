import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

const MAX_ATTEMPTS = 5;

// Redesigned lock screen. The previous version had a tiny logo + 🔒 emoji
// + plain header — felt like a stub. New layout is one branded surface
// (rounded card on a soft gradient backdrop) with the logo at top, an
// inline shield-lock icon in brand color, a confident header, the
// existing PIN dots + number pad, and clear failure / biometric hints.
// Components reused from the design system so theming + scaling still
// follow the accessibility store.
export default function LockScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const isDark = settings.isDarkTheme;
  const colors = getColors(isDark);
  const { setIsLocked } = useSecurity();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);

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
      router.replace('/Home' as never);
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

  const verifyAndUnlock = async (enteredPin: string) => {
    const valid = await verifyPin(enteredPin);
    if (valid) {
      await resetFailedAttempts();
      setIsLocked(false);
      router.replace('/Home' as never);
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
                await clearPinData();
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

  const backdrop = isDark ? '#0F172A' : '#EEF2FF';

  return (
    <View style={[styles.gradient, { backgroundColor: backdrop }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerArea}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: getScaledFontSize(140), height: getScaledFontSize(70) }}
            contentFit="contain"
            accessibilityLabel="Circle Support Health logo"
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.shieldBadge, { backgroundColor: colors.primary + '14' }]}>
            <Ionicons
              name="lock-closed"
              size={getScaledFontSize(28)}
              color={colors.primary}
              accessibilityLabel="Locked"
            />
          </View>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: getScaledFontSize(Typography.title1.fontSize),
                fontWeight: getScaledFontWeight(700) as any,
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
              },
            ]}
          >
            {showBiometric ? 'Enter PIN or use Face ID' : 'Enter your 6-digit PIN to continue'}
          </Text>
          <PinDots length={6} filled={pin.length} error={error} />
          {error && (
            <Text
              style={[styles.errorText, { color: colors.error, fontSize: getScaledFontSize(13) }]}
              accessibilityRole="alert"
            >
              Wrong PIN. {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining.
            </Text>
          )}
        </View>

        <View style={styles.padArea}>
          <NumberPad
            onDigit={handleDigit}
            onDelete={handleDelete}
            showBiometric={showBiometric}
            onBiometric={attemptBiometric}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  headerArea: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  card: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    // Soft elevation so the card lifts off the gradient on both themes
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  shieldBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: { textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: { textAlign: 'center', marginBottom: Spacing.xs },
  errorText: { marginTop: -4, marginBottom: 4 },
  padArea: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.sm,
  },
});
