/**
 * BpsAccordion — CHUNK 2 (2026-07-20).
 *
 * Three collapsed BPS section headers (Bio · Psy · Soc & Spiritual).
 * Tap a header to toggle a chevron; no content is rendered inside yet.
 * All sections start collapsed to keep first-paint primitive count
 * minimal — matches the safe pattern chunk-1 proved works on iOS 26.5.
 *
 * Pure Views + Pressable + Text. No gesture-handler, no Reanimated,
 * no LayoutAnimation, no Animated.Value. Later chunks add content:
 *   - Chunk 3: plan bullets under each section
 *   - Chunk 4: goals list
 *   - Chunk 5: tasks list (read-only)
 *   - Chunk 6: swipe actions on tasks
 *   - ...
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  UNIFIED_SECTION_META,
  UNIFIED_SECTION_ORDER,
} from '@/components/unified-plan/section-labels';
import type { UnifiedPlanView, UnifiedSectionKey } from '@/services/api/unified-plan';

export interface BpsAccordionProps {
  /** Live plan payload from useUnifiedPlan. Optional so the shell still
   *  renders while the data is loading or when the BE flag is off. */
  view?: UnifiedPlanView | null;
}

export function BpsAccordion({ view }: BpsAccordionProps = {}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [openKey, setOpenKey] = React.useState<UnifiedSectionKey | null>(null);

  const onToggle = React.useCallback((key: UnifiedSectionKey) => {
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  return (
    <View style={styles.container}>
      {UNIFIED_SECTION_ORDER.map((key) => {
        const meta = UNIFIED_SECTION_META[key];
        const isOpen = openKey === key;
        const bullets = view?.sections?.[key]?.planBullets ?? [];
        return (
          <View
            key={key}
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Pressable
              onPress={() => onToggle(key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${meta.title} section, ${isOpen ? 'expanded' : 'collapsed'}`}
              style={({ pressed }) => [
                styles.headerRow,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={[styles.iconChip, { backgroundColor: meta.color + '1A' }]}>
                <MaterialIcons
                  name={meta.icon as never}
                  size={getScaledFontSize(20)}
                  color={meta.color}
                />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                }}
              >
                {meta.title}
              </Text>
              <MaterialIcons
                name={isOpen ? 'expand-less' : 'expand-more'}
                size={getScaledFontSize(22)}
                color={colors.subtext}
              />
            </Pressable>

            {isOpen ? (
              <View style={[styles.bulletsBlock, { borderTopColor: colors.border }]}>
                {bullets.length === 0 ? (
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(13),
                      fontStyle: 'italic',
                    }}
                  >
                    No plan bullets yet for this domain.
                  </Text>
                ) : (
                  bullets.map((line, idx) => (
                    <View key={`${key}-b-${idx}`} style={styles.bulletRow}>
                      <View style={[styles.bulletDot, { backgroundColor: meta.color }]} />
                      <Text
                        style={{
                          flex: 1,
                          color: colors.text,
                          fontSize: getScaledFontSize(14),
                          lineHeight: 20,
                        }}
                      >
                        {line}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    gap: 10,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletsBlock: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
});
