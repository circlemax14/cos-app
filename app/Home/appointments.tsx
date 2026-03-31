import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StatusBadge } from '@/components/ui/status-badge';
import { AccessibleCard } from '@/components/ui/accessible-card';
import { EmptyState } from '@/components/ui/empty-state';
import { getColors, Typography, Spacing, TouchTargets, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import type { Appointment } from '@/services/api/types';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
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
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.text, fontSize: getScaledFontSize(Typography.body.fontSize) }]}>Failed to load appointments</Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading appointments"
          >
            <Text style={[styles.retryText, { fontSize: getScaledFontSize(Typography.body.fontSize) }]}>Retry</Text>
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
        <Text
          style={[styles.title, { fontSize: getScaledFontSize(Typography.title1.fontSize), fontWeight: getScaledFontWeight(700) as any, color: colors.text }]}
          accessibilityRole="header"
        >
          Appointments & Encounters
        </Text>
        <Text style={[styles.subtitle, { color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }]}>
          {appointments.length} record{appointments.length !== 1 ? 's' : ''} from your connected EHRs
        </Text>

        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.secondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: getScaledFontSize(Typography.body.fontSize) }]}
            placeholder="Search by type, doctor, clinic, diagnosis..."
            placeholderTextColor={colors.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search appointments"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={styles.clearButton}
            >
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.secondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {appointments.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No Appointments Yet"
            description="Your appointments will appear here once available from your connected clinics."
            ctaLabel="Connect a Clinic"
            onCtaPress={() => router.push('/Home/connect-clinics' as never)}
          />
        ) : (
          groupedByDate.map(([date, items]) => (
            <View key={date} style={styles.dateGroup}>
              <Text
                style={[styles.dateHeader, { color: colors.text, fontSize: getScaledFontSize(Typography.headline.fontSize), fontWeight: getScaledFontWeight(600) as any }]}
                accessibilityRole="header"
              >
                {formatDate(date)}
              </Text>
              {items.map((apt) => {
                const cardLabel = `${apt.resourceType ?? 'Encounter'}: ${apt.type || 'Office Visit'}${apt.doctorName ? `, with ${apt.doctorName}` : ''}, ${formatDate(apt.date || 'Unknown')}, status ${apt.status}`;

                return (
                  <AccessibleCard
                    key={apt.id}
                    onPress={() => handleCardPress(apt)}
                    accessibilityLabel={cardLabel}
                    accessibilityHint="Double tap to view appointment details"
                    showChevron
                  >
                    {/* Top row: status badge */}
                    <View style={styles.badgeRow}>
                      <StatusBadge status={apt.status} />
                    </View>

                    {/* Title */}
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: getScaledFontSize(Typography.headline.fontSize), fontWeight: getScaledFontWeight(600) as any }]}>
                      {apt.type || 'Office Visit'}
                    </Text>

                    {/* Time */}
                    {apt.time ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="clock" size={20} color={colors.secondary} />
                        <Text style={[styles.infoText, { color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }]}>
                          {apt.time}
                        </Text>
                      </View>
                    ) : null}

                    {/* Doctor */}
                    {apt.doctorName && apt.doctorName !== 'Unknown Provider' ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="person" size={20} color={colors.secondary} />
                        <Text style={[styles.infoText, { color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }]}>
                          {apt.doctorName}{apt.doctorSpecialty ? ` - ${apt.doctorSpecialty}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/* Clinic */}
                    {apt.clinicName ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="house" size={20} color={colors.secondary} />
                        <Text style={[styles.infoText, { color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }]}>
                          {apt.clinicName}
                        </Text>
                      </View>
                    ) : null}

                    {/* Diagnosis */}
                    {apt.diagnosis ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="doc.text" size={20} color={colors.secondary} />
                        <Text style={[styles.infoText, { color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }]} numberOfLines={1}>
                          {apt.diagnosis}
                        </Text>
                      </View>
                    ) : null}
                  </AccessibleCard>
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
    padding: Spacing.screenPadding,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginBottom: Spacing.md,
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radii.sm,
    minHeight: TouchTargets.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    minHeight: TouchTargets.searchBar,
    marginBottom: Spacing.screenPadding,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    minHeight: TouchTargets.searchBar,
  },
  clearButton: {
    minWidth: TouchTargets.minimum,
    minHeight: TouchTargets.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateGroup: {
    marginBottom: Spacing.screenPadding,
    gap: Spacing.sm + 2,
  },
  dateHeader: {
    paddingLeft: Spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    marginBottom: Spacing.xs + 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs + 2,
  },
  infoText: {
    flex: 1,
  },
  bottomPadding: {
    height: 40,
  },
});
