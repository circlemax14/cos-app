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
