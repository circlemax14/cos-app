import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from 'react-native-paper';

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading, isError, refetch } = useAppointments();
  const appointments = data ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Group appointments into upcoming and past
  const now = new Date();
  const upcoming = appointments.filter(apt => new Date(apt.date) >= now);
  const past = appointments.filter(apt => new Date(apt.date) < now);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
          <Text style={[styles.errorText, { color: colors.text, fontSize: getScaledFontSize(16) }]}>Failed to load appointments</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.tint }]}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    );
  }

  const renderAppointmentCard = (apt: typeof appointments[0]) => (
    <Card key={apt.id} style={[styles.card, { backgroundColor: colors.card }]}>
      <Card.Content>
        <View style={styles.cardRow}>
          <IconSymbol name="calendar" size={getScaledFontSize(20)} color={colors.text + '80'} />
          <View style={styles.cardContent}>
            <Text style={[styles.cardLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Date</Text>
            <Text style={[styles.cardValue, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
              {formatDate(apt.date)}
            </Text>
          </View>
        </View>

        {apt.time ? (
          <View style={styles.cardRow}>
            <IconSymbol name="clock.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Time</Text>
              <Text style={[styles.cardValue, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                {apt.time}
              </Text>
            </View>
          </View>
        ) : null}

        {apt.type ? (
          <View style={styles.cardRow}>
            <IconSymbol name="heart.text.clipboard" size={getScaledFontSize(20)} color={colors.text + '80'} />
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Type</Text>
              <Text style={[styles.cardValue, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                {apt.type}
              </Text>
            </View>
          </View>
        ) : null}

        {apt.doctorName ? (
          <View style={[styles.cardRow, { marginBottom: 0 }]}>
            <IconSymbol name="person.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Doctor</Text>
              <Text style={[styles.cardValue, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                {apt.doctorName}
              </Text>
            </View>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>
            Appointments
          </Text>
          <Text style={[styles.refreshHint, { color: colors.subtext, fontSize: getScaledFontSize(12), lineHeight: getScaledFontSize(16) }]}>
            Pull down to refresh
          </Text>
        </View>

        {appointments.length === 0 ? (
          /* Empty state */
          <Card style={[styles.card, { backgroundColor: colors.card }]}>
            <Card.Content>
              <View style={styles.emptyContainer}>
                <IconSymbol name="calendar" size={getScaledFontSize(48)} color={colors.text + '60'} />
                <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
                  No appointments found
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                  Your upcoming and past appointments will appear here once they are available from your connected clinics.
                </Text>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <>
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
                  Upcoming
                </Text>
                {upcoming.map(renderAppointmentCard)}
              </>
            )}

            {/* Past */}
            {past.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text + '80', fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
                  Past
                </Text>
                {past.map(renderAppointmentCard)}
              </>
            )}
          </>
        )}
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
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  titleSection: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  refreshHint: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  card: {
    marginBottom: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
  },
  cardLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
