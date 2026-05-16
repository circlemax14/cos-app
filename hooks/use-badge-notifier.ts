import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import { fetchBadgeProgress, type EarnedBadge } from '@/services/api/badges'
import { useBadgeCelebrations } from '@/components/celebrations/BadgeCelebrationProvider'

/**
 * Stable signature for a "seen" badge — id + tier so a tier promotion
 * (bronze → silver) shows a fresh celebration.
 */
function badgeKey(b: { id: string; tier: string }): string {
  return `${b.id}#${b.tier}`
}

const STORAGE_KEY = 'badges.seen.v1'

async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

async function saveSeen(seen: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seen)))
  } catch { /* ignore */ }
}

/**
 * Fires badge celebrations for any newly-earned badges since the last time
 * the app saw the user's state. Designed for two trigger points:
 *  1. App foreground / Health Plan tab focus
 *  2. Task-completion mutations (refetch invalidates this query)
 *
 * First-install heuristic: if the user has NEVER had a "seen" set persisted
 * locally, we treat the current earned list as already-seen — we do NOT
 * blast them with celebrations for past achievements on a fresh install.
 */
export function useBadgeNotifier(): void {
  const { enqueue } = useBadgeCelebrations()
  const seenRef = React.useRef<Set<string> | null>(null)
  const firstRunRef = React.useRef<boolean>(true)

  const query = useQuery({
    queryKey: ['badge-progress'],
    queryFn: fetchBadgeProgress,
    // Background refetches OK; the diff only fires when actually-new badges land
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  // Load the seen set once on mount
  React.useEffect(() => {
    let cancelled = false
    loadSeen().then((seen) => {
      if (cancelled) return
      seenRef.current = seen
      // Touch a render so the effect below runs against current query.data
      firstRunRef.current = seen.size === 0
    })
    return () => { cancelled = true }
  }, [])

  // Diff earned list against seen on every query update
  React.useEffect(() => {
    if (!query.data) return
    if (!seenRef.current) return // not loaded yet

    const earned = query.data.earned
    const seen = seenRef.current

    if (firstRunRef.current) {
      // First time we see ANY earned set on this device — mark all as seen
      // without celebrating. Users shouldn't be ambushed by a stack of
      // celebrations on first install / first login.
      for (const b of earned) seen.add(badgeKey(b))
      saveSeen(seen)
      firstRunRef.current = false
      return
    }

    const newlyEarned: EarnedBadge[] = []
    for (const b of earned) {
      if (!seen.has(badgeKey(b))) {
        newlyEarned.push(b)
        seen.add(badgeKey(b))
      }
    }

    if (newlyEarned.length > 0) {
      // Sort tier descending so the gold ones celebrate first (most exciting)
      const tierOrder: Record<string, number> = { gold: 0, silver: 1, bronze: 2 }
      newlyEarned.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9))
      enqueue(newlyEarned)
      saveSeen(seen)
    }
  }, [query.data, enqueue])
}
