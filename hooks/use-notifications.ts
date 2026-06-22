import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { routeForNotificationData } from '@/lib/notification-routing';

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
  // ref to route exactly once. This is Expo's recommended pattern and
  // sidesteps the "navigate before the router is mounted" race —
  // the hook only yields a value after the component tree (and router)
  // has rendered.
  const lastResponse = Notifications.useLastNotificationResponse();
  const coldStartHandledRef = useRef(false);
  useEffect(() => {
    if (coldStartHandledRef.current) return;
    if (!lastResponse) return;
    coldStartHandledRef.current = true;
    // Clear badge on cold-start tap too.
    Notifications.setBadgeCountAsync(0).catch(() => {});
    navigateForNotification(lastResponse);
  }, [lastResponse]);

  useEffect(() => {
    // Listen for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(async () => {
      // Increment badge count when notification arrives in foreground
      try {
        const currentBadge = await Notifications.getBadgeCountAsync();
        await Notifications.setBadgeCountAsync(currentBadge + 1);
      } catch {
        // Non-critical
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
    const route = routeForNotificationData(data);
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
