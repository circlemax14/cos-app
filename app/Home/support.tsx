import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SupportScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
        Support
      </Text>
      <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
        Need help? Contact our support team.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
  },
});
