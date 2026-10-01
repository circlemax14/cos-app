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
 *
 * ─── COS-1226 — AND IT WAS ALL INVISIBLE ─────────────────────────────
 *
 * Every word above was true and none of it could be SEEN. The native splash is
 * held at module load in app/_layout.tsx and was hidden only by app/index.tsx,
 * which is a route inside the <Stack> this component wraps. So while the gate
 * held, it drew its loader and its retry screen underneath the splash:
 * invisible, and in the retry's case untappable, forever.
 *
 * Three changes, in order of how much they matter:
 *
 *   1. Both held states now hand the splash over (<BootSplash /> on paint, and
 *      an explicit hide for the error screen, which has nothing to decode).
 *   2. The decision moved to lib/boot-gate-decision.ts so every branch is
 *      tested in node, without a renderer.
 *   3. `readSessionPresence()` was called with NO ARGUMENTS, which returns
 *      'absent' for a Keychain that has not woken up (lib/auth-tokens.ts) —
 *      the COS-874 / COS-890 mistake, in the one place that decides whether to
 *      open the app wide. It now corroborates exactly as app/index.tsx does.
 *      That is why this gate's behaviour differed run to run.
 */

import { useQueryClient } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import React from 'react';

import BootSplash from '@/components/BootSplash';
import ConnectionErrorScreen from '@/components/ConnectionErrorScreen';
import {
  FEATURE_PERMISSIONS_QUERY_KEY,
  useFeaturePermissions,
} from '@/hooks/use-feature-permissions';
import { readSessionPresence, type SessionPresence } from '@/lib/auth-tokens';
import { decideBootGate, splashHandover } from '@/lib/boot-gate-decision';
import { getCachedProfile } from '@/lib/cached-profile';
import {
  hydrateScreenAccessCache,
  persistScreenAccess,
  readCachedScreenAccess,
} from '@/lib/screen-access-cache';
import { isPinSetup } from '@/services/pin-auth';

/**
 * Twelve seconds. Long enough to cover a cold Lambda behind a slow connection
 * — the /feature-permissions call fans out to the entitlements resolver and a
 * DynamoDB read — and short enough that nobody sits staring at a spinner
 * wondering whether the app has hung.
 *
 * COS-1226 — this is also the app's one real ceiling on an unexplained boot,
 * which is why no blanket "hide the splash after N seconds" timer was added.
 * A blanket timer helps only when nothing presentable is mounted, and in that
 * case all it can reveal is a blank screen. This path instead guarantees that
 * something presentable IS mounted, and that by twelve seconds it is an error
 * message with a working retry.
 */
export const BOOT_TIMEOUT_MS = 12_000;

/**
 * COS-1069 — how long to hold the loader before falling back to the device's
 * last-known map.
 *
 * The cache exists so a patient on a train is not locked out. It was reading as
 * "render immediately, always", which skipped the loader on every launch after
 * the first — and the whole point of the loader is that the plan is resolved
 * BEFORE any screen is drawn. Vishal, twice: *"show a full page loader while
 * the data is loading… when the plan data is fetched, then we show the screens
 * which are available."*
 *
 * So the cache is a FALLBACK, not a fast path. A normal fetch answers in a few
 * hundred milliseconds and the `data` branch fires first, so this timer is
 * rarely reached — it bounds the wait for a slow network rather than adding
 * one. Short enough that nobody stares at a spinner; long enough that a healthy
 * connection always gets the live answer.
 */
export const CACHE_FALLBACK_MS = 2_500;

export function PlanBootGate({ children }: { children: React.ReactNode }) {
  const [presence, setPresence] = React.useState<SessionPresence | null>(null);
  const [cacheReady, setCacheReady] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  /** COS-1069 — false until the live fetch has had CACHE_FALLBACK_MS to answer. */
  const [mayUseCache, setMayUseCache] = React.useState(false);
  /** Bumped by a retry, so the clocks below start over rather than never again. */
  const [attempt, setAttempt] = React.useState(0);

  const queryClient = useQueryClient();
  const { data, isError, isFetching, isLoading, refetch } = useFeaturePermissions();

  /*
   * Is anyone signed in?
   *
   * COS-1226 — this was `readSessionPresence()` with no argument. Without
   * `expectSession`, lib/auth-tokens.ts does NOT retry a null read and reports
   * 'absent' rather than 'indeterminate' — so on a cold start, where the iOS
   * Keychain returns nil without throwing, the gate concluded "signed out" and
   * opened the app wide. That is the flash COS-1061 exists to remove, and it is
   * why the gate behaved differently run to run.
   *
   * The corroboration is the same pair app/index.tsx uses (:204) and the same
   * one services/pin-auth.ts and lib/api-client.ts settled on: a PIN on disk or
   * a cached profile means this device HAS signed in, so an empty read is far
   * more likely to be an unwoken Keychain than a sign-out.
   *
   * ponytail: isPinSetup() costs ~450ms of backoff on a device with no PIN
   * (its own docstring), and app/index.tsx pays it again moments later. Both
   * reads are behind this screen, which looks exactly like the splash that was
   * already up, so the cost is invisible. Deduplicate it only if a launch
   * profile says it matters.
   */
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const [cachedProfile, pinConfigured] = await Promise.all([
        getCachedProfile(),
        isPinSetup().catch(() => false),
      ]);
      const read = await readSessionPresence({
        expectSession: pinConfigured || cachedProfile !== null,
      });
      if (alive) setPresence(read);
    })().catch(() => {
      // Could not tell. 'indeterminate' waits rather than skipping, and — unlike
      // claiming 'present' — it will not blame the account when the wait fails.
      if (alive) setPresence('indeterminate');
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

  /*
   * The clocks only run while we are actually waiting.
   *
   * `attempt` is in the deps because without it a retry could never time out
   * again: `waiting` does not change across a retry that is still waiting, so
   * the effect never re-ran, the cleared timer was never replaced, and the
   * second attempt spun forever. The comment here used to claim the retry got
   * "a full window"; it got none.
   *
   * An in-flight retry counts as waiting even though `isError` is still true —
   * react-query keeps the error status until the refetch resolves.
   */
  const signedIn = presence === null ? null : presence !== 'absent';
  const waiting = signedIn === true && !data && (!isError || isFetching);

  React.useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [waiting, attempt]);

  React.useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setMayUseCache(true), CACHE_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [waiting, attempt]);

  const retry = React.useCallback(() => {
    setTimedOut(false);
    setMayUseCache(false);
    setAttempt((n) => n + 1);
    /*
     * COS-1226 — cancel first, or the retry is a no-op.
     *
     * Verified in @tanstack/query-core/build/modern/query.js `fetch()`: when a
     * fetch is already in flight it honours `cancelRefetch` only
     * `if (this.state.data !== void 0`, and otherwise returns the EXISTING
     * retryer promise. On this path data is undefined by definition, so on the
     * case that matters most — timed out with the request still pending —
     * `refetch()` alone re-rendered and waited on the same stuck request.
     * (After a real error the retryer is 'rejected' and refetch does start a
     * fresh one, which is why this looked like it worked.)
     */
    void queryClient
      .cancelQueries({ queryKey: FEATURE_PERMISSIONS_QUERY_KEY, exact: true })
      .catch(() => {})
      .then(() => refetch());
  }, [queryClient, refetch]);

  const decision = decideBootGate({
    presence,
    hasPlan: !!data,
    hasCachedPlan: readCachedScreenAccess() !== null,
    cacheReady,
    mayUseCache,
    isError,
    isFetching,
    isLoading,
    timedOut,
  });

  /*
   * COS-1226 — the error screen has nothing to decode, so its commit is its
   * paint and the splash can go immediately. <BootSplash /> hides the splash
   * itself, on image load, for the reason given in that file.
   */
  React.useEffect(() => {
    if (splashHandover(decision) === 'now') SplashScreen.hideAsync().catch(() => {});
  }, [decision]);

  if (decision === 'app') return <>{children}</>;
  if (decision === 'error') return <ConnectionErrorScreen variant="error" onRetry={retry} />;

  return (
    <BootSplash
      label="Setting up your app…"
      sublabel="Checking which features your plan includes"
    />
  );
}

export default PlanBootGate;
