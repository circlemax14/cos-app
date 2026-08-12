/**
 * SCRUM-640 — Habit Journal API client.
 *
 * Talks to the cos-backend habit-journal routes:
 *   GET  /v1/habits/catalog          — active catalog rows
 *   GET  /v1/habits/entries/today    — today's local-date entries + streaks
 *   POST /v1/habits/entries          — upsert one-or-more habit entries
 *   GET  /v1/habits/correlation      — Pearson r vs wellbeing (display-only)
 *
 * Defensive envelope handling: routes ship as `{ ok:true, ... }` or
 * `{ success, data }` — helpers accept either shape so a benign
 * backend envelope tweak never breaks the UI.
 */

import { apiClient } from '@/lib/api-client'
import { todayLocalIso } from '@/lib/day-key'

export type HabitInputType = 'numeric' | 'scale' | 'boolean'
export type HabitBpsDomain = 'biological' | 'psychological' | 'social'

export interface HabitCatalogItem {
  habitId: string
  label: string
  bpsDomain: HabitBpsDomain
  inputType: HabitInputType
  unit: string
  targetRange?: { min?: number; max?: number }
  defaultOn: boolean
  displayOrder: number
}

export interface HabitEntry {
  habitId: string
  value: number | boolean
  unit?: string
  loggedAt: string
}

export interface HabitStreak {
  habitId: string
  currentStreak: number
  longestStreak: number
}

export interface HabitEntriesTodayResponse {
  localDate: string
  entries: HabitEntry[]
  streaks: HabitStreak[]
}

export interface HabitEntryUpsert {
  habitId: string
  value: number | boolean
  unit?: string
}

export interface HabitUpsertResponse {
  accepted: number
  streaks: Array<HabitStreak & { milestoneHit?: 7 | 14 | 30 | 90 }>
}

export interface HabitCorrelationRow {
  habitId: string
  label: string
  r: number | null
  n: number
  direction: 'positive' | 'negative' | null
}

export interface HabitCorrelationResponse {
  window: { days: number; from: string; to: string }
  rows: HabitCorrelationRow[]
  disclaimer: string
}

function unwrap<T>(body: any, keys: string[]): T {
  if (body == null) return body as T
  if (body.data && typeof body.data === 'object') {
    for (const k of keys) if (k in body.data) return body.data as T
    // Some routes wrap in { success:true, data: {...} } — return data
    return body.data as T
  }
  return body as T
}

export async function fetchHabitCatalog(): Promise<HabitCatalogItem[]> {
  const res = await apiClient.get<any>('/v1/habits/catalog')
  const body = res.data
  const shaped = unwrap<{ habits?: HabitCatalogItem[] }>(body, ['habits'])
  return shaped?.habits ?? []
}

export async function fetchHabitEntriesToday(): Promise<HabitEntriesTodayResponse> {
  const res = await apiClient.get<any>('/v1/habits/entries/today')
  const body = res.data
  const shaped = unwrap<HabitEntriesTodayResponse>(body, ['localDate', 'entries', 'streaks'])
  return {
    localDate: shaped?.localDate ?? todayLocalIso(),
    entries: shaped?.entries ?? [],
    streaks: shaped?.streaks ?? [],
  }
}

function localDateKey(now: Date = new Date()): string {
  // YYYY-MM-DD in device local time (matches BE rule-engine.localDateKey()).
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function upsertHabitEntries(
  entries: HabitEntryUpsert[],
): Promise<HabitUpsertResponse> {
  const now = new Date()
  const payload = {
    localDate: localDateKey(now),
    tzOffsetMinutes: -now.getTimezoneOffset(),
    entries,
  }
  const res = await apiClient.post<any>('/v1/habits/entries', payload)
  const body = res.data
  const shaped = unwrap<HabitUpsertResponse>(body, ['accepted', 'streaks'])
  return {
    accepted: shaped?.accepted ?? entries.length,
    streaks: shaped?.streaks ?? [],
  }
}

export async function fetchHabitCorrelation(
  windowDays: number = 30,
): Promise<HabitCorrelationResponse> {
  const res = await apiClient.get<any>('/v1/habits/correlation', {
    params: { windowDays },
  })
  const body = res.data
  const shaped = unwrap<HabitCorrelationResponse>(body, ['window', 'rows'])
  return {
    window: shaped?.window ?? {
      days: windowDays,
      from: '',
      to: '',
    },
    rows: shaped?.rows ?? [],
    disclaimer:
      shaped?.disclaimer ?? 'Directional pattern, not a clinical finding.',
  }
}
