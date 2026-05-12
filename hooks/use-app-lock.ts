import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useSecurity } from '@/stores/security-store';
import { getLockTimeout, isPinSetup } from '@/services/pin-auth';

/**
 * Default idle window before the app auto-locks while in the foreground.
 * Matches the web's useInactivityTimeout default (SCRUM-170) so the two
 * platforms behave identically when a user walks away from the device.
 */
const IDLE_LOCK_MS = 15 * 60 * 1000;

export function useAppLock() {
  const { setIsLocked, isPinConfigured } = useSecurity();
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (pinSetup) {
          setIsLocked(true);
          router.replace('/(security)/lock-screen' as never);
        }
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
          if (elapsed >= timeout) {
            const pinSetup = await isPinSetup();
            if (pinSetup) {
              setIsLocked(true);
              router.replace('/(security)/lock-screen' as never);
            }
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
