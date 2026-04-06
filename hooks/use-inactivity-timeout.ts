import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { isPinSetup } from '@/services/pin-auth';

// Lock app after 15 minutes of inactivity (healthcare requirement)
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Monitors user activity (touch events and app state changes).
 * Locks the app (shows PIN/biometric screen) after INACTIVITY_TIMEOUT_MS
 * of inactivity, protecting PHI on unattended devices.
 * Does NOT sign the user out — session stays active until refresh token expires.
 *
 * Usage: call this hook once in the authenticated root layout.
 */
export function useInactivityTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const pinConfigured = await isPinSetup();
      if (pinConfigured) {
        // Lock the app — show PIN/biometric screen
        router.replace('/(security)/lock-screen' as never);
      }
      // If PIN is not set up, do nothing — don't sign out
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  // Monitor touch activity via PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetTimer();
        return false; // Don't consume the event — just reset timer
      },
    }),
  ).current;

  // Monitor app foreground/background transitions
  useEffect(() => {
    resetTimer();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        resetTimer();
      } else if (nextState === 'background' || nextState === 'inactive') {
        // Pause the timer when app goes to background
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      subscription.remove();
    };
  }, [resetTimer]);

  return { panHandlers: panResponder.panHandlers };
}
