import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface AiClipboardIconProps {
  size?: number;
  color: string;
  sparkleColor?: string;
  animated?: boolean;
}

/**
 * Medical-clipboard icon with an AI sparkle in the upper-right corner.
 * Used on the Health Summary tab so the AI-synthesized snapshot reads
 * as a "chart, but smart" — distinct from the beating-heart Health Plan
 * tab. Sparkle shimmers on its own cadence when animated.
 */
export function AiClipboardIcon({
  size = 26,
  color,
  sparkleColor,
  animated = true,
}: AiClipboardIconProps) {
  const sparkleOpacity = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!animated) return;

    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleOpacity, {
          toValue: 1.0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleOpacity, {
          toValue: 0.55,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.delay(400),
      ]),
    );

    shimmer.start();
    return () => {
      shimmer.stop();
    };
  }, [animated, sparkleOpacity]);

  const sparkleSize = Math.max(10, Math.round(size * 0.42));
  const effectiveSparkleColor = sparkleColor ?? color;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <MaterialCommunityIcons name="clipboard-text" size={size} color={color} />
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
