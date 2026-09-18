/**
 * COS-1038 — applies the screen-capture policy, now that a plan can set it.
 *
 * WHY THIS IS A COMPONENT AND NOT THE useEffect IT REPLACED
 *
 * The effect used to live in RootLayout, which is the component that RENDERS
 * <QueryProvider> — so it sits outside the query context and cannot read an
 * entitlement at all. Moving the effect into a headless child mounted inside
 * the provider is the whole reason this file exists. `FeatureFlagBridge` in
 * the same tree solves the same problem the same way.
 *
 * Renders nothing. MUST be mounted inside <QueryProvider>.
 */

import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { useHasNamedGrant } from '@/hooks/use-entitlement';
import {
  CAPTURE_BLOCK_ENTITLEMENT,
  SCREENSHOTS_BLOCKED,
  shouldPreventScreenCapture,
} from '@/lib/screenshot-policy';

export function ScreenCaptureBridge(): null {
  // Absence is permissive — see CAPTURE_BLOCK_ENTITLEMENT. A patient whose
  // plan does not carry the key, or whose entitlements have not loaded, keeps
  // the shipped default (capture allowed, COS-1034).
  const planBlocksCapture = useHasNamedGrant(CAPTURE_BLOCK_ENTITLEMENT);

  // The constant is the fleet-wide emergency lever and OUTRANKS the plan, so
  // it is OR-ed rather than replaced. Today it is false, so the plan governs.
  const blocked = SCREENSHOTS_BLOCKED || planBlocksCapture;

  useEffect(() => {
    /*
     * SCRUM-368 (MOBILE-003): PHI renders on virtually every authenticated
     * screen, so the policy is applied globally rather than per-screen. On
     * Android this sets FLAG_SECURE on the window — which ALSO hides the app
     * preview from the recent-apps switcher. On iOS it listens to
     * UIScreen.capturedDidChangeNotification and blanks the screen during
     * recording; iOS app-switcher snapshot redaction is a separate concern.
     *
     * COS-939 — `__DEV__` lets a debug build be screenshotted. Metro compiles
     * it to `false` in every release bundle, so a production binary and every
     * OTA to one still honour the policy regardless of what anyone forgets.
     */
    if (shouldPreventScreenCapture(blocked, __DEV__)) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {
        // Non-fatal — losing capture protection must not crash the app.
      });
    } else {
      // Actively re-allow: this now re-runs when a plan changes, so a patient
      // who was blocked and no longer is must have the block lifted rather
      // than left in place until the next cold start.
      ScreenCapture.allowScreenCaptureAsync().catch(() => {
        // Non-fatal.
      });
    }
  }, [blocked]);

  return null;
}
