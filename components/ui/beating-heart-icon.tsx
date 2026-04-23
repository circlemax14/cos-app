import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface BeatingHeartIconProps {
  size?: number;
  color: string;
  /** Accent color for the AI sparkle overlay. Defaults to the heart color. */
  sparkleColor?: string;
  /** Set to false to render a static heart (no pulse, no echo). */
  animated?: boolean;
}

/**
 * Heart-monitor icon (heart with a built-in ECG wave) that pulses at a
 * natural ~70bpm lub-dub cadence, emits an echo ring on each beat, and
 * carries a small AI sparkle in the upper-right corner. Used for the
 * Health Plan tab so the AI-generated plan reads as "a living,
 * intelligent companion" rather than a static list.
 *
 * All animations use the native driver so the pulse stays smooth on
 * the JS thread even under load.
 */
export function BeatingHeartIcon({
  size = 26,
  color,
  sparkleColor,
  animated = true,
}: BeatingHeartIconProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const sparkleOpacity = useRef(new Animated.Value(0.85)).current;
  const echoScale = useRef(new Animated.Value(1)).current;
  const echoOpacity = useRef(new Animated.Value(0)).current;

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

    // Echo ring: on each lub, spawn a ring that expands + fades out so
    // it looks like the ECG signal rippling outward from the heart.
    // Single-beat rhythm matches the total heartbeat cycle duration
    // (140 + 180 + 120 + 160 + 700 = 1300ms).
    const echoRing = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(echoScale, {
            toValue: 1.6,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(echoOpacity, {
              toValue: 0.5,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.timing(echoOpacity, {
              toValue: 0,
              duration: 780,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(echoScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(echoOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ]),
    );

    // AI sparkle shimmers on its own cadence so the two feel like one
    // living thing rather than a locked-step animation.
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
    echoRing.start();
    shimmer.start();
    return () => {
      heartbeat.stop();
      echoRing.stop();
      shimmer.stop();
    };
  }, [animated, scale, sparkleOpacity, echoScale, echoOpacity]);

  const sparkleSize = Math.max(10, Math.round(size * 0.42));
  const effectiveSparkleColor = sparkleColor ?? color;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Echo ring — expands + fades out on each beat for the ECG feel */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.echo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            opacity: echoOpacity,
            transform: [{ scale: echoScale }],
          },
        ]}
      />
      {/* Heart with built-in ECG line */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <MaterialIcons name="monitor-heart" size={size} color={color} />
      </Animated.View>
      {/* AI sparkle */}
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
  echo: {
    position: 'absolute',
    borderWidth: 1.5,
  },
});
