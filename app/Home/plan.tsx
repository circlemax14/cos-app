import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { generateHealthSuggestions, AISuggestion, HealthSummary, MedicalReport, Appointment, DoctorDiagnosis, HealthMetricsData } from '@/services/openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProgressBar } from '@/components/ui/progress-bar';
import { HealthMetricCard } from '@/components/ui/health-metric-card';
import { GrowthChart, DataPoint } from '@/components/ui/growth-chart';
import { TreatmentProgress, TreatmentGoal } from '@/components/ui/treatment-progress';
import { initializeHealthKit, getTodayHealthMetrics, HealthMetrics } from '@/services/health';
import { transformFastenHealthData } from '@/services/fasten-health';

// Helper function to extract numeric value from findings
const extractValue = (finding: string, pattern: RegExp): number | null => {
  const match = finding.match(pattern);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  return null;
};

// Helper function to format date for display
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function PlanScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthSummary | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetricsData | null>(null);
  const [hasAskedAboutHealthData, setHasAskedAboutHealthData] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

  // Parse medical reports to extract metrics for visualization
  const parsedMetrics = useMemo(() => {
    if (!healthData) return null;

    const reports = healthData.medicalReports;
    
    // Extract HbA1c values
    const hba1cData: DataPoint[] = [];
    reports.forEach((report) => {
      report.findings.forEach((finding) => {
        const value = extractValue(finding, /HbA1c:\s*([\d.]+)%/i);
        if (value !== null) {
          hba1cData.push({
            label: formatDate(report.date),
            value,
            unit: '%',
          });
        }
      });
    });

    // Extract Cholesterol values
    const cholesterolData: DataPoint[] = [];
    reports.forEach((report) => {
      report.findings.forEach((finding) => {
        const value = extractValue(finding, /Total Cholesterol:\s*([\d.]+)\s*mg\/dL/i);
        if (value !== null) {
          cholesterolData.push({
            label: formatDate(report.date),
            value,
            unit: ' mg/dL',
          });
        }
      });
    });

    // Extract HDL values
    const hdlData: DataPoint[] = [];
    reports.forEach((report) => {
      report.findings.forEach((finding) => {
        const value = extractValue(finding, /HDL:\s*([\d.]+)\s*mg\/dL/i);
        if (value !== null) {
          hdlData.push({
            label: formatDate(report.date),
            value,
            unit: ' mg/dL',
          });
        }
      });
    });

    // Extract Blood Pressure (systolic)
    const bpData: DataPoint[] = [];
    reports.forEach((report) => {
      report.findings.forEach((finding) => {
        const match = finding.match(/Blood Pressure:\s*(\d+)\/(\d+)\s*mmHg/i);
        if (match && match[1]) {
          bpData.push({
            label: formatDate(report.date),
            value: parseFloat(match[1]),
            unit: ' mmHg',
          });
        }
      });
    });

    // Get latest values for metric cards
    const latestReport = reports[reports.length - 1];
    const latestHbA1c = hba1cData[hba1cData.length - 1]?.value;
    const latestCholesterol = cholesterolData[cholesterolData.length - 1]?.value;
    const latestHDL = hdlData[hdlData.length - 1]?.value;
    const latestBP = bpData[bpData.length - 1]?.value;

    // Calculate treatment progress (mock - in real app, calculate based on actual progress)
    const treatmentGoals: TreatmentGoal[] = healthData.treatmentPlan.goals.map((goal, index) => ({
      goal,
      progress: Math.min(100, (index + 1) * 30 + Math.random() * 20), // Mock progress
      status: index === 0 ? 'on-track' : index === 1 ? 'needs-attention' : 'completed',
    }));

    return {
      hba1cData: hba1cData.sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime()),
      cholesterolData: cholesterolData.sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime()),
      hdlData: hdlData.sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime()),
      bpData: bpData.sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime()),
      latestHbA1c,
      latestCholesterol,
      latestHDL,
      latestBP,
      treatmentGoals,
    };
  }, [healthData]);

  // Ask user if they want to include health data
  const askAboutHealthData = useCallback((): Promise<HealthMetricsData | null> => {
    return new Promise((resolve) => {
      if (hasAskedAboutHealthData) {
        resolve(healthMetrics);
        return;
      }

      if (Platform.OS !== 'ios') {
        // HealthKit is only available on iOS
        setHasAskedAboutHealthData(true);
        resolve(null);
        return;
      }

      Alert.alert(
        'Include Health App Data?',
        'Would you like to include your Health app data (steps, sleep, calories, and heart rate) in the AI analysis? This can provide more personalized insights.',
        [
          {
            text: 'No Thanks',
            style: 'cancel',
            onPress: () => {
              setHasAskedAboutHealthData(true);
              resolve(null);
            },
          },
          {
            text: 'Yes, Include It',
            onPress: async () => {
              setHasAskedAboutHealthData(true);
              setIsRequestingPermissions(true);
              try {
                // Initialize HealthKit and request permissions
                await initializeHealthKit();
                
                // Fetch health metrics
                const metrics = await getTodayHealthMetrics();
                
                if (metrics.error) {
                  // Permissions were denied or error occurred
                  console.log('❌ Health metrics error:', metrics.error);
                  setHealthMetrics(null);
                  resolve(null);
                } else {
                  // Successfully fetched health metrics
                  const healthData: HealthMetricsData = {
                    steps: metrics.steps,
                    heartRate: metrics.heartRate,
                    sleepHours: metrics.sleepHours,
                    caloriesBurned: metrics.caloriesBurned,
                  };
                  
                  // Log the fetched health data
                  console.log('✅ Health metrics fetched successfully:', {
                    steps: healthData.steps,
                    heartRate: healthData.heartRate,
                    sleepHours: healthData.sleepHours,
                    caloriesBurned: healthData.caloriesBurned,
                    hasData: healthData.steps > 0 || healthData.heartRate !== null || healthData.sleepHours > 0 || healthData.caloriesBurned > 0,
                  });
                  
                  setHealthMetrics(healthData);
                  resolve(healthData);
                }
              } catch (err) {
                console.error('Error fetching health metrics:', err);
                setHealthMetrics(null);
                resolve(null);
              } finally {
                setIsRequestingPermissions(false);
              }
            },
          },
        ],
        { 
          cancelable: true,
          onDismiss: () => {
            setHasAskedAboutHealthData(true);
            resolve(null);
          },
        }
      );
    });
  }, [hasAskedAboutHealthData, healthMetrics]);

  const loadAISuggestions = useCallback(async (isRefresh = false) => {
    try {
      console.log('loadAISuggestions called, isRefresh:', isRefresh);
      if (isRefresh) {
        setIsRefreshing(true);
        console.log('Setting isRefreshing to true');
        // Keep previous content visible during refresh for better UX
      } else {
        setIsLoading(true);
      }
      setError(null);
      
      // Ask about health data on first load and wait for response
      let metricsToUse = healthMetrics;
      if (!hasAskedAboutHealthData && !isRefresh) {
        metricsToUse = await askAboutHealthData();
      }
      
      // Load health data from Fasten Health API
      let healthDataToUse: HealthSummary;
      try {
        healthDataToUse = await transformFastenHealthData();
        if (!healthDataToUse.medicalReports || healthDataToUse.medicalReports.length === 0) {
          console.log('Fasten Health data is empty — no medical reports available yet');
        } else {
          console.log(`Loaded ${healthDataToUse.medicalReports.length} medical reports from Fasten Health`);
        }
      } catch (error) {
        console.error('Error loading Fasten Health data:', error);
        setError('Unable to load your health data. Please try again later.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      
      setHealthData(healthDataToUse);
      
      // Log health metrics being sent to OpenAI
      if (metricsToUse) {
        console.log('📊 Sending health metrics to OpenAI:', {
          steps: metricsToUse.steps,
          heartRate: metricsToUse.heartRate,
          sleepHours: metricsToUse.sleepHours,
          caloriesBurned: metricsToUse.caloriesBurned,
          hasMeaningfulData: metricsToUse.steps > 0 || metricsToUse.heartRate !== null || metricsToUse.sleepHours > 0 || metricsToUse.caloriesBurned > 0,
        });
      } else {
        console.log('📊 No health metrics to send to OpenAI');
      }
      
      console.log('Calling generateHealthSuggestions with isRefresh:', isRefresh, 'healthMetrics:', metricsToUse);
      // Pass isRefresh flag and health metrics to get fresh, varied responses on each refresh
      const suggestion = await generateHealthSuggestions(healthDataToUse, isRefresh, metricsToUse);
      console.log('Received suggestion from OpenAI:', suggestion);
      // Replace content with fresh AI-generated response
      setAiSuggestion(suggestion);
    } catch (err) {
      console.error('Error loading AI suggestions:', err);
      setError(err instanceof Error ? err.message : 'Unable to load health suggestions. Please try again later.');
      // On error during refresh, don't clear existing content
      if (!isRefresh) {
        setAiSuggestion(null);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      console.log('loadAISuggestions completed');
    }
  }, [hasAskedAboutHealthData, askAboutHealthData, healthMetrics]);

  useEffect(() => {
    loadAISuggestions();
  }, [loadAISuggestions]);

  const onRefresh = useCallback(async () => {
    console.log('Pull to refresh triggered');
    await loadAISuggestions(true);
  }, [loadAISuggestions]);

  return (
      <View style={styles.screenContainer}>
        <ScrollView 
          style={[styles.container, { backgroundColor: colors.background }]} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
        >
        {/* AI Health Summary Section - Senior-Friendly Design */}
        <View style={styles.aiSection}>
          <View style={styles.aiSectionContent}>
          <View style={styles.aiHeader}>
              <View style={[styles.iconContainer, { backgroundColor: settings.isDarkTheme ? '#2a2a2a' : '#e8f4f8' }]}>
                <IconSymbol name="sparkles" size={getScaledFontSize(40)} color={colors.tint} />
              </View>
              <View style={styles.headerTextContainer}>
                <Text style={[
                  styles.aiTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(24),
                    fontWeight: getScaledFontWeight(700) as any,
                  }
                ]}>
                  Your Health Summary
                </Text>
                <Text style={[
                  styles.aiSubtitle,
                  {
                    color: colors.icon,
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(400) as any,
                    marginTop: getScaledFontSize(4),
                  }
                ]}>
                  AI-powered insights based on your treatment plan
                  {healthMetrics && (healthMetrics.steps > 0 || healthMetrics.heartRate !== null || healthMetrics.sleepHours > 0 || healthMetrics.caloriesBurned > 0) && (
                    <Text style={{ color: colors.tint, fontWeight: getScaledFontWeight(600) as any }}> • Includes Health App data</Text>
                  )}
                </Text>
              </View>
            </View>

            {isLoading && !isRefreshing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text style={[
                  styles.loadingText,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(20),
                    fontWeight: getScaledFontWeight(500) as any,
                    marginTop: getScaledFontSize(20),
                  }
                ]}>
                  Analyzing your health information...
                </Text>
                <Text style={[
                  styles.loadingSubtext,
                  {
                    color: colors.icon,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(400) as any,
                    marginTop: getScaledFontSize(8),
                    textAlign: 'center',
                  }
                ]}>
                  This may take a few moments
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <View style={[styles.errorIconContainer, { backgroundColor: settings.isDarkTheme ? '#3a1a1a' : '#ffeaea' }]}>
                  <Icon source="alert-circle" size={getScaledFontSize(48)} color="#ff4444" />
                </View>
                <Text style={[
                  styles.errorText,
                  {
                    color: '#ff4444',
                    fontSize: getScaledFontSize(20),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginTop: getScaledFontSize(16),
                    textAlign: 'center',
                  }
                ]}>
                  Unable to Load Summary
                </Text>
                <Text style={[
                  styles.errorDetail,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(18),
                    fontWeight: getScaledFontWeight(400) as any,
                    marginTop: getScaledFontSize(8),
                    textAlign: 'center',
                    paddingHorizontal: getScaledFontSize(16),
                  }
                ]}>
                  {error}
                </Text>
                <Button
                  mode="contained"
                  onPress={() => loadAISuggestions(false)}
                  style={[styles.retryButton, { marginTop: getScaledFontSize(24) }]}
                  buttonColor={colors.tint}
                  contentStyle={styles.buttonContent}
                >
                  <Text style={[
                    {
                      fontSize: getScaledFontSize(18),
                      fontWeight: getScaledFontWeight(600) as any,
                    }
                  ]}>
                    Try Again
                  </Text>
                </Button>
              </View>
            ) : aiSuggestion ? (
              <View style={[
                styles.suggestionsContainer,
                isRefreshing && styles.contentBehindOverlay
              ]}>
                {/* Summary Section */}
                <View style={[styles.suggestionBlock, styles.summaryBlock]}>
                  <View style={styles.blockHeader}>
                    <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#2a2a2a' : '#e8f4f8' }]}>
                      <Icon source="file-document" size={getScaledFontSize(32)} color={colors.tint} />
                    </View>
                    <Text style={[
                      styles.blockTitle,
                      {
                        color: colors.text,
                        fontSize: getScaledFontSize(20),
                        fontWeight: getScaledFontWeight(700) as any,
                        marginLeft: getScaledFontSize(12),
                      }
                    ]}>
                      Overview
                    </Text>
                  </View>
                  <View style={[styles.summaryContent, { 
                    marginTop: getScaledFontSize(12),
                  }]}>
                    <Text style={[
                      styles.summaryText,
                      {
                        color: colors.text,
                        fontSize: getScaledFontSize(19),
                        fontWeight: getScaledFontWeight(400) as any,
                        lineHeight: getScaledFontSize(30),
                      }
                    ]}>
                      {aiSuggestion.summary}
                    </Text>
                  </View>
                </View>

                {/* Key Points Section */}
                {aiSuggestion.keyPoints.length > 0 && (
                  <View style={styles.suggestionBlock}>
                    <View style={styles.blockHeader}>
                      <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#1a2e1a' : '#e8f5e9' }]}>
                        <Icon source="check-circle" size={getScaledFontSize(32)} color="#4caf50" />
                      </View>
                      <Text style={[
                        styles.blockTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          marginLeft: getScaledFontSize(12),
                        }
                      ]}>
                        Important Points to Remember
                      </Text>
                    </View>
                    <View style={styles.listContainer}>
                      {aiSuggestion.keyPoints.map((point, index) => (
                        <View key={index} style={[styles.listItem, {
                          marginBottom: getScaledFontSize(8),
                        }]}>
                          <View style={[styles.bulletPoint, { backgroundColor: colors.tint }]}>
                            <Text style={[styles.bulletNumber, {
                              color: '#fff',
                              fontSize: getScaledFontSize(16),
                              fontWeight: getScaledFontWeight(700) as any,
                            }]}>
                              {index + 1}
                            </Text>
                          </View>
                          <Text style={[
                            styles.listText,
                            {
                              color: colors.text,
                              fontSize: getScaledFontSize(19),
                              fontWeight: getScaledFontWeight(500) as any,
                              lineHeight: getScaledFontSize(30),
                              flex: 1,
                              marginLeft: getScaledFontSize(12),
                            }
                          ]}>
                            {point}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Recommendations Section */}
                {aiSuggestion.recommendations.length > 0 && (
                  <View style={styles.suggestionBlock}>
                    <View style={styles.blockHeader}>
                      <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#2a241a' : '#fff8e1' }]}>
                        <Icon source="lightbulb" size={getScaledFontSize(32)} color="#ff9800" />
                      </View>
                      <Text style={[
                        styles.blockTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          marginLeft: getScaledFontSize(12),
                        }
                      ]}>
                        Daily Recommendations
                      </Text>
                    </View>
                    <View style={styles.listContainer}>
                      {aiSuggestion.recommendations.map((rec, index) => (
                        <View key={index} style={[styles.listItem, {
                          marginBottom: getScaledFontSize(8),
                        }]}>
                          <View style={[styles.recommendationIcon, { backgroundColor: colors.tint }]}>
                            <Icon source="arrow-right" size={getScaledFontSize(20)} color="#fff" />
                          </View>
                          <Text style={[
                            styles.listText,
                            {
                              color: colors.text,
                              fontSize: getScaledFontSize(19),
                              fontWeight: getScaledFontWeight(500) as any,
                              lineHeight: getScaledFontSize(30),
                              flex: 1,
                              marginLeft: getScaledFontSize(12),
                            }
                          ]}>
                            {rec}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Treatment Progress Section */}
                {healthData && parsedMetrics && (
                  <View style={styles.suggestionBlock}>
                    <TreatmentProgress
                      planTitle={healthData.treatmentPlan.plan}
                      duration={healthData.treatmentPlan.duration}
                      overallProgress={65}
                      goals={parsedMetrics.treatmentGoals}
                    />
                  </View>
                )}

                {/* Health Metrics Cards Section */}
                {healthData && parsedMetrics && (
                  <View style={styles.suggestionBlock}>
                    <View style={styles.blockHeader}>
                      <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#1a2e1a' : '#e8f5e9' }]}>
                        <Icon source="chart-line" size={getScaledFontSize(32)} color="#4caf50" />
                      </View>
                      <Text style={[
                        styles.blockTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          marginLeft: getScaledFontSize(12),
                        }
                      ]}>
                        Key Health Metrics
                      </Text>
                    </View>
                    <View style={styles.metricsGrid}>
                      {parsedMetrics.latestHbA1c !== undefined && (
                        <HealthMetricCard
                          title="HbA1c"
                          value={parsedMetrics.latestHbA1c.toFixed(1)}
                          unit="%"
                          status={parsedMetrics.latestHbA1c < 7 ? 'good' : parsedMetrics.latestHbA1c < 8 ? 'warning' : 'critical'}
                          icon="water"
                          trend={parsedMetrics.hba1cData.length > 1 ? 
                            `Trend: ${parsedMetrics.hba1cData[parsedMetrics.hba1cData.length - 1].value < parsedMetrics.hba1cData[0].value ? '↓ Improving' : '↑ Needs attention'}` : 
                            undefined}
                          target="< 7.0%"
                        />
                      )}
                      {parsedMetrics.latestCholesterol !== undefined && (
                        <HealthMetricCard
                          title="Total Cholesterol"
                          value={parsedMetrics.latestCholesterol.toString()}
                          unit="mg/dL"
                          status={parsedMetrics.latestCholesterol < 200 ? 'good' : parsedMetrics.latestCholesterol < 240 ? 'warning' : 'critical'}
                          icon="favorite"
                          trend={parsedMetrics.cholesterolData.length > 1 ? 
                            `Trend: ${parsedMetrics.cholesterolData[parsedMetrics.cholesterolData.length - 1].value < parsedMetrics.cholesterolData[0].value ? '↓ Improving' : '↑ Needs attention'}` : 
                            undefined}
                          target="< 200 mg/dL"
                        />
                      )}
                      {parsedMetrics.latestHDL !== undefined && (
                        <HealthMetricCard
                          title="HDL Cholesterol"
                          value={parsedMetrics.latestHDL.toString()}
                          unit="mg/dL"
                          status={parsedMetrics.latestHDL >= 60 ? 'good' : parsedMetrics.latestHDL >= 40 ? 'normal' : 'warning'}
                          icon="favorite-border"
                          trend={parsedMetrics.hdlData.length > 1 ? 
                            `Trend: ${parsedMetrics.hdlData[parsedMetrics.hdlData.length - 1].value > parsedMetrics.hdlData[0].value ? '↑ Improving' : '↓ Needs attention'}` : 
                            undefined}
                          target="> 60 mg/dL"
                        />
                      )}
                      {parsedMetrics.latestBP !== undefined && (
                        <HealthMetricCard
                          title="Blood Pressure"
                          value={parsedMetrics.latestBP.toString()}
                          unit="mmHg"
                          status={parsedMetrics.latestBP < 120 ? 'good' : parsedMetrics.latestBP < 130 ? 'normal' : 'warning'}
                          icon="favorite"
                          target="< 120 mmHg"
                        />
                      )}
                    </View>
                  </View>
                )}

                {/* Growth Charts Section */}
                {healthData && parsedMetrics && (
                  <View style={styles.suggestionBlock}>
                    <View style={styles.blockHeader}>
                      <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#1a1a2e' : '#e3f2fd' }]}>
                        <Icon source="chart-bar" size={getScaledFontSize(32)} color={colors.tint} />
                      </View>
                      <Text style={[
                        styles.blockTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          marginLeft: getScaledFontSize(12),
                        }
                      ]}>
                        Health Trends
                      </Text>
                    </View>
                    {parsedMetrics.hba1cData.length > 1 && (
                      <View style={styles.chartContainer}>
                        <GrowthChart
                          title="HbA1c Trend"
                          data={parsedMetrics.hba1cData}
                          unit="%"
                          type="line"
                          color="#0a7ea4"
                          minValue={6}
                          maxValue={8}
                        />
                      </View>
                    )}
                    {parsedMetrics.cholesterolData.length > 1 && (
                      <View style={styles.chartContainer}>
                        <GrowthChart
                          title="Total Cholesterol Trend"
                          data={parsedMetrics.cholesterolData}
                          unit=" mg/dL"
                          type="line"
                          color="#ff9800"
                          minValue={150}
                          maxValue={250}
                        />
                      </View>
                    )}
                    {parsedMetrics.hdlData.length > 1 && (
                      <View style={styles.chartContainer}>
                        <GrowthChart
                          title="HDL Cholesterol Trend"
                          data={parsedMetrics.hdlData}
                          unit=" mg/dL"
                          type="bar"
                          color="#4caf50"
                          minValue={30}
                          maxValue={70}
                        />
                      </View>
                    )}
                    {parsedMetrics.bpData.length > 1 && (
                      <View style={styles.chartContainer}>
                        <GrowthChart
                          title="Blood Pressure Trend"
                          data={parsedMetrics.bpData}
                          unit=" mmHg"
                          type="line"
                          color="#ff4444"
                          minValue={100}
                          maxValue={140}
                        />
                      </View>
                    )}
                  </View>
                )}

                {/* Warnings Section */}
                {aiSuggestion.warnings.length > 0 && (
                  <View style={styles.suggestionBlock}>
                    <View style={styles.blockHeader}>
                      <View style={[styles.blockIconContainer, { backgroundColor: settings.isDarkTheme ? '#4a1a1a' : '#ffeb3b' }]}>
                        <Icon source="alert" size={getScaledFontSize(32)} color="#ff4444" />
                      </View>
                      <Text style={[
                        styles.blockTitle,
                        {
                          color: '#ff4444',
                          fontSize: getScaledFontSize(20),
                          fontWeight: getScaledFontWeight(700) as any,
                          marginLeft: getScaledFontSize(12),
                        }
                      ]}>
                        Important Warnings
                      </Text>
                    </View>
                    <View style={styles.listContainer}>
                      {aiSuggestion.warnings.map((warning, index) => (
                        <View key={index} style={[styles.listItem, {
                          marginBottom: getScaledFontSize(8),
                          borderLeftWidth: 4,
                          borderLeftColor: '#ff4444',
                          paddingLeft: getScaledFontSize(12),
                        }]}>
                          <Icon source="alert-circle" size={getScaledFontSize(28)} color="#ff4444" />
                          <Text style={[
                            styles.listText,
                            {
                              color: colors.text,
                              fontSize: getScaledFontSize(19),
                              fontWeight: getScaledFontWeight(600) as any,
                              lineHeight: getScaledFontSize(30),
                              flex: 1,
                              marginLeft: getScaledFontSize(12),
                            }
                          ]}>
                            {warning}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ) : null}

          </View>
        </View>
      </ScrollView>

      {/* Full Screen Refresh Overlay */}
      {isRefreshing && aiSuggestion && (
        <View style={[
          styles.fullScreenOverlay,
          {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }
        ]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[
            styles.overlayText,
            {
              color: '#ffffff',
              fontSize: getScaledFontSize(20),
              fontWeight: getScaledFontWeight(500) as any,
              marginTop: getScaledFontSize(20),
            }
          ]}>
            Analyze your health info
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 60,
    flexGrow: 1,
  },
  visualizationSection: {
    marginBottom: 16,
    padding: 0,
  },
  aiSection: {
    marginBottom: 0,
    padding: 0,
    position: 'relative',
  },
  aiSectionContent: {
    position: 'relative',
  },
  sectionTitle: {
    marginBottom: 16,
  },
  metricsGrid: {
    gap: 16,
  },
  chartContainer: {
    marginBottom: 24,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  refreshIndicatorOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  refreshLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  refreshLoadingText: {
    marginLeft: 8,
  },
  aiTitle: {
    flex: 1,
  },
  aiSubtitle: {
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    textAlign: 'center',
  },
  loadingSubtext: {
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    paddingHorizontal: 16,
  },
  errorDetail: {
    paddingHorizontal: 16,
  },
  retryButton: {
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 180,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  suggestionsContainer: {
    gap: 28,
  },
  contentBehindOverlay: {
    opacity: 0.3,
  },
  fullScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  overlayText: {
    textAlign: 'center',
  },
  suggestionBlock: {
    marginBottom: 20,
  },
  summaryBlock: {
    marginBottom: 0,
  },
  summaryContent: {
    marginTop: 12,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  blockIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTitle: {
    flex: 1,
  },
  summaryText: {
    textAlign: 'left',
  },
  listContainer: {
    marginTop: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletPoint: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulletNumber: {
    textAlign: 'center',
  },
  recommendationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listText: {
    flex: 1,
  },
});
