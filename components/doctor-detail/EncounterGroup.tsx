/**
 * EncounterGroup — section header (date · type) plus a stack of TimelineItems
 * for one encounter. The trailing "EARLIER" bucket renders without a date
 * and without a type subtitle.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EncounterGroupView } from '@/services/api/types';
import { TimelineItem } from './TimelineItem';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface EncounterGroupProps {
  group: EncounterGroupView;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

export function EncounterGroup({
  group,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: EncounterGroupProps) {
  const headerParts: string[] = [];
  if (group.dateLabel) headerParts.push(group.dateLabel);
  if (group.typeLabel) headerParts.push(group.typeLabel);

  return (
    <View style={styles.section}>
      {headerParts.length > 0 && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 1.2,
            marginBottom: 8,
            paddingHorizontal: 4,
          }}
        >
          {headerParts.join(' · ')}
        </Text>
      )}
      {group.events.map((event) => (
        <TimelineItem
          key={event.id}
          event={event}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
});
