/**
 * PersonalGoalReflectionSheet (COS-405 / SCRUM-532) — add a period reflection
 * to a QUALITATIVE personal goal: a free-text note + an optional 1–5 self
 * rating. Submits to POST /v1/me/personal-goals/:id/reflection.
 *
 * Same slide-up sheet pattern as PersonalGoalSheet. Parent gates mounting on
 * PERSONAL_GOALS_ENABLED.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type ColorMap = Record<string, string>;

export interface PersonalGoalReflectionSheetProps {
  visible: boolean;
  goalTitle: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { note?: string; rating?: number }) => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function PersonalGoalReflectionSheet(props: PersonalGoalReflectionSheetProps) {
  const { visible, goalTitle, saving, onClose, onSubmit, colors, getScaledFontSize, getScaledFontWeight } = props;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const tint = colors.tint;
  const bg = colors.background;

  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setNote('');
      setRating(null);
    }
  }, [visible]);

  const handleSubmit = () => {
    const trimmed = note.trim();
    onSubmit({
      note: trimmed || undefined,
      rating: rating ?? undefined,
    });
  };

  // A reflection needs at least a note or a rating.
  const canSubmit = note.trim().length > 0 || rating != null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card as string }]}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }}>
                Add reflection
              </Text>
              <Text style={{ color: subtext, fontSize: getScaledFontSize(12), marginTop: 2 }} numberOfLines={1}>
                {goalTitle}
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
            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>
              HOW IS IT GOING?
            </Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: text, borderColor: border, backgroundColor: bg }]}
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              numberOfLines={4}
              placeholder="A few words on your progress this period"
              placeholderTextColor={subtext}
            />

            <Text style={[styles.fieldLabel, { color: subtext, fontSize: getScaledFontSize(12) }]}>
              RATING (OPTIONAL)
            </Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = rating != null && n <= rating;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setRating(rating === n ? null : n)}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${n} out of 5`}
                    accessibilityState={{ selected: active }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={styles.star}
                  >
                    <MaterialIcons
                      name={active ? 'star' : 'star-border'}
                      size={getScaledFontSize(32)}
                      color={active ? tint : subtext}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={saving || !canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Save reflection"
              style={[styles.saveBtn, { backgroundColor: tint, opacity: saving || !canSubmit ? 0.5 : 1 }]}
            >
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                {saving ? 'Saving…' : 'Save reflection'}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingTop: 16 },
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
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  star: { padding: 2 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
});
