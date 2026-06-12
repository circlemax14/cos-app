/**
 * App-wide calendar snapshot sync (SCRUM-279 build 46).
 *
 * Ken's spec: "we need to fetch native calendar event every 15 mins so
 * our app and db has all data every time" + "we need to always
 * maintain sync between different devices".
 *
 * iOS only runs BackgroundFetch tasks (`services/calendar-sync.ts`)
 * opportunistically — often less frequently than the 15-min hint —
 * so we can't rely on it alone. This hook adds an extra layer:
 *
 *   • Once on first mount (warm the DB on cold launch).
 *   • Every time the app returns to the foreground (active state).
 *   • Throttled to once-per-MIN_INTERVAL so we don't hammer the API
 *     if the user rapidly switches apps.
 *
 * It runs from the root layout so it works regardless of which
 * screen the user is on — the calendar tab's existing useFocusEffect
 * is preserved as a redundant guarantee for the case where someone
 * lands there first.
 *
 * No-op if the user hasn't granted calendar permission OR isn't
 * authenticated; both are checked inside buildAndUploadSnapshot's
 * callees so this just fires-and-forgets.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { buildAndUploadSnapshot, registerCalendarSync } from '@/services/calendar-sync';

// Don't upload more often than every 5 minutes from the foreground
// trigger — leaves the 15-min BackgroundFetch as the primary cadence
// while still keeping data fresh when the user is actively using
// the app.
const MIN_FOREGROUND_INTERVAL_MS = 5 * 60_000;

export function useGlobalCalendarSync() {
  const lastUploadAt = useRef<number>(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const uploadIfDue = (reason: string): void => {
    const now = Date.now();
    if (now - lastUploadAt.current < MIN_FOREGROUND_INTERVAL_MS) return;
    lastUploadAt.current = now;
    void buildAndUploadSnapshot().catch(() => {
      // Best-effort — auth / permission / network failures must not
      // crash the root layout. The next foreground re-attempts.
    });
    // Telemetry hook: keep light, no PHI. Useful in dev for confirming
    // the trigger fired without false positives.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[calendar-sync] foreground upload (${reason})`);
    }
  };

  useEffect(() => {
    // Register the BackgroundFetch task too — idempotent if already
    // registered. Belt-and-suspenders so a fresh install starts
    // background sync the moment the user passes the splash gate.
    void registerCalendarSync();

    // SCRUM-279 (build 47): Ken's "as soon as we open app, we fetch
    // it and send to backend" — bypass the 5-min throttle on the
    // very first mount so a cold launch always pushes a fresh
    // snapshot to the DB. lastUploadAt stays 0 until the first
    // successful run so this is effectively "always upload on
    // cold start".
    void buildAndUploadSnapshot()
      .then(() => { lastUploadAt.current = Date.now(); })
      .catch(() => { /* best-effort */ });

    const sub = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appState.current.match(/inactive|background/);
      const becomingActive = nextState === 'active';
      if (wasInactive && becomingActive) {
        uploadIfDue('foreground');
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);
}
