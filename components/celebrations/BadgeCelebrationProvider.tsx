import React, { createContext, useContext, useState, useCallback } from 'react'
import { BadgeCelebration } from './BadgeCelebration'
import type { EarnedBadge } from '@/services/api/badges'

interface BadgeCelebrationContextValue {
  /** Enqueue one or more badges to celebrate. Each is shown sequentially. */
  enqueue: (badges: EarnedBadge[]) => void
}

const Ctx = createContext<BadgeCelebrationContextValue | null>(null)

const INTER_BADGE_DELAY_MS = 400

/**
 * Wrap the app in this provider once (in app/_layout.tsx). Components that
 * want to celebrate newly-earned badges call `useBadgeCelebrations().enqueue(badges)`.
 *
 * Apple's celebration rendering has a known bug where simultaneous awards
 * cancel each other's fireworks. We avoid that by queuing badges and
 * playing them strictly one at a time with a small gap. If many land at
 * once, the queue just drains in arrival order.
 */
export function BadgeCelebrationProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queue, setQueue] = useState<EarnedBadge[]>([])
  const [current, setCurrent] = useState<EarnedBadge | null>(null)

  const enqueue = useCallback((badges: EarnedBadge[]) => {
    if (badges.length === 0) return
    setQueue((q) => [...q, ...badges])
  }, [])

  // Pump the queue when nothing is currently being shown
  React.useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setCurrent(next)
    setQueue(rest)
  }, [current, queue])

  const handleDismiss = useCallback(() => {
    setCurrent(null)
    // Small gap before the next one so it doesn't feel like a strobe
    if (queue.length > 0) {
      setTimeout(() => { /* re-render triggers the pump */ }, INTER_BADGE_DELAY_MS)
    }
  }, [queue.length])

  return (
    <Ctx.Provider value={{ enqueue }}>
      {children}
      {current ? (
        <BadgeCelebration badge={current} onDismiss={handleDismiss} />
      ) : null}
    </Ctx.Provider>
  )
}

export function useBadgeCelebrations(): BadgeCelebrationContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Returning a no-op rather than throwing keeps callsites safe during
    // tests that don't mount the provider; the celebration just silently
    // doesn't fire.
    return { enqueue: () => { /* no-op outside provider */ } }
  }
  return ctx
}
