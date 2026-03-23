import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { confirmSignUp, resendCode } from '@/services/auth';
import { useAccessibility } from '@/stores/accessibility-store';

export default function VerifyEmailScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { email } = useLocalSearchParams<{ email: string }>();

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
    setLoading(false);
    if (res.success) {
      router.replace('/(auth)/sign-in');
    } else {
      setError(res.message ?? 'Verification failed. Please try again.');
      // Clear digits so user can re-enter
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
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
        >
          <View style={styles.container}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: getScaledFontSize(100), height: getScaledFontSize(100) }}
              contentFit="contain"
            />

            <View style={styles.form}>
              <Text
                variant="headlineSmall"
                style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}
              >
                Verify your email
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}
              >
                We sent a 6-digit code to{'\n'}
                <Text style={{ color: colors.text, fontWeight: getScaledFontWeight(600) as any }}>
                  {email}
                </Text>
              </Text>

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
                    style={[
                      styles.otpBox,
                      {
                        color: colors.text,
                        borderColor: digit ? colors.primary : colors.border,
                        backgroundColor: 'transparent',
                        fontSize: getScaledFontSize(22),
                      },
                    ]}
                  />
                ))}
              </View>

              {error ? (
                <Text style={[styles.error, { fontSize: getScaledFontSize(14) }]} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}

              {resendMessage ? (
                <Text style={[styles.resendSuccess, { fontSize: getScaledFontSize(14) }]}>
                  {resendMessage}
                </Text>
              ) : null}

              <Button
                mode="contained"
                buttonColor={loading || code.length < 6 ? '#9ca3af' : '#2563eb'}
                onPress={onSubmit}
                loading={loading}
                disabled={loading || code.length < 6}
                style={styles.submit}
                contentStyle={styles.submitContent}
                labelStyle={styles.submitLabel}
              >
                Verify
              </Button>

              <Button
                mode="text"
                onPress={onResend}
                loading={resending}
                disabled={resending || loading}
                labelStyle={{ color: colors.primary, fontSize: getScaledFontSize(14) }}
              >
                Resend code
              </Button>

              <Button
                mode="text"
                onPress={() => router.replace('/(auth)/sign-in')}
                labelStyle={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}
              >
                Back to Sign In
              </Button>
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
    gap: 16,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginVertical: 8,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderRadius: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  error: {
    color: 'crimson',
    textAlign: 'center',
  },
  resendSuccess: {
    color: '#16a34a',
    textAlign: 'center',
  },
  submit: {
    width: '100%',
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
});
