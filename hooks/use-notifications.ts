import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router, useSegments } from 'expo-router';
import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { routeForNotificationData } from '@/lib/notification-routing';
import { queryClient } from '@/providers/QueryProvider';

/**
 * CHUNK 64 (2026-07-22): read the biopsychosocial-plan eligibility off
 * the already-populated feature-flags query cache at tap-time so
 * navigateForNotification can pass it into routeForNotificationData
 * without upgrading to a hook. Mirrors the exact predicate from
 * hooks/use-assessment-strategy-v2-flag.ts (`useBiopsychosocialPlanFlag`)
 * so the client can't route a user to a surface their flags don't
 * render — both `assessment_strategy_v2_enabled` AND
 * `biopsychosocial_plan_enabled` must be true. Returns false when the
 * cache is empty (cold-start before /v1/feature-flags settles) or the
 * user is unauthenticated — preserving legacy routing in every
 * ambiguous state.
 */
function isBpsEligibleCached(): boolean {
  try {
    const flags = queryClient.getQueryData<Record<string, boolean> | undefined>([
      'feature-flags',
    ]);
    return flags?.assessment_strategy_v2_enabled === true &&
      flags?.biopsychosocial_plan_enabled === true;
  } catch {
    return false;
  }
}

const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId ?? '30bc49bd-ee12-4a06-86b3-ee4f23690114';

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Hook to manage push notification listeners and device token registration.
 *
 * Handles:
 * - Foreground notification display
 * - Tap-to-navigate for notification responses
 * - Device token registration with backend
 * - Badge count management
 *
 * Place this in the root layout or main app component.
 * Call it only once, at the highest level of your app.
 */
export function useNotifications() {
  const notificationListener = useRef<Notifications.Subscription>(undefined);
  const responseListener = useRef<Notifications.Subscription>(undefined);

  // COLD START: the tap that LAUNCHED the app from a killed state.
  // useLastNotificationResponse returns that response once it's
  // available; it stays stable across re-renders, so we guard with a
  // ref to route exactly once.
  //
  // COS-437: previously this fired as soon as `lastResponse` became
  // available, which happens BEFORE `SplashGate` (app/index.tsx)
  // finishes its async auth+destination pipeline. SplashGate then
  // fires `router.replace('/Home')` which wipes any push we made to
  // `/Home/health-plan`, dropping the user on the plain Home tab
  // (or, worse on Kenneth's device 2026-07-10, on the plain splash).
  // Fix: read `useSegments()` and only fire cold-start navigation once
  // the current route is under `/Home` — meaning splash has already
  // completed and settled the user there. Now the notification push
  // lands ON TOP of splash's replace instead of being clobbered by it.
  const lastResponse = Notifications.useLastNotificationResponse();
  const segments = useSegments();
  const isOnHome = segments[0] === 'Home';
  const coldStartHandledRef = useRef(false);
  useEffect(() => {
    if (coldStartHandledRef.current) return;
    if (!lastResponse) return;
    if (!isOnHome) return;
    coldStartHandledRef.current = true;
    // Clear badge on cold-start tap too.
    Notifications.setBadgeCountAsync(0).catch(() => {});
    navigateForNotification(lastResponse);
  }, [lastResponse, isOnHome]);

  useEffect(() => {
    // Listen for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(async (notification) => {
      // Increment badge count when notification arrives in foreground
      try {
        const currentBadge = await Notifications.getBadgeCountAsync();
        await Notifications.setBadgeCountAsync(currentBadge + 1);
      } catch {
        // Non-critical
      }

      // COS-421: a biopsychosocial plan regeneration finished server-side —
      // invalidate the cached plan so the screen picks up the fresh data
      // without relying on the removed refetchInterval poll.
      const data = notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'BIOPSYCHOSOCIAL_PLAN_READY') {
        queryClient.invalidateQueries({ queryKey: ['biopsychosocial-plan'] });
      }
      // COS-482 Phase 1: a CM issued a retake request while the app was
      // foregrounded — invalidate the patient's retake-requests list so
      // the inbox card on Home shows the new row without waiting for the
      // 30s staleTime tick.
      if (data?.type === 'ASSESSMENT_RETAKE_REQUESTED') {
        queryClient.invalidateQueries({ queryKey: ['retake-requests', 'me'] });
      }
    });

    // Listen for user tapping on a notification (WARM start — app was
    // already running in foreground or background). Cold-start taps
    // (app launched from killed state) are handled separately below via
    // useLastNotificationResponse, because the router may not be mounted
    // yet when this listener would otherwise fire.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      // Clear badge on tap
      try {
        await Notifications.setBadgeCountAsync(0);
      } catch {
        // Non-critical
      }

      navigateForNotification(response);
    });

    // Register token on mount
    registerPushToken();

    // Clear badge when app opens
    Notifications.setBadgeCountAsync(0).catch(() => {});

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}

/**
 * Route to the right screen for a tapped notification, defaulting to
 * Home. Shared by the warm-tap listener and the cold-start path.
 *
 * Both paths can surface the SAME tap on a cold launch (the OS delivers
 * the launching response to the listener AND useLastNotificationResponse
 * exposes it). We dedupe on the notification identifier so we navigate
 * exactly once per tap.
 */
let lastNavigatedNotificationId: string | null = null;
function navigateForNotification(response: Notifications.NotificationResponse): void {
  try {
    const id = response.notification.request.identifier;
    if (id && id === lastNavigatedNotificationId) return; // already handled this tap
    if (id) lastNavigatedNotificationId = id;

    const data = response.notification.request.content.data;

    // COS-421: a biopsychosocial plan regeneration finished server-side —
    // invalidate the cached plan so the destination screen renders fresh
    // data instead of whatever was last polled before the removed interval.
    if ((data as { type?: string } | undefined)?.type === 'BIOPSYCHOSOCIAL_PLAN_READY') {
      queryClient.invalidateQueries({ queryKey: ['biopsychosocial-plan'] });
    }
    // COS-482 Phase 1: on a retake-request push tap, invalidate the inbox
    // list so the card at the top of Home renders the fresh row (or
    // silent-drops if the CM revoked it in the interim) before the tap
    // navigates.
    if ((data as { type?: string } | undefined)?.type === 'ASSESSMENT_RETAKE_REQUESTED') {
      queryClient.invalidateQueries({ queryKey: ['retake-requests', 'me'] });
    }

    // CHUNK 64: pass BPS eligibility so a MEDICATION_REFILL_REMINDER
    // tap lands bio-eligible patients on `/Home/biopsychosocial-plan
    // ?focus=medications` (activating the chunk-55 scroll/announce
    // handler). Ineligible / cache-empty → legacy /Home/health-plan.
    const route = routeForNotificationData(data, { bpsEnabled: isBpsEligibleCached() });
    // null → Home default (back-compat for unknown/new/data-ready types).
    router.push((route ?? '/Home') as never);
  } catch {
    // Never let a navigation failure crash the notification pipeline.
    // Fall back to Home so the tap still does something sensible.
    try {
      router.push('/Home' as never);
    } catch {
      // Router not ready — nothing more we can do; cold start will retry.
    }
  }
}

/**
 * Request notification permissions and register the device token with the backend.
 *
 * SCRUM-249: users were silently losing daily task reminders because the
 * earlier implementation only proceeded when permissions were already
 * `granted`. Users who skipped the onboarding permission prompt, denied
 * once, or onboarded before that gate landed would never re-prompt and
 * therefore never have a device token written to their backend record.
 * Without a `deviceTokens` entry, the EventBridge-driven reminder lambda
 * (`healthPlanReminders`) skips them entirely.
 *
 * Fix: when permissions are still `undetermined`, proactively request
 * them on every app launch until the user makes an explicit choice.
 * `denied` users still no-op (we don't keep nagging them).
 */
async function registerPushToken() {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      return;
    }

    // Add timeout to prevent hanging on simulators
    const tokenPromise = Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const tokenData = await Promise.race([tokenPromise, timeoutPromise]);

    if (tokenData) {
      await apiClient
        .post('/v1/notifications/register-token', {
          token: tokenData.data,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        })
        .catch(() => {
          // Non-critical — token registration failure doesn't block app startup
        });
    }
  } catch {
    // Silent — non-critical
  }
}
