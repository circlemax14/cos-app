import { Checkbox } from 'expo-checkbox';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import { AppWrapper } from '@/components/app-wrapper';
import { signIn } from '@/services/auth';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export default function SignInScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [accepted, setAccepted] = useState(false);

  const handleRoute = (user: { termsAccepted: boolean; fastenConnected: boolean }) => {
    if (!user.termsAccepted) {
      router.replace('/(onboarding)/terms' as never);
    } else if (!user.fastenConnected) {
      router.replace('/(onboarding)/fasten-connect' as never);
    } else {
      router.replace('/Home' as never);
    }
  };

  const onSubmit = async () => {
    if (!accepted) return;
    if (!username.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(undefined);
    const res = await signIn({ username: username.trim(), password });
    setLoading(false);
    if (res.success && res.user) {
      handleRoute(res.user);
    } else {
      setError(res.message ?? 'Sign in failed. Please check your credentials.');
    }
  };


  return (
    <AppWrapper showBellIcon={false} showLogo={false}>
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              variant="headlineSmall"
              style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}
            >
              Sign In
            </Text>

            <TextInput
              mode="flat"
              label="Email Address"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              outlineStyle={styles.inputOutline}
              textColor={colors.text}
            />
            <TextInput
              mode="flat"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              accessibilityLabel="Password"
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              textColor={colors.text}
              outlineStyle={styles.inputOutline}
            />

            <View style={styles.termsRow}>
              <Checkbox
                value={accepted}
                onValueChange={setAccepted}
                color="#0a7ea4"
                style={styles.checkbox}
                accessibilityLabel="I agree to Terms and Privacy Policy"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted }}
              />
              <TouchableOpacity
                onPress={() => setAccepted((v) => !v)}
                accessibilityLabel="Toggle terms agreement"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }}>
                  I agree to{' '}
                  <Text
                    style={{ color: '#0a7ea4', textDecorationLine: 'underline' }}
                    onPress={() => router.push('/(auth)/privacy-policy' as never)}
                    accessibilityRole="link"
                    accessibilityLabel="View Terms and Privacy Policy"
                  >
                    Terms &amp; Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <Text style={[styles.error, { fontSize: getScaledFontSize(14) }]} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <Button
              mode="contained"
              buttonColor={loading || !accepted ? '#9ca3af' : '#2563eb'}
              onPress={onSubmit}
              loading={loading}
              disabled={loading || !accepted}
              style={styles.submit}
              contentStyle={styles.submitContent}
              labelStyle={styles.submitLabel}
              accessibilityLabel="Sign in with email and password"
            >
              Sign In
            </Button>

            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                Don&apos;t have an account?{' '}
              </Text>
              <Link href="/(auth)/sign-up" asChild>
                <Button
                  mode="text"
                  labelStyle={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(22) }}
                  accessibilityLabel="Go to sign up"
                >
                  Sign Up
                </Button>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: '100%',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 0,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    margin: 4,
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
