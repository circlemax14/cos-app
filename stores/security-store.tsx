import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import BootSplash from '@/components/BootSplash';
import { isPinSetup, isBiometricEnabled } from '@/services/pin-auth';
import { setAppLocked } from '@/lib/lock-gate';

interface SecurityContextType {
  isPinConfigured: boolean;
  isBiometricConfigured: boolean;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  refreshSecurityState: () => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [isPinConfigured, setIsPinConfigured] = useState(false);
  const [isBiometricConfigured, setIsBiometricConfigured] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isReady, setIsReady] = useState(false);

  const refreshSecurityState = async () => {
    const pinSetup = await isPinSetup();
    const bioEnabled = await isBiometricEnabled();
    setIsPinConfigured(pinSetup);
    setIsBiometricConfigured(bioEnabled);
    // If PIN is not set up, don't lock
    if (!pinSetup) {
      setIsLocked(false);
    }
  };

  useEffect(() => {
    refreshSecurityState().finally(() => setIsReady(true));
  }, []);

  // SCRUM-279 (build 44): mirror isLocked into the module-scoped
  // lock-gate so api-client / SplashGate / etc. can consult it
  // without prop-drilling. See lib/lock-gate.ts for context.
  useEffect(() => {
    setAppLocked(isLocked);
  }, [isLocked]);

  /*
   * COS-1226 — this was `return null`.
   *
   * It holds the ENTIRE app — this provider wraps the Stack and PlanBootGate —
   * until two SecureStore reads resolve, and the native splash is still up at
   * that point (held at module load in app/_layout.tsx, hidden only by
   * app/index.tsx, which is a route inside the Stack below). So "render
   * nothing" meant: invisible under a splash that nothing was going to lift.
   * Normally ~500ms and nobody notices; when the Keychain does not come back,
   * it is a frozen splash with no explanation and no way out.
   *
   * The hold itself stays. isLocked defaults to `true` and only
   * refreshSecurityState() can clear it, so rendering children early would let
   * app/index.tsx route on a lock state that is not known yet — a PHI decision.
   * It now holds behind the same screen as every other pre-first-screen state,
   * which hands the splash over as soon as it has painted.
   */
  if (!isReady) return <BootSplash />;

  return (
    <SecurityContext.Provider
      value={{
        isPinConfigured,
        isBiometricConfigured,
        isLocked,
        setIsLocked,
        refreshSecurityState,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within SecurityProvider');
  }
  return context;
}
