import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FilterMenu } from '@/components/ui/filter-menu';
import { Colors } from '@/constants/theme';
import { SUPPORT_CATEGORIES, getSubCategoriesByCategoryId, getCategoryById, getSubCategoryById, matchProviderToSubCategory, type Category, type SubCategory } from '@/constants/categories';
import { useAccessibility } from '@/stores/accessibility-store';
import { MAX_SELECTED_PROVIDERS, useProviderSelection, type SelectedProvider } from '@/stores/provider-selection-store';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Card, List, Menu, TextInput as PaperTextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProviders, fetchProvidersByDepartment } from '@/services/api/providers';
import { fetchAppointments } from '@/services/api/appointments';
import { fetchPatientInfo } from '@/services/api/patient';
import type { Provider as FastenProvider } from '@/services/api/types';
import type { Appointment as FastenAppointment } from '@/services/api/types';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { getAllCareManagerAgencies, searchCareManagerAgencies, type CareManagerAgency } from '@/services/care-manager-agencies';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import {
  getNonEhrProviders,
  processAndStoreFiles,
  type NonEhrProvider,
} from '@/services/non-ehr-processor';

// Helper function to detect if device is a tablet
const isTablet = () => {
  const { width } = Dimensions.get('window');
  return width >= 768; // iPad starts at 768px width
};

// Helper function to format provider name for display (filters out credentials/titles)
const formatProviderDisplayName = (fullName: string): string => {
  if (!fullName) return '';

  // Common titles and credentials to filter out
  const titlesAndCredentials = ['Dr.', 'Dr', 'MD', 'DO', 'RN', 'NP', 'PA', 'PA-C', 'DDS', 'DMD', 'PharmD', 'PhD', 'DNP', 'FNP', 'CNP'];

  // Split name into parts
  const parts = fullName.trim().split(/\s+/);

  // Filter out titles and credentials
  const nameParts = parts.filter(part => {
    const normalizedPart = part.replace(/[.,]/g, ''); // Remove punctuation
    return !titlesAndCredentials.includes(normalizedPart);
  });

  // If no name parts left after filtering, return original (fallback)
  if (nameParts.length === 0) {
    return fullName;
  }

  // Get first name (first part) and last initial (first character of last part)
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  const lastInitial = lastName?.[0] || '';

  // Return formatted as "FirstName L" (e.g., "Subhash M" for "Subhash Mishra")
  return `${firstName} ${lastInitial}`.trim();
};

type ManualMember = {
  id: string;
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  categoryId: string;
  subCategoryId: string;
};

type OrbitItem = SelectedProvider | { id: string; isPlaceholder: true };

interface CircleViewProps {
  providers: SelectedProvider[];
  userImg?: number | { uri: string };
  colors: typeof Colors['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  patientName?: string;
  onAddProviderPress: () => void;
  isCircleComplete: boolean;
}

// Original Circle View for iPhone/Android (fixed dimensions)
function PhoneCircleView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', onAddProviderPress, isCircleComplete }: CircleViewProps) {
  // Load doctor photos for all providers
  const providerIds = providers.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);

  // Original fixed values
  const containerWidth = 384;
  const containerHeight = 320;
  const radius = 144 * 1.2; // 158.4
  const centerAvatarSize = 80;
  const orbitAvatarSize = 48;
  const orbitAvatarContainerSize = 120;
  const linkLineWidth = 92;

  const orbitItems: OrbitItem[] = isCircleComplete
    ? providers
    : [
      ...providers,
      { id: 'add-provider', isPlaceholder: true },
    ];

  return (
    <View style={[styles.circleContainer, { width: containerWidth, height: containerHeight, alignItems: 'center', justifyContent: 'center' }]}>
      <Image
        source={require('@/assets/images/backgroud.png')}
        style={styles.background}
        contentFit='contain' />
      {/* Circular line connecting the orbiting avatars */}
      <View
        style={{
          position: 'absolute',
          width: radius * 2, // diameter = 2 * radius (radius is 144 * 1.2 = 172.8)
          height: radius * 2,
          borderRadius: radius,
          borderWidth: 2,
          borderColor: '#008080',
          borderStyle: 'dashed',
          left: (containerWidth - radius * 2) / 2,
          top: (containerHeight - radius * 2) / 2,
          zIndex: 0,
        }} />
      <View style={styles.centerAvatarWrapper}>
        <TouchableOpacity
          onPress={() => {
            try {
              console.log('Navigating to today-schedule...');
              router.push('/Home/today-schedule');
            } catch (error) {
              console.error('Error navigating to today-schedule:', error);
              // Fallback navigation
              try {
                router.push('/(Home)/today-schedule');
              } catch (fallbackError) {
                console.error('Fallback navigation also failed:', fallbackError);
              }
            }
          }}
          activeOpacity={0.8}
        >
          <InitialsAvatar name={patientName} size={getScaledFontSize(centerAvatarSize)} style={styles.centerAvatarImage} />
        </TouchableOpacity>
        <Text style={[
          styles.centerAvatarText,
          {
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as any,
            color: colors.text,
          }
        ]}>{patientName}</Text>
      </View>
      {isCircleComplete && (
        <Button
          mode="contained"
          buttonColor="#008080"
          onPress={() => router.push('/modal')}
          style={styles.moreDoctorsButton}>
          More
        </Button>
      )}
      {orbitItems.map((item, idx) => {
        const angle = (idx / orbitItems.length) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const avatarSize = orbitAvatarSize;
        const containerSize = orbitAvatarContainerSize;
        const halfContainerSize = containerSize / 2;
        const isPlaceholder = 'isPlaceholder' in item;
        return (
          <React.Fragment key={item.id}>
            <View
              style={[
                styles.linkLine,
                {
                  width: linkLineWidth,
                  transform: [
                    { rotate: `${(angle * 180) / Math.PI}deg` },
                  ],
                },
              ]} />
            <TouchableOpacity
              style={[
                styles.orbitAvatar,
                {
                  position: 'absolute',
                  left: containerWidth / 2 + x - halfContainerSize,
                  top: containerHeight / 2 + y - halfContainerSize,
                  zIndex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: containerSize,
                  height: containerSize,
                },
              ]}
              onPress={() => {
                if (isPlaceholder) {
                  onAddProviderPress();
                  return;
                }
                const isIntegrative = item.category === 'Integrative';
                if (isIntegrative) {
                  router.push(`/Home/non-ehr-provider-detail?id=${encodeURIComponent(item.id)}`);
                } else if (!item.isManual) {
                  router.push(`/Home/doctor-detail?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}&qualifications=${encodeURIComponent(item.qualifications || '')}&specialty=${encodeURIComponent(item.specialty || '')}`);
                }
              }}
            >
              {isPlaceholder ? (
                <View style={[styles.addProviderAvatar, { width: getScaledFontSize(avatarSize), height: getScaledFontSize(avatarSize) }]}>
                  <IconSymbol name="plus" size={getScaledFontSize(24)} color={colors.tint || '#008080'} />
                </View>
              ) : (
                <>
                  <InitialsAvatar
                    name={item.name}
                    size={getScaledFontSize(avatarSize)}
                    image={doctorPhotos.get(item.id) ? { uri: doctorPhotos.get(item.id)! } : undefined}
                  />
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.orbitAvatarText,
                      {
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(500) as any,
                        color: colors.text,
                        width: 90,
                        textAlign: 'center'
                      }
                    ]}>
                    {formatProviderDisplayName(item.name)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View >
  );
}

// Responsive Circle View for iPad/Tablet
function TabletCircleView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', onAddProviderPress, isCircleComplete }: CircleViewProps) {
  // Load doctor photos for all providers
  const providerIds = providers.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);
  // Get screen dimensions and calculate scale factor
  const screenWidth = Dimensions.get('window').width;
  // Horizontal padding from circleSection (24 on each side = 48 total)
  const horizontalPadding = 24;
  // Maximum available width for the circle container
  const maxAvailableWidth = screenWidth - horizontalPadding;

  // Base width for iPhone (375 is typical iPhone width)
  const baseWidth = 375;
  // Calculate scale factor, but cap it for very large screens (max 2.2x for iPad)
  const scaleFactor = Math.min(screenWidth / baseWidth, 2.2);

  // Base radius for orbit - original design value
  const baseRadius = 144 * 1.1; // ~158.4

  // Avatar container size - scale proportionally
  const baseAvatarContainerSize = 120;
  const avatarContainerSize = baseAvatarContainerSize * Math.min(scaleFactor, 1.5);
  const containerPadding = 1;

  // Calculate maximum radius that fits within available width
  // Increased containerPadding to allow more space between center and orbiting circles
  const adjustedContainerPadding = containerPadding * 1.5;
  const maxRadius = (maxAvailableWidth - avatarContainerSize - (adjustedContainerPadding * 2)) / 2;

  // Avatar sizes - scale less aggressively than the circle (calculate early for radius calculation)
  const centerAvatarSize = 80 * Math.min(scaleFactor, 1.5);

  // Adaptive multiplier based on screen width - larger screens get more spacing
  // 11-inch iPad: ~834px width, 13-inch iPad: ~1024px width
  // Use a progressive multiplier that scales with screen size
  const screenWidthRatio = screenWidth / 834; // Normalize to 11-inch iPad
  const adaptiveMultiplier = Math.min(2.5 + (screenWidthRatio - 1) * 0.1, 2.592); // Range from 2.5 to 2.592

  // Calculate minimum radius to prevent overlapping with center avatar
  // Need enough space for center avatar + orbiting avatar + padding
  const maxContainerSize = avatarContainerSize;
  const minRadiusFromCenter = (centerAvatarSize / 2) + (maxContainerSize / 2) + 80; // 80px padding between center and orbit

  // Calculate minimum radius to prevent overlapping between orbiting doctors
  // Each doctor needs space around the circle: we need enough circumference for all doctors
  const orbitItems: OrbitItem[] = isCircleComplete
    ? providers
    : [
      ...providers,
      { id: 'add-provider', isPlaceholder: true },
    ];
  const minRadiusForSpacing = (maxContainerSize * orbitItems.length * 1.5) / (2 * Math.PI);

  // Scale radius more aggressively for larger screens - increased multiplier for more spacing
  const desiredRadius = baseRadius * scaleFactor * adaptiveMultiplier;
  // Use the larger of: desired radius, minimum from center, or minimum for spacing
  const radius = Math.min(Math.max(desiredRadius, minRadiusFromCenter, minRadiusForSpacing), maxRadius);

  // Calculate container size based on actual radius
  const containerWidth = (radius * 2) + avatarContainerSize + (adjustedContainerPadding * 2);
  const containerHeight = containerWidth; // Keep it square
  const orbitAvatarSize = 48 * Math.min(scaleFactor, 1.5);
  const orbitAvatarContainerSize = avatarContainerSize;
  const linkLineWidth = 92 * Math.min(scaleFactor, 1.5);

  return (
    <View style={[styles.circleContainer, { width: containerWidth, height: containerHeight, alignItems: 'center', justifyContent: 'center' }]}>
      <Image
        source={require('@/assets/images/backgroud.png')}
        style={styles.background}
        contentFit='contain' />
      {/* Circular line connecting the orbiting avatars */}
      <View
        style={{
          position: 'absolute',
          width: radius * 2, // diameter = 2 * radius
          height: radius * 2,
          borderRadius: radius,
          borderWidth: 4,
          borderColor: '#008080',
          borderStyle: 'dashed',
          left: (containerWidth - radius * 2) / 2,
          top: (containerHeight - radius * 2) / 2,
          zIndex: 0,
        }} />
      <View style={styles.centerAvatarWrapper}>
        <TouchableOpacity
          onPress={() => {
            try {
              console.log('Navigating to today-schedule...');
              router.push('/Home/today-schedule');
            } catch (error) {
              console.error('Error navigating to today-schedule:', error);
              // Fallback navigation
              try {
                router.push('/(Home)/today-schedule');
              } catch (fallbackError) {
                console.error('Fallback navigation also failed:', fallbackError);
              }
            }
          }}
          activeOpacity={0.8}
        >
          <InitialsAvatar name={patientName} size={getScaledFontSize(centerAvatarSize)} style={styles.centerAvatarImage} />
        </TouchableOpacity>
        <Text style={[
          styles.centerAvatarText,
          {
            fontSize: getScaledFontSize(16 * Math.min(scaleFactor, 1.5)),
            fontWeight: getScaledFontWeight(600) as any,
            color: colors.text,
          }
        ]}>{patientName}</Text>
      </View>
      {isCircleComplete && (
        <Button
          labelStyle={{
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(500) as any,
            lineHeight: getScaledFontSize(16)
          }}
          mode="contained"
          buttonColor="#008080"
          onPress={() => router.push('/modal')}
          style={[
            styles.moreDoctorsButton,
            {
              paddingHorizontal: getScaledFontSize(20),
              borderRadius: getScaledFontSize(24),
            }
          ]}>
          More
        </Button>
      )}
      {orbitItems.map((item, idx) => {
        const angle = (idx / orbitItems.length) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const avatarSize = orbitAvatarSize;
        const containerSize = orbitAvatarContainerSize;
        const halfContainerSize = containerSize / 2;
        const isPlaceholder = 'isPlaceholder' in item;
        return (
          <React.Fragment key={item.id}>
            <View
              style={[
                styles.linkLine,
                {
                  width: linkLineWidth,
                  transform: [
                    { rotate: `${(angle * 180) / Math.PI}deg` },
                  ],
                },
              ]} />
            <TouchableOpacity
              style={[
                styles.orbitAvatar,
                {
                  position: 'absolute',
                  left: containerWidth / 2 + x - halfContainerSize,
                  top: containerHeight / 2 + y - halfContainerSize,
                  zIndex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: containerSize,
                  paddingHorizontal: 4,
                  height: containerSize,
                },
              ]}
              onPress={() => {
                if (isPlaceholder) {
                  onAddProviderPress();
                  return;
                }
                const isIntegrative = item.category === 'Integrative';
                if (isIntegrative) {
                  router.push(`/Home/non-ehr-provider-detail?id=${encodeURIComponent(item.id)}`);
                } else if (!item.isManual) {
                  router.push(`/Home/doctor-detail?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}&qualifications=${encodeURIComponent(item.qualifications || '')}&specialty=${encodeURIComponent(item.specialty || '')}`);
                }
              }}
            >
              {isPlaceholder ? (
                <View style={[styles.addProviderAvatar, { width: getScaledFontSize(avatarSize), height: getScaledFontSize(avatarSize) }]}>
                  <IconSymbol name="plus" size={getScaledFontSize(24)} color={colors.tint || '#008080'} />
                </View>
              ) : (
                <>
                  <InitialsAvatar
                    name={item.name}
                    size={getScaledFontSize(avatarSize)}
                    image={doctorPhotos.get(item.id) ? { uri: doctorPhotos.get(item.id)! } : undefined}
                  />
                  <Text
                    style={[
                      styles.orbitAvatarText,
                      {
                        fontSize: getScaledFontSize(12 * Math.min(scaleFactor, 1.5)),
                        fontWeight: getScaledFontWeight(500) as any,
                        color: colors.text,
                        textAlign: 'center',
                      }
                    ]}>
                    {formatProviderDisplayName(item.name)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View >
  );
}


// Circle Providers List View Component (shows providers from circle)
interface CircleProvidersListViewProps {
  providers: SelectedProvider[];
  userImg?: number | { uri: string };
  colors: typeof Colors['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  patientName?: string;
  hasUpcomingAppointments: boolean;
  isCircleComplete: boolean;
}

function CircleProvidersListView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', hasUpcomingAppointments, isCircleComplete }: CircleProvidersListViewProps) {
  // Load doctor photos for all providers
  const providerIds = providers.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);

  // Calculate max height to push appointments to bottom of screen
  const screenHeight = Dimensions.get('window').height;
  const maxListHeight = hasUpcomingAppointments ? Math.min(screenHeight * 0.65, 600) : undefined;

  return (
    <View style={styles.listContainer}>
      <ScrollView
        style={[
          styles.listScrollView,
          hasUpcomingAppointments ? { maxHeight: maxListHeight } : null,
          {
            borderWidth: 1,
            borderColor: colors.text + '15',
            borderRadius: getScaledFontSize(12),
          }
        ]}
        contentContainerStyle={styles.listScrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <TouchableOpacity
          style={[
            styles.listItem,
            {
              borderBottomColor: colors.text + '20',
              paddingVertical: getScaledFontSize(16),
              paddingHorizontal: getScaledFontSize(16),
            }
          ]}
          onPress={() => router.push('/Home/today-schedule')}
          activeOpacity={0.7}
        >
          <InitialsAvatar name={patientName} size={getScaledFontSize(56)} style={styles.listAvatar} />
          <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
            <Text style={[
              styles.listItemName,
              {
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
                marginBottom: getScaledFontSize(4),
              }
            ]}>{patientName}</Text>
            <Text style={[
              styles.listItemRole,
              {
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(400) as any,
                color: colors.text + '80',
              }
            ]}>Patient</Text>
          </View>
        </TouchableOpacity>
        {providers.length === 0 ? (
          <View style={[styles.listItem, { paddingVertical: getScaledFontSize(16), paddingHorizontal: getScaledFontSize(16) }]}>
            <Text style={[
              {
                fontSize: getScaledFontSize(14),
                color: colors.text + '80',
              }
            ]}>No providers added yet</Text>
          </View>
        ) : (
          providers.map((provider) => (
            <TouchableOpacity
              key={`circle-provider-${provider.id}`}
              style={[
                styles.listItem,
                {
                  borderBottomColor: colors.text + '20',
                  paddingVertical: getScaledFontSize(16),
                  paddingHorizontal: getScaledFontSize(16),
                }
              ]}
              onPress={() => {
                const isIntegrative = provider.category === 'Integrative';
                if (isIntegrative) {
                  router.push(`/Home/non-ehr-provider-detail?id=${encodeURIComponent(provider.id)}`);
                } else if (!provider.isManual) {
                  router.push(`/Home/doctor-detail?id=${encodeURIComponent(provider.id)}&name=${encodeURIComponent(provider.name)}&qualifications=${encodeURIComponent(provider.qualifications || '')}&specialty=${encodeURIComponent(provider.specialty || '')}`);
                }
              }}
              activeOpacity={provider.isManual ? 1 : 0.7}
            >
              <InitialsAvatar
                name={provider.name}
                size={getScaledFontSize(56)}
                style={styles.listAvatar}
                image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : undefined}
              />
              <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                <Text style={[
                  styles.listItemName,
                  {
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text,
                    marginBottom: getScaledFontSize(4),
                  }
                ]}>
                  {formatProviderDisplayName(provider.name)}
                </Text>
                <Text style={[
                  styles.listItemRole,
                  {
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(400) as any,
                    color: colors.text + '80',
                  }
                ]}>
                  {provider.isManual
                    ? (provider.relationship || provider.qualifications || 'Member')
                    : (provider.qualifications || provider.specialty || 'Healthcare Provider')}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={[
          styles.moreButtonContainer,
          {
            paddingVertical: getScaledFontSize(16),
            paddingHorizontal: getScaledFontSize(16),
          }
        ]}>
          {isCircleComplete && (
            <Button
              mode="contained"
              buttonColor="#008080"
              onPress={() => router.push('/modal')}
              style={styles.moreDoctorsButton}
              labelStyle={{
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(500) as any,
              }}
            >
              More
            </Button>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// List View Component (categories -> sub-categories -> providers)
interface ListViewProps {
  userImg?: number | { uri: string };
  colors: typeof Colors['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  onItemPress: (categoryId?: string, subCategoryId?: string) => void;
  patientName?: string;
  hasUpcomingAppointments: boolean;
  selectedProviderIds: Set<string>;
  onAddProvider: (provider: SelectedProvider) => void;
  onRemoveProvider: (providerId: string) => void;
  maxCircleProviders: number;
}

type ListViewLevel = 'categories' | 'sub-categories' | 'providers';

function ListView({ userImg, colors, getScaledFontSize, getScaledFontWeight, onItemPress, patientName = '', hasUpcomingAppointments, selectedProviderIds, onAddProvider, onRemoveProvider, maxCircleProviders }: ListViewProps) {
  // Calculate max height to push appointments to bottom of screen
  const screenHeight = Dimensions.get('window').height;
  // Use larger percentage to push appointments section to bottom
  const maxListHeight = hasUpcomingAppointments ? Math.min(screenHeight * 0.65, 600) : undefined; // Max 65% of screen or 600px, whichever is smaller

  const [currentLevel, setCurrentLevel] = useState<ListViewLevel>('categories');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | undefined>(undefined);
  const [providersBySubCategory, setProvidersBySubCategory] = useState<Map<string, FastenProvider[]>>(new Map());
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [lastVisitedFilter, setLastVisitedFilter] = useState<string | null>(null);
  const [manualMembersBySubCategory, setManualMembersBySubCategory] = useState<Record<string, ManualMember[]>>({});
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);

  // Collect all provider IDs from all subcategories to load photos
  const allProviderIds = React.useMemo(() => {
    const ids: string[] = [];
    providersBySubCategory.forEach((providers) => {
      providers.forEach(provider => {
        if (provider.id && !ids.includes(provider.id)) {
          ids.push(provider.id);
        }
      });
    });
    return ids;
  }, [providersBySubCategory]);

  // Load doctor photos for all providers
  const doctorPhotos = useDoctorPhotos(allProviderIds);
  const [manualName, setManualName] = useState('');
  const [manualRelationship, setManualRelationship] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualSubCategoryId, setManualSubCategoryId] = useState<string | null>(null);
  const [isSubCategoryMenuVisible, setIsSubCategoryMenuVisible] = useState(false);
  const [subCategorySearchQuery, setSubCategorySearchQuery] = useState('');
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [agencySearchQuery, setAgencySearchQuery] = useState('');
  const [agencies, setAgencies] = useState<CareManagerAgency[]>([]);
  const [integrativeSearchQuery, setIntegrativeSearchQuery] = useState('');
  // Non-EHR (Integrative) providers
  const [nonEhrProviders, setNonEhrProviders] = useState<NonEhrProvider[]>([]);
  const [nonEhrProviderCount, setNonEhrProviderCount] = useState(0);
  const [isUploadingIntegrative, setIsUploadingIntegrative] = useState(false);

  // Load care manager agencies from API
  useEffect(() => {
    const loadAgencies = async () => {
      const data = agencySearchQuery.trim()
        ? await searchCareManagerAgencies(agencySearchQuery)
        : await getAllCareManagerAgencies();
      setAgencies(data);
    };
    loadAgencies();
  }, [agencySearchQuery]);

  // Load non-EHR providers on mount and whenever the providers level changes
  const loadNonEhrProviders = React.useCallback(async () => {
    try {
      const all = await getNonEhrProviders();
      setNonEhrProviders(all);
      setNonEhrProviderCount(all.length);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    loadNonEhrProviders();
  }, [currentLevel, loadNonEhrProviders]);

  const addManualMember = (categoryId: string, fallbackSubCategoryId?: string) => {
    const targetSubCategoryId = manualSubCategoryId || fallbackSubCategoryId;
    if (!targetSubCategoryId) return;
    const trimmedName = manualName.trim();
    if (!trimmedName) return;
    const key = `${categoryId}-${targetSubCategoryId}`;
    const newMember: ManualMember = {
      id: `manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmedName,
      relationship: manualRelationship.trim() || undefined,
      phone: manualPhone.trim() || undefined,
      email: manualEmail.trim() || undefined,
      categoryId,
      subCategoryId: targetSubCategoryId,
    };
    setManualMembersBySubCategory(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newMember],
    }));
    setManualName('');
    setManualRelationship('');
    setManualPhone('');
    setManualEmail('');
    setManualSubCategoryId(null);
    setShowAddMemberForm(false);
  };

  const lastVisitedFilters = [
    { id: '3m', label: 'Last 3 months', months: 3 },
    { id: '6m', label: 'Last 6 months', months: 6 },
    { id: '1y', label: 'Last 1 year', years: 1 },
    { id: '2y', label: 'Last 2 years', years: 2 },
    { id: '5y', label: 'Last 5 years', years: 5 },
  ];

  const getCutoffDate = (filterId: string | null) => {
    if (!filterId) return null;
    const filter = lastVisitedFilters.find(item => item.id === filterId);
    if (!filter) return null;
    const now = new Date();
    const cutoff = new Date(now);
    if (filter.months) {
      cutoff.setMonth(now.getMonth() - filter.months);
    } else if (filter.years) {
      cutoff.setFullYear(now.getFullYear() - filter.years);
    }
    return cutoff;
  };

  const filterProvidersByLastVisited = (providers: SelectedProvider[]) => {
    if (!lastVisitedFilter) return providers;
    const cutoff = getCutoffDate(lastVisitedFilter);
    if (!cutoff) return providers;
    return providers.filter(provider => {
      if (provider.isManual) return true;
      if (provider.category && provider.category !== 'Medical') return true;
      if (!provider.lastVisited) return false;
      const visitedDate = new Date(provider.lastVisited);
      return visitedDate >= cutoff;
    });
  };

  // Load and categorize providers
  React.useEffect(() => {
    const loadAndCategorizeProviders = async () => {
      setIsLoadingProviders(true);
      try {
        const providers = await fetchProviders();
        const categorizedProviders = new Map<string, FastenProvider[]>();

        // Categorize each provider (can belong to multiple subcategories)
        providers.forEach(provider => {
          const matches = matchProviderToSubCategory(
            provider.name,
            provider.specialty,
            provider.qualifications
          );

          if (matches && matches.length > 0) {
            // Add provider to ALL applicable subcategories
            matches.forEach(match => {
              const key = `${match.categoryId}-${match.subCategoryId}`;
              if (!categorizedProviders.has(key)) {
                categorizedProviders.set(key, []);
              }
              categorizedProviders.get(key)!.push(provider);
            });
          }
        });

        // Sort providers in each subcategory by lastVisited in descending order
        categorizedProviders.forEach((providerList, key) => {
          const sorted = [...providerList].sort((a, b) => {
            const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
            const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;

            // If both have dates, sort by date descending
            if (dateA > 0 && dateB > 0) {
              return dateB - dateA; // Descending order (most recent first)
            }
            // If only one has a date, prioritize it
            if (dateA > 0 && dateB === 0) return -1;
            if (dateB > 0 && dateA === 0) return 1;

            // If neither has a date, maintain original order
            return 0;
          });
          categorizedProviders.set(key, sorted);
        });

        setProvidersBySubCategory(categorizedProviders);
        console.log(`Categorized ${providers.length} providers into ${categorizedProviders.size} sub-categories`);
      } catch (error) {
        console.error('Error loading and categorizing providers:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadAndCategorizeProviders();
  }, []);

  const handleCategoryPress = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    // Care Manager and Integrative categories have no subcategories, go directly to providers
    if (categoryId === 'care-manager') {
      setCurrentLevel('providers');
      setAgencySearchQuery(''); // Reset search when navigating to agencies
    } else if (categoryId === 'integrative') {
      setCurrentLevel('providers');
      setIntegrativeSearchQuery('');
      loadNonEhrProviders(); // Refresh providers list
    } else {
      setCurrentLevel('sub-categories');
      setSubCategorySearchQuery(''); // Reset search when navigating to subcategories
    }
  };

  const handleSubCategoryPress = (categoryId: string, subCategoryId: string) => {
    setSelectedSubCategoryId(subCategoryId);
    setCurrentLevel('providers');
    setProviderSearchQuery(''); // Reset search when navigating to providers
    onItemPress(categoryId, subCategoryId);
  };

  const handleBack = () => {
    if (currentLevel === 'providers') {
      // Care Manager and Integrative categories have no subcategories, go directly back to categories
      if (selectedCategoryId === 'care-manager' || selectedCategoryId === 'integrative') {
        setCurrentLevel('categories');
        setSelectedCategoryId(undefined);
        setAgencySearchQuery('');
        setIntegrativeSearchQuery('');
      } else {
        setCurrentLevel('sub-categories');
        setSelectedSubCategoryId(undefined);
        setProviderSearchQuery(''); // Reset provider search when going back
      }
    } else if (currentLevel === 'sub-categories') {
      setCurrentLevel('categories');
      setSelectedCategoryId(undefined);
      setSubCategorySearchQuery(''); // Reset subcategory search when going back
      setAgencySearchQuery(''); // Reset agency search when going back
    }
  };

  const getCurrentProviders = (): SelectedProvider[] => {
    if (!selectedCategoryId || !selectedSubCategoryId) return [];
    const key = `${selectedCategoryId}-${selectedSubCategoryId}`;
    const category = getCategoryById(selectedCategoryId);
    const subCategory = getSubCategoryById(selectedCategoryId, selectedSubCategoryId);
    const providers = providersBySubCategory.get(key) || [];
    const manualMembers = manualMembersBySubCategory[key] || [];
    const manualProviders: SelectedProvider[] = manualMembers.map(member => ({
      id: member.id,
      name: member.name,
      qualifications: member.relationship || 'Member',
      phone: member.phone,
      email: member.email,
      category: category?.name,
      subCategory: subCategory?.name,
      isManual: true,
      relationship: member.relationship,
    }));

    // Sort by lastVisited in descending order (most recently visited first)
    const sortedProviders = [...providers, ...manualProviders].sort((a, b) => {
      const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
      const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;

      // If both have dates, sort by date descending
      if (dateA > 0 && dateB > 0) {
        return dateB - dateA; // Descending order (most recent first)
      }
      // If only one has a date, prioritize it
      if (dateA > 0 && dateB === 0) return -1;
      if (dateB > 0 && dateA === 0) return 1;

      // If neither has a date, maintain original order
      return 0;
    });
    return filterProvidersByLastVisited(sortedProviders);
  };

  const renderCategories = () => (
    <>
      <TouchableOpacity
        style={[
          styles.listItem,
          {
            borderBottomColor: colors.text + '20',
            paddingVertical: getScaledFontSize(16),
            paddingHorizontal: getScaledFontSize(16),
          }
        ]}
        onPress={() => router.push('/Home/today-schedule')}
        activeOpacity={0.7}
      >
        <InitialsAvatar name={patientName} size={getScaledFontSize(56)} style={styles.listAvatar} />
        <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
          <Text style={[
            styles.listItemName,
            {
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
              marginBottom: getScaledFontSize(4),
            }
          ]}>{patientName}</Text>
          <Text style={[
            styles.listItemRole,
            {
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(400) as any,
              color: colors.text + '80',
            }
          ]}>Patient</Text>
        </View>
      </TouchableOpacity>
      {SUPPORT_CATEGORIES.map((category) => {
        // Count providers in this category
        let categoryProviderCount: number;
        if (category.id === 'integrative') {
          // Integrative providers come from the non-EHR storage
          categoryProviderCount = nonEhrProviderCount;
        } else {
          categoryProviderCount = category.subCategories.reduce((sum, subCategory) => {
            const key = `${category.id}-${subCategory.id}`;
            const providers = providersBySubCategory.get(key) || [];
            const manualMembers = manualMembersBySubCategory[key] || [];
            return sum + providers.length + manualMembers.length;
          }, 0);
        }

        return (
          <TouchableOpacity
            key={`category-${category.id}`}
            style={[
              styles.listItem,
              {
                borderBottomColor: colors.text + '20',
                paddingVertical: getScaledFontSize(16),
                paddingHorizontal: getScaledFontSize(16),
              }
            ]}
            onPress={() => handleCategoryPress(category.id)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.listAvatar,
              {
                width: getScaledFontSize(56),
                height: getScaledFontSize(56),
                borderRadius: getScaledFontSize(28),
                backgroundColor: colors.tint + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}>
              <IconSymbol name={category.icon || 'circle.fill'} size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
            </View>
            <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
              <Text style={[
                styles.listItemName,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                  marginBottom: getScaledFontSize(4),
                }
              ]}>
                {category.name}
              </Text>
              <Text style={[
                styles.listItemRole,
                {
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(400) as any,
                  color: colors.text + '80',
                }
              ]}>
                {categoryProviderCount} {categoryProviderCount === 1 ? 'provider' : 'providers'}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.text + '60'} />
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderSubCategories = () => {
    if (!selectedCategoryId) return null;
    const category = getCategoryById(selectedCategoryId);
    if (!category) return null;
    // Care Manager category has no subcategories, should not render this view
    if (category.id === 'care-manager') return null;
    const isNonMedicalCategory = category.id !== 'medical';
    const subCategoriesWithData = category.subCategories.filter(subCategory => {
      const key = `${category.id}-${subCategory.id}`;
      const providers = providersBySubCategory.get(key) || [];
      const manualMembers = manualMembersBySubCategory[key] || [];
      return providers.length + manualMembers.length > 0;
    });
    let subCategoriesToShow = isNonMedicalCategory ? subCategoriesWithData : category.subCategories;
    // Filter subcategories based on search query
    if (subCategorySearchQuery.trim()) {
      const query = subCategorySearchQuery.toLowerCase().trim();
      subCategoriesToShow = subCategoriesToShow.filter(subCategory =>
        subCategory.name.toLowerCase().includes(query)
      );
    }
    const showEmptyNonMedical = isNonMedicalCategory && subCategoriesWithData.length === 0;
    const manualSubCategoryLabel = manualSubCategoryId
      ? category.subCategories.find(sub => sub.id === manualSubCategoryId)?.name
      : undefined;

    return (
      <>
        <View style={[
          styles.detailsListHeader,
          {
            borderBottomColor: colors.text + '20',
            paddingHorizontal: getScaledFontSize(16),
            paddingVertical: getScaledFontSize(12),
            marginBottom: getScaledFontSize(8),
          }
        ]}>
          <TouchableOpacity onPress={handleBack} style={{ padding: getScaledFontSize(4) }}>
            <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text style={[
            styles.detailsListTitle,
            {
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
              flex: 1,
              marginLeft: getScaledFontSize(8),
            }
          ]}>
            {category.name}
          </Text>
          <View style={{ width: getScaledFontSize(24), alignItems: 'center', justifyContent: 'center' }}>
            <FilterMenu
              options={lastVisitedFilters}
              selectedId={lastVisitedFilter}
              onSelect={setLastVisitedFilter}
              onClear={() => setLastVisitedFilter(null)}
              color={colors.text}
              menuBackgroundColor={colors.background}
              menuTextColor={colors.text}
              menuHighlightColor={colors.tint + '20'}
              fontSize={getScaledFontSize(14)}
              fontWeight={getScaledFontWeight(500) as any}
              iconSize={getScaledFontSize(20)}
              accessibilityLabel="Filter providers by last visited"
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: getScaledFontSize(16), paddingBottom: getScaledFontSize(12) }}>
          <PaperTextInput
            label="Search subcategories"
            value={subCategorySearchQuery}
            onChangeText={setSubCategorySearchQuery}
            mode="outlined"
            left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
            style={{ backgroundColor: colors.background }}
            textColor={colors.text}
            activeOutlineColor={colors.tint}
          />
        </View>
        {showEmptyNonMedical ? (
          <View style={[
            styles.addMemberContainer,
            {
              paddingHorizontal: getScaledFontSize(16),
              paddingBottom: getScaledFontSize(8),
            }
          ]}>
            {showAddMemberForm ? (
              <View style={styles.addMemberForm}>
                <Menu
                  visible={isSubCategoryMenuVisible}
                  onDismiss={() => setIsSubCategoryMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setIsSubCategoryMenuVisible(true)}
                    >
                      {manualSubCategoryLabel || 'Select sub-category'}
                    </Button>
                  }
                >
                  {category.subCategories.map(sub => (
                    <Menu.Item
                      key={sub.id}
                      title={sub.name}
                      onPress={() => {
                        setManualSubCategoryId(sub.id);
                        setIsSubCategoryMenuVisible(false);
                      }}
                    />
                  ))}
                </Menu>
                <PaperTextInput
                  label="Full name"
                  value={manualName}
                  onChangeText={setManualName}
                  mode="outlined"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Relationship"
                  value={manualRelationship}
                  onChangeText={setManualRelationship}
                  mode="outlined"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Phone"
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  mode="outlined"
                  keyboardType="phone-pad"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Email"
                  value={manualEmail}
                  onChangeText={setManualEmail}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.addMemberInput}
                />
                <View style={styles.addMemberActions}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setShowAddMemberForm(false);
                      setManualSubCategoryId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => addManualMember(category.id)}
                    disabled={!manualName.trim() || !manualSubCategoryId}
                  >
                    Add
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                mode="outlined"
                onPress={() => {
                  setManualSubCategoryId(null);
                  setShowAddMemberForm(true);
                }}
              >
                Add member
              </Button>
            )}
          </View>
        ) : subCategoriesToShow.map((subCategory) => {
          const key = `${category.id}-${subCategory.id}`;
          const providers = providersBySubCategory.get(key) || [];
          const manualMembers = manualMembersBySubCategory[key] || [];
          const providerCount = filterProvidersByLastVisited(
            [...providers, ...manualMembers.map(member => ({
              id: member.id,
              name: member.name,
              qualifications: member.relationship || 'Member',
              phone: member.phone,
              email: member.email,
              isManual: true,
              relationship: member.relationship,
            }))]
          ).length;

          return (
            <TouchableOpacity
              key={`subcategory-${subCategory.id}`}
              style={[
                styles.listItem,
                {
                  borderBottomColor: colors.text + '20',
                  paddingVertical: getScaledFontSize(16),
                  paddingHorizontal: getScaledFontSize(16),
                }
              ]}
              onPress={() => handleSubCategoryPress(category.id, subCategory.id)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.listAvatar,
                {
                  width: getScaledFontSize(56),
                  height: getScaledFontSize(56),
                  borderRadius: getScaledFontSize(28),
                  backgroundColor: colors.tint + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              ]}>
                <IconSymbol name={subCategory.icon || 'circle.fill'} size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
              </View>
              <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                <Text style={[
                  styles.listItemName,
                  {
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text,
                    marginBottom: getScaledFontSize(4),
                  }
                ]}>
                  {subCategory.name}
                </Text>
                <Text style={[
                  styles.listItemRole,
                  {
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(400) as any,
                    color: colors.text + '80',
                  }
                ]}>
                  {providerCount} {providerCount === 1 ? 'provider' : 'providers'}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.text + '60'} />
            </TouchableOpacity>
          );
        })}
      </>
    );
  };

  // ── Integrative file upload handler ──────────
  const handleIntegrativeUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: ['application/pdf', 'text/plain', 'application/json', '*/*'],
      });
      if (result.canceled) return;
      const { assets } = result;
      if (!assets || assets.length === 0) return;
      if (assets.length > 10) {
        Alert.alert('Too many files', 'You can upload a maximum of 10 files at a time.');
        return;
      }
      setIsUploadingIntegrative(true);
      const filesToProcess = assets.map((asset: DocumentPicker.DocumentPickerAsset) => ({
        name: asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      }));
      const results = await processAndStoreFiles(filesToProcess, 10);
      const addedCount = results.filter(r => r.added).length;
      const dupCount = results.filter(r => r.isDuplicate).length;
      let message = `${addedCount} provider${addedCount !== 1 ? 's' : ''} added.`;
      if (dupCount > 0) message += ` ${dupCount} duplicate${dupCount !== 1 ? 's' : ''} skipped.`;
      Alert.alert('Upload Complete', message);
      await loadNonEhrProviders();
    } catch (err: unknown) {
      console.error('[ListView] Integrative upload error:', err);
      Alert.alert('Upload Failed', (err instanceof Error ? err.message : null) ?? 'An unexpected error occurred.');
    } finally {
      setIsUploadingIntegrative(false);
    }
  };

  const renderProviders = () => {
    const category = selectedCategoryId ? getCategoryById(selectedCategoryId) : undefined;

    // Handle Integrative category — show non-EHR providers
    if (selectedCategoryId === 'integrative') {
      let filteredIntegrative = nonEhrProviders;
      if (integrativeSearchQuery.trim()) {
        const q = integrativeSearchQuery.toLowerCase().trim();
        filteredIntegrative = nonEhrProviders.filter(p =>
          p.providerName.toLowerCase().includes(q) ||
          p.clinicName.toLowerCase().includes(q) ||
          (p.specialty && p.specialty.toLowerCase().includes(q))
        );
      }

      return (
        <>
          <View style={[
            styles.detailsListHeader,
            {
              borderBottomColor: colors.text + '20',
              paddingHorizontal: getScaledFontSize(16),
              paddingVertical: getScaledFontSize(12),
              marginBottom: getScaledFontSize(8),
            }
          ]}>
            <TouchableOpacity onPress={handleBack} style={{ padding: getScaledFontSize(4) }}>
              <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
            <Text style={[
              styles.detailsListTitle,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
                flex: 1,
                marginLeft: getScaledFontSize(8),
              }
            ]}>
              Integrative
            </Text>
            <TouchableOpacity
              onPress={handleIntegrativeUpload}
              disabled={isUploadingIntegrative}
              style={{ padding: getScaledFontSize(4) }}
            >
              {isUploadingIntegrative ? (
                <ActivityIndicator size="small" color={colors.tint || '#008080'} />
              ) : (
                <IconSymbol name="plus" size={getScaledFontSize(22)} color={colors.tint || '#008080'} />
              )}
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: getScaledFontSize(16), paddingBottom: getScaledFontSize(12) }}>
            <PaperTextInput
              label="Search providers"
              value={integrativeSearchQuery}
              onChangeText={setIntegrativeSearchQuery}
              mode="outlined"
              left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
              style={{ backgroundColor: colors.background }}
              textColor={colors.text}
              activeOutlineColor={colors.tint}
            />
          </View>
          {filteredIntegrative.length === 0 ? (
            <View style={[styles.listItem, { paddingVertical: getScaledFontSize(16), paddingHorizontal: getScaledFontSize(16) }]}>
              <Text style={[{ fontSize: getScaledFontSize(14), color: colors.text + '80' }]}>
                {nonEhrProviders.length === 0 ? 'No providers yet — tap + to upload files' : 'No providers found'}
              </Text>
            </View>
          ) : (
            filteredIntegrative.map((provider) => (
              <TouchableOpacity
                key={provider.id}
                style={[
                  styles.listItem,
                  {
                    borderBottomColor: colors.text + '20',
                    paddingVertical: getScaledFontSize(16),
                    paddingHorizontal: getScaledFontSize(16),
                  }
                ]}
                onPress={() => router.push({ pathname: '/Home/non-ehr-provider-detail', params: { id: provider.id } })}
                activeOpacity={0.7}
              >
                <InitialsAvatar
                  name={provider.providerName}
                  size={getScaledFontSize(56)}
                  style={styles.listAvatar}
                />
                <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                  <Text style={[
                    styles.listItemName,
                    {
                      fontSize: getScaledFontSize(16),
                      fontWeight: getScaledFontWeight(600) as any,
                      color: colors.text,
                      marginBottom: getScaledFontSize(4),
                    }
                  ]}>
                    {provider.providerName}
                  </Text>
                  <Text style={[
                    styles.listItemRole,
                    {
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(400) as any,
                      color: colors.text + '80',
                    }
                  ]}>
                    {provider.clinicName}
                  </Text>
                  {provider.specialty && (
                    <Text style={[
                      styles.listItemRole,
                      {
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(400) as any,
                        color: (colors.tint || '#008080'),
                        marginTop: getScaledFontSize(2),
                      }
                    ]}>
                      {provider.specialty}
                    </Text>
                  )}
                </View>
                <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.text + '60'} />
              </TouchableOpacity>
            ))
          )}
        </>
      );
    }

    // Handle Care Manager category specially - show agencies
    if (selectedCategoryId === 'care-manager') {
      return (
        <>
          <View style={[
            styles.detailsListHeader,
            {
              borderBottomColor: colors.text + '20',
              paddingHorizontal: getScaledFontSize(16),
              paddingVertical: getScaledFontSize(12),
              marginBottom: getScaledFontSize(8),
            }
          ]}>
            <TouchableOpacity onPress={handleBack} style={{ padding: getScaledFontSize(4) }}>
              <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
            <Text style={[
              styles.detailsListTitle,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
                flex: 1,
                marginLeft: getScaledFontSize(8),
              }
            ]}>
              Care Manager Agencies
            </Text>
            <View style={{ width: getScaledFontSize(24) }} />
          </View>
          <View style={{ paddingHorizontal: getScaledFontSize(16), paddingBottom: getScaledFontSize(12) }}>
            <PaperTextInput
              label="Search agencies"
              value={agencySearchQuery}
              onChangeText={setAgencySearchQuery}
              mode="outlined"
              left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
              style={{ backgroundColor: colors.background }}
              textColor={colors.text}
              activeOutlineColor={colors.tint}
            />
          </View>
          {agencies.length === 0 ? (
            <View style={[styles.listItem, { paddingVertical: getScaledFontSize(16), paddingHorizontal: getScaledFontSize(16) }]}>
              <Text style={[
                {
                  fontSize: getScaledFontSize(14),
                  color: colors.text + '80',
                }
              ]}>No agencies found</Text>
            </View>
          ) : (
            agencies.map((agency) => (
              <TouchableOpacity
                key={agency.id}
                style={[
                  styles.listItem,
                  {
                    borderBottomColor: colors.text + '20',
                    paddingVertical: getScaledFontSize(16),
                    paddingHorizontal: getScaledFontSize(16),
                  }
                ]}
                onPress={() => {
                  router.push(`/(care-manager-detail)?id=${encodeURIComponent(agency.id)}&name=${encodeURIComponent(agency.name)}`);
                }}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.listAvatar,
                  {
                    width: getScaledFontSize(56),
                    height: getScaledFontSize(56),
                    borderRadius: getScaledFontSize(28),
                    backgroundColor: colors.tint + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
                ]}>
                  <IconSymbol name="building.2" size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
                </View>
                <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                  <Text style={[
                    styles.listItemName,
                    {
                      fontSize: getScaledFontSize(16),
                      fontWeight: getScaledFontWeight(600) as any,
                      color: colors.text,
                      marginBottom: getScaledFontSize(4),
                    }
                  ]}>
                    {agency.name}
                  </Text>
                  <Text style={[
                    styles.listItemRole,
                    {
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(400) as any,
                      color: colors.text + '80',
                    }
                  ]} numberOfLines={2}>
                    {agency.description}
                  </Text>
                  {agency.city && agency.state && (
                    <Text style={[
                      styles.listItemRole,
                      {
                        fontSize: getScaledFontSize(12),
                        fontWeight: getScaledFontWeight(400) as any,
                        color: colors.text + '60',
                        marginTop: getScaledFontSize(4),
                      }
                    ]}>
                      {agency.city}, {agency.state}
                    </Text>
                  )}
                </View>
                <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.text + '60'} />
              </TouchableOpacity>
            ))
          )}
        </>
      );
    }

    // Regular providers rendering for other categories
    let providers = getCurrentProviders();
    const subCategory = selectedCategoryId && selectedSubCategoryId
      ? getSubCategoryById(selectedCategoryId, selectedSubCategoryId)
      : undefined;
    const isNonMedicalCategory = Boolean(selectedCategoryId && selectedCategoryId !== 'medical');
    const canAddMember = isNonMedicalCategory && Boolean(selectedSubCategoryId);

    const manualCategory = selectedCategoryId ? getCategoryById(selectedCategoryId) : undefined;
    const availableSubCategories = manualCategory?.subCategories || [];
    const manualSubCategoryLabel = manualSubCategoryId
      ? availableSubCategories.find(sub => sub.id === manualSubCategoryId)?.name
      : undefined;

    // Filter providers based on search query
    let filteredProviders = providers;
    if (providerSearchQuery.trim()) {
      const query = providerSearchQuery.toLowerCase().trim();
      filteredProviders = providers.filter(provider =>
        provider.name.toLowerCase().includes(query) ||
        (provider.qualifications && provider.qualifications.toLowerCase().includes(query)) ||
        (provider.specialty && provider.specialty.toLowerCase().includes(query)) ||
        (provider.relationship && provider.relationship.toLowerCase().includes(query))
      );
    }

    return (
      <>
        <View style={[
          styles.detailsListHeader,
          {
            borderBottomColor: colors.text + '20',
            paddingHorizontal: getScaledFontSize(16),
            paddingVertical: getScaledFontSize(12),
            marginBottom: getScaledFontSize(8),
          }
        ]}>
          <TouchableOpacity onPress={handleBack} style={{ padding: getScaledFontSize(4) }}>
            <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text style={[
            styles.detailsListTitle,
            {
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
              flex: 1,
              marginLeft: getScaledFontSize(8),
            }
          ]}>
            {subCategory?.name || category?.name || 'Providers'}
          </Text>
          {canAddMember ? (
            <TouchableOpacity
              onPress={() => setShowAddMemberForm(prev => !prev)}
              style={{ padding: getScaledFontSize(4) }}
            >
              <IconSymbol name="plus" size={getScaledFontSize(22)} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: getScaledFontSize(24) }} />
          )}
        </View>
        <View style={{ paddingHorizontal: getScaledFontSize(16), paddingBottom: getScaledFontSize(12) }}>
          <PaperTextInput
            label="Search providers"
            value={providerSearchQuery}
            onChangeText={setProviderSearchQuery}
            mode="outlined"
            left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
            style={{ backgroundColor: colors.background }}
            textColor={colors.text}
            activeOutlineColor={colors.tint}
          />
        </View>
        {canAddMember && (
          <View style={[
            styles.addMemberContainer,
            {
              paddingHorizontal: getScaledFontSize(16),
              paddingBottom: getScaledFontSize(8),
            }
          ]}>
            {showAddMemberForm ? (
              <View style={styles.addMemberForm}>
                <Menu
                  visible={isSubCategoryMenuVisible}
                  onDismiss={() => setIsSubCategoryMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setIsSubCategoryMenuVisible(true)}
                    >
                      {manualSubCategoryLabel || subCategory?.name || 'Select sub-category'}
                    </Button>
                  }
                >
                  {availableSubCategories.map(sub => (
                    <Menu.Item
                      key={sub.id}
                      title={sub.name}
                      onPress={() => {
                        setManualSubCategoryId(sub.id);
                        setIsSubCategoryMenuVisible(false);
                      }}
                    />
                  ))}
                </Menu>
                <PaperTextInput
                  label="Full name"
                  value={manualName}
                  onChangeText={setManualName}
                  mode="outlined"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Relationship"
                  value={manualRelationship}
                  onChangeText={setManualRelationship}
                  mode="outlined"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Phone"
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  mode="outlined"
                  keyboardType="phone-pad"
                  style={styles.addMemberInput}
                />
                <PaperTextInput
                  label="Email"
                  value={manualEmail}
                  onChangeText={setManualEmail}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.addMemberInput}
                />
                <View style={styles.addMemberActions}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setShowAddMemberForm(false);
                      setManualSubCategoryId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => {
                      if (!selectedCategoryId) return;
                      addManualMember(selectedCategoryId, selectedSubCategoryId || undefined);
                    }}
                    disabled={!manualName.trim() || !(manualSubCategoryId || selectedSubCategoryId)}
                  >
                    Add
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                mode="outlined"
                onPress={() => {
                  setManualSubCategoryId(selectedSubCategoryId || null);
                  setShowAddMemberForm(true);
                }}
              >
                Add member
              </Button>
            )}
          </View>
        )}
        {isLoadingProviders ? (
          <View style={[styles.listItem, { paddingVertical: getScaledFontSize(16), paddingHorizontal: getScaledFontSize(16) }]}>
            <Text style={[
              {
                fontSize: getScaledFontSize(14),
                color: colors.text + '80',
              }
            ]}>Loading providers...</Text>
          </View>
        ) : filteredProviders.length === 0 ? (
          <View style={[styles.listItem, { paddingVertical: getScaledFontSize(16), paddingHorizontal: getScaledFontSize(16) }]}>
            <Text style={[
              {
                fontSize: getScaledFontSize(14),
                color: colors.text + '80',
              }
            ]}>No providers found</Text>
          </View>
        ) : (
          filteredProviders.map((provider) => {
            const isSelected = selectedProviderIds.has(String(provider.id));
            const isCircleFull = selectedProviderIds.size >= maxCircleProviders;
            const canAdd = !isSelected && !isCircleFull;
            const showAction = isSelected || !isCircleFull;
            return (
              <TouchableOpacity
                key={provider.id}
                style={[
                  styles.listItem,
                  {
                    borderBottomColor: colors.text + '20',
                    paddingVertical: getScaledFontSize(16),
                    paddingHorizontal: getScaledFontSize(16),
                    backgroundColor: isSelected ? (colors.tint || '#008080') + '15' : 'transparent',
                  }
                ]}
                onPress={provider.isManual ? undefined : () => {
                  router.push(`/Home/doctor-detail?id=${encodeURIComponent(provider.id)}&name=${encodeURIComponent(provider.name)}&qualifications=${encodeURIComponent(provider.qualifications || '')}&specialty=${encodeURIComponent(provider.specialty || '')}`);
                }}
                activeOpacity={provider.isManual ? 1 : 0.7}
              >
                <InitialsAvatar
                  name={provider.name}
                  size={getScaledFontSize(56)}
                  style={styles.listAvatar}
                  image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : undefined}
                />
                <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                  <Text style={[
                    styles.listItemName,
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
                    styles.listItemRole,
                    {
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(400) as any,
                      color: colors.text + '80',
                    }
                  ]}>
                    {provider.isManual
                      ? (provider.relationship || provider.qualifications || 'Member')
                      : (provider.qualifications || provider.specialty || 'Healthcare Provider')}
                  </Text>
                </View>
                {showAction && (
                  <TouchableOpacity
                    style={[
                      styles.providerActionButton,
                      { opacity: canAdd || isSelected ? 1 : 0.4 }
                    ]}
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      if (isSelected) {
                        onRemoveProvider(provider.id);
                      } else if (canAdd) {
                        onAddProvider(provider);
                      }
                    }}
                    disabled={!canAdd && !isSelected}
                  >
                    <IconSymbol name={isSelected ? 'minus' : 'plus'} size={getScaledFontSize(18)} color={colors.tint || '#008080'} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </>
    );
  };

  return (
    <View style={styles.listContainer}>
      <ScrollView
        style={[
          styles.listScrollView,
          hasUpcomingAppointments ? { maxHeight: maxListHeight } : null,
          {
            borderWidth: 1,
            borderColor: colors.text + '15',
            borderRadius: getScaledFontSize(12),
          }
        ]}
        contentContainerStyle={styles.listScrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {currentLevel === 'categories' && renderCategories()}
        {currentLevel === 'sub-categories' && renderSubCategories()}
        {currentLevel === 'providers' && renderProviders()}
      </ScrollView>
    </View>
  );
}

// Provider Details List Component (replaces main list)
interface ProviderDetailsListProps {
  colors: typeof Colors['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  onBack: () => void;
  departmentId?: string;
  departmentName?: string;
  hasUpcomingAppointments: boolean;
}

function ProviderDetailsList({ colors, getScaledFontSize, getScaledFontWeight, onBack, departmentId, departmentName, hasUpcomingAppointments }: ProviderDetailsListProps) {
  // Calculate max height to push appointments to bottom of screen
  const screenHeight = Dimensions.get('window').height;
  const maxListHeight = hasUpcomingAppointments ? Math.min(screenHeight * 0.65, 600) : undefined;

  const [fastenProviders, setFastenProviders] = useState<FastenProvider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // Load doctor photos for all providers in the list
  const providerIds = fastenProviders.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);

  // Load Fasten Health providers
  React.useEffect(() => {
    const loadProviders = async () => {
      setIsLoadingProviders(true);
      try {
        if (departmentId) {
          // Load providers by department
          const departments = await fetchProvidersByDepartment();
          const department = departments.find(d => d.id === departmentId);
          if (department) {
            // Sort by lastVisited in descending order (most recently visited first)
            const sortedDoctors = [...department.providers].sort((a, b) => {
              const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
              const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;

              // If both have dates, sort by date descending
              if (dateA > 0 && dateB > 0) {
                return dateB - dateA; // Descending order (most recent first)
              }
              // If only one has a date, prioritize it
              if (dateA > 0 && dateB === 0) return -1;
              if (dateB > 0 && dateA === 0) return 1;

              // If neither has a date, maintain original order
              return 0;
            });
            setFastenProviders(sortedDoctors);
            console.log(`Loaded ${sortedDoctors.length} providers from department ${department.name}`);
          } else {
            setFastenProviders([]);
          }
        } else {
          // Load all providers (already sorted by lastVisited in fetchProviders)
          const providers = await fetchProviders();
          setFastenProviders(providers);
          console.log(`Loaded ${providers.length} providers from Fasten Health`);
        }
      } catch (error) {
        console.error('Error loading Fasten Health providers:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProviders();
  }, [departmentId]);

  // Flatten all doctors from all departments into a single list
  const allProviders = React.useMemo(() => {
    // Use Fasten Health providers if available, otherwise use default
    if (fastenProviders.length > 0) {
      // Sort by lastVisited in descending order (most recently visited first)
      const sortedProviders = [...fastenProviders].sort((a, b) => {
        const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
        const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;

        // If both have dates, sort by date descending
        if (dateA > 0 && dateB > 0) {
          return dateB - dateA; // Descending order (most recent first)
        }
        // If only one has a date, prioritize it
        if (dateA > 0 && dateB === 0) return -1;
        if (dateB > 0 && dateA === 0) return 1;

        // If neither has a date, maintain original order
        return 0;
      });

      return sortedProviders.map(provider => ({
        id: provider.id,
        name: provider.name,
        qualifications: provider.qualifications || 'Healthcare Provider',
        specialty: provider.specialty || 'General',
        image: undefined,
      }));
    }

    // No providers available
    return [];
  }, [fastenProviders, departmentId]);

  return (
    <View style={styles.listContainer}>
      <View style={[
        styles.detailsListHeader,
        {
          borderBottomColor: colors.text + '20',
          paddingHorizontal: getScaledFontSize(16),
          paddingVertical: getScaledFontSize(12),
          marginBottom: getScaledFontSize(8),
        }
      ]}>
        <TouchableOpacity onPress={onBack} style={{ padding: getScaledFontSize(4) }}>
          <IconSymbol name="chevron.right" size={getScaledFontSize(24)} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <Text style={[
          styles.detailsListTitle,
          {
            fontSize: getScaledFontSize(18),
            fontWeight: getScaledFontWeight(600) as any,
            color: colors.text,
            flex: 1,
            marginLeft: getScaledFontSize(8),
          }
        ]}>
          {departmentName || 'All Providers'}
        </Text>
      </View>
      <ScrollView
        style={[
          styles.listScrollView,
          hasUpcomingAppointments ? { maxHeight: maxListHeight } : null,
          {
            borderWidth: 1,
            borderColor: colors.text + '15',
            borderRadius: getScaledFontSize(12),
          }
        ]}
        contentContainerStyle={styles.listScrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {allProviders.map((doc) => (
          <TouchableOpacity
            key={doc.id}
            style={[
              styles.listItem,
              {
                borderBottomColor: colors.text + '20',
                paddingVertical: getScaledFontSize(16),
                paddingHorizontal: getScaledFontSize(16),
              }
            ]}
            onPress={() => {
              const specialty = (doc as any).specialty || '';
              router.push(`/Home/doctor-detail?id=${encodeURIComponent(doc.id)}&name=${encodeURIComponent(doc.name)}&qualifications=${encodeURIComponent(doc.qualifications || '')}&specialty=${encodeURIComponent(specialty)}`);
            }}
            activeOpacity={0.7}
          >
            <InitialsAvatar
              name={doc.name}
              size={getScaledFontSize(56)}
              style={styles.listAvatar}
              image={doctorPhotos.get(doc.id) ? { uri: doctorPhotos.get(doc.id)! } : undefined}
            />
            <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
              <Text style={[
                styles.listItemName,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                  marginBottom: getScaledFontSize(4),
                }
              ]}>
                {doc.name}
              </Text>
              <Text style={[
                styles.listItemRole,
                {
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(400) as any,
                  color: colors.text + '80',
                }
              ]}>
                {doc.qualifications}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const userImg = undefined;
  const isTabletDevice = isTablet();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [viewMode, setViewMode] = React.useState<'circle' | 'list' | 'circle-providers'>('circle');

  // Load Fasten Health providers for circle view
  const [fastenProviders, setFastenProviders] = useState<FastenProvider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const { selectedProviders, addProvider, removeProvider, validateAndCleanProviders } = useProviderSelection();
  const [patientName, setPatientName] = useState('');
  const [upcomingAppointments, setUpcomingAppointments] = useState<FastenAppointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  const circleProviders = React.useMemo(
    () => selectedProviders.slice(0, MAX_SELECTED_PROVIDERS),
    [selectedProviders]
  );
  const selectedProviderIds = React.useMemo(
    () => new Set(circleProviders.map(provider => String(provider.id))),
    [circleProviders]
  );
  const isCircleComplete = circleProviders.length >= MAX_SELECTED_PROVIDERS;

  // Helper function to get first name from full name
  const getFirstName = (fullName: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || '';
  };

  useEffect(() => {
    const loadProviders = async () => {
      setIsLoadingProviders(true);
      try {
        const providers = await fetchProviders();
        setFastenProviders(providers);
        console.log(`Loaded ${providers.length} providers for home screen`);

        // Validate and clean selected providers when data changes
        await validateAndCleanProviders();
      } catch (error) {
        console.error('Error loading Fasten Health providers:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    const loadPatient = async () => {
      try {
        const patient = await fetchPatientInfo();
        if (patient) {
          setPatientName(patient.name || '');
          console.log('Loaded patient name for home screen:', patient.name);
        }
      } catch (error) {
        console.error('Error loading patient data:', error);
      }
    };

    loadProviders();
    loadPatient();
  }, [validateAndCleanProviders]);

  useEffect(() => {
    const loadUpcomingAppointments = async () => {
      setIsLoadingAppointments(true);
      try {
        const allAppointments = await fetchAppointments();
        const appointments = allAppointments || [];
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 15);

        const upcoming = appointments
          .map(apt => {
            const dateObj = new Date(apt.date);
            if (apt.time) {
              const timeMatch = apt.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
              if (timeMatch) {
                let hour = parseInt(timeMatch[1], 10);
                const minute = parseInt(timeMatch[2], 10);
                const meridiem = timeMatch[3].toUpperCase();
                if (meridiem === 'PM' && hour !== 12) {
                  hour += 12;
                } else if (meridiem === 'AM' && hour === 12) {
                  hour = 0;
                }
                dateObj.setHours(hour, minute, 0, 0);
              }
            }
            return { apt, dateObj };
          })
          .filter(({ dateObj }) => dateObj >= start && dateObj <= end)
          .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
          .map(({ apt }) => apt);

        setUpcomingAppointments(upcoming);
      } catch (error) {
        console.error('Error loading upcoming appointments:', error);
        setUpcomingAppointments([]);
      } finally {
        setIsLoadingAppointments(false);
      }
    };

    loadUpcomingAppointments();
  }, []);

  // Cycle through views: circle -> circle-providers -> list -> circle
  const toggleViewMode = () => {
    if (viewMode === 'circle') {
      setViewMode('circle-providers');
    } else if (viewMode === 'circle-providers') {
      setViewMode('list');
    } else {
      setViewMode('circle');
    }
  };

  // Get icon based on current view (shows what you'll switch to)
  const getToggleIcon = () => {
    if (viewMode === 'circle') {
      return 'person.fill'; // Will switch to circle-providers
    } else if (viewMode === 'circle-providers') {
      return 'list.bullet'; // Will switch to list
    } else {
      return 'circle.fill'; // Will switch back to circle
    }
  };
  const [showProviderDetails, setShowProviderDetails] = React.useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = React.useState<string | undefined>(undefined);
  const [selectedDepartmentName, setSelectedDepartmentName] = React.useState<string | undefined>(undefined);

  // Animation values for sliding between main list and details list
  const screenWidth = Dimensions.get('window').width;
  const mainListSlide = React.useRef(new Animated.Value(0)).current;
  const detailsListSlide = React.useRef(new Animated.Value(screenWidth)).current;
  const mainListOpacity = React.useRef(new Animated.Value(1)).current;
  const detailsListOpacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (showProviderDetails) {
      // Slide in details list from right, slide out main list to left
      Animated.parallel([
        Animated.timing(mainListSlide, {
          toValue: -screenWidth,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(detailsListSlide, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(mainListOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(detailsListOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide back to main list
      Animated.parallel([
        Animated.timing(mainListSlide, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(detailsListSlide, {
          toValue: screenWidth,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(mainListOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(detailsListOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showProviderDetails, screenWidth]);

  return (
    <AppWrapper notificationCount={3}>
      {/* Medical disclaimer — required by App Store §1.4.1 for health apps */}
      <View style={[styles.disclaimerBanner, { backgroundColor: colors.card ?? '#f0f7ff', borderColor: colors.border ?? '#d0e4f7' }]}>
        <Text style={[styles.disclaimerText, { color: colors.subtext ?? '#555', fontSize: getScaledFontSize(11) }]}>
          ⚕️ This app is for care coordination only and does not provide medical advice. Always consult your healthcare provider for medical decisions.
        </Text>
      </View>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.circleSection}>
          <View style={styles.titleRow}>
            <Text style={[
              styles.sectionTitle,
              {
                fontSize: getScaledFontSize(24),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
                paddingBottom: 50,
                flex: 1,
              }
            ]}>
              {getFirstName(patientName)}'s Circle of Support
            </Text>
            <TouchableOpacity
              onPress={toggleViewMode}
              style={[
                styles.toggleButton,
                {
                  backgroundColor: colors.text + '10',
                  padding: getScaledFontSize(10),
                  borderRadius: getScaledFontSize(8),
                  marginBottom: 50,
                }
              ]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name={getToggleIcon()}
                size={getScaledFontSize(24)}
                color={colors.tint || '#008080'}
              />
            </TouchableOpacity>
          </View>
          {viewMode === 'circle' ? (
            isTabletDevice ? (
              <TabletCircleView
                providers={circleProviders}
                userImg={userImg}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                patientName={patientName}
                onAddProviderPress={() => router.push('/modal')}
                isCircleComplete={isCircleComplete}
              />
            ) : (
              <PhoneCircleView
                providers={circleProviders}
                userImg={userImg}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                patientName={patientName}
                onAddProviderPress={() => router.push('/modal')}
                isCircleComplete={isCircleComplete}
              />
            )
          ) : viewMode === 'list' ? (
            <View style={styles.listViewContainer}>
              <Animated.View
                style={[
                  styles.listViewWrapper,
                  {
                    opacity: mainListOpacity,
                    transform: [{ translateX: mainListSlide }],
                  }
                ]}
                pointerEvents={showProviderDetails ? 'none' : 'auto'}
              >
                <ListView
                  userImg={userImg}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onItemPress={(categoryId, subCategoryId) => {
                    // ListView now handles navigation internally
                    // This callback is called when a sub-category is selected
                    console.log(`Selected category: ${categoryId}, sub-category: ${subCategoryId}`);
                  }}
                  patientName={patientName}
                  hasUpcomingAppointments={upcomingAppointments.length > 0}
                  selectedProviderIds={selectedProviderIds}
                  onAddProvider={addProvider}
                  onRemoveProvider={removeProvider}
                  maxCircleProviders={MAX_SELECTED_PROVIDERS}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.listViewWrapper,
                  styles.detailsListWrapper,
                  {
                    opacity: detailsListOpacity,
                    transform: [{ translateX: detailsListSlide }],
                  }
                ]}
                pointerEvents={showProviderDetails ? 'auto' : 'none'}
              >
                <ProviderDetailsList
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onBack={() => {
                    setShowProviderDetails(false);
                    setSelectedDepartmentId(undefined);
                    setSelectedDepartmentName(undefined);
                  }}
                  departmentId={selectedDepartmentId}
                  departmentName={selectedDepartmentName}
                  hasUpcomingAppointments={upcomingAppointments.length > 0}
                />
              </Animated.View>
            </View>
          ) : (
            <CircleProvidersListView
              providers={circleProviders}
              userImg={userImg}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              patientName={patientName}
              hasUpcomingAppointments={upcomingAppointments.length > 0}
              isCircleComplete={isCircleComplete}
            />
          )}
        </View>

        {upcomingAppointments.length > 0 && (
          <View style={styles.appointmentsSection}>
            <Text style={[
              styles.sectionTitle,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
              }
            ]}>Upcoming Appointments</Text>
            <TouchableOpacity
              onPress={() => router.push('/appointments-modal')}
              style={[
                styles.deckContainer,
                {
                  height: Math.max(
                    56,
                    getScaledFontSize(16) + getScaledFontSize(2) + getScaledFontSize(14) + (getScaledFontSize(8) * 2) + getScaledFontSize(4)
                  ),
                }
              ]}
            >
              {upcomingAppointments.slice(0, 3).map((appointment, index) => {
                const appointmentDate = new Date(appointment.date);
                const dateLabel = appointmentDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });
                const title = appointment.doctorName
                  ? `${appointment.type || 'Appointment'} - ${appointment.doctorName}`
                  : appointment.type || 'Appointment';
                const iconNames = ['calendar-clock', 'stethoscope', 'tooth'];
                const cardStyle = [styles.firstCard, styles.secondCard, styles.thirdCard][index] || styles.firstCard;

                return (
                  <Card
                    key={appointment.id}
                    style={[
                      styles.appointmentCard,
                      cardStyle,
                      {
                        height: Math.max(
                          56,
                          getScaledFontSize(16) + getScaledFontSize(2) + getScaledFontSize(14) + (getScaledFontSize(8) * 2) + getScaledFontSize(4)
                        ),
                      }
                    ]}
                  >
                    <View style={[
                      styles.listItemContainer,
                      {
                        paddingHorizontal: getScaledFontSize(16),
                        paddingVertical: getScaledFontSize(8),
                        minHeight: Math.max(
                          56,
                          getScaledFontSize(16) + getScaledFontSize(2) + getScaledFontSize(14) + (getScaledFontSize(8) * 2) + getScaledFontSize(4)
                        ),
                      }
                    ]}>
                      <View style={{ transform: [{ scale: getScaledFontSize(24) / 24 }] }}>
                        <List.Icon icon={iconNames[index] || 'calendar'} />
                      </View>
                      <View style={[
                        styles.listItemContent,
                        {
                          marginLeft: getScaledFontSize(16),
                          flexShrink: 1,
                        }
                      ]}>
                        <Text style={[
                          styles.appointmentTitle,
                          {
                            fontSize: getScaledFontSize(16),
                            fontWeight: settings.isBoldTextEnabled ? '700' : '500',
                            marginBottom: getScaledFontSize(2),
                          }
                        ]}>{title}</Text>
                        <Text style={[
                          styles.appointmentDescription,
                          {
                            fontSize: getScaledFontSize(14),
                            fontWeight: settings.isBoldTextEnabled ? '600' : '400'
                          }
                        ]}>{`${dateLabel} · ${appointment.time}`}</Text>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  disclaimerBanner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  disclaimerText: {
    textAlign: 'center',
    lineHeight: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  circleSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.05,
  },
  headerLogo: {
    width: 120,
    height: 60,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '600',
  },
  circleContainer: {
    width: 320,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitAvatar: {
    position: 'absolute',
    width: 56,
    height: 80,
  },
  addProviderAvatar: {
    borderWidth: 2,
    borderColor: '#008080',
    borderStyle: 'dashed',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  avatarWithBorder: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  centerBadge: {
    position: 'absolute',
    bottom: 40,
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    elevation: 2,
  },
  centerBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  moreDoctorsButton: {
    alignSelf: 'center',
  },
  moreButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    alignSelf: 'center',
    textAlign: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingTop: 20,
  },
  appointmentsSection: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    gap: 12,
  },
  deckContainer: {
    position: 'relative',
    height: 56,
  },
  appointmentCard: {
    borderRadius: 16,
    position: 'absolute',
    width: '100%',
    height: 56,
  },
  firstCard: {
    zIndex: 3,
    top: 0,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  secondCard: {
    zIndex: 2,
    top: 8,
    left: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  thirdCard: {
    zIndex: 1,
    top: 16,
    left: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  linkLine: {
    position: 'absolute',
    height: 2,
    top: '50%',
    left: '50%',
    marginLeft: 0,
    marginTop: -1,
    borderRadius: 1,
  },
  centerAvatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerAvatarImage: {
    // backgroundColor removed - let InitialsAvatar handle it
  },
  centerAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  orbitAvatarText: {
    marginTop: 4,
    textAlign: 'center',
  },
  listItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 56,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  appointmentDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 0,
  },
  toggleButton: {
    // Styles applied inline
  },
  listContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 0,
  },
  listScrollView: {
    width: '100%',
  },
  listScrollContent: {
    paddingBottom: 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    width: '100%',
  },
  providerActionButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#008080',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listAvatar: {
    backgroundColor: 'transparent',
  },
  listItemName: {
    // Styles applied inline
  },
  listItemRole: {
    // Styles applied inline
  },
  addMemberContainer: {
    width: '100%',
  },
  addMemberForm: {
    width: '100%',
    gap: 10,
  },
  addMemberInput: {
    backgroundColor: 'transparent',
  },
  addMemberActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  listViewContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  listViewWrapper: {
    flex: 1,
    width: '100%',
  },
  detailsListWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  detailsListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  detailsListTitle: {
    // Styles applied inline
  },
  categorySection: {
    width: '100%',
  },
  categoryHeader: {
    // Styles applied inline
  },
});
