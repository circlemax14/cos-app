/**
 * MedsSignalContext (COS-475, Phase 6.4).
 *
 * Elevates the `openMedsAddSignal` counter (previously a local useState
 * in app/Home/health-plan.tsx) to a shared context so the v2 plan screen
 * can trigger the meds-add flow via deep-link without prop drilling.
 *
 * Back-compat: the shape mirrors the previous `useState<number>(0)` +
 * `setState((n) => n + 1)` pattern exactly — legacy consumers see the
 * same monotonic counter increment.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface MedsSignalContextValue {
  openMedsAddSignal: number;
  bump: () => void;
}

const MedsSignalContext = createContext<MedsSignalContextValue | null>(null);

export function MedsSignalProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [openMedsAddSignal, setOpenMedsAddSignal] = useState(0);
  const bump = useCallback(() => {
    setOpenMedsAddSignal((n) => n + 1);
  }, []);
  const value = useMemo(
    () => ({ openMedsAddSignal, bump }),
    [openMedsAddSignal, bump],
  );
  return (
    <MedsSignalContext.Provider value={value}>
      {children}
    </MedsSignalContext.Provider>
  );
}

/**
 * Consumer. Returns a no-op / 0 default when called outside a Provider so
 * legacy screens that mount without the provider don't crash.
 */
export function useMedsSignal(): MedsSignalContextValue {
  const ctx = useContext(MedsSignalContext);
  if (ctx) return ctx;
  return { openMedsAddSignal: 0, bump: () => {} };
}
