/**
 * Suggestion actions sheet (COS-475, Phase 6.4).
 *
 * Small action-sheet-styled screen presented as a modal. Three actions:
 * Add to my plan (routes to routine editor), Snooze 1 week, Dismiss.
 * Add to my plan is intentionally the primary CTA; the other two write
 * AsyncStorage via useDismissedSuggestions.
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useDismissedSuggestions } from '@/hooks/use-dismissed-suggestions';

export default function SuggestionActionsSheet(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { dismiss, snooze } = useDismissedSuggestions();

  const onAdd = useCallback(() => {
    router.replace({
      pathname: '/Home/(plan)/routine-editor' as never,
      params: { suggestionId: id ?? '' },
    } as never);
  }, [id]);

  const onSnooze = useCallback(() => {
    if (id) snooze(id, 7 * 24);
    router.back();
  }, [id, snooze]);

  const onDismiss = useCallback(() => {
    if (id) dismiss(id);
    router.back();
  }, [id, dismiss]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ padding: Spacing.md }}
    >
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
          marginBottom: Spacing.sm,
        }}
      >
        Suggestion
      </Text>
      <View style={styles.list}>
        <ActionRow
          onPress={onAdd}
          icon="add-circle-outline"
          label="Add to my plan"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          testID="plan-v2-suggestion-action-add"
        />
        <ActionRow
          onPress={onSnooze}
          icon="schedule"
          label="Snooze 1 week"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        <ActionRow
          onPress={onDismiss}
          icon="close"
          label="Dismiss"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      </View>
    </ScrollView>
  );
}

function ActionRow({
  onPress,
  icon,
  label,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  testID,
}: {
  onPress: () => void;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  colors: typeof Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? (colors.cardBackground as string) ?? colors.card : colors.card,
        },
      ]}
    >
      <MaterialIcons name={icon} size={getScaledFontSize(18)} color={colors.text} />
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          marginLeft: 10,
          flex: 1,
        }}
      >
        {label}
      </Text>
      <MaterialIcons name="chevron-right" size={getScaledFontSize(18)} color={colors.subtext} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
});
