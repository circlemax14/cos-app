import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface BeatingHeartIconProps {
  size?: number;
  color: string;
  /** Accent color for the AI sparkle overlay. Defaults to the heart color. */
  sparkleColor?: string;
  /** Set to false to render a static heart (no pulse, no sparkle shimmer). */
  animated?: boolean;
}

/**
 * Heart icon that pulses at a natural ~70bpm heartbeat cadence (lub-dub
 * pattern with a short rest) and carries a small AI sparkle in the
 * upper-right corner. Used for the Health Plan tab so the AI-generated
 * plan reads as "a living, intelligent companion" rather than a static
 * list.
 *
 * Uses the native driver so the animation stays smooth on the JS thread
 * even under load.
 */
export function BeatingHeartIcon({
  size = 26,
  color,
  sparkleColor,
  animated = true,
}: BeatingHeartIconProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const sparkleOpacity = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!animated) return;

    // Lub-dub-rest: the first beat is a touch stronger than the second,
    // then a longer pause before repeating. Keeps the icon from reading
    // as a jitter.
    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.14,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(700),
      ]),
    );

    // AI sparkle shimmers softly in sync with the beat so the two feel
    // like one living thing rather than an icon + a badge.
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleOpacity, {
          toValue: 1.0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleOpacity, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.delay(400),
      ]),
    );

    heartbeat.start();
    shimmer.start();
    return () => {
      heartbeat.stop();
      shimmer.stop();
    };
  }, [animated, scale, sparkleOpacity]);

  const sparkleSize = Math.max(10, Math.round(size * 0.42));
  const effectiveSparkleColor = sparkleColor ?? color;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <MaterialIcons name="favorite" size={size} color={color} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sparkle,
          {
            top: -Math.round(size * 0.08),
            right: -Math.round(size * 0.08),
            opacity: animated ? sparkleOpacity : 0.9,
          },
        ]}
        pointerEvents="none"
      >
        <MaterialIcons name="auto-awesome" size={sparkleSize} color={effectiveSparkleColor} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sparkle: {
    position: 'absolute',
  },
});
