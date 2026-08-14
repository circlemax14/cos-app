import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FilterMenu } from '@/components/ui/filter-menu';
import { Colors } from '@/constants/theme';
import { SUPPORT_CATEGORIES, getCategoryById, getSubCategoryById, matchProviderToSubCategory } from '@/constants/categories';
import { useAccessibility } from '@/stores/accessibility-store';
import { MAX_SELECTED_PROVIDERS, useProviderSelection, type SelectedProvider, type SelectedCareManager } from '@/stores/provider-selection-store';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Button, Card, List, Menu, TextInput as PaperTextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProviders, fetchProvidersByDepartment } from '@/services/api/providers';
import { fetchAppointments } from '@/services/api/appointments';
import { fetchPatientInfo } from '@/services/api/patient';
import { fetchPendingTaskCount } from '@/services/api/ai-health-plan';
import { fetchRecommendedAppointments } from '@/services/api/recommended-appointments';
import type { RecommendedAppointment , Provider as FastenProvider , Appointment as FastenAppointment } from '@/services/api/types';
// SCRUM-279 (2026-06-03): Today's Appointments card pulls from the
// UNIFIED calendar feed (FHIR appts + user-created + care-manager-
// added + health-plan tasks + device + reminders), not just FHIR.
import { useCalendar } from '@/hooks/use-calendar'
import type { CalendarEvent } from '@/services/calendar'
import { EntityIcon } from '@/components/icons';
import { useUserPhoto } from '@/stores/user-photo-store';
import { getAllCareManagerAgencies, searchCareManagerAgencies, type CareManagerAgency } from '@/services/care-manager-agencies';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import {
  getNonEhrProviders,
  processAndStoreFiles,
  type NonEhrProvider,
} from '@/services/non-ehr-processor';
import { QuickActionButtons } from '@/components/home/quick-action-buttons';
import { BloomingOrbitItem } from '@/components/home/blooming-orbit-item';
// COS-482 Phase 1: patient-facing inbox card for CM-issued retake requests.
// Renders `null` when there are no pending items, so the mount is a no-op
// on the flag-off / empty state — no chrome, no layout shift.
import RetakeRequestInboxCard from '@/components/health-plan/retake-request/RetakeRequestInboxCard';
// SCRUM-638 — Bevel-inspired Daily Readiness score. Reads HealthKit
// on-device, computes vs a rolling 14-day personal baseline. Gated
// behind `readiness_score_enabled` flag; default OFF.
import { ReadinessScoreCard } from '@/components/home/ReadinessScoreCard';
import { useReadinessScoreFlag } from '@/hooks/use-readiness-score-flag';
import { useReadinessDerivation } from '@/hooks/use-readiness-derivation';
// SCRUM-642 — Health Age tile (dark-launched behind `health_age_enabled`).
// Card renders NOTHING when flag OFF OR when overall=null with <3 fresh
// components. Terminology fixed to "Health Age" (Legal). Do NOT swap to
// "Biological Age" without a cleared answer to the Legal ask in DESIGN.
import { HealthAgeCard } from '@/components/health-age/HealthAgeCard';
import { useHealthAgeFlag } from '@/hooks/use-health-age-flag';
import { useHealthAge } from '@/hooks/use-health-age';
// SCRUM-644 — Daily Read card (dark-launched behind `daily_read_enabled`).
// Self-gated: DailyReadCard returns null when flag OFF (defense in depth).
// Copy is HONEST placeholder pending Ken clinical + design review.
import { DailyReadCard } from '@/components/home/DailyReadCard';
import { useDailyReadFlag } from '@/hooks/use-daily-read-flag';
// 2026-08-05 — replaces the 3 stacked hero cards with a compact side-by-side row.
import { HeroInsightsRow } from '@/components/home/HeroInsightsRow';
// SCRUM-639 — Explainable score. buildReadinessExplainPrompt turns
// the score + drivers into an AI prompt with the specific inputs.
import { buildReadinessExplainPrompt } from '@/lib/readiness-explain-prompt';

// ─────────────────────────────────────────────────────────────────────
// ADR-0003 Phase 1 (Home Redesign) — v2 surface imports.
// Everything below is dead code when EXPO_PUBLIC_HOME_V2_ENABLED !== 'true'
// (Metro tree-shakes on the module-level flag call inside the render).
// The legacy render path is UNCHANGED when the flag is OFF.
// ─────────────────────────────────────────────────────────────────────
import {
  isHomeV2Enabled,
  isHomeV2PlaceholdersEnabled,
  getHomeCircleProminence,
} from '@/hooks/use-home-v2-flag';
import { HomeResponsiveProvider } from '@/components/home/HomeResponsiveProvider';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { HomeQuickActionPills } from '@/components/home/HomeQuickActionPills';
import { ScoreCardGrid } from '@/components/home/ScoreCardGrid';
import { WellbeingMapPreview } from '@/components/home/WellbeingMapPreview';
import { WellbeingScoreTile } from '@/components/home/WellbeingScoreTile';
import { useCurrentHour } from '@/hooks/use-current-hour';
import { HeroScoreBlock } from '@/components/health-plan/senior/HeroScoreBlock';
import { BpsPlanFocusBanner } from '@/components/health-plan/BpsPlanFocusBanner';
import { useScoreCatalog, type ScoreRow } from '@/hooks/use-score-catalog';
import { useWellbeingDerivation } from '@/hooks/use-wellbeing-derivation';
// SCRUM-652 — legacy-home v2 injection gate. Distinct from `isHomeV2Enabled()`
// (that returns the entire redesigned surface). This flag enables three
// surgical v2 blocks (GreetingHeader, ScoreCardGrid, WellbeingMapPreview)
// inside the existing legacy render tree so we can dark-launch each block
// without cutting over the whole screen.
import { useHomeV2InjectionsEnabled } from '@/hooks/use-home-v2-injections-flag';
import { useTodayWindow } from '@/hooks/use-local-day';

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

type OrbitItem = SelectedProvider | { id: string; isPlaceholder: true } | { id: string; isCareManager: true; name: string; agencyName?: string; logoUrl?: string };

interface CircleViewProps {
  providers: SelectedProvider[];
  userImg?: number | { uri: string };
  colors: typeof Colors['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  patientName?: string;
  patientPhotoUrl?: string | null;
  cmLogoUrl?: string | null;
  onAddProviderPress: () => void;
  isCircleComplete: boolean;
  selectedCareManager?: SelectedCareManager | null;
  onCareManagerPress?: () => void;
  pendingTaskCount?: number;
}

// Original Circle View for iPhone/Android (fixed dimensions)
function PhoneCircleView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', patientPhotoUrl, cmLogoUrl, onAddProviderPress, isCircleComplete, selectedCareManager, onCareManagerPress, pendingTaskCount = 0 }: CircleViewProps) {
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

  // Build orbit items: selected CM + providers + ONE "+" placeholder (never two)
  const hasCareManager = !!selectedCareManager;
  const orbitItems: OrbitItem[] = [];

  // Add care manager if selected
  if (hasCareManager) {
    orbitItems.push({ id: selectedCareManager!.id, isCareManager: true, name: selectedCareManager!.name, agencyName: selectedCareManager!.agencyName, logoUrl: cmLogoUrl || selectedCareManager!.logoUrl });
  }

  // Add providers
  orbitItems.push(...providers);

  // Add exactly ONE "+" placeholder if circle isn't full
  if (!isCircleComplete) {
    orbitItems.push({ id: 'add-provider', isPlaceholder: true });
  }

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
        {/* SCRUM-579 (2026-07-13): teal glow ring around the center
            patient bubble on phone. Ken asked for a focal treatment on
            phone (iPad gets the size bump). Wrapper View owns the
            shadow so it follows the avatar's circular shape; the
            TouchableOpacity + pendingBadge sit inside unchanged. */}
        <View
          style={{
            width: getScaledFontSize(centerAvatarSize),
            height: getScaledFontSize(centerAvatarSize),
            borderRadius: getScaledFontSize(centerAvatarSize) / 2,
            backgroundColor: colors.background,
            shadowColor: '#008080',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.45,
            shadowRadius: 14,
            elevation: 8,
          }}
        >
        <TouchableOpacity
          onPress={() => {
            try {
              console.log('Navigating to today-schedule...');
              router.push('/Home/today-schedule' as any);
            } catch (error) {
              console.error('Error navigating to today-schedule:', error);
              // Fallback navigation
              try {
                router.push('/Home/today-schedule' as any);
              } catch (fallbackError) {
                console.error('Fallback navigation also failed:', fallbackError);
              }
            }
          }}
          activeOpacity={0.8}
          style={{ position: 'relative' }}
        >
          <EntityIcon
            type="patient"
            imageUrl={patientPhotoUrl ?? null}
            name={patientName ?? 'Patient'}
            size={getScaledFontSize(centerAvatarSize)}
            style={styles.centerAvatarImage}
          />
          {pendingTaskCount > 0 && (
            <View
              style={[
                styles.pendingBadge,
                {
                  top: -4,
                  right: -6,
                  backgroundColor: '#EF4444',
                  borderColor: colors.background,
                },
              ]}
              accessibilityLabel={`${pendingTaskCount} pending tasks`}
            >
              <Text style={styles.pendingBadgeText}>
                {pendingTaskCount > 9 ? '9+' : pendingTaskCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        </View>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.centerAvatarText,
            {
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
            }
          ]}>{patientName}</Text>
      </View>
      {isCircleComplete && (
        // SCRUM-279 (2026-06-10 build 39): build 38 still too small per Ken.
        // Bumped to fontSize 15, paddingH 18, paddingV 8 — comfortably
        // tappable pill, not a chip and not chunky.
        <Pressable
          onPress={() => router.push('/modal')}
          style={({ pressed }) => ({
            alignSelf: 'center',
            backgroundColor: '#008080',
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: 999,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="More providers"
        >
          <Text
            style={{ color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.3, lineHeight: 18 }}
            allowFontScaling={false}
          >
            More
          </Text>
        </Pressable>
      )}
      {orbitItems.map((item, idx) => {
        const angle = (idx / orbitItems.length) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isPlaceholder = 'isPlaceholder' in item;
        const isCareManager = 'isCareManager' in item;
        const avatarSize = isCareManager ? orbitAvatarSize * 1.15 : orbitAvatarSize;
        const containerSize = isCareManager ? orbitAvatarContainerSize * 1.15 : orbitAvatarContainerSize;
        const halfContainerSize = containerSize / 2;
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
            {/* SCRUM-279 (build 42): bloom + drift animation per Ken's
                provider-bloom HTML reference. Position lives on the
                BloomingOrbitItem wrapper; the TouchableOpacity fills
                it and keeps its press handlers untouched. */}
            <BloomingOrbitItem
              left={containerWidth / 2 + x - halfContainerSize}
              top={containerHeight / 2 + y - halfContainerSize}
              width={containerSize}
              height={containerSize}
              zIndex={1}
              index={idx}
            >
            <TouchableOpacity
              style={[
                styles.orbitAvatar,
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                },
              ]}
              onPress={() => {
                if (isPlaceholder) {
                  // Check if this is the care manager placeholder
                  if (item.id === 'add-care-manager' && onCareManagerPress) {
                    onCareManagerPress();
                  } else {
                    onAddProviderPress();
                  }
                  return;
                }
                if (isCareManager) {
                  router.push(`/agency-detail?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}` as never);
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
                <View style={[
                  styles.addProviderAvatar,
                  { width: getScaledFontSize(avatarSize), height: getScaledFontSize(avatarSize) },
                  item.id === 'add-care-manager' && { borderColor: '#6B21A8', borderWidth: 2, borderStyle: 'dashed' },
                ]}>
                  <IconSymbol name="plus" size={getScaledFontSize(24)} color={item.id === 'add-care-manager' ? '#6B21A8' : (colors.tint || '#008080')} />
                </View>
              ) : isCareManager ? (
                <>
                  {'logoUrl' in item && item.logoUrl ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      style={{
                        width: getScaledFontSize(avatarSize),
                        height: getScaledFontSize(avatarSize),
                        borderRadius: getScaledFontSize(avatarSize) / 2,
                        borderWidth: 2,
                        borderColor: '#6B21A8',
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: getScaledFontSize(avatarSize),
                      height: getScaledFontSize(avatarSize),
                      borderRadius: getScaledFontSize(avatarSize) / 2,
                      backgroundColor: '#6B21A8',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <MaterialIcons name="support-agent" size={getScaledFontSize(24)} color="#FFFFFF" />
                    </View>
                  )}
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    allowFontScaling={false}
                    style={[
                      styles.orbitAvatarText,
                      {
                        // SCRUM-279 (2026-06-08): Ken asked to reduce
                        // provider-name font on phone. 12pt → 10pt
                        // and allowFontScaling=false so device
                        // Large Text settings can't blow up the orbit.
                        fontSize: 10,
                        fontWeight: getScaledFontWeight(500) as any,
                        color: colors.text,
                        width: 90,
                        textAlign: 'center'
                      }
                    ]}>
                    {formatProviderDisplayName(item.name)}
                  </Text>
                </>
              ) : (
                <>
                  <EntityIcon
                    type="provider"
                    specialty={item.specialty ?? undefined}
                    imageUrl={doctorPhotos.get(item.id) ?? null}
                    iconUrl={item.iconUrl ?? null}
                    name={item.name ?? 'Provider'}
                    size={getScaledFontSize(avatarSize)}
                  />
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    allowFontScaling={false}
                    style={[
                      styles.orbitAvatarText,
                      {
                        // SCRUM-279 (2026-06-08): Ken asked to reduce
                        // provider-name font on phone. 12pt → 10pt
                        // and allowFontScaling=false so device
                        // Large Text settings can't blow up the orbit.
                        fontSize: 10,
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
            </BloomingOrbitItem>
          </React.Fragment>
        );
      })}
    </View >
  );
}

// Responsive Circle View for iPad/Tablet
function TabletCircleView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', patientPhotoUrl, cmLogoUrl, onAddProviderPress, isCircleComplete, selectedCareManager, onCareManagerPress, pendingTaskCount = 0 }: CircleViewProps) {
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
  // SCRUM-265 #15: cap reduced 2.2 → 1.7 — the circle was visually overwhelming
  // the rest of the home screen on iPads / large tablets.
  // SCRUM-267: Ken asked for another ~20% reduction on tablet. Cap lowered
  // 1.7 → 1.36 (1.7 × 0.8).
  // SCRUM-279 (2026-06-03): Ken asked for a 30% reduction on iPad.
  // Cap lowered 1.36 → 0.95.
  // SCRUM-279 (2026-06-08): another 10% reduction on iPad (so the
  // orbit feels lighter). Cap 0.95 → 0.855 (×0.9).
  const scaleFactor = Math.min(screenWidth / baseWidth, 0.855);

  // Base radius for orbit - original design value
  const baseRadius = 144 * 1.1; // ~158.4

  // Avatar container size - scale proportionally.
  // Build 36: 150 → 180. Build 39: 180 → 225. Build 41: 225 → 300
  // (mistaken — this wrapper governs the text+bubble enclosure, NOT
  // the bubble itself which is orbitAvatarSize below). Build 44 we
  // dropped 300 → 180 to remove the dead air left when the bubble
  // shrunk back to 78.
  // Build 45 (2026-06-11): Ken still sees space above/below on iPad.
  // Drop further 180 → 120 — just enough to host avatar (67px) +
  // name (32px for two lines @ 14pt) + a 16px buffer. Vertical dead
  // space per side drops ~25px. iPhone untouched.
  const baseAvatarContainerSize = 120;
  const avatarContainerSize = baseAvatarContainerSize * Math.min(scaleFactor, 1.875);
  const containerPadding = 1;

  // Calculate maximum radius that fits within available width
  // Increased containerPadding to allow more space between center and orbiting circles
  const adjustedContainerPadding = containerPadding * 1.5;
  const maxRadius = (maxAvailableWidth - avatarContainerSize - (adjustedContainerPadding * 2)) / 2;

  // Avatar sizes - scale less aggressively than the circle (calculate early for radius calculation).
  // SCRUM-579 (2026-07-13): Ken reversed build-45's binding — the patient
  // bubble should draw the eye when the app opens. iPad gets BOTH a
  // 1.75× focal multiplier (78 × 1.75 × 0.855 ≈ 117px rendered on iPad
  // Pro 11" vs the orbit's ~66.7px) AND a teal glow ring (added inline
  // where the wrapper renders below). iPhone (PhoneCircleView) gets the
  // glow ring only, no size bump — its 80px centerAvatarSize was
  // already visually appropriate for the smaller screen.
  const CENTER_FOCAL_MULTIPLIER = 1.75;
  const centerAvatarSize = 78 * CENTER_FOCAL_MULTIPLIER * Math.min(scaleFactor, 1.5);

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
  // Build orbit items: selected CM + providers + ONE "+" placeholder (never two)
  const hasCareManager = !!selectedCareManager;
  const orbitItems: OrbitItem[] = [];

  // Add care manager if selected
  if (hasCareManager) {
    orbitItems.push({ id: selectedCareManager!.id, isCareManager: true, name: selectedCareManager!.name, agencyName: selectedCareManager!.agencyName, logoUrl: cmLogoUrl || selectedCareManager!.logoUrl });
  }

  // Add providers
  orbitItems.push(...providers);

  // Add exactly ONE "+" placeholder if circle isn't full
  if (!isCircleComplete) {
    orbitItems.push({ id: 'add-provider', isPlaceholder: true });
  }
  const minRadiusForSpacing = (maxContainerSize * orbitItems.length * 1.5) / (2 * Math.PI);

  // Scale radius more aggressively for larger screens - increased multiplier for more spacing
  const desiredRadius = baseRadius * scaleFactor * adaptiveMultiplier;
  // Use the larger of: desired radius, minimum from center, or minimum for spacing
  const radius = Math.min(Math.max(desiredRadius, minRadiusFromCenter, minRadiusForSpacing), maxRadius);

  // Calculate container size based on actual radius
  const containerWidth = (radius * 2) + avatarContainerSize + (adjustedContainerPadding * 2);
  const containerHeight = containerWidth; // Keep it square
  // SCRUM-279 (2026-06-11 build 42): the rendered AVATAR (image circle)
  // size lives here — separate from the avatarContainerSize bumps in
  // builds 39/40/41 (which only widened the wrapper that hosts the
  // name text below). On iPad: 48 × 0.855 = ~41px — way too small.
  // Bumped to 120 base → 102px rendered on iPad. Phones unaffected
  // because PhoneCircleView has its own orbitAvatarSize constant.
  // Build 43 (2026-06-11): Ken says 102px was way too big. Reduce by
  // 35%: 120 → 78. Renders ~66.7px on iPad Pro 11" — bigger than
  // the original 41px but no longer overwhelming the orbit.
  const orbitAvatarSize = 78 * Math.min(scaleFactor, 1.5);
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
        {/* SCRUM-579 (2026-07-13): teal glow ring around the center
            patient bubble on iPad too. Same wrapper pattern as phone —
            iPad also gets the 1.75× size bump above; glow reinforces
            the focal-point treatment. shadowRadius scaled up on iPad
            so the ring feels proportional to the larger avatar. */}
        <View
          style={{
            width: getScaledFontSize(centerAvatarSize),
            height: getScaledFontSize(centerAvatarSize),
            borderRadius: getScaledFontSize(centerAvatarSize) / 2,
            backgroundColor: colors.background,
            shadowColor: '#008080',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.45,
            shadowRadius: 18,
            elevation: 10,
          }}
        >
        <TouchableOpacity
          onPress={() => {
            try {
              console.log('Navigating to today-schedule...');
              router.push('/Home/today-schedule' as any);
            } catch (error) {
              console.error('Error navigating to today-schedule:', error);
              // Fallback navigation
              try {
                router.push('/Home/today-schedule' as any);
              } catch (fallbackError) {
                console.error('Fallback navigation also failed:', fallbackError);
              }
            }
          }}
          activeOpacity={0.8}
          style={{ position: 'relative' }}
        >
          <EntityIcon
            type="patient"
            imageUrl={patientPhotoUrl ?? null}
            name={patientName ?? 'Patient'}
            size={getScaledFontSize(centerAvatarSize)}
            style={styles.centerAvatarImage}
          />
          {pendingTaskCount > 0 && (
            <View
              style={[
                styles.pendingBadge,
                {
                  top: -4,
                  right: -6,
                  backgroundColor: '#EF4444',
                  borderColor: colors.background,
                },
              ]}
              accessibilityLabel={`${pendingTaskCount} pending tasks`}
            >
              <Text style={styles.pendingBadgeText}>
                {pendingTaskCount > 9 ? '9+' : pendingTaskCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        </View>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.centerAvatarText,
            {
              fontSize: getScaledFontSize(16 * Math.min(scaleFactor, 1.5)),
              fontWeight: getScaledFontWeight(600) as any,
              color: colors.text,
            }
          ]}>{patientName}</Text>
      </View>
      {isCircleComplete && (
        // SCRUM-279 (2026-06-11 build 41): iPad More pill — bumped
        // larger than iPhone (Ken: iPad still too small at 15/18/8).
        // 22/28/12 — feels like a proper iPad button, not a phone pill.
        <Pressable
          onPress={() => router.push('/modal')}
          style={({ pressed }) => ({
            alignSelf: 'center',
            backgroundColor: '#008080',
            paddingHorizontal: 28,
            paddingVertical: 12,
            borderRadius: 999,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="More providers"
        >
          <Text
            style={{ color: '#fff', fontSize: 22, fontWeight: '600', letterSpacing: 0.3, lineHeight: 26 }}
            allowFontScaling={false}
          >
            More
          </Text>
        </Pressable>
      )}
      {orbitItems.map((item, idx) => {
        const angle = (idx / orbitItems.length) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isPlaceholder = 'isPlaceholder' in item;
        const isCareManager = 'isCareManager' in item;
        const avatarSize = isCareManager ? orbitAvatarSize * 1.15 : orbitAvatarSize;
        const containerSize = isCareManager ? orbitAvatarContainerSize * 1.15 : orbitAvatarContainerSize;
        const halfContainerSize = containerSize / 2;
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
            {/* SCRUM-279 (build 42): bloom + drift animation (Ken's
                provider-bloom HTML reference). Positioning lives on
                the wrapper; the TouchableOpacity stays tappable inside. */}
            <BloomingOrbitItem
              left={containerWidth / 2 + x - halfContainerSize}
              top={containerHeight / 2 + y - halfContainerSize}
              width={containerSize}
              height={containerSize}
              zIndex={1}
              index={idx}
            >
            <TouchableOpacity
              style={[
                styles.orbitAvatar,
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: containerSize,
                  paddingHorizontal: 4,
                  width: '100%',
                  height: '100%',
                },
              ]}
              onPress={() => {
                if (isPlaceholder) {
                  if (item.id === 'add-care-manager' && onCareManagerPress) {
                    onCareManagerPress();
                  } else {
                    onAddProviderPress();
                  }
                  return;
                }
                if (isCareManager) {
                  router.push(`/agency-detail?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}` as never);
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
                <View style={[
                  styles.addProviderAvatar,
                  { width: getScaledFontSize(avatarSize), height: getScaledFontSize(avatarSize) },
                  item.id === 'add-care-manager' && { borderColor: '#6B21A8', borderWidth: 2, borderStyle: 'dashed' },
                ]}>
                  <IconSymbol name="plus" size={getScaledFontSize(24)} color={item.id === 'add-care-manager' ? '#6B21A8' : (colors.tint || '#008080')} />
                </View>
              ) : isCareManager ? (
                <>
                  {'logoUrl' in item && item.logoUrl ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      style={{
                        width: getScaledFontSize(avatarSize),
                        height: getScaledFontSize(avatarSize),
                        borderRadius: getScaledFontSize(avatarSize) / 2,
                        borderWidth: 2,
                        borderColor: '#6B21A8',
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: getScaledFontSize(avatarSize),
                      height: getScaledFontSize(avatarSize),
                      borderRadius: getScaledFontSize(avatarSize) / 2,
                      backgroundColor: '#6B21A8',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <MaterialIcons name="support-agent" size={getScaledFontSize(24)} color="#FFFFFF" />
                    </View>
                  )}
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={[
                      styles.orbitAvatarText,
                      {
                        // SCRUM-279 (2026-06-08 build 36): Ken asked
                        // to bump provider name font on iPad. Base
                        // 12 → 16 + cap 1.5 → 1.8 so iPad gets
                        // visibly larger names while iPhone stays
                        // on its own scale-down branch.
                        fontSize: getScaledFontSize(16 * Math.min(scaleFactor, 1.8)),
                        fontWeight: getScaledFontWeight(500) as any,
                        color: colors.text,
                        textAlign: 'center',
                      }
                    ]}>
                    {formatProviderDisplayName(item.name)}
                  </Text>
                </>
              ) : (
                <>
                  <EntityIcon
                    type="provider"
                    specialty={item.specialty ?? undefined}
                    imageUrl={doctorPhotos.get(item.id) ?? null}
                    iconUrl={item.iconUrl ?? null}
                    name={item.name ?? 'Provider'}
                    size={getScaledFontSize(avatarSize)}
                  />
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={[
                      styles.orbitAvatarText,
                      {
                        // SCRUM-279 (2026-06-08 build 36): Ken asked
                        // to bump provider name font on iPad. Base
                        // 12 → 16 + cap 1.5 → 1.8 so iPad gets
                        // visibly larger names while iPhone stays
                        // on its own scale-down branch.
                        fontSize: getScaledFontSize(16 * Math.min(scaleFactor, 1.8)),
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
            </BloomingOrbitItem>
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
  patientPhotoUrl?: string | null;
  hasUpcomingAppointments: boolean;
  isCircleComplete: boolean;
}

function CircleProvidersListView({ providers, userImg, colors, getScaledFontSize, getScaledFontWeight, patientName = '', patientPhotoUrl, hasUpcomingAppointments, isCircleComplete }: CircleProvidersListViewProps) {
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
          onPress={() => router.push('/Home/today-schedule' as any)}
          activeOpacity={0.7}
        >
          <EntityIcon
          type="patient"
          imageUrl={patientPhotoUrl ?? null}
          name={patientName ?? 'Patient'}
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
              <EntityIcon
                type="provider"
                specialty={provider.specialty ?? undefined}
                imageUrl={doctorPhotos.get(provider.id) ?? null}
                iconUrl={provider.iconUrl ?? null}
                name={provider.name ?? 'Provider'}
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
        {/* SCRUM-279 (2026-06-10 build 39): ListView More pill — bumped
            to fontSize 15, paddingH 18, paddingV 8 to match iPhone/iPad
            circle views. Build 38 was still too small per Ken. */}
        <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: 4 }}>
          {isCircleComplete && (
            <Pressable
              onPress={() => router.push('/modal')}
              style={({ pressed }) => ({
                alignSelf: 'center',
                backgroundColor: '#008080',
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 999,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="More providers"
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: '600',
                  letterSpacing: 0.3,
                  lineHeight: 18,
                }}
                allowFontScaling={false}
              >
                More
              </Text>
            </Pressable>
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
  patientPhotoUrl?: string | null;
  hasUpcomingAppointments: boolean;
  selectedProviderIds: Set<string>;
  onAddProvider: (provider: SelectedProvider) => void;
  onRemoveProvider: (providerId: string) => void;
  maxCircleProviders: number;
}

type ListViewLevel = 'categories' | 'sub-categories' | 'providers';

function ListView({ userImg, colors, getScaledFontSize, getScaledFontWeight, onItemPress, patientName = '', patientPhotoUrl, hasUpcomingAppointments, selectedProviderIds, onAddProvider, onRemoveProvider, maxCircleProviders }: ListViewProps) {
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
        onPress={() => router.push('/Home/today-schedule' as any)}
        activeOpacity={0.7}
      >
        <EntityIcon
          type="patient"
          imageUrl={patientPhotoUrl ?? null}
          name={patientName ?? 'Patient'}
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
        if (category.id === 'care-manager') {
          // Care manager agencies are fetched separately
          categoryProviderCount = agencies.length;
        } else if (category.id === 'integrative') {
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
              <IconSymbol name={(category.icon || 'circle.fill') as any} size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
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
                <IconSymbol name={(subCategory.icon || 'circle.fill') as any} size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
              </View>
              <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                <Text style={[
                  styles.listItemName,
                  {
                    fontSize: getScaledFontSize(16),
                    lineHeight: getScaledFontSize(22),
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
                <EntityIcon
                  type="provider"
                  specialty={provider.specialty ?? undefined}
                  imageUrl={null}
                  name={provider.providerName ?? 'Provider'}
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
                  router.push(`/agency-detail?id=${encodeURIComponent(agency.id)}&name=${encodeURIComponent(agency.name)}` as never);
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
                    overflow: 'hidden',
                  }
                ]}>
                  {agency.logoUrl ? (
                    <Image
                      source={{ uri: agency.logoUrl }}
                      style={{
                        width: getScaledFontSize(56),
                        height: getScaledFontSize(56),
                        borderRadius: getScaledFontSize(28),
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <IconSymbol name="building.2" size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
                  )}
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
                  ]} numberOfLines={3}>
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
                <EntityIcon
                  type="provider"
                  specialty={provider.specialty ?? undefined}
                  imageUrl={doctorPhotos.get(provider.id) ?? null}
                  iconUrl={provider.iconUrl ?? null}
                  name={provider.name ?? 'Provider'}
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
  const [, setIsLoadingProviders] = useState(false);

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

  // Flatten all doctors from all departments into a single list.
  // Providers with clinical data (`hasData`) are sorted first as the active
  // care team. Providers without data (mentioned in records but with no
  // encounters/medications/reports) are grouped after them as "Mentioned"
  // and rendered greyed-out without a navigable detail screen.
  const allProviders = React.useMemo(() => {
    if (fastenProviders.length === 0) return [];

    const sortedProviders = [...fastenProviders].sort((a, b) => {
      // hasData first (true before false)
      const dataA = a.hasData !== false ? 1 : 0;
      const dataB = b.hasData !== false ? 1 : 0;
      if (dataA !== dataB) return dataB - dataA;

      // Then by lastVisited (most recent first)
      const dateA = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
      const dateB = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
      if (dateA > 0 && dateB > 0) return dateB - dateA;
      if (dateA > 0 && dateB === 0) return -1;
      if (dateB > 0 && dateA === 0) return 1;
      return 0;
    });

    return sortedProviders.map(provider => ({
      id: provider.id,
      name: provider.name,
      qualifications: provider.qualifications || 'Healthcare Provider',
      specialty: provider.specialty || 'General',
      image: undefined,
      iconUrl: provider.iconUrl ?? null,
      hasData: provider.hasData !== false,
      recordCount: provider.recordCount ?? 0,
    }));
  }, [fastenProviders]);

  // Index where mentioned providers (no clinical data) begin. Used to
  // insert a section header before the first one. -1 if there are none.
  const firstMentionedIdx = React.useMemo(
    () => allProviders.findIndex(p => !p.hasData),
    [allProviders],
  );

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
        {allProviders.map((doc, idx) => (
          <React.Fragment key={doc.id}>
            {idx === firstMentionedIdx && (
              <View
                style={{
                  paddingHorizontal: getScaledFontSize(16),
                  paddingTop: getScaledFontSize(16),
                  paddingBottom: getScaledFontSize(8),
                }}
              >
                <Text
                  style={{
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(600) as any,
                    color: colors.text + '80',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Mentioned in records
                </Text>
                <Text
                  style={{
                    fontSize: getScaledFontSize(12),
                    color: colors.text + '60',
                    marginTop: getScaledFontSize(2),
                  }}
                >
                  Providers without visit history available.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.listItem,
                {
                  borderBottomColor: colors.text + '20',
                  paddingVertical: getScaledFontSize(16),
                  paddingHorizontal: getScaledFontSize(16),
                  opacity: doc.hasData ? 1 : 0.5,
                },
              ]}
              onPress={() => {
                if (!doc.hasData) return;
                const specialty = doc.specialty || '';
                router.push(
                  `/Home/doctor-detail?id=${encodeURIComponent(doc.id)}&name=${encodeURIComponent(doc.name)}&qualifications=${encodeURIComponent(doc.qualifications || '')}&specialty=${encodeURIComponent(specialty)}`,
                );
              }}
              activeOpacity={doc.hasData ? 0.7 : 1}
              disabled={!doc.hasData}
            >
              <EntityIcon
                type="provider"
                specialty={doc.specialty ?? undefined}
                imageUrl={doctorPhotos.get(doc.id) ?? null}
                iconUrl={doc.iconUrl ?? null}
                name={doc.name ?? 'Provider'}
                size={getScaledFontSize(56)}
                style={styles.listAvatar}
              />
              <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16) }]}>
                <Text
                  style={[
                    styles.listItemName,
                    {
                      fontSize: getScaledFontSize(16),
                      fontWeight: getScaledFontWeight(600) as any,
                      color: colors.text,
                      marginBottom: getScaledFontSize(4),
                    },
                  ]}
                >
                  {doc.name}
                </Text>
                <Text
                  style={[
                    styles.listItemRole,
                    {
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(400) as any,
                      color: colors.text + '80',
                    },
                  ]}
                >
                  {doc.hasData
                    ? doc.qualifications
                    : `${doc.qualifications} · no clinical records`}
                </Text>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HomeV2Layout — ADR-0003 Phase 1 (Home Redesign)
//
// Mounted ONLY when EXPO_PUBLIC_HOME_V2_ENABLED === 'true'. Self-contained
// (own hooks, own state) so the flag-off legacy render path in HomeScreen()
// is byte-identical to what shipped. Composition order matches the ADR:
//   HomeResponsiveProvider
//     → GreetingHeader
//     → HeroScoreBlock  (hoisted from components/health-plan/senior)
//     → ScoreCardGrid   (fed by useScoreCatalog rows)
//     → BpsPlanFocusBanner  (hoisted from components/health-plan)
//     → WellbeingMapPreview
//     → [placeholder cards]  ← only when isHomeV2PlaceholdersEnabled()
//     → Circle of Support entry  ← behind HOME_CIRCLE_PROMINENCE knob
//                                   (default 'secondary'; 'hidden' → null;
//                                    'primary' → hoisted above the scores)
//
// Q7 DECIDED (2026-07-30): placeholder copy is "Coming soon" — Ken chose
// the calmer wording over "Not yet available" to signal forward motion.
// ─────────────────────────────────────────────────────────────────────

/**
 * Small "Coming soon" affordance for surfaces that are structurally
 * present in the v2 shell but have no data pipeline yet (Sleep card,
 * Wheel-8D card). Rendered ONLY under isHomeV2PlaceholdersEnabled() so
 * production users never see them. Uses only View/Text/StyleSheet to
 * stay inside the iOS 26.5 primitive envelope the rest of Home v2
 * follows.
 */
function HomeV2PlaceholderCard({
  title,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  title: string;
  colors: typeof Colors['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
}): React.JSX.Element {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${title}. Coming soon.`}
      style={{
        padding: 16,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: (colors.text ?? '#11181C') + '22',
        backgroundColor: (colors.text ?? '#11181C') + '05',
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: getScaledFontSize(15),
          fontWeight: getScaledFontWeight(600) as any,
          color: colors.text,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(400) as any,
          color: (colors.text ?? '#11181C') + '99',
        }}
      >
        Coming soon
      </Text>
    </View>
  );
}

/**
 * Compact Circle of Support entry point for the v2 Home surface.
 * The full circle graph still lives on the legacy render path and on
 * the shipped connect-clinics flow — from v2 we surface a single
 * tappable entry that navigates into the classic circle view via
 * expo-router. Kept intentionally lightweight so 'secondary' really
 * feels secondary (the score cards own the fold).
 */
function CircleOfSupportEntry({
  patientName,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  prominence,
}: {
  patientName: string;
  colors: typeof Colors['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
  prominence: 'primary' | 'secondary';
}): React.JSX.Element {
  const isPrimary = prominence === 'primary';
  const firstName = (patientName ?? '').trim().split(/\s+/)[0] || 'Your';
  const title = firstName === 'Your'
    ? 'Your Circle of Support'
    : `${firstName}'s Circle of Support`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. Tap to open.`}
      onPress={() => {
        try {
          // Navigate to the classic circle view (the legacy Home path
          // still owns the full circle graph). Deep-linking here keeps
          // v2 lean while preserving Circle discoverability.
          router.push('/Home/connect-clinics' as any);
        } catch {
          /* router unavailable in test/harness contexts — silent no-op */
        }
      }}
      style={({ pressed }) => [
        {
          marginTop: isPrimary ? 8 : 16,
          marginBottom: 12,
          marginHorizontal: 16,
          padding: 16,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: (colors.text ?? '#11181C') + '22',
          backgroundColor: isPrimary
            ? (colors.tint ?? '#008080') + '14'
            : (colors.text ?? '#11181C') + '05',
          opacity: pressed ? 0.7 : 1,
          flexDirection: 'row',
          alignItems: 'center',
        },
      ]}
    >
      <MaterialIcons
        name="groups"
        size={20}
        color={colors.tint || '#008080'}
        style={{ marginRight: 10 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: getScaledFontSize(isPrimary ? 16 : 14),
          fontWeight: getScaledFontWeight(isPrimary ? 600 : 500) as any,
          color: colors.text,
        }}
      >
        {title}
      </Text>
      <MaterialIcons
        name="chevron-right"
        size={20}
        color={(colors.text ?? '#11181C') + '99'}
      />
    </Pressable>
  );
}

function HomeV2Layout(): React.JSX.Element {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const catalog = useScoreCatalog();
  const wellbeing = useWellbeingDerivation();
  const [patientName, setPatientName] = useState<string>('');
  const [isLoadingPatient, setIsLoadingPatient] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Patient name — fetched independently of the legacy screen state so
  // this layout is a drop-in replacement, not a subtree of HomeScreen().
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const patient = await fetchPatientInfo();
        if (!cancelled && patient) setPatientName(patient.name || '');
      } catch {
        /* Non-critical — greeting falls back to "Good morning." */
      } finally {
        if (!cancelled) setIsLoadingPatient(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // React-Query caches drive both catalog + wellbeing; a manual
      // refetch would require a queryClient handle. For v1 we let the
      // pull-to-refresh gesture be a visual acknowledgement — the query
      // caches expire on their own staleTime.
      await new Promise((r) => setTimeout(r, 350));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const firstName = React.useMemo(
    () => (patientName ?? '').trim().split(/\s+/)[0] ?? '',
    [patientName],
  );

  // Hero prior-composite mirrors the shipped BiopsychosocialPlanScreen
  // derivation so the caption line reads identically on both surfaces.
  const priorComposite = React.useMemo(() => {
    const c = wellbeing.derivation.composite;
    const t = wellbeing.derivation.trend;
    if (typeof c === 'number' && t) return c - t.delta;
    return undefined;
  }, [wellbeing.derivation.composite, wellbeing.derivation.trend]);

  const onOpenRow = useCallback((row: ScoreRow) => {
    try {
      router.push(row.links.detail as any);
    } catch {
      /* silent no-op in non-router contexts */
    }
  }, []);
  const onExplainRow = useCallback((row: ScoreRow) => {
    try {
      router.push(row.links.map as any);
    } catch {
      /* silent no-op */
    }
  }, []);

  const prominence = getHomeCircleProminence();
  const showPlaceholders = isHomeV2PlaceholdersEnabled();

  return (
    <AppWrapper notificationCount={3}>
      <HomeResponsiveProvider>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          }
        >
          {/* RetakeRequestInboxCard — silent-drops on empty state, so
              mount at top matches the legacy Home discipline. */}
          <RetakeRequestInboxCard />

          <GreetingHeader userFirstName={isLoadingPatient ? '' : firstName} />

          {/* Circle of Support: hoisted to the top only when prominence
              is 'primary'. Default 'secondary' → below the scores. */}
          {prominence === 'primary' ? (
            <CircleOfSupportEntry
              patientName={patientName}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              prominence="primary"
            />
          ) : null}

          <HeroScoreBlock
            userFirstName={isLoadingPatient ? undefined : firstName}
            composite={wellbeing.derivation.composite}
            priorComposite={priorComposite}
            // Per-domain trend arrows: WellbeingDerivation doesn't yet
            // expose per-domain trend; default all three to 'flat' so
            // the dot row always has an arrow. Matches the shipped
            // BiopsychosocialPlanScreen wiring exactly.
            domainTrends={{ bio: 'flat', mind: 'flat', social: 'flat' }}
            onDotsPress={() => {
              try {
                router.push('/Home/wellbeing-map' as any);
              } catch {
                /* silent no-op */
              }
            }}
            colors={colors as unknown as Record<string, string>}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <ScoreCardGrid
              rows={catalog.rows}
              onOpenRow={onOpenRow}
              onExplainRow={onExplainRow}
              emptyStateText={
                catalog.isLoading
                  ? 'Loading your scores…'
                  : 'Complete a check-in to see your scores here.'
              }
            />
          </View>

          <View style={{ paddingHorizontal: 16 }}>
            <BpsPlanFocusBanner
              enabled
              focus={wellbeing.derivation.focus}
              onPress={(target) => {
                try {
                  router.push(`/health-plan/bps?section=${target}` as any);
                } catch {
                  /* silent no-op */
                }
              }}
              colors={colors as unknown as Record<string, string>}
              isDark={!!settings.isDarkTheme}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </View>

          <WellbeingMapPreview />

          {/* Placeholder shelf — QA-only surfaces for Sleep + Wheel-8D.
              Gated hard on the placeholder flag so production users
              never see the "Coming soon" copy. */}
          {showPlaceholders ? (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <HomeV2PlaceholderCard
                title="Sleep"
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
              <HomeV2PlaceholderCard
                title="Wheel-8D"
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            </View>
          ) : null}

          {/* Circle of Support default position — secondary tier, below
              the scores + banner + map. 'hidden' compiles out entirely. */}
          {prominence === 'secondary' ? (
            <CircleOfSupportEntry
              patientName={patientName}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              prominence="secondary"
            />
          ) : null}
        </ScrollView>
      </HomeResponsiveProvider>
    </AppWrapper>
  );
}

export default function HomeScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const userImg = undefined;
  const isTabletDevice = isTablet();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [viewMode, setViewMode] = React.useState<'circle' | 'list' | 'circle-providers'>('circle');

  // SCRUM-638 — Daily Readiness score. Flag-gated dark by default;
  // useReadinessDerivation short-circuits when flag OFF or HealthKit
  // is unavailable, so this is a cheap no-op on the flag-off path.
  const readinessEnabled = useReadinessScoreFlag();
  const readiness = useReadinessDerivation(readinessEnabled);

  // SCRUM-642 — Health Age snapshot. `useHealthAge` short-circuits
  // internally when the flag is OFF (query is disabled), so this is
  // a cheap no-op on the flag-off path. Card visibility gates on
  // `healthAgeEnabled` — the fetched result decides ready vs
  // insufficient-data collapse inside <HealthAgeCard/>.
  const healthAgeEnabled = useHealthAgeFlag();
  const healthAgeQuery = useHealthAge(healthAgeEnabled);

  // SCRUM-644 — Daily Read card. Card is self-gated on the flag AND
  // manages its own React Query fetch via useDailyRead(), so this
  // parent flag read is only needed to elide the wrapper entirely
  // (byte-identical to today when OFF). No compute on the flag-off
  // path; the shared /v1/feature-flags cache is already in memory.
  const dailyReadEnabled = useDailyReadFlag();

  // SCRUM-639 — "Why?" button opens the AI chat with a prefill prompt
  // built from today's driver metrics. Chat route auto-sends the
  // prefill once on mount (see app/Home/health-chat.tsx).
  const onExplainReadiness = useCallback(() => {
    const prompt = buildReadinessExplainPrompt(readiness.score);
    if (!prompt) return;
    router.push({
      pathname: '/Home/health-chat',
      params: { prefill: prompt, context: 'readiness-explain' },
    } as never);
  }, [readiness.score]);

  // Load Fasten Health providers for circle view
  const [, setFastenProviders] = useState<FastenProvider[]>([]);
  const [, setIsLoadingProviders] = useState(false);
  const { selectedProviders, selectedCareManager, addProvider, removeProvider, validateAndCleanProviders, loadFromServer, setSelectedCareManager } = useProviderSelection();
  const [patientName, setPatientName] = useState('');
  const { photoUrl: patientPhotoUrl } = useUserPhoto();
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [cmLogoUrl, setCmLogoUrl] = useState<string | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<FastenAppointment[]>([]);

  // SCRUM-279 (2026-06-03): pull today's window from the unified
  // calendar feed so home shows server-stored events, care-manager-
  // added appointments, health-plan tasks, device events, and
  // reminders — not just FHIR appointments. Narrow window to keep
  // home-screen network cost bounded.
  // Refreshed across midnight and on foreground. Home is a long-lived tab
  // that does NOT remount on resume, so the previous useMemo(..., []) meant a
  // phone left on this screen overnight woke showing yesterday's day window.
  // See hooks/use-local-day.ts.
  const todayWindow = useTodayWindow()
  const calendar = useCalendar({
    windowStart: todayWindow.start,
    windowEnd: todayWindow.end,
    includeReminders: true,
  })
  // Convert today's calendar events into the card-row shape the
  // existing Recommended/Upcoming cards use. Sorted by start time so
  // the next-up event is first. Cap to 3 (matches the deck layout).
  const todayCalendarItems = useMemo(() => {
    const todayKey = `${todayWindow.start.getFullYear()}-${String(todayWindow.start.getMonth() + 1).padStart(2, '0')}-${String(todayWindow.start.getDate()).padStart(2, '0')}`
    return calendar.events
      .filter((e: CalendarEvent) => {
        try {
          const d = new Date(e.startDate)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayKey
        } catch {
          return false
        }
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 3)
  }, [calendar.events, todayWindow])
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [recommendedAppointments, setRecommendedAppointments] = useState<RecommendedAppointment[]>([]);

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

  // ─────────────────────────────────────────────────────────────────
  // SCRUM-652 — legacy Home v2-block injections.
  // `useHomeV2InjectionsEnabled` reads a strict-`=== true` backend
  // flag (`HOME_V2_INJECTIONS_ENABLED`) so this defaults OFF while
  // flags are loading OR the backend hasn't shipped the key yet.
  //
  // We call `useScoreCatalog` unconditionally to obey Rules of Hooks
  // — the flag can flip mid-session (feature-flags refetch on
  // foreground, SCRUM-527), so a conditional hook call would violate
  // hook order. The catalog's underlying query is React-Query cached
  // and cheap; when `injectionsEnabled` is false the returned rows
  // are simply never rendered.
  // ─────────────────────────────────────────────────────────────────
  const injectionsEnabled = useHomeV2InjectionsEnabled();
  const scoreCatalog = useScoreCatalog();
  const scoreRows: ScoreRow[] = scoreCatalog.rows;
  const greetingFirstName = getFirstName(patientName);
  // `nowHour` is now reactive via useCurrentHour() — SCRUM-653 fix.
  // The prior static `new Date().getHours()` capture never updated across
  // hour boundaries while the user lingered on the screen (a common
  // pattern first-thing-in-the-morning), so the greeting would drift.
  // useCurrentHour polls every 60s and only re-renders when the hour
  // actually changes (React bails on identical primitives).
  const nowHour = useCurrentHour();

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
          // Profile photo lives in the global UserPhotoProvider — no
          // per-screen fetch needed. The store already loaded it on
          // app start and keeps it in sync after uploads.
        }
      } catch {
        // Patient data failed to load
      } finally {
        setIsLoadingPatient(false);
      }
    };

    const loadTaskCount = async () => {
      try {
        const count = await fetchPendingTaskCount();
        setPendingTaskCount(count);
      } catch {
        // Non-critical — badge just won't show
      }
    };

    const loadRecommended = async () => {
      try {
        const items = await fetchRecommendedAppointments({ status: 'pending' });
        // Filter to "next 30 days" for the home-screen preview. Anything
        // further out stays in the full Recommended tab but clutters the
        // home summary.
        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const upcoming = items
          .filter((r) => {
            const t = new Date(r.recommendedByDate).getTime();
            return Number.isFinite(t) && t >= now && t <= now + THIRTY_DAYS_MS;
          })
          .sort(
            (a, b) =>
              new Date(a.recommendedByDate).getTime() -
              new Date(b.recommendedByDate).getTime(),
          );
        setRecommendedAppointments(upcoming);
      } catch {
        // Non-critical — the section just won't render
      }
    };

    loadProviders();
    loadPatient();
    loadTaskCount();
    loadRecommended();
    // Restore persisted provider selection and care manager from the server
    loadFromServer();
  }, [validateAndCleanProviders, loadFromServer]);

  // Fetch care manager agency logo when CM is selected
  useEffect(() => {
    if (!selectedCareManager?.id) {
      setCmLogoUrl(null);
      return;
    }
    // If logoUrl is already a data URI or URL, use it directly
    if (selectedCareManager.logoUrl) {
      setCmLogoUrl(selectedCareManager.logoUrl);
      return;
    }
    // Otherwise fetch from API
    (async () => {
      try {
        const { getCareManagerAgencyById } = await import('@/services/care-manager-agencies');
        const agency = await getCareManagerAgencyById(selectedCareManager.id);
        if (agency?.logoUrl) {
          setCmLogoUrl(agency.logoUrl);
        }
      } catch {
        // Logo fetch failed — use default icon
      }
    })();
  }, [selectedCareManager?.id, selectedCareManager?.logoUrl]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [providers, patient, allAppointments, taskCount, recItems] = await Promise.all([
        fetchProviders(),
        fetchPatientInfo(),
        fetchAppointments(),
        fetchPendingTaskCount(),
        fetchRecommendedAppointments({ status: 'pending' }),
      ]);
      setFastenProviders(providers);
      setPendingTaskCount(taskCount);
      const nowMs = Date.now();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const upcomingRecs = (recItems ?? [])
        .filter((r) => {
          const t = new Date(r.recommendedByDate).getTime();
          return Number.isFinite(t) && t >= nowMs && t <= nowMs + THIRTY_DAYS_MS;
        })
        .sort(
          (a, b) =>
            new Date(a.recommendedByDate).getTime() -
            new Date(b.recommendedByDate).getTime(),
        );
      setRecommendedAppointments(upcomingRecs);
      if (patient) {
        setPatientName(patient.name || '');
      }
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
              if (meridiem === 'PM' && hour !== 12) hour += 12;
              else if (meridiem === 'AM' && hour === 12) hour = 0;
              dateObj.setHours(hour, minute, 0, 0);
            }
          }
          return { apt, dateObj };
        })
        .filter(({ dateObj }) => dateObj >= start && dateObj <= end)
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
        .map(({ apt }) => apt);
      setUpcomingAppointments(upcoming);
      await validateAndCleanProviders();
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, [validateAndCleanProviders]);

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
  }, [showProviderDetails, screenWidth, detailsListOpacity, detailsListSlide, mainListOpacity, mainListSlide]);

  // ─────────────────────────────────────────────────────────────────
  // ADR-0003 Phase 1 — v2 Home redesign kill-switch. When the master
  // flag is ON, return the redesigned surface and skip every legacy
  // render primitive below. When OFF (the default), this branch is a
  // single boolean compare and the legacy render path executes
  // BIT-IDENTICALLY to the pre-ADR-0003 shipped code.
  //
  // The v2 layout is self-contained (owns its own patient / wellbeing
  // / catalog state) so no legacy hook state is inspected from inside
  // HomeV2Layout — safe rollback via env, no ordering coupling.
  // ─────────────────────────────────────────────────────────────────
  if (isHomeV2Enabled()) return <HomeV2Layout />;

  return (
    <AppWrapper notificationCount={3}>
      {(isLoadingPatient || isLoadingAppointments) ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), marginTop: 12 }}>Loading your health data...</Text>
        </View>
      ) : null}
      {!(isLoadingPatient || isLoadingAppointments) && <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/*
         * COS-482 Phase 1 — retake-request inbox card, above the title so a
         * pending CM-issued retake ask is the first thing the patient sees
         * on Home. Silent-drops when there is nothing pending (component
         * returns null), so no layout shift on the empty state.
         */}
        <RetakeRequestInboxCard />
        {/* 2026-08-05 — Compact 3-tile row: Readiness · Health Age · Daily Read.
            Replaces the three stacked full-width cards that previously
            lived here (SCRUM-638 ReadinessScoreCard + SCRUM-642
            HealthAgeCard + SCRUM-644 DailyReadCard). Each tile inside
            HeroInsightsRow self-fetches, self-flags-gates, and taps
            through to the same detail screens as before. Empty states
            render as a "—" placeholder + short hint so the row stays a
            fixed slot instead of collapsing/reflowing on data changes. */}
        {/* Ken 2026-08-14: "only 2 scores, wellbeing score and health age, and
            in home screen we should have these at top". HeroInsightsRow now
            renders exactly those two. */}
        <HeroInsightsRow />
        {/* Vishal 2026-08-14: "daily reads and wellbeing map not required on
            home screen." So Daily Read is off Home entirely — I had kept it
            here on the reading that Ken meant remove other SCORES; that guess
            is now overruled.

            NOTE: this was the last live link to /Home/daily-read. The screen
            still exists and still works, but nothing on Home routes to it now.
            If it should stay reachable it needs an entry point elsewhere. */}
        {/*
         * SCRUM-653 title row — one of two variants selected by
         * HOME_V2_INJECTIONS_ENABLED:
         *   ON  → GreetingHeader ("Good morning, Kenneth") with the
         *         view-mode toggle inline on the right, matching the
         *         classic layout's toggle position.
         *   OFF → Classic "{First}'s Circle of Support" title with the
         *         same inline toggle — byte-identical to the legacy
         *         layout so the flag-off path is a no-op regression.
         */}
        <View style={[styles.titleRow, { paddingHorizontal: 16, paddingTop: 8 }]}>
          {injectionsEnabled ? (
            <View style={{ flex: 1 }}>
              <GreetingHeader userFirstName={greetingFirstName} nowHour={nowHour} />
            </View>
          ) : (
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[
                styles.sectionTitle,
                {
                  fontSize: getScaledFontSize(24),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                  flex: 1,
                }
              ]}>
              {isLoadingPatient ? 'Loading…' : `${getFirstName(patientName)}'s Circle of Support`}
            </Text>
          )}
          <TouchableOpacity
            onPress={toggleViewMode}
            style={[
              styles.toggleButton,
              {
                backgroundColor: colors.text + '10',
                // SCRUM-265 #20: chrome controls don't scale with accessibility
                // mode the way body text does — the toggle was ballooning past
                // 50px and crowding the title on max accessibility. Hold these
                // at the design values; the icon stays readable at 20pt.
                padding: 8,
                borderRadius: 8,
                marginLeft: 8,
              }
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Toggle view"
          >
            <IconSymbol
              name={getToggleIcon()}
              size={20}
              color={colors.tint || '#008080'}
            />
          </TouchableOpacity>
        </View>

        {/*
         * SCRUM-653 quick actions row — one of two variants:
         *   ON  → HomeQuickActionPills (3 sleek transparent chips for
         *         PCP / Pharmacy / Urgent Care, preserving the shipped
         *         dial + open-app behaviour).
         *   OFF → classic filled-card QuickActionButtons (byte-identical
         *         legacy path). The wrapping View intentionally omits
         *         paddingHorizontal on the ON branch — the pills row
         *         supplies its own marginHorizontal:16 internally.
         */}
        {injectionsEnabled ? (
          <HomeQuickActionPills />
        ) : (
          <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 6 }}>
            <QuickActionButtons />
          </View>
        )}

        {/* SCRUM-279 (build 45): iPad-only — kill all extra vertical
            padding around the circle. Ken still saw space on build 44.
            paddingTop 4 → 0, marginBottom 8 → 0. iPhone is already
            perfect so the override only applies on tablets. */}
        <View style={[
          styles.circleSection,
          isTabletDevice && { paddingTop: 0, marginBottom: 0 },
          // SCRUM-653 fix (2026-07-31): user reported orbiting-provider
          // bubbles touching the pills row above + wellbeing row below
          // on the new-design path. The base circleSection styles were
          // tuned for the legacy layout where those neighbors don't exist
          // (or are further away). Add breathing room on BOTH ends only
          // when injections are on — the legacy layout stays byte-
          // identical. Applied on both phone and tablet because the
          // absolute-positioned orbit avatars spill either way.
          injectionsEnabled && { paddingTop: 40, marginTop: 12, marginBottom: 40 },
        ]}>
          {viewMode === 'circle' ? (
            isTabletDevice ? (
              <TabletCircleView
                providers={circleProviders}
                userImg={userImg}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                patientName={patientName}
                patientPhotoUrl={patientPhotoUrl}
                cmLogoUrl={cmLogoUrl}
                onAddProviderPress={() => router.push('/modal')}
                isCircleComplete={isCircleComplete}
                selectedCareManager={selectedCareManager}
                onCareManagerPress={() => router.push('/modal')}
                pendingTaskCount={pendingTaskCount}
              />
            ) : (
              <PhoneCircleView
                providers={circleProviders}
                userImg={userImg}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                patientName={patientName}
                patientPhotoUrl={patientPhotoUrl}
                cmLogoUrl={cmLogoUrl}
                onAddProviderPress={() => router.push('/modal')}
                isCircleComplete={isCircleComplete}
                selectedCareManager={selectedCareManager}
                onCareManagerPress={() => router.push('/modal')}
                pendingTaskCount={pendingTaskCount}
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
                  patientPhotoUrl={patientPhotoUrl}
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
              patientPhotoUrl={patientPhotoUrl}
              hasUpcomingAppointments={upcomingAppointments.length > 0}
              isCircleComplete={isCircleComplete}
            />
          )}
        </View>

        {/* QuickActionButtons used to live here, below the Circle. Moved
            above the Circle to mirror the web Patient Home layout (SCRUM-233). */}

        {/*
         * SCRUM-653 Wellbeing Row — two equal tiles side-by-side, sitting
         * between the Circle of Support and Today's Appointments.
         *   Left  : WellbeingScoreTile (composite score + band chip)
         *   Right : WellbeingMapPreview (3-circle Venn + "Explore all 8 areas")
         * Both tiles handle their own empty/loading states so the row is
         * stable across data availability. Only rendered when
         * HOME_V2_INJECTIONS_ENABLED is ON — flag-off path is bytes-free.
         *
         * The prior SCRUM-652 injection (ScoreCardGrid wrapped in
         * HomeResponsiveProvider) is replaced by this compact 2-tile
         * layout per the user's redesign spec — the 4-card grid was
         * dominating the surface.
         */}
        {injectionsEnabled && (
          // Vishal 2026-08-05 — both tiles now own their outer chrome
          // (same white background + border + 16pt radius + 148pt min
          // height) so titles / main content / footer text align across
          // the row. Home only supplies the flex gap. Do NOT re-wrap
          // either tile in a padded View here — that reintroduces the
          // asymmetric geometry.
          // Vishal 2026-08-14: "daily reads and wellbeing map not required on
          // home screen." The whole row is gone — WellbeingScoreTile had
          // already moved to the two-scores row at the top (SCRUM-676), and
          // the map preview is now off Home too.
          //
          // NOTE: WellbeingMapPreview was the last live link to
          // /Home/wellbeing-map. That screen still exists and still works, but
          // nothing on Home routes to it now.
          null
        )}
        {/*
         * ScoreCardGrid stays imported (backward-compat with the dead
         * HOME_V2_ENABLED path in HomeV2Layout above) but no longer
         * injects into the legacy tree. Ref for the linter:
         *   scoreRows length = {scoreRows.length}, catalog rows shape unchanged.
         * If HomeV2Layout is later deleted we can drop the imports.
         */}
        {false && scoreRows.length > 0 && (
          <HomeResponsiveProvider>
            <ScoreCardGrid rows={scoreRows} />
          </HomeResponsiveProvider>
        )}

        {/* SCRUM-279 (2026-06-03): Today's Appointments — pulls from
            the UNIFIED calendar feed (FHIR + user-created + care-
            manager + device + reminders).
            SCRUM-279 (2026-06-08 build 34): ALWAYS render, never
            conditional. Ken reported iPad showing nothing — was the
            length > 0 gate hiding the whole section when his iPad
            had no events for today. Empty state now surfaces an
            explicit "No appointments today" CTA. */}
        <View style={styles.appointmentsSection}>
            <Text style={[
              styles.sectionTitle,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
                color: colors.text,
              }
            ]}>Today's Appointments</Text>
            {todayCalendarItems.length === 0 ? (
              // SCRUM-279 (2026-06-08 build 34): empty state replaces
              // the silent-hide so the user always sees the card.
              <TouchableOpacity
                onPress={() => router.push('/Home/appointments' as never)}
                style={{
                  backgroundColor: (colors.cardBackground as string) ?? 'transparent',
                  borderRadius: 12,
                  padding: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 64,
                }}
              >
                <Text style={{
                  color: colors.subtext as string,
                  fontSize: getScaledFontSize(14),
                  textAlign: 'center',
                }}>
                  No appointments today · tap to open calendar
                </Text>
              </TouchableOpacity>
            ) : (
            <TouchableOpacity
              onPress={() => router.push('/Home/appointments' as never)}
              style={[
                styles.deckContainer,
                {
                  // +16 accounts for the third card's top:16 offset
                  // so the outer container fully contains the deck.
                  minHeight: Math.max(
                    96,
                    16 + getScaledFontSize(16) + getScaledFontSize(2) + getScaledFontSize(14) + (getScaledFontSize(8) * 2) + getScaledFontSize(4)
                  ),
                }
              ]}
            >
              {todayCalendarItems.map((event: CalendarEvent, index: number) => {
                const startDate = new Date(event.startDate)
                const timeLabel = event.allDay
                  ? 'All-day'
                  : startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                const title = event.title || 'Untitled event'
                // Source-based icon: distinguishes health-plan task /
                // care-team / reminder / personal at a glance.
                const iconName =
                  event.origin === 'reminder' ? 'bell-ring' :
                  event.appKind === 'task' ? 'clipboard-check' :
                  event.appKind === 'past-visit' || event.appKind === 'appointment' ? 'stethoscope' :
                  'calendar-today'
                const cardStyle = [styles.firstCard, styles.secondCard, styles.thirdCard][index] || styles.firstCard
                const subtitle = event.location
                  ? `${timeLabel} · ${event.location}`
                  : event.source.title
                    ? `${timeLabel} · ${event.source.title}`
                    : timeLabel

                return (
                  <Card
                    key={event.id}
                    style={[
                      styles.appointmentCard,
                      cardStyle,
                      {
                        minHeight: Math.max(
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
                        <List.Icon icon={iconName} />
                      </View>
                      <View style={[
                        styles.listItemContent,
                        { marginLeft: getScaledFontSize(16), flexShrink: 1 }
                      ]}>
                        <Text style={[
                          styles.appointmentTitle,
                          {
                            fontSize: getScaledFontSize(16),
                            fontWeight: settings.isBoldTextEnabled ? '700' : '500',
                            marginBottom: getScaledFontSize(2),
                          }
                        ]}
                        numberOfLines={1}
                        >{title}</Text>
                        <Text style={[
                          styles.appointmentDescription,
                          {
                            fontSize: getScaledFontSize(14),
                            fontWeight: settings.isBoldTextEnabled ? '600' : '400'
                          }
                        ]}
                        numberOfLines={1}
                        >{subtitle}</Text>
                      </View>
                    </View>
                  </Card>
                )
              })}
            </TouchableOpacity>
            )}
          </View>

        {/* SCRUM-265 #9: Health Trends tile redesigned — taller hero with
            an accent gradient overlay, four illustrative metric icons,
            and a prominent CTA. The plain banner felt forgettable next
            to the rest of the home cards; the new layout treats trends
            as a feature surface, not a row link. */}
        <TouchableOpacity
          style={[
            styles.trendsHeroCard,
            !isTabletDevice && styles.trendsHeroCardPhone,
            { backgroundColor: colors.tint as string },
          ]}
          onPress={() => router.push('/Home/health-trends' as never)}
          accessibilityRole="button"
          accessibilityLabel="View health trends"
          activeOpacity={0.92}
        >
          <View style={styles.trendsHeroBlob} pointerEvents="none" />
          <View style={styles.trendsHeroHeader}>
            <View style={[
              styles.trendsHeroBadge,
              !isTabletDevice && { width: 32, height: 32, borderRadius: 10 },
            ]}>
              <MaterialIcons
                name="show-chart"
                size={isTabletDevice ? getScaledFontSize(20) : 16}
                color={colors.tint as string}
              />
            </View>
            <View style={{ flex: 1, marginLeft: isTabletDevice ? 12 : 10 }}>
              <Text
                style={[
                  styles.trendsHeroTitle,
                  {
                    fontSize: isTabletDevice ? getScaledFontSize(17) : 14,
                    fontWeight: getScaledFontWeight(800) as any,
                  },
                ]}
                allowFontScaling={isTabletDevice}
              >
                Health Trends
              </Text>
              <Text
                style={[
                  styles.trendsHeroSubtitle,
                  { fontSize: isTabletDevice ? getScaledFontSize(12) : 10 },
                ]}
                allowFontScaling={isTabletDevice}
                numberOfLines={1}
              >
                Labs + vitals + Apple Health over time
              </Text>
            </View>
            <View style={styles.trendsHeroArrow}>
              <MaterialIcons
                name="arrow-forward"
                size={isTabletDevice ? getScaledFontSize(18) : 14}
                color="#FFFFFF"
              />
            </View>
          </View>
          {/* SCRUM-279 (2026-06-08): Chips row dropped on phone — too
              busy + redundant with the page itself. iPad keeps them. */}
          {isTabletDevice && (
            <View style={styles.trendsHeroIconRow}>
              {(['favorite', 'bloodtype', 'directions-walk', 'bedtime'] as const).map((iconName) => (
                <View key={iconName} style={styles.trendsHeroChip}>
                  <MaterialIcons name={iconName} size={getScaledFontSize(15)} color="#FFFFFF" />
                </View>
              ))}
              <Text style={[styles.trendsHeroChipsTrailing, { fontSize: getScaledFontSize(12) }]}>
                + 14 more
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/*
         * SCRUM-653: standalone WellbeingMapPreview injection removed —
         * moved into the 2-tile Wellbeing Row above the appointments
         * section. Nothing renders here on the new design path.
         */}

        {/*
         * SCRUM-653: Upcoming Appointments hidden when new design is on
         * (user's redesign spec ended at "6. then health trends"). Legacy
         * path unaffected.
         */}
        {!injectionsEnabled && upcomingAppointments.length > 0 && (
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
                  minHeight: Math.max(
                    96,
                    16 + getScaledFontSize(16) + getScaledFontSize(2) + getScaledFontSize(14) + (getScaledFontSize(8) * 2) + getScaledFontSize(4)
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
                        minHeight: Math.max(
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

        {/* SCRUM-279 (2026-06-03): Recommended Appointments section
            removed at Ken's request. Today's Appointments now sits
            before Health Trends instead. The data still loads in the
            background (could surface in another screen later) but the
            home card is gone. */}
        {false && recommendedAppointments.length > 0 && (
          <View style={styles.appointmentsSection}>
            <Text
              style={[
                styles.sectionTitle,
                {
                  fontSize: getScaledFontSize(18),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                },
              ]}
            >
              Recommended Appointments
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/Home/appointments?tab=recommended' as never)}
              style={[
                styles.deckContainer,
                {
                  minHeight: Math.max(
                    56,
                    getScaledFontSize(16) +
                      getScaledFontSize(2) +
                      getScaledFontSize(14) +
                      getScaledFontSize(8) * 2 +
                      getScaledFontSize(4),
                  ),
                },
              ]}
            >
              {recommendedAppointments.slice(0, 3).map((rec, index) => {
                const byDate = new Date(rec.recommendedByDate);
                const dateLabel = Number.isFinite(byDate.getTime())
                  ? byDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : '';
                const urgencyLabel =
                  rec.urgency === 'urgent'
                    ? '🔴 Urgent'
                    : rec.urgency === 'soon'
                      ? '🟡 Soon'
                      : '⚪ Routine';
                const subtitle = dateLabel
                  ? `${urgencyLabel} · By ${dateLabel}`
                  : urgencyLabel;
                const iconNames = ['calendar-plus', 'clipboard-pulse', 'medical-bag'];
                const cardStyle =
                  [styles.firstCard, styles.secondCard, styles.thirdCard][index] ??
                  styles.firstCard;

                return (
                  <Card
                    key={rec.id}
                    style={[
                      styles.appointmentCard,
                      cardStyle,
                      {
                        minHeight: Math.max(
                          56,
                          getScaledFontSize(16) +
                            getScaledFontSize(2) +
                            getScaledFontSize(14) +
                            getScaledFontSize(8) * 2 +
                            getScaledFontSize(4),
                        ),
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.listItemContainer,
                        {
                          paddingHorizontal: getScaledFontSize(16),
                          paddingVertical: getScaledFontSize(8),
                          minHeight: Math.max(
                            56,
                            getScaledFontSize(16) +
                              getScaledFontSize(2) +
                              getScaledFontSize(14) +
                              getScaledFontSize(8) * 2 +
                              getScaledFontSize(4),
                          ),
                        },
                      ]}
                    >
                      <View style={{ transform: [{ scale: getScaledFontSize(24) / 24 }] }}>
                        <List.Icon icon={iconNames[index] ?? 'calendar-plus'} color="#008080" />
                      </View>
                      <View
                        style={[
                          styles.listItemContent,
                          { marginLeft: getScaledFontSize(16), flexShrink: 1 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.appointmentTitle,
                            {
                              fontSize: getScaledFontSize(16),
                              fontWeight: settings.isBoldTextEnabled ? '700' : '500',
                              marginBottom: getScaledFontSize(2),
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {rec.title}
                        </Text>
                        <Text
                          style={[
                            styles.appointmentDescription,
                            {
                              fontSize: getScaledFontSize(14),
                              fontWeight: settings.isBoldTextEnabled ? '600' : '400',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>}
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  // SCRUM-265 #9: refreshed Health Trends hero tile.
  trendsHeroCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  // SCRUM-279 (2026-06-08): phone gets a more compact hero — Ken
  // said the iPad-tuned card was too tall on iPhone. Build 34: also
  // tightened marginTop 8 → 0 since the appointmentsSection's
  // paddingBottom was already reduced for the gap-50% ask.
  trendsHeroCardPhone: {
    marginTop: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  trendsHeroBlob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -60,
    right: -60,
  },
  trendsHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendsHeroBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendsHeroTitle: { color: '#FFFFFF', letterSpacing: 0.2 },
  trendsHeroSubtitle: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  trendsHeroArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendsHeroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  trendsHeroChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  trendsHeroChipsTrailing: {
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 6,
    fontWeight: '600',
  },
  trendsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FAFA',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 16,
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
  scrollContent: {
    paddingBottom: 20,
  },
  circleSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    // SCRUM-279 (2026-06-08): Ken asked to reduce the gap between
    // circle and Today's Appointments. Was 64, dropped to 24.
    // Orbiting avatars are absolute-positioned and still spill below
    // circleSection — 24 leaves enough clearance without the prior
    // dead air.
    marginBottom: 24,
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
    minHeight: 80,
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
    // SCRUM-279 (2026-06-08 build 34): still too big per Ken. The
    // wrapper Button style had minHeight 44 + paddingHorizontal 20
    // overriding my inline contentStyle. Both squashed now:
    // minHeight 44 → 22, paddingHorizontal 20 → 8.
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
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
    // Vishal 2026-08-05: was 24 — pulled to 16 so the section's
    // banner + deck align to the same horizontal edge as the Health
    // Trends banner (marginHorizontal: 16) and the HeroInsightsRow.
    paddingHorizontal: 16,
    // SCRUM-279 (2026-06-08): Ken asked to reduce the gap between
    // Today's Appointments and Health Trends by 50%. Dropped
    // paddingBottom 20 → 8 + paddingTop 16 → 10.
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
  },
  deckContainer: {
    position: 'relative',
    // SCRUM-279 (2026-06-08): bumped from 56 → 96 so the third card
    // (which has top: 16 + its own ~80pt height) doesn't bleed into
    // the next section. Ken's "today appts overlap health trends"
    // bug. The inline minHeight overrides on the outer deck wrappers
    // also apply Math.max with this baseline so dynamic-text
    // accessibility still grows the container correctly.
    minHeight: 96,
  },
  appointmentCard: {
    borderRadius: 16,
    position: 'absolute',
    width: '100%',
    minHeight: 56,
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
    // backgroundColor removed - EntityIcon handles its own fill
  },
  centerAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
    minHeight: 56,
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
