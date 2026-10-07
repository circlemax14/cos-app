import React from 'react';
import { StyleSheet } from 'react-native';
import { ActivityIndicator, Modal, Portal, Text, useTheme } from 'react-native-paper';

/**
 * COS-1255 — a full-screen loader that takes every tap while signing in or out.
 *
 * Vishal, 2026-10-07: a spinner on the button alone left the rest of the app
 * live — mid sign-out he could open the menu and walk to another screen.
 *
 * Paper's Portal draws this at the PaperProvider in app/_layout.tsx, above the
 * whole navigator, so it covers the drawer and the tabs too, wherever it is
 * rendered from. Not dismissable: taps and the Android back button go nowhere.
 * The screen that shows it is the one that navigates away, which unmounts it.
 */
export function BlockingLoader({ visible, label }: { visible: boolean; label: string }) {
  const theme = useTheme();
  return (
    <Portal>
      <Modal
        visible={visible}
        dismissable={false}
        dismissableBackButton={false}
        contentContainerStyle={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <ActivityIndicator size="large" accessibilityLabel={label} />
        <Text variant="titleMedium">{label}</Text>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 16,
  },
});
