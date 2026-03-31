import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppWrapper } from '@/components/app-wrapper';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { AccessibleInput } from '@/components/ui/accessible-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { signIn, UserProfile } from '@/services/auth';

import { getColors, Typography } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

export default function SignInScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleRoute = async (user: UserProfile) => {
    if (!user.termsAccepted) {
      router.replace('/(onboarding)/usage-guidelines' as never);
      return;
    }

    // Check if device permissions have been requested
    const permissionsRequested = await AsyncStorage.getItem('permissions_requested');
    if (!permissionsRequested) {
      router.replace('/(onboarding)/permissions' as never);
      return;
    }

    if (!user.fastenConnected) {
      router.replace('/(onboarding)/fasten-connect' as never);
    } else if (!user.dataReady && user.ehiExportPending) {
      router.replace('/(onboarding)/data-processing' as never);
    } else if (!user.dataReady && user.ehiExportFailed) {
      router.replace('/(onboarding)/data-processing' as never);
    } else if (!user.dataReady && user.fastenConnected) {
      // Fallback: connected but no data and unknown status — show processing/retry screen
      router.replace('/(onboarding)/data-processing' as never);
    } else {
      router.replace('/Home' as never);
    }
  };

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(undefined);
    const res = await signIn({ username: username.trim(), password });
    setLoading(false);
    if (res.success && res.user) {
      await handleRoute(res.user);
    } else if (res.notConfirmed) {
      router.push({ pathname: '/(auth)/verify-email', params: { email: username.trim() } } as never);
    } else {
      setError(res.message ?? 'Sign in failed. Please check your credentials.');
    }
  };


  return (
    <AppWrapper showBellIcon={false} showLogo={false} showHamburgerIcon={false} showAccessibilityIcon={false}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.container}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: getScaledFontSize(140), height: getScaledFontSize(140) }}
            contentFit="contain"
            accessibilityLabel="App logo"
          />

          <View style={styles.form}>
            <Text
              style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(Typography.title2.fontSize), lineHeight: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any }]}
            >
              Sign In
            </Text>

            <AccessibleInput
              label="Email Address"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <View style={styles.passwordRow}>
              <View style={styles.passwordInputWrapper}>
                <AccessibleInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                />
              </View>
              <Pressable
                onPress={() => setShowPassword(v => !v)}
                style={[styles.eyeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <IconSymbol
                  name={showPassword ? 'eye.slash' : 'eye'}
                  size={getScaledFontSize(22)}
                  color={colors.text}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={[styles.error, { color: colors.error, fontSize: getScaledFontSize(Typography.footnote.fontSize) }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <AccessibleButton
              variant="primary"
              label="Sign In"
              onPress={onSubmit}
              loading={loading}
              disabled={loading}
              accessibilityHint="Sign in with email and password"
            />

            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(Typography.callout.fontSize), fontWeight: getScaledFontWeight(500) as any }]}>
                Don&apos;t have an account?{' '}
              </Text>
              <Link href="/(auth)/sign-up" asChild>
                <Button
                  mode="text"
                  labelStyle={{ fontSize: getScaledFontSize(Typography.callout.fontSize), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(22) }}
                  contentStyle={{ paddingVertical: getScaledFontSize(6) }}
                  accessibilityLabel="Go to sign up"
                >
                  Sign Up
                </Button>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
    flexGrow: 1,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    marginBottom: 4,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  passwordInputWrapper: {
    flex: 1,
  },
  eyeToggle: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorIcon: {
    fontSize: 16,
  },
  error: {},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  switchText: {
    flexShrink: 1,
    textAlign: 'center',
  },
});
