import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
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

  if (!isReady) return null;

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
