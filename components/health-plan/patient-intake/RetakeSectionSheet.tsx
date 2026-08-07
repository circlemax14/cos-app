/**
 * RetakeSectionSheet — Ken 2026-08-05
 *
 * Bottom-sheet picker for sectioned retake. Rows mirror the exact
 * groups the intake REPORT renders (Demographics / Medical conditions
 * & medications / Vaccines / Lifestyle / Mental health / Social
 * support / Work & finances) plus an "All sections" catch-all at the
 * bottom. Sourced from GROUP_SPECS in intake-report-builder.ts so
 * picker labels + wizard chunks always stay in lockstep with what the
 * patient sees in their report.
 *
 * Client-only sectioned retake — the wizard filters questions to the
 * picked group's keys and preserves untouched groups' answers across
 * the fresh intake version.
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
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Radii, Spacing } from '@/constants/design-system';
import { GROUP_SPECS, type GroupId } from './intake-report-builder';

export type RetakeGroupPick = GroupId | undefined; // undefined = All

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
  onPick: (group: RetakeGroupPick) => void;
  colors: PaletteLike;
  scale: (n: number) => number;
  weight: (n: number) => string;
}

// One-line hint per group so the picker communicates what's inside
// without the patient tapping through. Keyed by GroupId; kept in sync
// with GROUP_SPECS.keys manually — group renames are rare and the
// hints are user-facing copy, not derivable from the schema.
const GROUP_DETAIL: Record<GroupId, string> = {
  'demographics': 'Sex, race, blood type, height, weight',
  'conditions-meds': 'Diagnoses, medications, allergies, surgeries, family history',
  'vaccines': 'Immunization history',
  'lifestyle': 'Tobacco, alcohol, sleep, exercise',
  'mental-health': 'Diagnoses, medications, coping, screeners',
  'social-support': 'Living situation, caregiver role, life events',
  'work-finances': 'Employment and financial comfort',
};

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
          <ScrollView
            style={{ maxHeight: 460 }}
            showsVerticalScrollIndicator={false}
          >
            {GROUP_SPECS.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => onPick(g.id)}
                accessibilityRole="button"
                accessibilityLabel={g.title}
                accessibilityHint={GROUP_DETAIL[g.id]}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.border : 'transparent' },
                ]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: `${g.color}22` },
                  ]}
                >
                  <MaterialIcons
                    name={g.icon as React.ComponentProps<typeof MaterialIcons>['name']}
                    size={scale(20)}
                    color={g.color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: scale(15),
                      fontWeight: weight(600) as TextStyle['fontWeight'],
                    }}
                  >
                    {g.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: scale(12),
                      marginTop: 2,
                    }}
                    numberOfLines={2}
                  >
                    {GROUP_DETAIL[g.id]}
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={scale(20)}
                  color={colors.subtext}
                />
              </Pressable>
            ))}
            {/* "All sections" — falls back to the legacy full-clear
             * retake. Kept at the bottom so patients scan the smaller
             * chunks first and only reach for "all" if that's the
             * genuine intent. */}
            <Pressable
              onPress={() => onPick(undefined)}
              accessibilityRole="button"
              accessibilityLabel="All sections"
              accessibilityHint="Start over with every question"
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.border : 'transparent',
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  marginTop: 6,
                  paddingTop: 14,
                  borderRadius: 0,
                },
              ]}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: `${colors.tint}22` },
                ]}
              >
                <MaterialIcons name="refresh" size={scale(20)} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: scale(15),
                    fontWeight: weight(600) as TextStyle['fontWeight'],
                  }}
                >
                  All sections
                </Text>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scale(12),
                    marginTop: 2,
                  }}
                >
                  Start over with every question
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={scale(20)}
                color={colors.subtext}
              />
            </Pressable>
          </ScrollView>
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
