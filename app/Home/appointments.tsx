import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RecommendedAppointmentsList } from '@/components/recommended-appointments-list';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import { useDeviceCalendar } from '@/hooks/use-device-calendar';
import type { Appointment } from '@/services/api/types';
import type { DeviceEvent } from '@/services/device-calendar';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

/**
 * SCRUM-269 Phase B: device-calendar events from Apple/Google/Outlook
 * appear in this feed alongside medical visits. A "PersonalRow" wraps
 * the raw DeviceEvent into the same date-grouped layout the existing
 * EHR appointments use.
 */
interface PersonalRow {
  kind: 'personal';
  id: string;
  date: string; // YYYY-MM-DD
  event: DeviceEvent;
}
interface MedicalRow {
  kind: 'medical';
  id: string;
  date: string;
  appointment: Appointment;
}
type FeedRow = MedicalRow | PersonalRow;

type AppointmentTab = 'past' | 'recommended';
type DateRange = 'all' | 'day' | 'week' | 'month';

/** Inclusive end of the given range starting from today (00:00). */
function rangeEnd(range: DateRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  if (range === 'day') {
    // Today only — same day window.
    end.setDate(end.getDate() + 1);
  } else if (range === 'week') {
    end.setDate(end.getDate() + 7);
  } else if (range === 'month') {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function rangeStart(range: DateRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Day/Week/Month all look BOTH directions — past + upcoming within the
  // window. So start = now - same span back.
  if (range === 'day') {
    // Today's appointments only.
    return start;
  }
  if (range === 'week') {
    start.setDate(start.getDate() - 7);
  } else if (range === 'month') {
    start.setMonth(start.getMonth() - 1);
  }
  return start;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  booked: { bg: '#E3F2FD', text: '#1565C0', icon: '📅' },
  arrived: { bg: '#E8F5E9', text: '#2E7D32', icon: '✓' },
  fulfilled: { bg: '#E8F5E9', text: '#2E7D32', icon: '✓' },
  finished: { bg: '#F3E5F5', text: '#7B1FA2', icon: '★' },
  cancelled: { bg: '#FFEBEE', text: '#C62828', icon: '✕' },
  noshow: { bg: '#FFF3E0', text: '#E65100', icon: '⚠' },
  'entered-in-error': { bg: '#FFEBEE', text: '#C62828', icon: '✕' },
  planned: { bg: '#E3F2FD', text: '#1565C0', icon: '📅' },
  'in-progress': { bg: '#FFF8E1', text: '#F57F17', icon: '⏳' },
  triaged: { bg: '#FFF8E1', text: '#F57F17', icon: '⏳' },
  onleave: { bg: '#FFF3E0', text: '#E65100', icon: '⚠' },
};

const RESOURCE_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Appointment: { bg: '#E3F2FD', text: '#1565C0', label: 'Appointment' },
  Encounter: { bg: '#E8F5E9', text: '#2E7D32', label: 'Encounter' },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  // Accept both "YYYY-MM-DD" and full ISO timestamps by slicing the date part first.
  const dateOnly = dateStr.slice(0, 10);
  const d = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Initial tab honours ?tab=recommended from deep-links (e.g. the
  // "Recommended Appointments" card on the Home screen).
  const searchParams = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<AppointmentTab>(
    searchParams.tab === 'recommended' ? 'recommended' : 'past',
  );
  // SCRUM-269 Phase A: scope the past-visits list to a date window so
  // users can drill into a day / week / month view of their medical
  // appointments. "All" keeps the original full-list behavior.
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const { data, isLoading, isError, refetch } = useAppointments();
  // SCRUM-269 Phase B: device-calendar events merged into the same feed.
  const deviceCalendar = useDeviceCalendar();

  const appointments = useMemo(() => {
    const all = data ?? [];
    const start = rangeStart(dateRange);
    const end = rangeEnd(dateRange);
    const inRange = start && end
      ? all.filter((apt) => {
          if (!apt.date) return false;
          const d = new Date(apt.date.slice(0, 10));
          return d >= start && d < end;
        })
      : all;
    if (!searchQuery.trim()) return inRange;
    const q = searchQuery.toLowerCase();
    return inRange.filter((apt) =>
      (apt.type?.toLowerCase().includes(q)) ||
      (apt.doctorName?.toLowerCase().includes(q)) ||
      (apt.clinicName?.toLowerCase().includes(q)) ||
      (apt.diagnosis?.toLowerCase().includes(q)) ||
      (apt.status?.toLowerCase().includes(q)) ||
      (apt.resourceType?.toLowerCase().includes(q)) ||
      (apt.encounterClass?.toLowerCase().includes(q))
    );
  }, [data, searchQuery, dateRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Filter the device events to the same date range + search query as
  // the medical list so toggling the chips / typing in search affects
  // both feeds together.
  const personalEvents = useMemo(() => {
    if (!deviceCalendar.granted) return [] as DeviceEvent[];
    const start = rangeStart(dateRange);
    const end = rangeEnd(dateRange);
    const filtered = deviceCalendar.events.filter((ev) => {
      if (!ev.startDate) return false;
      const d = new Date(ev.startDate.slice(0, 10));
      if (start && end && (d < start || d >= end)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.location?.toLowerCase().includes(q) ||
        ev.source.title.toLowerCase().includes(q) ||
        ev.source.source.toLowerCase().includes(q)
      );
    });
    return filtered;
  }, [deviceCalendar.events, deviceCalendar.granted, dateRange, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, FeedRow[]> = {};
    for (const apt of appointments) {
      const date = apt.date || 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push({ kind: 'medical', id: apt.id, date, appointment: apt });
    }
    for (const ev of personalEvents) {
      const date = ev.startDate.slice(0, 10);
      if (!groups[date]) groups[date] = [];
      groups[date].push({ kind: 'personal', id: `device-${ev.id}`, date, event: ev });
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [appointments, personalEvents]);

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
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading appointments...
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>😔</Text>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginBottom: 8 }}>
            Failed to load appointments
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginBottom: 20, textAlign: 'center' }}>
            Please check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading appointments"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }}>
              Retry
            </Text>
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
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Appointments & Encounters
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              textAlign: 'center',
            }}
          >
            {appointments.length} medical{personalEvents.length > 0 ? ` · ${personalEvents.length} personal` : ''}
          </Text>
        </View>

        {/* Tab toggle: Past Visits | Recommended */}
        <View style={[styles.tabToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setActiveTab('past')}
            style={[
              styles.tabToggleItem,
              activeTab === 'past' && { backgroundColor: colors.tint },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'past' }}
            accessibilityLabel="Past Visits"
          >
            <Text
              style={{
                color: activeTab === 'past' ? '#fff' : colors.subtext,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(activeTab === 'past' ? 600 : 400) as any,
              }}
            >
              Past Visits
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('recommended')}
            style={[
              styles.tabToggleItem,
              activeTab === 'recommended' && { backgroundColor: colors.tint },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'recommended' }}
            accessibilityLabel="Recommended"
          >
            <Text
              style={{
                color: activeTab === 'recommended' ? '#fff' : colors.subtext,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(activeTab === 'recommended' ? 600 : 400) as any,
              }}
            >
              Recommended
            </Text>
          </Pressable>
        </View>

        {activeTab === 'recommended' ? (
          <RecommendedAppointmentsList />
        ) : (
          <>
        {/* SCRUM-269 Phase B: prompt to connect device calendar so
            personal events flow into the same feed. Hidden once granted. */}
        {!deviceCalendar.granted ? (
          <View style={[styles.permissionBanner, { backgroundColor: (colors.tint as string) + '14', borderColor: (colors.tint as string) + '40' }]}>
            <IconSymbol name="calendar" size={getScaledFontSize(20)} color={colors.tint as string} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                See personal appointments here
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                {deviceCalendar.prompted
                  ? 'Calendar access is off. Enable it in Settings to fold personal events into this view.'
                  : 'Allow read access to your device calendar and personal events appear here alongside medical visits. Details stay on this device.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { void deviceCalendar.requestPermission(); }}
              style={[styles.permissionButton, { backgroundColor: colors.tint as string }]}
              accessibilityRole="button"
              accessibilityLabel={deviceCalendar.prompted ? 'Open Settings' : 'Allow calendar access'}
            >
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(700) as any }}>
                {deviceCalendar.prompted ? 'Settings' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* SCRUM-269 Phase A: date-range chips. "All" keeps the original
            full-list behavior; Day = today, Week = +/- 7 days, Month =
            +/- 1 month. Phase B merges device-calendar events into the
            same list with source-app badges. */}
        <View style={styles.rangeRow}>
          {(['all', 'day', 'week', 'month'] as const).map((r) => {
            const selected = dateRange === r;
            const label = r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1);
            return (
              <Pressable
                key={r}
                onPress={() => setDateRange(r)}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: selected ? (colors.tint as string) : 'transparent',
                    borderColor: selected ? (colors.tint as string) : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={{
                    color: selected ? '#fff' : colors.text,
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(selected ? 700 : 500) as any,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={getScaledFontSize(18)} color={colors.subtext} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: 15 }]}
            placeholder="Search by type, doctor, clinic..."
            placeholderTextColor={colors.subtext}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search appointments"
            allowFontScaling
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <IconSymbol name="xmark.circle.fill" size={getScaledFontSize(18)} color={colors.subtext} />
            </TouchableOpacity>
          ) : null}
        </View>

        {appointments.length === 0 && personalEvents.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📅</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              No appointments or encounters found
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                lineHeight: getScaledFontSize(20),
              }}
            >
              Your records will appear here once available from your connected clinics.
            </Text>
          </View>
        ) : (
          groupedByDate.map(([date, items]) => (
            <View key={date} style={styles.dateGroup}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 10,
                  paddingLeft: 4,
                }}
                accessibilityRole="header"
              >
                {formatDate(date)}
              </Text>
              {items.map((row) => {
                if (row.kind === 'personal') {
                  return (
                    <PersonalEventCard
                      key={row.id}
                      event={row.event}
                      colors={colors}
                      fontSize={getScaledFontSize}
                      fontWeight={getScaledFontWeight}
                    />
                  );
                }
                const apt = row.appointment;
                const resStyle = RESOURCE_TYPE_STYLES[apt.resourceType ?? 'Encounter'];
                const statusStyle = STATUS_COLORS[apt.status] ?? STATUS_COLORS.finished;

                return (
                  <TouchableOpacity
                    key={apt.id}
                    activeOpacity={0.7}
                    onPress={() => handleCardPress(apt)}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${apt.type || 'Office Visit'}, ${apt.doctorName || 'Unknown Provider'}, status ${apt.status}. Double tap for details.`}
                  >
                    {/* Badges */}
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, { backgroundColor: resStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: resStyle.text, fontSize: getScaledFontSize(12) }]}>
                          {resStyle.label}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: statusStyle.text, fontSize: getScaledFontSize(12) }]}>
                          {statusStyle.icon} {apt.status}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: getScaledFontSize(16),
                        fontWeight: getScaledFontWeight(600) as any,
                        marginBottom: 8,
                      }}
                    >
                      {apt.type || 'Office Visit'}
                    </Text>

                    {/* Info rows */}
                    {apt.time ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="clock" size={getScaledFontSize(16)} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), flex: 1 }}>
                          {apt.time}
                        </Text>
                      </View>
                    ) : null}

                    {apt.doctorName && apt.doctorName !== 'Unknown Provider' ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="person" size={getScaledFontSize(16)} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), flex: 1 }}>
                          {apt.doctorName}{apt.doctorSpecialty ? ` — ${apt.doctorSpecialty}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {apt.clinicName ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="house" size={getScaledFontSize(16)} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), flex: 1 }}>
                          {apt.clinicName}
                        </Text>
                      </View>
                    ) : null}

                    {apt.diagnosis ? (
                      <View style={styles.infoRow}>
                        <IconSymbol name="doc.text" size={getScaledFontSize(16)} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), flex: 1 }} numberOfLines={2}>
                          {apt.diagnosis}
                        </Text>
                      </View>
                    ) : null}

                    {/* Chevron */}
                    <View style={styles.chevron}>
                      <IconSymbol name="chevron.right" size={getScaledFontSize(16)} color={colors.subtext} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

/**
 * SCRUM-269 Phase B: a personal event from the device calendar. Renders
 * with a teal "from {Source}" pill so users can tell which calendar
 * each entry came from at a glance. Tapping is a no-op for v1 — editing
 * lives in the native calendar app, not here.
 */
function PersonalEventCard({
  event,
  colors,
  fontSize,
  fontWeight,
}: {
  event: DeviceEvent;
  colors: { card: string; border: string; text: string; subtext: string; tint: string };
  fontSize: (n: number) => number;
  fontWeight: (n: number) => string | number;
}): React.JSX.Element {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const timeStr = event.allDay
    ? 'All day'
    : `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${
        end && !event.allDay && Math.abs(end.getTime() - start.getTime()) > 0
          ? ` – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : ''
      }`;
  const sourceColor = event.source.color ?? (colors.tint as string);
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`Personal event: ${event.title}, from ${event.source.title}, ${timeStr}`}
    >
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: sourceColor + '22', borderWidth: 1, borderColor: sourceColor + '66' }]}>
          <Text style={[styles.badgeText, { color: sourceColor, fontSize: fontSize(12) }]}>
            📅 {event.source.source}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: '#F3E5F5' }]}>
          <Text style={[styles.badgeText, { color: '#6A1B9A', fontSize: fontSize(12) }]}>
            Personal
          </Text>
        </View>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: fontSize(16),
          fontWeight: fontWeight(600) as any,
          marginBottom: 8,
        }}
        numberOfLines={2}
      >
        {event.title}
      </Text>

      <View style={styles.infoRow}>
        <IconSymbol name="clock" size={fontSize(16)} color={colors.subtext} />
        <Text style={{ color: colors.subtext, fontSize: fontSize(14), flex: 1 }}>
          {timeStr}
        </Text>
      </View>

      {event.location ? (
        <View style={styles.infoRow}>
          <IconSymbol name="location" size={fontSize(16)} color={colors.subtext} />
          <Text style={{ color: colors.subtext, fontSize: fontSize(14), flex: 1 }} numberOfLines={1}>
            {event.location}
          </Text>
        </View>
      ) : null}

      <View style={styles.infoRow}>
        <IconSymbol name="info.circle" size={fontSize(16)} color={colors.subtext} />
        <Text style={{ color: colors.subtext, fontSize: fontSize(12), flex: 1 }}>
          From {event.source.title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 20,
  },
  tabToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  permissionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 8,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabToggleItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 44,
    marginBottom: 20,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
  },
  clearButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
  },
  dateGroup: {
    marginBottom: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  chevron: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
});
