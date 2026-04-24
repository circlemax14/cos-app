import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

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

  const firstUnmet = password.length > 0
    ? PASSWORD_RULES.find((rule) => !rule.test(password))
    : undefined;
  const disabled = loading || !termsAccepted;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        pointerEvents="none"
        style={[styles.blobTopRight, { backgroundColor: colors.primary + '1A' }]}
      />
      <View
        pointerEvents="none"
        style={[styles.blobBottomLeft, { backgroundColor: colors.primary + '0F' }]}
      />

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
          <View style={styles.content}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: getScaledFontSize(180), height: getScaledFontSize(110) }}
              contentFit="contain"
              accessibilityLabel="App logo"
            />

            <Text
              style={{
                color: colors.primary,
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(700) as any,
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginTop: 8,
              }}
            >
              Get Started
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(28),
                fontWeight: getScaledFontWeight(700) as any,
                textAlign: 'center',
              }}
            >
              Create your account
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                lineHeight: getScaledFontSize(22),
                marginBottom: 20,
              }}
            >
              Sign up to connect your health records, medications, and care team.
            </Text>

            <View style={styles.form}>
              <TextInput
                mode="outlined"
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(500) as any,
                  },
                ]}
                outlineStyle={styles.inputOutline}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                theme={{ roundness: 16 }}
                left={
                  <TextInput.Icon
                    icon={() => (
                      <IconSymbol
                        name="envelope"
                        size={getScaledFontSize(20)}
                        color={colors.subtext}
                      />
                    )}
                  />
                }
              />
              <TextInput
                mode="outlined"
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(500) as any,
                  },
                ]}
                outlineStyle={styles.inputOutline}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                theme={{ roundness: 16 }}
                left={
                  <TextInput.Icon
                    icon={() => (
                      <IconSymbol
                        name="lock"
                        size={getScaledFontSize(20)}
                        color={colors.subtext}
                      />
                    )}
                  />
                }
                right={
                  <TextInput.Icon
                    icon={() => (
                      <IconSymbol
                        name={showPassword ? 'eye.slash' : 'eye'}
                        size={getScaledFontSize(20)}
                        color={colors.subtext}
                      />
                    )}
                    onPress={() => setShowPassword((v) => !v)}
                  />
                }
              />
              {firstUnmet && (
                <View style={styles.requirementRow}>
                  <IconSymbol
                    name="info.circle.fill"
                    size={getScaledFontSize(15)}
                    color="#b45309"
                  />
                  <Text
                    style={{
                      color: '#b45309',
                      fontSize: getScaledFontSize(13),
                      lineHeight: getScaledFontSize(18),
                    }}
                  >
                    {firstUnmet.label}
                  </Text>
                </View>
              )}
              <TextInput
                mode="outlined"
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(500) as any,
                  },
                ]}
                outlineStyle={styles.inputOutline}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                theme={{ roundness: 16 }}
                left={
                  <TextInput.Icon
                    icon={() => (
                      <IconSymbol
                        name="lock"
                        size={getScaledFontSize(20)}
                        color={colors.subtext}
                      />
                    )}
                  />
                }
                right={
                  <TextInput.Icon
                    icon={() => (
                      <IconSymbol
                        name={showConfirmPassword ? 'eye.slash' : 'eye'}
                        size={getScaledFontSize(20)}
                        color={colors.subtext}
                      />
                    )}
                    onPress={() => setShowConfirmPassword((v) => !v)}
                  />
                }
              />

              {error ? (
                <Text
                  style={{
                    color: '#B91C1C',
                    fontSize: getScaledFontSize(13),
                    marginTop: 4,
                  }}
                  accessibilityRole="alert"
                >
                  {error}
                </Text>
              ) : null}

              <Pressable
                style={[
                  styles.termsCard,
                  {
                    backgroundColor: termsAccepted ? colors.primary + '14' : colors.card,
                    borderColor: termsAccepted ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setTermsAccepted((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
                accessibilityLabel="I agree to the Terms and Conditions"
              >
                <View
                  style={[
                    styles.termsCheckCircle,
                    {
                      backgroundColor: termsAccepted ? colors.primary : 'transparent',
                      borderColor: termsAccepted ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {termsAccepted && (
                    <RNText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</RNText>
                  )}
                </View>
                <RNText
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                    flex: 1,
                    lineHeight: getScaledFontSize(20),
                  }}
                >
                  I agree to the{' '}
                  <RNText
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push('/(auth)/terms' as never);
                    }}
                    style={{
                      color: colors.primary,
                      fontWeight: '600',
                      textDecorationLine: 'underline',
                    }}
                  >
                    Terms and Conditions
                  </RNText>
                </RNText>
              </Pressable>

              <Pressable
                onPress={onSubmit}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: disabled ? '#9ca3af' : colors.primary,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  termsAccepted ? 'Sign up' : 'Accept terms and conditions to sign up'
                }
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {loading ? 'Creating account…' : 'Sign Up'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.footer}>
              <View style={styles.privacyRow}>
                <MaterialIcons name="lock" size={getScaledFontSize(12)} color={colors.subtext} />
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(11),
                    fontWeight: getScaledFontWeight(500) as any,
                  }}
                >
                  HIPAA-compliant · Encrypted in transit
                </Text>
              </View>

              <View style={styles.switchRow}>
                <Text
                  style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}
                >
                  Already have an account?{' '}
                </Text>
                <Link href="/(auth)/sign-in" asChild>
                  <Pressable accessibilityRole="button" accessibilityLabel="Go to sign in">
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(700) as any,
                      }}
                    >
                      Sign In
                    </Text>
                  </Pressable>
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
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  blobTopRight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -140,
    right: -100,
  },
  blobBottomLeft: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -110,
    left: -80,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 28,
    paddingVertical: 48,
    gap: 8,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  form: {
    width: '100%',
    gap: 12,
    marginTop: 4,
  },
  input: {
    height: 58,
  },
  inputOutline: {
    borderRadius: 16,
    borderWidth: 1.5,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  termsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
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
  primaryButton: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 14,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});
