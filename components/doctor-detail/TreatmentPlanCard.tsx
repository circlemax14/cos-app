/**
 * TreatmentPlanCard — one card per visit, restoring the legacy
 * "Current Diagnosis & Treatment Plan" / "Previous Diagnosis & Treatment
 * Recommendations" layout. Shows the diagnosis text, formatted date with
 * an Active/Completed status pill, optional description, and the
 * medications prescribed at the visit.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TreatmentPlanItem } from '@/services/api/types';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
  border: string;
}

interface TreatmentPlanCardProps {
  item: TreatmentPlanItem;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

const STATUS_COLORS = {
  Active: { bg: '#E8F5E9', fg: '#1B5E20' },
  Completed: { bg: '#ECEFF1', fg: '#37474F' },
} as const;

export function TreatmentPlanCard({
  item,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: TreatmentPlanCardProps) {
  const status = STATUS_COLORS[item.status];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.headerRow}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(700) as any,
            flex: 1,
          }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <Text
            style={{
              color: status.fg,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {item.status}
          </Text>
        </View>
      </View>

      {item.date ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 4,
          }}
        >
          {item.date}
        </Text>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 1.2,
          marginBottom: 4,
        }}
      >
        DIAGNOSIS
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(500) as any,
        }}
      >
        {item.diagnosis}
      </Text>

      {item.description ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            marginTop: 6,
            fontStyle: 'italic',
          }}
        >
          {item.description}
        </Text>
      ) : null}

      {item.medications.length > 0 ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as any,
              letterSpacing: 1.2,
              marginBottom: 6,
            }}
          >
            MEDICATIONS
          </Text>
          {item.medications.map((med, i) => (
            <View key={`${item.id}-med-${i}`} style={styles.medRow}>
              <View style={[styles.medBullet, { backgroundColor: colors.primary }]} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  flex: 1,
                }}
              >
                {med}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    opacity: 0.7,
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  medBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
