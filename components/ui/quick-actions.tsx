import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Radii, Typography } from '@/constants/design-system';

interface QuickActionItem {
  icon: string;
  sfSymbol: string;
  label: string;
  onPress: () => void;
}

interface QuickActionsProps {
  primaryDoctorPhone?: string;
}

export function QuickActions({ primaryDoctorPhone }: QuickActionsProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  const actions: QuickActionItem[] = [
    {
      icon: '📞',
      sfSymbol: 'phone.fill',
      label: 'Call Doctor',
      onPress: () => {
        if (primaryDoctorPhone) {
          Linking.openURL(`tel:${primaryDoctorPhone}`);
        }
      },
    },
    {
      icon: '📅',
      sfSymbol: 'calendar',
      label: 'Next Visit',
      onPress: () => {
        router.push('/Home/appointments' as never);
      },
    },
    {
      icon: '🆘',
      sfSymbol: 'exclamationmark.triangle.fill',
      label: 'Emergency',
      onPress: () => {
        router.push('/Home/emergency-contact' as never);
      },
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => {
            if (process.env.EXPO_OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={`Double tap to ${action.label.toLowerCase()}`}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <IconSymbol
            name={action.sfSymbol as any}
            size={getScaledFontSize(24)}
            color={colors.primary}
          />
          <Text
            style={[
              styles.label,
              {
                color: colors.primaryDark,
                fontSize: getScaledFontSize(Typography.footnote.fontSize),
                fontWeight: getScaledFontWeight(600) as any,
              },
            ]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  action: {
    flex: 1,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    padding: Spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    gap: Spacing.xs + 2,
  },
  label: {
    textAlign: 'center',
  },
});
