/**
 * Calendar preferences persisted to AsyncStorage. Read at editor mount
 * (so "Default Calendar" + "Default Alert" prefill correctly) and at
 * calendar-settings mount (so the toggles reflect current state).
 *
 * Schema is a single JSON blob under one key so reads/writes are atomic
 * and migration is just a version bump + transform function.
 *
 * Keep this file PURE — no React, no UI. Easy to unit-test, easy to
 * call from any hook or screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'csh-calendar-prefs-v1'

export type StartWeekDay = 0 | 1 | 6 // Sunday | Monday | Saturday

export interface CalendarPreferences {
  /** Default calendar ID for new events (used to prefill the editor). */
  defaultCalendarId: string | null
  /** Default alarm offsets (minutes before) for new events. */
  defaultAlertMinutes: number[]
  /** Day of week to start grid views on (Apple: Settings > Calendar > Start Week On). */
  startWeekDay: StartWeekDay
  /** Show iOS Holidays calendar in the calendar list. */
  showHolidays: boolean
  /** Whether to surface iOS Reminders alongside calendar events. */
  showReminders: boolean
  /**
   * DEPRECATED 2026-08-14 — never honoured, and the control that set it has
   * been removed.
   *
   * Its contract read "if set, render all event times in this TZ". Nothing
   * ever read it: the only references were the settings row, the picker and
   * this declaration. Kept on the type so existing AsyncStorage rows still
   * parse rather than being dropped on read; delete once no stored prefs
   * carry it. Do NOT wire a renderer to this without threading a zone through
   * every time formatter in the app — that is a feature, not a repair.
   */
  timeZoneOverride: string | null
  /** Last-used per-field state in the editor (so re-creates feel smart). */
  lastUsedTimeZone: string | null
  lastUsedRepeat: string
  lastUsedTravelTime: string
}

const DEFAULTS: CalendarPreferences = {
  defaultCalendarId: null,
  // SCRUM-279 (build 49): Ken's spec — "I want 2 notifications: 1 at
  // 15 min before, 1 at-time" for every event. Was [15] (one alarm
  // 15 min before); now [15, 0] (15-min-before + at-time).
  defaultAlertMinutes: [15, 0],
  startWeekDay: 0,
  showHolidays: true,
  showReminders: true,
  timeZoneOverride: null,
  lastUsedTimeZone: null,
  lastUsedRepeat: 'never',
  lastUsedTravelTime: 'none',
}

export async function getCalendarPreferences(): Promise<CalendarPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<CalendarPreferences>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export async function setCalendarPreferences(
  patch: Partial<CalendarPreferences>,
): Promise<CalendarPreferences> {
  const current = await getCalendarPreferences()
  const next = { ...current, ...patch }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Non-fatal — caller will get the updated in-memory copy regardless.
  }
  return next
}
