import { useRef } from 'react';
import { rootIdleActivityHandlers } from '@/hooks/use-app-lock';

/**
 * Touch-activity feeder for the app-lock idle timer.
 *
 * ─── BUG #18 FIX (Ken 2026-08-07) ───────────────────────────────────
 * This hook USED to be a second, independent lock router: it kept its
 * own 15-minute timer AND its own `AppState` listener, and on expiry it
 * called `router.replace('/(security)/lock-screen')` directly.
 *
 * That duplicated `useAppLock` (hooks/use-app-lock.ts), which already
 * implements the same 15-minute idle lock — but correctly: it sets
 * `isLocked` on the security store, mirrors `_appLocked` into the
 * lock-gate module, and stashes the pre-lock route so the user returns
 * to where they were after unlocking.
 *
 * Because THIS hook bypassed all of that, it could route to the lock
 * screen while the store still believed the app was unlocked. The lock
 * screen fires its biometric prompt from a mount effect, so every extra
 * `router.replace` to it is an extra Face-ID prompt — contributing to
 * the "Face ID three times" report alongside the stale-pathname bug
 * fixed in use-app-lock.ts. Two AppState listeners racing on resume
 * also made the ordering non-deterministic, which is why the symptom
 * was intermittent rather than constant.
 *
 * WHAT REMAINS: a pure `panHandlers` provider that forwards observed
 * touches into the SAME module-scoped idle timer `useAppLock` owns, so
 * activity anywhere in the tree resets exactly one timer. The public
 * API (`{ panHandlers }`) is unchanged, so the call site in
 * app/Home/_layout.tsx needs no edit.
 *
 * The 15-minute PHI auto-lock is NOT removed — it still runs, in
 * useAppLock, where it can participate in the lock-gate properly.
 */
export function useInactivityTimeout() {
  // One responder instance per hook lifetime. rootIdleActivityHandlers()
  // returns a PanResponder whose capture handlers poke useAppLock's
  // shared idle timer and never consume the gesture.
  const responder = useRef(rootIdleActivityHandlers()).current;
  return { panHandlers: responder.panHandlers };
}
