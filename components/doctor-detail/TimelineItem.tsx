/**
 * TimelineItem — a single event row inside an EncounterGroup.
 * Colored 3px left rule encodes event kind:
 *   blue   = medication-added
 *   green  = diagnosis-resolved
 *   amber  = diagnosis-recorded (active recorded at this visit)
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { JargonText } from '@/components/JargonText';
import type { TimelineEvent } from '@/services/api/types';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface TimelineItemProps {
  event: TimelineEvent;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  style?: ViewStyle;
}

const RULE_COLOR: Record<TimelineEvent['kind'], string> = {
  'medication-added': '#2563EB',     // blue
  'diagnosis-resolved': '#059669',   // green
  'diagnosis-recorded': '#D97706',   // amber
};

export function TimelineItem({
  event,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  style,
}: TimelineItemProps) {
  const ruleColor = RULE_COLOR[event.kind];

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderLeftColor: ruleColor },
        style,
      ]}
    >
      <JargonText
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(600) as any,
        }}
      >
        {event.title}
      </JargonText>
      {event.subtitle && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
          }}
        >
          {event.subtitle}
        </Text>
      )}
      {event.reasonText && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          {event.reasonText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
});
