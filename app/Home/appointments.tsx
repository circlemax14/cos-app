import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useAppointments } from '@/hooks/use-appointments';
import { useRecommendedAppointments, useUpdateRecommendedAppointmentStatus } from '@/hooks/use-recommended-appointments';
import type { Appointment, RecommendedAppointment } from '@/services/api/types';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

const URGENCY_CONFIG: Record<
  RecommendedAppointment['urgency'],
  { label: string; indicator: string; bg: string; text: string }
> = {
  urgent: { label: 'Urgent', indicator: '🔴', bg: '#FFEBEE', text: '#C62828' },
  soon: { label: 'Soon', indicator: '🟡', bg: '#FFF8E1', text: '#E65100' },
  routine: { label: 'Routine', indicator: '⚪', bg: '#F5F5F5', text: '#616161' },
};

const URGENCY_ORDER: Record<RecommendedAppointment['urgency'], number> = {
  urgent: 0,
  soon: 1,
  routine: 2,
};

const SOURCE_LABELS: Record<RecommendedAppointment['sourceType'], string> = {
  service_request: "Doctor's order",
  care_plan: 'Care plan',
  encounter_pattern: 'Visit pattern detected',
  nlp_extraction: 'Visit notes',
};

type AppointmentTab = 'past' | 'recommended';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<AppointmentTab>('past');

  const { data, isLoading, isError, refetch } = useAppointments();
  const {
    data: recommendations,
    isLoading: isLoadingRecs,
    isError: isErrorRecs,
    refetch: refetchRecs,
  } = useRecommendedAppointments({ status: 'pending' });
  const { mutate: updateRecStatus } = useUpdateRecommendedAppointmentStatus();

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
    // Refetch both — the recommended tab refresh also triggers server-side regen
    await Promise.all([refetch(), refetchRecs()]);
    setRefreshing(false);
  }, [refetch, refetchRecs]);

  const groupedRecommendations = useMemo(() => {
    const items = recommendations ?? [];
    const groups: Partial<Record<RecommendedAppointment['urgency'], RecommendedAppointment[]>> = {};
    for (const item of items) {
      if (!groups[item.urgency]) groups[item.urgency] = [];
      groups[item.urgency]!.push(item);
    }
    return (['urgent', 'soon', 'routine'] as const)
      .filter((u) => (groups[u]?.length ?? 0) > 0)
      .map((u) => ({ urgency: u, items: groups[u]!.sort((a, b) => a.recommendedByDate.localeCompare(b.recommendedByDate)) }));
  }, [recommendations]);

  const handleMarkScheduled = useCallback(
    (item: RecommendedAppointment) => {
      Alert.alert(
        'Mark as Scheduled',
        `Have you scheduled "${item.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, I scheduled it', onPress: () => updateRecStatus({ id: item.id, status: 'scheduled' }) },
        ],
      );
    },
    [updateRecStatus],
  );

  const handleDismissRec = useCallback(
    (item: RecommendedAppointment) => {
      Alert.alert(
        'Dismiss Recommendation',
        `Dismiss "${item.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Already have one', onPress: () => updateRecStatus({ id: item.id, status: 'dismissed', reason: 'Already have an appointment scheduled' }) },
          { text: 'Dismiss', style: 'destructive', onPress: () => updateRecStatus({ id: item.id, status: 'dismissed' }) },
        ],
      );
    },
    [updateRecStatus],
  );

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    for (const apt of appointments) {
      const date = apt.date || 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(apt);
    }
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
            {appointments.length} record{appointments.length !== 1 ? 's' : ''} from your connected EHRs
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

        {activeTab === 'past' && (
        <>
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

        {appointments.length === 0 ? (
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
              {items.map((apt) => {
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

        {activeTab === 'recommended' && (
          <View>
            {isLoadingRecs ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12, textAlign: 'center' }}>
                  Generating AI-powered recommendations from your records...
                </Text>
              </View>
            ) : isErrorRecs ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>😔</Text>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, textAlign: 'center', marginBottom: 12 }}>
                  Failed to load recommendations
                </Text>
                <TouchableOpacity
                  onPress={() => refetchRecs()}
                  style={[styles.retryButton, { backgroundColor: colors.tint }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: getScaledFontSize(16) }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : groupedRecommendations.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, textAlign: 'center', marginBottom: 6 }}>
                  {"You're all caught up!"}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center', lineHeight: getScaledFontSize(20) }}>
                  No pending appointment recommendations at this time.
                </Text>
              </View>
            ) : (
              groupedRecommendations.map(({ urgency, items }) => {
                const urgencyConfig = URGENCY_CONFIG[urgency];
                return (
                  <View key={urgency} style={styles.dateGroup}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 4 }}>
                      <Text style={{ fontSize: getScaledFontSize(14) }}>{urgencyConfig.indicator}</Text>
                      <Text
                        style={{
                          color: urgencyConfig.text,
                          fontSize: getScaledFontSize(13),
                          fontWeight: getScaledFontWeight(600) as any,
                          marginLeft: 6,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                        }}
                      >
                        {urgencyConfig.label}
                      </Text>
                    </View>
                    {items.map((item) => (
                      <View
                        key={item.id}
                        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: urgencyConfig.text, borderLeftWidth: 4 }]}
                      >
                        <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginBottom: 4 }}>
                          {item.title}
                        </Text>
                        {item.specialty ? (
                          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 2 }}>
                            {item.specialty}
                          </Text>
                        ) : null}
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 8 }} numberOfLines={2}>
                          {item.reason}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <View style={[styles.badge, { backgroundColor: urgencyConfig.bg }]}>
                            <Text style={{ color: urgencyConfig.text, fontSize: getScaledFontSize(11), fontWeight: '600' }}>
                              By {formatDate(item.recommendedByDate)}
                            </Text>
                          </View>
                          <View style={[styles.badge, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
                              {SOURCE_LABELS[item.sourceType]}
                            </Text>
                          </View>
                        </View>
                        {item.relatedCondition ? (
                          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), fontStyle: 'italic', marginTop: 4, marginBottom: 4 }}>
                            Related: {item.relatedCondition}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                          <TouchableOpacity
                            onPress={() => handleMarkScheduled(item)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44, backgroundColor: colors.tint }}
                            accessibilityRole="button"
                          >
                            <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                              I Scheduled This
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDismissRec(item)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                            accessibilityRole="button"
                          >
                            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>Dismiss</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
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
