/**
 * RetakeSectionSheet — Ken 2026-08-05
 *
 * Bottom-sheet picker for sectioned retake. Listed 4 rows: Body / Mind /
 * Life / All. Client-only sectioned retake — the wizard filters
 * questions to the picked section and preserves untouched sections'
 * answers across the fresh intake version.
 *
 * Used by every "Retake / Update my answers" entry point:
 *   - IntakeCtaCard (Health Summary tab banner, completed state)
 *   - IntakeReportScreen (intake report screen)
 * so a user always sees the same picker regardless of where they
 * initiated retake from.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Radii, Spacing } from '@/constants/design-system';

export type RetakeSection = 'body' | 'mind' | 'life';

export type RetakeSectionPick = RetakeSection | undefined; // undefined = All

type PaletteLike = {
  text: string;
  subtext: string;
  card: string;
  border: string;
  tint: string;
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onPick: (section: RetakeSectionPick) => void;
  colors: PaletteLike;
  scale: (n: number) => number;
  weight: (n: number) => string;
}

const ROWS: Array<{
  key: 'body' | 'mind' | 'life' | 'all';
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  detail: string;
}> = [
  { key: 'body', icon: 'favorite', label: 'Body', detail: 'Conditions, medications, vitals, lifestyle' },
  { key: 'mind', icon: 'psychology', label: 'Mind', detail: 'Mood, stress, sleep, mental health' },
  { key: 'life', icon: 'groups', label: 'Life', detail: 'Work, finances, social support' },
  { key: 'all', icon: 'refresh', label: 'All sections', detail: 'Start over with every question' },
];

export default function RetakeSectionSheet({
  visible,
  onDismiss,
  onPick,
  colors,
  scale,
  weight,
}: Props): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      presentationStyle="overFullScreen"
    >
      <Pressable
        style={styles.overlay}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.grip, { backgroundColor: colors.border }]} />
          <Text
            style={{
              color: colors.text,
              fontSize: scale(17),
              fontWeight: weight(700) as TextStyle['fontWeight'],
              marginBottom: 4,
            }}
          >
            Update which section?
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: scale(13),
              marginBottom: 12,
            }}
          >
            Answers in the other sections stay as they are.
          </Text>
          {ROWS.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => onPick(r.key === 'all' ? undefined : r.key)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              accessibilityHint={r.detail}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.border : 'transparent' },
              ]}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: `${colors.tint}22` },
                ]}
              >
                <MaterialIcons name={r.icon} size={scale(20)} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: scale(15),
                    fontWeight: weight(600) as TextStyle['fontWeight'],
                  }}
                >
                  {r.label}
                </Text>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scale(12),
                    marginTop: 2,
                  }}
                >
                  {r.detail}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={scale(20)}
                color={colors.subtext}
              />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 34,
  },
  grip: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radii.md,
    marginBottom: 6,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});
