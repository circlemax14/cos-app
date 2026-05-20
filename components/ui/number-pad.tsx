import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing } from '@/constants/design-system';

interface NumberPadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometric?: () => void;
  showBiometric?: boolean;
}

/**
 * Circular PIN keypad (SCRUM-237). Each key is a translucent circle
 * over the lock-screen backdrop with a soft press scale + brand tint
 * pressed state. Replaces the emoji glyphs (⌫, 🔐) with proper
 * Ionicons so the row reads consistently with the rest of the design.
 */
export function NumberPad({ onDigit, onDelete, onBiometric, showBiometric }: NumberPadProps) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  const handlePress = (value: string) => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDigit(value);
  };

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  return (
    <View style={styles.container}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((digit) => (
            <KeyCircle
              key={digit}
              variant="digit"
              label={digit}
              onPress={() => handlePress(digit)}
              accessibilityLabel={`Digit ${digit}`}
              colors={colors}
              isDark={settings.isDarkTheme}
              getScaledFontSize={getScaledFontSize}
            />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {showBiometric && onBiometric ? (
          <KeyCircle
            variant="icon"
            iconName="finger-print"
            onPress={onBiometric}
            accessibilityLabel="Use biometric unlock"
            colors={colors}
            isDark={settings.isDarkTheme}
            getScaledFontSize={getScaledFontSize}
            iconColor={colors.primary}
          />
        ) : (
          <View style={styles.keySpacer} />
        )}
        <KeyCircle
          variant="digit"
          label="0"
          onPress={() => handlePress('0')}
          accessibilityLabel="Digit 0"
          colors={colors}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
        />
        <KeyCircle
          variant="icon"
          iconName="backspace-outline"
          onPress={onDelete}
          accessibilityLabel="Delete"
          colors={colors}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          iconColor={colors.error}
        />
      </View>
    </View>
  );
}

/**
 * Single round key. Press animates a scale-down spring-back and tints
 * the background with a brand wash. Native driver throughout.
 */
function KeyCircle({
  variant,
  label,
  iconName,
  onPress,
  accessibilityLabel,
  colors,
  isDark,
  getScaledFontSize,
  iconColor,
}: {
  variant: 'digit' | 'icon';
  label?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  colors: ReturnType<typeof getColors>;
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  iconColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.92, friction: 5, tension: 250, useNativeDriver: true }),
      Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };
  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 250, useNativeDriver: true }),
      Animated.timing(press, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  // Idle background = neutral translucent surface. Pressed background
  // fades to a brand-tint wash. Animated.View interpolates the alpha
  // via opacity — RN can't animate backgroundColor on the native
  // driver, so we layer a tinted View under the label and animate
  // its opacity instead.
  const idleBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';

  return (
    <Animated.View style={[styles.keyOuter, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.keyCircle, { backgroundColor: idleBg, borderColor }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.keyPressedTint,
            { backgroundColor: colors.primary + '24', opacity: press },
          ]}
        />
        {variant === 'digit' ? (
          <Text
            style={[
              styles.keyLabel,
              { color: colors.text, fontSize: getScaledFontSize(26) },
            ]}
          >
            {label}
          </Text>
        ) : (
          <Ionicons
            name={iconName ?? 'ellipse'}
            size={getScaledFontSize(22)}
            color={iconColor ?? colors.text}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const KEY_SIZE = 68;

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  keyOuter: {
    flex: 1,
    alignItems: 'center',
  },
  keyCircle: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyPressedTint: {
    ...StyleSheet.absoluteFillObject,
  },
  keySpacer: {
    flex: 1,
  },
  keyLabel: {
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
