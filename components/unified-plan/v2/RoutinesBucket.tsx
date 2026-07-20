/**
 * RoutinesBucket (COS-475, Phase 6.4).
 *
 * Collapsible group of RoutineRow entries plus a trailing dashed
 * "Add routine" pressable that routes to the routine-editor sheet.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import type { BpsDomain, RoutineRow } from '@/services/api/types';

import { CollapsibleGroup } from '../CollapsibleGroup';
import { HideReadingsToggle } from './HideReadingsToggle';
import { SwipeableRoutineRow } from './SwipeableRoutineRow';

type ColorMap = Record<string, string | undefined>;

export interface RoutinesBucketProps {
  bpsDomain: BpsDomain;
  routines: RoutineRow[];
  accentColor: string;
  offline: boolean;
  hideReadings: boolean;
  onToggleHideReadings: (next: boolean) => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

export function RoutinesBucket({
  bpsDomain,
  routines,
  accentColor,
  offline,
  hideReadings,
  onToggleHideReadings,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onToast,
  onRefetch,
}: RoutinesBucketProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const active = routines.filter((r) => !r.archived);

  const onAdd = () => {
    router.push({
      pathname: '/Home/(plan)/routine-editor' as never,
      params: { bpsDomain },
    } as never);
  };

  return (
    <CollapsibleGroup
      label="Routines"
      icon="repeat"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      colors={colors}
      getScaledFontSize={getScaledFontSize}
      getScaledFontWeight={getScaledFontWeight}
      count={active.length}
      headerRight={
        active.length > 0 ? (
          <HideReadingsToggle
            value={hideReadings}
            onChange={onToggleHideReadings}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        ) : null
      }
    >
      {active.map((r) => (
        <SwipeableRoutineRow
          key={r.id}
          routine={r}
          accentColor={accentColor}
          offline={offline}
          hideReadings={hideReadings}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          onToast={onToast}
          onRefetch={onRefetch}
        />
      ))}
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add routine"
        style={({ pressed }) => [
          styles.addCta,
          {
            borderColor: accentColor + '55',
            backgroundColor: accentColor + '0A',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        testID={`plan-v2-routines-add-${bpsDomain}`}
      >
        <MaterialIcons name="add" size={getScaledFontSize(14)} color={accentColor} />
        <Text
          style={{
            color: accentColor,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            marginLeft: 6,
            flex: 1,
          }}
        >
          Add routine
        </Text>
      </Pressable>
      {active.length === 0 ? (
        <Text
          style={{
            color: colors.subtext ?? '#6B7280',
            fontSize: getScaledFontSize(11),
            marginTop: 6,
            lineHeight: 15,
          }}
        >
          Routines are recurring practices — sleep, meditation, walks — you want to stick with.
        </Text>
      ) : null}
      {/* unused View import guard */}
      <View />
    </CollapsibleGroup>
  );
}

const styles = StyleSheet.create({
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.sm - 2,
  },
});
