import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, SafeAreaView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { Card } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Checkbox } from 'expo-checkbox';
import { generateHistorySummaries, HistorySummary, PatientHistoryData, generateReportSummary, ReportSummary } from '@/services/openai';
import { fetchReports } from '@/services/api/reports';
import type { Report } from '@/services/api/types';

export default function Reports() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const historyScrollViewRef = useRef<ScrollView>(null);

  // Main tab: 'reports' or 'history'
  const [mainTab, setMainTab] = useState<'reports' | 'history'>('reports');
  // Reports tab state
  const [activeTab, setActiveTab] = useState('all');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  
  // History tab state
  const [historySubTab, setHistorySubTab] = useState<'medical' | 'psychiatric' | 'psychological' | 'social'>('medical');
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  // Fasten Health reports state
  const [fastenReports, setFastenReports] = useState<Report[]>([]);
  const [, setIsLoadingFastenReports] = useState(false);
  
  // Load reports on mount
  useEffect(() => {
    const loadReports = async () => {
      setIsLoadingFastenReports(true);
      try {
        const reports = await fetchReports();
        setFastenReports(reports);
      } catch {
        setFastenReports([]);
      } finally {
        setIsLoadingFastenReports(false);
      }
    };
    loadReports();
  }, []);

  const tabs = [
    { id: 'all', label: 'All Reports' },
    { id: 'lab', label: 'Lab Reports' },
    { id: 'imaging', label: 'Imaging' },
    { id: 'medical', label: 'Medical Records' },
    { id: 'pathology', label: 'Pathology' },
  ];

  const categories = [
    'Lab Reports',
    'Imaging',
    'Medical Records',
    'Pathology',
    'Radiology',
  ];

  const providers = useMemo(() => {
    const reportsToUse = fastenReports;
    return Array.from(
      new Set(
        reportsToUse
          .map(report => report.provider)
          .filter((provider): provider is string => Boolean(provider))
      )
    ).sort();
  }, [fastenReports]);

  const categoryMap: { [key: string]: string } = {
    all: 'All Reports',
    lab: 'Lab Reports',
    imaging: 'Imaging',
    medical: 'Medical Records',
    pathology: 'Pathology',
  };

  const toggleProvider = (provider: string) => {
    setSelectedProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const renderFilterModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    options: string[],
    selectedItems: string[],
    onToggle: (item: string) => void
  ) => (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
            {title}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          {options.map((option) => {
            const isSelected = selectedItems.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[styles.checkboxRow, { borderBottomColor: colors.text + '20' }]}
                onPress={() => onToggle(option)}
              >
                <Checkbox
                  value={isSelected}
                  onValueChange={() => onToggle(option)}
                  color={isSelected ? '#008080' : undefined}
                />
                <Text style={[styles.checkboxLabel, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const getFilteredReports = () => {
    let filtered = fastenReports;

    // Filter by active tab category
    if (activeTab !== 'all') {
      const categoryName = categoryMap[activeTab];
      filtered = filtered.filter(report => report.category === categoryName);
    }

    // Filter by selected providers
    if (selectedProviders.length > 0) {
      filtered = filtered.filter(report => selectedProviders.includes(report.provider));
    }

    // Filter by selected categories
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(report => selectedCategories.includes(report.category));
    }

    return filtered;
  };

  const handleTabPress = (tabId: string) => {
    setActiveTab(tabId);
    
    // Auto-scroll to center the active tab
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex !== -1 && scrollViewRef.current) {
      const tabWidth = 120 + 40; // minWidth + paddingHorizontal * 2
      const scrollPosition = Math.max(0, (tabIndex * tabWidth) - (tabWidth / 2));
      
      scrollViewRef.current.scrollTo({
        x: scrollPosition,
        animated: true,
      });
    }
  };

  const handleHistorySubTabPress = (subTabId: 'medical' | 'psychiatric' | 'psychological' | 'social') => {
    setHistorySubTab(subTabId);
    
    // Auto-scroll to center the active sub-tab
    const subTabIndex = historySubTabs.findIndex(tab => tab.id === subTabId);
    if (subTabIndex !== -1 && historyScrollViewRef.current) {
      const tabWidth = 120 + 40; // minWidth + paddingHorizontal * 2
      const scrollPosition = Math.max(0, (subTabIndex * tabWidth) - (tabWidth / 2));
      
      historyScrollViewRef.current.scrollTo({
        x: scrollPosition,
        animated: true,
      });
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedReport) return;

    setIsGeneratingSummary(true);
    setSummaryError(null);

    try {
      const summary = await generateReportSummary({
        title: selectedReport.title,
        date: selectedReport.date,
        provider: selectedReport.provider,
        exam: selectedReport.exam,
        clinicalHistory: selectedReport.clinicalHistory,
        technique: selectedReport.technique,
        findings: selectedReport.findings,
        impression: selectedReport.impression,
        interpretedBy: selectedReport.interpretedBy,
      });
      setReportSummary(summary);
    } catch (error) {
      console.error('Error generating report summary:', error);
      setSummaryError(error instanceof Error ? error.message : 'Unable to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Reset summary when modal closes or report changes
  useEffect(() => {
    if (!showReportModal || !selectedReport) {
      setReportSummary(null);
      setSummaryError(null);
    }
  }, [showReportModal, selectedReport]);

  // Load history data and generate summaries
  const loadHistorySummaries = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshingHistory(true);
    } else {
      setIsLoadingHistory(true);
    }
    setHistoryError(null);

    try {
      // Gather patient data from various sources (in a real app, this would come from your API)
      const historyData: PatientHistoryData = {
        currentTreatmentPlan: {
          plan: 'Diabetes management and cardiovascular health monitoring',
          duration: '12 months',
          goals: ['Maintain blood sugar levels', 'Reduce cardiovascular risk', 'Improve overall wellness'],
        },
        previousTreatmentPlan: {
          plan: 'Acute lower back pain with suspected disc involvement',
          duration: '3 months',
          goals: ['Pain management', 'Improve mobility', 'Reduce inflammation'],
        },
        currentMedications: [
          {
            name: 'Metformin',
            dosage: '500mg',
            frequency: 'Twice daily with meals',
            purpose: 'Diabetes management',
          },
          {
            name: 'Lisinopril',
            dosage: '10mg',
            frequency: 'Once daily in the morning',
            purpose: 'Blood pressure control',
          },
          {
            name: 'Aspirin',
            dosage: '81mg',
            frequency: 'Once daily',
            purpose: 'Cardiovascular protection',
          },
        ],
        previousMedications: [
          {
            name: 'Ibuprofen',
            dosage: '400mg',
            frequency: 'As needed',
            purpose: 'Pain relief',
          },
          {
            name: 'Acetaminophen',
            dosage: '500mg',
            frequency: 'As needed',
            purpose: 'Pain management',
          },
        ],
        reports: fastenReports.map(report => ({
          title: report.title,
          category: report.category,
          date: report.date,
          findings: report.findings,
          impression: report.impression,
          description: report.description,
        })),
        providerNotes: [
          {
            date: 'Nov 18, 2024',
            author: 'Dr. Max K.',
            note: 'Patient shows significant improvement in range of motion. Lower back pain has decreased from 7/10 to 4/10. Patient is responding well to physical therapy exercises. Continue with current treatment plan.',
            providerSpecialty: 'Orthopedist',
          },
          {
            date: 'Nov 11, 2024',
            author: 'Dr. Max K.',
            note: 'Follow-up appointment completed. Patient reports moderate pain relief with current medication regimen. Muscle tension has improved. Recommended continuation of weekly physical therapy sessions.',
            providerSpecialty: 'Orthopedist',
          },
          {
            date: 'Nov 20, 2024',
            author: 'Dr. Sarah Johnson',
            note: 'Patient showing good progress with medication adherence. Blood pressure readings are stable.',
            providerSpecialty: 'Cardiologist',
          },
          {
            date: 'Nov 25, 2024',
            author: 'Dr. Michael Chen',
            note: 'HbA1c levels have decreased from 7.2% to 6.8%. Continue current medication regimen.',
            providerSpecialty: 'Endocrinologist',
          },
        ],
        appointments: [
          {
            id: '1',
            date: '2024-11-20',
            time: '10:00 AM',
            type: 'Follow-up',
            status: 'Completed',
            doctorName: 'Dr. Sarah Johnson',
            doctorSpecialty: 'Cardiologist',
            diagnosis: 'Type 2 Diabetes with controlled blood pressure',
            notes: 'Patient showing good progress with medication adherence. Blood pressure readings are stable.',
          },
          {
            id: '2',
            date: '2024-11-25',
            time: '2:30 PM',
            type: 'Routine Check-up',
            status: 'Completed',
            doctorName: 'Dr. Michael Chen',
            doctorSpecialty: 'Endocrinologist',
            diagnosis: 'Diabetes management - HbA1c improving',
            notes: 'HbA1c levels have decreased from 7.2% to 6.8%. Continue current medication regimen.',
          },
        ],
        doctorDiagnoses: [
          {
            doctorName: 'Dr. Sarah Johnson',
            doctorSpecialty: 'Cardiologist',
            date: '2024-11-20',
            diagnosis: 'Type 2 Diabetes with controlled hypertension',
            notes: 'Patient has well-controlled blood pressure with current medication. Cardiovascular risk factors are being managed effectively.',
            treatmentRecommendations: [
              'Continue Lisinopril 10mg daily',
              'Maintain low-sodium diet',
              'Regular blood pressure monitoring',
            ],
          },
          {
            doctorName: 'Dr. Michael Chen',
            doctorSpecialty: 'Endocrinologist',
            date: '2024-11-25',
            diagnosis: 'Type 2 Diabetes - Well controlled',
            notes: 'HbA1c levels showing significant improvement. Patient is responding well to Metformin therapy.',
            treatmentRecommendations: [
              'Continue Metformin 500mg twice daily',
              'Monitor blood sugar levels regularly',
              'Maintain current dietary modifications',
            ],
          },
        ],
      };

      const summaries = await generateHistorySummaries(historyData);
      setHistorySummary(summaries);
    } catch (error) {
      console.error('Error loading history summaries:', error);
      setHistoryError(error instanceof Error ? error.message : 'Unable to load history summaries. Please try again later.');
    } finally {
      setIsLoadingHistory(false);
      setIsRefreshingHistory(false);
    }
  }, [fastenReports]);

  // Load history when main tab changes to history
  useEffect(() => {
    if (mainTab === 'history' && !historySummary && !isLoadingHistory) {
      loadHistorySummaries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]); // Only depend on mainTab to trigger load when switching to history

  const filteredReports = getFilteredReports();

  const historySubTabs = [
    { id: 'medical', label: 'Medical' },
    { id: 'psychiatric', label: 'Psychiatric' },
    { id: 'psychological', label: 'Psychological' },
    { id: 'social', label: 'Social' },
  ];

  const renderReports = () => (
    <ScrollView style={styles.tabContent}>
      {filteredReports.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
            No reports found matching your filters
          </Text>
        </View>
      ) : (
        filteredReports.map((report) => (
          <Card key={report.id} style={styles.reportCard}>
            <Card.Content>
              <View style={styles.reportHeader}>
                <View style={styles.reportTitleContainer}>
                  <Text
                    style={[styles.reportTitle, {  fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {report.title}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: report.status === 'Available' ? '#008080' : report.status === 'Pending' ? '#FF9800' : '#9E9E9E' }]}>
                    <Text style={[styles.statusText, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>
                      {report.status}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.reportDate, {  fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                  {report.date}
                </Text>
              </View>
              
              <View style={styles.reportMeta}>
                <View style={styles.metaItem}>
                  <MaterialIcons name="local-hospital" size={getScaledFontSize(16)} color="#008080" />
                  <Text 
                    style={[styles.metaText, {  fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {report.provider}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialIcons name="category" size={getScaledFontSize(16)} color="#008080" />
                  <Text 
                    style={[styles.metaText, {  fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {report.category}
                  </Text>
                </View>
                {report.fileType && (
                  <View style={styles.metaItem}>
                    <MaterialIcons name="description" size={getScaledFontSize(16)} color="#008080" />
                    <Text style={[styles.metaText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                      {report.fileType}
                    </Text>
                  </View>
                )}
              </View>
              
              {report.description && (
                <Text
                  style={[styles.reportDescription, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(24) }]}
                  numberOfLines={4}
                  ellipsizeMode="tail"
                >
                  {report.description}
                </Text>
              )}
              
              <TouchableOpacity 
                style={styles.viewButton}
                onPress={() => {
                  setSelectedReport(report);
                  setShowReportModal(true);
                }}
              >
                <Text style={[styles.viewButtonText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                  View Report
                </Text>
                <MaterialIcons name="arrow-forward" size={getScaledFontSize(18)} color="#008080" />
              </TouchableOpacity>
            </Card.Content>
          </Card>
        ))
      )}
    </ScrollView>
  );

  const renderHistoryContent = () => {
    if (historyError) {
      return (
        <View style={styles.historyErrorContainer}>
          <Text style={[styles.historyErrorText, { color: '#ff4444', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
            {historyError}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: '#008080', marginTop: 16 }]}
            onPress={() => loadHistorySummaries(false)}
          >
            <Text style={[styles.retryButtonText, { color: 'white', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!historySummary) {
      return (
        <View style={styles.historyEmptyContainer}>
          <Text style={[styles.historyEmptyText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
            No history data available
          </Text>
        </View>
      );
    }

    const getHistoryContent = () => {
      switch (historySubTab) {
        case 'medical':
          return historySummary.medical;
        case 'psychiatric':
          return historySummary.psychiatric;
        case 'psychological':
          return historySummary.psychological;
        case 'social':
          return historySummary.social;
        default:
          return '';
      }
    };

    return (
      <View style={styles.historyContent}>
        <Card style={styles.historyCard}>
          <Card.Content>
            <Text style={[styles.historyContentText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(24) }]}>
              {getHistoryContent()}
            </Text>
          </Card.Content>
        </Card>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView 
        style={[styles.container, { backgroundColor: colors.background }]}
        refreshControl={
          mainTab === 'history' && !isLoadingHistory && !isRefreshingHistory ? (
            <RefreshControl
              refreshing={false}
              onRefresh={() => loadHistorySummaries(true)}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          ) : undefined
        }
      >
      {/* Reports Title Header */}
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.reportsTitle, { color: colors.text, fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(700) as any }]}>Reports & History</Text>
      </View>

      {/* Main Tabs (Reports / History) */}
      <View style={[styles.mainTabsContainer, { backgroundColor: colors.background }]}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.mainTabsScroll}
          contentContainerStyle={styles.mainTabsContent}
        >
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'reports' && styles.activeMainTab]}
            onPress={() => setMainTab('reports')}
          >
            <Text style={[styles.mainTabText, mainTab === 'reports' && styles.activeMainTabText, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
              Reports
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'history' && styles.activeMainTab]}
            onPress={() => setMainTab('history')}
          >
            <Text style={[styles.mainTabText, mainTab === 'history' && styles.activeMainTabText, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
              History
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {mainTab === 'reports' ? (
        <>
          {/* Filters */}
          <View style={[styles.filtersContainer, { backgroundColor: colors.background }]}>
        <View style={styles.filterButtonsRow}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              { backgroundColor: colors.background, borderColor: selectedProviders.length > 0 ? '#008080' : '#E0E0E0' },
            ]}
            onPress={() => setShowProviderModal(true)}
          >
            <MaterialIcons name="local-hospital" size={getScaledFontSize(18)} color="#008080" />
            <Text style={[styles.filterButtonText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
              Providers
              {selectedProviders.length > 0 && ` (${selectedProviders.length})`}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={getScaledFontSize(20)} color="#008080" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              { backgroundColor: colors.background, borderColor: selectedCategories.length > 0 ? '#008080' : '#E0E0E0' },
            ]}
            onPress={() => setShowCategoryModal(true)}
          >
            <MaterialIcons name="category" size={getScaledFontSize(18)} color="#008080" />
            <Text style={[styles.filterButtonText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
              Categories
              {selectedCategories.length > 0 && ` (${selectedCategories.length})`}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={getScaledFontSize(20)} color="#008080" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Provider Filter Modal */}
      {renderFilterModal(
        showProviderModal,
        () => setShowProviderModal(false),
        'Select Providers',
        providers,
        selectedProviders,
        toggleProvider
      )}

      {/* Category Filter Modal */}
      {renderFilterModal(
        showCategoryModal,
        () => setShowCategoryModal(false),
        'Select Categories',
        categories,
        selectedCategories,
        toggleCategory
      )}

      {/* Report Detail Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReportModal(false)}
      >
        <SafeAreaView style={[styles.reportModalContainer, { backgroundColor: colors.background }]}>
          {selectedReport && (
            <>
              {/* Modal Header */}
              <View style={[styles.reportModalHeader, { borderBottomColor: '#E0E0E0' }]}>
                <View style={styles.reportModalHeaderTop}>
                  <TouchableOpacity onPress={() => setShowReportModal(false)}>
                    <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.reportModalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
                    {selectedReport.title}
                  </Text>
                  <TouchableOpacity onPress={() => setShowReportModal(false)}>
                    <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.reportModalMeta}>
                  <Text style={[styles.reportModalMetaText, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                    {selectedReport.provider} • {selectedReport.date}
                  </Text>
                  {selectedReport.accessionNumber && (
                    <Text style={[styles.reportModalMetaText, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                      Accession: {selectedReport.accessionNumber}
                    </Text>
                  )}
                </View>
                {/* Summarize Button */}
                <TouchableOpacity
                  style={[styles.summarizeButton, { backgroundColor: '#008080' }, isGeneratingSummary && styles.summarizeButtonDisabled]}
                  onPress={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                >
                  <MaterialIcons name="auto-awesome" size={getScaledFontSize(18)} color="white" />
                  <Text style={[styles.summarizeButtonText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                    Summarize
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Modal Content */}
              <ScrollView style={styles.reportModalContent} contentContainerStyle={styles.reportModalContentContainer}>
                {/* AI Summary Section */}
                {reportSummary && (
                  <View style={styles.reportSection}>
                    <View style={styles.summaryHeader}>
                      <View style={styles.summaryHeaderLeft}>
                        <MaterialIcons name="auto-awesome" size={getScaledFontSize(20)} color="#008080" />
                        <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                          Simple Summary
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: colors.background, borderLeftColor: '#008080' }]}>
                      <Text style={[styles.summaryReportName, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginBottom: 8 }]}>
                        {selectedReport.title}
                      </Text>
                      <Text style={[styles.summaryReportDate, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any, marginBottom: 12 }]}>
                        {selectedReport.date} • Generated {new Date(reportSummary.generatedAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </Text>
                      <Text style={[styles.summaryText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                        {reportSummary.summary}
                      </Text>
                    </View>
                  </View>
                )}

                {summaryError && (
                  <View style={styles.reportSection}>
                    <View style={[styles.errorCard, { backgroundColor: '#ffebee', borderLeftColor: '#f44336' }]}>
                      <MaterialIcons name="error-outline" size={getScaledFontSize(20)} color="#f44336" />
                      <Text style={[styles.errorText, { color: '#c62828', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                        {summaryError}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Results Section */}
                <View style={styles.reportSection}>
                  <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                    Results
                  </Text>
                  <View style={[styles.reportModalCard, { backgroundColor: colors.background, borderLeftColor: '#008080' }]}>
                    <Text style={[styles.reportModalCardTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                      Results
                    </Text>
                    <Text style={[styles.reportModalCardText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                      {selectedReport.title}
                      {selectedReport.accessionNumber && ` [${selectedReport.accessionNumber}]`}
                      {selectedReport.orderNumber && ` (Accession ${selectedReport.accessionNumber}) (Order ${selectedReport.orderNumber})`}
                    </Text>
                    <Text style={[styles.reportModalCardDate, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                      ▲{selectedReport.date} {selectedReport.signedOn && `- ${selectedReport.signedOn}`}
                    </Text>
                  </View>
                </View>

                {/* Narrative Section */}
                {(selectedReport.exam || selectedReport.clinicalHistory || selectedReport.technique || selectedReport.findings) && (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Narrative
                    </Text>
                    
                    {selectedReport.exam && (
                      <View style={styles.reportNarrativeItem}>
                        <Text style={[styles.reportNarrativeLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                          EXAM:
                        </Text>
                        <Text style={[styles.reportNarrativeText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                          {selectedReport.exam}
                        </Text>
                      </View>
                    )}

                    {selectedReport.clinicalHistory && (
                      <View style={styles.reportNarrativeItem}>
                        <Text style={[styles.reportNarrativeLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                          CLINICAL HISTORY:
                        </Text>
                        <Text style={[styles.reportNarrativeText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                          {selectedReport.clinicalHistory}
                        </Text>
                      </View>
                    )}

                    {selectedReport.technique && (
                      <View style={styles.reportNarrativeItem}>
                        <Text style={[styles.reportNarrativeLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                          TECHNIQUE:
                        </Text>
                        <Text style={[styles.reportNarrativeText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                          {selectedReport.technique}
                        </Text>
                      </View>
                    )}

                    {selectedReport.findings && (
                      <View style={styles.reportNarrativeItem}>
                        <Text style={[styles.reportNarrativeLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                          FINDINGS:
                        </Text>
                        <Text style={[styles.reportNarrativeText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                          {selectedReport.findings}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Impression Section */}
                {selectedReport.impression && (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Impression
                    </Text>
                    <Text style={[styles.reportImpressionText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                      {selectedReport.impression}
                    </Text>
                    {selectedReport.interpretedBy && (
                      <Text style={[styles.reportSignatureText, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                        Interpreted By: {selectedReport.interpretedBy}
                      </Text>
                    )}
                    {selectedReport.signedBy && (
                      <Text style={[styles.reportSignatureText, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                        Electronically Signed By: {selectedReport.signedBy}
                      </Text>
                    )}
                    {selectedReport.signedOn && (
                      <Text style={[styles.reportSignatureText, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                        Electronically Signed On: {selectedReport.signedOn}
                      </Text>
                    )}
                  </View>
                )}

                {/* Performing Facility */}
                {selectedReport.performingFacility && (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Performing Facility
                    </Text>
                    <Text style={[styles.reportFacilityText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                      {selectedReport.performingFacility.name}
                      {'\n'}{selectedReport.performingFacility.address}
                      {'\n'}{selectedReport.performingFacility.city}, {selectedReport.performingFacility.state} {selectedReport.performingFacility.zip}
                      {selectedReport.performingFacility.phone && `\n${selectedReport.performingFacility.phone}`}
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* Loading Overlay for Summary Generation */}
              {isGeneratingSummary && (
                <View style={styles.summaryLoadingOverlay}>
                  <View style={[styles.summaryLoadingOverlayContent, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color="#008080" />
                    <Text style={[styles.summaryLoadingOverlayText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
                      Generating summary...
                    </Text>
                    <Text style={[styles.summaryLoadingOverlaySubtext, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                      Please wait while we create an easy-to-understand summary
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>

          {/* Tabs */}
          <ScrollView 
            ref={scrollViewRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.tabScrollContainer}
            contentContainerStyle={styles.tabContainer}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.activeTab]}
                onPress={() => handleTabPress(tab.id)}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tab Content */}
          {renderReports()}
        </>
      ) : (
        <>
          {/* History Sub-Tabs */}
          <ScrollView 
            ref={historyScrollViewRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.tabScrollContainer}
            contentContainerStyle={styles.tabContainer}
          >
            {historySubTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, historySubTab === tab.id && styles.activeTab]}
                onPress={() => handleHistorySubTabPress(tab.id as 'medical' | 'psychiatric' | 'psychological' | 'social')}
              >
                <Text style={[styles.tabText, historySubTab === tab.id && styles.activeTabText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* History Content */}
          {renderHistoryContent()}
        </>
      )}
      </ScrollView>

      {/* Loading Overlay for History */}
      {(isLoadingHistory || isRefreshingHistory) && mainTab === 'history' && (
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingOverlayContent, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color="#008080" />
            <Text style={[styles.loadingOverlayText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
              {isRefreshingHistory ? 'Refreshing history...' : 'Analyzing your health history...'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 24,
    backgroundColor: 'white',
    marginBottom: 16,
  },
  reportsTitle: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  filterButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  tabScrollContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
    minWidth: 120,
  },
  activeTab: {
    backgroundColor: '#008080',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  planCard: {
    marginBottom: 16,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  planDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  diagnosisContainer: {
    marginTop: 12,
    marginBottom: 12,
    width: '100%',
  },
  diagnosisTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  diagnosis: {
    fontSize: 14,
    color: '#666',
  },
  planDescription: {
    fontSize: 16,
    marginBottom: 12,
    lineHeight: 22,
  },
  medicationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  medication: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  appointmentCard: {
    marginBottom: 12,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appointmentDate: {
    fontSize: 16,
    fontWeight: '600',
  },
  appointmentTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  appointmentRight: {
    alignItems: 'flex-end',
  },
  appointmentType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  progressNoteCard: {
    marginBottom: 16,
  },
  progressNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  progressNoteDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  progressNoteTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  progressNoteAuthor: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  progressNoteText: {
    fontSize: 14,
    color: '#333',
  },
  reportHeader: {
    marginBottom: 12,
  },
  reportTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
  reportDate: {
    fontSize: 14,
    color: '#666',
  },
  reportMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '100%',
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    flexShrink: 1,
  },
  reportDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 24,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 8,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#008080',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  reportModalContainer: {
    flex: 1,
  },
  reportModalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  reportModalHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  reportModalMeta: {
    gap: 4,
  },
  reportModalMetaText: {
    fontSize: 12,
    color: '#666',
  },
  reportModalContent: {
    flex: 1,
  },
  reportModalContentContainer: {
    padding: 20,
  },
  reportSection: {
    marginBottom: 24,
  },
  reportSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  reportCard: {
    marginBottom: 16,
  },
  reportModalCard: {
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reportModalCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  reportModalCardText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  reportModalCardDate: {
    fontSize: 12,
    color: '#666',
  },
  reportNarrativeItem: {
    marginBottom: 16,
  },
  reportNarrativeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  reportNarrativeText: {
    fontSize: 14,
    lineHeight: 22,
  },
  reportImpressionText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  reportSignatureText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  reportFacilityText: {
    fontSize: 14,
    lineHeight: 22,
  },
  mainTabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  mainTabsScroll: {
    marginHorizontal: 0,
  },
  mainTabsContent: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 4,
  },
  mainTab: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
    minWidth: 120,
  },
  activeMainTab: {
    backgroundColor: '#008080',
  },
  mainTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeMainTabText: {
    color: 'white',
  },
  historyLoadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  historyLoadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  historyErrorContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyErrorText: {
    textAlign: 'center',
    marginBottom: 8,
  },
  historyEmptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmptyText: {
    textAlign: 'center',
  },
  historyContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  historyCard: {
    marginBottom: 16,
  },
  historyContentText: {
    lineHeight: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingOverlayContent: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  loadingOverlayText: {
    marginTop: 16,
    textAlign: 'center',
  },
  summarizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  summarizeButtonDisabled: {
    opacity: 0.6,
  },
  summarizeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  summaryLoadingOverlayContent: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 250,
    maxWidth: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  summaryLoadingOverlayText: {
    marginTop: 16,
    textAlign: 'center',
  },
  summaryLoadingOverlaySubtext: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryReportName: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryReportDate: {
    fontSize: 12,
    color: '#666',
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 22,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 16,
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
