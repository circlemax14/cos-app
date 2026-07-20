/**
 * useOfflineStatus (COS-475, Phase 6.4).
 *
 * ⚠️ 2026-07-20 IOS 26 BYPASS #2 — hook body stubbed to a no-op after
 * bypass #1 (accordion collapse) landed and Ken still hit a SIGABRT
 * ~30s after launching v2. Thread-8 stack proved the crash was a
 * JS-initiated NSInvocation call into a legacy bridge module — exactly
 * the surface this hook's setInterval+fetch+AppState.addEventListener
 * combo hits every 15s. Neutering the hook proves whether the timer
 * path is the trigger.
 *
 * Original body preserved in git history (commit c069741^). If Ken's
 * next test on 2026-07-20 also crashes, this hook was NOT the trigger
 * and we fall through to bypass #3 (AsyncStorage migration no-op) then
 * bypass #4 (Swipeable→View wrapper). Real fix is Path A —
 * merge cos-app#266/267/268 and cut a new binary.
 */

export interface UseOfflineStatusResult {
  offline: boolean;
  /** Manual re-check — resolves with the fresh reachability state. */
  refresh: () => Promise<boolean>;
}

export function useOfflineStatus(): UseOfflineStatusResult {
  return {
    offline: false,
    refresh: async () => true,
  };
}
