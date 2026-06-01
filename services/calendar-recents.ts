/**
 * Recent search history for the calendar search field. Mirrors iOS
 * Calendar's "Recents" list under the search bar — up to 8 entries,
 * most-recent first, exact-string dedup on insert.
 *
 * Pure storage layer; UI lives in app/Home/appointments.tsx.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'csh-calendar-search-recents-v1'
const MAX_RECENTS = 8

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s) => typeof s === 'string').slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export async function addRecentSearch(query: string): Promise<string[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return getRecentSearches()
  const current = await getRecentSearches()
  // Dedup case-insensitively, keep original casing on first insert.
  const dedup = current.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
  const next = [trimmed, ...dedup].slice(0, MAX_RECENTS)
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* non-fatal */ }
  return next
}

export async function clearRecentSearches(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY) } catch { /* non-fatal */ }
}
