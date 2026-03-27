import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Alert, Modal, RefreshControl } from 'react-native';
import { Card, Button } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getCareManagerAgencyById, type CareManagerAgency } from '@/services/care-manager-agencies';
import { apiClient } from '@/lib/api-client';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function CareManagerDetailScreen() {
  const params = useLocalSearchParams();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  
  const [agency, setAgency] = useState<CareManagerAgency | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const agencyId = params.id as string | undefined;
  const agencyName = params.name as string || 'Care Management Agency';
  
  // Load agency data from API
  React.useEffect(() => {
    const loadAgency = async () => {
      if (agencyId) {
        const agencyData = await getCareManagerAgencyById(agencyId);
        if (agencyData) {
          setAgency(agencyData);
        } else {
          setAgency({
            id: agencyId,
            name: agencyName,
            description: '',
          });
        }
      }
    };
    loadAgency();
  }, [agencyId, agencyName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (agencyId) {
        const agencyData = await getCareManagerAgencyById(agencyId);
        if (agencyData) {
          setAgency(agencyData);
        }
      }
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, [agencyId]);

  const handleRequestCareManager = () => {
    // Show consent modal first
    setShowConsentModal(true);
  };

  const handleConsentYes = async () => {
    setShowConsentModal(false);
    setIsRequesting(true);
    try {
      await apiClient.post('/v1/care-managers/request', { agencyId });
      Alert.alert(
        'Request Submitted',
        'Your request for a care manager has been submitted successfully. You will be contacted within 24-48 hours.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to submit request. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleConsentNo = () => {
    // Close modal without sending request
    setShowConsentModal(false);
  };

  const handleCall = async () => {
    if (!agency?.phone) return;
    const url = `tel:${agency.phone}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to make a phone call');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to make a phone call');
    }
  };

  const handleEmail = async () => {
    if (!agency?.email) return;
    const url = `mailto:${agency.email}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to send an email');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to send an email');
    }
  };

  const handleWebsite = async () => {
    if (!agency?.website) return;
    const url = agency.website.startsWith('http') ? agency.website : `https://${agency.website}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to open website');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to open website');
    }
  };

  if (!agency) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading agency information...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
            Agency Details
          </Text>
          <View style={{ width: getScaledFontSize(24) }} />
        </View>

      {/* Agency Info Card */}
      <Card style={[styles.agencyCard, { backgroundColor: colors.background }]}>
        <Card.Content>
          <View style={styles.agencyHeader}>
            <View style={[
              styles.agencyIcon,
              {
                width: getScaledFontSize(64),
                height: getScaledFontSize(64),
                borderRadius: getScaledFontSize(32),
                backgroundColor: colors.tint + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}>
              <IconSymbol name="building.2" size={getScaledFontSize(32)} color={colors.tint || '#008080'} />
            </View>
            <View style={styles.agencyTitleContainer}>
              <Text style={[styles.agencyName, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(600) as any }]}>
                {agency.name}
              </Text>
              {agency.rating && (
                <View style={styles.ratingContainer}>
                  <MaterialIcons name="star" size={getScaledFontSize(16)} color="#FFB800" />
                  <Text style={[styles.ratingText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                    {agency.rating} {agency.reviewCount && `(${agency.reviewCount} reviews)`}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Description */}
          <Text style={[styles.description, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(400) as any }]}>
            {agency.description}
          </Text>

          {/* Address */}
          {agency.address && (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={getScaledFontSize(20)} color={colors.tint} />
              <Text style={[styles.infoText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                {agency.address}
                {agency.city && `, ${agency.city}`}
                {agency.state && `, ${agency.state}`}
                {agency.zipCode && ` ${agency.zipCode}`}
              </Text>
            </View>
          )}

          {/* Contact Information */}
          <View style={styles.contactContainer}>
            {agency.phone && (
              <TouchableOpacity 
                style={[styles.contactButton, { backgroundColor: colors.background }]} 
                onPress={handleCall}
              >
                <MaterialIcons name="phone" size={getScaledFontSize(24)} color={colors.tint} />
                <Text style={[styles.contactLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Call</Text>
              </TouchableOpacity>
            )}
            
            {agency.email && (
              <TouchableOpacity 
                style={[styles.contactButton, { backgroundColor: colors.background }]} 
                onPress={handleEmail}
              >
                <MaterialIcons name="email" size={getScaledFontSize(24)} color={colors.tint} />
                <Text style={[styles.contactLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Email</Text>
              </TouchableOpacity>
            )}
            
            {agency.website && (
              <TouchableOpacity 
                style={[styles.contactButton, { backgroundColor: colors.background }]} 
                onPress={handleWebsite}
              >
                <MaterialIcons name="language" size={getScaledFontSize(24)} color={colors.tint} />
                <Text style={[styles.contactLabel, { color: colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Website</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Specialties */}
      {agency.specialties && agency.specialties.length > 0 && (
        <Card style={[styles.sectionCard, { backgroundColor: colors.background }]}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
              Specialties
            </Text>
            {agency.specialties.map((specialty, index) => (
              <View key={index} style={styles.specialtyItem}>
                <MaterialIcons name="check-circle" size={getScaledFontSize(20)} color={colors.tint} />
                <Text style={[styles.specialtyText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                  {specialty}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Services */}
      {agency.services && agency.services.length > 0 && (
        <Card style={[styles.sectionCard, { backgroundColor: colors.background }]}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
              Services
            </Text>
            {agency.services.map((service, index) => (
              <View key={index} style={styles.serviceItem}>
                <MaterialIcons name="medical-services" size={getScaledFontSize(20)} color={colors.tint} />
                <Text style={[styles.serviceText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                  {service}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Request Care Manager Button */}
      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleRequestCareManager}
          loading={isRequesting}
          disabled={isRequesting}
          style={[styles.requestButton, { backgroundColor: colors.tint }]}
          labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
          icon={() => <MaterialIcons name="person-add" size={getScaledFontSize(20)} color="#fff" />}
        >
          Request Care Manager
        </Button>
      </View>

      {/* Consent Modal */}
      <Modal
        visible={showConsentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleConsentNo}
      >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
                  Data Sharing Consent
                </Text>
                <TouchableOpacity onPress={handleConsentNo} style={styles.modalCloseButton}>
                  <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                <View style={styles.consentSection}>
                  <Text style={[styles.consentQuestion, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
                    Do you consent to share your health-related data with {agency?.name}?
                  </Text>
                  
                  <Text style={[styles.consentDescription, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                    By selecting &quot;Yes&quot;, you agree to share your health information with the care management agency to facilitate care coordination and management services.
                  </Text>
                </View>

                <View style={styles.termsSection}>
                  <Text style={[styles.termsTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                    Terms and Conditions:
                  </Text>
                  
                  <View style={styles.termsList}>
                    <View style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        Your health data will be used solely for care management and coordination purposes.
                      </Text>
                    </View>
                    
                    <View style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        The agency is required to maintain confidentiality and comply with HIPAA regulations.
                      </Text>
                    </View>
                    
                    <View style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        You have the right to revoke this consent at any time by contacting the agency.
                      </Text>
                    </View>
                    
                    <View style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        Your data will be shared securely and only with authorized personnel.
                      </Text>
                    </View>
                    
                    <View style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        The agency will not sell or share your data with third parties without your explicit consent.
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={handleConsentNo}
                  style={[styles.modalButton, { borderColor: colors.text + '40' }]}
                  labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}
                >
                  No
                </Button>
                <Button
                  mode="contained"
                  onPress={handleConsentYes}
                  style={[styles.modalButton, { backgroundColor: colors.tint }]}
                  labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
                >
                  Yes, I Consent
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  agencyCard: {
    margin: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  agencyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  agencyIcon: {
    marginRight: 16,
    flexShrink: 0,
  },
  agencyTitleContainer: {
    flex: 1,
  },
  agencyName: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    marginLeft: 4,
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
  },
  contactContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 16,
    gap: 16,
  },
  contactButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 70,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  contactLabel: {
    marginTop: 8,
    fontSize: 12,
  },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  specialtyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  specialtyText: {
    flex: 1,
    fontSize: 14,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  serviceText: {
    flex: 1,
    fontSize: 14,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    marginTop: 8,
  },
  requestButton: {
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    padding: 0,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 8,
  },
});
