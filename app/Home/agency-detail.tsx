import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Card, Button } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getCareManagerAgencyById, type CareManagerAgency } from '@/services/care-manager-agencies';
import { apiClient } from '@/lib/api-client';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AgencyTeamSection } from '@/components/agency/AgencyTeamSection';
import { AgencyVisitsSection } from '@/components/agency/AgencyVisitsSection';
import { AgencyScheduleCalendar } from '@/components/agency/AgencyScheduleCalendar';
import { useCanRender } from '@/hooks/use-entitlement';
// COS-930 — SafeAreaView root, because the app is EDGE-TO-EDGE on Android.
//
// android/gradle.properties sets edgeToEdgeEnabled=true and styles.xml makes
// the status bar transparent, so a plain flex:1 View starts at y=0 — under the
// clock and the punch-hole camera. Worse than ugly: the SystemUI status-bar
// window is touchable and sits ON TOP of the app, so a close button or a menu
// trigger inside that strip receives no taps at all. Vishal hit this on an S26.
//
// No iOS regression: these are `presentation: 'modal'` routes, where
// safe-area-context reports a top inset of 0 inside the sheet, so the
// SafeAreaView adds nothing. On the full-screen ones it is a fix for iOS too.
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppWrapper } from '@/components/app-wrapper';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Dismiss the agency detail modal. Prefer `router.dismiss` (proper modal
 * close — pops the modal off the root Stack) and fall back to `router.back`
 * only if we can go back. If neither works (deep-link entry point) send the
 * user to the Home tab instead of leaving them on a blank screen.
 */
function closeModal() {
  /*
   * COS-999 — no router.dismiss() here any more.
   *
   * This screen now lives inside the Tabs navigator. expo-router's
   * canDismiss() walks DOWN from the root and returns true at the first stack
   * with more than one entry — which, from in here, is the ROOT stack. So
   * dismiss() would pop `Home` itself off rather than this screen. It was only
   * survivable because app/index.tsx replaces itself out, leaving one root
   * route in the common case.
   *
   * back() is correct now: per the TabRouter's firstRoute behaviour it lands on
   * Home, which is where a patient closing an agency expects to be.
   */
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/Home' as never);
}

/**
 * COS-996 — what the bottom of this screen is allowed to say.
 *
 * 'unknown' is the INITIAL value and the whole point of this type. The state
 * used to start at 'none', so every visit rendered "Request Care Manager" —
 * including to a patient already with this agency — and flipped a second or
 * two later when two awaited calls landed. Vishal watched it change under his
 * thumb as he reached for it. A CTA that is wrong for a second is worse than
 * one that arrives a second later, because the wrong one gets tapped.
 */
type AgencyCta = 'unknown' | 'none' | 'pending' | 'approved' | 'blocked' | 'leaving';

export default function AgencyDetailScreen() {
  const params = useLocalSearchParams();
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  // COS-360 / SCRUM-577 — flag-gated "Family Support" rename.
  const planTypeDisplayName = usePlanTypeDisplayName();

  // COS-849 entitlement gates. Hooks, so unconditional and above the early
  // return for the loading state below.
  const canView = useCanRender('agency-detail.view');
  const canViewAgency = useCanRender('agency-detail.view-agency');
  const canContactAgency = useCanRender('agency-detail.contact-agency');
  const canConnectAgency = useCanRender('agency-detail.connect-agency');

  const [agency, setAgency] = useState<CareManagerAgency | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [requestStatus, setRequestStatus] = useState<AgencyCta>('unknown');
  /** The agency the patient already belongs to, when it is not this one. */
  const [otherAgency, setOtherAgency] = useState<{ id: string; name: string } | null>(null);
  /** COS-996 — which half of "who looks after me, and when". */
  const [detailTab, setDetailTab] = useState<'team' | 'scheduling'>('team');
  const [, setPatientAgencyId] = useState<string | null>(null);
  // SCRUM-268 Phase 4: tier the patient is requesting. 'agency-supported'
  // is the default — the lighter-touch option where the AI plan still
  // runs the show and the care team supplements. 'agency-managed' lets
  // the care team direct the cadence + add the heavier instruments.
  const [requestedTier, setRequestedTier] = useState<'agency-supported' | 'agency-managed'>('agency-supported');

  const agencyId = params.id as string | undefined;
  const agencyName = params.name as string || 'Care Management Agency';

  // Load agency data and request status
  React.useEffect(() => {
    const loadData = async () => {
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

      /*
       * COS-996 — resolve the CTA ONCE, from both answers together.
       *
       * These were two independent setState calls racing each other, so the
       * screen could show 'pending' and then 'approved' within the same second.
       *
       * The membership test was also simply wrong. It read
       *
       *     if (meRes.data?.data?.agencyId === agencyId) -> approved
       *
       * but EVERY patient is stamped with the isDefault agency by
       * ensureUserProfile, so `agencyId` alone never means "is a member" — it
       * means "exists". /v1/auth/me already answers the real question with
       * `hasElectedAgency` (added in COS-887 for precisely this bug on the
       * support screen); this screen just never asked.
       */
      let pendingHere = false;
      let pendingType: 'join' | 'leave' | null = null;
      try {
        const statusRes = await apiClient.get('/v1/patients/me/agency-request/status');
        const pendingRequest = statusRes.data?.data;
        pendingHere = Boolean(pendingRequest && pendingRequest.agencyId === agencyId);
        if (pendingHere) pendingType = pendingRequest.requestType === 'leave' ? 'leave' : 'join';
      } catch {
        // No pending request.
      }

      let myAgencyId: string | null = null;
      let elected = false;
      try {
        const meRes = await apiClient.get('/v1/auth/me');
        myAgencyId = (meRes.data?.data?.agencyId as string | undefined) ?? null;
        /*
         * COS-996 — prefer `hasJoinedAgency`, fall back to `hasElectedAgency`.
         *
         * `hasElectedAgency` only asks whether the agency on the profile is not
         * the signup default. On PRODUCTION the single agency IS the default,
         * so it reads false for a patient who genuinely joined — this screen
         * would then offer "Request Care Manager" to someone who already has
         * one, which is the bug this whole change exists to remove.
         * `hasJoinedAgency` is derived from `agencyJoinedAt`, written only by an
         * approved join. The fallback covers an app running ahead of the API.
         */
        const me = meRes.data?.data ?? {};
        elected = me.hasJoinedAgency === true
          || (me.hasJoinedAgency === undefined && me.hasElectedAgency === true);
      } catch {
        // Unreachable /me: fall through to 'none' rather than claim membership.
      }
      setPatientAgencyId(myAgencyId);

      const belongsHere = elected && myAgencyId === agencyId;
      const belongsElsewhere = elected && Boolean(myAgencyId) && myAgencyId !== agencyId;

      if (belongsHere && pendingType === 'leave') {
        // Still a member, but on the way out — the agency has not actioned it.
        setRequestStatus('leaving');
      } else if (belongsHere) {
        setRequestStatus('approved');
      } else if (pendingHere) {
        setRequestStatus('pending');
      } else if (belongsElsewhere) {
        /*
         * Name the agency they are actually with. "You already have an agency"
         * is not actionable — a patient cannot leave one the app will not name.
         */
        const other = myAgencyId
          ? await getCareManagerAgencyById(myAgencyId).catch(() => null)
          : null;
        setOtherAgency({ id: String(myAgencyId), name: other?.name ?? 'your current agency' });
        setRequestStatus('blocked');
      } else {
        setRequestStatus('none');
      }
    };
    loadData();
  }, [agencyId, agencyName]);

  const handleRequestCareManager = () => {
    setShowConsentModal(true);
  };

  const handleConsentYes = async () => {
    setShowConsentModal(false);
    setIsRequesting(true);
    try {
      await apiClient.post('/v1/patients/me/agency-request', { agencyId, requestedTier });
      setRequestStatus('pending');
      Alert.alert(
        'Request Submitted',
        'Your request for a care manager has been submitted successfully. You will be contacted within 24-48 hours.',
        [{ text: 'OK' }]
      );
    } catch {
      Alert.alert('Error', 'Failed to submit request. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  /**
   * COS-996 — ask to leave. The agency gets a grace period to respond before
   * this auto-approves, so the confirmation says so: a patient who thinks they
   * have already left, and has not, is the worst version of this screen.
   */
  const handleLeaveAgency = () => {
    const name = agency?.name ?? 'this agency';
    Alert.alert(
      `Leave ${name}?`,
      `We'll let ${name} know. They have 5 days to respond and may get in touch to talk it over. ` +
        `If they don't respond, you'll be moved out automatically after that.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Request to leave',
          style: 'destructive',
          onPress: async () => {
            setIsRequesting(true);
            try {
              await apiClient.post('/v1/patients/me/agency-request/leave', {});
              setRequestStatus('leaving');
            } catch (err) {
              const status = (err as { response?: { status?: number } })?.response?.status;
              Alert.alert(
                'Could not send that',
                status === 409
                  ? 'You already have a request in progress with this agency.'
                  : 'Please try again in a moment.',
              );
            } finally {
              setIsRequesting(false);
            }
          },
        },
      ],
    );
  };

  const handleConsentNo = () => {
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
    } catch {
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
    } catch {
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
    } catch {
      Alert.alert('Error', 'Unable to open website');
    }
  };

  if (!agency) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <View style={{ width: getScaledFontSize(24) }} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={closeModal} style={styles.closeButton} accessibilityLabel="Close">
            <IconSymbol name="xmark" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading agency information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    /*
     * COS-999 — AppWrapper supplies the header, and living under app/Home/
     * supplies the bottom tab bar. Vishal: "the top header and the bottom
     * navigations are missed. It's not like we are covering the entire screen."
     *
     * Changing `presentation` could never have fixed that. A root-level Stack
     * sibling of Home structurally cannot show the tab bar — `modal` merely hid
     * the absence behind a sheet, and `fullScreenModal` exposed it.
     *
     * SafeAreaView now claims only LEFT/RIGHT: AppWrapper owns the top inset
     * and the tab bar owns the bottom, so claiming those here would double-pad.
     */
    <AppWrapper>
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Pull-to-refresh stays off: it was omitted because the sheet's
          dismiss gesture owned the pull, and adding it now is a behaviour
          change this ticket did not ask for. */}
      {canView && (
      <ScrollView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <View style={{ width: getScaledFontSize(24) }} />
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
            Agency Details
          </Text>
          <TouchableOpacity onPress={closeModal} style={styles.closeButton} accessibilityLabel="Close">
            <IconSymbol name="xmark" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
        </View>

      {/* Agency Info Card */}
      {canViewAgency && (
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
              {agency.logoUrl ? (
                <Image
                  source={{ uri: agency.logoUrl }}
                  style={{
                    width: getScaledFontSize(64),
                    height: getScaledFontSize(64),
                    borderRadius: getScaledFontSize(32),
                  }}
                  contentFit="cover"
                />
              ) : (
                <IconSymbol name="building.2" size={getScaledFontSize(32)} color={colors.tint || '#008080'} />
              )}
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
          {canContactAgency && (
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
          )}
        </Card.Content>
      </Card>
      )}

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

      {/* Request Care Manager Button / Status */}
      <View style={styles.buttonContainer}>
        {requestStatus === 'unknown' ? (
          /*
           * COS-996 — hold the space, say nothing.
           *
           * Same height as the button that may replace it, so nothing jumps
           * when the answer arrives. Rendering the real CTA here is what made
           * the screen offer "Request Care Manager" to patients who already
           * had one.
           */
          <View
            style={[styles.requestButton, { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 56 }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Checking your agency status"
          >
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : requestStatus === 'approved' ? (
          <>
            <View style={[styles.requestButton, { backgroundColor: '#E8F5E9', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }]}>
              <MaterialIcons name="check-circle" size={getScaledFontSize(24)} color="#2E7D32" />
              <Text style={{ color: '#2E7D32', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginTop: 8, textAlign: 'center' }}>
                {/* "You are assigned to this agency" read like a clerical
                    record. The patient chose this agency; say it their way. */}
                {agency?.name ? `${agency.name} is your care agency` : 'This is your care agency'}
              </Text>
            </View>

            {agencyId ? (
              <>
                {/*
                  * COS-996 — two tabs, because this is two questions.
                  *
                  * WHO looks after me, and WHEN am I seeing them. They were
                  * stacked, so the calendar sat below a staff list of unknown
                  * length and was often never scrolled to.
                  */}
                <View style={styles.detailTabs} accessibilityRole="tablist">
                  {([['team', 'Your team'], ['scheduling', 'Scheduling']] as const).map(([key, label]) => {
                    const active = detailTab === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setDetailTab(key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={label}
                        style={[
                          styles.detailTab,
                          { borderBottomColor: active ? colors.tint : 'transparent' },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? colors.tint : colors.text,
                            opacity: active ? 1 : 0.6,
                            fontSize: getScaledFontSize(15),
                            fontWeight: getScaledFontWeight(active ? 600 : 400) as any,
                            textAlign: 'center',
                          }}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Quiet, and below the tabs: leaving is rare and should not
                    compete with the things a member actually came here for. */}
                {detailTab === 'team' ? (
                  /* Gated on approval, not on the endpoint's own 403. The API
                     refuses a patient who is not assigned, but swallowing that
                     here would render an empty list — indistinguishable from
                     "my agency has no staff". */
                  <AgencyTeamSection agencyId={String(agencyId)} showEmptyState />
                ) : (
                  /* COS-999 — the calendar Vishal asked for, in place of the
                     four-row list. AgencyVisitsSection stays in the codebase:
                     it is still the right shape stacked under other content. */
                  <AgencyScheduleCalendar agencyId={String(agencyId)} />
                )}
              </>
            ) : null}
          </>
        ) : requestStatus === 'leaving' ? (
          <View style={[styles.requestButton, { backgroundColor: '#FFF3E0', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' }]}>
            <MaterialIcons name="logout" size={getScaledFontSize(24)} color="#E65100" />
            <Text style={{ color: '#E65100', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginTop: 8, textAlign: 'center' }}>
              Leaving {agency?.name ?? 'this agency'}
            </Text>
            <Text style={{ color: '#E65100', fontSize: getScaledFontSize(13), marginTop: 4, textAlign: 'center', lineHeight: getScaledFontSize(19) }}>
              They have 5 days to respond and may get in touch. If they don&rsquo;t, you&rsquo;ll be moved out automatically.
            </Text>
          </View>
        ) : requestStatus === 'pending' ? (
          <View style={[styles.requestButton, { backgroundColor: '#FFF3E0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }]}>
            <MaterialIcons name="hourglass-top" size={getScaledFontSize(24)} color="#E65100" />
            <Text style={{ color: '#E65100', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginTop: 8, textAlign: 'center' }}>
              Request Pending
            </Text>
            <Text style={{ color: '#E65100', fontSize: getScaledFontSize(13), marginTop: 4, textAlign: 'center' }}>
              Your request is being reviewed by the agency
            </Text>
          </View>
        ) : requestStatus === 'blocked' ? (
          /*
           * COS-996 — a patient belongs to ONE agency at a time.
           *
           * This screen used to offer "Request Care Manager" on every other
           * agency, so a patient already with one could ask a second to take
           * them on. Explain the rule and name the agency holding them, rather
           * than showing a button that would be refused.
           */
          <View style={[styles.requestButton, { backgroundColor: '#EEF2F7', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' }]}>
            <MaterialIcons name="info-outline" size={getScaledFontSize(24)} color="#37474F" />
            <Text style={{ color: '#263238', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, marginTop: 8, textAlign: 'center' }}>
              You&rsquo;re already with {otherAgency?.name ?? 'another agency'}
            </Text>
            <Text style={{ color: '#455A64', fontSize: getScaledFontSize(13), marginTop: 6, textAlign: 'center', lineHeight: getScaledFontSize(19) }}>
              To join {agency?.name ?? 'this agency'}, you&rsquo;ll need to leave{' '}
              {otherAgency?.name ?? 'your current agency'} first. You can do that from their page.
            </Text>
            {otherAgency ? (
              <Button
                mode="outlined"
                onPress={() => router.push({ pathname: '/agency-detail', params: { id: otherAgency.id, name: otherAgency.name } } as never)}
                style={{ marginTop: 12 }}
                labelStyle={{ fontSize: getScaledFontSize(14) }}
              >
                Open {otherAgency.name}
              </Button>
            ) : null}
          </View>
        ) : (
          canConnectAgency && <Button
            mode="contained"
            onPress={handleRequestCareManager}
            loading={isRequesting}
            disabled={isRequesting}
            style={[styles.requestButton, { backgroundColor: colors.tint }]}
            labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff', textAlign: 'center' }}
            contentStyle={{ paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 }}
            icon={() => <MaterialIcons name="person-add" size={getScaledFontSize(20)} color="#fff" />}
          >
            Request Care Manager
          </Button>
        )}
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

                {/* SCRUM-268 Phase 4: which level of service is the patient
                    asking for? Carries through as `requestedTier` on the
                    agency-request payload and becomes the patient's plan
                    type once the agency approves. */}
                <View style={styles.tierSection}>
                  <Text style={[styles.consentQuestion, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, marginBottom: 8 }]}>
                    Level of service
                  </Text>
                  {([
                    {
                      value: 'agency-supported' as const,
                      title: planTypeDisplayName('agency-supported'),
                      desc: 'Keep your AI-driven plan; your care team adds extra check-ins (ADL, IADL, Mini-Cog) and provides oversight.',
                    },
                    {
                      value: 'agency-managed' as const,
                      title: planTypeDisplayName('agency-managed'),
                      desc: 'Your care team actively directs your plan with intake and cognitive assessment.',
                    },
                  ]).map((opt) => {
                    const selected = requestedTier === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setRequestedTier(opt.value)}
                        style={[
                          styles.tierOption,
                          {
                            borderColor: selected ? (colors.tint as string) : colors.text + '30',
                            backgroundColor: selected ? (colors.tint as string) + '12' : 'transparent',
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <MaterialIcons
                          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                          size={getScaledFontSize(20)}
                          color={selected ? (colors.tint as string) : colors.text + '60'}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
                            {opt.title}
                          </Text>
                          <Text style={{ color: colors.text + 'BB', fontSize: getScaledFontSize(12), marginTop: 4, lineHeight: getScaledFontSize(18) }}>
                            {opt.desc}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
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
                  labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text, textAlign: 'center' }}
                  contentStyle={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 48 }}
                >
                  No
                </Button>
                <Button
                  mode="contained"
                  onPress={handleConsentYes}
                  style={[styles.modalButton, { backgroundColor: colors.tint }]}
                  labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff', textAlign: 'center' }}
                  contentStyle={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 48 }}
                >
                  Yes, I Consent
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
      )}

      {/*
        * COS-999 — pinned to the bottom of the SCREEN, not the end of the list.
        *
        * Vishal: "I want it as a button at the very bottom of the screen,
        * whatever the size of the screen doesn't matter."
        *
        * So it sits outside the ScrollView as a sibling. Inside it, the button
        * was wherever the content happened to end — which on a member with a
        * long team list meant scrolling to find it, and on a short one left it
        * floating mid-screen. Outside, it is in the same place on every device.
        *
        * Only for a member: there is nothing to leave otherwise.
        */}
      {canView && requestStatus === 'approved' ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(128,128,128,0.3)',
            backgroundColor: colors.background,
          }}
        >
          <Button
            mode="outlined"
            onPress={handleLeaveAgency}
            disabled={isRequesting}
            textColor="#B3261E"
            style={{ borderColor: '#B3261E' }}
            contentStyle={{ minHeight: 48 }}
            labelStyle={{ fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}
            accessibilityLabel={`Leave ${agency?.name ?? 'this agency'}`}
          >
            Leave this agency
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  detailTabs: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
  },
  detailTab: {
    flex: 1,
    paddingVertical: 12,
    // 44pt minimum touch target — these are the primary controls on this half
    // of the screen and the audience skews older.
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
  },
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
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    flexShrink: 1,
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
    flexWrap: 'wrap',
  },
  agencyIcon: {
    marginRight: 16,
    flexShrink: 0,
  },
  agencyTitleContainer: {
    flex: 1,
    minWidth: '60%',
  },
  agencyName: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    flexWrap: 'wrap',
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
    gap: 12,
    flexWrap: 'wrap',
  },
  contactButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 60,
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
    flexShrink: 1,
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
    flexShrink: 1,
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
    minHeight: 56,
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
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
    flexShrink: 1,
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
    flexShrink: 1,
  },
  consentDescription: {
    fontSize: 14,
    flexShrink: 1,
  },
  tierSection: {
    marginBottom: 24,
  },
  tierOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
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
    flexShrink: 1,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
    flexWrap: 'wrap',
  },
  modalButton: {
    flex: 1,
    minWidth: 120,
    minHeight: 48,
    paddingVertical: 4,
    justifyContent: 'center',
  },
});
