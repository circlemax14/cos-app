import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useEncounterNarrative } from '@/hooks/use-encounter-narrative';

interface Props {
  encounterId: string | undefined;
  encounterDisplay?: string;
  encounterDate?: string;
}

/**
 * Renders the AI-generated encounter narrative inline so the patient
 * doesn't have to bounce to a separate "appointment detail" screen
 * just to read the visit summary.
 *
 * Backed by the encounter-narrative endpoint, which is enriched with
 * cached document sections (D-4) — the summary now reflects what the
 * clinician actually wrote in the encounter-summary document, not a
 * thin synthesis from sparse FHIR resources.
 */
export function InlineVisitSummary({ encounterId, encounterDisplay, encounterDate }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: narrative, isLoading, isError } = useEncounterNarrative(encounterId);

  const formattedDate = encounterDate
    ? new Date(encounterDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={[styles.card, { backgroundColor: '#EFF6FF' }]}>
      <View style={styles.header}>
        <MaterialIcons name="event-note" size={getScaledFontSize(20)} color="#3B82F6" />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            From visit · {encounterDisplay ?? 'Office Visit'}
          </Text>
          {formattedDate && (
            <Text
              style={[
                styles.date,
                { color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any },
              ]}
            >
              {formattedDate}
            </Text>
          )}
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            Reading the visit summary…
          </Text>
        </View>
      )}

      {isError && (
        <Text style={[styles.errorText, { fontSize: getScaledFontSize(12) }]}>
          Visit summary unavailable.
        </Text>
      )}

      {narrative && !isLoading && (
        <View style={{ marginTop: 10 }}>
          {narrative.summary && (
            <Text
              style={[
                styles.body,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  lineHeight: getScaledFontSize(20),
                  fontWeight: getScaledFontWeight(400) as any,
                },
              ]}
            >
              {narrative.summary}
            </Text>
          )}

          {narrative.keyFindings && narrative.keyFindings.length > 0 && (
            <Section
              title="Key findings"
              items={narrative.keyFindings}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          )}

          {narrative.followUps && narrative.followUps.length > 0 && (
            <Section
              title="Follow-ups"
              items={narrative.followUps}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          )}

          {narrative.context && (
            <Text
              style={[
                styles.context,
                {
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(400) as any,
                  fontStyle: 'italic',
                  lineHeight: getScaledFontSize(18),
                },
              ]}
            >
              {narrative.context}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

interface SectionProps {
  title: string;
  items: string[];
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function Section({ title, items, colors, getScaledFontSize, getScaledFontWeight }: SectionProps) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(700) as any },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      {items.map((item, idx) => (
        <View key={idx} style={styles.bulletRow}>
          <Text style={[styles.bullet, { color: '#3B82F6', fontSize: getScaledFontSize(13) }]}>•</Text>
          <Text
            style={[
              styles.bulletText,
              {
                color: colors.text,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(400) as any,
                lineHeight: getScaledFontSize(20),
              },
            ]}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    marginBottom: 2,
  },
  date: {
    letterSpacing: 0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  loadingText: {
    letterSpacing: 0.2,
  },
  errorText: {
    color: '#DC2626',
    marginTop: 10,
  },
  body: {
    marginBottom: 4,
  },
  sectionTitle: {
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 4,
    marginBottom: 2,
  },
  bullet: {
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
  },
  context: {
    marginTop: 10,
  },
});
