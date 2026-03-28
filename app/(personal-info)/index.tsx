import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Icon, TextInput as PaperTextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchPatientInfo } from '@/services/api/patient';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '@/lib/api-client';
import { getPresignedUploadUrl, confirmPhotoUpload, getPhotoDownloadUrl } from '@/services/user-photo';

export default function PersonalInfoScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const emptyFormData = {
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  };

  const [formData, setFormData] = useState(emptyFormData);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadPhoto = useCallback(async (uri: string) => {
    setIsUploading(true);
    try {
      const fileName = uri.split('/').pop() || 'profile.jpg';
      const contentType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';

      const { uploadUrl, photoUrl } = await getPresignedUploadUrl(fileName, contentType);

      const fileResponse = await fetch(uri);
      const blob = await fileResponse.blob();

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });

      await confirmPhotoUpload(photoUrl);

      // Get presigned download URL to display the image
      const downloadUrl = await getPhotoDownloadUrl();
      setPhotoUri(downloadUrl || photoUrl);
    } catch {
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handlePickImage = useCallback(() => {
    Alert.alert('Update Profile Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera permission is needed to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library permission is needed to choose a photo.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  useEffect(() => {
    const loadPatientData = async () => {
      setIsLoadingPatient(true);
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setFormData({
            name: patient.name || '',
            email: patient.email || '',
            phone: patient.phone || '',
            dateOfBirth: patient.dateOfBirth || '',
            gender: patient.gender || '',
            address: patient.address || '',
            city: patient.city || '',
            state: patient.state || '',
            zipCode: patient.zipCode || '',
          });
          // Load profile photo via presigned download URL
          if ((patient as any).photoUrl) {
            const downloadUrl = await getPhotoDownloadUrl();
            setPhotoUri(downloadUrl || (patient as any).photoUrl);
          }
          // Fallback: if email is empty, try getting from auth /me endpoint
          if (!patient.email) {
            try {
              const meResponse = await apiClient.get('/v1/auth/me');
              const meData = meResponse.data?.data;
              if (meData?.email) {
                setFormData(prev => ({ ...prev, email: meData.email }));
              }
            } catch {
              // ignore — email fallback is best-effort
            }
          }
        }
      } catch (error) {
        console.error('Error loading patient data:', error);
      } finally {
        setIsLoadingPatient(false);
      }
    };
    loadPatientData();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const patient = await fetchPatientInfo();
      if (patient) {
        setFormData({
          name: patient.name || '',
          email: patient.email || '',
          phone: patient.phone || '',
          dateOfBirth: patient.dateOfBirth || '',
          gender: patient.gender || '',
          address: patient.address || '',
          city: patient.city || '',
          state: patient.state || '',
          zipCode: patient.zipCode || '',
        });
        if ((patient as any).photoUrl) {
          const downloadUrl = await getPhotoDownloadUrl();
          setPhotoUri(downloadUrl || (patient as any).photoUrl);
        }
        // Fallback: if email is empty, try getting from auth /me endpoint
        if (!patient.email) {
          try {
            const meResponse = await apiClient.get('/v1/auth/me');
            const meData = meResponse.data?.data;
            if (meData?.email) {
              setFormData(prev => ({ ...prev, email: meData.email }));
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, []);

  const sectionTitleStyle = {
    color: colors.text,
    fontSize: getScaledFontSize(15),
    lineHeight: getScaledFontSize(20),
    fontWeight: getScaledFontWeight(600) as any,
  };

  const labelStyle = {
    color: colors.subtext,
    fontSize: getScaledFontSize(13),
    lineHeight: getScaledFontSize(18),
    fontWeight: getScaledFontWeight(500) as any,
  };

  const inputContentStyle = {
    fontSize: getScaledFontSize(15),
  };

  const cardStyle = [
    styles.sectionCard,
    {
      backgroundColor: settings.isDarkTheme ? colors.card : '#fafafa',
      borderColor: colors.border,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Icon source="arrow-left" size={getScaledFontSize(24)} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(18), lineHeight: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>
          Personal Information
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoadingPatient ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
          >
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={{
                      width: getScaledFontSize(120),
                      height: getScaledFontSize(120),
                      borderRadius: getScaledFontSize(60),
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <InitialsAvatar
                    name={formData.name}
                    size={getScaledFontSize(120)}
                  />
                )}
                {isUploading && (
                  <View style={[styles.uploadingOverlay, { width: getScaledFontSize(120), height: getScaledFontSize(120), borderRadius: getScaledFontSize(60) }]}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.cameraButton, { borderColor: colors.background }]}
                  onPress={handlePickImage}
                  disabled={isUploading}
                  accessibilityLabel="Update profile photo"
                >
                  <Icon source="camera" size={getScaledFontSize(16)} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={[styles.avatarName, { color: colors.text, fontSize: getScaledFontSize(18), lineHeight: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>
                {formData.name || 'Your Name'}
              </Text>
              {formData.email ? (
                <Text style={[styles.avatarEmail, { color: colors.subtext, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(18) }]}>
                  {formData.email}
                </Text>
              ) : null}
            </View>

            {/* Personal Details Section */}
            <View style={cardStyle}>
              <View style={styles.sectionHeader}>
                <Icon source="account-outline" size={getScaledFontSize(18)} color={colors.primary} />
                <Text style={sectionTitleStyle}>Personal Details</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>Full Name</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.name}
                  disabled={true}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>Date of Birth</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.dateOfBirth}
                  disabled={true}
                  editable={false}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.disabled}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
              <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
                <Text style={labelStyle}>Gender</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.gender}
                  disabled={true}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
            </View>

            {/* Account Section */}
            <View style={cardStyle}>
              <View style={styles.sectionHeader}>
                <Icon source="shield-lock-outline" size={getScaledFontSize(18)} color={colors.primary} />
                <Text style={sectionTitleStyle}>Account</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>Email</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.email}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
              <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
                <Text style={labelStyle}>Phone</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.phone}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
            </View>

            {/* Address Section */}
            <View style={cardStyle}>
              <View style={styles.sectionHeader}>
                <Icon source="map-marker-outline" size={getScaledFontSize(18)} color={colors.primary} />
                <Text style={sectionTitleStyle}>Address</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>Street Address</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.address}
                  disabled={true}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>City</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.city}
                  disabled={true}
                  editable={false}
                  style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  textColor={colors.subtext}
                  right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.fieldGroup, styles.halfWidth, { marginBottom: 0 }]}>
                  <Text style={labelStyle}>State</Text>
                  <PaperTextInput
                    mode="flat"
                    value={formData.state}
                    disabled={true}
                    editable={false}
                    style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                    contentStyle={inputContentStyle}
                    underlineColor={colors.border}
                    textColor={colors.subtext}
                    right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                  />
                </View>
                <View style={[styles.fieldGroup, styles.halfWidth, { marginBottom: 0 }]}>
                  <Text style={labelStyle}>Zip Code</Text>
                  <PaperTextInput
                    mode="flat"
                    value={formData.zipCode}
                    disabled={true}
                    editable={false}
                    keyboardType="number-pad"
                    style={[styles.input, styles.disabledInput, { backgroundColor: 'transparent' }]}
                    contentStyle={inputContentStyle}
                    underlineColor={colors.border}
                    textColor={colors.subtext}
                    right={<PaperTextInput.Icon icon="lock-outline" size={getScaledFontSize(16)} color={colors.disabled} />}
                  />
                </View>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    backgroundColor: '#0a7ea4',
    borderRadius: 16,
    padding: 6,
    borderWidth: 2,
  },
  avatarName: {
    textAlign: 'center',
  },
  avatarEmail: {
    textAlign: 'center',
  },
  // Section cards
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  // Fields
  fieldGroup: {
    marginBottom: 12,
  },
  input: {
    height: 44,
    paddingHorizontal: 0,
  },
  disabledInput: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  halfWidth: {
    flex: 1,
  },
  bottomSpacer: {
    height: 32,
  },
});
