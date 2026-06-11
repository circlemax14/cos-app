import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';

/**
 * SCRUM-279 (2026-06-11 build 42): provider-circle bloom animation.
 * Distilled from the SVG/CSS reference Ken shared (provider-bloom.html):
 *
 *   1. Bloom in (scale 0 → 1.5 → 0.92 → 1) with a cubic-bezier-shaped
 *      overshoot, staggered across the circle so bubbles cascade rather
 *      than appearing as a slab.
 *   2. Gentle perpetual drift (translateY ±3px) on a 3500ms ease-in-out
 *      loop once the bloom has settled, so the circle feels alive.
 *
 * Skipped from the reference for build 42 (kept simple to minimize
 * risk): radial "stem light" projecting from the center, and the
 * sparkle pulse behind the bubble. Both are easy to layer on later if
 * Ken likes the bloom.
 *
 * Caller passes the absolute position (left, top) and size, plus a
 * stagger index. Children render normally inside; this component only
 * adds the animated transform wrapper.
 */
export interface BloomingOrbitItemProps {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex?: number;
  index: number;
  outerStyle?: ViewStyle;
  children: React.ReactNode;
}

const BASE_DELAY_MS = 180;
const STEP_DELAY_MS = 110;

export function BloomingOrbitItem(props: BloomingOrbitItemProps) {
  const { left, top, width, height, zIndex, index, outerStyle, children } = props;

  const scale = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = BASE_DELAY_MS + index * STEP_DELAY_MS;

    // Bloom: cubic-bezier(.34, 1.56, .64, 1) approximated with three
    // timing steps. Keeps overshoot pop + settle.
    const bloom = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(scale, {
        toValue: 1.5,
        duration: 270,
        easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: -1,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    bloom.start(({ finished }) => {
      if (finished) driftLoop.start();
    });

    return () => {
      bloom.stop();
      driftLoop.stop();
    };
  }, [index, scale, drift]);

  const translateY = drift.interpolate({
    inputRange: [-1, 0],
    outputRange: [-3, 0],
  });

  return (
    <Animated.View
      style={[
        outerStyle,
        {
          position: 'absolute',
          left,
          top,
          width,
          height,
          zIndex: zIndex ?? 1,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
