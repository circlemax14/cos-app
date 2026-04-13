import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useEncounterNarrative } from '@/hooks/use-encounter-narrative';
import type { Appointment } from '@/services/api/types';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

const RESOURCE_TYPE_STYLES = {
  Appointment: { bg: '#E3F2FD', text: '#1565C0', label: 'Appointment' },
  Encounter: { bg: '#E8F5E9', text: '#2E7D32', label: 'Encounter' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  booked: { bg: '#E3F2FD', text: '#1565C0' },
  arrived: { bg: '#E8F5E9', text: '#2E7D32' },
  fulfilled: { bg: '#E8F5E9', text: '#2E7D32' },
  finished: { bg: '#F3E5F5', text: '#7B1FA2' },
  cancelled: { bg: '#FFEBEE', text: '#C62828' },
  noshow: { bg: '#FFF3E0', text: '#E65100' },
  planned: { bg: '#E3F2FD', text: '#1565C0' },
  'in-progress': { bg: '#FFF8E1', text: '#F57F17' },
  triaged: { bg: '#FFF8E1', text: '#F57F17' },
};

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function EncounterNarrativeSection({
  encounterId,
  colors: themeColors,
}: {
  encounterId: string | undefined;
  colors: any;
}) {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const { data: narrative, isLoading, isError, refetch } = useEncounterNarrative(encounterId);

  if (!encounterId) return null;

  return (
    <View style={narrativeStyles.wrapper}>
      <Text
        style={[
          narrativeStyles.sectionTitle,
          { color: themeColors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any },
        ]}
      >
        VISIT SUMMARY
      </Text>
      <View style={[narrativeStyles.card, { backgroundColor: themeColors.card }]}>
        {isLoading ? (
          <View style={narrativeStyles.stateRow}>
            <ActivityIndicator size="small" color={themeColors.tint} />
            <Text style={{ color: themeColors.subtext, fontSize: getScaledFontSize(14), marginLeft: 10 }}>
              Generating summary...
            </Text>
          </View>
        ) : isError || !narrative ? (
          <View style={narrativeStyles.stateRow}>
            <Text style={{ color: themeColors.subtext, fontSize: getScaledFontSize(14) }}>
              Unable to generate summary.{' '}
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel="Try again to load visit summary"
            >
              <Text
                style={{
                  color: themeColors.tint ?? '#1976D2',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as any,
                  textDecorationLine: 'underline',
                }}
              >
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* What happened */}
            <Text
              style={[
                narrativeStyles.subsectionLabel,
                { color: themeColors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
              ]}
            >
              WHAT HAPPENED
            </Text>
            <Text
              style={{
                color: themeColors.text,
                fontSize: getScaledFontSize(14),
                lineHeight: getScaledFontSize(21),
                marginBottom: 16,
              }}
            >
              {narrative.summary}
            </Text>

            {/* Key findings */}
            {narrative.keyFindings.length > 0 ? (
              <>
                <Text
                  style={[
                    narrativeStyles.subsectionLabel,
                    { color: themeColors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
                  ]}
                >
                  KEY FINDINGS
                </Text>
                {narrative.keyFindings.map((finding, i) => (
                  <View key={i} style={narrativeStyles.bulletRow}>
                    <Text style={{ color: themeColors.tint ?? '#1976D2', fontSize: getScaledFontSize(14) }}>•</Text>
                    <Text
                      style={{
                        color: themeColors.text,
                        fontSize: getScaledFontSize(14),
                        lineHeight: getScaledFontSize(21),
                        flex: 1,
                        marginLeft: 8,
                      }}
                    >
                      {finding}
                    </Text>
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </>
            ) : null}

            {/* What's next */}
            {narrative.followUps.length > 0 ? (
              <>
                <Text
                  style={[
                    narrativeStyles.subsectionLabel,
                    { color: themeColors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
                  ]}
                >
                  WHAT'S NEXT
                </Text>
                {narrative.followUps.map((followUp, i) => (
                  <View key={i} style={narrativeStyles.bulletRow}>
                    <Text style={{ color: themeColors.tint ?? '#1976D2', fontSize: getScaledFontSize(14) }}>•</Text>
                    <Text
                      style={{
                        color: themeColors.text,
                        fontSize: getScaledFontSize(14),
                        lineHeight: getScaledFontSize(21),
                        flex: 1,
                        marginLeft: 8,
                      }}
                    >
                      {followUp}
                    </Text>
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </>
            ) : null}

            {/* Connected to your care */}
            {narrative.context ? (
              <>
                <Text
                  style={[
                    narrativeStyles.subsectionLabel,
                    { color: themeColors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
                  ]}
                >
                  CONNECTED TO YOUR CARE
                </Text>
                <Text
                  style={{
                    color: themeColors.subtext,
                    fontSize: getScaledFontSize(14),
                    lineHeight: getScaledFontSize(21),
                    fontStyle: 'italic',
                  }}
                >
                  {narrative.context}
                </Text>
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value, colors: themeColors }: { icon: string; label: string; value?: string; colors: any }) {
  const { getScaledFontSize } = useAccessibility();
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: (themeColors.primary ?? '#1976D2') + '15' }]}>
        <IconSymbol name={icon as any} size={16} color={themeColors.primary ?? '#1976D2'} />
      </View>
      <View style={styles.detailContent}>
        <Text style={[styles.detailLabel, { color: themeColors.subtext, fontSize: getScaledFontSize(11) }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: themeColors.text, fontSize: getScaledFontSize(15) }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function AppointmentDetailScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const params = useLocalSearchParams<{ id: string; data: string }>();

  let appointment: Appointment | null = null;
  try {
    appointment = params.data ? JSON.parse(params.data) : null;
  } catch {
    appointment = null;
  }

  if (!appointment) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <Text style={{ color: colors.text }}>Appointment not found</Text>
        </View>
      </AppWrapper>
    );
  }

  const isEncounter = appointment.resourceType === 'Encounter';
  const resStyle = RESOURCE_TYPE_STYLES[appointment.resourceType ?? 'Encounter'];
  const statusStyle = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.finished;

  // Build time display
  let timeDisplay = appointment.time || undefined;
  if (timeDisplay && appointment.endTime) {
    timeDisplay = `${timeDisplay} — ${appointment.endTime}`;
  }

  // Encounter class display
  const classDisplay = appointment.encounterClassDisplay ?? appointment.encounterClass;

  return (
    <AppWrapper>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Header card */}
        <View style={[styles.headerCard, { backgroundColor: resStyle.bg + '40' }]}>
          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: resStyle.bg }]}>
              <Text style={[styles.badgeText, { color: resStyle.text, fontSize: getScaledFontSize(12) }]}>
                {resStyle.label}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.badgeText, { color: statusStyle.text, fontSize: getScaledFontSize(12) }]}>
                {appointment.status}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any }]}>
            {appointment.type || 'Office Visit'}
          </Text>

          {/* Date + time summary */}
          {appointment.date ? (
            <View style={styles.headerMeta}>
              <IconSymbol name="calendar" size={16} color={resStyle.text} />
              <Text style={[styles.headerMetaText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {formatFullDate(appointment.date)}
                {timeDisplay ? `  ·  ${timeDisplay}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Details section */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
          DETAILS
        </Text>
        <View style={[styles.detailsCard, { backgroundColor: colors.card }]}>
          <DetailRow colors={colors} icon="person" label="Provider" value={appointment.doctorName !== 'Unknown Provider' ? appointment.doctorName : undefined} />
          <DetailRow colors={colors} icon="star" label="Specialty" value={appointment.doctorSpecialty} />
          <DetailRow colors={colors} icon="house" label="Clinic / Location" value={appointment.clinicName} />
          <DetailRow colors={colors} icon="doc.text" label="Reason / Diagnosis" value={appointment.diagnosis} />
          <DetailRow colors={colors} icon="text.bubble" label="Notes" value={appointment.notes} />
          <DetailRow colors={colors} icon="tag" label="Encounter Class" value={classDisplay} />
          <DetailRow colors={colors} icon="person.2" label="Participant Status" value={appointment.participantStatus} />
          {appointment.endDate && appointment.endDate !== appointment.date ? (
            <DetailRow colors={colors} icon="clock" label="End Date" value={formatFullDate(appointment.endDate)} />
          ) : null}
        </View>

        {/* Encounter narrative — only shown for Encounter resource types */}
        <EncounterNarrativeSection
          encounterId={isEncounter ? appointment.id : undefined}
          colors={colors}
        />

        <View style={styles.bottomPadding} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: {
    marginBottom: 8,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerMetaText: {
    flex: 1,
  },
  sectionTitle: {
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
  },
  detailsCard: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
  },
  bottomPadding: {
    height: 40,
  },
});

const narrativeStyles = StyleSheet.create({
  wrapper: {
    marginTop: 24,
  },
  sectionTitle: {
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subsectionLabel: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
});
