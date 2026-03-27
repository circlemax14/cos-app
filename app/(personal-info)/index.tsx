import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Button, Icon, TextInput as PaperTextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchPatientInfo } from '@/services/api/patient';
import { InitialsAvatar } from '@/utils/avatar-utils';

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
      }
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSave = () => {
    console.log('Form data:', formData);
    router.back();
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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
                <InitialsAvatar
                  name={formData.name}
                  size={getScaledFontSize(88)}
                />
                <TouchableOpacity
                  style={[styles.cameraButton, { borderColor: colors.background }]}
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
                  onChangeText={(text) => handleChange('name', text)}
                  style={[styles.input, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  activeUnderlineColor={colors.primary}
                  textColor={colors.text}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>Date of Birth</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.dateOfBirth}
                  onChangeText={(text) => handleChange('dateOfBirth', text)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.disabled}
                  style={[styles.input, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  activeUnderlineColor={colors.primary}
                  textColor={colors.text}
                />
              </View>
              <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
                <Text style={labelStyle}>Gender</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.gender}
                  onChangeText={(text) => handleChange('gender', text)}
                  style={[styles.input, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  activeUnderlineColor={colors.primary}
                  textColor={colors.text}
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
                  onChangeText={(text) => handleChange('address', text)}
                  style={[styles.input, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  activeUnderlineColor={colors.primary}
                  textColor={colors.text}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={labelStyle}>City</Text>
                <PaperTextInput
                  mode="flat"
                  value={formData.city}
                  onChangeText={(text) => handleChange('city', text)}
                  style={[styles.input, { backgroundColor: 'transparent' }]}
                  contentStyle={inputContentStyle}
                  underlineColor={colors.border}
                  activeUnderlineColor={colors.primary}
                  textColor={colors.text}
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.fieldGroup, styles.halfWidth, { marginBottom: 0 }]}>
                  <Text style={labelStyle}>State</Text>
                  <PaperTextInput
                    mode="flat"
                    value={formData.state}
                    onChangeText={(text) => handleChange('state', text)}
                    style={[styles.input, { backgroundColor: 'transparent' }]}
                    contentStyle={inputContentStyle}
                    underlineColor={colors.border}
                    activeUnderlineColor={colors.primary}
                    textColor={colors.text}
                  />
                </View>
                <View style={[styles.fieldGroup, styles.halfWidth, { marginBottom: 0 }]}>
                  <Text style={labelStyle}>Zip Code</Text>
                  <PaperTextInput
                    mode="flat"
                    value={formData.zipCode}
                    onChangeText={(text) => handleChange('zipCode', text)}
                    keyboardType="number-pad"
                    style={[styles.input, { backgroundColor: 'transparent' }]}
                    contentStyle={inputContentStyle}
                    underlineColor={colors.border}
                    activeUnderlineColor={colors.primary}
                    textColor={colors.text}
                  />
                </View>
              </View>
            </View>

            {/* Save Button */}
            <Button
              mode="contained"
              onPress={handleSave}
              style={styles.saveButton}
              contentStyle={styles.saveButtonContent}
              labelStyle={[styles.saveButtonLabel, { fontSize: getScaledFontSize(16), lineHeight: getScaledFontSize(22), fontWeight: getScaledFontWeight(600) as any }]}
              buttonColor={colors.primary}
            >
              Save Changes
            </Button>

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
  // Save
  saveButton: {
    borderRadius: 24,
    marginTop: 8,
  },
  saveButtonContent: {
    minHeight: 52,
  },
  saveButtonLabel: {
    color: 'white',
  },
  bottomSpacer: {
    height: 32,
  },
});
