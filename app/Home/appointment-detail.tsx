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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value?: string }) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <IconSymbol name={icon as any} size={18} color={colors.primary ?? '#1976D2'} />
      </View>
      <View style={styles.detailContent}>
        <Text style={[styles.detailLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text, fontSize: getScaledFontSize(15) }]}>{value}</Text>
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

  return (
    <AppWrapper>
      <ScrollView style={styles.container}>
        {/* Header badges */}
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
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(700) as any }]}>
          {appointment.type || 'Office Visit'}
        </Text>

        {/* Details card */}
        <View style={[styles.detailsCard, { backgroundColor: colors.card }]}>
          <DetailRow icon="calendar" label="Date" value={appointment.date ? formatDate(appointment.date) : undefined} />
          <DetailRow icon="clock" label="Time" value={appointment.time} />
          {appointment.endDate && appointment.endDate !== appointment.date ? (
            <DetailRow icon="clock" label="End Date" value={formatDate(appointment.endDate)} />
          ) : null}
          <DetailRow icon="person" label="Provider" value={appointment.doctorName !== 'Unknown Provider' ? appointment.doctorName : undefined} />
          <DetailRow icon="star" label="Specialty" value={appointment.doctorSpecialty} />
          <DetailRow icon="house" label="Clinic" value={appointment.clinicName} />
          <DetailRow icon="doc.text" label="Diagnosis / Reason" value={appointment.diagnosis} />
          <DetailRow icon="text.bubble" label="Notes" value={appointment.notes} />
          <DetailRow icon="tag" label="Encounter Class" value={appointment.encounterClass} />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 20,
  },
  detailsCard: {
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  detailIcon: {
    width: 32,
    alignItems: 'center',
    paddingTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    lineHeight: 22,
  },
  bottomPadding: {
    height: 40,
  },
});
