import { apiClient } from '@/lib/api-client'

export interface HealthPlanReminderPrefs {
  am: boolean
  midday: boolean
  eod: boolean
}

export async function fetchHealthPlanReminderPrefs(): Promise<HealthPlanReminderPrefs> {
  const res = await apiClient.get<{ success: boolean; data: HealthPlanReminderPrefs }>(
    '/v1/patients/me/notification-prefs/health-plan',
  )
  return res.data.data
}

export async function updateHealthPlanReminderPrefs(
  partial: Partial<HealthPlanReminderPrefs>,
): Promise<HealthPlanReminderPrefs> {
  const res = await apiClient.put<{ success: boolean; data: HealthPlanReminderPrefs }>(
    '/v1/patients/me/notification-prefs/health-plan',
    partial,
  )
  return res.data.data
}

// SCRUM-257: per-user-TZ reminder routing. The cos-app stores the
// user's IANA timezone on the server, and the new sweeper Lambda
// (SCRUM-256) reads it to bucket reminders to local time. Users
// without a stored TZ continue on the legacy UTC reminder path.

export interface TimezonePref {
  timezone: string | null
}

export async function fetchTimezonePref(): Promise<TimezonePref> {
  const res = await apiClient.get<{ success: boolean; data: TimezonePref }>(
    '/v1/patients/me/notification-prefs/timezone',
  )
  return res.data.data
}

export async function updateTimezonePref(
  timezone: string | null,
): Promise<TimezonePref> {
  const res = await apiClient.put<{ success: boolean; data: TimezonePref }>(
    '/v1/patients/me/notification-prefs/timezone',
    { timezone },
  )
  return res.data.data
}
