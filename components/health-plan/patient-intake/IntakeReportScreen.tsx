/**
 * IntakeReportScreen — read-only view of the patient's completed intake.
 *
 * Renders every answered question grouped by section (Body / Mind / Life)
 * with the answer formatted per question type. Reachable via the "View my
 * intake" action on the IntakeCtaCard's completed-state card.
 */
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import type {
  IntakeAnswerValue,
  IntakeQuestion,
  IntakeSection,
} from '@/types/patient-intake';

const SECTION_META: Record<
  IntakeSection,
  { label: string; color: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
  body: { label: 'Body', color: '#199C4F', icon: 'favorite' },
  mind: { label: 'Mind', color: '#7B3FE4', icon: 'psychology' },
  life: { label: 'Life & Support', color: '#C97600', icon: 'groups' },
};

function formatAnswer(q: IntakeQuestion, v: IntakeAnswerValue): string {
  if (v == null || v === '') return '—';
  switch (q.type) {
    case 'text':
    case 'number':
      return String(v);
    case 'single':
    case 'scale': {
      const opt = q.options?.find(o => o.value === v);
      return opt ? `${opt.label}` : String(v);
    }
    case 'multi': {
      if (!Array.isArray(v)) return '—';
      const labels = v.map(val => q.options?.find(o => o.value === val)?.label ?? String(val));
      return labels.join(', ') || '—';
    }
    case 'add_list': {
      if (!Array.isArray(v) || v.length === 0) return '—';
      return v
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'label' in item) {
            const rec = item as { label: string; note?: string };
            return rec.note ? `${rec.label} (${rec.note})` : rec.label;
          }
          return '';
        })
        .filter(Boolean)
        .join(' · ');
    }
    default:
      return '—';
  }
}

export default function IntakeReportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const q = usePatientIntake();
  const intake = q.data?.intake ?? null;
  const questions = q.data?.questions ?? [];

  const grouped = useMemo(() => {
    const bySection: Record<IntakeSection, IntakeQuestion[]> = {
      body: [],
      mind: [],
      life: [],
    };
    for (const question of questions) {
      bySection[question.section].push(question);
    }
    return bySection;
  }, [questions]);

  const goRetake = () => router.push('/Home/patient-intake?retake=1' as never);
  const goBack = () => router.back();

  if (q.isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </AppWrapper>
    );
  }

  if (q.isError || !intake) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <MaterialIcons
            name="error-outline"
            size={getScaledFontSize(48)}
            color={colors.subtext}
          />
          <Text
            style={{
              marginTop: 12,
              color: colors.text,
              fontSize: getScaledFontSize(15),
              textAlign: 'center',
              paddingHorizontal: 24,
            }}
          >
            {intake ? 'Could not load your intake.' : 'No intake on file yet. Complete your intake first to view a report.'}
          </Text>
          <Pressable
            onPress={goBack}
            style={[styles.backBtn, { backgroundColor: colors.tint, marginTop: 16 }]}
            accessibilityRole="button"
          >
            <Text
              style={{
                color: '#fff',
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              }}
            >
              Go back
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    );
  }

  const completedAt = intake.completedAt
    ? new Date(intake.completedAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const answeredCount = Object.keys(intake.answers).filter(k => intake.answers[k] != null).length;

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons
              name="arrow-back"
              size={getScaledFontSize(24)}
              color={colors.text}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Your intake
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(11),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                  letterSpacing: 0.3,
                }}
              >
                COMPLETED ON
              </Text>
              <Text
                style={{
                  color: colors.text,
                  marginTop: 4,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                }}
              >
                {completedAt || '—'}
              </Text>
            </View>
            <View style={[styles.metaCell, { alignItems: 'flex-end' }]}>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(11),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                  letterSpacing: 0.3,
                }}
              >
                ANSWERS
              </Text>
              <Text
                style={{
                  color: colors.text,
                  marginTop: 4,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                }}
              >
                {answeredCount} of {questions.length}
              </Text>
            </View>
          </View>
        </View>

        {(['body', 'mind', 'life'] as IntakeSection[]).map(section => {
          const list = grouped[section];
          if (list.length === 0) return null;
          const meta = SECTION_META[section];
          return (
            <View
              key={section}
              style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: meta.color + '1A' }]}>
                  <MaterialIcons
                    name={meta.icon}
                    size={getScaledFontSize(18)}
                    color={meta.color}
                  />
                </View>
                <Text
                  style={{
                    color: meta.color,
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                    letterSpacing: 0.3,
                  }}
                >
                  {meta.label.toUpperCase()}
                </Text>
              </View>
              {list.map((question, i) => {
                const value = intake.answers[question.key];
                const answered = value != null && value !== '';
                return (
                  <View
                    key={question.key}
                    style={[
                      styles.qaRow,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: getScaledFontSize(13),
                        lineHeight: getScaledFontSize(18),
                      }}
                    >
                      {question.prompt}
                    </Text>
                    <Text
                      style={{
                        marginTop: 4,
                        color: answered ? colors.text : colors.subtext,
                        fontSize: getScaledFontSize(15),
                        fontWeight: getScaledFontWeight(answered ? 600 : 400) as TextStyle['fontWeight'],
                        lineHeight: getScaledFontSize(22),
                        fontStyle: answered ? 'normal' : 'italic',
                      }}
                    >
                      {answered ? formatAnswer(question, value) : 'Skipped'}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Pressable
          onPress={goRetake}
          accessibilityRole="button"
          accessibilityLabel="Retake intake"
          accessibilityHint="Opens the wizard to update your answers"
          style={({ pressed }) => [
            styles.retakeButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name="refresh"
            size={getScaledFontSize(18)}
            color={colors.tint}
          />
          <Text
            style={{
              marginLeft: 8,
              color: colors.tint,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Update my answers
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCard: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
  },
  metaCell: {
    flex: 1,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaRow: {
    paddingVertical: Spacing.sm + 2,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radii.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
});
