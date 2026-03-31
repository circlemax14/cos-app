import Checkbox from 'expo-checkbox';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button } from 'react-native-paper';

import { AppWrapper } from '@/components/app-wrapper';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { AccessibleInput } from '@/components/ui/accessible-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getColors, Typography } from '@/constants/design-system';
import { signUp } from '@/services/auth';
import { useAccessibility } from '@/stores/accessibility-store';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'At least 1 number', test: (p: string) => /\d/.test(p) },
  { label: 'At least 1 special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  { label: 'At least 1 uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'At least 1 lowercase letter', test: (p: string) => /[a-z]/.test(p) },
];

export default function SignUpScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [termsAccepted, setTermsAccepted] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(undefined);
    const res = await signUp({ email, password, confirmPassword });
    setLoading(false);
    if (res.success) {
      router.replace({ pathname: '/(auth)/verify-email', params: { email, password } } as never);
    } else {
      setError(res.message ?? 'Sign up failed');
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
          <Image source={require('@/assets/images/logo.png')} style={[{ width: getScaledFontSize(140), height: getScaledFontSize(140) }]} contentFit="contain" />
          <View style={styles.form}>
            <RNText style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(Typography.title2.fontSize), lineHeight: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any }]}>Sign Up</RNText>

            <AccessibleInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
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
                  textContentType="newPassword"
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

            {password.length > 0 && (() => {
              const firstUnmet = PASSWORD_RULES.find((rule) => !rule.test(password));
              if (!firstUnmet) return null;
              return (
                <View style={styles.requirementRow}>
                  <IconSymbol
                    name="info.circle.fill"
                    size={getScaledFontSize(15)}
                    color="#b45309"
                  />
                  <RNText style={[styles.requirementText, { color: '#b45309', fontSize: getScaledFontSize(Typography.footnote.fontSize), lineHeight: getScaledFontSize(18) }]}>
                    {firstUnmet.label}
                  </RNText>
                </View>
              );
            })()}

            <View style={styles.passwordRow}>
              <View style={styles.passwordInputWrapper}>
                <AccessibleInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  textContentType="newPassword"
                />
              </View>
              <Pressable
                onPress={() => setShowConfirmPassword(v => !v)}
                style={[styles.eyeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                <IconSymbol
                  name={showConfirmPassword ? 'eye.slash' : 'eye'}
                  size={getScaledFontSize(22)}
                  color={colors.text}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <RNText style={styles.errorIcon}>⚠️</RNText>
                <RNText style={[styles.error, { color: colors.error, fontSize: getScaledFontSize(Typography.footnote.fontSize) }]}>
                  {error}
                </RNText>
              </View>
            ) : null}

            <Pressable
              style={styles.termsRow}
              onPress={() => setTermsAccepted(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="I agree to the Terms and Conditions"
            >
              <Checkbox
                value={termsAccepted}
                onValueChange={setTermsAccepted}
                color={termsAccepted ? colors.primary : undefined}
              />
              <RNText style={{ color: colors.secondary, fontSize: getScaledFontSize(Typography.footnote.fontSize), lineHeight: getScaledFontSize(20), flex: 1 }}>
                I agree to the{' '}
                <RNText
                  onPress={(e) => { e.stopPropagation(); router.push('/(auth)/terms' as never); }}
                  style={{ color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' }}
                >
                  Terms and Conditions
                </RNText>
              </RNText>
            </Pressable>

            <AccessibleButton
              variant="primary"
              label="Sign Up"
              onPress={onSubmit}
              loading={loading}
              disabled={loading || !termsAccepted}
              accessibilityHint={termsAccepted ? undefined : 'Accept terms and conditions to sign up'}
            />

            <View style={styles.switchRow}>
              <RNText style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(Typography.callout.fontSize), fontWeight: getScaledFontWeight(500) as any }]}>Already have an account? </RNText>
              <Link href="/(auth)/sign-in" asChild>
                <Button mode="text" labelStyle={[{ fontSize: getScaledFontSize(Typography.callout.fontSize), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }]} contentStyle={{ paddingVertical: getScaledFontSize(6) }}>Sign In</Button>
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
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  requirementText: {
    fontWeight: '500',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    paddingHorizontal: 4,
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
