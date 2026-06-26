/**
 * PersonalGoalsSection (COS-405 / SCRUM-532) — the patient-authored side of a
 * category's GOALS section in the v3 category-first plan.
 *
 * Renders, for ONE category:
 *   - the patient's personal goals for that category as cards (title, plain
 *     measure, progress for quantitative / status chip + "Add reflection" for
 *     qualitative, and an Edit button) — reusing the v3 goal-card styling, and
 *   - an unmistakable "+ Add goal" affordance.
 *
 * Owns the personal-goals data via the React Query hooks and orchestrates the
 * add/edit sheet (PersonalGoalSheet) + the qualitative reflection sheet
 * (PersonalGoalReflectionSheet).
 *
 * GATING: renders NOTHING and makes NO network calls while
 * `PERSONAL_GOALS_ENABLED` is off (the hook is `enabled`-gated on the same
 * flag). With the flag ON but the backend not yet shipped, the list GET 404s →
 * the service returns [] → only the "+ Add goal" affordance shows; everything
 * still degrades gracefully (no error spam).
 *
 * A single PersonalGoalsSection instance is mounted per category by
 * PlanScreenRedesigned; each instance filters the shared goals list to its own
 * category, so we fetch once and slice many.
 */
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  PERSONAL_GOALS_ENABLED,
  cadenceLabel,
  formatPersonalGoalMeasure,
  personalGoalProgressFraction,
  personalGoalStatusLabel,
  personalGoalsForCategory,
  type NormalizedPersonalGoal,
  type PersonalGoalSubmit,
} from '@/lib/care-plan';
import {
  usePersonalGoals,
  useCreatePersonalGoal,
  useUpdatePersonalGoal,
  useDeletePersonalGoal,
  useAddPersonalGoalReflection,
} from '@/hooks/use-personal-goals';
import { PersonalGoalSheet } from '@/components/health-plan/PersonalGoalSheet';
import { PersonalGoalReflectionSheet } from '@/components/health-plan/PersonalGoalReflectionSheet';

type ColorMap = Record<string, string>;

export interface PersonalGoalsSectionProps {
  categoryKey: string;
  categoryLabel: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function PersonalGoalsSection(props: PersonalGoalsSectionProps) {
  const { categoryKey, categoryLabel, colors, getScaledFontSize, getScaledFontWeight } = props;

  // The hook is enabled-gated on PERSONAL_GOALS_ENABLED, so this never fetches
  // while the flag is off. Still, short-circuit the whole render for clarity.
  const { goals: allGoals } = usePersonalGoals();
  const createMut = useCreatePersonalGoal();
  const updateMut = useUpdatePersonalGoal();
  const deleteMut = useDeletePersonalGoal();
  const reflectMut = useAddPersonalGoalReflection();

  const goals = useMemo(
    () => personalGoalsForCategory(allGoals, categoryKey),
    [allGoals, categoryKey],
  );

  // Sheet state.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<NormalizedPersonalGoal | null>(null);
  const [reflectGoal, setReflectGoal] = useState<NormalizedPersonalGoal | null>(null);

  if (!PERSONAL_GOALS_ENABLED) return null;

  const tint = colors.tint;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = (colors.card as string) + 'D9';

  const saving = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (g: NormalizedPersonalGoal) => {
    setEditing(g);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  const handleSubmit = async (value: PersonalGoalSubmit) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, body: value });
      } else {
        await createMut.mutateAsync({ category: categoryKey, body: value });
      }
      setSheetOpen(false);
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      setSheetOpen(false);
    } catch {
      Alert.alert('Could not delete', 'Please try again.');
    }
  };

  const handleReflection = async (input: { note?: string; rating?: number }) => {
    if (!reflectGoal) return;
    try {
      await reflectMut.mutateAsync({ id: reflectGoal.id, input });
      setReflectGoal(null);
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  return (
    <View style={{ marginTop: goals.length ? 4 : 0 }}>
      {/* Personal-goal cards for this category. */}
      {goals.map((g) => {
        const measure = formatPersonalGoalMeasure(g);
        const frac = personalGoalProgressFraction(g);
        const isQual = g.type === 'qualitative';
        return (
          <View key={g.id} style={[styles.goalCard, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.headRow}>
              <View style={[styles.dot, { backgroundColor: tint + '1A' }]}>
                <MaterialIcons name="person" size={getScaledFontSize(16)} color={tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any, lineHeight: 22 }}
                >
                  {g.title}
                </Text>
                <Text style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
                  Your goal · {cadenceLabel(g.cadence)}
                </Text>
              </View>
            </View>

            {!!g.description && (
              <Text style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: 19, marginTop: 8 }}>
                {g.description}
              </Text>
            )}

            {/* Qualitative → status chip; quantitative → plain measure line. */}
            {isQual ? (
              <View style={[styles.statusChip, { backgroundColor: tint + '14', borderColor: tint + '33' }]}>
                <Text style={{ color: tint, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(700) as any }}>
                  {personalGoalStatusLabel(g.status)}
                </Text>
              </View>
            ) : (
              !!measure && (
                <Text
                  style={{ color: text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any, marginTop: 10 }}
                >
                  {measure}
                </Text>
              )
            )}

            {/* Quantitative progress bar. */}
            {!isQual && frac != null && (
              <View style={[styles.track, { backgroundColor: border }]}>
                <View style={[styles.fill, { width: `${frac * 100}%` as any, backgroundColor: tint }]} />
              </View>
            )}

            {/* Footer actions: qualitative gets "Add reflection"; all get Edit. */}
            <View style={styles.footer}>
              {isQual ? (
                <TouchableOpacity
                  onPress={() => setReflectGoal(g)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add reflection for ${g.title}`}
                  style={[styles.reflectBtn, { borderColor: border }]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <MaterialIcons name="rate-review" size={getScaledFontSize(15)} color={subtext} />
                  <Text style={{ color: subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any, marginLeft: 6 }}>
                    Add reflection
                  </Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity
                onPress={() => openEdit(g)}
                accessibilityRole="button"
                accessibilityLabel={`Edit your goal: ${g.title}`}
                style={[styles.editBtn, { borderColor: tint }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons name="edit" size={getScaledFontSize(15)} color={tint} />
                <Text style={{ color: tint, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any, marginLeft: 6 }}>
                  Edit
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* "+ Add goal" affordance — always present (this is the patient-authoring
          entry point). Dashed outline so it reads as an add target. */}
      <TouchableOpacity
        onPress={openAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add your own goal in ${categoryLabel}`}
        style={[styles.addBtn, { borderColor: tint }]}
      >
        <MaterialIcons name="add" size={getScaledFontSize(18)} color={tint} />
        <Text style={{ color: tint, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any, marginLeft: 6 }}>
          Add goal
        </Text>
      </TouchableOpacity>

      <PersonalGoalSheet
        visible={sheetOpen}
        category={categoryKey}
        categoryLabel={categoryLabel}
        editing={editing}
        saving={saving}
        onClose={closeSheet}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      />

      <PersonalGoalReflectionSheet
        visible={reflectGoal !== null}
        goalTitle={reflectGoal?.title ?? ''}
        saving={reflectMut.isPending}
        onClose={() => setReflectGoal(null)}
        onSubmit={handleReflection}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  goalCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statusChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 10,
  },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  fill: { height: 8, borderRadius: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  reflectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 40,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    minHeight: 44,
  },
});
