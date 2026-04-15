import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { signIn, UserProfile } from '@/services/auth';
import { signInWithApple, socialSignInWithBackend } from '@/services/social-auth';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useIsFeatureFlagEnabled } from '@/hooks/use-feature-flags';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const isAppleSignInEnabled = useIsFeatureFlagEnabled('sign_in_with_apple');
  const isGoogleSignInEnabled = useIsFeatureFlagEnabled('sign_in_with_google');

  // Google Sign-In via expo-auth-session/providers/google
  const [, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  // Respond to Google auth result when it changes
  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      handleGoogleToken(id_token);
    } else if (googleResponse?.type === 'error' || googleResponse?.type === 'dismiss') {
      setGoogleLoading(false);
      if (googleResponse?.type === 'error') {
        setError('Google sign-in failed. Please try again.');
      }
    }
  // handleGoogleToken is defined below and stable — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

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

  const handleGoogleToken = async (idToken: string) => {
    setGoogleLoading(true);
    setError(undefined);
    const res = await socialSignInWithBackend('google', { idToken });
    setGoogleLoading(false);
    if (res.success && res.user) {
      await handleRoute(res.user as unknown as UserProfile);
    } else {
      setError(res.message ?? 'Google sign-in failed. Please try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(undefined);
    await promptGoogleAsync();
    // Result handled in the googleResponse useEffect above
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(undefined);
      const { identityToken, fullName } = await signInWithApple();
      const res = await socialSignInWithBackend('apple', { identityToken, fullName });
      setLoading(false);
      if (res.success && res.user) {
        await handleRoute(res.user as unknown as UserProfile);
      } else {
        setError(res.message ?? 'Apple sign-in failed. Please try again.');
      }
    } catch (err: unknown) {
      setLoading(false);
      const appleErr = err as { code?: string };
      // ERR_REQUEST_CANCELED means user tapped Cancel — don't show an error
      if (appleErr.code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Please try again.');
      }
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
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: getScaledFontSize(220), height: getScaledFontSize(140) }}
            contentFit="contain"
            accessibilityLabel="App logo"
          />

          <View style={styles.form}>
            <Text
              style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), lineHeight: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any }]}
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
              secureTextEntry={!showPassword}
              textContentType="password"
              accessibilityLabel="Password"
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}
              textColor={colors.text}
              outlineStyle={styles.inputOutline}
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

            {error ? (
              <Text style={[styles.error, { fontSize: getScaledFontSize(14) }]} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <Button
              mode="contained"
              buttonColor={loading ? '#9ca3af' : '#2563eb'}
              onPress={onSubmit}
              loading={loading}
              disabled={loading || googleLoading}
              style={styles.submit}
              contentStyle={styles.submitContent}
              labelStyle={[styles.submitLabel, { fontSize: getScaledFontSize(16), lineHeight: getScaledFontSize(22) }]}
              accessibilityLabel="Sign in with email and password"
            >
              Sign In
            </Button>

            {/* Social sign-in divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border ?? '#E0E0E0' }]} />
              <Text style={[styles.dividerText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                or
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border ?? '#E0E0E0' }]} />
            </View>

            {/* Google Sign-In */}
            {isGoogleSignInEnabled && (
              <Button
                mode="outlined"
                onPress={handleGoogleSignIn}
                loading={googleLoading}
                disabled={loading || googleLoading}
                style={styles.socialButton}
                contentStyle={styles.socialButtonContent}
                labelStyle={[styles.socialButtonLabel, { fontSize: getScaledFontSize(15) }]}
                icon={() => (
                  <Image
                    source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                    accessibilityLabel=""
                  />
                )}
                accessibilityLabel="Continue with Google"
              >
                Continue with Google
              </Button>
            )}

            {/* Apple Sign-In — iOS only */}
            {isAppleSignInEnabled && Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  settings.isDarkTheme
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={24}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                Don&apos;t have an account?{' '}
              </Text>
              <Link href="/(auth)/sign-up" asChild>
                <Button
                  mode="text"
                  labelStyle={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(22) }}
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontWeight: '500',
  },
  socialButton: {
    borderRadius: 24,
    borderColor: '#D1D5DB',
  },
  socialButtonContent: {
    minHeight: 48,
  },
  socialButtonLabel: {
    fontWeight: '500',
  },
  appleButton: {
    width: '100%',
    height: 48,
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
