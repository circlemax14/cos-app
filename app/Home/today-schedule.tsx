import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform, AppState, RefreshControl } from 'react-native';
import { Avatar, Card, IconButton, List, Button } from 'react-native-paper';
import { getTodayHealthMetrics, HealthMetrics } from '@/services/health';
import { fetchPatientInfo, fetchMedications } from '@/services/api/patient';
import type { Medication } from '@/services/api/types';
import { InitialsAvatar } from '@/utils/avatar-utils';

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
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
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
        }
      } catch {
        // Patient data failed to load
      } finally {
        setIsLoadingPatient(false);
      }
    };

    const loadMedications = async () => {
      try {
        const meds = await fetchMedications();
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
    
    // TEMPORARILY DISABLE HealthKit initialization on mount to prevent crashes
    // HealthKit initialization is causing crashes - we'll make it optional/lazy
    // Users can manually refresh to load health data if needed
    console.log('⚠️ HealthKit initialization disabled on mount to prevent crashes');
    
    // Set initial state without loading
    setHealthMetrics({
      steps: 0,
      heartRate: null,
      sleepHours: 0,
      caloriesBurned: 0,
      isLoading: false,
      error: null, // No error - just not loaded yet
    });

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (!isMounted) return;
      
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - don't auto-load health data
        console.log('🔄 App came to foreground');
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
            <InitialsAvatar name={patientName} size={getScaledFontSize(80)} />
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

        {/* Medications Section */}
        <Card style={[styles.medicationsCard, { backgroundColor: colors.background }]}>
          <Text style={[
            styles.medicationsTitle,
            {
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
              marginBottom: 12,
            }
          ]}>
            Current Medications
          </Text>
          {medications.map((medication, index) => (
            <View 
              key={index} 
              style={[
                styles.medicationItem,
                index < medications.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.text + '20',
                }
              ]}
            >
              <View style={styles.medicationIconContainer}>
                <List.Icon icon="pill" color="#008080" />
              </View>
              <View style={styles.medicationContent}>
                <Text style={[
                  styles.medicationName,
                  {
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text,
                    marginBottom: 4,
                  }
                ]}>
                  {medication.name}
                </Text>
                <Text style={[
                  styles.medicationDosage,
                  {
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(500) as any,
                    color: colors.text,
                    marginBottom: 2,
                  }
                ]}>
                  {medication.dosage} • {medication.frequency}
                </Text>
                <Text style={[
                  styles.medicationPurpose,
                  {
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(400) as any,
                    color: colors.text + '80',
                  }
                ]}>
                  {medication.purpose}
                </Text>
              </View>
            </View>
          ))}
        </Card>

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

        {/* Progress Section */}
        <Card style={[styles.progressCard]}>
          <View style={styles.progressContent}>
            <Text style={[
              styles.progressTitle,
              {
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
                marginBottom: 8,
              }
            ]}>
              Today&apos;s Progress
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${progress}%`,
                    }
                  ]} 
                />
              </View>
              <Text style={[
                styles.progressText,
                {
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(500) as any,
                  marginTop: 4,
                }
              ]}>
                {completedCount} of {tasks.length} completed
              </Text>
            </View>
          </View>
        </Card>

        {/* Tasks List */}
        <View style={styles.tasksSection}>
          <Text style={[
            styles.sectionTitle,
            {
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
            }
          ]}>
            Today&apos;s Tasks
          </Text>
          
          {tasks.map((task, index) => (
            <TouchableOpacity 
              key={task.id}
              onPress={() => toggleTaskCompletion(task.id)}
              activeOpacity={0.7}
            >
              <Card 
                style={[
                  styles.taskCard, 
                  { 
                    borderLeftWidth: 4,
                    borderLeftColor: '#008080'
                  }
                ]}
              >
                <View style={styles.taskContent}>
                <View style={styles.taskLeft}>
                  <List.Icon 
                    icon={task.icon} 
                    color={'#008080'}
                  />
                  <View style={styles.taskDetails}>
                    <Text style={[
                      styles.taskTime,
                      {
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(500) as any,
                      }
                    ]}>
                      {task.time}
                    </Text>
                    <Text 
                      numberOfLines={2}
                      style={[
                        styles.taskTitle,
                        {
                          fontSize: getScaledFontSize(16),
                          fontWeight: task.completed 
                            ? settings.isBoldTextEnabled ? '700' : '600' 
                            : '600',
                          textDecorationLine: task.completed ? 'line-through' : 'none',
                        }
                      ]}>
                      {task.title}
                    </Text>
                    <Text 
                      numberOfLines={3}
                      style={[
                        styles.taskDescription,
                        {
                          fontSize: getScaledFontSize(14),
                          fontWeight: settings.isBoldTextEnabled ? '500' : '400',
                        }
                      ]}>
                      {task.description}
                    </Text>
                  </View>
                </View>
                {task.completed ? (
                  <IconButton 
                    icon="check-circle" 
                    iconColor={'#008080'} 
                    size={28}
                  />
                ) : (
                  <IconButton 
                    icon="circle-outline" 
                    iconColor={'#008080'}
                    size={28}
                  />
                )}
              </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
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
    width: 40,
    height: 40,
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
    alignItems: 'center',
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
    lineHeight: 20,
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
    lineHeight: 18,
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
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(10, 126, 164, 0.1)',
  },
  healthMetricIconContainer: {
    marginRight: 12,
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
  medicationsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  medicationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  medicationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  medicationIconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  medicationContent: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  medicationPurpose: {
    fontSize: 12,
  },
});

