import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors } from '@/constants/design-system';

interface PinDotsProps {
  length: number;
  filled: number;
  error?: boolean;
}

export function PinDots({ length, filled, error }: PinDotsProps) {
  const { settings } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  return (
    <View style={styles.container} accessibilityLabel={`${filled} of ${length} digits entered`}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < filled
                ? (error ? colors.error : colors.primary)
                : 'transparent',
              borderColor: error ? colors.error : colors.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
});
