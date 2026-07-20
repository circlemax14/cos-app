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
import { SwipeableTaskRow } from '@/components/unified-plan/v2/SwipeableTaskRow';
import type { UnifiedPlanView, UnifiedSectionKey } from '@/services/api/unified-plan';

export interface BpsAccordionProps {
  /** Live plan payload from useUnifiedPlan. Optional so the shell still
   *  renders while the data is loading or when the BE flag is off. */
  view?: UnifiedPlanView | null;
  /** Called after a swipe action succeeds so the parent can refetch. */
  onRefetch?: () => void;
}

export function BpsAccordion({ view, onRefetch }: BpsAccordionProps = {}): React.JSX.Element {
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
              <View style={[styles.expandedBlock, { borderTopColor: colors.border }]}>
                {/* Plan bullets */}
                <Text style={[styles.blockTitle, { color: colors.subtext }]}>
                  Plan
                </Text>
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

                {/* Goals (chunk 4) */}
                <Text style={[styles.blockTitle, { color: colors.subtext, marginTop: 16 }]}>
                  Goals · {view?.sections?.[key]?.goals?.length ?? 0}
                </Text>
                {(view?.sections?.[key]?.goals ?? []).length === 0 ? (
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(13),
                      fontStyle: 'italic',
                    }}
                  >
                    No goals in this domain.
                  </Text>
                ) : (
                  (view?.sections?.[key]?.goals ?? []).map((g) => (
                    <View
                      key={`${key}-g-${g.id}`}
                      style={[styles.goalRow, { borderColor: colors.border }]}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(14),
                          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                        }}
                        numberOfLines={2}
                      >
                        {g.title}
                      </Text>
                      {g.metric || g.target ? (
                        <Text
                          style={{
                            color: colors.subtext,
                            fontSize: getScaledFontSize(12),
                            marginTop: 4,
                          }}
                          numberOfLines={2}
                        >
                          {[g.metric, g.target ? `Target: ${g.target}` : null, g.timeframe]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      ) : null}
                      {g.source === 'care_manager' ? (
                        <Text
                          style={{
                            color: meta.color,
                            fontSize: getScaledFontSize(11),
                            marginTop: 4,
                          }}
                        >
                          From your care team
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}

                {/* Tasks (chunk 5, read-only, no swipe) */}
                <Text style={[styles.blockTitle, { color: colors.subtext, marginTop: 16 }]}>
                  Tasks · {view?.sections?.[key]?.tasks?.length ?? 0}
                </Text>
                {(view?.sections?.[key]?.tasks ?? []).length === 0 ? (
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(13),
                      fontStyle: 'italic',
                    }}
                  >
                    No tasks in this domain.
                  </Text>
                ) : (
                  (view?.sections?.[key]?.tasks ?? []).map((t) => (
                    <SwipeableTaskRow
                      key={`${key}-t-${t.id}`}
                      task={t}
                      accentColor={meta.color}
                      onRefetch={onRefetch}
                    />
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
  expandedBlock: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  blockTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.06 * 11,
    fontWeight: '500',
    marginBottom: 2,
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
  goalRow: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    minWidth: 88,
  },
  swipeActionsRight: {
    flexDirection: 'row',
  },
  swipeActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
