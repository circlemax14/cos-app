/**
 * COS-1116 — the medical alert symbol, as Ken supplied it.
 *
 * He sent the artwork and the placement mock-up, and asked for that mark
 * specifically. It is the universal medical-alert emblem — a hexagon enclosing
 * the Star of Life, with the Rod of Asclepius at its centre — and the point of
 * using it rather than something we designed is exactly that it is universal:
 * a carer, a paramedic or a family member recognises it without being taught.
 *
 * ─── WHAT IS DRAWN, AND WHAT IS NOT ──────────────────────────────────
 *
 * The emblem carries a snake coiled around the staff. At the sizes this
 * renders — 40pt in the corner, less in a row — a coil is under two device
 * pixels per turn and resolves to a grey smudge that makes the centre look
 * dirty rather than detailed. So the staff is drawn with TWO broad serpentine
 * turns instead of the traditional four narrow ones: it reads as a snake at
 * 40pt, and as a staff at 24pt, and never as mush.
 *
 * ─── COLOUR IS A PARAMETER, NOT THREE FILES ──────────────────────────
 *
 * Ken sent green, amber and red versions as separate images. They are the same
 * geometry at three hues, so this takes `color` and tints the whole mark.
 * Three bitmaps would have to be re-exported for every size and could drift
 * apart; one path set cannot.
 *
 * `hollow` is the knockout colour — the page behind the mark. The Star of Life
 * is tinted and the staff is punched out of it, so on a white card the staff
 * reads white. Passing the real surface colour rather than hard-coding white
 * is what keeps it correct in dark mode.
 */

import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { G, Path, Rect } from 'react-native-svg'

export interface MedicalAlertIconProps {
  size?: number
  /** Tint for the hexagon and the Star of Life. */
  color: string
  /** The surface behind the mark — the staff is knocked out in this colour. */
  hollow?: string
  /** Ken: green and yellow do not flash, red does. */
  flashing?: boolean
}

/*
 * Hexagon with points left and right and flat top and bottom, matching the
 * emblem Ken sent. Drawn as a stroked outline with an unfilled interior, so
 * the Star of Life sits on the page rather than on a coloured tile.
 */
const HEX = 'M15 3 H33 L45 24 L33 45 H15 L3 24 Z'

/**
 * One arm of the Star of Life, repeated at 60° intervals. Six arms, not the
 * eight of a compass star — the Star of Life has six by definition, one per
 * link in the chain of survival, and getting the count wrong would make it a
 * different symbol.
 */
const ARM_ROTATIONS = [0, 60, 120]

export function MedicalAlertIcon({
  size = 40,
  color,
  hollow = '#FFFFFF',
  flashing = false,
}: MedicalAlertIconProps): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!flashing) {
      pulse.setValue(0)
      return
    }
    /*
     * A true blink (on/off) is the correct read for an emergency, but a hard
     * square wave on a phone is both ugly and, for some people, a migraine or
     * seizure trigger. This is a fast fade between full and half opacity — it
     * catches the eye from across a room and never goes fully dark, so the
     * mark is legible at every instant of the cycle.
     */
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [flashing, pulse])

  const opacity = flashing ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) : 1

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, opacity }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {/* Hexagon border. */}
        <Path d={HEX} fill="none" stroke={color} strokeWidth={3.6} strokeLinejoin="round" />

        {/* Star of Life — three bars crossed at 60°, giving six arms. */}
        <G>
          {ARM_ROTATIONS.map((deg) => (
            <Rect
              key={deg}
              x={21.4}
              y={10.5}
              width={5.2}
              height={27}
              rx={1.4}
              fill={color}
              transform={`rotate(${deg} 24 24)`}
            />
          ))}
        </G>

        {/*
          Rod of Asclepius, knocked out of the star. Drawn in the surface
          colour rather than with a mask: react-native-svg's mask support has
          been inconsistent across versions, and a solid overdraw is one fewer
          thing to be wrong on a device we cannot easily debug.
        */}
        <Rect x={23.1} y={12} width={1.8} height={24} rx={0.9} fill={hollow} />
        <Path
          d="M21 17c3-2.2 6 2.2 3 4.4 s-3 6.6 0 8.8"
          fill="none"
          stroke={hollow}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default MedicalAlertIcon
