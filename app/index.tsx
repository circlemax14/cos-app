import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { checkSession, UserProfile } from '@/services/auth';
import { hasStoredSession } from '@/lib/auth-tokens';
import { getCachedProfile } from '@/lib/cached-profile';
import { isPinSetup } from '@/services/pin-auth';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSecurity } from '@/stores/security-store';
import { useAppLock } from '@/hooks/use-app-lock';

SplashScreen.preventAutoHideAsync().catch(() => {});

type GateState = 'loading' | 'no-internet' | 'done';

/**
 * Determine the correct destination based on user onboarding state.
 * Reads permissions_requested and isPinSetup in parallel to avoid serial
 * AsyncStorage/SecureStore latency.
 */
async function getDestination(user: UserProfile, isLocked: boolean): Promise<string> {
  // Terms acceptance is required for all users
  if (!user.termsAccepted) return '/(onboarding)/usage-guidelines';

  const [permissionsRequested, pinConfigured] = await Promise.all([
    AsyncStorage.getItem('permissions_requested'),
    isPinSetup(),
  ]);

  if (!permissionsRequested) return '/(onboarding)/permissions';

  const finalHome = (): string => {
    if (!pinConfigured) return '/(security)/setup-pin';
    if (isLocked) return '/(security)/lock-screen';
    return '/Home';
  };

  // Users with data ready and welcome already seen → straight to Home.
  if (user.fastenConnected && user.dataReady && user.hasSeenWelcome) {
    return finalHome();
  }

  // Users without an EHR connection must go through Fasten — the widget
  // itself renders a "Connect a Clinic" prompt if they dismiss it without
  // connecting, so we don't need a separate route for that state.
  if (!user.fastenConnected) return '/(onboarding)/fasten-connect';

  // Fasten connected but FHIR export still processing.
  if (!user.dataReady) return '/(onboarding)/data-processing';

  // Data ready + welcome not yet seen → show it now (applies to existing users).
  if (!user.hasSeenWelcome) {
    // Pass firstName as a route param so the greeting renders correctly on
    // first paint — otherwise the screen flashes "Hi!" before the async
    // profile fetch completes and the name swaps in.
    const firstName = user.firstName?.trim();
    return firstName
      ? `/(onboarding)/welcome?firstName=${encodeURIComponent(firstName)}`
      : '/(onboarding)/welcome';
  }

  return finalHome();
}

/**
 * Background revalidation: refreshes user profile from backend after the
 * optimistic navigation. If the server says the user is no longer authenticated
 * (401/403 — handled by checkSession), we redirect to sign-in.
 */
function revalidateInBackground(previousDestination: string, isLocked: boolean) {
  void (async () => {
    try {
      const result = await checkSession();
      if (!result.authenticated || !result.user) {
        // Token invalidated server-side — bounce to sign-in.
        router.replace('/(auth)/sign-in' as never);
        return;
      }
      // If onboarding state changed server-side since our cached snapshot, route
      // to the new destination. Skip if the user has already navigated away
      // (e.g. they're mid-interaction on the cached destination).
      const fresh = await getDestination(result.user, isLocked);
      if (fresh !== previousDestination) {
        router.replace(fresh as never);
      }
    } catch {
      // Network failure during background revalidation is non-fatal —
      // the user keeps using the app with cached data.
    }
  })();
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
      // Step 1: Read token + cached profile in parallel. Both are local reads
      // (SecureStore + AsyncStorage) — no network.
      const [hasSession, cachedProfile] = await Promise.all([
        hasStoredSession(),
        getCachedProfile(),
      ]);

      if (!hasSession) {
        router.replace('/(auth)/sign-in' as never);
        return;
      }

      // Step 2: Optimistic path — if we have a cached profile, route immediately
      // and revalidate against the backend in the background. This is the hot
      // path for returning users and collapses splash time from 1-5s to ~200ms.
      if (cachedProfile) {
        const destination = await getDestination(cachedProfile, isLocked);
        router.replace(destination as never);
        revalidateInBackground(destination, isLocked);
        return;
      }

      // Step 3: No cache (first launch after this version shipped, or after
      // sign-out). Fall back to the original blocking flow: validate session
      // with backend before routing.
      const result = await checkSession();
      if (!result.authenticated || !result.user) {
        router.replace('/(auth)/sign-in' as never);
        return;
      }

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
        style={{ width: getScaledFontSize(220), height: getScaledFontSize(140) }}
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
