import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/*
 * COS-C6 — extracted verbatim from app/index.tsx's splash gate.
 *
 * The splash already had the only "here is what went wrong, tap retry" screen
 * in the app, and the social sign-in path needed the same thing (Google/Apple
 * sign-up landed on a blank Home when /v1/auth/me was throttled). Rather than
 * grow a second, subtly-different offline screen, the existing one moved here
 * and gained a third variant.
 *
 * The 'no-internet' and 'session-unreadable' copy is LOAD-BEARING and must not
 * be reworded: COS-890 split those two apart precisely because showing "No
 * Internet Connection" for an unwoken Keychain sent Ken to check his wifi.
 * Say what actually happened.
 */
export type ConnectionErrorVariant = 'no-internet' | 'session-unreadable' | 'error';

const COPY: Record<ConnectionErrorVariant, { icon: string; title: string; subtitle: string }> = {
  'no-internet': {
    icon: '📵',
    title: 'No Internet Connection',
    subtitle: 'Check your connection and try again.',
  },
  'session-unreadable': {
    icon: '🔐',
    title: 'Could not open your session',
    subtitle: 'This usually clears straight away. Tap retry to continue.',
  },
  // Generic: we reached the network but could not load the account after
  // retrying. Deliberately does NOT blame the connection.
  error: {
    icon: '⚠️',
    title: 'Something went wrong',
    subtitle: "We couldn't load your account just now. This is usually temporary — tap retry to try again.",
  },
};

export default function ConnectionErrorScreen({
  variant,
  onRetry,
}: {
  variant: ConnectionErrorVariant;
  onRetry: () => void;
}) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const copy = COPY[variant];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.offlineIcon]}>{copy.icon}</Text>
      <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
        {copy.title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
        {copy.subtitle}
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={[styles.retryText, { fontSize: getScaledFontSize(16) }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  offlineIcon: { fontSize: 56 },
  title: { fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -12 },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
