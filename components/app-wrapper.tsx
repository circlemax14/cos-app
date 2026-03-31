import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AppWrapperProps {
  children: React.ReactNode;
  /** @deprecated No longer rendered — kept for backward compatibility */
  showFooter?: boolean;
  /** @deprecated No longer rendered — kept for backward compatibility */
  notificationCount?: number;
  /** @deprecated No longer rendered — kept for backward compatibility */
  showAccessibilityIcon?: boolean;
  /** @deprecated No longer rendered — kept for backward compatibility */
  showLogo?: boolean;
  /** @deprecated No longer rendered — kept for backward compatibility */
  showBellIcon?: boolean;
  /** @deprecated No longer rendered — kept for backward compatibility */
  showHamburgerIcon?: boolean;
}

export function AppWrapper({ children }: AppWrapperProps) {
  const { settings } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
