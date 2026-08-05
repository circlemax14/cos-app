import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface Item {
  label: string;
  note?: string;
  linkedIds?: string[];
}

interface Props {
  value: Item[];
  onChange: (v: Item[]) => void;
  labelPlaceholder?: string;
  notePlaceholder?: string;
  /**
   * SCRUM-659 followup (2026-08-05) — when set, each item gets a
   * "Treats:" (or `linkPickerLabel`) chip row offering the labels of
   * these link options. Storage: item.linkedIds carries the selected
   * labels. When empty or undefined, no link picker is rendered
   * (byte-identical add_list UX).
   */
  linkOptions?: string[];
  linkPickerLabel?: string;
}

export default function AddListQuestion({
  value,
  onChange,
  labelPlaceholder = 'Add an item…',
  notePlaceholder = 'Optional note',
  linkOptions,
  linkPickerLabel = 'Linked items',
}: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  const canAdd = label.trim().length > 0;
  const linkOpts = linkOptions ?? [];
  const hasLinks = linkOpts.length > 0;

  const add = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const trimmedNote = note.trim();
    const nextItem: Item = trimmedNote
      ? { label: trimmedLabel, note: trimmedNote }
      : { label: trimmedLabel };
    onChange([...value, nextItem]);
    setLabel('');
    setNote('');
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const toggleLink = (idx: number, optionLabel: string) => {
    const cur = value[idx];
    const currentLinks = cur.linkedIds ?? [];
    const nextLinks = currentLinks.includes(optionLabel)
      ? currentLinks.filter((l) => l !== optionLabel)
      : [...currentLinks, optionLabel];
    const nextItem: Item = { ...cur, linkedIds: nextLinks.length > 0 ? nextLinks : undefined };
    onChange(value.map((v, i) => (i === idx ? nextItem : v)));
  };

  return (
    <View style={{ gap: 10 }}>
      {value.map((it, idx) => {
        const linked = it.linkedIds ?? [];
        return (
          <View
            key={`${idx}-${it.label}`}
            style={[styles.item, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {it.label}
                </Text>
                {!!it.note && (
                  <Text
                    style={{
                      color: colors.subtext,
                      marginTop: 2,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(400) as any,
                    }}
                  >
                    {it.note}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => remove(idx)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${it.label}`}
              >
                <MaterialIcons name="close" size={20} color={colors.subtext} />
              </Pressable>
            </View>
            {hasLinks && (
              <View style={styles.linkRow}>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(600) as any,
                    marginRight: 6,
                    marginBottom: 4,
                  }}
                >
                  {linkPickerLabel}
                </Text>
                <View style={styles.chipRow}>
                  {linkOpts.map((opt) => {
                    const active = linked.includes(opt);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => toggleLink(idx, opt)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${active ? 'Unlink' : 'Link'} ${it.label} to ${opt}`}
                        style={[
                          styles.chip,
                          active
                            ? { backgroundColor: colors.tint, borderColor: colors.tint }
                            : { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? '#fff' : colors.text,
                            fontSize: getScaledFontSize(12),
                            fontWeight: getScaledFontWeight(active ? 600 : 500) as any,
                          }}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={{ gap: 8 }}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={labelPlaceholder}
          placeholderTextColor={colors.subtext}
          maxLength={200}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.background,
              fontSize: getScaledFontSize(15),
            },
          ]}
          accessibilityLabel="Item label"
          returnKeyType="next"
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={notePlaceholder}
          placeholderTextColor={colors.subtext}
          maxLength={400}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.background,
              fontSize: getScaledFontSize(15),
            },
          ]}
          accessibilityLabel="Optional note"
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable
          onPress={add}
          disabled={!canAdd}
          style={[
            styles.addBtn,
            { backgroundColor: canAdd ? colors.tint : colors.subtext + '60' },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdd }}
          accessibilityLabel="Add item"
        >
          <Text
            style={{
              color: '#fff',
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  addBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
