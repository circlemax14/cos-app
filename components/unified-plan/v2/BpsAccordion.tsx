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
 * Chunk 21 (2026-07-21): inline section-task progress rail — a 3px section-tinted bar rendered as a sibling immediately after each header Pressable (visible in BOTH collapsed AND expanded states, so Bio auto-open gets an ambient adherence signal on first paint that chunk 20's suppressed subtitle doesn't cover). Sourced from a new module-scope sectionTaskProgress helper that summarizeSection now also consumes — bar and subtitle share one source of truth and cannot visually disagree. pointerEvents='none' + both a11y hide props on the outer track so it never intercepts header taps and never double-utters over chunk 20's already-widened label. marginBottom:-1 visually merges the rail with expandedBlock's borderTopWidth:1 so an expanded section never reads as a doubled border. Fill child always mounted (width:'0%' when 0) to avoid a null-vs-View reconciliation flash. No new hooks/effects/state/timers/imports; still all-View/Text/StyleSheet — iOS 26.5 hard constraints preserved by construction.
 * Chunk 23 (2026-07-21): completed/skipped tasks sink to the bottom of each BPS section. Module-scope pure orderTasksForDisplay helper does a two-pass filter+concat partition (stable by construction; not sort-engine dependent). Enum-drift default treats null/undefined/unknown status as pending (top) — mirrors chunks 20/21 degrade philosophy so unknown statuses stay actionable, not visually retired. Header count reads from rawTasks.length (unchanged), map iterates displayTasks — a partition bug is visually detectable as a count-mismatch. SwipeableTaskRow key stays `${key}-t-${t.id}` (id-only) so React reconciles by id and each row instance survives the reorder — preserves chunk-22's pendingSkip / skipTimerRef / refetchTimerRef through a status flip and avoids double-firing the fire-and-forget Skip POST. Instantaneous jump with no animation (LayoutAnimation is on the iOS 26.5 forbidden list); chunk 22's 4s undo + t+5.5s refetch cadence already softens the transition and the state change is user-initiated (expected). No new hooks/effects/state/timers/imports.
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
 * Chunk 21 — module-scope pure helper. Returns the trustworthy
 * {completed, total} pair for a section's tasks, or null when we cannot
 * make a defensible progress claim.
 *
 * Contract:
 *   - null / undefined section        → null (rail unmounts)
 *   - empty or absent .tasks array    → null (no bare 3px track on goal-only sections)
 *   - ANY task missing/unknown status AND completed === 0
 *                                     → null (mirrors chunk 20's enum-drift
 *                                       degrade — the bar hides in the exact
 *                                       same case the subtitle drops its
 *                                       "N done" fragment, so the two
 *                                       visuals can never contradict)
 *   - otherwise                       → { completed, total }
 *
 * Caller is responsible for `Math.min(completed, total)` before dividing
 * so a future BE double-mark race that ships completed > total cannot
 * overflow 100% width.
 *
 * Pure — no React, no closures. O(tasks.length).
 */
function sectionTaskProgress(
  section: UnifiedPlanView['sections'][UnifiedSectionKey] | null | undefined,
): { completed: number; total: number } | null {
  if (!section) return null;
  const tasks = section.tasks ?? [];
  const total = tasks.length;
  if (total === 0) return null;
  const completed = tasks.reduce(
    (n, task) => (task.status === 'completed' ? n + 1 : n),
    0,
  );
  const hasMissingStatus = tasks.some((task) => task.status == null);
  if (completed === 0 && hasMissingStatus) return null;
  return { completed, total };
}

/**
 * Chunk 23 — module-scope pure helper. Reorders a section's tasks so
 * pending rows render first and non-pending (completed/skipped) rows
 * sink to the bottom, preserving BE-supplied ordering within each
 * partition. Two-pass filter+concat is stable by construction (does
 * NOT rely on Array.prototype.sort engine stability).
 *
 * Enum-drift default: null / undefined / unknown status → treated
 * as pending (top). Rationale — BE has shipped new task statuses
 * ahead of the app before; unknown should stay actionable, not be
 * visually retired. Mirrors chunks 20/21 degrade philosophy.
 *
 * Chunk 22 interaction: locallySkipped lives inside SwipeableTaskRow;
 * task.status only flips to 'skipped' after the 4s undo window commits
 * and a refetch lands. During the undo countdown the row still reads
 * as 'pending' from the server payload, so it stays in the top bucket.
 * After commit + refetch it sinks — matches the user's mental model.
 *
 * Pure — O(n), safe to call inline per render (do NOT wrap in useMemo:
 * n ≤ ~30 realistically; a useMemo dep-array on the react-query-
 * returned tasks reference would silently thrash).
 */
function orderTasksForDisplay<T extends { status?: string | null }>(
  tasks: readonly T[] | null | undefined,
): T[] {
  if (!tasks || tasks.length === 0) return [];
  const top: T[] = [];
  const bottom: T[] = [];
  for (const t of tasks) {
    if (t.status == null || t.status === 'pending') top.push(t);
    else bottom.push(t);
  }
  return top.concat(bottom);
}

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
 * Chunk 21: {completed, total} sourced from sectionTaskProgress so the
 * progress rail and this subtitle share one source of truth — bar hides
 * exactly when the subtitle drops its "N done" fragment.
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
  const progress = sectionTaskProgress(section);
  let taskLabel: string;
  if (progress == null) {
    // Enum-drift fallback — never show a misleading "0 done" when the BE
    // stopped shipping the status field. Matches sectionTaskProgress's
    // null-return case exactly so the rail hides in lockstep.
    taskLabel = `${t} task${t === 1 ? '' : 's'}`;
  } else {
    const done = Math.min(progress.completed, progress.total);
    taskLabel = `${done} of ${progress.total} task${progress.total === 1 ? '' : 's'} done`;
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
        // Chunk 21: pure per-render {completed, total} for the inline
        // progress rail. null → rail unmounts (empty tasks or enum drift).
        const progress = sectionTaskProgress(view?.sections?.[key]);
        const pct =
          progress == null
            ? 0
            : Math.min(
                100,
                Math.round(
                  (Math.min(progress.completed, progress.total) / progress.total) * 100,
                ),
              );
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

            {/* Chunk 21: inline section-task progress rail. SIBLING of the
                header Pressable (not nested) to avoid any hit-test
                propagation quirk. pointerEvents='none' as belt-and-
                suspenders so the rail never intercepts header taps. Both
                a11y hide props set — iOS honors accessibilityElementsHidden,
                Android honors importantForAccessibility — so VoiceOver
                doesn't double-utter on top of the chunk-20 header label
                which already speaks "X of Y done". marginBottom: -1
                visually merges with expandedBlock's borderTopWidth:1 when
                the section is expanded so it doesn't read as a doubled
                border. Fill child is always rendered (width: '0%' when
                pct===0) to avoid a null-vs-View reconciliation flash. */}
            {progress != null ? (
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: colors.border, marginBottom: -1 },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct}%`, backgroundColor: meta.color },
                  ]}
                />
              </View>
            ) : null}

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

                {/* Tasks (chunk 5, read-only, no swipe).
                    Chunk 23: compute rawTasks (source of truth for the
                    header count — a partition bug becomes visually
                    detectable as a count-mismatch) and displayTasks
                    (visual-only reorder: completed/skipped sink under
                    pending). Keys stay id-only so react preserves each
                    SwipeableTaskRow instance across a status-driven
                    reorder — preserves chunk-22's pendingSkip / timer
                    refs and avoids a double-fire of the fire-and-forget
                    Skip POST. */}
                {(() => {
                  const rawTasks = view?.sections?.[key]?.tasks ?? [];
                  const displayTasks = orderTasksForDisplay(rawTasks);
                  return (
                    <>
                      <Text style={[styles.blockTitle, { color: colors.subtext, marginTop: 16 }]}>
                        Tasks · {rawTasks.length}
                      </Text>
                      {displayTasks.length === 0 ? (
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
                        displayTasks.map((t) => (
                          <SwipeableTaskRow
                            key={`${key}-t-${t.id}`}
                            task={t}
                            accentColor={meta.color}
                            onRefetch={onRefetch}
                          />
                        ))
                      )}
                    </>
                  );
                })()}
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
  // Chunk 21: inline section-task progress rail. flexDirection:'row' +
  // alignItems:'flex-start' set explicitly so the percent-string width
  // on the child fill resolves reliably on both iOS and Android RN Yoga
  // — some builds ignore a percent width when the parent stretches its
  // children. Colors are NOT set here; the track uses theme
  // `colors.border` and the fill uses the section's meta color inline
  // so it stays section-tinted (Bio blue, Psy purple, Soc green).
  progressTrack: {
    height: 3,
    width: '100%',
    borderRadius: 1.5,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
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
