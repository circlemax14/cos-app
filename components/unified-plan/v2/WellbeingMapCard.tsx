/**
 * WellbeingMapCard — CHUNK 7 (2026-07-20).
 *
 * Compact card at the top of PlanScreenV2 that routes to the existing
 * /Home/wellbeing-map screen (COS-430 → COS-445). Read-only, single
 * tap. No new native surface — just a Pressable + two MaterialIcons.
 *
 * Design memo grounds the accordion below in this map: same three BPS
 * domains, first as a picture, then unfolded into actionable rows.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const WELLBEING_MAP_ROUTE = '/Home/wellbeing-map';

export function WellbeingMapCard(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const onOpen = React.useCallback(() => {
    router.push(WELLBEING_MAP_ROUTE as never);
  }, []);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open your wellbeing map"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: colors.tint + '1A' }]}>
        <MaterialIcons name="hub" size={getScaledFontSize(22)} color={colors.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          Your wellbeing map
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
          }}
          numberOfLines={2}
        >
          Bio · Psy · Soc & Spiritual — see how your domains connect.
        </Text>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={getScaledFontSize(22)}
        color={colors.subtext}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 20,
    gap: 12,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
