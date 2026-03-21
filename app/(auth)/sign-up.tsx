import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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

  const onSubmit = async () => {
    setLoading(true);
    setError(undefined);
    const res = await signUp({ email, password, confirmPassword });
    setLoading(false);
    if (res.success) {
      router.replace({ pathname: '/(auth)/verify-email', params: { email } } as never);
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
            <Text variant="headlineSmall" style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>Sign Up</Text>
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
            {password.length > 0 && (
              <View style={styles.requirements}>
                <Text style={[styles.requirementsTitle, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
                  Password requirements:
                </Text>
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <View key={rule.label} style={styles.requirementRow}>
                      <IconSymbol
                        name={met ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                        size={getScaledFontSize(15)}
                        color={met ? '#16a34a' : '#dc2626'}
                      />
                      <Text style={[styles.requirementText, { color: met ? '#16a34a' : '#dc2626', fontSize: getScaledFontSize(13) }]}>
                        {rule.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
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
            <Button
              mode="contained"
              buttonColor={loading ? "#9ca3af" : "#2563eb"}
              onPress={onSubmit}
              loading={loading}
              disabled={loading}
              style={styles.submit}
              contentStyle={styles.submitContent}
              labelStyle={styles.submitLabel}
            >
              Sign Up
            </Button>
            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <Button mode="text" labelStyle={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }]}>Sign In</Button>
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
    justifyContent: 'center',
    minHeight: '100%',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
    minHeight: '100%',
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
  requirements: {
    gap: 4,
    paddingHorizontal: 4,
  },
  requirementsTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requirementText: {
    fontWeight: '500',
  },
  submit: {
    marginTop: 8,
    borderRadius: 24,
  },
  submitContent: {
    height: 48,
  },
  submitLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
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
