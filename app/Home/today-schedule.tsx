import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Card, IconButton, List } from 'react-native-paper';
import { fetchPatientInfo, fetchMedicationsSummary } from '@/services/api/patient';
import type { MedicationSummary, TaskOccurrence, TaskType } from '@/services/api/types';
import { fetchTasksForDate, completeTask, skipTask } from '@/services/api/ai-health-plan';
import { EntityIcon } from '@/components/icons';
import { getPhotoDownloadUrl } from '@/services/user-photo';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { detectMetricForTask, type MetricInputSpec } from '@/services/smart-task-detection';
import { RecordMetricModal } from '@/components/home/record-metric-modal';
import { useCalendar } from '@/hooks/use-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CalendarEvent } from '@/services/calendar';
import { reconcilePlanTaskNotifications } from '@/services/plan-task-notifications';
import { resolveCategoryGate } from '@/services/notification-category-gate';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTaskTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${meridiem}`;
}

const TASK_ICON_CONFIG: Record<TaskType, { name: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }> = {
  medication: { name: 'medication', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  exercise: { name: 'directions-walk', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  appointment: { name: 'local-hospital', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  reminder: { name: 'notifications', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
};

export default function TodayScheduleScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [patientName, setPatientName] = useState('');
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [medications, setMedications] = useState<MedicationSummary[]>([]);
  const [planTasks, setPlanTasks] = useState<TaskOccurrence[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // SCRUM-279 (build 45): Health Metrics section removed from this
  // screen — it lives in Health Trends and was duplicated here.

  // SCRUM-279 (build 49): Ken's ask "we need to have these events and
  // calendar in today's task also, so user can complete it in task
  // also. but this won't impact plan progress." Pull today's
  // calendar items and render them as plan-task-style rows in their
  // own section. Completion is stored locally (per-day AsyncStorage)
  // because there's no backend "completed" concept for arbitrary
  // device events. Reminders get their iOS completed-flag respected
  // on initial load. None of this counts toward the AI plan's % done.
  const todayWindow = React.useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, []);
  const { events: calendarEvents } = useCalendar({
    windowStart: todayWindow.start,
    windowEnd: todayWindow.end,
    includeReminders: true,
  });
  const todayCalendarItems = React.useMemo(
    () => calendarEvents
      .filter((e) => e.startDate.slice(0, 10) === todayISO())
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [calendarEvents],
  );
  const [completedCalendarIds, setCompletedCalendarIds] = useState<Set<string>>(new Set());
  const CALENDAR_DONE_KEY = `csh-today-cal-done-${todayISO()}`;
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CALENDAR_DONE_KEY);
        if (raw) setCompletedCalendarIds(new Set(JSON.parse(raw) as string[]));
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleCalendarItem = async (item: CalendarEvent) => {
    setCompletedCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      AsyncStorage.setItem(CALENDAR_DONE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };
  
  // Load patient data and medications
  useEffect(() => {
    const loadPatientData = async () => {
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setPatientName(patient.name || '');
          if (patient.photoUrl) {
            try {
              const downloadUrl = await getPhotoDownloadUrl();
              setPatientPhotoUrl(downloadUrl || patient.photoUrl);
            } catch {
              setPatientPhotoUrl(patient.photoUrl);
            }
          }
        }
      } catch {
        // Patient data failed to load
      } finally {
        setIsLoadingPatient(false);
      }
    };

    const loadMedications = async () => {
      try {
        const meds = await fetchMedicationsSummary();
        if (meds && meds.length > 0) {
          setMedications(meds);
        }
      } catch {
        // Medications failed to load
      }
    };

    const loadPlanTasks = async () => {
      try {
        const t = await fetchTasksForDate(todayISO());
        setPlanTasks(t);
        // SCRUM-279 (build 51): schedule local notifications for
        // today's pending plan tasks — 15 min before + at-time pair
        // per Ken's spec. Idempotent; runs whenever plan tasks
        // refresh (mount, focus, pull-to-refresh).
        //
        // COS-373: when the categories feature is ON, fetch the patient's
        // per-category prefs and gate the scheduler with them (medication
        // tasks → medicationTask, others → otherTask). When OFF we pass no
        // gate, so the scheduler schedules exactly as before. Resolving the
        // gate is best-effort — any failure falls back to no gate.
        const gate = await resolveCategoryGate();
        void reconcilePlanTaskNotifications(t, gate).catch(() => { /* non-fatal */ });
      } catch {
        // Tasks failed to load
      }
    };

    loadPatientData();
    loadMedications();
    loadPlanTasks();
  }, []);

  // SCRUM-279 (build 45): smart-task value capture.
  // Some tasks (blood glucose / weight / BP / ...) deserve to also
  // RECORD a value alongside marking complete. When the user taps the
  // checkmark on such a task, open a modal asking for the value. The
  // task isn't marked completed until either the value is saved OR
  // the user chooses "Skip recording".
  const [metricModalTask, setMetricModalTask] = useState<TaskOccurrence | null>(null);
  const [metricModalSpec, setMetricModalSpec] = useState<MetricInputSpec | null>(null);

  // Core completion path — same as before, just extracted so the
  // smart-task capture flow can call it after a value is saved.
  const persistTaskCompletion = async (task: TaskOccurrence) => {
    setPlanTasks((prev) =>
      prev.map((t) =>
        t.id === task.id && t.scheduledFor === task.scheduledFor
          ? { ...t, status: 'completed', completedAt: new Date().toISOString() }
          : t,
      ),
    );
    const result = await completeTask(task.id, task.scheduledFor);
    if (!result.ok) {
      setPlanTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor
            ? { ...t, status: 'pending', completedAt: undefined }
            : t,
        ),
      );
      const reason = result.code === 'NETWORK_ERROR'
        ? 'No internet connection. Try again when you’re back online.'
        : result.status === 401 || result.status === 403
          ? 'Your session expired. Please sign in again to mark tasks complete.'
          : (result.message ?? 'Could not save task completion.');
      Alert.alert("Couldn't complete task", reason);
    }
  };

  const handleTaskComplete = async (task: TaskOccurrence) => {
    if (task.status === 'completed') return;
    // Smart detection: if this task is asking the patient to measure
    // something, open the capture modal instead of completing right
    // away. Persisting completion is deferred until the modal confirms.
    const spec = detectMetricForTask(task);
    if (spec) {
      setMetricModalTask(task);
      setMetricModalSpec(spec);
      return;
    }
    // Non-trackable task — original behaviour.
    await persistTaskCompletion(task);
  };

  const handleTaskSkip = async (task: TaskOccurrence) => {
    setPlanTasks((prev) =>
      prev.map((t) =>
        t.id === task.id && t.scheduledFor === task.scheduledFor ? { ...t, status: 'skipped' } : t,
      ),
    );
    const result = await skipTask(task.id, task.scheduledFor);
    if (!result.ok) {
      setPlanTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.scheduledFor === task.scheduledFor ? { ...t, status: 'pending' } : t,
        ),
      );
      const reason = result.code === 'NETWORK_ERROR'
        ? 'No internet connection. Try again when you’re back online.'
        : result.status === 401 || result.status === 403
          ? 'Your session expired. Please sign in again to skip tasks.'
          : (result.message ?? 'Could not save task skip.');
      Alert.alert("Couldn't skip task", reason);
    }
  };

  // Pull to refresh — re-fetch medications + plan tasks.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const [meds, t] = await Promise.all([
        fetchMedicationsSummary().catch(() => null),
        fetchTasksForDate(todayISO()).catch(() => null),
      ]);
      if (meds) setMedications(meds);
      if (t) setPlanTasks(t);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AppWrapper>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Back Button */}
        <View style={styles.header}>
          {/*<TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <IconButton icon="arrow-left" size={getScaledFontSize(24)} iconColor={colors.text} />
          </TouchableOpacity>*/}
          <Text 
            numberOfLines={2}
            style={[
              styles.headerTitle,
              { 
                fontSize: getScaledFontSize(24), 
                fontWeight: getScaledFontWeight(700) as any, 
                color: colors.text,
              }
            ]}>
            Today&apos;s Schedule
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Profile Summary */}
        <Card style={[styles.profileCard, { backgroundColor: colors.background }]}>
          <View style={styles.profileContent}>
            {isLoadingPatient ? (
              <ActivityIndicator size="large" color={colors.tint} style={{ marginVertical: 16 }} />
            ) : (
            <>
            <EntityIcon
              type="patient"
              imageUrl={patientPhotoUrl ?? null}
              name={patientName || 'Patient'}
              size={getScaledFontSize(80)}
            />
            <View style={styles.profileInfo}>
              <Text style={[
                styles.profileName,
                {
                  fontSize: getScaledFontSize(20),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                }
              ]}>
                {patientName}
              </Text>
              <Text style={[
                styles.profileRole,
                {
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(400) as any,
                  color: colors.text + '80',
                }
              ]}>
                Patient
              </Text>
            </View>
            </>
            )}
          </View>
        </Card>


        {/* Current Medications — active prescriptions only */}
        {medications.length > 0 && (
        <View style={styles.medicationsSection}>
          <View style={styles.medSectionHeader}>
            <Text style={[
              styles.medicationsTitle,
              { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, color: colors.text }
            ]}>
              Current Medications
            </Text>
            <View style={[styles.medCountBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.medCountText, { fontSize: getScaledFontSize(12), color: colors.primary }]}>
                {medications.length}
              </Text>
            </View>
          </View>

          {medications.map((med) => {
            // Format the prescribed date
            let dateLabel = '';
            if (med.authoredOn) {
              const d = new Date(med.authoredOn);
              dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }

            // Build dosage display: prefer structured dose, fall back to text
            const doseDisplay = med.dosage || med.rawDosageText || '';
            const freqDisplay = med.frequency || '';
            const detailParts = [doseDisplay, freqDisplay].filter(Boolean);

            return (
              <View
                key={med.id}
                style={[
                  styles.medCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.primary + '20',
                    borderLeftColor: colors.primary,
                  },
                ]}
              >
                <View style={styles.medCardHeader}>
                  <View style={styles.medCardLeft}>
                    <View style={[styles.medIconCircle, { backgroundColor: colors.primary + '12' }]}>
                      <List.Icon icon="pill" color={colors.primary} style={{ margin: 0 }} />
                    </View>
                    <View style={styles.medCardInfo}>
                      <Text
                        style={[{ fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, color: colors.text }]}
                        numberOfLines={2}
                      >
                        {med.name}
                      </Text>
                      {detailParts.length > 0 && (
                        <Text
                          style={[{ fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '80', marginTop: 2 }]}
                          numberOfLines={1}
                        >
                          {detailParts.join(' · ')}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {dateLabel ? (
                  <View style={styles.medDateRow}>
                    <IconButton icon="calendar-outline" size={getScaledFontSize(14)} iconColor={colors.text + '50'} style={{ margin: 0, padding: 0, width: 18, height: 18 }} />
                    <Text style={[{ fontSize: getScaledFontSize(12), color: colors.text + '50' }]}>
                      Prescribed {dateLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        )}

        {/* COS-352: Ken wants calendar events shown FIRST, then tasks. */}
        {/* SCRUM-279 (build 49): today's calendar events + reminders,
            tappable but DO NOT count toward plan progress (per Ken). */}
        {todayCalendarItems.length > 0 && (
          <View style={styles.planTasksSection}>
            <View style={styles.planTasksHeader}>
              <Text style={[styles.planTasksTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, color: colors.text }]}>
                Today&apos;s Calendar
              </Text>
              <Text style={[styles.planTasksProgress, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any, color: colors.text + '80' }]}>
                {todayCalendarItems.length} item{todayCalendarItems.length === 1 ? '' : 's'}
              </Text>
            </View>
            {todayCalendarItems.map((item) => {
              const done = completedCalendarIds.has(item.id) || !!item.completed;
              const isReminder = item.origin === 'reminder';
              const hhmm = item.allDay
                ? 'All day'
                : (() => {
                    const d = new Date(item.startDate);
                    const hh = d.getHours();
                    const mm = d.getMinutes().toString().padStart(2, '0');
                    const meridiem = hh >= 12 ? 'PM' : 'AM';
                    const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
                    return `${display}:${mm} ${meridiem}`;
                  })();
              const iconBg = isReminder ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)';
              const iconColor = isReminder ? '#F59E0B' : '#3B82F6';
              const iconName: keyof typeof MaterialIcons.glyphMap = isReminder ? 'notifications' : 'event';
              return (
                <TouchableOpacity
                  key={`cal:${item.id}`}
                  activeOpacity={0.7}
                  onPress={() => toggleCalendarItem(item)}
                  style={[
                    styles.planTaskRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.text + '15',
                      opacity: done ? 0.55 : 1,
                    },
                  ]}>
                  <View style={[styles.planTaskCheck, {
                    borderColor: done ? '#008080' : colors.text + '50',
                    backgroundColor: done ? '#008080' : 'transparent',
                  }]}>
                    {done && <MaterialIcons name="check" size={14} color="#fff" />}
                  </View>
                  <View style={[styles.planTaskIcon, { backgroundColor: iconBg }]}>
                    <MaterialIcons name={iconName} size={18} color={iconColor} />
                  </View>
                  <View style={styles.planTaskBody}>
                    <Text
                      style={[styles.planTaskTitle, {
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(600) as any,
                        color: colors.text,
                        textDecorationLine: done ? 'line-through' : 'none',
                      }]}
                      numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!!item.location && (
                      <Text style={[styles.planTaskSub, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]} numberOfLines={1}>
                        {item.location}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.planTaskTime, { fontSize: getScaledFontSize(12), color: colors.text + '80', fontWeight: getScaledFontWeight(600) as any }]}>
                    {hhmm}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Today's Plan Tasks (from AI health plan) */}
        {planTasks.length > 0 && (
          <View style={styles.planTasksSection}>
            <View style={styles.planTasksHeader}>
              <Text style={[styles.planTasksTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, color: colors.text }]}>
                Today&apos;s Tasks
              </Text>
              <Text style={[styles.planTasksProgress, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any, color: '#008080' }]}>
                {planTasks.filter((t) => t.status === 'completed').length} / {planTasks.length} done
              </Text>
            </View>
            {planTasks.map((task) => {
              const icon = TASK_ICON_CONFIG[task.type];
              const done = task.status === 'completed';
              const skipped = task.status === 'skipped';
              // SCRUM-279 (build 45): if this task is metric-trackable,
              // show a small "Record" pill so the patient sees that
              // tapping will ask them for a value (not just check off).
              const spec = !done && !skipped ? detectMetricForTask(task) : null;
              return (
                <TouchableOpacity
                  key={`${task.id}#${task.scheduledFor}`}
                  activeOpacity={0.7}
                  onPress={() => handleTaskComplete(task)}
                  onLongPress={() => handleTaskSkip(task)}
                  style={[
                    styles.planTaskRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.text + '15',
                      opacity: done || skipped ? 0.55 : 1,
                    },
                  ]}>
                  <View
                    style={[
                      styles.planTaskCheck,
                      {
                        borderColor: done ? '#008080' : colors.text + '50',
                        backgroundColor: done ? '#008080' : 'transparent',
                      },
                    ]}>
                    {done && <MaterialIcons name="check" size={14} color="#fff" />}
                    {skipped && <MaterialIcons name="close" size={14} color={colors.text + '70'} />}
                  </View>
                  <View style={[styles.planTaskIcon, { backgroundColor: icon.bg }]}>
                    <MaterialIcons name={icon.name} size={18} color={icon.color} />
                  </View>
                  <View style={styles.planTaskBody}>
                    <Text
                      style={[
                        styles.planTaskTitle,
                        {
                          fontSize: getScaledFontSize(14),
                          fontWeight: getScaledFontWeight(600) as any,
                          color: colors.text,
                          textDecorationLine: done ? 'line-through' : 'none',
                        },
                      ]}
                      numberOfLines={1}>
                      {task.title}
                    </Text>
                    {!!task.description && (
                      <Text
                        style={[styles.planTaskSub, { fontSize: getScaledFontSize(12), color: colors.text + '70' }]}
                        numberOfLines={1}>
                        {task.description}
                      </Text>
                    )}
                  </View>
                  {spec ? (
                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: (colors.tint ?? '#008080') + '22',
                      borderWidth: 1,
                      borderColor: (colors.tint ?? '#008080') + '55',
                      marginRight: 8,
                    }}>
                      <Text style={{
                        color: colors.tint ?? '#008080',
                        fontSize: getScaledFontSize(10),
                        fontWeight: '700',
                        letterSpacing: 0.3,
                      }}>
                        RECORD
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.planTaskTime, { fontSize: getScaledFontSize(12), color: colors.text + '80', fontWeight: getScaledFontWeight(600) as any }]}>
                    {formatTaskTime(task.scheduledTime)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* SCRUM-279 (build 45): smart-task value capture. Modal opens
          when the user taps a recordable task (blood glucose / weight /
          etc.) and POSTs the captured value before marking complete. */}
      <RecordMetricModal
        visible={!!metricModalTask && !!metricModalSpec}
        spec={metricModalSpec}
        taskTitle={metricModalTask?.title ?? ''}
        sourceTaskId={metricModalTask?.id}
        onClose={() => { setMetricModalTask(null); setMetricModalSpec(null); }}
        onConfirmComplete={async () => {
          const task = metricModalTask;
          setMetricModalTask(null);
          setMetricModalSpec(null);
          if (task) await persistTaskCompletion(task);
        }}
      />
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  profileCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 14,
  },
  progressCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
  },
  progressContent: {
    width: '100%',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBarContainer: {
    width: '100%',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#008080'
  },
  progressText: {
    fontSize: 14,
    marginTop: 4,
  },
  tasksSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  taskCard: {
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  taskContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
  },
  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskDetails: {
    marginLeft: 12,
    flex: 1,
  },
  taskTime: {
    fontSize: 12,
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
  },
  healthMetricsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  healthMetricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  permissionErrorContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    width: '100%',
  },
  permissionErrorText: {
    fontSize: 14,
    textAlign: 'center',
    includeFontPadding: true, // Android: include font padding to prevent cutoff
  },
  permissionButton: {
    borderRadius: 8,
    minWidth: 200,
    alignSelf: 'center',
  },
  permissionHintText: {
    fontSize: 12,
    textAlign: 'center',
    includeFontPadding: true, // Android: include font padding to prevent cutoff
  },
  healthMetricsText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  healthMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  healthMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    minWidth: 140,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(10, 126, 164, 0.1)',
  },
  healthMetricIconContainer: {
    marginRight: 12,
    flexShrink: 0,
  },
  healthMetricContent: {
    flex: 1,
  },
  healthMetricValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  healthMetricLabel: {
    fontSize: 12,
  },
  medicationsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  medSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  medicationsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  medCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  medCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  medSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  medCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  medCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  medCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  medIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medCardInfo: {
    flex: 1,
  },
  medStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  medStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  medDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },

  // Plan tasks section
  planTasksSection: { marginHorizontal: 16, marginBottom: 16 },
  planTasksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planTasksTitle: {},
  planTasksProgress: {},
  planTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  planTaskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planTaskIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  planTaskBody: { flex: 1 },
  planTaskTitle: {},
  planTaskSub: { marginTop: 2 },
  planTaskTime: {},
});

