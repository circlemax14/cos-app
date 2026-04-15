import Checkbox from 'expo-checkbox';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
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
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
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
    <View style={[styles.safeContainer, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.container}>
          <Image source={require('@/assets/images/logo.png')} style={[{ width: getScaledFontSize(220), height: getScaledFontSize(140) }]} contentFit="contain" />
          <View style={styles.form}>
            <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), lineHeight: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any }]}>Sign Up</Text>
            <TextInput
              mode="flat"
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              outlineStyle={styles.inputOutline}
              textColor={colors.text}
            />
            <TextInput
              mode="flat"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              outlineStyle={styles.inputOutline}
              textColor={colors.text}
              right={
                <TextInput.Icon
                  icon={() => (
                    <IconSymbol
                      name={showPassword ? 'eye.slash' : 'eye'}
                      size={getScaledFontSize(22)}
                      color={colors.text}
                    />
                  )}
                  onPress={() => setShowPassword(v => !v)}
                />
              }
            />
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
                  <Text style={[styles.requirementText, { color: '#b45309', fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(18) }]}>
                    {firstUnmet.label}
                  </Text>
                </View>
              );
            })()}
            <TextInput
              mode="flat"
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              outlineStyle={styles.inputOutline}
              textColor={colors.text}
              right={
                <TextInput.Icon
                  icon={() => (
                    <IconSymbol
                      name={showConfirmPassword ? 'eye.slash' : 'eye'}
                      size={getScaledFontSize(22)}
                      color={colors.text}
                    />
                  )}
                  onPress={() => setShowConfirmPassword(v => !v)}
                />
              }
            />
            {error ? <Text style={[styles.error, { fontSize: getScaledFontSize(16) }]}>{error}</Text> : null}

            <Pressable
              style={[
                styles.termsCard,
                {
                  backgroundColor: termsAccepted ? (colors.tint + '10') : colors.card,
                  borderColor: termsAccepted ? colors.tint : colors.border,
                },
              ]}
              onPress={() => setTermsAccepted(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="I agree to the Terms and Conditions"
            >
              <View style={[
                styles.termsCheckCircle,
                {
                  backgroundColor: termsAccepted ? colors.tint : 'transparent',
                  borderColor: termsAccepted ? colors.tint : colors.border,
                },
              ]}>
                {termsAccepted && (
                  <RNText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</RNText>
                )}
              </View>
              <RNText style={{ color: colors.text, fontSize: getScaledFontSize(14), flex: 1, lineHeight: getScaledFontSize(20) }}>
                I agree to the{' '}
                <RNText
                  onPress={(e) => { e.stopPropagation(); router.push('/(auth)/terms' as never); }}
                  style={{ color: colors.tint, fontWeight: '600', textDecorationLine: 'underline' }}
                >
                  Terms and Conditions
                </RNText>
              </RNText>
            </Pressable>

            <Button
              mode="contained"
              buttonColor={loading || !termsAccepted ? '#9ca3af' : '#2563eb'}
              onPress={onSubmit}
              loading={loading}
              disabled={loading || !termsAccepted}
              style={styles.submit}
              contentStyle={styles.submitContent}
              labelStyle={[styles.submitLabel, { fontSize: getScaledFontSize(16), lineHeight: getScaledFontSize(22) }]}
              accessibilityLabel={termsAccepted ? 'Sign up' : 'Accept terms and conditions to sign up'}
            >
              Sign Up
            </Button>
            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <Button mode="text" labelStyle={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }]} contentStyle={{ paddingVertical: getScaledFontSize(6) }}>Sign In</Button>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
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
  input: {
    backgroundColor: 'transparent',
  },
  inputOutline: {
    borderRadius: 14,
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
  submit: {
    marginTop: 8,
    borderRadius: 24,
  },
  submitContent: {
    minHeight: 48,
  },
  submitLabel: {
    color: 'white',
    fontWeight: '600',
  },
  termsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 52,
  },
  termsCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  error: {
    color: 'crimson',
  },
});
