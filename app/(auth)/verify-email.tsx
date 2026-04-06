import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { Button } from 'react-native-paper';

import { Colors } from '@/constants/theme';
import { confirmSignUp, resendCode, signIn } from '@/services/auth';
import { useAccessibility } from '@/stores/accessibility-store';

export default function VerifyEmailScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { email, password } = useLocalSearchParams<{ email: string; password?: string }>();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resendMessage, setResendMessage] = useState<string | undefined>();
  const inputRefs = useRef<(RNTextInput | null)[]>([]);

  const code = digits.join('');

  const handleDigitChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onResend = async () => {
    setResending(true);
    setError(undefined);
    setResendMessage(undefined);
    const res = await resendCode(email ?? '');
    setResending(false);
    if (res.success) {
      setResendMessage('A new code has been sent to your email.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } else {
      setError(res.message ?? 'Failed to resend code. Please try again.');
    }
  };

  const onSubmit = async () => {
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setError(undefined);
    const res = await confirmSignUp(email ?? '', code);
    if (res.success) {
      // Keep loading=true so button stays disabled during navigation
      if (password) {
        const signInRes = await signIn({ username: email ?? '', password });
        if (signInRes.success) {
          router.replace('/(onboarding)/usage-guidelines' as never);
          return;
        }
      }
      router.replace('/(auth)/sign-in' as never);
    } else {
      setLoading(false);
      setError(res.message ?? 'Verification failed. Please try again.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
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
        >
          <View style={styles.container}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: getScaledFontSize(100), height: getScaledFontSize(100) }}
              contentFit="contain"
              accessibilityLabel="App logo"
            />

            <View style={styles.form}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(22),
                  fontWeight: getScaledFontWeight(700) as any,
                  textAlign: 'center',
                  marginBottom: 4,
                }}
              >
                Verify your email
              </Text>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(14),
                  lineHeight: getScaledFontSize(22),
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                We sent a 6-digit code to{'\n'}
                <Text style={{ color: colors.text, fontWeight: getScaledFontWeight(600) as any }}>
                  {email}
                </Text>
              </Text>

              {/* OTP Input Boxes */}
              <View style={styles.otpRow}>
                {digits.map((digit, i) => (
                  <RNTextInput
                    key={i}
                    ref={(ref) => { inputRefs.current[i] = ref; }}
                    value={digit}
                    onChangeText={(text) => handleDigitChange(text, i)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    accessibilityLabel={`Digit ${i + 1} of 6`}
                    style={[
                      styles.otpBox,
                      {
                        color: colors.text,
                        borderColor: digit ? colors.primary : colors.border,
                        fontSize: 22,
                      },
                    ]}
                  />
                ))}
              </View>

              {error ? (
                <Text
                  style={{
                    color: 'crimson',
                    fontSize: getScaledFontSize(14),
                    textAlign: 'center',
                  }}
                  accessibilityRole="alert"
                >
                  {error}
                </Text>
              ) : null}

              {resendMessage ? (
                <Text
                  style={{
                    color: '#16a34a',
                    fontSize: getScaledFontSize(14),
                    textAlign: 'center',
                  }}
                >
                  {resendMessage}
                </Text>
              ) : null}

              {/* Verify Button */}
              <TouchableOpacity
                onPress={onSubmit}
                disabled={loading || code.length < 6}
                accessibilityRole="button"
                accessibilityLabel="Verify email"
                style={[
                  styles.submit,
                  {
                    backgroundColor: loading || code.length < 6 ? '#9ca3af' : colors.tint,
                    opacity: loading || code.length < 6 ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: 'white',
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    textAlign: 'center',
                  }}
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </Text>
              </TouchableOpacity>

              {/* Resend Code */}
              <TouchableOpacity
                onPress={onResend}
                disabled={resending || loading}
                style={styles.textButton}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                <Text
                  style={{
                    color: resending ? colors.subtext : colors.primary,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(600) as any,
                    textAlign: 'center',
                  }}
                >
                  {resending ? 'Sending...' : 'Resend code'}
                </Text>
              </TouchableOpacity>

              {/* Back to Sign In */}
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/sign-in')}
                style={styles.textButton}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(500) as any,
                    textAlign: 'center',
                  }}
                >
                  Back to Sign In
                </Text>
              </TouchableOpacity>
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
    gap: 14,
    alignItems: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 8,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 1.5,
    borderRadius: 12,
    textAlign: 'center',
    fontWeight: '600',
    backgroundColor: 'transparent',
  },
  submit: {
    width: '100%',
    borderRadius: 24,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
