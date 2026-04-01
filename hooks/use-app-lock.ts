import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { useSecurity } from '@/stores/security-store';
import { getLockTimeout, isPinSetup } from '@/services/pin-auth';

export function useAppLock() {
  const { setIsLocked, isPinConfigured } = useSecurity();
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);

  useEffect(() => {
    if (!isPinConfigured) return;

    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current.match(/active/) && nextState === 'background') {
        backgroundTime.current = Date.now();
      }

      if (appState.current.match(/background/) && nextState === 'active') {
        if (backgroundTime.current) {
          const elapsed = Date.now() - backgroundTime.current;
          const timeout = await getLockTimeout();
          if (elapsed > timeout) {
            const pinSetup = await isPinSetup();
            if (pinSetup) {
              setIsLocked(true);
              router.replace('/(security)/lock-screen' as never);
            }
          }
          backgroundTime.current = null;
        }
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isPinConfigured, setIsLocked]);
}
