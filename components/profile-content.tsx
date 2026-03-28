import { Colors } from '@/constants/theme';
import { fetchPatientInfo } from '@/services/api/patient';
import { signOut } from '@/services/auth';
import { queryClient } from '@/providers/QueryProvider';
import { useAccessibility } from '@/stores/accessibility-store';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { apiClient } from '@/lib/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button, Card, Icon, List } from 'react-native-paper';

export interface ConnectedHospital {
  id: string;
  name: string;
  provider: string;
  connectedDate: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
}

interface ProfileContentProps {
  showEhrSection?: boolean;
  connectedHospitals?: ConnectedHospital[];
  isLoadingClinics?: boolean;
  onConnectEhr?: () => void;
  onSelectHospital?: (hospital: ConnectedHospital) => void;
  showProfileHeader?: boolean;
  showProfileMenu?: boolean;
  showSignOut?: boolean;
  showConnectedEhrButton?: boolean;
  onConnectedEhrPress?: () => void;
  onEmergencyContactPress?: () => void;
  onHealthDetailsPress?: () => void;
  onServicesPress?: () => void;
  onAllergiesPress?: () => void;
  showEhrTitle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function ProfileContent({
  showEhrSection = false,
  connectedHospitals = [],
  isLoadingClinics = false,
  onConnectEhr,
  onSelectHospital,
  showProfileHeader = true,
  showProfileMenu = true,
  showSignOut = true,
  showConnectedEhrButton = false,
  onConnectedEhrPress,
  onEmergencyContactPress,
  onHealthDetailsPress,
  onServicesPress,
  onAllergiesPress,
  showEhrTitle = true,
  containerStyle,
}: ProfileContentProps) {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [patientName, setPatientName] = useState('User');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    const loadPatientData = async () => {
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setPatientName(patient.name || 'User');
          setPatientEmail(patient.email || '');
          if (patient.photoUrl) {
            try {
              const { getPhotoDownloadUrl } = await import('@/services/user-photo');
              const downloadUrl = await getPhotoDownloadUrl();
              setPatientPhotoUrl(downloadUrl || patient.photoUrl);
            } catch {
              setPatientPhotoUrl(patient.photoUrl);
            }
          }

          // Fallback: if email is empty, try getting from auth /me endpoint
          if (!patient.email) {
            try {
              const meResponse = await apiClient.get('/v1/auth/me');
              const meData = meResponse.data?.data;
              if (meData?.email) {
                setPatientEmail(meData.email);
              }
            } catch {
              // ignore — email fallback is best-effort
            }
          }
        }
      } catch {
        // Patient data failed to load — keep defaults
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadPatientData();
  }, []);

  const ehrCountLabel = useMemo(() => {
    if (!showEhrSection) {
      return '';
    }
    return connectedHospitals.length > 0 ? ` (${connectedHospitals.length})` : '';
  }, [connectedHospitals.length, showEhrSection]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }, containerStyle]}
      showsVerticalScrollIndicator={false}
    >
      {showProfileHeader && (
        <View style={styles.header}>
          {isLoadingProfile ? (
            <ActivityIndicator size="large" color={colors.tint} style={{ marginVertical: 24 }} />
          ) : (
            <>
              {patientPhotoUrl ? (
                <Image
                  source={{ uri: patientPhotoUrl }}
                  style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16 }}
                  contentFit="cover"
                />
              ) : (
                <InitialsAvatar name={patientName} size={80} style={styles.avatar} />
              )}
              <Text style={[styles.name, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>{patientName}</Text>
              <Text style={[{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>{patientEmail}</Text>
            </>
          )}
        </View>
      )}

      {showProfileMenu && (
        <View style={styles.menuSection}>
          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Personal Information</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Update your profile details</Text>}
              left={(props) => <Icon {...props} source="account" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => router.push('/(personal-info)')}
            />
          </Card>

          {/* TODO: Temporarily hidden — re-enable when ready
          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Services</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>View and manage your services</Text>}
              left={(props) => <Icon {...props} source="bag-personal" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {
                if (onServicesPress) {
                  onServicesPress();
                } else {
                  router.push('/Home/services');
                }
              }}
            />
          </Card>

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Services</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>View and manage your services</Text>}
              left={(props) => <Icon {...props} source="bag-personal" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {
                if (onServicesPress) {
                  onServicesPress();
                } else {
                  router.push('/Home/services');
                }
              }}
            />
          </Card>

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Health Details</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>View and manage your health information</Text>}
              left={(props) => <Icon {...props} source="medical-bag" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {
                if (onHealthDetailsPress) {
                  onHealthDetailsPress();
                }
              }}
            />
          </Card>

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Proxy Management</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Manage your proxy access</Text>}
              left={(props) => <Icon {...props} source="account-supervisor" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => router.push('/Home/proxy-management')}
            />
          </Card>
          */}

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Emergency Contact</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Manage your emergency contact</Text>}
              left={(props) => <Icon {...props} source="account-group" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {
                if (onEmergencyContactPress) {
                  onEmergencyContactPress();
                }
              }}
            />
          </Card>

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Allergies</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>View your allergy records from EHR</Text>}
              left={(props) => <Icon {...props} source="alert-circle" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {
                if (onAllergiesPress) {
                  onAllergiesPress();
                }
              }}
            />
          </Card>

          {/* TODO: Temporarily hidden — re-enable when ready
          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Notifications</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Manage your notification preferences</Text>}
              left={(props) => <Icon {...props} source="bell" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {}}
            />
          </Card>

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Privacy & Security</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Manage your privacy settings</Text>}
              left={(props) => <Icon {...props} source="shield-account" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={() => {}}
            />
          </Card>
          */}
        </View>
      )}

      {showConnectedEhrButton && (
        <View style={styles.connectedEhrButtonSection}>
          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>Connected EHRs</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>View your connected providers</Text>}
              left={(props) => <Icon {...props} source="hospital-building" size={getScaledFontSize(40)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(40)} />}
              onPress={onConnectedEhrPress}
            />
          </Card>
        </View>
      )}

      {showEhrSection && (
        <View style={styles.ehrSection}>
          {showEhrTitle && (
            <Text style={[styles.ehrTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
              Connected EHRs{ehrCountLabel}
            </Text>
          )}

          <Card style={styles.menuCard}>
            <List.Item
              title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: colors.tint }]}>Connect Another EHR</Text>}
              description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Link another provider to your records</Text>}
              left={(props) => <Icon {...props} source="plus" color={colors.tint} size={getScaledFontSize(32)} />}
              right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(32)} />}
              onPress={onConnectEhr}
            />
          </Card>

          {isLoadingClinics && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.loadingText, { color: colors.text + '80', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any }]}>
                Loading connected clinics...
              </Text>
            </View>
          )}

          {!isLoadingClinics && connectedHospitals.length > 0 && (
            <View style={styles.ehrList}>
              {connectedHospitals.map((hospital) => {
                const descriptionParts = [hospital.provider, hospital.address, hospital.phone].filter(Boolean);
                const description = descriptionParts.join(' • ');
                return (
                  <Card key={hospital.id} style={styles.menuCard}>
                    <List.Item
                      title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>{hospital.name}</Text>}
                      description={
                        description ? (
                          <Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>
                            {description}
                          </Text>
                        ) : undefined
                      }
                      left={(props) => <Icon {...props} source="hospital-building" size={getScaledFontSize(36)} />}
                      right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(32)} />}
                      onPress={() => onSelectHospital?.(hospital)}
                    />
                  </Card>
                );
              })}
            </View>
          )}

          {!isLoadingClinics && connectedHospitals.length === 0 && (
            <Text style={[styles.emptyStateText, { color: colors.text + '70', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(500) as any }]}>
              No connected clinics yet. Connect your first EHR to get started.
            </Text>
          )}
        </View>
      )}

      {showSignOut && (
        <View style={styles.footer}>
          <Button
            mode="outlined"
            onPress={() => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    // Clear all cached PHI from React Query memory
                    queryClient.clear();
                    router.replace('/(auth)/sign-in' as never);
                  },
                },
              ]);
            }}
            style={[styles.signOutButton, { paddingVertical: getScaledFontSize(6), paddingHorizontal: getScaledFontSize(12) }]}
            accessibilityLabel="Sign out of your account"
            accessibilityRole="button"
          >
            <Text style={[{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }]}>
              Sign Out
            </Text>
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    marginBottom: 16,
  },
  name: {
    marginBottom: 4,
  },
  menuSection: {
    marginBottom: 16,
  },
  connectedEhrButtonSection: {
    marginBottom: 16,
  },
  menuCard: {
    borderRadius: 16,
    marginBottom: 12,
    paddingLeft: 8,
  },
  ehrSection: {
    marginBottom: 16,
  },
  ehrTitle: {
    marginBottom: 12,
  },
  ehrList: {
    marginTop: 4,
  },
  emptyStateText: {
    marginTop: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  loadingText: {
    marginTop: 0,
  },
  footer: {
    marginTop: 0,
  },
  signOutButton: {
    borderColor: '#ff4444',
  },
});
