import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import type { Appointment } from '@/services/api/types';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  booked: { bg: '#E3F2FD', text: '#1565C0' },
  arrived: { bg: '#E8F5E9', text: '#2E7D32' },
  fulfilled: { bg: '#E8F5E9', text: '#2E7D32' },
  finished: { bg: '#F3E5F5', text: '#7B1FA2' },
  cancelled: { bg: '#FFEBEE', text: '#C62828' },
  noshow: { bg: '#FFF3E0', text: '#E65100' },
  'entered-in-error': { bg: '#FFEBEE', text: '#C62828' },
  planned: { bg: '#E3F2FD', text: '#1565C0' },
  'in-progress': { bg: '#FFF8E1', text: '#F57F17' },
  triaged: { bg: '#FFF8E1', text: '#F57F17' },
  onleave: { bg: '#FFF3E0', text: '#E65100' },
};

const RESOURCE_TYPE_STYLES = {
  Appointment: { bg: '#E3F2FD', text: '#1565C0', label: 'Appointment' },
  Encounter: { bg: '#E8F5E9', text: '#2E7D32', label: 'Encounter' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, isError, refetch } = useAppointments();

  // Filter by search query (matches type, doctor, clinic, diagnosis, status, resourceType)
  const appointments = useMemo(() => {
    const all = data ?? [];
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter((apt) =>
      (apt.type?.toLowerCase().includes(q)) ||
      (apt.doctorName?.toLowerCase().includes(q)) ||
      (apt.clinicName?.toLowerCase().includes(q)) ||
      (apt.diagnosis?.toLowerCase().includes(q)) ||
      (apt.status?.toLowerCase().includes(q)) ||
      (apt.resourceType?.toLowerCase().includes(q)) ||
      (apt.encounterClass?.toLowerCase().includes(q))
    );
  }, [data, searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Group appointments by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    for (const apt of appointments) {
      const date = apt.date || 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(apt);
    }
    // Sort dates descending (most recent first)
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [appointments]);

  const handleCardPress = (appointment: Appointment) => {
    router.push({
      pathname: '/Home/appointment-detail' as const,
      params: {
        id: appointment.id,
        data: JSON.stringify(appointment),
      },
    } as never);
  };

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.text }]}>Failed to load appointments</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        <Text style={[styles.title, { fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any, color: colors.text }]} accessibilityRole="header">
          Appointments & Encounters
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          {appointments.length} record{appointments.length !== 1 ? 's' : ''} from your connected EHRs
        </Text>

        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
          <IconSymbol name="magnifyingglass" size={18} color={colors.subtext} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: getScaledFontSize(14) }]}
            placeholder="Search by type, doctor, clinic, diagnosis..."
            placeholderTextColor={colors.subtext}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.subtext} />
            </TouchableOpacity>
          ) : null}
        </View>

        {appointments.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <IconSymbol name="calendar" size={getScaledFontSize(48)} color={colors.text + '60'} />
            <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16) }]}>
              No appointments or encounters found
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
              Your records will appear here once available from your connected clinics.
            </Text>
          </View>
        ) : (
          groupedByDate.map(([date, items]) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={[styles.dateHeader, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                {formatDate(date)}
              </Text>
              {items.map((apt) => {
                const resStyle = RESOURCE_TYPE_STYLES[apt.resourceType ?? 'Encounter'];
                const statusStyle = STATUS_COLORS[apt.status] ?? STATUS_COLORS.finished;

                return (
                  <TouchableOpacity
                    key={apt.id}
                    activeOpacity={0.7}
                    onPress={() => handleCardPress(apt)}
                    style={[styles.card, { backgroundColor: colors.card }]}
                    accessibilityLabel={`${apt.type || 'Office Visit'}, ${apt.doctorName || 'Unknown Provider'}, status ${apt.status}`}
                  >
                    {/* Top row: resource type badge + status badge */}
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, { backgroundColor: resStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: resStyle.text, fontSize: getScaledFontSize(11) }]}>
                          {resStyle.label}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: statusStyle.text, fontSize: getScaledFontSize(11) }]}>
                          {apt.status}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                      {apt.type || 'Office Visit'}
                    </Text>

                    {/* Time */}
                    {apt.time ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="clock" size={14} color={colors.subtext} />
                        <Text style={[styles.infoText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                          {apt.time}
                        </Text>
                      </View>
                    ) : null}

                    {/* Doctor */}
                    {apt.doctorName && apt.doctorName !== 'Unknown Provider' ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="person" size={14} color={colors.subtext} />
                        <Text style={[styles.infoText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                          {apt.doctorName}{apt.doctorSpecialty ? ` - ${apt.doctorSpecialty}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/* Clinic */}
                    {apt.clinicName ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="house" size={14} color={colors.subtext} />
                        <Text style={[styles.infoText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                          {apt.clinicName}
                        </Text>
                      </View>
                    ) : null}

                    {/* Diagnosis */}
                    {apt.diagnosis ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="doc.text" size={14} color={colors.subtext} />
                        <Text style={[styles.infoText, { color: colors.subtext, fontSize: getScaledFontSize(13) }]} numberOfLines={1}>
                          {apt.diagnosis}
                        </Text>
                      </View>
                    ) : null}

                    {/* Chevron */}
                    <View style={styles.chevron}>
                      <IconSymbol name="chevron.right" size={16} color={colors.subtext} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

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
  errorText: {
    fontSize: 16,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
  },
  emptyText: {
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    textAlign: 'center',
  },
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    position: 'relative',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cardTitle: {
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
  },
  chevron: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  bottomPadding: {
    height: 40,
  },
});
