import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { ReportResultEntry } from '@/services/api/types';

const ABNORMAL = new Set(['H', 'HH', 'L', 'LL', 'A', 'AA']);
const LOW_CODES = new Set(['L', 'LL']);

interface Props {
  results: ReportResultEntry[];
}

export function LabResultsTable({ results }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Abnormal-first ordering when 2+ flagged — keeps the patient's eye on
  // what needs attention, normal rows tail.
  const abnormalCount = results.filter(
    (r) => r.interpretation && ABNORMAL.has(r.interpretation),
  ).length;
  const ordered = abnormalCount >= 2
    ? [...results].sort((a, b) => {
        const aFlag = a.interpretation && ABNORMAL.has(a.interpretation) ? 0 : 1;
        const bFlag = b.interpretation && ABNORMAL.has(b.interpretation) ? 0 : 1;
        return aFlag - bFlag;
      })
    : results;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, styles.headerRow, { borderBottomColor: '#E0E0E0' }]}>
        <Text
          style={[
            styles.colTest,
            styles.headerText,
            { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
          ]}
        >
          TEST
        </Text>
        <Text
          style={[
            styles.colRange,
            styles.headerText,
            { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
          ]}
        >
          RANGE
        </Text>
        <Text
          style={[
            styles.colValue,
            styles.headerText,
            { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any, textAlign: 'right' },
          ]}
        >
          RESULT
        </Text>
      </View>

      {ordered.map((r, idx) => {
        const isAbnormal = !!r.interpretation && ABNORMAL.has(r.interpretation);
        const isLow = !!r.interpretation && LOW_CODES.has(r.interpretation);
        return (
          <View
            key={`${r.name}-${idx}`}
            style={[
              styles.row,
              { borderBottomColor: '#F0F0F0' },
              isAbnormal && styles.abnormalRow,
            ]}
          >
            <Text
              style={[
                styles.colTest,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                },
              ]}
              numberOfLines={2}
            >
              {r.name || '—'}
            </Text>
            <Text
              style={[
                styles.colRange,
                {
                  color: colors.subtext,
                  fontSize: getScaledFontSize(11),
                  fontWeight: getScaledFontWeight(400) as any,
                },
              ]}
              numberOfLines={1}
            >
              {r.referenceRange ?? ''}
            </Text>
            <View style={styles.valueColumn}>
              <Text
                style={[
                  styles.valueText,
                  {
                    color: isAbnormal ? '#DC2626' : colors.text,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(700) as any,
                  },
                ]}
              >
                {r.value}{r.unit ? ` ${r.unit}` : ''}
              </Text>
              {r.interpretation && ABNORMAL.has(r.interpretation) && (
                <View style={[styles.flagPill, isLow && styles.flagPillLow]}>
                  <Text
                    style={[
                      styles.flagPillText,
                      { fontSize: getScaledFontSize(10), fontWeight: getScaledFontWeight(700) as any },
                    ]}
                  >
                    {r.interpretation}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  headerText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colTest: {
    flex: 1.4,
    paddingRight: 8,
  },
  colRange: {
    flex: 1.1,
    paddingRight: 8,
  },
  colValue: {
    flex: 1,
  },
  abnormalRow: {
    backgroundColor: '#FEF6F6',
  },
  valueColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  valueText: {
    textAlign: 'right',
  },
  flagPill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 22,
    alignItems: 'center',
  },
  flagPillLow: {
    backgroundColor: '#6366F1',
  },
  flagPillText: {
    color: 'white',
    letterSpacing: 0.3,
  },
});
