/**
 * Goal editor (COS-417) — edits a single `MeasurableGoal` (title / description
 * / target / timeframe) on the biopsychosocial (3-section) Care Plan.
 *
 * Previously a bottom-sheet `<Modal>` owned by `BiopsychosocialPlanScreen`,
 * opened per-goal from `SectionCard` → `GoalCard`'s edit action. Converted to
 * a standalone route as part of the biopsychosocial-UI Modal removal (see
 * `components/health-plan/BiopsychosocialPlanScreen.tsx`'s `openGoalEditor`):
 * a plain 4-field form + Save has no real need for a native modal
 * presentation, and this keeps the screen's presentation lifecycle owned by
 * expo-router instead of a second manually-toggled overlay.
 *
 * Reuses the identical `updatePlanGoal` / `GoalPatch` contract as the legacy
 * Care Plan editor (`app/Home/health-plan.tsx`, COS-377) because the backend
 * dual-writes the same measurable goals to both the legacy AI_GENERATED_PLAN
 * and the new BIOPSYCHOSOCIAL_PLAN record for one release cycle (see
 * assessment-strategy-v2.md §3.1) — on success we invalidate both query keys
 * so every surface reflects the edit.
 *
 * The goal itself isn't refetched by id — it's looked up from the already-
 * loaded `useBiopsychosocialPlan()` cache (populated by
 * `BiopsychosocialPlanScreen`, the only screen that links here), which also
 * means a cold deep-link with a stale/unknown `goalId` degrades to a
 * friendly "not found" state instead of crashing.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { updatePlanGoal, type GoalPatch } from '@/services/api/ai-health-plan';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';

function findGoal(
  plan: ReturnType<typeof useBiopsychosocialPlan>['data'],
  goalId: string | undefined,
): MeasurableGoal | null {
  if (!goalId || !plan?.plan) return null;
  const { biological, psychological, social } = plan.plan.sections;
  return (
    biological.goals.find((g) => g.id === goalId) ??
    psychological.goals.find((g) => g.id === goalId) ??
    social.goals.find((g) => g.id === goalId) ??
    null
  );
}

export default function GoalEditorScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'] as unknown as Record<string, string>;
  const queryClient = useQueryClient();
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();

  const planQuery = useBiopsychosocialPlan();
  const goal = findGoal(planQuery.data, goalId);

  const [editTitle, setEditTitle] = React.useState(goal?.title ?? '');
  const [editDesc, setEditDesc] = React.useState(goal?.description ?? '');
  const [editTarget, setEditTarget] = React.useState(goal?.target ?? '');
  const [editTimeframe, setEditTimeframe] = React.useState(goal?.timeframe ?? '');
  // Fields seed from `goal` once it resolves (cold deep-link / slow cache
  // hydration case) — guarded so we don't clobber in-progress edits on an
  // unrelated re-render.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) return;
    if (!goal) return;
    seededRef.current = true;
    setEditTitle(goal.title);
    setEditDesc(goal.description ?? '');
    setEditTarget(goal.target ?? '');
    setEditTimeframe(goal.timeframe ?? '');
  }, [goal]);

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GoalPatch }) => updatePlanGoal(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biopsychosocial-plan'] });
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] });
    },
  });

  const onClose = React.useCallback(() => router.back(), []);

  const onSave = React.useCallback(async () => {
    if (!goal) return;
    const patch: GoalPatch = {};
    if (editTitle !== goal.title) patch.title = editTitle;
    if (editDesc !== (goal.description ?? '')) patch.description = editDesc;
    if (editTarget !== (goal.target ?? '')) patch.target = editTarget;
    if (editTimeframe !== (goal.timeframe ?? '')) patch.timeframe = editTimeframe;
    try {
      await updateGoalMutation.mutateAsync({ id: goal.id, patch });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  }, [goal, editTitle, editDesc, editTarget, editTimeframe, updateGoalMutation]);

  // ── Loading (plan cache not yet populated, e.g. cold deep-link) ─────────
  if (planQuery.isLoading) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </AppWrapper>
    );
  }

  // ── Not found (unknown/stale goalId, or the plan itself failed to load) ─
  if (!goal) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <MaterialIcons name="error-outline" size={40} color={colors.error ?? '#DC2626'} />
          <Text style={[styles.notFoundTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
            Couldn&apos;t find that goal
          </Text>
          <Pressable onPress={onClose} style={[styles.backBtn, { backgroundColor: colors.tint }]} accessibilityRole="button">
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>Go back</Text>
          </Pressable>
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 },
            ]}
          >
            Edit Goal
          </Text>
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={{ padding: Spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TITLE</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={editTitle}
            onChangeText={setEditTitle}
            maxLength={120}
            placeholder="Goal title"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={editDesc}
            onChangeText={setEditDesc}
            maxLength={300}
            multiline
            numberOfLines={3}
            placeholder="Description"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TARGET</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={editTarget}
            onChangeText={setEditTarget}
            maxLength={40}
            placeholder="Goal value"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TIMEFRAME</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={editTimeframe}
            onChangeText={setEditTimeframe}
            maxLength={40}
            placeholder="e.g. 3 months"
            placeholderTextColor={colors.subtext}
          />

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={[styles.footerBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>Cancel</Text>
            </Pressable>
            <TouchableOpacity
              onPress={onSave}
              disabled={updateGoalMutation.isPending}
              style={[
                styles.footerBtn,
                { backgroundColor: colors.tint, borderColor: colors.tint, opacity: updateGoalMutation.isPending ? 0.7 : 1 },
              ]}
            >
              {updateGoalMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  headerTitle: { flex: 1 },
  notFoundTitle: { marginTop: 12, marginBottom: 20, textAlign: 'center' },
  backBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  scrollArea: { flex: 1 },
  fieldLabel: { marginTop: Spacing.sm, marginBottom: 4, letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 12, marginTop: Spacing.md },
  footerBtn: { flex: 1, borderWidth: 1, borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
});
