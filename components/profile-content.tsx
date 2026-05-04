import { Colors } from '@/constants/theme';
import { fetchPatientInfo } from '@/services/api/patient';
import { signOut } from '@/services/auth';
import { queryClient } from '@/providers/QueryProvider';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useUserPhoto } from '@/stores/user-photo-store';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { apiClient } from '@/lib/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button, Card, Icon, List } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

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

  // Hide the "Connect Another EHR" card for users with CONNECT_CLINIC
  // disabled by an admin (e.g. the App Store reviewer). Fail closed —
  // if permissions haven't loaded yet, treat as disabled so the button
  // never flashes to a restricted user.
  const { data: permissions } = useFeaturePermissions();
  const canConnectClinic = permissions?.CONNECT_CLINIC?.enabled === true;

  const [patientName, setPatientName] = useState('User');
  const [patientEmail, setPatientEmail] = useState('');
  const { photoUrl: patientPhotoUrl } = useUserPhoto();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    const loadPatientData = async () => {
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setPatientName(patient.name || 'User');
          setPatientEmail(patient.email || '');

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
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.primary + '14',
              borderColor: colors.primary + '24',
            },
          ]}
        >
          {/* Soft accent blob echoed from the Welcome / Connect screens */}
          <View
            pointerEvents="none"
            style={[
              styles.headerBlob,
              { backgroundColor: colors.primary + '1C' },
            ]}
          />

          <Text
            style={{
              color: colors.primary,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as any,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 14,
              alignSelf: 'flex-start',
            }}
          >
            My Account
          </Text>

          {isLoadingProfile ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <View style={styles.headerRow}>
              {patientPhotoUrl ? (
                <Image
                  source={{ uri: patientPhotoUrl }}
                  style={{ width: 64, height: 64, borderRadius: 32 }}
                  contentFit="cover"
                />
              ) : (
                <InitialsAvatar name={patientName} size={64} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.name,
                    {
                      color: colors.text,
                      fontSize: getScaledFontSize(20),
                      fontWeight: getScaledFontWeight(700) as any,
                    },
                  ]}
                >
                  {patientName}
                </Text>
                {patientEmail ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(500) as any,
                    }}
                  >
                    {patientEmail}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </View>
      )}

      {showProfileMenu && (
        <View style={styles.menuSection}>
          <SectionLabel label="My Health" colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <DrawerRow
              iconName="person"
              label="Personal Information"
              onPress={() => router.push('/(personal-info)')}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            {onEmergencyContactPress && (
              <DrawerRow
                iconName="contact-phone"
                label="Emergency Contact"
                onPress={onEmergencyContactPress}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
            {onAllergiesPress && (
              <DrawerRow
                iconName="warning"
                label="Allergies"
                onPress={onAllergiesPress}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
            {onHealthDetailsPress && (
              <DrawerRow
                iconName="favorite"
                label="Health Details"
                onPress={onHealthDetailsPress}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
          </View>
        </View>
      )}

      {/* HIDE the legacy Card stack — replaced by SectionLabel + DrawerRow above. */}
      {false && showProfileMenu && (
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

      {showConnectedEhrButton && onConnectedEhrPress && (
        <View style={styles.menuSection}>
          <SectionLabel label="Providers" colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <DrawerRow
              iconName="local-hospital"
              label="Connected Clinics"
              badge={connectedHospitals.length > 0 ? String(connectedHospitals.length) : undefined}
              onPress={onConnectedEhrPress}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </View>
        </View>
      )}

      {showEhrSection && (
        <View style={styles.ehrSection}>
          {showEhrTitle && (
            <Text style={[styles.ehrTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
              Connected EHRs{ehrCountLabel}
            </Text>
          )}

          {canConnectClinic && (
            <Card style={styles.menuCard}>
              <List.Item
                title={<Text style={[{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: colors.tint }]}>Connect Another EHR</Text>}
                description={<Text style={[{ fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>Link another provider to your records</Text>}
                left={(props) => <Icon {...props} source="plus" color={colors.tint} size={getScaledFontSize(32)} />}
                right={(props) => <Icon {...props} source="chevron-right" size={getScaledFontSize(32)} />}
                onPress={onConnectEhr}
              />
            </Card>
          )}

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

      {showProfileMenu && (
        <View style={styles.menuSection}>
          <SectionLabel label="Account & Privacy" colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <DrawerRow
              iconName="link"
              label="Linked Accounts"
              onPress={() => router.push('/Home/linked-accounts' as never)}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <DrawerRow
              iconName="shield"
              label="Security"
              onPress={() => router.push('/Home/security-settings' as never)}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <SectionLabel label="More" colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DrawerRow
                iconName="help-outline"
                label="Help & Support"
                onPress={() => router.push('/Home/support')}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
              <DrawerRow
                iconName="share"
                label="Share App"
                onPress={async () => {
                  await Share.share({
                    message:
                      "I'm using BrightFuture to manage my health care. Download it here: https://joinabrightfuture.com/download",
                    url: 'https://joinabrightfuture.com/download',
                  });
                }}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
              <DrawerRow
                iconName="info-outline"
                label="About"
                onPress={() => router.push('/Home/about' as never)}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            </View>
          </View>
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
    position: 'relative',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    position: 'relative',
  },
  avatar: {
    marginBottom: 16,
  },
  name: {
    marginBottom: 2,
  },
  menuSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  drawerRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  drawerRowBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
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

// ────────────────────────────────────────────────────────────────────
// Drawer helper components — bring the drawer in line with the rest
// of the app (accent icon circles, grouped sections with uppercase
// eyebrow labels, hairline-divided rows in a rounded container).
// ────────────────────────────────────────────────────────────────────
interface DrawerSharedProps {
  colors: typeof import('@/constants/theme').Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function SectionLabel({
  label,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: { label: string } & DrawerSharedProps) {
  return (
    <Text
      style={[
        styles.sectionLabel,
        {
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
        },
      ]}
    >
      {label}
    </Text>
  );
}

interface DrawerRowProps extends DrawerSharedProps {
  iconName: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: string;
  divider?: boolean;
}

function DrawerRow({
  iconName,
  label,
  onPress,
  badge,
  divider,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: DrawerRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerRow,
        divider && [styles.drawerRowDivider, { borderBottomColor: colors.border }],
        pressed && { backgroundColor: colors.primary + '0F' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.drawerRowIcon, { backgroundColor: colors.primary + '1A' }]}>
        <MaterialIcons name={iconName} size={getScaledFontSize(18)} color={colors.primary} />
      </View>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontSize: getScaledFontSize(15),
          fontWeight: getScaledFontWeight(600) as any,
        }}
      >
        {label}
      </Text>
      {badge !== undefined && (
        <View style={[styles.drawerRowBadge, { backgroundColor: colors.primary }]}>
          <Text
            style={{
              color: '#fff',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            {badge}
          </Text>
        </View>
      )}
      <MaterialIcons name="chevron-right" size={getScaledFontSize(20)} color={colors.subtext} />
    </Pressable>
  );
}
