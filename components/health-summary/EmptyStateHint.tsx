import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export type EmptyStateHintProps = {
  text: string;
  testID?: string;
};

function EmptyStateHint({ text, testID }: EmptyStateHintProps) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <Text
      testID={testID}
      accessibilityRole="text"
      style={[styles.hint, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: { fontStyle: 'italic', lineHeight: 20 },
});

export default EmptyStateHint;
