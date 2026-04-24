import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

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

  // Entrance animation for the form card.
  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(14);
  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
    contentTranslate.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.quad) });
  }, [contentOpacity, contentTranslate]);
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));

  // Respond to Google auth result when it changes.
  // All non-success outcomes (cancel, dismiss, error, locked) must reset the
  // loading state so the user can try again — otherwise the button is stuck.
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'success') {
      const { id_token } = googleResponse.params;
      handleGoogleToken(id_token);
    } else {
      setGoogleLoading(false);
      if (googleResponse.type === 'error') {
        setError('Google sign-in failed. Please try again.');
      }
      // cancel / dismiss / locked — user bailed, no error message needed
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
    try {
      const result = await promptGoogleAsync();
      if (result?.type !== 'success') {
        setGoogleLoading(false);
        if (result?.type === 'error') {
          setError('Google sign-in failed. Please try again.');
        }
      }
    } catch {
      setGoogleLoading(false);
      setError('Google sign-in failed. Please try again.');
    }
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
      if (appleErr.code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Please try again.');
      }
    }
  };

  const disabled = loading || googleLoading;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Decorative background blobs */}
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
          <Animated.View style={[styles.content, contentStyle]}>
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
              Welcome Back
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(28),
                fontWeight: getScaledFontWeight(700) as any,
                textAlign: 'center',
              }}
            >
              Sign in to your account
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
              Your health records, medications, and appointments — in one secure place.
            </Text>

            <View style={styles.form}>
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
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(500) as any,
                  },
                ]}
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
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(500) as any,
                  },
                ]}
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
                    onPress={() => setShowPassword((v) => !v)}
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
                accessibilityLabel="Sign in with email and password"
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </Text>
              </Pressable>

              {(isGoogleSignInEnabled || (isAppleSignInEnabled && Platform.OS === 'ios')) && (
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border ?? '#E0E0E0' }]} />
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(12),
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    or continue with
                  </Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border ?? '#E0E0E0' }]} />
                </View>
              )}

              {isGoogleSignInEnabled && (
                <Pressable
                  onPress={handleGoogleSignIn}
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.socialButton,
                    {
                      borderColor: colors.border ?? '#D1D5DB',
                      backgroundColor: pressed ? colors.card : 'transparent',
                      opacity: disabled ? 0.6 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                >
                  <Image
                    source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                    accessibilityLabel=""
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(15),
                      fontWeight: getScaledFontWeight(500) as any,
                    }}
                  >
                    {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
                  </Text>
                </Pressable>
              )}

              {isAppleSignInEnabled && Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={
                    settings.isDarkTheme
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={28}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              )}
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
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(14),
                  }}
                >
                  Don&apos;t have an account?{' '}
                </Text>
                <Link href="/(auth)/sign-up" asChild>
                  <Pressable accessibilityRole="button" accessibilityLabel="Go to sign up">
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(700) as any,
                      }}
                    >
                      Sign Up
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </Animated.View>
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
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  inputOutline: {
    borderRadius: 14,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    minHeight: 50,
  },
  appleButton: {
    width: '100%',
    height: 50,
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
