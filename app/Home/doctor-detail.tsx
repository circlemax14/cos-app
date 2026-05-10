import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking, Alert, Platform, Image, Modal as RNModal } from 'react-native';
import { Avatar, Card, Button, Portal, Modal, Switch, TextInput as PaperTextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProviderById, fetchProviders, fetchProviderTreatmentPlans, fetchProviderAppointments, fetchCarePlans, fetchAiInsight } from '@/services/api/providers';
import { fetchProviderProgressNotesNarrative, type ProviderProgressNotes } from '@/services/api/progress-notes';
import { inferMedicationStatus } from '@/utils/treatment-status';
import type { Provider, ProviderAppointment, CarePlanItem, ProviderTreatmentPlan, RecommendedAppointment } from '@/services/api/types';
import { groupTreatmentByEncounter } from '@/services/treatment-timeline';
import { WhatChangedCard } from '@/components/doctor-detail';
import { useEncounterNarrative } from '@/hooks/use-encounter-narrative';
import { useRecommendedAppointments } from '@/hooks/use-recommended-appointments';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { useDoctor } from '@/hooks/use-doctor';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import { AppWrapper } from '@/components/app-wrapper';
import { fetchDataShares, grantDataShare, revokeDataShare } from '@/services/api/data-sharing';

export default function DoctorDetailScreen() {
  const params = useLocalSearchParams();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  
  const [provider, setProvider] = useState<Provider | null>(null);
  const [, setIsLoadingProvider] = useState(false);
  const [treatmentPlans, setTreatmentPlans] = useState<ProviderTreatmentPlan>({
    diagnoses: [],
    medications: [],
  });
  const [aiProgressNotes, setAiProgressNotes] = useState<ProviderProgressNotes | null>(null);
  const [aiProgressLoading, setAiProgressLoading] = useState(false);
  const [aiProgressError, setAiProgressError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<ProviderAppointment[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlanItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Get provider data from params or load by ID
  const providerId = params.id as string | undefined;
  const providerName = params.name as string || '';
  const providerQualifications = params.qualifications as string || '';
  const providerSpecialty = params.specialty as string || '';
  
  // Load doctor data from database
  const { doctor: doctorData, updateDoctor, pickImage } = useDoctor(providerId || '');
  
  // Use database data if available, otherwise fall back to provider/params
  const doctorName = doctorData?.name || provider?.name || providerName;
  // Edit form state
  const [editedData, setEditedData] = useState({
    name: doctorName,
    specialty: doctorData?.specialty || providerSpecialty,
    phone: doctorData?.phone || provider?.phone || '',
    email: doctorData?.email || provider?.email || '',
    photoUrl: doctorData?.photoUrl || '',
  });

  const [activeTab, setActiveTab] = useState('treatment');
  const [appointmentSubTab, setAppointmentSubTab] = useState<'past' | 'recommended'>('past');
  type AiInsightState = { summary: string; loading: boolean; empty: boolean };
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsightState>>({});

  // Recommended appointments for this provider only. The hook pulls
  // /v1/patients/me/recommended-appointments once and we filter by the
  // provider's display name on the client.
  const { data: allRecommended } = useRecommendedAppointments({ status: 'pending' });
  const recommendedForProvider = useMemo(() => {
    if (!allRecommended || !provider?.name) return [];
    const target = provider.name.trim().toLowerCase();
    return allRecommended.filter(
      (r) => r.recommendedProviderName?.trim().toLowerCase() === target,
    );
  }, [allRecommended, provider?.name]);

  // Past Visits should describe the same set of encounters that the
  // Treatment tab's diagnosis cards came from, so the two screens can't
  // disagree on how many times the user has seen this provider. The
  // appointments endpoint name-matches the provider, which can drag in
  // scheduling stubs that have no clinical content. Filter them out by
  // intersecting with the encounter IDs the diagnoses pointed at.
  // If diagnoses haven't loaded yet (or this provider recorded none),
  // fall back to the raw appointment list so we don't briefly flash an
  // empty Past Visits panel.
  const pastVisits = useMemo(() => {
    const diagnosisEncounterIds = new Set(
      treatmentPlans.diagnoses
        .map((d) => d.encounterId)
        .filter((id): id is string => !!id),
    );
    if (diagnosisEncounterIds.size === 0) return appointments;
    return appointments.filter((a) => {
      // Encounter rows: id IS the encounter id.
      if (a.resourceType === 'Encounter') return diagnosisEncounterIds.has(a.id);
      // Appointment rows have no encounterId surfaced today, so keep
      // them out of the count once we know which encounters matter.
      return false;
    });
  }, [appointments, treatmentPlans.diagnoses]);

  const loadAiInsight = useCallback(
    async (tab: 'treatment' | 'progress' | 'appointments' | 'carePlans') => {
      if (!providerId) return;
      // Key on providerId so switching providers re-triggers a fetch.
      const cacheKey = `${providerId}:${tab}`;
      if (aiInsights[cacheKey]?.summary || aiInsights[cacheKey]?.loading) return;
      setAiInsights((prev) => ({
        ...prev,
        [cacheKey]: { summary: '', loading: true, empty: false },
      }));
      const result = await fetchAiInsight(tab, provider?.name, providerId);
      setAiInsights((prev) => ({
        ...prev,
        [cacheKey]: {
          summary: result?.summary ?? 'Unable to generate insights.',
          loading: false,
          empty: result?.empty === true,
        },
      }));
    },
    [providerId, provider?.name, aiInsights],
  );

  const insightFor = useCallback(
    (tab: 'treatment' | 'progress' | 'appointments'): AiInsightState | undefined =>
      providerId ? aiInsights[`${providerId}:${tab}`] : undefined,
    [aiInsights, providerId],
  );

  // Kick off the overview narrative fetch when a tab becomes active
  // (or the provider changes). Each fetch is deduped inside
  // loadAiInsight, so this effect is safe to call liberally.
  useEffect(() => {
    if (!providerId || isLoadingData) return;
    if (activeTab === 'treatment' || activeTab === 'progress' || activeTab === 'appointments') {
      loadAiInsight(activeTab);
    }
  }, [providerId, activeTab, isLoadingData, loadAiInsight]);

  // Lazy-load the AI progress-notes narrative when the user lands on
  // the Progress Notes tab. Cached server-side for 7 days, so subsequent
  // tab visits return instantly with fromCache=true.
  const loadAiProgressNotes = useCallback(
    async (refresh = false) => {
      if (!providerId) return;
      setAiProgressLoading(true);
      setAiProgressError(null);
      try {
        const data = await fetchProviderProgressNotesNarrative(providerId, { refresh });
        setAiProgressNotes(data);
      } catch (err) {
        setAiProgressError(err instanceof Error ? err.message : 'Unable to generate progress notes');
      } finally {
        setAiProgressLoading(false);
      }
    },
    [providerId],
  );

  useEffect(() => {
    if (!providerId || activeTab !== 'progress') return;
    if (aiProgressNotes || aiProgressLoading) return;
    loadAiProgressNotes();
  }, [providerId, activeTab, aiProgressNotes, aiProgressLoading, loadAiProgressNotes]);

  const [otherProviders, setOtherProviders] = useState<Provider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [doctorShares, setDoctorShares] = useState<{ [key: string]: boolean }>({});
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [pendingProviderName, setPendingProviderName] = useState<string>('');
  const scrollViewRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load doctor photos for other providers
  const providerIds = otherProviders.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);

  // Update edited data when doctor data changes
  useEffect(() => {
    if (doctorData) {
      setEditedData({
        name: doctorData.name,
        specialty: doctorData.specialty || providerSpecialty,
        phone: doctorData.phone || '',
        email: doctorData.email || '',
        photoUrl: doctorData.photoUrl || '',
      });
    } else if (provider) {
      setEditedData({
        name: provider.name,
        specialty: provider.specialty || providerSpecialty,
        phone: provider.phone || '',
        email: provider.email || '',
        photoUrl: '',
      });
    }
  }, [doctorData, provider, providerSpecialty]);

  // Load provider details and related data if ID is provided
  useEffect(() => {
    const loadProviderData = async () => {
      const effectiveProviderId = providerId || 'unknown';
      
      if (providerId && providerId !== 'unknown') {
        setIsLoadingProvider(true);
        setIsLoadingData(true);
        try {
          const providerData = await fetchProviderById(providerId);
          if (providerData) {
            setProvider(providerData);
          }
          
          // Load provider-specific data
          const [plans, apts, carePlanData] = await Promise.all([
            fetchProviderTreatmentPlans(providerId, providerData?.name),
            fetchProviderAppointments(providerData?.name ?? ''),
            fetchCarePlans(),
          ]);

          setTreatmentPlans(plans);
          setAppointments(apts);
          setCarePlans(carePlanData);
        } catch (error) {
          console.error('Error loading provider data:', error);
        } finally {
          setIsLoadingProvider(false);
          setIsLoadingData(false);
        }
      } else {
        // Use params data if available
        setProvider({
          id: effectiveProviderId,
          name: providerName,
          qualifications: providerQualifications,
          specialty: providerSpecialty,
          phone: params.phone as string,
          email: params.email as string,
        });
        // Set empty arrays for data when no provider ID
        setTreatmentPlans({ diagnoses: [], medications: [] });
        setAppointments([]);
        setCarePlans([]);
      }
    };
    
    loadProviderData();
  }, [providerId, providerName, providerQualifications, providerSpecialty, params.email, params.phone]);

  // Load other providers and existing data shares for Share Data tab
  useEffect(() => {
    const loadOtherProviders = async () => {
      setIsLoadingProviders(true);
      try {
        const allProviders = await fetchProviders();
        // Fetch existing shares separately — endpoint may not be deployed yet
        let existingShares: Awaited<ReturnType<typeof fetchDataShares>> = [];
        try {
          existingShares = await fetchDataShares();
        } catch {
          // Data sharing endpoint not available yet — default all to off
        }

        // Filter out the current doctor
        const filtered = allProviders.filter(p => p.id !== providerId);
        setOtherProviders(filtered);

        // Initialize share state — true for providers with active shares
        const activeShareIds = new Set(existingShares.map(s => s.providerId));
        const initialShares: { [key: string]: boolean } = {};
        filtered.forEach(p => {
          initialShares[p.id] = activeShareIds.has(p.id);
        });
        setDoctorShares(initialShares);
      } catch (error) {
        console.error('Error loading other providers:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    if (providerId) {
      loadOtherProviders();
    }
  }, [providerId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (providerId && providerId !== 'unknown') {
        const providerData = await fetchProviderById(providerId);
        const [plans, apts, carePlanData, allProviders, existingShares] = await Promise.all([
          fetchProviderTreatmentPlans(providerId, providerData?.name),
          fetchProviderAppointments(providerData?.name ?? ''),
          fetchCarePlans(),
          fetchProviders(),
          fetchDataShares(),
        ]);
        if (providerData) setProvider(providerData);
        setTreatmentPlans(plans);
        setAppointments(apts);
        setCarePlans(carePlanData);
        const filtered = allProviders.filter(p => p.id !== providerId);
        setOtherProviders(filtered);
        const activeShareIds = new Set(existingShares.map(s => s.providerId));
        const initialShares: { [key: string]: boolean } = {};
        filtered.forEach(p => {
          initialShares[p.id] = activeShareIds.has(p.id);
        });
        setDoctorShares(initialShares);
      }
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, [providerId]);

  // Doctor contact information
  const doctorPhone = provider?.phone || params.phone as string || '';
  const doctorEmail = provider?.email || params.email as string || '';
  const doctorQualifications = provider?.qualifications || providerQualifications;
  const doctorSpecialty = provider?.specialty || providerSpecialty;

  const handleCall = async () => {
    const url = `tel:${doctorPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to make a phone call');
      }
    } catch {
      Alert.alert('Error', 'Unable to make a phone call');
    }
  };

  const handleMessage = async () => {
    const url = `sms:${doctorPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to send a message');
      }
    } catch {
      Alert.alert('Error', 'Unable to send a message');
    }
  };

  const handleVideoCall = async () => {
    try {
      if (Platform.OS === 'ios') {
        // Try FaceTime first
        const facetimeUrl = `facetime://${doctorPhone}`;
        const canOpenFaceTime = await Linking.canOpenURL(facetimeUrl);
        if (canOpenFaceTime) {
          await Linking.openURL(facetimeUrl);
          return;
        }
        // Fallback to FaceTime audio
        const facetimeAudioUrl = `facetime-audio://${doctorPhone}`;
        const canOpenAudio = await Linking.canOpenURL(facetimeAudioUrl);
        if (canOpenAudio) {
          await Linking.openURL(facetimeAudioUrl);
          return;
        }
      }
      
      // For Android and iOS fallback, show options
      // The system will show app chooser for these URL schemes if multiple apps are installed
      const videoApps = [
        { name: 'Zoom', url: 'zoomus://' },
        { name: 'Google Meet', url: 'https://meet.google.com' },
        { name: 'Skype', url: 'skype:' },
        { name: 'WhatsApp', url: `whatsapp://send?phone=${doctorPhone}` },
      ];
      
      const availableApps = [];
      for (const app of videoApps) {
        const canOpen = await Linking.canOpenURL(app.url);
        if (canOpen) {
          availableApps.push(app);
        }
      }
      
      if (availableApps.length > 0) {
        Alert.alert(
          'Video Call',
          'Choose a video calling app:',
          [
            { text: 'Cancel', style: 'cancel' },
            ...availableApps.map(app => ({
              text: app.name,
              onPress: () => Linking.openURL(app.url),
            })),
          ]
        );
      } else {
        Alert.alert(
          'Video Call',
          'No video calling apps found. Please install a video calling app like Zoom, Google Meet, or Skype.',
        );
      }
    } catch {
      Alert.alert('Error', 'Unable to start a video call');
    }
  };

  const handleEmail = async () => {
    const url = `mailto:${doctorEmail}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to send an email');
      }
    } catch {
      Alert.alert('Error', 'Unable to send an email');
    }
  };

  const tabs = [
    { id: 'treatment', label: 'Diagnosis & Treatment Plan' },
    { id: 'progress', label: 'Progress Notes' },
    { id: 'medications', label: 'Medications' },
    { id: 'share', label: 'Share Data' },
    { id: 'appointments', label: 'Appointments' },
  ];

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

  const handleEditPress = () => {
    setIsEditModalVisible(true);
  };

  const handlePickImage = async () => {
    try {
      const imageUri = await pickImage();
      if (imageUri) {
        setEditedData({ ...editedData, photoUrl: imageUri });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to pick image. Please try again.';
      console.error('Error in handlePickImage:', error);
      
      // Show more helpful error message
      Alert.alert(
        'Error',
        errorMessage,
        [
          {
            text: 'OK',
            style: 'default',
          },
          // If permission was denied, offer to open settings
          ...(errorMessage.includes('denied') || errorMessage.includes('Settings')
            ? [
                {
                  text: 'Open Settings',
                  onPress: () => {
                    Linking.openSettings();
                  },
                },
              ]
            : []),
        ]
      );
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateDoctor({
        name: editedData.name,
        specialty: editedData.specialty,
        phone: editedData.phone,
        email: editedData.email,
        photoUrl: editedData.photoUrl,
      });
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Doctor information updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to save doctor information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original data
    if (doctorData) {
      setEditedData({
        name: doctorData.name,
        specialty: doctorData.specialty || providerSpecialty,
        phone: doctorData.phone || '',
        email: doctorData.email || '',
        photoUrl: doctorData.photoUrl || '',
      });
    } else if (provider) {
      setEditedData({
        name: provider.name,
        specialty: provider.specialty || providerSpecialty,
        phone: provider.phone || '',
        email: provider.email || '',
        photoUrl: '',
      });
    }
    setIsEditModalVisible(false);
  };

  // Treatment plans are loaded from Fasten Health
  // Progress notes are loaded from Fasten Health

  // Appointments are loaded from Fasten Health

  const renderOverviewCard = (
    tab: 'treatment' | 'progress' | 'appointments',
    title: string,
  ) => {
    const state = insightFor(tab);
    return (
      <Card style={[styles.aiNarrativeCard, { backgroundColor: colors.card }]}>
        <Card.Content>
          <View style={styles.aiNarrativeHeader}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              {title}
            </Text>
          </View>
          {!state || state.loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                Reading your records…
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(14),
                lineHeight: getScaledFontSize(22),
                marginTop: 8,
              }}
            >
              {state.summary}
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  // Memoize the encounter grouping so unrelated re-renders (edit-form
  // keystrokes, modal toggles, etc.) don't re-bucket diagnoses + meds.
  const treatmentTimeline = useMemo(
    () => groupTreatmentByEncounter(treatmentPlans, appointments),
    [treatmentPlans, appointments],
  );

  // Per-visit "Current / Previous" treatment-plan cards were dropped
  // when the Treatment tab was rebuilt for web parity (per-diagnosis
  // cards now). Keeping the comment so future readers know this is
  // intentional, not an accidental deletion.

  // Web parity: doctor-detail Treatment tab shows per-diagnosis cards
  // sorted active-first, each with name + status pill + onset / recorded
  // date + clinician notes. Replaces the prior per-visit aggregated
  // TreatmentPlanCards layout per user feedback ("I like the way we
  // show diagnosis cards based on visits or recorded date, we lack
  // this in app"). Medications moved to their own provider tab in
  // SCRUM-155 so they're intentionally absent here.
  const renderTreatmentPlan = () => {
    const diagnoses = treatmentPlans.diagnoses;
    const isEmpty = diagnoses.length === 0;

    const ACTIVE_STATUSES = new Set(['active', 'recurrence', 'relapse']);
    const sortedDiagnoses = [...diagnoses].sort((a, b) => {
      const aActive = ACTIVE_STATUSES.has((a.clinicalStatus ?? '').toLowerCase()) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.has((b.clinicalStatus ?? '').toLowerCase()) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aDate = a.onsetDate ?? a.recordedDate;
      const bDate = b.onsetDate ?? b.recordedDate;
      const aTs = aDate ? new Date(aDate).getTime() : 0;
      const bTs = bDate ? new Date(bDate).getTime() : 0;
      return bTs - aTs;
    });

    const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
      active: { label: 'Active', bg: '#DCFCE7', fg: '#15803D' },
      recurrence: { label: 'Recurrence', bg: '#FEF3C7', fg: '#92400E' },
      relapse: { label: 'Relapse', bg: '#FEF3C7', fg: '#92400E' },
      inactive: { label: 'Inactive', bg: '#E5E7EB', fg: '#374151' },
      remission: { label: 'In Remission', bg: '#E0F2FE', fg: '#075985' },
      resolved: { label: 'Resolved', bg: '#E5E7EB', fg: '#374151' },
      unknown: { label: 'Unknown', bg: '#E5E7EB', fg: '#374151' },
    };

    const formatDate = (iso: string | null | undefined) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 24 }}>
        {isLoadingData ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14) }}>
              Loading diagnoses…
            </Text>
          </View>
        ) : (
          <>
            <WhatChangedCard
              state={insightFor('treatment')}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />

            {isEmpty ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                  No diagnoses recorded by this provider in your EHR.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                    Diagnoses
                  </Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: colors.subtext + '40' }}>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }}>
                      {sortedDiagnoses.length}
                    </Text>
                  </View>
                </View>

                {sortedDiagnoses.map((d) => {
                  const pill = STATUS_PILL[(d.clinicalStatus ?? '').toLowerCase()] ?? STATUS_PILL.unknown;
                  return (
                    <Card key={d.id} style={{ marginBottom: 10, backgroundColor: colors.card }}>
                      <Card.Content>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <Text
                            style={{
                              flex: 1,
                              color: colors.text,
                              fontSize: getScaledFontSize(16),
                              fontWeight: getScaledFontWeight(600) as any,
                              lineHeight: getScaledFontSize(22),
                            }}
                          >
                            {d.name}
                          </Text>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: pill.bg }}>
                            <Text
                              style={{
                                color: pill.fg,
                                fontSize: getScaledFontSize(11),
                                fontWeight: getScaledFontWeight(700) as any,
                                letterSpacing: 0.4,
                              }}
                            >
                              {pill.label}
                            </Text>
                          </View>
                        </View>
                        {(d.onsetDate || d.recordedDate) && (
                          <Text
                            style={{
                              marginTop: 6,
                              color: colors.subtext,
                              fontSize: getScaledFontSize(12),
                              fontWeight: getScaledFontWeight(400) as any,
                            }}
                          >
                            {d.onsetDate ? `Onset ${formatDate(d.onsetDate)}` : ''}
                            {d.onsetDate && d.recordedDate ? ' · ' : ''}
                            {d.recordedDate ? `Recorded ${formatDate(d.recordedDate)}` : ''}
                          </Text>
                        )}
                        {d.notes.length > 0 && (
                          <View
                            style={{
                              marginTop: 10,
                              paddingTop: 10,
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: colors.subtext + '30',
                              gap: 6,
                            }}
                          >
                            {d.notes.map((note, idx) => (
                              <Text
                                key={idx}
                                style={{
                                  color: colors.text,
                                  fontSize: getScaledFontSize(13),
                                  lineHeight: getScaledFontSize(20),
                                  fontWeight: getScaledFontWeight(400) as any,
                                }}
                              >
                                {note}
                              </Text>
                            ))}
                          </View>
                        )}
                      </Card.Content>
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  // Web parity (cos-frontend ProgressNotesTab): render the AI-generated
  // narrative from /v1/patients/me/providers/:id/progress-notes.
  const renderProgressNotes = () => {
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 24 }}>
        <Card style={[styles.progressNoteCard, { backgroundColor: colors.card }]}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MaterialIcons name="auto-awesome" size={getScaledFontSize(18)} color={colors.tint} />
              <Text
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(700) as any,
                }}
              >
                AI Progress Notes
              </Text>
              <TouchableOpacity
                onPress={() => loadAiProgressNotes(true)}
                disabled={aiProgressLoading}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text
                  style={{
                    color: aiProgressLoading ? colors.subtext : colors.tint,
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {aiProgressLoading ? 'Refreshing…' : 'Refresh'}
                </Text>
              </TouchableOpacity>
            </View>
            {aiProgressLoading && !aiProgressNotes ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={colors.tint} />
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                  Generating progress notes…
                </Text>
              </View>
            ) : aiProgressError ? (
              <View>
                <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(13), marginBottom: 6 }}>
                  Couldn&apos;t generate progress notes. Tap Refresh to try again.
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
                  {aiProgressError}
                </Text>
              </View>
            ) : aiProgressNotes && aiProgressNotes.narrative ? (
              <>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                    lineHeight: getScaledFontSize(22),
                    fontWeight: getScaledFontWeight(400) as any,
                  }}
                >
                  {aiProgressNotes.narrative}
                </Text>
                <Text
                  style={{
                    marginTop: 10,
                    color: colors.subtext,
                    fontSize: getScaledFontSize(11),
                    fontWeight: getScaledFontWeight(400) as any,
                  }}
                >
                  Generated {new Date(aiProgressNotes.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {aiProgressNotes.fromCache ? ' · cached' : ''}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                No progress notes yet for this provider.
              </Text>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const handleSwitchChange = async (targetProviderId: string, targetProviderName: string, value: boolean) => {
    if (value) {
      // If turning on, show consent modal
      setPendingProviderId(targetProviderId);
      setPendingProviderName(targetProviderName);
      setShowConsentModal(true);
    } else {
      // If turning off, update UI and try to revoke via API
      setDoctorShares(prev => ({ ...prev, [targetProviderId]: false }));
      try {
        await revokeDataShare(targetProviderId);
      } catch {
        // API not available yet — UI already updated
      }
    }
  };

  const handleConsentYes = async () => {
    if (pendingProviderId) {
      const targetProvider = otherProviders.find(p => p.id === pendingProviderId);
      const providerEmail = targetProvider?.email || '';

      // Update UI immediately
      setDoctorShares(prev => ({ ...prev, [pendingProviderId]: true }));
      setShowConsentModal(false);
      setPendingProviderId(null);
      setPendingProviderName('');

      // Try to persist via API (non-blocking)
      try {
        await grantDataShare(
          pendingProviderId,
          pendingProviderName,
          providerEmail,
          doctorName,
        );
        if (providerEmail) {
          Alert.alert('Success', `${pendingProviderName} will receive an email notification about the shared access.`);
        }
      } catch {
        // API not available yet — consent recorded locally
      }
    }
  };

  const handleConsentNo = () => {
    setShowConsentModal(false);
    setPendingProviderId(null);
    setPendingProviderName('');
  };

  const renderShareData = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionSubtitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginBottom: getScaledFontSize(16) }]}>
        Choose which doctors can access your data
      </Text>
      {isLoadingProviders ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading providers...</Text>
        </View>
      ) : otherProviders.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>No other providers found</Text>
        </View>
      ) : (
        otherProviders.map((provider) => {
          const isSelected = doctorShares[provider.id] || false;
          return (
            <View
              key={provider.id}
              style={[
                styles.providerShareItem,
                {
                  borderBottomColor: colors.text + '20',
                  backgroundColor: isSelected ? (colors.tint || '#008080') + '15' : 'transparent',
                }
              ]}
            >
              <View style={styles.providerShareContent}>
                <InitialsAvatar
                  name={provider.name}
                  size={getScaledFontSize(56)}
                  style={styles.providerShareAvatar}
                  image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : undefined}
                />
                <View style={[styles.providerShareInfo, { marginLeft: getScaledFontSize(16) }]}>
                  <Text style={[
                    styles.providerShareName,
                    {
                      fontSize: getScaledFontSize(16),
                      fontWeight: getScaledFontWeight(600) as any,
                      color: colors.text,
                      marginBottom: getScaledFontSize(4),
                    }
                  ]}>
                    {provider.name}
                  </Text>
                  <Text style={[
                    styles.providerShareQual,
                    {
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(400) as any,
                      color: colors.text + '80',
                    }
                  ]}>
                    {provider.qualifications || provider.specialty || 'Healthcare Provider'}
                  </Text>
                </View>
                <View style={[styles.switchContainer, { marginLeft: getScaledFontSize(12) }]}>
                  <Switch
                    value={isSelected}
                    onValueChange={(value) => handleSwitchChange(provider.id, provider.name, value)}
                    color={colors.tint || '#008080'}
                  />
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // Per-provider Medications tab. Shows only the medications attributed
  // to THIS provider (recorder/asserter/requester ref or via encounter
  // linkage), sorted active-first then by authoredOn date.
  const renderProviderMedications = () => {
    const meds = treatmentPlans.medications;
    const isActiveLike = (m: typeof meds[number]) => {
      const code = inferMedicationStatus(m).code;
      return code === 'active' || code === 'on-hold';
    };
    const sorted = [...meds].sort((a, b) => {
      const aActive = isActiveLike(a) ? 0 : 1;
      const bActive = isActiveLike(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aDate = a.authoredOn ? new Date(a.authoredOn).getTime() : 0;
      const bDate = b.authoredOn ? new Date(b.authoredOn).getTime() : 0;
      return bDate - aDate;
    });
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 24 }}>
        {isLoadingData ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14) }}>Loading medications…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              No medications recorded by this provider in your EHR.
            </Text>
          </View>
        ) : (
          sorted.map((m) => {
            const statusStyle = inferMedicationStatus(m);
            const sig = [m.dose, m.frequency].filter(Boolean).join(' · ');
            return (
              <Card key={m.id} style={{ marginBottom: 8, backgroundColor: colors.card }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Text
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: getScaledFontSize(15),
                        fontWeight: getScaledFontWeight(700) as any,
                        lineHeight: getScaledFontSize(20),
                      }}
                      numberOfLines={2}
                    >
                      {m.name}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: statusStyle.bg }}>
                      <Text
                        style={{
                          color: statusStyle.fg,
                          fontSize: getScaledFontSize(11),
                          fontWeight: getScaledFontWeight(700) as any,
                          letterSpacing: 0.4,
                        }}
                      >
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>
                  {sig && (
                    <Text
                      style={{
                        marginTop: 6,
                        color: colors.text,
                        fontSize: getScaledFontSize(13),
                        fontWeight: getScaledFontWeight(500) as any,
                      }}
                      numberOfLines={2}
                    >
                      {sig}
                    </Text>
                  )}
                  {m.reason && (
                    <Text
                      style={{
                        marginTop: 4,
                        color: colors.subtext,
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(400) as any,
                      }}
                      numberOfLines={2}
                    >
                      For {m.reason}
                    </Text>
                  )}
                  {m.authoredOn && (
                    <Text
                      style={{
                        marginTop: 4,
                        color: colors.subtext,
                        fontSize: getScaledFontSize(11),
                        fontWeight: getScaledFontWeight(400) as any,
                      }}
                    >
                      {isActiveLike(m) ? 'Started' : 'Last filled'}{' '}
                      {new Date(m.authoredOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </Card.Content>
              </Card>
            );
          })
        )}
      </ScrollView>
    );
  };

  const renderAppointments = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Past / Recommended sub-tab toggle */}
      <View style={styles.subTabRow}>
        {(['past', 'recommended'] as const).map((key) => {
          const active = appointmentSubTab === key;
          const count = key === 'past' ? pastVisits.length : recommendedForProvider.length;
          const label = key === 'past' ? 'Past Visits' : 'Recommended';
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setAppointmentSubTab(key)}
              style={[
                styles.subTabItem,
                active && { backgroundColor: colors.primary },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={{
                  color: active ? '#fff' : colors.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {label}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoadingData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading…</Text>
        </View>
      ) : appointmentSubTab === 'past' ? (
        <>
          {pastVisits.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={[{ color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                No appointments or encounters on record with this provider yet.
              </Text>
            </View>
          ) : (
            pastVisits.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            ))
          )}
        </>
      ) : recommendedForProvider.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }]}>
            No recommended appointments with this provider right now.
          </Text>
        </View>
      ) : (
        recommendedForProvider.map((rec) => (
          <RecommendedCard
            key={rec.id}
            rec={rec}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        ))
      )}
    </ScrollView>
  );

  const renderCarePlans = () => (
    <ScrollView style={styles.tabContent}>
      {isLoadingData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading care plans...</Text>
        </View>
      ) : carePlans.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>No care plans available</Text>
        </View>
      ) : (
        carePlans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <Text style={[styles.planTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any, color: colors.text }]}>
                  {plan.category || 'Care Plan'}
                </Text>
                {plan.status && (
                  <View style={[styles.statusBadge, { backgroundColor: plan.status === 'active' ? '#008080' : '#9E9E9E' }]}>
                    <Text style={[styles.statusText, { fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>{plan.status}</Text>
                  </View>
                )}
              </View>
              {plan.conditions.length > 0 && (
                <View style={{ marginTop: getScaledFontSize(8), marginBottom: getScaledFontSize(8) }}>
                  <Text style={{ fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, color: colors.text, marginBottom: getScaledFontSize(4) }}>
                    Conditions Addressed:
                  </Text>
                  {plan.conditions.map((condition, idx) => (
                    <Text key={idx} style={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '90' }}>
                      {'\u2022'} {condition}
                    </Text>
                  ))}
                </View>
              )}
              {plan.activities.length > 0 && (
                <View style={{ marginTop: getScaledFontSize(8) }}>
                  <Text style={{ fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, color: colors.text, marginBottom: getScaledFontSize(4) }}>
                    Activities:
                  </Text>
                  {plan.activities.map((activity, idx) => {
                    // FHIR `kind` for an activity is a resource type
                    // ("ServiceRequest", "Task") that isn't meaningful to
                    // patients. Show it only as a label when no
                    // description is available AND the kind looks like a
                    // human-readable category. For raw resource types,
                    // skip the "Type: …" line entirely.
                    const kindIsResourceType = activity.kind
                      ? /^[A-Z][a-zA-Z]+$/.test(activity.kind)
                      : false;
                    const showKind =
                      activity.kind && !activity.description && !kindIsResourceType;
                    // 'not-started' is the FHIR default and conveys no
                    // information ("we have a plan but haven't started").
                    // Only surface a status badge once it has actually
                    // moved (scheduled / in-progress / completed / on-hold
                    // / cancelled).
                    const showStatusBadge =
                      activity.status &&
                      activity.status !== 'not-started' &&
                      activity.status !== 'unknown';
                    const hasAnyDetail =
                      !!activity.description ||
                      showKind ||
                      activity.scheduledStart ||
                      activity.scheduledEnd ||
                      showStatusBadge;
                    if (!hasAnyDetail) return null;
                    return (
                      <View key={idx} style={{ paddingVertical: getScaledFontSize(4), borderBottomWidth: idx < plan.activities.length - 1 ? 1 : 0, borderBottomColor: colors.text + '15' }}>
                        {activity.description && (
                          <Text style={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}>
                            {activity.description}
                          </Text>
                        )}
                        {showKind && (
                          <Text style={{ fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '70' }}>
                            {activity.kind}
                          </Text>
                        )}
                        {(activity.scheduledStart || activity.scheduledEnd) && (
                          <Text style={{ fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '70' }}>
                            Scheduled: {activity.scheduledStart || ''}{activity.scheduledEnd ? ` - ${activity.scheduledEnd}` : ''}
                          </Text>
                        )}
                        {showStatusBadge && (
                          <View style={[styles.statusBadge, { backgroundColor: activity.status === 'scheduled' || activity.status === 'in-progress' ? '#008080' : '#9E9E9E', marginTop: getScaledFontSize(4), alignSelf: 'flex-start' }]}>
                            <Text style={[styles.statusText, { fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(500) as any }]}>{activity.status}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
              {plan.textSummary && (
                <Text style={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '80', marginTop: getScaledFontSize(8) }}>
                  {plan.textSummary}
                </Text>
              )}
            </Card.Content>
          </Card>
        ))
      )}
    </ScrollView>
  );

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        {/* Doctor Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {doctorData?.photoUrl ? (
              <Avatar.Image 
                size={getScaledFontSize(120)} 
                source={{ uri: doctorData.photoUrl }} 
                style={styles.doctorAvatar} 
              />
            ) : (
              <InitialsAvatar name={doctorName} size={getScaledFontSize(120)} style={styles.doctorAvatar} />
            )}
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: colors.tint, width: getScaledFontSize(40), height: getScaledFontSize(40), borderRadius: getScaledFontSize(20) }]}
              onPress={handleEditPress}
            >
              <MaterialIcons name="edit" size={getScaledFontSize(20)} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.doctorName, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>{doctorName}</Text>
          <Text style={[styles.qualifications, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>{doctorQualifications}</Text>
          {doctorSpecialty && doctorSpecialty !== 'General' && (
            <Text style={[styles.specialty, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
              Specialist in {doctorSpecialty}
            </Text>
          )}
        
        {/* Communication Options */}
        <View style={styles.communicationContainer}>
          <TouchableOpacity
            style={[styles.communicationButton, { backgroundColor: colors.background, opacity: doctorPhone ? 1 : 0.4 }]}
            onPress={handleCall}
            disabled={!doctorPhone}
            accessibilityLabel="Call doctor"
            accessibilityRole="button"
          >
            <MaterialIcons name="phone" size={getScaledFontSize(24)} color="#008080" />
            <Text style={[styles.communicationLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.communicationButton, { backgroundColor: colors.background, opacity: doctorPhone ? 1 : 0.4 }]}
            onPress={handleMessage}
            disabled={!doctorPhone}
            accessibilityLabel="Message doctor"
            accessibilityRole="button"
          >
            <MaterialIcons name="message" size={getScaledFontSize(24)} color="#008080" />
            <Text style={[styles.communicationLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.communicationButton, { backgroundColor: colors.background, opacity: doctorPhone ? 1 : 0.4 }]}
            onPress={handleVideoCall}
            disabled={!doctorPhone}
            accessibilityLabel="Video call doctor"
            accessibilityRole="button"
          >
            <MaterialIcons name="videocam" size={getScaledFontSize(24)} color="#008080" />
            <Text style={[styles.communicationLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Video</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.communicationButton, { backgroundColor: colors.background, opacity: doctorEmail ? 1 : 0.4 }]}
            onPress={handleEmail}
            disabled={!doctorEmail}
            accessibilityLabel="Email doctor"
            accessibilityRole="button"
          >
            <MaterialIcons name="email" size={getScaledFontSize(24)} color="#008080" />
            <Text style={[styles.communicationLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Mail</Text>
          </TouchableOpacity>
        </View>
      </View>

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
      {/* CarePlan rendering intentionally NOT mounted on per-provider tabs:
          FHIR CarePlan is a patient-level resource so it would render
          identically on every provider's screen — confusing UX. The
          renderCarePlans helper is retained because its empty-state
          message logic is still consulted from renderTreatmentPlan
          (the "No diagnoses or prescriptions recorded" suppression).
          A follow-up ticket will surface CarePlan content at the
          patient level (home or a dedicated screen). */}
      {activeTab === 'treatment' && renderTreatmentPlan()}
      {activeTab === 'progress' && renderProgressNotes()}
      {activeTab === 'medications' && renderProviderMedications()}
      {activeTab === 'share' && renderShareData()}
      {activeTab === 'appointments' && renderAppointments()}
    </ScrollView>

    {/* Edit Modal */}
    <Portal>
      <Modal
        visible={isEditModalVisible}
        onDismiss={handleCancel}
        contentContainerStyle={[
          styles.editModalContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={[styles.editModalHandleBar, { backgroundColor: colors.border }]} />

        <View style={styles.editModalHeader}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            Edit Provider
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              marginTop: 4,
            }}
          >
            Update the details we show on this provider&apos;s card.
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.editModalBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero: avatar with camera chip — tap to change, remove via text link */}
          <View style={styles.editAvatarHero}>
            <TouchableOpacity
              onPress={handlePickImage}
              accessibilityRole="button"
              accessibilityLabel={editedData.photoUrl ? 'Change photo' : 'Add photo'}
              style={{ position: 'relative' }}
            >
              {editedData.photoUrl ? (
                <Image
                  source={{ uri: editedData.photoUrl }}
                  style={styles.editAvatarImage}
                />
              ) : (
                <InitialsAvatar name={editedData.name} size={getScaledFontSize(112)} />
              )}
              <View
                style={[
                  styles.editAvatarCameraChip,
                  { backgroundColor: colors.primary, borderColor: colors.background },
                ]}
              >
                <MaterialIcons
                  name="photo-camera"
                  size={getScaledFontSize(18)}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickImage}
              style={{ marginTop: 12 }}
              accessibilityRole="button"
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {editedData.photoUrl ? 'Change photo' : 'Add photo'}
              </Text>
            </TouchableOpacity>

            {editedData.photoUrl && (
              <TouchableOpacity
                onPress={() => setEditedData({ ...editedData, photoUrl: '' })}
                style={{ marginTop: 6 }}
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: '#B91C1C',
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(500) as any,
                  }}
                >
                  Remove photo
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ gap: 14, marginTop: 12 }}>
            <PaperTextInput
              mode="outlined"
              label="Name"
              value={editedData.name}
              onChangeText={(text) => setEditedData({ ...editedData, name: text })}
              placeholder="Doctor name"
              style={styles.editPaperInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              textColor={colors.text}
              outlineStyle={{ borderRadius: 16, borderWidth: 1.5 }}
              theme={{ roundness: 16 }}
            />
            <PaperTextInput
              mode="outlined"
              label="Specialty"
              value={editedData.specialty}
              onChangeText={(text) => setEditedData({ ...editedData, specialty: text })}
              placeholder="e.g. Primary Care"
              style={styles.editPaperInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              textColor={colors.text}
              outlineStyle={{ borderRadius: 16, borderWidth: 1.5 }}
              theme={{ roundness: 16 }}
            />
            <PaperTextInput
              mode="outlined"
              label="Phone"
              value={editedData.phone}
              onChangeText={(text) => setEditedData({ ...editedData, phone: text })}
              placeholder="(555) 555-5555"
              keyboardType="phone-pad"
              style={styles.editPaperInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              textColor={colors.text}
              outlineStyle={{ borderRadius: 16, borderWidth: 1.5 }}
              theme={{ roundness: 16 }}
            />
            <PaperTextInput
              mode="outlined"
              label="Email"
              value={editedData.email}
              onChangeText={(text) => setEditedData({ ...editedData, email: text })}
              placeholder="doctor@clinic.com"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.editPaperInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              textColor={colors.text}
              outlineStyle={{ borderRadius: 16, borderWidth: 1.5 }}
              theme={{ roundness: 16 }}
            />
          </View>
        </ScrollView>

        <View
          style={[
            styles.editModalFooter,
            { borderTopColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.editSecondaryButton,
              {
                borderColor: colors.border,
                backgroundColor: pressed ? colors.card : 'transparent',
              },
            ]}
            accessibilityRole="button"
          >
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.editPrimaryButton,
              {
                backgroundColor: isSaving ? '#9CA3AF' : colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                style={{
                  color: '#fff',
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                Save changes
              </Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </Portal>

    {/* Consent Modal */}
    <RNModal
      visible={showConsentModal}
      transparent={true}
      animationType="fade"
      onRequestClose={handleConsentNo}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.consentModalContent, { backgroundColor: colors.background }]}>
          <View style={styles.consentModalHeader}>
            <Text style={[styles.consentModalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
              Data Sharing Consent
            </Text>
            <TouchableOpacity onPress={handleConsentNo} style={styles.consentModalCloseButton}>
              <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.consentModalScrollView, { maxHeight: getScaledFontSize(400) }]} showsVerticalScrollIndicator={true}>
            <View style={styles.consentSection}>
              <Text style={[styles.consentQuestion, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any, lineHeight: getScaledFontSize(26) }]}>
                Do you consent to share your health-related data with {pendingProviderName}?
              </Text>

              <Text style={[styles.consentDescription, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                By selecting &quot;Yes&quot;, you agree to share your health information with this provider to facilitate care coordination and treatment.
              </Text>
            </View>

            <View style={styles.termsSection}>
              <Text style={[styles.termsTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                Terms and Conditions:
              </Text>

              <View style={[styles.termsList, { gap: getScaledFontSize(12) }]}>
                <View style={[styles.termItem, { gap: getScaledFontSize(12) }]}>
                  <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint || '#008080'} style={{ marginTop: getScaledFontSize(2) }} />
                  <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                    Your health data will be used solely for medical treatment and care coordination purposes.
                  </Text>
                </View>

                <View style={[styles.termItem, { gap: getScaledFontSize(12) }]}>
                  <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint || '#008080'} style={{ marginTop: getScaledFontSize(2) }} />
                  <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                    The provider is required to maintain confidentiality and comply with HIPAA regulations.
                  </Text>
                </View>

                <View style={[styles.termItem, { gap: getScaledFontSize(12) }]}>
                  <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint || '#008080'} style={{ marginTop: getScaledFontSize(2) }} />
                  <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                    You have the right to revoke this consent at any time.
                  </Text>
                </View>

                <View style={[styles.termItem, { gap: getScaledFontSize(12) }]}>
                  <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint || '#008080'} style={{ marginTop: getScaledFontSize(2) }} />
                  <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                    Your data will be shared securely and only with authorized personnel.
                  </Text>
                </View>

                <View style={[styles.termItem, { gap: getScaledFontSize(12) }]}>
                  <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint || '#008080'} style={{ marginTop: getScaledFontSize(2) }} />
                  <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any, lineHeight: getScaledFontSize(22) }]}>
                    The provider will not sell or share your data with third parties.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.consentModalActions}>
            <Button
              mode="outlined"
              onPress={handleConsentNo}
              style={[styles.consentModalButton, { borderColor: colors.text + '40' }]}
              contentStyle={{ minHeight: getScaledFontSize(48) }}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24), color: colors.text }}
            >
              No
            </Button>
            <Button
              mode="contained"
              onPress={handleConsentYes}
              style={[styles.consentModalButton, { backgroundColor: colors.tint || '#008080' }]}
              contentStyle={{ minHeight: getScaledFontSize(48) }}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, lineHeight: getScaledFontSize(24), color: '#fff' }}
            >
              Yes, I Consent
            </Button>
          </View>
        </View>
      </View>
    </RNModal>
    </AppWrapper>
  );
}

/**
 * Format an ISO date (or YYYY-MM-DD prefix) as "MMM D, YYYY". Returns
 * the raw string unchanged if it can't be parsed, so unusual EHR formats
 * survive without blowing up.
 */
function formatShortDate(iso: string): string {
  const slice = iso.slice(0, 10);
  const d = new Date(`${slice}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const URGENCY_STYLE: Record<
  RecommendedAppointment['urgency'],
  { label: string; bg: string; fg: string }
> = {
  urgent: { label: 'Urgent', bg: '#FEE2E2', fg: '#B91C1C' },
  soon: { label: 'Soon', bg: '#FEF3C7', fg: '#B45309' },
  routine: { label: 'Routine', bg: '#E5E7EB', fg: '#374151' },
};

interface RecommendedCardProps {
  rec: RecommendedAppointment;
  colors: typeof Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function RecommendedCard({
  rec,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: RecommendedCardProps) {
  const pill = URGENCY_STYLE[rec.urgency];
  return (
    <Card style={styles.recommendedCard}>
      <Card.Content>
        <View style={styles.diagnosisRow}>
          <Text
            style={{
              flex: 1,
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as any,
              lineHeight: getScaledFontSize(22),
            }}
          >
            {rec.title}
          </Text>
          <View style={[styles.urgencyPill, { backgroundColor: pill.bg }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pill.fg }} />
            <Text
              style={{
                color: pill.fg,
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              {pill.label}
            </Text>
          </View>
        </View>
        {rec.reason && (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: getScaledFontSize(20),
              marginTop: 6,
            }}
          >
            {rec.reason}
          </Text>
        )}
        <View
          style={{
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {rec.specialty && (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
              {rec.specialty}
            </Text>
          )}
          {rec.specialty && rec.recommendedByDate && (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>·</Text>
          )}
          {rec.recommendedByDate && (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
              by {formatShortDate(rec.recommendedByDate)}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Appointment card with an optional "View details" visit expander.
// Only Encounter-backed items get the expander — Appointment resources
// don't have narrative payloads to summarise.
// ────────────────────────────────────────────────────────────────────────
interface AppointmentCardProps {
  appointment: ProviderAppointment;
  colors: typeof Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function AppointmentCard({
  appointment,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AppointmentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isEncounter = appointment.resourceType === 'Encounter';
  const narrativeQuery = useEncounterNarrative(
    isEncounter && expanded ? appointment.id : undefined,
  );
  const narrative = narrativeQuery.data;

  const statusColor =
    appointment.status === 'Completed'
      ? '#6B7280'
      : appointment.status === 'Confirmed'
        ? '#008080'
        : '#FF9800';

  return (
    <Card style={styles.appointmentCard}>
      <Card.Content>
        <View style={styles.appointmentHeader}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.appointmentDate,
                { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any },
              ]}
            >
              {formatShortDate(appointment.date)}
              {appointment.time ? ` · ${appointment.time}` : ''}
            </Text>
            {(appointment.clinicName || appointment.encounterClass) && (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  marginTop: 2,
                }}
              >
                {[appointment.clinicName, appointment.encounterClass].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          <View style={styles.appointmentRight}>
            <Text
              style={[
                styles.appointmentType,
                {
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(500) as any,
                  color: colors.text,
                },
              ]}
            >
              {appointment.type}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor, marginTop: 4 }]}>
              <Text
                style={[
                  styles.statusText,
                  { fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any },
                ]}
              >
                {appointment.status}
              </Text>
            </View>
          </View>
        </View>

        {(appointment.diagnosis || appointment.notes) && (
          <View
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: '#E5E7EB',
              gap: 4,
            }}
          >
            {appointment.diagnosis && (
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13) }}>
                <Text style={{ fontWeight: getScaledFontWeight(600) as any }}>Reason: </Text>
                {appointment.diagnosis}
              </Text>
            )}
            {appointment.notes && (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  lineHeight: getScaledFontSize(18),
                }}
                numberOfLines={expanded ? undefined : 2}
              >
                {appointment.notes}
              </Text>
            )}
          </View>
        )}

        {isEncounter && (
          <>
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 12,
                alignSelf: 'flex-start',
              }}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Hide visit details' : 'View visit details'}
            >
              <MaterialIcons
                name={expanded ? 'expand-less' : 'expand-more'}
                size={getScaledFontSize(16)}
                color={colors.primary}
              />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {expanded ? 'Hide details' : 'View details'}
              </Text>
            </TouchableOpacity>

            {expanded && (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: colors.card,
                  gap: 8,
                }}
              >
                {narrativeQuery.isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
                      Reading the visit record…
                    </Text>
                  </View>
                ) : narrative ? (
                  <>
                    {narrative.summary && (
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(13),
                          lineHeight: getScaledFontSize(20),
                        }}
                      >
                        {narrative.summary}
                      </Text>
                    )}
                    {narrative.keyFindings?.length > 0 && (
                      <View style={{ gap: 3 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: getScaledFontSize(12),
                            fontWeight: getScaledFontWeight(700) as any,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          Key findings
                        </Text>
                        {narrative.keyFindings.map((k, i) => (
                          <Text
                            key={i}
                            style={{
                              color: colors.text,
                              fontSize: getScaledFontSize(12),
                              lineHeight: getScaledFontSize(18),
                            }}
                          >
                            • {k}
                          </Text>
                        ))}
                      </View>
                    )}
                    {narrative.followUps?.length > 0 && (
                      <View style={{ gap: 3 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: getScaledFontSize(12),
                            fontWeight: getScaledFontWeight(700) as any,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          Follow up
                        </Text>
                        {narrative.followUps.map((f, i) => (
                          <Text
                            key={i}
                            style={{
                              color: colors.text,
                              fontSize: getScaledFontSize(12),
                              lineHeight: getScaledFontSize(18),
                            }}
                          >
                            • {f}
                          </Text>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
                    We couldn&apos;t generate a summary for this visit.
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  aiNarrativeCard: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 0,
  },
  aiNarrativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // diagnosisRow kept — still referenced by RecommendedCard layout below.
  diagnosisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    marginBottom: 16,
  },
  editModalContainer: {
    marginHorizontal: 0,
    marginTop: 'auto',
    marginBottom: 0,
    // Generous fixed height — earlier minHeight: '60%' fixed the empty-form
    // bug but felt cramped, so the form gets a near-full-screen sheet
    // (90%) with breathing room around the avatar hero + 4 fields and
    // a comfortable footer.
    height: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    overflow: 'hidden',
  },
  editModalHandleBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  editModalHeader: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  editModalBody: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  editAvatarHero: {
    alignItems: 'center',
    marginBottom: 4,
  },
  editAvatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  editAvatarCameraChip: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  editPaperInput: {
    backgroundColor: 'transparent',
  },
  editModalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editSecondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  editPrimaryButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    marginBottom: 14,
    alignSelf: 'center',
  },
  subTabItem: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedCard: {
    marginBottom: 10,
    borderRadius: 14,
    elevation: 0,
  },
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  doctorAvatar: {
    marginBottom: 16,
  },
  editButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalContainer: {
    margin: 20,
    borderRadius: 16,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  previewImage: {
    borderRadius: 60,
    marginBottom: 16,
  },
  imageButton: {
    marginTop: 12,
  },
  removeImageButton: {
    marginTop: 8,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  doctorName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  qualifications: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  specialty: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  communicationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 24,
    paddingHorizontal: 16,
  },
  communicationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    minWidth: 70,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  communicationLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
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
  aiCard: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 1,
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
    flexShrink: 0,
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
    alignItems: 'flex-start',
    gap: 8,
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
  providerShareItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  providerShareContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerShareAvatar: {
    backgroundColor: 'transparent',
  },
  providerShareInfo: {
    flex: 1,
  },
  providerShareName: {
    // Styles applied inline
  },
  providerShareQual: {
    // Styles applied inline
  },
  switchContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  consentModalContent: {
    width: '95%',
    maxHeight: '85%',
    borderRadius: 16,
    padding: 0,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  consentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  consentModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  consentModalCloseButton: {
    padding: 4,
  },
  consentModalScrollView: {
    padding: 20,
  },
  consentSection: {
    marginBottom: 24,
  },
  consentQuestion: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  consentDescription: {
    fontSize: 14,
  },
  termsSection: {
    marginTop: 8,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  termsList: {
    gap: 12,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  termText: {
    flex: 1,
    fontSize: 14,
  },
  consentModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  consentModalButton: {
    flex: 1,
    paddingVertical: 8,
  },
});
