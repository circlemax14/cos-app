import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import { storePin } from '@/services/pin-auth';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';

export default function ConfirmPinScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const { pin: originalPin } = useLocalSearchParams<{ pin: string }>();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    setError(false);
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 6) {
      setTimeout(async () => {
        if (newPin === originalPin) {
          await storePin(newPin);
          router.push('/(security)/enable-biometric' as never);
        } else {
          setError(true);
          setPin('');
          Alert.alert('PINs don\'t match', 'Please try again.');
        }
      }, 200);
    }
  };

  const handleDelete = () => {
    setError(false);
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
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
          Confirm Your PIN
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
          Re-enter your 6-digit code
        </Text>
        <PinDots length={6} filled={pin.length} error={error} />
        {error && (
          <Text
            style={[styles.errorText, { color: colors.error, fontSize: getScaledFontSize(14) }]}
            accessibilityRole="alert"
          >
            PINs don&apos;t match. Try again.
          </Text>
        )}
      </View>
      <NumberPad onDigit={handleDigit} onDelete={handleDelete} />
      <View style={styles.bottomPadding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.screenPadding },
  icon: { fontSize: 48, marginBottom: Spacing.md },
  title: { textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: { textAlign: 'center', marginBottom: Spacing.sm },
  errorText: { marginTop: -8, marginBottom: 8 },
  bottomPadding: { height: 40 },
});
