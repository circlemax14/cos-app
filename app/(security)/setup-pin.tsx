import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';

export default function SetupPinScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const [pin, setPin] = useState('');

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 6) {
      // Navigate to confirm with PIN as param
      setTimeout(() => {
        router.push({
          pathname: '/(security)/confirm-pin',
          params: { pin: newPin },
        } as never);
        setPin('');
      }, 200);
    }
  };

  const handleDelete = () => {
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
          Set Up Your PIN
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
          Create a 6-digit security code to protect your health data
        </Text>
        <PinDots length={6} filled={pin.length} />
      </View>
      <NumberPad onDigit={handleDigit} onDelete={handleDelete} />
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
  bottomPadding: { height: 40 },
});
