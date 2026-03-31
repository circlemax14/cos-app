import { getColors } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking, Alert, Platform, Image, Modal as RNModal } from 'react-native';
import { Avatar, Card, Button, Portal, Modal, Switch } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProviderById, fetchProviders, fetchProviderTreatmentPlans, fetchProviderProgressNotes, fetchProviderAppointments, fetchCarePlans, fetchAiInsight } from '@/services/api/providers';
import type { Provider, TreatmentPlanItem, ProgressNote, ProviderAppointment, CarePlanItem } from '@/services/api/types';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { useDoctor } from '@/hooks/use-doctor';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import { AppWrapper } from '@/components/app-wrapper';
import { fetchDataShares, grantDataShare, revokeDataShare } from '@/services/api/data-sharing';

export default function DoctorDetailScreen() {
  const params = useLocalSearchParams();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  
  const [provider, setProvider] = useState<Provider | null>(null);
  const [, setIsLoadingProvider] = useState(false);
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlanItem[]>([]);
  const [progressNotes, setProgressNotes] = useState<ProgressNote[]>([]);
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
  const [aiInsights, setAiInsights] = useState<Record<string, { summary: string; loading: boolean }>>({});

  const loadAiInsight = async (tab: 'treatment' | 'progress' | 'appointments' | 'carePlans') => {
    if (aiInsights[tab]?.summary || aiInsights[tab]?.loading) return;
    setAiInsights((prev) => ({ ...prev, [tab]: { summary: '', loading: true } }));
    const result = await fetchAiInsight(tab, provider?.name);
    setAiInsights((prev) => ({ ...prev, [tab]: { summary: result?.summary ?? 'Unable to generate insights.', loading: false } }));
  };

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
          const [plans, notes, apts, carePlanData] = await Promise.all([
            fetchProviderTreatmentPlans(providerId),
            fetchProviderProgressNotes(providerId),
            fetchProviderAppointments(providerId),
            fetchCarePlans(),
          ]);

          setTreatmentPlans(plans);
          setProgressNotes(notes);
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
        setTreatmentPlans([]);
        setProgressNotes([]);
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
        const [providerData, plans, notes, apts, carePlanData, allProviders, existingShares] = await Promise.all([
          fetchProviderById(providerId),
          fetchProviderTreatmentPlans(providerId),
          fetchProviderProgressNotes(providerId),
          fetchProviderAppointments(providerId),
          fetchCarePlans(),
          fetchProviders(),
          fetchDataShares(),
        ]);
        if (providerData) setProvider(providerData);
        setTreatmentPlans(plans);
        setProgressNotes(notes);
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

  const renderAiInsightCard = (tab: 'treatment' | 'progress' | 'appointments' | 'carePlans') => {
    const insight = aiInsights[tab];
    return (
      <Card style={[styles.aiCard, { backgroundColor: '#F3E8FF' }]}>
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="auto-awesome" size={getScaledFontSize(18)} color="#7C3AED" />
              <Text style={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any, color: '#7C3AED' }}>
                AI Insights
              </Text>
            </View>
            {!insight?.summary && !insight?.loading && (
              <TouchableOpacity onPress={() => loadAiInsight(tab)} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#7C3AED', borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any }}>Generate</Text>
              </TouchableOpacity>
            )}
          </View>
          {insight?.loading ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : insight?.summary ? (
            <Text style={{ fontSize: getScaledFontSize(13), color: '#4C1D95', lineHeight: getScaledFontSize(20) }}>
              {insight.summary}
            </Text>
          ) : (
            <Text style={{ fontSize: getScaledFontSize(13), color: '#6B21A8' }}>
              Tap Generate to get AI-powered analysis of this data.
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderTreatmentPlan = () => (
    <ScrollView style={styles.tabContent}>
      {/* AI Insights temporarily disabled */}
      {isLoadingData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading treatment plans...</Text>
        </View>
      ) : treatmentPlans.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>No treatment plans available</Text>
        </View>
      ) : (
        treatmentPlans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <Text style={[styles.planTitle, { fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>{plan.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: plan.status === 'Active' ? '#008080' : '#9E9E9E' }]}>
                  <Text style={[styles.statusText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{plan.status}</Text>
                </View>
              </View>
              <Text style={[styles.planDate, {  fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{plan.date}</Text>
              <View style={[styles.diagnosisContainer, { marginTop: getScaledFontSize(12), marginBottom: getScaledFontSize(12) }]}>
                <Text style={[styles.diagnosisTitle, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Diagnosis:</Text>
                <Text style={[styles.diagnosis, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]} numberOfLines={0}>{plan.diagnosis}</Text>
              </View>
              <View style={[styles.diagnosisContainer, { marginTop: getScaledFontSize(12), marginBottom: getScaledFontSize(12) }]}>
                <Text style={[styles.diagnosisTitle, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Treatment Recommendations:</Text>
                <Text style={[styles.diagnosis, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]} numberOfLines={0}>{plan.description}</Text>
              </View>
              <Text style={[styles.medicationsTitle, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Medications:</Text>
              {plan.medications.map((med, idx) => (
                <Text key={idx} style={[styles.medication, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>• {med}</Text>
              ))}
            </Card.Content>
          </Card>
        ))
      )}
    </ScrollView>
  );

  const renderProgressNotes = () => (
    <ScrollView style={styles.tabContent}>
      {/* AI Insights temporarily disabled */}
      {isLoadingData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading progress notes...</Text>
        </View>
      ) : progressNotes.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>No progress notes available</Text>
        </View>
      ) : (
        progressNotes.map((note) => (
        <Card key={note.id} style={styles.progressNoteCard}>
          <Card.Content>
            <View style={styles.progressNoteHeader}>
              <View>
                <Text style={[styles.progressNoteDate, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>{note.date}</Text>
                <Text style={[styles.progressNoteTime, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{note.time}</Text>
              </View>
              <Text style={[styles.progressNoteAuthor, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{note.author}</Text>
            </View>
            <Text style={[styles.progressNoteText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>{note.note}</Text>
          </Card.Content>
        </Card>
        ))
      )}
    </ScrollView>
  );

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

  const renderAppointments = () => (
    <ScrollView style={styles.tabContent}>
      {/* AI Insights temporarily disabled */}
      {isLoadingData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading appointments...</Text>
        </View>
      ) : appointments.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>No appointments available</Text>
        </View>
      ) : (
        appointments.map((appointment) => (
        <Card key={appointment.id} style={styles.appointmentCard}>
          <Card.Content>
            <View style={styles.appointmentHeader}>
              <View>
                <Text style={[styles.appointmentDate, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{appointment.date}</Text>
                <Text style={[styles.appointmentTime, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{appointment.time}</Text>
              </View>
              <View style={styles.appointmentRight}>
                <Text style={[styles.appointmentType, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{appointment.type}</Text>
                <View style={[styles.statusBadge, { backgroundColor: appointment.status === 'Confirmed' ? '#008080' : '#FF9800' }]}>
                  <Text style={[styles.statusText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>{appointment.status}</Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>
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
                  {plan.activities.map((activity, idx) => (
                    <View key={idx} style={{ paddingVertical: getScaledFontSize(4), borderBottomWidth: idx < plan.activities.length - 1 ? 1 : 0, borderBottomColor: colors.text + '15' }}>
                      {activity.description && (
                        <Text style={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}>
                          {activity.description}
                        </Text>
                      )}
                      {activity.kind && (
                        <Text style={{ fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '70' }}>
                          Type: {activity.kind}
                        </Text>
                      )}
                      {(activity.scheduledStart || activity.scheduledEnd) && (
                        <Text style={{ fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any, color: colors.text + '70' }}>
                          Scheduled: {activity.scheduledStart || ''}{activity.scheduledEnd ? ` - ${activity.scheduledEnd}` : ''}
                        </Text>
                      )}
                      {activity.status && (
                        <View style={[styles.statusBadge, { backgroundColor: activity.status === 'scheduled' ? '#008080' : '#9E9E9E', marginTop: getScaledFontSize(4), alignSelf: 'flex-start' }]}>
                          <Text style={[styles.statusText, { fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(500) as any }]}>{activity.status}</Text>
                        </View>
                      )}
                    </View>
                  ))}
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
        <View style={[styles.header, { backgroundColor: colors.background }]}>
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
      {activeTab === 'treatment' && (
        <>
          {renderTreatmentPlan()}
          {renderCarePlans()}
        </>
      )}
      {activeTab === 'progress' && renderProgressNotes()}
      {activeTab === 'share' && renderShareData()}
      {activeTab === 'appointments' && renderAppointments()}
    </ScrollView>

    {/* Edit Modal */}
    <Portal>
      <Modal
        visible={isEditModalVisible}
        onDismiss={handleCancel}
        contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <ScrollView style={styles.modalContent}>
          <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any, marginBottom: getScaledFontSize(24) }]}>
            Edit Doctor Information
          </Text>

          {/* Profile Picture */}
          <View style={styles.imageSection}>
            {editedData.photoUrl ? (
              <Image source={{ uri: editedData.photoUrl }} style={[styles.previewImage, { width: getScaledFontSize(120), height: getScaledFontSize(120) }]} />
            ) : (
              <InitialsAvatar name={editedData.name} size={getScaledFontSize(120)} />
            )}
            <Button
              mode="outlined"
              onPress={handlePickImage}
              style={[styles.imageButton, { borderColor: colors.tint }]}
              contentStyle={{ minHeight: getScaledFontSize(44) }}
              labelStyle={{ fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(20) }}
            >
              {editedData.photoUrl ? 'Change Photo' : 'Add Photo'}
            </Button>
            {editedData.photoUrl && (
              <Button
                mode="text"
                onPress={() => setEditedData({ ...editedData, photoUrl: '' })}
                style={styles.removeImageButton}
                contentStyle={{ minHeight: getScaledFontSize(40) }}
                labelStyle={{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(18), color: '#ff4444' }}
              >
                Remove Photo
              </Button>
            )}
          </View>

          {/* Name */}
          <View style={[styles.inputSection, { marginBottom: getScaledFontSize(20) }]}>
            <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginBottom: getScaledFontSize(8) }]}>
              Name
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16), padding: getScaledFontSize(12), minHeight: getScaledFontSize(48) }]}
              value={editedData.name}
              onChangeText={(text) => setEditedData({ ...editedData, name: text })}
              placeholder="Doctor name"
              placeholderTextColor={colors.text + '60'}
            />
          </View>

          {/* Specialty */}
          <View style={[styles.inputSection, { marginBottom: getScaledFontSize(20) }]}>
            <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginBottom: getScaledFontSize(8) }]}>
              Specialty
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16), padding: getScaledFontSize(12), minHeight: getScaledFontSize(48) }]}
              value={editedData.specialty}
              onChangeText={(text) => setEditedData({ ...editedData, specialty: text })}
              placeholder="Specialty"
              placeholderTextColor={colors.text + '60'}
            />
          </View>

          {/* Phone */}
          <View style={[styles.inputSection, { marginBottom: getScaledFontSize(20) }]}>
            <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginBottom: getScaledFontSize(8) }]}>
              Phone
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16), padding: getScaledFontSize(12), minHeight: getScaledFontSize(48) }]}
              value={editedData.phone}
              onChangeText={(text) => setEditedData({ ...editedData, phone: text })}
              placeholder="Phone number"
              placeholderTextColor={colors.text + '60'}
              keyboardType="phone-pad"
            />
          </View>

          {/* Email */}
          <View style={[styles.inputSection, { marginBottom: getScaledFontSize(20) }]}>
            <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginBottom: getScaledFontSize(8) }]}>
              Email
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16), padding: getScaledFontSize(12), minHeight: getScaledFontSize(48) }]}
              value={editedData.email}
              onChangeText={(text) => setEditedData({ ...editedData, email: text })}
              placeholder="Email address"
              placeholderTextColor={colors.text + '60'}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Action Buttons */}
          <View style={[styles.modalActions, { marginTop: getScaledFontSize(24) }]}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={[styles.modalButton, { borderColor: colors.border }]}
              contentStyle={{ minHeight: getScaledFontSize(48) }}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              style={[styles.modalButton, { backgroundColor: colors.tint }]}
              contentStyle={{ minHeight: getScaledFontSize(48) }}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24), color: '#fff' }}
            >
              Save
            </Button>
          </View>
        </ScrollView>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'white',
    marginBottom: 16,
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
