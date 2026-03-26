import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { Appointment } from '@/services/api/types';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
