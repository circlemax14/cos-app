import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { checkSession, UserProfile } from '@/services/auth';
import { readSessionPresence } from '@/lib/auth-tokens';
import { getCachedProfile } from '@/lib/cached-profile';
import { isPinSetup } from '@/services/pin-auth';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSecurity } from '@/stores/security-store';
import { requestSignIn } from '@/lib/lock-gate';
import { prefetchAfterAuth } from '@/services/auth-prefetch';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

// useAppLock now mounts at the root layout (app/_layout.tsx) so the
// AppState lock listener stays alive after navigating away from this
// splash gate (SCRUM-235).

SplashScreen.preventAutoHideAsync().catch(() => {});

/*
 * COS-890 — 'session-unreadable' is NOT 'no-internet'.
 *
 * The splash showed "No Internet Connection" for a condition in which no
 * network call had been made at all: readSessionPresence came back
 * 'indeterminate', meaning the iOS Keychain had not woken up yet. Ken:
 * "internet not available screen on open despite a working connection;
 * tapping retry fixes it." Retry fixes it because the SECOND Keychain read
 * succeeds — the network was never the problem, and saying it was sent him
 * to check his wifi.
 */
type GateState = 'loading' | 'no-internet' | 'session-unreadable' | 'done';

/**
 * Determine the correct destination based on user onboarding state.
 * Reads permissions_requested and isPinSetup in parallel to avoid serial
 * AsyncStorage/SecureStore latency.
 *
 * Backend = source of truth: termsAccepted, fastenConnected, dataReady, and
 * hasSeenWelcome all come from /v1/auth/me. The only legitimately-local
 * gates are device-specific (PIN setup) or one-time UX prompts (notification
 * permission rationale). If the backend says a user is already fully
 * onboarded, an empty AsyncStorage (reinstall, "clear app data", device
 * migration) must NOT trap them in the onboarding loop. Backfill the local
 * flag so subsequent cold-starts behave normally too.
 */
async function getDestination(user: UserProfile, isLocked: boolean): Promise<string> {
  // Terms acceptance is required for all users
  if (!user.termsAccepted) return '/(onboarding)/usage-guidelines';

  const [permissionsRequested, pinConfigured] = await Promise.all([
    AsyncStorage.getItem('permissions_requested'),
    isPinSetup(),
  ]);

  const fullyOnboardedServerSide =
    user.fastenConnected && user.dataReady;

  if (!permissionsRequested) {
    if (fullyOnboardedServerSide) {
      // Returning user with cleared local state — silently mark the
      // permission prompt as already shown so we don't loop them through
      // onboarding screens whose backend equivalents already say "done".
      AsyncStorage.setItem('permissions_requested', 'true').catch(() => {});
    } else {
      return '/(onboarding)/permissions';
    }
  }

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
 * (401/403 — handled by checkSession), we defer the sign-in via the
 * lock-gate so the user isn't yanked off PIN entry mid-flow.
 *
 * SCRUM-279 (build 44): this function used to route directly to
 * /(auth)/sign-in on failure. It now goes through requestSignIn() which
 * defers when the user is on the lock screen.
 */
function revalidateInBackground(previousDestination: string, isLocked: boolean) {
  // If we just routed the user to the lock screen, the API call here
  // can race with their PIN entry. Skip it entirely; we'll validate
  // again after the unlock fires from lock-screen.tsx.
  if (previousDestination.startsWith('/(security)/lock-screen')) return;

  void (async () => {
    try {
      const result = await checkSession();
      if (!result.authenticated || !result.user) {
        // ─── BUG #17 FIX (Ken 2026-08-07) ───────────────────────────
        // Only route to sign-in when the BACKEND definitively rejected
        // the session. `indeterminate` means we couldn't reach the
        // backend at all (network error / 5xx / timeout) — the tokens
        // are still in Keychain and are probably fine. Previously ANY
        // failure landed here and called requestSignIn(), and because
        // 'splash_revalidate_failed' is in BYPASS_LOCK_REASONS it
        // routed straight past the PIN screen to sign-in. That is the
        // "app opens on the sign-in screen for no reason" report.
        //
        // On `indeterminate` we keep the user exactly where they are,
        // on cached data. The next request that genuinely 401s will
        // still sign them out through the normal interceptor path.
        if (result.reason === 'indeterminate') return;
        // Token invalidated server-side — defer the sign-in via the gate.
        await requestSignIn('splash_revalidate_failed');
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
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [state, setState] = useState<GateState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const run = useCallback(async () => {
    setState('loading');

    // Safety net: cap the entire boot pipeline at 12 seconds. If any
    // step hangs — SecureStore stall, requestSignIn miss (the COS-348
    // bug), network call without a timeout, anything new in the chain
    // we haven't accounted for — drop the user at sign-in rather than
    // leaving them on the spinner forever. A re-sign-in is a much
    // smaller hit than "the app is broken, reinstall it."
    let safetyFallbackFired = false;
    const safetyTimeout = setTimeout(() => {
      safetyFallbackFired = true;
      router.replace('/(auth)/sign-in' as never);
      SplashScreen.hideAsync().catch(() => {});
    }, 12_000);

    try {
      // Step 1: Read token + cached profile in parallel. Both are local reads
      // (SecureStore + AsyncStorage) — no network.
      // BUG #17, attempt 3. Corroborate BEFORE deciding "no session".
      //
      // A PIN on disk or a cached profile means this device has signed in
      // before, so an empty token read is far more likely to be a Keychain
      // that has not woken up than a real sign-out. readSessionPresence uses
      // that to retry the read and, if it still comes back empty, to say
      // 'indeterminate' rather than 'absent'.
      //
      // Ken 2026-08-11: first launch → sign-in, force-close → PIN screen.
      // The token was there the whole time; the first read had not settled.
      const [cachedProfile, pinConfigured] = await Promise.all([
        getCachedProfile(),
        isPinSetup().catch(() => false),
      ]);
      const presence = await readSessionPresence({
        expectSession: pinConfigured || cachedProfile !== null,
      });

      if (presence === 'indeterminate') {
        // Same rule the COS-353 catch below already applies to a THROWN read
        // failure: this is not a sign-out condition. Unlocking re-reads the
        // token once the Keychain is available, and the unlock path forces a
        // real sign-in if the session turns out to be genuinely gone.
        if (pinConfigured) {
          router.replace('/(security)/lock-screen' as never);
        } else {
          // Say what actually happened. Retry re-runs run(), which re-reads
          // the Keychain — by then warm — and routes normally.
          setState('session-unreadable');
        }
        return;
      }

      if (presence === 'absent') {
        await requestSignIn('splash_no_session');
        return;
      }

      // Step 2: Optimistic path — if we have a cached profile, route immediately
      // and revalidate against the backend in the background. This is the hot
      // path for returning users and collapses splash time from 1-5s to ~200ms.
      if (cachedProfile) {
        const destination = await getDestination(cachedProfile, isLocked);
        router.replace(destination as never);
        revalidateInBackground(destination, isLocked);
        // SCRUM-279 (build 50): warm home + calendar caches in
        // parallel so the user doesn't see empty cards while each
        // screen re-fetches on first visit. Skips if destination is
        // an onboarding / lock screen — no data to show yet.
        if (destination === '/Home') prefetchAfterAuth({ force: true });
        return;
      }

      // Step 3: No cache (first launch after this version shipped, or after
      // sign-out). Fall back to the original blocking flow: validate session
      // with backend before routing.
      const result = await checkSession();
      if (!result.authenticated || !result.user) {
        // BUG #17 FIX (Ken 2026-08-07) — see revalidateInBackground above.
        // This is the no-cached-profile path, so we can't route optimistically;
        // but an INDETERMINATE result still must not sign the user out. We
        // have tokens (hasSession was true to get here) and merely couldn't
        // reach /v1/auth/me. Surface the offline state and let them retry
        // instead of destroying a valid session.
        if (result.reason === 'indeterminate') {
          setState('no-internet');
          return;
        }
        await requestSignIn('splash_revalidate_failed');
        return;
      }

      const destination = await getDestination(result.user, isLocked);
      router.replace(destination as never);
      if (destination === '/Home') prefetchAfterAuth({ force: true });
    } catch (err: unknown) {
      // If the safety timeout already fired and routed the user, don't
      // double-route or stomp on whatever state they're now in.
      if (safetyFallbackFired) return;
      const isNetworkError =
        err instanceof Error && (err as Error & { code?: string }).code === 'NETWORK_ERROR';
      if (isNetworkError) {
        setState('no-internet');
      } else {
        // COS-353: a token/SecureStore READ failure on cold start (iOS
        // Keychain not ready right after unlock, or the expo-modules read
        // race) is NOT a sign-out condition. A PIN-configured user almost
        // certainly has a session, so route to the lock screen — unlocking
        // re-reads the token once the Keychain is available, and the unlock
        // path self-corrects (forces a real sign-in) if the session is
        // genuinely gone. Only fall back to sign-in when there's no PIN.
        const pinConfigured = await isPinSetup().catch(() => false);
        if (pinConfigured) {
          router.replace('/(security)/lock-screen' as never);
        } else {
          await requestSignIn('unrecoverable');
        }
      }
    } finally {
      clearTimeout(safetyTimeout);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLocked]);

  useEffect(() => {
    run();
  }, [run, retryKey]);

  if (state === 'no-internet' || state === 'session-unreadable') {
    const unreadable = state === 'session-unreadable';
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.offlineIcon]}>{unreadable ? '🔐' : '📵'}</Text>
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
          {unreadable ? 'Could not open your session' : 'No Internet Connection'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          {unreadable
            ? 'This usually clears straight away. Tap retry to continue.'
            : 'Check your connection and try again.'}
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
