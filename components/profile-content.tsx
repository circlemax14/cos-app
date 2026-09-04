import { Colors } from '@/constants/theme';
import { fetchPatientInfo } from '@/services/api/patient';
import { signOut } from '@/services/auth';
import { queryClient } from '@/providers/QueryProvider';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useCanRender, useHasExplicitGrant } from '@/hooks/use-entitlement';
import { usePlanShelfFlag } from '@/hooks/use-plan-shelf-flag';
import { useHabitJournalFlag } from '@/hooks/use-habit-journal-flag';
import { useHabitsInPlanFlag } from '@/hooks/use-plan-habits';
import { useUserPhoto } from '@/stores/user-photo-store';
import { EntityIcon } from '@/components/icons';
import { apiClient } from '@/lib/api-client';
import {
  getCachedUserSummary,
  setCachedUserSummary,
} from '@/lib/cached-user-summary';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
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
  /**
   * COS-885 — called immediately BEFORE this list navigates anywhere.
   *
   * The drawer in app-wrapper.tsx is `{isDrawerMenuVisible && <View>...}`
   * inside the SCREEN that opened it. Every row below used to call
   * router.push() on its own, so that flag stayed true: react-native-screens
   * detached the departing screen (drawer looked closed), and re-attached it
   * still open when the patient came back. Vishal, on Help & Support: "when I
   * click on the home, the left drawer navigation is visible. It should not be
   * visible to me."
   *
   * AppWrapper's OWN row callbacks — onServicesPress, onAllergiesPress and the
   * rest — already close first. This is the same contract for the rows that
   * navigate from inside this file.
   */
  onNavigate?: () => void;
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
  onNavigate,
  showEhrTitle = true,
  containerStyle,
}: ProfileContentProps) {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  /**
   * COS-885 — the one place this file navigates from.
   *
   * Thirteen rows called router.push() directly, so "close the drawer first"
   * had to be remembered thirteen times and was remembered zero times. One
   * helper is the whole fix: a row added later cannot forget.
   *
   * Sign-out is deliberately NOT routed through here — router.replace() to
   * /(auth) unmounts the tab navigator and the drawer's state with it.
   */
  const go = (path: string): void => {
    onNavigate?.();
    router.push(path as never);
  };

  // Hide the "Connect Another EHR" card for users with CONNECT_CLINIC
  // disabled by an admin (e.g. the App Store reviewer). Fail closed —
  // if permissions haven't loaded yet, treat as disabled so the button
  // never flashes to a restricted user.
  const { data: permissions } = useFeaturePermissions();
  // COS-735 — About moved onto the entitlements catalog so it is manageable
  // from a plan or feature group. Explicit-grant-only: see the note at the row.
  const canSeeAbout = useHasExplicitGrant('about.view');
  const canConnectClinic = permissions?.permissions?.CONNECT_CLINIC?.enabled === true;

  // Fine-grained entitlement gates. Hooks are unconditional and live here at
  // the top of the component; each one gates exactly one control below with a
  // plain `{cond && <X />}` — no wrappers, this file mounts on the drawer's
  // cold path (iOS 26 crash history).
  const canEditPersonalInfo = useCanRender('profile.edit-personal-info');
  const canSignOut = useCanRender('profile.sign-out');
  const canDeleteAccount = useCanRender('profile.delete-account');

  // SCRUM-640: dark-launched habit-journal entry. Default OFF; visible
  // only when backend flag `habit_journal_enabled` (or the per-user
  // beta override) resolves to true.
  const habitJournalEnabled = useHabitJournalFlag();
  // COS-784 — the plan shelf entry. Default OFF while the flag query loads, so
  // a pricing row never flashes in on cold start during a dark launch.
  const planShelfEnabled = usePlanShelfFlag();
  const habitsInPlanFlagEnabled = useHabitsInPlanFlag();

  const [patientName, setPatientName] = useState('User');
  const [patientEmail, setPatientEmail] = useState('');
  const { photoUrl: patientPhotoUrl } = useUserPhoto();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  // Ken 2026-08-07 (#20) — sign-out gave zero feedback: the alert
  // dismissed and the screen sat there until the redirect landed,
  // which reads as "nothing happened". Track the in-flight state so
  // the button can show a spinner + "Signing out…" AND so a second
  // tap can't fire a duplicate signOut() while the first is running.
  // Shared with the delete-account flow (which is slower — it makes a
  // network call first — and had the exact same dead-air problem).
  const [authBusy, setAuthBusy] = useState<null | 'signout' | 'delete'>(null);

  useEffect(() => {
    // SCRUM-265 #16: hydrate from the local cache on first paint so the
    // drawer renders the user's name + email + photo instantly. The API
    // round-trip still runs in the background and refreshes both the UI
    // and the cache when fresh data lands.
    let cancelled = false;
    void (async () => {
      const cached = await getCachedUserSummary();
      if (cached && !cancelled) {
        setPatientName(cached.name || 'User');
        setPatientEmail(cached.email || '');
        setIsLoadingProfile(false);
      }

      try {
        const patient = await fetchPatientInfo();
        if (cancelled || !patient) return;
        const freshName = patient.name || 'User';
        let freshEmail = patient.email || '';

        // Fallback: if email is empty, try getting from auth /me endpoint
        if (!freshEmail) {
          try {
            const meResponse = await apiClient.get('/v1/auth/me');
            const meData = meResponse.data?.data;
            if (meData?.email) freshEmail = meData.email;
          } catch {
            // ignore — email fallback is best-effort
          }
        }

        setPatientName(freshName);
        setPatientEmail(freshEmail);
        await setCachedUserSummary({
          name: freshName,
          email: freshEmail,
          photoUrl: patientPhotoUrl ?? cached?.photoUrl,
        });
      } catch {
        // Network failure — keep whatever (cached or default) values are showing.
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // patientPhotoUrl is intentionally omitted from deps — we don't want a
    // photo store update to re-trigger a full profile refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <EntityIcon
                type="patient"
                imageUrl={patientPhotoUrl ?? null}
                name={patientName ?? 'Patient'}
                size={64}
              />
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
            {canEditPersonalInfo && (
              <DrawerRow
                iconName="person"
                label="Personal Information"
                onPress={() => go('/Home/personal-info')}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
            {/* Ken 2026-08-07 (#15) — "Medications" drawer row REMOVED.
                The Plan surface now carries a full-width MedicationsBanner
                (green, with today's dose preview) as the canonical entry
                point, so a second path buried in the hamburger was
                redundant and made the drawer longer to scan. The
                /Home/medications route itself is unchanged and still
                deep-linkable — only this menu row is gone. */}
            <DrawerRow
              iconName="emoji-events"
              label="Badges"
              onPress={() => go('/Home/badges')}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <DrawerRow
              iconName="notifications-active"
              label="Reminders"
              onPress={() => go('/Home/reminder-settings')}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            {/*
              SCRUM-659 Story 5 revised (Vishal 2026-08-05): when
              habits_in_plan_enabled is ON, hide this drawer row
              entirely. The Plan-screen HabitsBanner is the ONLY
              entry point; the drawer entry is redundant. When
              habits_in_plan_enabled is OFF but the legacy
              habit_journal_enabled is still ON, keep the old
              "Daily habits" shortcut into /Home/habit-journal so
              nothing regresses for accounts on the legacy path.
              Both flags OFF → row is not mounted.
            */}
            {!habitsInPlanFlagEnabled && habitJournalEnabled && (
              <DrawerRow
                iconName="check-circle-outline"
                label="Daily habits"
                onPress={() => go('/Home/habit-journal')}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
            {/*
              Apple Health (COS-389 / SCRUM-530): deliberate, easy-to-find
              opt-in control. The HealthKit permission prompt used to fire
              accidentally on mount of the Personal Information screen; it now
              lives behind this row → app/Home/apple-health.tsx. iOS only —
              HealthKit doesn't exist on Android.
            */}
            {Platform.OS === 'ios' && (
              <DrawerRow
                iconName="favorite-border"
                label="Apple Health"
                onPress={() => go('/Home/apple-health')}
                divider
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
            {/*
              Assessment entry points live on the Plan tab now:
              - PlanTypeChooser routes new Advanced/Agency users into the intake
              - A banner on the Plan tab surfaces a Resume CTA if the user
                hasn't completed the intake yet
              Keeping the assessment-intake screen reachable for retake via
              the banner; no drawer entry needed.
            */}
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
              onPress={() => go('/Home/personal-info')}
            />
          </Card>

          {/* SCRUM-319 — Services menu entry hidden for Apple Review
              build 55. The Services screen shows fake-unlocked "active"
              status for every premium feature with no real IAP wiring
              — Guideline 2.1 ("placeholder content"). Re-enable when
              the subscription / IAP flow ships. */}

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
              onPress={() => go('/Home/proxy-management')}
            />
          </Card>

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
              onPress={() => go('/Home/linked-accounts')}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            <DrawerRow
              iconName="shield"
              label="Security"
              onPress={() => go('/Home/security-settings')}
              divider
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            {/*
              COS-740 — the subscription screen had exactly one entry point
              (the plan-type chooser), which is itself only reachable from a
              card that renders after a health plan exists. A patient who has
              not generated one could not reach their own plan at all.

              UNGATED, unlike About above: this is a patient's own plan and
              price. Hiding it behind an entitlement would mean the people most
              likely to want an upgrade are the ones who cannot find the page.

              Labelled "Billing" rather than "Your plan" (COS-742). "Plan"
              already means two other things in this app — the daily health
              plan on the Plan tab, and the assessment intensity on the
              plan-type chooser — so a third sense of the word sent people to
              the wrong screen looking for their tasks.

              Not the SCRUM-319 problem. That entry was pulled for Apple
              Guideline 2.1 because it showed fake "active" status for premium
              features with no IAP wiring. This screen shows the real plans
              with real prices, marks the one the patient actually has, and
              offers no purchase — the upgrade action stays behind
              SUBSCRIPTION_UPGRADE_ENABLED until payments genuinely work.
            */}
            <DrawerRow
              iconName="card-membership"
              label="Billing"
              onPress={() => go('/Home/billing')}
              divider={planShelfEnabled}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
            {/* COS-784 — flag-gated. A plain `{cond && <X />}` rather than a
                ternary or a wrapper: this file renders on the drawer's cold
                mount, which is the path with the iOS 26 crash history. */}
            {planShelfEnabled && (
              <DrawerRow
                iconName="card-membership"
                label="Your plan"
                onPress={() => go('/Home/plans')}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            )}
          </View>

          <View style={{ marginTop: 14 }}>
            <SectionLabel label="More" colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DrawerRow
                iconName="help-outline"
                label="Help & Support"
                onPress={() => go('/Home/support')}
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
              {/*
                About screen is gated on the entitlement about.view.
                It exposes internal build / runtime / OTA details useful for
                support but not for general patients.

                COS-735 — moved from the legacy cos-feature-permissions table
                (ABOUT_SCREEN) onto the entitlements catalog, so it can be
                managed from a plan or a feature group like everything else.
                `about` was also flipped to isPublic:false; public keys
                short-circuit to granted in the resolver before any plan lookup,
                which made it impossible to manage.

                NOTE THE HOOK. This uses useHasExplicitGrant, NOT useCanRender.
                useCanRender is fail-open and treats the WILDCARD as a grant —
                and the wildcard is exactly what the resolver returns for every
                patient wherever plan_tier_enabled is unset (today: staging and
                production). Gating this with useCanRender would put build and
                OTA details in front of every patient the moment it shipped.
                Nothing but a live, populated array naming the key will do.
              */}
              {canSeeAbout && (
                <DrawerRow
                  iconName="info-outline"
                  label="About"
                  onPress={() => go('/Home/about')}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              )}
            </View>
          </View>
        </View>
      )}

      {showSignOut && (
        <View style={styles.footer}>
          {/* profile.sign-out gates the BUTTON only — the confirm alert and signOut() handler are untouched. */}
          {canSignOut && (
            <Button
              mode="outlined"
              disabled={authBusy !== null}
              onPress={() => {
                if (authBusy !== null) return;
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                      // Ken 2026-08-07 (#20) — flip to the busy state BEFORE
                      // awaiting so the spinner paints immediately. We
                      // deliberately do NOT reset authBusy in a finally:
                      // the happy path unmounts this screen via the
                      // redirect, and leaving it latched prevents a
                      // double-fire during the navigation frame.
                      setAuthBusy('signout');
                      try {
                        await signOut();
                      } catch {
                        // Local sign-out is best-effort — even if the
                        // Cognito call fails (offline, token already
                        // dead), we still clear cached PHI and route to
                        // sign-in. Leaving the user on an authed screen
                        // with a dead session is the worse outcome.
                      }
                      // Clear all cached PHI from React Query memory
                      queryClient.clear();
                      router.replace('/(auth)/sign-in' as never);
                    },
                  },
                ]);
              }}
              style={[styles.signOutButton, { paddingVertical: getScaledFontSize(6), paddingHorizontal: getScaledFontSize(12) }]}
              accessibilityLabel={authBusy === 'signout' ? 'Signing out' : 'Sign out of your account'}
              accessibilityRole="button"
              accessibilityState={{ disabled: authBusy !== null, busy: authBusy === 'signout' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                {authBusy === 'signout' ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.text}
                    style={{ marginRight: 8 }}
                  />
                ) : null}
                <Text style={[{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(24) }]}>
                  {authBusy === 'signout' ? 'Signing out…' : 'Sign Out'}
                </Text>
              </View>
            </Button>
          )}

          {/* SCRUM-319 — Apple Review 5.1.1(v): in-app account
              deletion. Two-step confirm (alert → confirm modal)
              prevents accidental taps. Backend call wipes Cognito +
              all DynamoDB rows + queues FHIR purge; mobile clears
              local state and routes to sign-in. */}
          {/* profile.delete-account gates the BUTTON only — the two-step confirm and the delete handler are untouched, so a gate flip mid-flow cannot strand a half-deleted account. */}
          {canDeleteAccount && (
            <Button
              mode="text"
              disabled={authBusy !== null}
              onPress={() => {
                if (authBusy !== null) return;
                Alert.alert(
                  'Delete account?',
                  "This permanently deletes your Circle Support Health account and all your data, including your records, plans, and trends. This cannot be undone. Are you absolutely sure?",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete forever',
                      style: 'destructive',
                      onPress: () => {
                        Alert.alert(
                          'Last chance',
                          "Tap Delete to permanently erase your account. You will be signed out immediately.",
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                // Ken 2026-08-07 (#20) — same dead-air fix as
                                // sign-out, and more important here: this
                                // path makes a network round-trip first, so
                                // the silent window was longer.
                                setAuthBusy('delete');
                                try {
                                  await apiClient.delete('/v1/auth/account');
                                } catch {
                                  // Even if the network call fails (token
                                  // expired, offline), continue with the
                                  // local wipe — better to leave the user
                                  // signed out than to keep PHI accessible.
                                }
                                try {
                                  await signOut();
                                } catch {
                                  // Best-effort; proceed to local wipe.
                                }
                                queryClient.clear();
                                router.replace('/(auth)/sign-in' as never);
                                setTimeout(() => {
                                  Alert.alert(
                                    'Account deleted',
                                    "Your account and data have been deleted. We're sorry to see you go.",
                                  );
                                }, 400);
                              },
                            },
                          ],
                        );
                      },
                    },
                  ],
                );
              }}
              style={[styles.signOutButton, { paddingVertical: getScaledFontSize(6), paddingHorizontal: getScaledFontSize(12), marginTop: 8 }]}
              accessibilityLabel={authBusy === 'delete' ? 'Deleting account' : 'Permanently delete my account and all my data'}
              accessibilityRole="button"
              accessibilityState={{ disabled: authBusy !== null, busy: authBusy === 'delete' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                {authBusy === 'delete' ? (
                  <ActivityIndicator size="small" color="#DC2626" style={{ marginRight: 6 }} />
                ) : null}
                <Text style={[{ color: '#DC2626', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(500) as any, lineHeight: getScaledFontSize(20) }]}>
                  {authBusy === 'delete' ? 'Deleting…' : 'Delete Account'}
                </Text>
              </View>
            </Button>
          )}
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
