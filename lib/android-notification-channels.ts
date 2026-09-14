/**
 * COS-928 — one Android notification channel per category.
 *
 * ─── WHAT WAS WRONG ──────────────────────────────────────────────────
 *
 * `setNotificationChannelAsync` appeared nowhere in the app. On Android 8+ a
 * notification MUST belong to a channel, so expo-notifications falls back to
 * its own `expo_notifications_fallback_notification_channel`, whose display
 * name comes from the module's strings.xml: **"Miscellaneous"**.
 *
 * Notifications still arrive — this was never broken in the "nothing happens"
 * sense. What breaks is the patient's control over them. Android's per-channel
 * settings are the ONLY way a user can mute one kind of notification, and with
 * a single channel their choice is all-or-nothing: silencing a 6am medication
 * reminder also silences appointment alerts and health alerts. On a HIPAA
 * product where the alternative to "mute everything" is "turn notifications
 * off", that is a real patient-safety edge.
 *
 * ─── WHY IT MIRRORS THE EXISTING CATEGORIES ──────────────────────────
 *
 * The app already has eight notification categories with server-persisted
 * preferences (lib/notification-categories.ts, the same keys the backend
 * stores). Inventing a second, different taxonomy for Android would mean a
 * patient could mute "Medication" in Android settings and still see the row
 * ticked in the app. One taxonomy, two surfaces.
 *
 * The IDs are the category keys verbatim so a push whose payload names a
 * category can be routed to its channel without a second mapping table.
 *
 * ─── ANDROID ONLY, AND A NO-OP EVERYWHERE ELSE ───────────────────────
 *
 * iOS has no equivalent concept — it groups by the app, and per-notification
 * control is the app's own settings screen. Calling this on iOS is harmless
 * (expo-notifications no-ops) but the guard is explicit so a reader does not
 * have to know that.
 *
 * Channels are create-once and IMMUTABLE after creation: re-registering with a
 * different importance does nothing, because Android hands that control to the
 * user the moment the channel exists. So this runs at startup, is idempotent,
 * and must never be used to *change* a channel — that needs a new id.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { NOTIFICATION_CATEGORY_KEYS, type NotificationCategory } from './notification-categories';

/**
 * Patient-facing name and importance per category.
 *
 * These strings appear in Android's system settings, so they are written for a
 * patient, not for us — no camelCase keys, no internal words like "task".
 */
const CHANNELS: Record<NotificationCategory, { name: string; high: boolean }> = {
  // Time-critical: a missed dose or a missed appointment has a real cost, so
  // these get HIGH importance (heads-up display). The patient can still lower
  // them per channel, which is the entire point of splitting them out.
  medicationReminders: { name: 'Medication refills', high: true },
  medicationTask: { name: 'Medication doses', high: true },
  appointments: { name: 'Appointments', high: true },
  healthAlerts: { name: 'Health alerts', high: true },
  // Everything else is informational and should not interrupt.
  reminders: { name: 'Plan reminders', high: false },
  otherTask: { name: 'Plan tasks', high: false },
  habits: { name: 'Habits', high: false },
  nudges: { name: 'Suggestions', high: false },
};

/**
 * Create the channels. Safe to call on every launch.
 *
 * Never throws: a failure here must not stop the app starting, and the cost of
 * failure is the pre-existing "Miscellaneous" behaviour rather than anything
 * worse. Each channel is created independently so one bad entry cannot take
 * the rest with it.
 */
export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all(
    NOTIFICATION_CATEGORY_KEYS.map(async (key) => {
      const channel = CHANNELS[key];
      if (!channel) return;
      try {
        await Notifications.setNotificationChannelAsync(key, {
          name: channel.name,
          importance: channel.high
            ? Notifications.AndroidImportance.HIGH
            : Notifications.AndroidImportance.DEFAULT,
          // No custom sound: `sounds: []` in the expo-notifications plugin
          // config means none is bundled, and naming one that does not exist
          // makes the channel silent rather than falling back to the default.
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      } catch {
        /* channel creation is a convenience; never block startup */
      }
    }),
  );
}

/** Exported for tests — the channel ids must stay equal to the category keys. */
export const ANDROID_CHANNEL_IDS = NOTIFICATION_CATEGORY_KEYS;
