import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';
import { router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSecurity } from '@/stores/security-store';
import { isAppLocked, setAppLocked, hasPendingSignIn } from '@/lib/lock-gate';
import { computeResumeLockDecision } from '@/lib/resume-lock-decision';
import { getLockTimeout, isPinSetup } from '@/services/pin-auth';

/**
 * SCRUM-279 (2026-06-11 build 42): minimum debounce for active→background
 * →active transitions before re-locking. Ken reported double-PIN entry on
 * iPad: the FaceID modal animation (and Stage Manager gestures) trigger
 * sub-second AppState flickers — with the default lock timeout of 0ms,
 * those flickers re-fire captureAndLock and bounce the user back to the
 * lock screen mid-PIN-entry. 2s covers all OS-induced flickers while
 * still locking promptly when the user genuinely backgrounds the app.
 */
const MIN_BG_DEBOUNCE_MS = 2000;

/**
 * Default idle window before the app auto-locks while in the foreground.
 * Matches the web's useInactivityTimeout default (SCRUM-170) so the two
 * platforms behave identically when a user walks away from the device.
 */
const IDLE_LOCK_MS = 15 * 60 * 1000;

/**
 * AsyncStorage key for "where to return the user after they unlock". Set
 * the moment we route to the lock screen; read + cleared from the lock
 * screen's unlock handler. Without this, every unlock dumps the user on
 * /Home regardless of what they were doing.
 */
export const PRE_LOCK_ROUTE_KEY = 'csh-pre-lock-route';

// Routes we should NEVER restore to (auth / lock / onboarding loops).
const RESTORE_BLOCKLIST = ['/(security)/lock-screen', '/(auth)', '/(onboarding)', '/(security)'];

function shouldRestore(path: string | null | undefined): boolean {
  if (!path) return false;
  return !RESTORE_BLOCKLIST.some((b) => path.startsWith(b));
}

export function useAppLock() {
  const { setIsLocked, isPinConfigured } = useSecurity();
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // usePathname re-runs on every navigation. Mirror it into a ref so the
  // AppState/idle handlers (which capture state on first render) can read
  // the LATEST path when they fire — not whatever it was at mount.
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (shouldRestore(pathname)) lastPathRef.current = pathname;
  }, [pathname]);

  const captureAndLock = async () => {
    const last = lastPathRef.current;
    if (shouldRestore(last)) {
      try { await AsyncStorage.setItem(PRE_LOCK_ROUTE_KEY, last as string); } catch { /* swallow */ }
    }
    setIsLocked(true);
    router.replace('/(security)/lock-screen' as never);
  };

  // ─── Foreground idle timer ───────────────────────────────────────────
  // Resets on every touch / move / swipe via the root PanResponder below.
  // When the timer fires we set isLocked=true and route to the lock screen
  // exactly like the background-lock path does. No sign-out — the Cognito
  // tokens in Keychain stay valid, the user just needs the PIN to resume.
  useEffect(() => {
    if (!isPinConfigured) return;

    const resetIdleTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        const pinSetup = await isPinSetup();
        if (pinSetup) await captureAndLock();
      }, IDLE_LOCK_MS);
    };

    // Arm it on mount and reset on every detected touch via the global
    // PanResponder. We expose the reset function on the panResponder ref
    // so the touch handler downstream can poke it.
    resetIdleTimer();
    idleResetRef.current = resetIdleTimer;

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleResetRef.current = null;
    };
  }, [isPinConfigured, setIsLocked]);

  // ─── Background-to-foreground lock ───────────────────────────────────
  // (existing behaviour — preserved exactly)
  useEffect(() => {
    if (!isPinConfigured) return;

    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current.match(/active/) && nextState === 'background') {
        backgroundTime.current = Date.now();
      }

      if (appState.current.match(/background/) && nextState === 'active') {
        if (backgroundTime.current !== null) {
          const elapsed = Date.now() - backgroundTime.current;

          // SCRUM-520 (COS-379): capture the REAL prior lock state before the
          // async getLockTimeout() gap. The security-store initialises
          // `isLocked` to `true` and the mirror effect syncs it — so
          // `isAppLocked()` can be `true` even when the user was NOT locked
          // (first cold-launch before refreshSecurityState resolves). Snapping
          // wasLocked here avoids misreading that stale mirror.
          const wasLocked = isAppLocked();

          // SCRUM-520 (COS-379): win the 401 race. If the app was NOT already
          // locked, force the module mirror to `true` NOW — synchronously,
          // before the `await getLockTimeout()` gap — so any racing 401 from
          // React Query refetches / calendar sync fires `requestSignIn` into
          // the deferred queue instead of routing straight to /(auth)/sign-in.
          // We use `wasLocked` (not the now-forced mirror) for all subsequent
          // guard logic so the COS-351 Face-ID-flicker fix is unaffected.
          if (!wasLocked) setAppLocked(true);

          const timeout = await getLockTimeout();

          // SCRUM-279 (build 42) + COS-351: never re-lock if we are ALREADY
          // locked AND on the lock screen — PIN entry shouldn't reset itself,
          // and Face-ID dismissal shouldn't re-fire captureAndLock (the
          // "unlock → flash of PIN screen" race COS-351 fixed).
          //
          // SCRUM-520 (COS-379) guard change — see lib/resume-lock-decision.ts:
          //   BEFORE: `isAppLocked() || onLockScreen`  — OR means the
          //           stale-`true` module mirror short-circuited every warm
          //           resume and suppressed the PIN route entirely.
          //   AFTER:  `wasLocked && onLockScreen`     — AND means we only
          //           skip if the user was GENUINELY mid-unlock (on the lock
          //           screen with the mirror already set). A normal resume
          //           where wasLocked=false now falls through to captureAndLock.
          const { alreadyLocked } = computeResumeLockDecision({ wasLocked, pathname });

          const effectiveTimeout = Math.max(timeout, MIN_BG_DEBOUNCE_MS);
          let didLock = false;

          if (elapsed >= effectiveTimeout && !alreadyLocked) {
            const pinSetup = await isPinSetup();
            if (pinSetup) {
              await captureAndLock();
              didLock = true;
            }
          }

          // SCRUM-520 (COS-379): cleanup for the forced-mirror path.
          // If we forced the mirror to `true` but did NOT end up calling
          // captureAndLock (below-debounce flicker, no PIN, or alreadyLocked),
          // we must decide what to do with the temporarily-forced state:
          //
          //   • A pending sign-in was queued during the window → the session
          //     is dead. Lock local-first so the lock screen drains the queue
          //     and re-authenticates after unlock. This is the conservative /
          //     secure path (SCRUM-520 design doc).
          //   • No pending sign-in → benign flicker or active session. Restore
          //     the mirror to `false` so we don't strand the app in a
          //     permanently-locked state that no unlock path can clear.
          if (!wasLocked && !didLock) {
            if (hasPendingSignIn()) {
              // Dead session detected during the race window; lock local-first.
              // captureAndLock routes to /(security)/lock-screen; postUnlockNavigate
              // will drain the pending reason and send the user to sign-in.
              const pinSetup = await isPinSetup();
              if (pinSetup) {
                await captureAndLock();
                // didLock is true from here; mirror stays locked (self-synced).
              } else {
                // No PIN — can't lock locally; release immediately to sign-in.
                setAppLocked(false);
              }
            } else {
              // Benign flicker / short background nap / live session.
              // Restore the mirror so nothing is stranded.
              setAppLocked(false);
            }
          }
          // If captureAndLock() ran (didLock=true OR the dead-session branch
          // above ran), the mirror stays `true`. The security-store effect and
          // postUnlockNavigate will set it to `false` after successful unlock.

          backgroundTime.current = null;
        }
        // Coming back to foreground after a non-locking nap — restart
        // the idle timer fresh so the next 15 min starts here.
        if (idleResetRef.current) idleResetRef.current();
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isPinConfigured, setIsLocked]);
}

/**
 * Set by useAppLock so the root PanResponder can poke the idle timer
 * on every touch. Module-scoped so multiple consumers don't need to
 * thread a ref through the tree.
 */
const idleResetRef: { current: (() => void) | null } = { current: null };

/**
 * Drop this onto a top-level <View> via {...rootIdleActivityHandlers().panHandlers}
 * to feed the idle timer every detected touch. Doesn't capture / block any
 * gesture — it just observes and resets the timer.
 */
export function rootIdleActivityHandlers() {
  return PanResponder.create({
    onStartShouldSetPanResponderCapture: () => {
      if (idleResetRef.current) idleResetRef.current();
      return false; // never consume the gesture
    },
    onMoveShouldSetPanResponderCapture: () => {
      if (idleResetRef.current) idleResetRef.current();
      return false;
    },
  });
}
