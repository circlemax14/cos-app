/**
 * PersonalGoalSheet (COS-405 / SCRUM-532) — add / edit a patient-authored
 * personal goal, and (for qualitative goals) add a period reflection.
 *
 * Reuses the goal-editor modal pattern from health-plan.tsx (slide-up sheet,
 * overlay, scrollable form, Save button) so it matches the rest of the app.
 *
 * Fields:
 *   - type:    Quantitative / Qualitative (segmented)
 *   - cadence: Monthly / Quarterly / Biannual / Yearly (chips)
 *   - title:   required
 *   - description: optional
 *   - quantitative → target (required, numeric) + unit (optional) + baseline (optional)
 *   - qualitative  → initial status (chips)
 *
 * Validation is the PURE `validatePersonalGoalDraft` from lib/care-plan so the
 * submit logic is unit-tested without RN. Submit → onSubmit(category, value).
 * Delete (edit mode only) is confirmed via Alert before onDelete(id).
 *
 * This component renders nothing of its own gating — the parent only mounts it
 * when PERSONAL_GOALS_ENABLED is on.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  PERSONAL_GOAL_CADENCES,
  PERSONAL_GOAL_STATUSES,
  validatePersonalGoalDraft,
  type PersonalGoalCadence,
  type PersonalGoalStatus,
  type PersonalGoalType,
  type PersonalGoalSubmit,
  type NormalizedPersonalGoal,
} from '@/lib/care-plan';

type ColorMap = Record<string, string>;

export interface PersonalGoalSheetProps {
  visible: boolean;
  /** Category key the goal belongs to (fixed by the section that opened the sheet). */
  category: string;
  categoryLabel: string;
  /** Present ⇒ edit mode; absent ⇒ add mode. */
  editing?: NormalizedPersonalGoal | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: PersonalGoalSubmit) => void;
  onDelete?: (id: string) => void;

  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function PersonalGoalSheet(props: PersonalGoalSheetProps) {
  const {
    visible,
    categoryLabel,
    editing,
    saving,
    onClose,
    onSubmit,
    onDelete,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
  } = props;

  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const tint = colors.tint;
  const bg = colors.background;

  const [type, setType] = useState<PersonalGoalType>('quantitative');
  const [cadence, setCadence] = useState<PersonalGoalCadence>('monthly');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [baseline, setBaseline] = useState('');
  const [status, setStatus] = useState<PersonalGoalStatus>('not_started');

  // Seed/reset the form whenever the sheet opens (or the edited goal changes).
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setType(editing.type);
      setCadence(editing.cadence);
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setTarget(editing.target != null ? String(editing.target) : '');
      setUnit(editing.unit ?? '');
      setBaseline(editing.baseline != null ? String(editing.baseline) : '');
      setStatus(editing.status ?? 'not_started');
    } else {
      setType('quantitative');
      setCadence('monthly');
      setTitle('');
      setDescription('');
      setTarget('');
      setUnit('');
      setBaseline('');
      setStatus('not_started');
    }
  }, [visible, editing]);

  const validation = useMemo(
    () =>
      validatePersonalGoalDraft({
        type,
        cadence,
        title,
        description,
        target,
        unit,
        baseline,
        status,
      }),
    [type, cadence, title, description, target, unit, baseline, status],
  );

  const handleSave = () => {
    if (!validation.ok) {
      Alert.alert('Check your goal', validation.error);
      return;
    }
    onSubmit(validation.value);
  };

  const handleDelete = () => {
    if (!editing || !onDelete) return;
    Alert.alert(
      'Delete goal?',
      `“${editing.title}” will be removed from your plan.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(editing.id) },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card as string }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }}
              >
                {editing ? 'Edit goal' : 'Add a goal'}
              </Text>
              <Text style={{ color: subtext, fontSize: getScaledFontSize(12), marginTop: 2 }} numberOfLines={1}>
                {categoryLabel}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialIcons name="close" size={22} color={subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
            {/* TYPE — segmented */}
            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>TYPE</Text>
            <View style={styles.segmentRow}>
              {(['quantitative', 'qualitative'] as PersonalGoalType[]).map((t) => {
                const active = type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setType(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.segment,
                      { borderColor: active ? tint : border, backgroundColor: active ? tint + '22' : 'transparent' },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? tint : subtext,
                        fontSize: getScaledFontSize(13),
                        fontWeight: getScaledFontWeight(active ? 700 : 500) as any,
                      }}
                    >
                      {t === 'quantitative' ? 'Quantitative' : 'Qualitative'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CADENCE — chips */}
            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>CADENCE</Text>
            <View style={styles.chipRow}>
              {PERSONAL_GOAL_CADENCES.map((c) => {
                const active = cadence === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCadence(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.chip,
                      { borderColor: active ? tint : border },
                      active && { backgroundColor: tint + '22' },
                    ]}
                  >
                    <Text style={{ color: active ? tint : subtext, fontSize: getScaledFontSize(12) }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* TITLE */}
            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { color: text, borderColor: border, backgroundColor: bg }]}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              placeholder="e.g. Walk 30 minutes a day"
              placeholderTextColor={subtext}
            />

            {/* DESCRIPTION */}
            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>
              DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: text, borderColor: border, backgroundColor: bg }]}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              numberOfLines={3}
              placeholder="Why this matters to you"
              placeholderTextColor={subtext}
            />

            {type === 'quantitative' ? (
              <>
                <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>TARGET</Text>
                <TextInput
                  style={[styles.input, { color: text, borderColor: border, backgroundColor: bg }]}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="numeric"
                  maxLength={12}
                  placeholder="e.g. 30"
                  placeholderTextColor={subtext}
                />

                <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>
                  UNIT (OPTIONAL)
                </Text>
                <TextInput
                  style={[styles.input, { color: text, borderColor: border, backgroundColor: bg }]}
                  value={unit}
                  onChangeText={setUnit}
                  maxLength={24}
                  placeholder="e.g. minutes, lbs, steps"
                  placeholderTextColor={subtext}
                />

                <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>
                  STARTING VALUE (OPTIONAL)
                </Text>
                <TextInput
                  style={[styles.input, { color: text, borderColor: border, backgroundColor: bg }]}
                  value={baseline}
                  onChangeText={setBaseline}
                  keyboardType="numeric"
                  maxLength={12}
                  placeholder="Where you are now"
                  placeholderTextColor={subtext}
                />
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>STATUS</Text>
                <View style={styles.chipRow}>
                  {PERSONAL_GOAL_STATUSES.map((s) => {
                    const active = status === s.key;
                    return (
                      <TouchableOpacity
                        key={s.key}
                        onPress={() => setStatus(s.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.chip,
                          { borderColor: active ? tint : border },
                          active && { backgroundColor: tint + '22' },
                        ]}
                      >
                        <Text style={{ color: active ? tint : subtext, fontSize: getScaledFontSize(12) }}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Save goal' : 'Add goal'}
              style={[styles.saveBtn, { backgroundColor: tint, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add goal'}
              </Text>
            </TouchableOpacity>

            {editing && onDelete ? (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Delete goal"
                style={styles.deleteBtn}
              >
                <MaterialIcons name="delete-outline" size={getScaledFontSize(18)} color={colors.error ?? '#E53E3E'} />
                <Text
                  style={{
                    color: colors.error ?? '#E53E3E',
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(600) as any,
                    marginLeft: 6,
                  }}
                >
                  Delete goal
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollArea: { paddingHorizontal: 20, paddingTop: 12 },
  fieldLabel: { textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
});
