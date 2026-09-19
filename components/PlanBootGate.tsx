/**
 * COS-1061 — do not draw the app until we know which screens it has.
 *
 * ─── THE BUG THIS FIXES ──────────────────────────────────────────────
 *
 * Vishal: *"as of now all the features are available in the app and the app
 * opens until we load the plan, and based on the plan we hide those screens —
 * like calendar is not available in that plan but the calendar option is
 * available till the time data is loading. So show a full page loader while
 * the data is loading, and when the plan data is fetched, then we show the
 * screens which are available."*
 *
 * `useCanShowScreen` defaults to VISIBLE while the query is in flight, and
 * that default is correct — hiding a patient's navigation because the network
 * is slow is worse than briefly showing a tab. But "briefly showing" is the
 * problem: the tab bar draws with every screen in it and then visibly
 * retracts, which reads as the app taking something away.
 *
 * The fix is not to flip the default to hidden. It is to not render the
 * decision at all until there IS one.
 *
 * ─── WHY THIS IS SAFE TO PUT IN FRONT OF THE WHOLE APP ───────────────
 *
 * Because it almost never shows. It asks the disk cache first, so a patient
 * who has opened the app before renders immediately from their last-known map
 * while the live fetch refreshes behind them. The loader is for a genuine
 * first run.
 *
 * And it never blocks the unauthenticated app. Sign-in, onboarding and the PIN
 * screen have no plan to wait for, and gating them would mean a patient who is
 * signed out waits for a 401 before being allowed to sign in.
 *
 * ─── WHAT HAPPENS WHEN IT NEVER ARRIVES ──────────────────────────────
 *
 * Vishal asked for it directly: *"after sometime give a message, something
 * happened and try again later, and a try again button."*
 *
 * After BOOT_TIMEOUT_MS the gate stops waiting and shows the existing
 * ConnectionErrorScreen with its retry. That screen's copy is load-bearing and
 * is reused rather than rewritten — COS-890 split "no internet" from "could
 * not read your session" precisely because a wrong-but-plausible message sent
 * Ken to check his wifi for a Keychain problem.
 *
 * The timeout is generous on purpose. It is not a performance budget — it is
 * the point past which waiting longer tells the patient nothing they cannot
 * already see.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ConnectionErrorScreen from '@/components/ConnectionErrorScreen';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import {
  hydrateScreenAccessCache,
  persistScreenAccess,
  readCachedScreenAccess,
} from '@/lib/screen-access-cache';
import { readSessionPresence } from '@/lib/auth-tokens';

/**
 * Twelve seconds. Long enough to cover a cold Lambda behind a slow connection
 * — the /feature-permissions call fans out to the entitlements resolver and a
 * DynamoDB read — and short enough that nobody sits staring at a spinner
 * wondering whether the app has hung.
 */
export const BOOT_TIMEOUT_MS = 12_000;

export function PlanBootGate({ children }: { children: React.ReactNode }) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [cacheReady, setCacheReady] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);

  const { data, isError, isLoading, refetch } = useFeaturePermissions();

  // Is anyone signed in? An 'indeterminate' read means the Keychain has not
  // woken up — treated as signed-in so the gate waits rather than waving an
  // unauthenticated-looking user through, which is the COS-890 failure.
  React.useEffect(() => {
    let alive = true;
    void readSessionPresence()
      .then((p) => {
        if (alive) setSignedIn(p !== 'absent');
      })
      .catch(() => {
        // Could not tell. Wait rather than skip — the live query settles it.
        if (alive) setSignedIn(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    void hydrateScreenAccessCache().finally(() => {
      if (alive) setCacheReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Whenever a real answer lands it becomes the new last-known state. Guarded
  // inside persistScreenAccess: an absent or empty map is never stored.
  React.useEffect(() => {
    void persistScreenAccess(data?.screens, data?.launched);
  }, [data]);

  // The clock only runs while we are actually waiting, and is reset by a retry
  // so the second attempt gets a full window rather than whatever was left.
  const waiting = signedIn === true && !data && !isError;
  React.useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  const retry = React.useCallback(() => {
    setTimedOut(false);
    void refetch();
  }, [refetch]);

  // Not signed in — nothing to wait for. Sign-in, onboarding and the PIN screen
  // render exactly as before.
  if (signedIn === false) return <>{children}</>;

  // A live answer is in hand.
  if (data) return <>{children}</>;

  // No live answer yet, but this device has one from last time. Render from it
  // — the whole reason the cache exists. The live fetch keeps running.
  if (cacheReady && readCachedScreenAccess()) return <>{children}</>;

  if (isError || timedOut) {
    return <ConnectionErrorScreen variant="error" onRetry={retry} />;
  }

  // Genuinely unknown: first run, still fetching. This is the loader.
  if (signedIn === null || isLoading || !cacheReady) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your plan"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Setting up your app…
        </Text>
      </View>
    );
  }

  // Settled, signed in, no data and no error. Nothing left to wait for, so
  // render rather than hold the app on a spinner forever.
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    marginTop: 14,
    textAlign: 'center',
  },
});

export default PlanBootGate;
