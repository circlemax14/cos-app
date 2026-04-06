import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { setBiometricEnabled } from '@/services/pin-auth';
import { useSecurity } from '@/stores/security-store';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';

export default function EnableBiometricScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const { refreshSecurityState, setIsLocked } = useSecurity();
  const [hasBiometric, setHasBiometric] = useState(false);
  const [biometricType, setBiometricType] = useState('');

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasBiometric(compatible && enrolled);
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      setBiometricType('Face ID');
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      setBiometricType('Touch ID');
    }
  };

  const handleEnable = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Enable ${biometricType}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    });
    if (result.success) {
      await setBiometricEnabled(true);
    }
    await refreshSecurityState();
    // User just set up their PIN — they are authenticated, don't lock
    setIsLocked(false);
    navigateNext();
  };

  const handleSkip = async () => {
    await setBiometricEnabled(false);
    await refreshSecurityState();
    // User just set up their PIN — they are authenticated, don't lock
    setIsLocked(false);
    navigateNext();
  };

  const navigateNext = () => {
    // Continue to permissions (next step in onboarding)
    router.replace('/(onboarding)/permissions' as never);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{biometricType === 'Face ID' ? '😊' : '👆'}</Text>
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
          {hasBiometric ? `Enable ${biometricType}?` : 'PIN Setup Complete!'}
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
          {hasBiometric
            ? `Unlock the app quickly with ${biometricType}. You can always use your PIN instead.`
            : 'Your PIN is set. You\'ll use it to unlock the app each time you open it.'}
        </Text>
      </View>
      <View style={styles.buttons}>
        {hasBiometric && (
          <AccessibleButton
            variant="primary"
            label={`Enable ${biometricType}`}
            onPress={handleEnable}
          />
        )}
        <AccessibleButton
          variant={hasBiometric ? 'secondary' : 'primary'}
          label={hasBiometric ? 'Skip for now' : 'Continue'}
          onPress={handleSkip}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.screenPadding },
  icon: { fontSize: 64, marginBottom: Spacing.lg },
  title: { textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { textAlign: 'center', maxWidth: 300 },
  buttons: { gap: Spacing.sm + 4, paddingHorizontal: Spacing.screenPadding, paddingBottom: 40 },
});
