/**
 * SCRUM-269 Phase B — hourly background sync of device-calendar events.
 *
 * Ken's ask is that we re-fetch events every hour. iOS is the
 * constraint here: `expo-background-fetch` registers the task with the
 * OS but the actual fire cadence is decided by iOS based on app usage,
 * battery, and the user's prior interaction patterns. A "1 hour minimum"
 * is a hint, not a guarantee. On Android the WorkManager backing of
 * expo-background-fetch is much closer to the requested interval.
 *
 * The app also runs a sync on foreground (see `useDeviceCalendarSync`)
 * so users who open the app frequently always see fresh data, even when
 * iOS is sleepy.
 */

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { fetchDeviceEvents, getPermissionStatus } from './device-calendar'

export const DEVICE_CALENDAR_SYNC_TASK = 'device-calendar-hourly-sync'

// One-time registration of the headless task. The OS persists the
// registration across launches, but defining the task itself must happen
// at module load so JS can pick it up after a background wake.
if (!TaskManager.isTaskDefined(DEVICE_CALENDAR_SYNC_TASK)) {
  TaskManager.defineTask(DEVICE_CALENDAR_SYNC_TASK, async () => {
    try {
      const status = await getPermissionStatus()
      if (!status.granted) {
        return BackgroundFetch.BackgroundFetchResult.NoData
      }
      const events = await fetchDeviceEvents()
      return events.length > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed
    }
  })
}

/**
 * Ask iOS / Android to run the sync task at least every `minIntervalSec`.
 * iOS treats this as a lower bound and may extend it; Android honors it
 * more strictly via WorkManager.
 *
 * Safe to call repeatedly — registerTaskAsync is idempotent.
 */
export async function registerHourlySync(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync()
  if (status === BackgroundFetch.BackgroundFetchStatus.Denied || status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
    return
  }
  await BackgroundFetch.registerTaskAsync(DEVICE_CALENDAR_SYNC_TASK, {
    minimumInterval: 60 * 60, // 1 hour
    stopOnTerminate: false,
    startOnBoot: true,
  })
}

/**
 * Unregister the sync task. Called when the user revokes calendar
 * permission so we stop waking the app.
 */
export async function unregisterHourlySync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(DEVICE_CALENDAR_SYNC_TASK)
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(DEVICE_CALENDAR_SYNC_TASK)
    }
  } catch {
    // Swallow — best-effort cleanup.
  }
}
