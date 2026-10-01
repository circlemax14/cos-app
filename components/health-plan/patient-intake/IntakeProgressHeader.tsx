import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { IntakeSection } from '@/types/patient-intake';

import { readableOn } from './intake-legibility';
import { useIntakeLegibility } from './use-intake-legibility';

/*
 * Ken PDF v7.2 BPS palette — duplicated here rather than extracted from
 * SubdomainChip's non-exported DOMAIN_STYLE (out of scope for HS-1).
 * Consolidation into lib/bps-domain-colors.ts is tracked as a follow-up.
 *
 * COS-1221 — these are NOT darkened, even though white-on-life was 3.46:1.
 * They are used in four roles on this screen: as a chip fill, as chip text, as
 * the progress bar, and as the selected option row's fill. A hue dark enough
 * for white text is too dark to read AS text on the page background and too
 * close to the dark card to register as a fill. Each text role derives its own
 * foreground instead (see readableOn in intake-legibility.ts).
 */
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
  // COS-1221 — this header is the frame around the question card, and it was
  // left on the unstepped scaler: on the iPad the card's type went to 1.25-1.35x
  // while the step counter directly above the question stayed at 12pt in the
  // 4.62:1 grey the product owner named. Same hook as every other intake file.
  const { colors, fs, fw, muted } = useIntakeLegibility();
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
                    /*
                     * Active: '#FFFFFF' was 3.46:1 on life and 3.55:1 on body,
                     * at 12pt uppercase — the smallest text in this header.
                     * Inactive: the accent AS text was 3.46:1 on the light
                     * background for life. The section hue is still carried by
                     * the chip border, the chip fill and the progress bar, none
                     * of which are text.
                     */
                    color: isActive ? readableOn(chipColor) : colors.text,
                    fontSize: fs(12),
                    fontWeight: fw(700) as any,
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
          <MaterialIcons name="close" size={fs(24)} color={colors.text} />
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
          color: muted,
          fontSize: fs(14),
          fontWeight: fw(500) as any,
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
