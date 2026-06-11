import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';
import { router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSecurity } from '@/stores/security-store';
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
          const timeout = await getLockTimeout();
          // SCRUM-279 (build 42): never re-lock if we're already on
          // the lock screen (PIN entry shouldn't reset itself) AND
          // require a minimum debounce so OS-induced sub-second
          // background flickers don't trigger a re-lock.
          const onLockScreen = (lastPathRef.current ?? pathname ?? '').startsWith('/(security)/lock-screen');
          const effectiveTimeout = Math.max(timeout, MIN_BG_DEBOUNCE_MS);
          if (elapsed >= effectiveTimeout && !onLockScreen) {
            const pinSetup = await isPinSetup();
            if (pinSetup) await captureAndLock();
          }
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
