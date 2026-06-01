/**
 * Apple-Calendar-parity option lists for the event editor pickers.
 *
 * Values are stable string keys that can be persisted to AsyncStorage
 * (for "last used" defaults) and round-tripped to the editor without
 * needing a database migration.
 */

import type { SelectionOption } from './SelectionPicker'

// ── Repeat picker ─────────────────────────────────────────────────────
export type RepeatValue = 'never' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export const REPEAT_OPTIONS: SelectionOption<RepeatValue>[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Every Day' },
  { value: 'weekly', label: 'Every Week' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Every Month' },
  { value: 'yearly', label: 'Every Year' },
]

export function labelForRepeat(v: RepeatValue): string {
  return REPEAT_OPTIONS.find((o) => o.value === v)?.label ?? 'Never'
}

// ── Travel Time picker ────────────────────────────────────────────────
export type TravelTimeValue = 'none' | '5' | '15' | '30' | '60' | '90' | '120'

export const TRAVEL_TIME_OPTIONS: SelectionOption<TravelTimeValue>[] = [
  { value: 'none', label: 'None' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1 hour, 30 minutes' },
  { value: '120', label: '2 hours' },
]

export function labelForTravelTime(v: TravelTimeValue): string {
  return TRAVEL_TIME_OPTIONS.find((o) => o.value === v)?.label ?? 'None'
}

/** Convert a TravelTimeValue to minutes (for storing on the event). */
export function travelTimeMinutes(v: TravelTimeValue): number {
  return v === 'none' ? 0 : parseInt(v, 10)
}

export { SelectionPicker, type SelectionOption } from './SelectionPicker'
export { TimeZonePicker } from './TimeZonePicker'
