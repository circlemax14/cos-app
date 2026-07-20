/**
 * PlanV2SessionState — screen-scoped context for the interactive Plan v2
 * screen (COS-475, Phase 6.4 — round 2).
 *
 * Holds two pieces of ephemeral state that need to be shared between the
 * swipeable rows and the CareManagerToastHost:
 *
 *  - `featureDisabled` — flips to true on the FIRST FEATURE_DISABLED
 *    (404) response from any swipe handler. Every subsequent swipe then
 *    short-circuits locally (no network round-trip, no revert flicker).
 *    Resets on the next successful /v1/plan poll or pull-to-refresh so
 *    the flag can re-flip mid-session without a reload.
 *
 *  - `swipeInFlight` — true while any row's Swipeable is open. The
 *    care-manager toast defers its slide-in until this clears so the
 *    incoming toast doesn't cover an actively-open row's actions.
 *
 * Provider lives at the top of PlanScreenV2's mount tree so both
 * SwipeableRow subtrees AND the sibling CareManagerToastHost can see it.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface PlanV2SessionValue {
  featureDisabled: boolean;
  markFeatureDisabled: () => void;
  clearFeatureDisabled: () => void;
  swipeInFlight: boolean;
  setSwipeInFlight: (v: boolean) => void;
}

const noop = () => {};

const DEFAULT_VALUE: PlanV2SessionValue = {
  featureDisabled: false,
  markFeatureDisabled: noop,
  clearFeatureDisabled: noop,
  swipeInFlight: false,
  setSwipeInFlight: noop,
};

const PlanV2SessionContext = createContext<PlanV2SessionValue>(DEFAULT_VALUE);

export interface PlanV2SessionProviderProps {
  children: React.ReactNode;
}

export function PlanV2SessionProvider({
  children,
}: PlanV2SessionProviderProps): React.JSX.Element {
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [swipeInFlight, setSwipeInFlightState] = useState(false);

  const markFeatureDisabled = useCallback(() => setFeatureDisabled(true), []);
  const clearFeatureDisabled = useCallback(() => setFeatureDisabled(false), []);
  const setSwipeInFlight = useCallback((v: boolean) => setSwipeInFlightState(v), []);

  const value = useMemo<PlanV2SessionValue>(
    () => ({
      featureDisabled,
      markFeatureDisabled,
      clearFeatureDisabled,
      swipeInFlight,
      setSwipeInFlight,
    }),
    [
      featureDisabled,
      markFeatureDisabled,
      clearFeatureDisabled,
      swipeInFlight,
      setSwipeInFlight,
    ],
  );

  return (
    <PlanV2SessionContext.Provider value={value}>
      {children}
    </PlanV2SessionContext.Provider>
  );
}

export function usePlanV2Session(): PlanV2SessionValue {
  return useContext(PlanV2SessionContext);
}
