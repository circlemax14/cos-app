import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { IntakeSection } from '@/types/patient-intake';

// Ken PDF v7.2 BPS palette — duplicated here rather than extracted from
// SubdomainChip's non-exported DOMAIN_STYLE (out of scope for HS-1).
// Consolidation into lib/bps-domain-colors.ts is tracked as a follow-up.
export const SECTION_COLOR: Record<IntakeSection, string> = {
  body: '#199C4F', // bio
  mind: '#7B3FE4', // psy
  life: '#C97600', // soc
};

export const SECTION_LABEL: Record<IntakeSection, string> = {
  body: 'Body',
  mind: 'Mind',
  life: 'Life',
};

interface Props {
  section: IntakeSection;
  stepIdx: number;
  total: number;
  onClose: () => void;
}

const SECTIONS: IntakeSection[] = ['body', 'mind', 'life'];

export default function IntakeProgressHeader({ section, stepIdx, total, onClose }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const accent = SECTION_COLOR[section];
  const pct = total > 0 ? Math.min(1, (stepIdx + 1) / total) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.chipsRow}>
          {SECTIONS.map((s) => {
            const isActive = s === section;
            const chipColor = SECTION_COLOR[s];
            return (
              <View
                key={s}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? chipColor : 'transparent',
                    borderColor: chipColor,
                  },
                ]}
              >
                <Text
                  style={{
                    color: isActive ? '#FFFFFF' : chipColor,
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(700) as any,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {SECTION_LABEL[s]}
                </Text>
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close intake"
        >
          <MaterialIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border, marginTop: 12 }]}>
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: accent,
            width: `${pct * 100}%`,
          }}
        />
      </View>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(500) as any,
          marginTop: 6,
        }}
      >
        Question {stepIdx + 1} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 12, paddingBottom: 12 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  barTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
});
