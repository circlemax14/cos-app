import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import {
  verifyPin,
  isBiometricEnabled,
  incrementFailedAttempts,
  resetFailedAttempts,
  getFailedAttempts,
  clearPinData,
} from '@/services/pin-auth';
import { useSecurity } from '@/stores/security-store';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';

const MAX_ATTEMPTS = 5;

export default function LockScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
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
      promptMessage: 'Unlock BrightFuture',
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={{ width: getScaledFontSize(180), height: getScaledFontSize(110), marginBottom: Spacing.sm }}
          contentFit="contain"
          accessibilityLabel="Circle Support Health logo"
        />
        <Text style={styles.icon}>🔒</Text>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(Typography.title2.fontSize),
              fontWeight: getScaledFontWeight(600) as any,
            },
          ]}
          accessibilityRole="header"
        >
          Enter Your PIN
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
          6-digit security code
        </Text>
        <PinDots length={6} filled={pin.length} error={error} />
        {error && (
          <Text
            style={[styles.errorText, { color: colors.error, fontSize: getScaledFontSize(14) }]}
            accessibilityRole="alert"
          >
            Wrong PIN. {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining.
          </Text>
        )}
      </View>
      <NumberPad
        onDigit={handleDigit}
        onDelete={handleDelete}
        showBiometric={showBiometric}
        onBiometric={attemptBiometric}
      />
      <View style={styles.bottomPadding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: 'center', paddingTop: 20, paddingHorizontal: Spacing.screenPadding },
  icon: { fontSize: 48, marginBottom: Spacing.md },
  title: { textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: { textAlign: 'center', marginBottom: Spacing.sm },
  errorText: { marginTop: -8, marginBottom: 8 },
  bottomPadding: { height: 40 },
});
