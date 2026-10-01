import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

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
      {/*
       * COS-1225 — same overflow, same screen family. See the long note in
       * lock-screen.tsx for the full reasoning; the short version is that this
       * column is ~790pt at font scale 1 and tablets take the system font scale
       * undampened with a 1.3x accessibility multiplier on top
       * (stores/accessibility-store.tsx), so on an iPad in landscape — and on
       * any phone in landscape, ~390pt of viewport — the NumberPad runs off the
       * bottom. React Native does not clip overflow, so it is drawn and
       * unreachable. There is no "Forgot PIN?" escape hatch on THIS screen: if
       * the pad is off-screen the patient cannot set a PIN, and a PIN is the
       * gate on the whole app.
       *
       * flexGrow (not flex) so a column that already fits lays out exactly as
       * before. keyboardShouldPersistTaps="always" so the pad never costs two
       * taps (COS-1192). Not forked by platform: one path, and Android has
       * shipped this wrapper on lock-screen since COS-941.
       */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="always"
      >
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // COS-1225 — see the ScrollView above. flexGrow, not flex: the column keeps
  // its natural height and only scrolls once it exceeds the viewport.
  scrollContent: { flexGrow: 1 },
  content: { alignItems: 'center', paddingTop: 20, paddingHorizontal: Spacing.screenPadding },
  icon: { fontSize: 48, marginBottom: Spacing.md },
  title: { textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: { textAlign: 'center', marginBottom: Spacing.sm },
  bottomPadding: { height: 40 },
});
