import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';

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

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      // Clear badge on tap
      try {
        await Notifications.setBadgeCountAsync(0);
      } catch {
        // Non-critical
      }

      const data = response.notification.request.content.data;

      // Navigate based on notification type
      if (data?.type === 'DATA_SYNC_COMPLETE' || data?.type === 'EHI_EXPORT_COMPLETE') {
        router.push('/Home' as never);
      } else if (data?.type === 'APPOINTMENT_REMINDER') {
        router.push('/Home/appointments' as never);
      } else if (data?.type === 'CARE_PLAN_UPDATE') {
        router.push('/Home/plan' as never);
      } else if (data?.type === 'NEW_MESSAGE') {
        router.push('/Home/chat' as never);
      } else if (data?.type === 'RECOMMENDED_APPOINTMENTS') {
        router.push('/Home/appointments' as never);
      } else if (data?.type === 'CARE_GAP') {
        router.push('/Home/care-checklist' as never);
      } else {
        router.push('/Home' as never);
      }
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
