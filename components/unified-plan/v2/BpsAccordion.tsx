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
 *
 * Chunk 15 (2026-07-20): first section (Biological) auto-opens on mount so plan content is visible on first paint. Tap-to-toggle and single-open semantics unchanged.
 * Chunk 20 (2026-07-21): collapsed-section count+progress subtitle. Pure render-only addition — a module-scope summarizeSection helper feeds a one-line "N goals · X of Y tasks done" (or "No plan yet") secondary Text under each collapsed section header. Widens the header Pressable a11y label to speak the summary in one VoiceOver utterance. Bio auto-open (chunk 15/15.1) means Bio never shows the subtitle on first paint — intentional. No new hooks/effects/state/timers/imports; iOS 26.5 hard constraints preserved by construction.
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

/**
 * Chunk 20 — module-scope pure helper. Returns a short "at-a-glance"
 * summary of a section for the COLLAPSED header subtitle.
 *
 * Rules:
 *   - null section / undefined section     → null (render nothing)
 *   - 0 goals + 0 tasks                    → "No plan yet"
 *   - N goals + 0 tasks                    → "N goal(s)"
 *   - 0 goals + M tasks (with metadata)    → "X of M tasks done"
 *   - N goals + M tasks (with metadata)    → "N goal(s) · X of M tasks done"
 *   - Metadata missing on ANY task row AND completed === 0
 *                                          → degrade to raw "N goal(s) · M task(s)"
 *     so a silent BE enum drift never renders a misleading "0 done" anti-signal.
 *
 * Math.min(completed, t) caps the "done" count at the task count so a future
 * BE bug that ships completed > total can't render "7 of 5 done".
 *
 * Pure — no React, no closures, safe to call inline per section per render.
 * O(tasks.length); trivially cheap even on the largest plans.
 */
function summarizeSection(
  section: UnifiedPlanView['sections'][UnifiedSectionKey] | null | undefined,
): string | null {
  if (!section) return null;
  const goals = section.goals ?? [];
  const tasks = section.tasks ?? [];
  const g = goals.length;
  const t = tasks.length;
  if (g === 0 && t === 0) return 'No plan yet';
  const goalLabel = g === 0 ? null : `${g} goal${g === 1 ? '' : 's'}`;
  if (t === 0) return goalLabel;
  const completed = tasks.reduce(
    (n, task) => (task.status === 'completed' ? n + 1 : n),
    0,
  );
  const hasMissingStatus = tasks.some((task) => task.status == null);
  let taskLabel: string;
  if (completed === 0 && hasMissingStatus) {
    // Enum-drift fallback — never show a misleading "0 done" when the BE
    // stopped shipping the status field.
    taskLabel = `${t} task${t === 1 ? '' : 's'}`;
  } else {
    const done = Math.min(completed, t);
    taskLabel = `${done} of ${t} task${t === 1 ? '' : 's'} done`;
  }
  return goalLabel ? `${goalLabel} · ${taskLabel}` : taskLabel;
}

export interface BpsAccordionProps {
  /** Live plan payload from useUnifiedPlan. Optional so the shell still
   *  renders while the data is loading or when the BE flag is off. */
  view?: UnifiedPlanView | null;
  /** Called after a swipe action succeeds so the parent can refetch. */
  onRefetch?: () => void;
  /** CHUNK 16: parent-driven open request bridged from AISuggestionStrip
   *  chip taps. The nonce bumps on every request (even for the same
   *  section) so the effect below re-fires and re-opens the section
   *  after a manual collapse. */
  openRequest?: { section: UnifiedSectionKey; nonce: number } | null;
  /** CHUNK 16 addendum: parent uses this to record each section's y
   *  position within the accordion so it can scrollTo the section
   *  when a chip is tapped. Fired on every layout pass; parent should
   *  store in a ref, not state (no re-render per layout). */
  onSectionLayout?: (section: UnifiedSectionKey, y: number) => void;
}

export function BpsAccordion({
  view,
  onRefetch,
  openRequest,
  onSectionLayout,
}: BpsAccordionProps = {}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Chunk 15 → 16: sections-open state as a Record (per-section boolean)
  // so multiple sections can be open independently. Chunk 15.1's Bio
  // auto-open on first mount is preserved via the function-form
  // initializer, and the one-shot safety effect below is the same
  // belt-and-suspenders pattern (if Bio somehow ended up closed on
  // first paint, force it open exactly once — empty deps, so a user's
  // manual collapse afterwards is not fought).
  const [openMap, setOpenMap] = React.useState<Record<UnifiedSectionKey, boolean>>(
    () => ({
      biological: (UNIFIED_SECTION_ORDER[0] ?? 'biological') === 'biological',
      psychological: false,
      socialSpiritual: false,
    }),
  );

  React.useEffect(() => {
    setOpenMap((prev) => (prev.biological ? prev : { ...prev, biological: true }));
  }, []);

  // Chunk 16: merge-in effect for the parent-driven openRequest. Only
  // overrides the ONE requested key — Bio's auto-open and any
  // user-toggled Psy/Soc state survive unchanged. The nonce in the
  // openRequest object identity change is what makes this effect re-fire
  // even when the same section is requested twice (React would coalesce
  // a same-value primitive setState and silently drop the second tap).
  React.useEffect(() => {
    if (!openRequest) return;
    setOpenMap((prev) => ({ ...prev, [openRequest.section]: true }));
  }, [openRequest]);

  const onToggle = React.useCallback((key: UnifiedSectionKey) => {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Chunk 19 (2026-07-21): Expand-all / Collapse-all control.
  // allOpen derived INLINE from live openMap every render — do NOT mirror
  // into a separate useState or the label goes stale after a user toggles
  // an individual section header. handleToggleAll writes a SINGLE object
  // literal (not three sequential setState calls) so the chunk-16
  // openRequest merge effect never observes a partial state.
  const allOpen = UNIFIED_SECTION_ORDER.every((k) => openMap[k] === true);
  const handleToggleAll = React.useCallback(() => {
    setOpenMap(
      allOpen
        ? { biological: false, psychological: false, socialSpiritual: false }
        : { biological: true, psychological: true, socialSpiritual: true },
    );
  }, [allOpen]);

  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <Pressable
          onPress={handleToggleAll}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={allOpen ? 'Collapse all' : 'Expand all'}
          style={({ pressed }) => [
            styles.toggleAllPressable,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name={allOpen ? 'unfold-less' : 'unfold-more'}
            size={16}
            color={colors.subtext}
          />
          <Text style={[styles.toggleAllLabel, { color: colors.subtext }]}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </Text>
        </Pressable>
      </View>
      {UNIFIED_SECTION_ORDER.map((key) => {
        const meta = UNIFIED_SECTION_META[key];
        const isOpen = openMap[key] === true;
        const bullets = view?.sections?.[key]?.planBullets ?? [];
        // Chunk 20: pure per-render summary for the collapsed header.
        const summary = summarizeSection(view?.sections?.[key]);
        return (
          <View
            key={key}
            onLayout={(e) => onSectionLayout?.(key, e.nativeEvent.layout.y)}
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
              accessibilityLabel={`${meta.title} section, ${isOpen ? 'expanded' : 'collapsed'}${summary ? ', ' + summary : ''}`}
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
              {/* Chunk 20: title + collapsed subtitle stack; wrapper owns
                  the flex:1 so the chevron stays right-aligned and
                  vertically centered when the stack grows to two lines. */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                  }}
                >
                  {meta.title}
                </Text>
                {!isOpen && summary != null ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.headerSubtitle,
                      { color: colors.subtext, fontSize: getScaledFontSize(12) },
                    ]}
                  >
                    {summary}
                  </Text>
                ) : null}
              </View>
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
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  toggleAllPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleAllLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
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
  // Chunk 20: collapsed-section summary line. fontSize is applied
  // inline via getScaledFontSize(12) at the call site so dynamic type
  // stays honored (StyleSheet.create is module-scope, no hooks).
  headerSubtitle: {
    marginTop: 2,
    fontWeight: '400',
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
