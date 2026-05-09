import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, SafeAreaView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { Card } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Checkbox } from 'expo-checkbox';
import { router } from 'expo-router';
import { fetchHistorySummary, type HistorySummary } from '@/services/api/history-summary';
import { fetchReportSummary, type ReportSummary } from '@/services/api/report-summary';
import { fetchReports } from '@/services/api/reports';
import { fetchDocuments, fetchDocumentDownloadUrl, getReportBinarySource, type PatientDocument } from '@/services/api/documents';
import type { Report } from '@/services/api/types';
import { LabResultsTable } from '@/components/reports/lab-results-table';
import { DocumentViewer, type DocumentViewerSource } from '@/components/reports/document-viewer';
import { InlineVisitSummary } from '@/components/reports/inline-visit-summary';

export default function Reports() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const historyScrollViewRef = useRef<ScrollView>(null);

  // Main tab: 'reports' | 'documents' | 'history'
  const [mainTab, setMainTab] = useState<'reports' | 'documents' | 'history'>('reports');
  // Documents tab state
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isRefreshingDocuments, setIsRefreshingDocuments] = useState(false);
  const [docCategoryTab, setDocCategoryTab] = useState<string>('all');
  // Document viewer modal state — used by both Documents tab and Report attachments
  const [viewerSource, setViewerSource] = useState<DocumentViewerSource | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string>('');
  const [viewerSubtitle, setViewerSubtitle] = useState<string | undefined>();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
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
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isRefreshingReports, setIsRefreshingReports] = useState(false);

  // Load reports
  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshingReports(true);
    } else {
      setIsLoadingReports(true);
    }
    try {
      const reports = await fetchReports();
      setFastenReports(reports);
    } catch {
      setFastenReports([]);
    } finally {
      setIsLoadingReports(false);
      setIsRefreshingReports(false);
    }
  }, []);

  // Load reports on mount
  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const loadDocuments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshingDocuments(true);
    else setIsLoadingDocuments(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch {
      setDocuments([]);
    } finally {
      setIsLoadingDocuments(false);
      setIsRefreshingDocuments(false);
    }
  }, []);

  // Lazy-load documents when the user switches to the Documents tab
  useEffect(() => {
    if (mainTab === 'documents' && documents.length === 0 && !isLoadingDocuments) {
      loadDocuments();
    }
  }, [mainTab, documents.length, isLoadingDocuments, loadDocuments]);

  const openDocument = useCallback(async (doc: PatientDocument) => {
    setOpeningDocumentId(doc.id);
    try {
      const { downloadUrl, contentType } = await fetchDocumentDownloadUrl(doc.id);
      setViewerSource({ uri: downloadUrl, contentType });
      setViewerTitle(doc.title);
      setViewerSubtitle(
        [
          doc.practitionerName ?? doc.organizationName,
          doc.documentDate ? new Date(doc.documentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
        ].filter(Boolean).join(' · '),
      );
      setViewerVisible(true);
    } finally {
      setOpeningDocumentId(null);
    }
  }, []);

  const openReportAttachment = useCallback(async (report: Report, binaryId: string, contentType?: string) => {
    setOpeningDocumentId(binaryId);
    try {
      const source = await getReportBinarySource(report.id, binaryId);
      setViewerSource({ ...source, contentType });
      setViewerTitle(report.title);
      setViewerSubtitle([report.provider, report.date].filter(Boolean).join(' · '));
      setViewerVisible(true);
    } finally {
      setOpeningDocumentId(null);
    }
  }, []);

  // Sub-tab definition + matching backend category. Order is the display
  // order; entries with zero reports are filtered out at render time so
  // categories like Microbiology / ECG only appear when the patient
  // actually has data of that kind.
  const TAB_DEFINITIONS: readonly { id: string; label: string; category?: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'lab', label: 'Lab', category: 'Lab Reports' },
    { id: 'imaging', label: 'Imaging', category: 'Imaging' },
    { id: 'pathology', label: 'Pathology', category: 'Pathology' },
    { id: 'microbiology', label: 'Microbio', category: 'Microbiology' },
    { id: 'procedures', label: 'Procedures', category: 'Procedures' },
    { id: 'cardiology', label: 'Cardiology', category: 'Cardiology' },
    { id: 'ecg', label: 'ECG', category: 'ECG' },
    { id: 'medical', label: 'Medical', category: 'Medical Records' },
  ];

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of fastenReports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return TAB_DEFINITIONS.flatMap((t) => {
      if (t.id === 'all') return [{ id: 'all', label: `All · ${fastenReports.length}` }];
      const c = t.category ? counts.get(t.category) ?? 0 : 0;
      return c > 0 ? [{ id: t.id, label: `${t.label} · ${c}` }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastenReports]);

  const categories = useMemo(
    () => Array.from(new Set(fastenReports.map((r) => r.category))).sort(),
    [fastenReports],
  );

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

  const categoryMap: { [key: string]: string } = Object.fromEntries(
    TAB_DEFINITIONS.filter((t) => t.category).map((t) => [t.id, t.category as string]),
  );

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
      const summary = await fetchReportSummary({
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

  // Load history summaries from API
  const loadHistorySummaries = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshingHistory(true);
    } else {
      setIsLoadingHistory(true);
    }
    setHistoryError(null);

    try {
      const summaries = await fetchHistorySummary();
      setHistorySummary(summaries);
    } catch (error) {
      console.error('Error loading history summaries:', error);
      setHistoryError(error instanceof Error ? error.message : 'Unable to load history summaries. Please try again later.');
    } finally {
      setIsLoadingHistory(false);
      setIsRefreshingHistory(false);
    }
  }, []);

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

  // Sub-tabs for the Documents view, derived from the loaded data
  const documentTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of documents) {
      const key = d.documentCategory ?? d.documentType ?? 'Other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const list: { id: string; label: string; category?: string }[] = [
      { id: 'all', label: `All · ${documents.length}` },
    ];
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, n]) => {
        list.push({ id: cat, label: `${cat} · ${n}`, category: cat });
      });
    return list;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    if (docCategoryTab === 'all') return documents;
    return documents.filter((d) => (d.documentCategory ?? d.documentType ?? 'Other') === docCategoryTab);
  }, [documents, docCategoryTab]);

  const renderDocuments = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingDocuments}
          onRefresh={() => loadDocuments(true)}
          tintColor="#008080"
        />
      }
    >
      {isLoadingDocuments ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>Loading documents...</Text>
        </View>
      ) : filteredDocuments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
            No documents available yet
          </Text>
        </View>
      ) : (
        filteredDocuments.map((doc) => {
          const isPdf = (doc.contentType ?? '').toLowerCase().includes('pdf');
          const opening = openingDocumentId === doc.id;
          return (
            <Card key={doc.id} style={styles.reportCard}>
              <Card.Content>
                <View style={styles.reportHeader}>
                  <View style={styles.reportTitleContainer}>
                    <Text
                      style={[styles.reportTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}
                      numberOfLines={3}
                      ellipsizeMode="tail"
                    >
                      {doc.title || doc.documentType || 'Untitled Document'}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: '#008080' }]}>
                      <Text style={[styles.statusText, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>{isPdf ? 'PDF' : 'HTML'}</Text>
                    </View>
                  </View>
                  {doc.documentDate && (
                    <Text style={[styles.reportDate, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                      {new Date(doc.documentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>
                <View style={styles.reportMeta}>
                  {doc.practitionerName && (
                    <View style={styles.metaItem}>
                      <MaterialIcons name="local-hospital" size={getScaledFontSize(16)} color="#008080" />
                      <Text style={[styles.metaText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]} numberOfLines={1} ellipsizeMode="tail">
                        {doc.practitionerName}
                      </Text>
                    </View>
                  )}
                  {doc.organizationName && (
                    <View style={styles.metaItem}>
                      <MaterialIcons name="apartment" size={getScaledFontSize(16)} color="#008080" />
                      <Text style={[styles.metaText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]} numberOfLines={1} ellipsizeMode="tail">
                        {doc.organizationName}
                      </Text>
                    </View>
                  )}
                  {(doc.documentCategory || doc.documentType) && (
                    <View style={styles.metaItem}>
                      <MaterialIcons name="category" size={getScaledFontSize(16)} color="#008080" />
                      <Text style={[styles.metaText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]} numberOfLines={1} ellipsizeMode="tail">
                        {doc.documentCategory ?? doc.documentType}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.viewButton} onPress={() => openDocument(doc)} disabled={opening}>
                  <Text style={[styles.viewButtonText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                    {opening ? 'Opening…' : 'Open Document'}
                  </Text>
                  {opening
                    ? <ActivityIndicator size="small" color="#008080" />
                    : <MaterialIcons name="arrow-forward" size={getScaledFontSize(18)} color="#008080" />}
                </TouchableOpacity>
              </Card.Content>
            </Card>
          );
        })
      )}
    </ScrollView>
  );

  const renderReports = () => (
    <ScrollView style={styles.tabContent}>
      {/* Trends quick-link — deep links to the existing Health Trends screen */}
      <TouchableOpacity
        style={styles.trendsBanner}
        onPress={() => router.push('/Home/health-trends' as never)}
      >
        <View style={styles.trendsBannerIcon}>
          <MaterialIcons name="show-chart" size={getScaledFontSize(22)} color="#008080" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.trendsBannerTitle, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }]}>
            View Health Trends
          </Text>
          <Text style={[styles.trendsBannerSubtitle, { color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
            Track lab values + vitals over time
          </Text>
        </View>
        <MaterialIcons name="arrow-forward" size={getScaledFontSize(20)} color="#008080" />
      </TouchableOpacity>
      {isLoadingReports ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading reports...
          </Text>
        </View>
      ) : filteredReports.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
            No reports found matching your filters
          </Text>
        </View>
      ) : (
        filteredReports.map((report) => {
          const hasAbnormal = (report.abnormalCount ?? 0) > 0;
          const hasPdf = (report.presentedForms?.length ?? 0) > 0;
          return (
            <Card
              key={report.id}
              style={[styles.reportCard, hasAbnormal && styles.reportCardAbnormal]}
            >
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
                </View>

                {(hasAbnormal || hasPdf) && (
                  <View style={styles.cardBadges}>
                    {hasAbnormal && (
                      <View style={styles.abnormalBadge}>
                        <Text style={[styles.abnormalBadgeText, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(700) as any }]}>
                          ⬤ {report.abnormalCount} abnormal
                        </Text>
                      </View>
                    )}
                    {hasPdf && (
                      <View style={styles.pdfBadge}>
                        <MaterialIcons name="picture-as-pdf" size={getScaledFontSize(12)} color="#6B21A8" />
                        <Text style={[styles.pdfBadgeText, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }]}>
                          {(report.presentedForms?.[0]?.contentType ?? '').includes('pdf') ? 'PDF' : 'HTML'}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {report.description && !report.results && (
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
          );
        })
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
    <AppWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        refreshControl={
          <RefreshControl
            refreshing={mainTab === 'reports' ? isRefreshingReports : false}
            onRefresh={() => {
              if (mainTab === 'reports') {
                loadReports(true);
              } else {
                loadHistorySummaries(true);
              }
            }}
            tintColor={colors.tint}
            colors={[colors.tint]}
          />
        }
      >
      {/* Reports Title Header */}
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: 16 }]}>
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
          {/* Documents tab hidden — content is being consumed server-side and surfaced
              through Reports Attachments + Provider screens (SCRUM-145). The viewer
              + loaders are kept in this file so re-enabling is a one-line change. */}
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

                {/* Results section — structured table when we have results, otherwise meta */}
                {selectedReport.results && selectedReport.results.length > 0 ? (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Results
                      {(selectedReport.abnormalCount ?? 0) > 0 && (
                        <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                          {' '}· {selectedReport.abnormalCount} abnormal
                        </Text>
                      )}
                    </Text>
                    <LabResultsTable results={selectedReport.results} />
                  </View>
                ) : (selectedReport.accessionNumber || selectedReport.orderNumber) ? (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Identifiers
                    </Text>
                    {selectedReport.accessionNumber && (
                      <Text style={[styles.reportModalCardText, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any }]}>
                        Accession: {selectedReport.accessionNumber}
                      </Text>
                    )}
                    {selectedReport.orderNumber && (
                      <Text style={[styles.reportModalCardText, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any }]}>
                        Order: {selectedReport.orderNumber}
                      </Text>
                    )}
                  </View>
                ) : null}

                {/* Attachments — DiagnosticReport.presentedForms backed by HealthLake Binary */}
                {selectedReport.presentedForms && selectedReport.presentedForms.length > 0 && (
                  <View style={styles.reportSection}>
                    <Text style={[styles.reportSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      Attachments
                    </Text>
                    {selectedReport.presentedForms.map((pf, idx) => {
                      const isPdf = (pf.contentType ?? '').toLowerCase().includes('pdf');
                      const opening = openingDocumentId === pf.binaryId;
                      return (
                        <TouchableOpacity
                          key={pf.binaryId + idx}
                          style={styles.attachmentRow}
                          onPress={() => openReportAttachment(selectedReport, pf.binaryId, pf.contentType)}
                          disabled={opening}
                        >
                          <MaterialIcons name={isPdf ? 'picture-as-pdf' : 'description'} size={getScaledFontSize(20)} color="#6B21A8" />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.attachmentTitle, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                              {pf.title ?? (isPdf ? 'PDF Attachment' : 'HTML Attachment')}
                            </Text>
                            <Text style={[styles.attachmentMeta, { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(400) as any }]}>
                              {pf.contentType}{pf.size ? ` · ${(pf.size / 1024).toFixed(1)} KB` : ''}
                            </Text>
                          </View>
                          {opening
                            ? <ActivityIndicator size="small" color="#008080" />
                            : <MaterialIcons name="arrow-forward" size={getScaledFontSize(18)} color="#008080" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Visit summary — fetched inline so the patient sees the
                    AI narrative + key findings + follow-ups in the same view,
                    no extra "open another screen" step. Backed by the
                    encounter-narrative endpoint which is now augmented with
                    cached document sections (D-4 / SCRUM-148). */}
                {selectedReport.encounterRef && (
                  <View style={styles.reportSection}>
                    <InlineVisitSummary
                      encounterId={selectedReport.encounterRef}
                      encounterDisplay={selectedReport.encounterDisplay}
                      encounterDate={selectedReport.encounterDate}
                    />
                  </View>
                )}

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
      ) : mainTab === 'documents' ? (
        <>
          {/* Documents Sub-Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScrollContainer}
            contentContainerStyle={styles.tabContainer}
          >
            {documentTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, docCategoryTab === tab.id && styles.activeTab]}
                onPress={() => setDocCategoryTab(tab.id)}
              >
                <Text style={[styles.tabText, docCategoryTab === tab.id && styles.activeTabText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {renderDocuments()}
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

      {/* In-app Document Viewer (shared between Documents tab + Report attachments) */}
      <DocumentViewer
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        source={viewerSource}
        title={viewerTitle}
        subtitle={viewerSubtitle}
      />

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
    </AppWrapper>
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
  loaderContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
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
  reportCardAbnormal: {
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  abnormalBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  abnormalBadgeText: {
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  pdfBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pdfBadgeText: {
    color: '#6B21A8',
    letterSpacing: 0.3,
  },
  fromVisitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 10,
  },
  fromVisitTitle: {
    marginBottom: 2,
  },
  fromVisitMeta: {
    letterSpacing: 0.2,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAFAFA',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  attachmentTitle: { marginBottom: 2 },
  attachmentMeta: {},
  trendsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FAFA',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  trendsBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendsBannerTitle: { marginBottom: 2 },
  trendsBannerSubtitle: { letterSpacing: 0.2 },
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
  },
  reportImpressionText: {
    fontSize: 14,
    marginBottom: 12,
  },
  reportSignatureText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  reportFacilityText: {
    fontSize: 14,
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
  },
});
