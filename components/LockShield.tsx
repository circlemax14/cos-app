/**
 * COS-724 — the opaque cover that makes the PIN lock real.
 *
 * ⚠️ NOT WIRED IN. Nothing renders this yet. The single line that activates it
 * is documented at the bottom of lib/lock-render-gate.ts and is deliberately
 * left for a human to add after a device pass. Read the RISK section below
 * before adding it.
 *
 * WHAT IT IS
 * A sibling rendered ABOVE the navigator, not around it. When the gate says
 * `shield`, it draws an opaque view over everything and swallows touches. Since
 * it is not a route, nothing in the navigator can remove it: not a
 * StackRouter REPLACE/POP/PUSH, not the iOS pop gesture, not hardwareBackPress,
 * not a deep link, not a notification tap. All four confirmed bypass vectors
 * terminate here.
 *
 * WHAT IT DELIBERATELY IS NOT
 * It does NOT render the PIN pad. Rendering <LockScreen/> in two places would
 * fire attemptBiometric() from two mount effects — that is the triple-Face-ID
 * bug (BUG #18, Ken 2026-08-07) rebuilt from scratch. app/(security)/lock-screen.tsx
 * stays the single owner of unlock, consumePendingSignIn() and resumeAfterUnlock().
 * This file changes none of that.
 *
 * RENDER PATH IS INERT ON PURPOSE
 * No async work, no network, no SecureStore, no AsyncStorage, no image assets.
 * It reads two contexts and renders View/Text/MaterialIcons. This matters because
 * of where it sits: inside every provider, above the Stack. If it throws on
 * mount, the whole app white-screens. Keep it boring.
 *
 * RISK, STATED PLAINLY
 *   - Wiring it is the highest-blast-radius edit available in this codebase.
 *   - The re-assert effect below is genuinely new behaviour on the resume path,
 *     which is where the triple-Face-ID prompt, the unlock-flash race and
 *     401-during-resume all live. It needs a device pass, not a code review.
 *   - An overlay COVERS, it does not UNMOUNT. React Query keeps fetching while
 *     gated, and an iOS `presentation:'modal'` route is a separately-presented
 *     UIViewController that renders ABOVE a root-level RN overlay — so this
 *     alone does not cover /modal, /agency-detail, /appointments-modal or
 *     /calendar-event-editor. Blocking inbound navigation while locked
 *     (hooks/use-notifications.ts, and a +native-intent.ts for deep links) is
 *     load-bearing, not optional. See lib/lock-render-gate.ts.
 *   - The app-switcher snapshot is untouched and needs a separate privacy view.
 *
 * Rollback: delete the one line that renders this. No native rebuild.
 */

import React from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useSegments } from 'expo-router';
import { useSecurity } from '@/stores/security-store';
import { computeLockGate } from '@/lib/lock-render-gate';

const LOCK_ROUTE = '/(security)/lock-screen';

export function LockShield(): React.ReactElement | null {
  const { isPinConfigured, isLocked } = useSecurity();
  const segments = useSegments();

  // SecurityProvider only renders its children once it is ready, so by the time
  // this mounts the state has resolved. Passed explicitly anyway so the pure
  // module never has to assume it.
  const { shield, trapBack } = computeLockGate({
    isReady: true,
    isPinConfigured,
    isLocked,
    segments: segments as readonly string[],
  });

  // ── Android hardware back ────────────────────────────────────────────────
  // Registered ONLY while trapping. Registering conditionally (rather than
  // always registering and returning `trapBack`) means that when unlocked there
  // is literally no listener, so there is zero chance of interfering with normal
  // back navigation across ~60 screens.
  //
  // This cannot strand anyone: (auth) and (onboarding) are allowlisted out of
  // the trap, so a locked user with a dead session has normal back behaviour;
  // the lock screen offers "Forgot PIN?" and a 5-attempt bailout, both of which
  // route to (auth) and immediately make trapBack false. Worst case, Android's
  // Home/recents/force-quit are untouched and a relaunch degrades to the normal
  // locked state, not a bricked app.
  React.useEffect(() => {
    if (!trapBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [trapBack]);

  // ── Re-assert the lock screen ────────────────────────────────────────────
  // The shield only ever appears because something navigated the user AWAY from
  // the lock screen while still locked (swipe-back pop, notification tap, deep
  // link). Covering the result is not enough — they need the PIN pad back, and
  // it is the only thing that can unlock.
  //
  // Fires once per transition into the shielded state, not on every render, so
  // it cannot become a replace loop. `router.replace` (not push) so the bypassed
  // route does not stay on the stack to be popped back to again.
  //
  // ⚠️ THIS IS THE PART THAT NEEDS DEVICE QA. It interacts with
  // hooks/use-app-lock.ts's lockInFlight guard and its 800ms release window.
  const reasserted = React.useRef(false);
  React.useEffect(() => {
    if (!shield) {
      reasserted.current = false;
      return;
    }
    if (reasserted.current) return;
    reasserted.current = true;
    try {
      router.replace(LOCK_ROUTE as never);
    } catch {
      // Router not ready. The shield still covers, which is the security-critical
      // half; the user can reach the PIN pad on the next navigation or relaunch.
    }
  }, [shield]);

  if (!shield) return null;

  return (
    // pointerEvents defaults to 'auto' — the cover must EAT touches, otherwise
    // the screen underneath is still operable behind an opaque view.
    <View style={styles.cover} accessibilityViewIsModal accessibilityLabel="Locked">
      <MaterialIcons name="lock" size={40} color="#9CA3AF" />
      <Text style={styles.title}>Locked</Text>
      <Text style={styles.body}>Enter your PIN to continue.</Text>
      <Pressable
        onPress={() => {
          try {
            router.replace(LOCK_ROUTE as never);
          } catch {
            // Nothing more to do; the cover stays.
          }
        }}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="Go to the PIN screen"
      >
        <Text style={styles.btnText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    // Fully opaque. A translucent cover would still leak PHI.
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 9999,
    elevation: 9999, // Android draw order is elevation-based, not zIndex.
  },
  title: { fontSize: 20, fontWeight: '700', color: '#F9FAFB', marginTop: 14 },
  body: { fontSize: 14, lineHeight: 20, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },
  btn: {
    marginTop: 22,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#0F766E',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default LockShield;
