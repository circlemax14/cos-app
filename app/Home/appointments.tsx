import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import { Card } from 'react-native-paper';
import { IconSymbol } from '@/components/ui/icon-symbol';

const APPOINTMENT_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, isError, refetch } = useAppointments();
  const appointments = data ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Map API appointments to display-friendly objects with parsed dates and colors
  const displayAppointments = useMemo(() => {
    return appointments.map((apt, index) => {
      const dateObj = new Date(apt.date);
      // Parse time from apt.time (format: "10:00 AM")
      const timeMatch = apt.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      let hour = 9;
      let minute = 0;
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        minute = parseInt(timeMatch[2], 10);
        if (timeMatch[3].toUpperCase() === 'PM' && hour !== 12) {
          hour += 12;
        } else if (timeMatch[3].toUpperCase() === 'AM' && hour === 12) {
          hour = 0;
        }
      }
      dateObj.setHours(hour, minute, 0, 0);

      const title = apt.doctorName
        ? `${apt.type || 'Appointment'} - ${apt.doctorName}`
        : apt.type || 'Appointment';

      return {
        id: apt.id,
        title,
        date: dateObj,
        color: APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length],
        time: apt.time || '9:00 AM',
      };
    });
  }, [appointments]);

  // Create marked dates for calendar with multi-dot marking
  const markedDates = useMemo(() => {
    const marked: MarkedDates = {};

    displayAppointments.forEach(appointment => {
      const dateString = appointment.date.toISOString().split('T')[0];

      if (!marked[dateString]) {
        marked[dateString] = { dots: [] };
      }

      marked[dateString]!.dots!.push({
        color: appointment.color,
        selectedDotColor: appointment.color,
      });
    });

    // Mark selected date
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: '#1976D2',
      };
    }

    return marked;
  }, [displayAppointments, selectedDate]);

  // Get appointments for selected date
  const selectedDateAppointments = useMemo(() => {
    if (!selectedDate) return [];
    return displayAppointments
      .filter(apt => apt.date.toISOString().split('T')[0] === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [displayAppointments, selectedDate]);

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={[styles.title, { fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any, color: colors.text }]}>Appointments Calendar</Text>

        {/* Pull to refresh hint */}
        <Text style={[styles.refreshHint, { color: colors.subtext, fontSize: getScaledFontSize(12), lineHeight: getScaledFontSize(16) }]}>
          Pull down to refresh
        </Text>

        {appointments.length === 0 ? (
          /* No appointments at all — empty state */
          <Card style={[styles.calendarCard, { backgroundColor: colors.card }]}>
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
            {/* Calendar */}
            <Card style={styles.calendarCard}>
              <Calendar
                onDayPress={onDayPress}
                markedDates={markedDates}
                markingType="multi-dot"
                theme={{
                  backgroundColor: '#ffffff',
                  calendarBackground: '#ffffff',
                  textSectionTitleColor: '#b6c1cd',
                  selectedDayBackgroundColor: '#1976D2',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#1976D2',
                  dayTextColor: '#2d4150',
                  textDisabledColor: '#d9e1e8',
                  dotColor: '#00adf5',
                  selectedDotColor: '#ffffff',
                  arrowColor: '#1976D2',
                  monthTextColor: '#2d4150',
                  indicatorColor: '#1976D2',
                  textDayFontFamily: 'System',
                  textMonthFontFamily: 'System',
                  textDayHeaderFontFamily: 'System',
                  textDayFontWeight: getScaledFontWeight(300) as any,
                  textMonthFontWeight: getScaledFontWeight(600) as any,
                  textDayHeaderFontWeight: getScaledFontWeight(300) as any,
                  textDayFontSize: 16,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 13,
                }}
                style={styles.calendar}
              />
            </Card>

            {/* Selected Date Appointments */}
            <Card style={styles.appointmentsListCard}>
              <Text style={[styles.sectionTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any, paddingHorizontal: getScaledFontSize(16) }]}>
                Appointments for {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) : 'Selected Date'}
              </Text>
              {selectedDateAppointments.length > 0 ? (
                selectedDateAppointments.map((appointment) => (
                  <View key={appointment.id} style={[styles.appointmentItem, { paddingHorizontal: getScaledFontSize(16), paddingVertical: getScaledFontSize(12) }]}>
                    <View style={[styles.appointmentColor, { backgroundColor: appointment.color, flexShrink: 0 }]} />
                    <View style={styles.appointmentDetails}>
                      <Text style={[styles.appointmentTitle, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>{appointment.title}</Text>
                      <Text style={[styles.appointmentDate, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                        {appointment.time}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noAppointmentsContainer}>
                  <Text style={[styles.noAppointmentsText, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text + '80' }]}>
                    No appointments scheduled for this date
                  </Text>
                </View>
              )}
            </Card>
          </>
        )}
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
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
    color: '#333',
  },
  calendarCard: {
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  calendar: {
    borderRadius: 8,
  },
  appointmentsListCard: {
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    paddingTop: 16,
    color: '#333',
  },
  appointmentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  appointmentColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  appointmentDate: {
    fontSize: 14,
    color: '#666',
  },
  refreshHint: {
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    textAlign: 'center',
  },
  noAppointmentsContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  noAppointmentsText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
