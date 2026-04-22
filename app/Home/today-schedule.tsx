import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform, AppState, RefreshControl } from 'react-native';
import { Card, IconButton, List, Button } from 'react-native-paper';
import { getTodayHealthMetrics, initializeHealthKit, HealthMetrics } from '@/services/health';
import { fetchPatientInfo, fetchMedicationsSummary } from '@/services/api/patient';
import type { MedicationSummary } from '@/services/api/types';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { Image } from 'expo-image';
import { getPhotoDownloadUrl } from '@/services/user-photo';

interface Task {
  id: number;
  time: string;
  title: string;
  description: string;
  type: string;
  icon: string;
  completed: boolean;
}

export default function TodayScheduleScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [patientName, setPatientName] = useState('');
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [medications, setMedications] = useState<MedicationSummary[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics>({
    steps: 0,
    heartRate: null,
    sleepHours: 0,
    caloriesBurned: 0,
    isLoading: true,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const appState = useRef(AppState.currentState);
  
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

    loadPatientData();
    loadMedications();
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);

  // Fetch health data function
  const fetchHealthData = async (showLoading = true): Promise<void> => {
    if (showLoading) {
      setHealthMetrics((prev) => ({ ...prev, isLoading: true }));
    }
    
    // Wrap everything in try-catch to prevent any crashes
    try {
      // Check if we're on iOS before attempting HealthKit
      if (Platform.OS !== 'ios') {
        setHealthMetrics({
          steps: 0,
          heartRate: null,
          sleepHours: 0,
          caloriesBurned: 0,
          isLoading: false,
          error: 'Health data is only available on iOS devices.',
        });
        return;
      }
      
      // Wrap HealthKit call in additional error handling to prevent crashes
      const metrics = await Promise.race([
        getTodayHealthMetrics().catch((err) => {
          // If HealthKit fails, return a safe default instead of crashing
          console.error('HealthKit fetch failed, using defaults:', err);
          return {
            steps: 0,
            heartRate: null,
            sleepHours: 0,
            caloriesBurned: 0,
            isLoading: false,
            error: 'Failed to load health data. Please try again later.',
          };
        }),
        // Timeout after 5 seconds to prevent hanging (reduced from 10)
        new Promise<HealthMetrics>((resolve) => {
          setTimeout(() => {
            resolve({
              steps: 0,
              heartRate: null,
              sleepHours: 0,
              caloriesBurned: 0,
              isLoading: false,
              error: 'Health data request timed out. Please try again.',
            });
          }, 5000);
        }),
      ]);
      
      setHealthMetrics(metrics);
    } catch (error) {
      console.error('Error in fetchHealthData:', error);
      // Ensure we always set a valid state, even on error - never crash
      setHealthMetrics((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch health data',
        steps: prev?.steps || 0,
        heartRate: prev?.heartRate || null,
        sleepHours: prev?.sleepHours || 0,
        caloriesBurned: prev?.caloriesBurned || 0,
      }));
    }
  };

  // Pull to refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHealthData(false);
    setRefreshing(false);
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Initialize HealthKit and fetch metrics on mount (iOS only)
    const loadHealthData = async () => {
      if (Platform.OS !== 'ios') {
        if (isMounted) {
          setHealthMetrics({
            steps: 0,
            heartRate: null,
            sleepHours: 0,
            caloriesBurned: 0,
            isLoading: false,
            error: 'Health data is only available on iOS devices.',
          });
        }
        return;
      }

      try {
        await initializeHealthKit();
        if (isMounted) {
          await fetchHealthData(true);
        }
      } catch (err) {
        console.warn('HealthKit initialization failed:', err);
        if (isMounted) {
          setHealthMetrics({
            steps: 0,
            heartRate: null,
            sleepHours: 0,
            caloriesBurned: 0,
            isLoading: false,
            error: 'Unable to access health data. Please grant permission in Settings.',
          });
        }
      }
    };

    loadHealthData();

    // Listen for app state changes — refresh health data when app returns to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (!isMounted) return;

      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came back — re-fetch health data
        fetchHealthData(false);
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.remove();
    };
  }, []);

  // Check if error is permission-related
  const isPermissionError = () => {
    if (!healthMetrics.error) {
      // Also check if all values are 0/null - this might indicate permission denial
      const allZero = 
        healthMetrics.steps === 0 &&
        healthMetrics.heartRate === null &&
        healthMetrics.sleepHours === 0 &&
        healthMetrics.caloriesBurned === 0;
      
      // If all values are zero and we're not loading, it's likely a permission issue
      if (allZero && !healthMetrics.isLoading) {
        console.log('⚠️ All health metrics are zero - likely permission issue');
        return true;
      }
      return false;
    }
    const errorLower = healthMetrics.error.toLowerCase();
    const isPermission = (
      errorLower.includes('permission') ||
      errorLower.includes('authorization') ||
      errorLower.includes('denied') ||
      errorLower.includes('not granted') ||
      errorLower.includes('required') ||
      errorLower.includes('not authorized')
    );
    console.log('🔍 Checking permission error:', {
      error: healthMetrics.error,
      isPermission,
      errorLower,
    });
    return isPermission;
  };

  // Open iOS Settings app to Health permissions
  const openHealthSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        // Open Health privacy settings page (Privacy & Security > Health)
        // User can then select CoS from the list
        const healthSettingsUrl = 'App-Prefs:root=Privacy&path=HEALTH';
        const canOpen = await Linking.canOpenURL(healthSettingsUrl);
        if (canOpen) {
          await Linking.openURL(healthSettingsUrl);
        } else {
          // Fallback to app settings if Health settings URL doesn't work
          await Linking.openURL('app-settings:');
        }
      } else {
        // For Android, open app settings
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      // Fallback to app settings if Health settings URL fails
      try {
        await Linking.openURL('app-settings:');
      } catch (fallbackError) {
        console.error('Error opening fallback settings:', fallbackError);
      }
    }
  };

  const toggleTaskCompletion = (taskId: number) => {
    setTasks(tasks.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const completedCount = tasks.filter(task => task.completed).length;
  const progress = (completedCount / tasks.length) * 100;

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
            {patientPhotoUrl ? (
              <Image
                source={{ uri: patientPhotoUrl }}
                style={{ width: getScaledFontSize(80), height: getScaledFontSize(80), borderRadius: getScaledFontSize(40) }}
                contentFit="cover"
              />
            ) : (
              <InitialsAvatar name={patientName} size={getScaledFontSize(80)} />
            )}
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

        {/* Health Metrics Section */}
        {!healthMetrics.isLoading && (
          // Show permission error card if permissions are denied
          // Check: explicit error OR all values are 0/null (likely permission denial)
          (isPermissionError() || 
           (healthMetrics.steps === 0 && 
            healthMetrics.heartRate === null && 
            healthMetrics.sleepHours === 0 && 
            healthMetrics.caloriesBurned === 0)) ? (
            <Card style={[styles.healthMetricsCard, { backgroundColor: colors.background }]}>
              <Text style={[
                styles.healthMetricsTitle,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                  marginBottom: 16,
                }
              ]}>
                Health Metrics
              </Text>
              <View style={styles.permissionErrorContainer}>
                <Text style={[
                  styles.permissionErrorText,
                  {
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text + 'CC',
                    marginBottom: getScaledFontSize(16),
                    textAlign: 'center',
                    paddingHorizontal: 8,
                    paddingTop: getScaledFontSize(8),
                    paddingBottom: getScaledFontSize(4),
                  }
                ]}>
                  Health data access is required to display your activity metrics.
                </Text>
                <Button
                  mode="contained"
                  onPress={openHealthSettings}
                  style={[
                    styles.permissionButton,
                    {
                      marginVertical: getScaledFontSize(8),
                    }
                  ]}
                  buttonColor="#008080"
                  textColor="#ffffff"
                  labelStyle={{
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(600) as any,
                    paddingVertical: getScaledFontSize(4),
                  }}
                  contentStyle={{
                    paddingVertical: getScaledFontSize(8),
                  }}
                >
                  Enable Health Permissions
                </Button>
                <Text style={[
                  styles.permissionHintText,
                  {
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text + '80',
                    marginTop: getScaledFontSize(12),
                    textAlign: 'center',
                    paddingHorizontal: 8,
                    paddingTop: getScaledFontSize(4),
                    paddingBottom: getScaledFontSize(8),
                  }
                ]}>
                  Go to Settings → Privacy & Security → Health → CoS
                </Text>
              </View>
            </Card>
          ) : (
            // Show health metrics if we have data
            (healthMetrics.steps > 0 ||
             healthMetrics.heartRate !== null ||
             healthMetrics.sleepHours > 0 ||
             healthMetrics.caloriesBurned > 0) && (
              <Card style={[styles.healthMetricsCard, { backgroundColor: colors.background }]}>
                <Text style={[
                  styles.healthMetricsTitle,
                  {
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text,
                    marginBottom: 16,
                  }
                ]}>
                  Today&apos;s Health Metrics
                </Text>
                
                <View style={styles.healthMetricsGrid}>
                {/* Steps - Only show if steps > 0 */}
                {healthMetrics.steps > 0 && (
                  <View style={styles.healthMetricItem}>
                    <View style={styles.healthMetricIconContainer}>
                      <List.Icon icon="walk" color="#008080" />
                    </View>
                    <View style={styles.healthMetricContent}>
                      <Text style={[
                        styles.healthMetricValue,
                        {
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          color: colors.text,
                        }
                      ]}>
                        {healthMetrics.steps.toLocaleString()}
                      </Text>
                      <Text style={[
                        styles.healthMetricLabel,
                        {
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(400) as any,
                          color: colors.text + '80',
                        }
                      ]}>
                        Steps
                      </Text>
                    </View>
                  </View>
                )}

                {/* Heart Rate - Only show if heartRate is not null */}
                {healthMetrics.heartRate !== null && (
                  <View style={styles.healthMetricItem}>
                    <View style={styles.healthMetricIconContainer}>
                      <List.Icon icon="heart" color="#008080" />
                    </View>
                    <View style={styles.healthMetricContent}>
                      <Text style={[
                        styles.healthMetricValue,
                        {
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          color: colors.text,
                        }
                      ]}>
                        {Math.round(healthMetrics.heartRate)}
                      </Text>
                      <Text style={[
                        styles.healthMetricLabel,
                        {
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(400) as any,
                          color: colors.text + '80',
                        }
                      ]}>
                        Heart Rate (bpm)
                      </Text>
                    </View>
                  </View>
                )}

                {/* Sleep - Only show if sleepHours > 0 */}
                {healthMetrics.sleepHours > 0 && (
                  <View style={styles.healthMetricItem}>
                    <View style={styles.healthMetricIconContainer}>
                      <List.Icon icon="sleep" color="#008080" />
                    </View>
                    <View style={styles.healthMetricContent}>
                      <Text style={[
                        styles.healthMetricValue,
                        {
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          color: colors.text,
                        }
                      ]}>
                        {healthMetrics.sleepHours}h
                      </Text>
                      <Text style={[
                        styles.healthMetricLabel,
                        {
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(400) as any,
                          color: colors.text + '80',
                        }
                      ]}>
                        Sleep
                      </Text>
                    </View>
                  </View>
                )}

                {/* Calories - Only show if caloriesBurned > 0 */}
                {healthMetrics.caloriesBurned > 0 && (
                  <View style={styles.healthMetricItem}>
                    <View style={styles.healthMetricIconContainer}>
                      <List.Icon icon="fire" color="#008080" />
                    </View>
                    <View style={styles.healthMetricContent}>
                      <Text style={[
                        styles.healthMetricValue,
                        {
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          color: colors.text,
                        }
                      ]}>
                        {healthMetrics.caloriesBurned.toLocaleString()}
                      </Text>
                      <Text style={[
                        styles.healthMetricLabel,
                        {
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(400) as any,
                          color: colors.text + '80',
                        }
                      ]}>
                        Calories
                      </Text>
                    </View>
                  </View>
                )}
                </View>
              </Card>
            )
          )
        )}

        {/* Today's Progress and Today's Tasks — temporarily disabled
        <Card style={[styles.progressCard]}>
          ...
        </Card>
        <View style={styles.tasksSection}>
          ...
        </View>
        */}
      </ScrollView>
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
});

