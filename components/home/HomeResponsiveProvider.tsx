/**
 * components/home/HomeResponsiveProvider.tsx — ADR-0003 Phase 1
 *
 * Provides two independent contexts to the Home v2 subtree:
 *   1. LayoutContext      — { columns, breakpoint } — CHANGES RARELY.
 *   2. DimensionsContext  — raw { width, height }    — CHANGES OFTEN.
 *
 * WHY TWO CONTEXTS (not one):
 *   A single `{ width, height, columns }` context re-renders every
 *   consumer on every window-size event. On iPad rotation, that's
 *   dozens of consumers reflowing 4-6 times per second during the
 *   OS's inertial size interpolation — jank + wasted work.
 *
 *   Splitting them means:
 *     - ScoreCardGrid subscribes to LayoutContext (only re-renders
 *       when the breakpoint bucket actually changes).
 *     - A future rare consumer that genuinely needs raw dimensions
 *       (e.g. a chart that measures pixels) subscribes to
 *       DimensionsContext.
 *   Rotation storm = one grid re-render per breakpoint transition,
 *   not one per dimension tick.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5): no Animated, no LayoutAnimation
 * inside this file — it's pure JS wiring. Consumers own their own
 * render primitives.
 */

import React from 'react'
import { useWindowDimensions } from 'react-native'

import { Breakpoints } from '@/constants/design-system'

export type HomeBreakpoint = 'phone' | 'tabletPortrait' | 'tabletLandscape'

export interface HomeLayout {
  /** Number of grid columns for the current viewport. */
  columns: 1 | 2 | 3
  /** Discrete breakpoint bucket — the *only* value that changes rarely. */
  breakpoint: HomeBreakpoint
}

export interface HomeDimensions {
  width: number
  height: number
}

const DEFAULT_LAYOUT: HomeLayout = { columns: 1, breakpoint: 'phone' }
const DEFAULT_DIMENSIONS: HomeDimensions = { width: 0, height: 0 }

const LayoutContext = React.createContext<HomeLayout>(DEFAULT_LAYOUT)
const DimensionsContext = React.createContext<HomeDimensions>(DEFAULT_DIMENSIONS)

/**
 * Derive breakpoint + column count from a width. Kept pure + exported
 * for unit-testing without a RN runtime.
 */
export function layoutForWidth(width: number): HomeLayout {
  if (width >= Breakpoints.tabletLandscape) {
    return { columns: 3, breakpoint: 'tabletLandscape' }
  }
  if (width >= Breakpoints.tabletPortrait) {
    return { columns: 2, breakpoint: 'tabletPortrait' }
  }
  return { columns: 1, breakpoint: 'phone' }
}

export interface HomeResponsiveProviderProps {
  children: React.ReactNode
}

export function HomeResponsiveProvider({
  children,
}: HomeResponsiveProviderProps): React.JSX.Element {
  const { width, height } = useWindowDimensions()

  // LayoutContext value is memoized on the BREAKPOINT string so a
  // 1023pt → 1024pt drag doesn't reallocate an object every frame.
  // useMemo dep = `columns + breakpoint` string form; that's stable
  // across every dimension tick within the same bucket.
  const layout = React.useMemo<HomeLayout>(() => layoutForWidth(width), [width])
  const layoutKey = `${layout.breakpoint}:${layout.columns}`
  const stableLayout = React.useMemo<HomeLayout>(
    () => ({ columns: layout.columns, breakpoint: layout.breakpoint }),
    // Depend on the string key, NOT on the derived object — that's
    // the whole point of the split. Referential stability of the
    // context value is what suppresses the rotation-storm re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  )

  // DimensionsContext value CAN change every tick — consumers who
  // subscribe here have opted into that traffic. Still memoize so
  // referentially-equal snapshots don't wake consumers.
  const dimensions = React.useMemo<HomeDimensions>(
    () => ({ width, height }),
    [width, height],
  )

  return (
    <LayoutContext.Provider value={stableLayout}>
      <DimensionsContext.Provider value={dimensions}>
        {children}
      </DimensionsContext.Provider>
    </LayoutContext.Provider>
  )
}

/**
 * Consumers that care about columns / breakpoint. THIS is what
 * ScoreCardGrid should call — subscribing here means one re-render
 * per breakpoint transition (three total over a rotate), not one per
 * dimension tick.
 */
export function useHomeLayout(): HomeLayout {
  return React.useContext(LayoutContext)
}

/**
 * Consumers that need raw pixel dimensions (rare — measuring text,
 * charts, video). Subscribing to this fires every dimension change.
 */
export function useHomeDimensions(): HomeDimensions {
  return React.useContext(DimensionsContext)
}

export default HomeResponsiveProvider
