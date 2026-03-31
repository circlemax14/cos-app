import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, TouchTargets, Radii } from '@/constants/design-system';

interface NumberPadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometric?: () => void;
  showBiometric?: boolean;
}

export function NumberPad({ onDigit, onDelete, onBiometric, showBiometric }: NumberPadProps) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  const handlePress = (value: string) => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDigit(value);
  };

  const renderKey = (value: string | null, action?: 'delete' | 'biometric') => {
    if (value === null && !action) {
      return <View style={styles.key} />;
    }

    const onPress = action === 'delete'
      ? onDelete
      : action === 'biometric'
        ? onBiometric
        : () => handlePress(value!);

    const label = action === 'delete' ? '⌫' : action === 'biometric' ? '🔐' : value!;
    const accessLabel = action === 'delete' ? 'Delete' : action === 'biometric' ? 'Use Face ID' : `Digit ${value}`;

    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessLabel}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: pressed
              ? colors.border
              : settings.isDarkTheme ? colors.surface : '#F3F4F6',
            borderRadius: Radii.lg,
          },
        ]}
      >
        <Text
          style={[
            styles.keyText,
            {
              color: action === 'delete' ? colors.error : colors.text,
              fontSize: getScaledFontSize(action ? 20 : 24),
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
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
            <React.Fragment key={digit}>{renderKey(digit)}</React.Fragment>
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {showBiometric && onBiometric
          ? renderKey(null, 'biometric')
          : <View style={styles.key} />}
        {renderKey('0')}
        {renderKey(null, 'delete')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm + 4,
  },
  key: {
    flex: 1,
    height: TouchTargets.numberPadButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontWeight: '600',
  },
});
