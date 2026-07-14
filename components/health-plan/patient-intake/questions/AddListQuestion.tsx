import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface Item {
  label: string;
  note?: string;
}

interface Props {
  value: Item[];
  onChange: (v: Item[]) => void;
  labelPlaceholder?: string;
  notePlaceholder?: string;
}

export default function AddListQuestion({
  value,
  onChange,
  labelPlaceholder = 'Add an item…',
  notePlaceholder = 'Optional note',
}: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  const canAdd = label.trim().length > 0;

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

  return (
    <View style={{ gap: 10 }}>
      {value.map((it, idx) => (
        <View
          key={`${idx}-${it.label}`}
          style={[styles.item, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
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
      ))}

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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
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
