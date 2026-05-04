/**
 * ActiveConditionsRow — horizontal flex of active-condition pills,
 * color-coded by clinical status. A trailing "+N resolved" chip toggles
 * an inline list of resolved conditions.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { JargonText } from '@/components/JargonText';
import type { ProviderDiagnosis, ClinicalStatus } from '@/services/api/types';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface ActiveConditionsRowProps {
  active: ProviderDiagnosis[];
  resolved: ProviderDiagnosis[];
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

interface PillStyle {
  bg: string;
  fg: string;
  border: string;
}

const PILL_BY_STATUS: Record<ClinicalStatus, PillStyle> = {
  active:     { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  recurrence: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  relapse:    { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  remission:  { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' },
  inactive:   { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
  resolved:   { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  unknown:    { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
};

export function ActiveConditionsRow({
  active,
  resolved,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ActiveConditionsRowProps) {
  const [resolvedExpanded, setResolvedExpanded] = useState(false);

  if (active.length === 0 && resolved.length === 0) return null;

  return (
    <View style={styles.section}>
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
        ACTIVE
      </Text>

      {active.length > 0 ? (
        <View style={styles.pillRow}>
          {active.map((d) => {
            const pill = PILL_BY_STATUS[d.clinicalStatus];
            return (
              <View
                key={d.id}
                style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}
              >
                <View style={[styles.pillDot, { backgroundColor: pill.fg }]} />
                <JargonText
                  style={{
                    color: pill.fg,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {d.name}
                </JargonText>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingHorizontal: 4 }}>
          No active conditions recorded by this provider.
        </Text>
      )}

      {resolved.length > 0 && (
        <Pressable
          onPress={() => setResolvedExpanded((v) => !v)}
          style={styles.resolvedToggle}
          accessibilityRole="button"
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {resolvedExpanded ? '▾ ' : '▸ '}+{resolved.length} resolved
          </Text>
        </Pressable>
      )}

      {resolvedExpanded && resolved.length > 0 && (
        <View style={styles.resolvedList}>
          {resolved.map((d) => (
            <Text
              key={d.id}
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                paddingVertical: 4,
                paddingHorizontal: 4,
              }}
            >
              ✓ {d.name}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  resolvedToggle: {
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  resolvedList: {
    marginTop: 4,
  },
});
