/**
 * SCRUM-641 — Proactive Nudges API client.
 *
 * Talks to the cos-backend nudges routes:
 *   GET  /v1/patients/me/notification-prefs/nudges       — fetch prefs
 *   PUT  /v1/patients/me/notification-prefs/nudges       — upsert prefs
 *   POST /v1/patients/me/notification-prefs/nudges/mute  — mute/unmute a rule
 *   GET  /v1/nudges/rules                                — catalog
 *
 * Defensive envelope handling: nudges routes ship as `{ ok: true, prefs }`
 * / `{ rules }` per the SCRUM-641 design, while older cos-backend routes
 * use `{ success, data }`. These helpers accept either shape so the UI
 * layer never breaks on a benign backend envelope tweak.
 */

import { apiClient } from '@/lib/api-client'

export interface NudgePreferences {
  optedIn: boolean
  quietHoursStart: string   // "HH:MM"
  quietHoursEnd: string     // "HH:MM"
  timezoneIana: string
  dailyCap: number          // 1..5
  weeklyCap: number         // 3..14
  mutedRuleIds: string[]
  updatedAt: string
}

export interface NudgeRuleSummary {
  ruleId: string
  description: string
  category: 'nudges'
}

export interface UpdateNudgePrefsPayload {
  optedIn?: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
  timezoneIana?: string
  dailyCap?: number
  weeklyCap?: number
}

export async function fetchNudgePrefs(): Promise<NudgePreferences> {
  const res = await apiClient.get<any>('/v1/patients/me/notification-prefs/nudges')
  const body = res.data
  return (body?.data ?? body?.prefs ?? body) as NudgePreferences
}

export async function updateNudgePrefs(
  payload: UpdateNudgePrefsPayload,
): Promise<NudgePreferences> {
  const res = await apiClient.put<any>('/v1/patients/me/notification-prefs/nudges', payload)
  const body = res.data
  return (body?.prefs ?? body?.data ?? body) as NudgePreferences
}

export async function toggleNudgeMute(
  ruleId: string,
  muted: boolean,
): Promise<string[]> {
  const res = await apiClient.post<any>(
    '/v1/patients/me/notification-prefs/nudges/mute',
    { ruleId, muted },
  )
  const body = res.data
  return (body?.mutedRuleIds ?? body?.data?.mutedRuleIds ?? []) as string[]
}

export async function fetchNudgeRules(): Promise<NudgeRuleSummary[]> {
  const res = await apiClient.get<any>('/v1/nudges/rules')
  const body = res.data
  return (body?.rules ?? body?.data?.rules ?? []) as NudgeRuleSummary[]
}
