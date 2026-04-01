import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { checkSession, UserProfile } from '@/services/auth';
import { hasStoredSession } from '@/lib/auth-tokens';
import { isPinSetup } from '@/services/pin-auth';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSecurity } from '@/stores/security-store';
import { useAppLock } from '@/hooks/use-app-lock';

SplashScreen.preventAutoHideAsync().catch(() => {});

type GateState = 'loading' | 'no-internet' | 'done';

/**
 * Determine the correct destination based on user onboarding state.
 */
async function getDestination(user: UserProfile, isLocked: boolean): Promise<string> {
  if (!user.termsAccepted) return '/(onboarding)/usage-guidelines';

  // Check if permissions have been requested
  const permissionsRequested = await AsyncStorage.getItem('permissions_requested');
  if (!permissionsRequested) return '/(onboarding)/permissions';

  if (!user.fastenConnected) return '/(onboarding)/fasten-connect';
  // If connected but data not ready (pending, failed, or unknown status) → show data-processing
  if (!user.dataReady && user.fastenConnected) return '/(onboarding)/data-processing';

  // Check security PIN setup before allowing access to Home
  const pinConfigured = await isPinSetup();
  if (!pinConfigured) return '/(security)/setup-pin';
  if (isLocked) return '/(security)/lock-screen';

  return '/Home';
}

export default function SplashGate() {
  const { settings, getScaledFontSize } = useAccessibility();
  const { isLocked } = useSecurity();
  useAppLock();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [state, setState] = useState<GateState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const run = useCallback(async () => {
    setState('loading');
    try {
      // Step 1: Check if we have stored tokens
      const hasSession = await hasStoredSession();
      if (!hasSession) {
        router.replace('/(auth)/sign-in' as never);
        return;
      }

      // Step 2: Validate session with backend (token refresh happens automatically via interceptor)
      const result = await checkSession();
      if (!result.authenticated || !result.user) {
        router.replace('/(auth)/sign-in' as never);
        return;
      }

      // Step 3: Route to the correct screen based on onboarding state
      const destination = await getDestination(result.user, isLocked);
      router.replace(destination as never);
    } catch (err: unknown) {
      const isNetworkError =
        err instanceof Error && (err as Error & { code?: string }).code === 'NETWORK_ERROR';
      if (isNetworkError) {
        setState('no-internet');
      } else {
        router.replace('/(auth)/sign-in' as never);
      }
    } finally {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLocked]);

  useEffect(() => {
    run();
  }, [run, retryKey]);

  if (state === 'no-internet') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.offlineIcon]}>📵</Text>
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
          No Internet Connection
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => setRetryKey((k) => k + 1)}
        >
          <Text style={[styles.retryText, { fontSize: getScaledFontSize(16) }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={require('@/assets/images/logo.png')}
        style={{ width: getScaledFontSize(140), height: getScaledFontSize(140) }}
        contentFit="contain"
      />
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  offlineIcon: { fontSize: 56 },
  title: { fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -12 },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
