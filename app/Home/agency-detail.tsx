import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Card, Button } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getCareManagerAgencyById, type CareManagerAgency } from '@/services/care-manager-agencies';
import { apiClient } from '@/lib/api-client';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AgencyTeamSection } from '@/components/agency/AgencyTeamSection';
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
/**
 * COS-1004 — where the X goes depends on where you came from.
 *
 * Vishal: "if I'm coming from the supports model to the agency details screen,
 * then clicking on the cross should take me back to the supports model. But if
 * I'm coming from the circle of providers or deep linking, like from a
 * notification, then it should take me to the home screen."
 *
 * That cannot be inferred from the navigation state. The Supports sheet is
 * DISMISSED before it pushes here (COS-999 — pushing from inside a presented
 * sheet was what made this screen render inside it), so by the time this screen
 * exists there is nothing left in the stack to say Supports was ever open. And
 * `router.back()` is no help either: under the TabRouter's firstRoute behaviour
 * every back from a Home screen lands on Home regardless of what pushed it.
 *
 * So the caller states it, with `from=supports`. Anything that does not say so
 * — the Home orbit, the care-manager redirect shim, a notification deep link —
 * gets Home, which is the right default for an entry point we do not control.
 */
function closeModal(from?: string) {
  if (from === 'supports') {
    /*
     * COS-1005 — land on Home FIRST, then present the sheet over it.
     *
     * My previous attempt replaced THIS screen with the sheet. So the sheet had
     * nothing behind it: no tab bar, no header, and its own close button had
     * nowhere to return to. Vishal was stuck on a full-screen Supports with no
     * way out. (The guard test forbids that call by name, which is why this
     * note describes it rather than quoting it.)
     *
     * Home is where Supports is opened from everywhere else — app/Home/index.tsx
     * does a plain router.push('/modal') in six places — so putting Home behind
     * it makes closing the sheet behave exactly as it does normally. replace,
     * not push, so this screen is not left underneath.
     *
     * The delay is the same 300ms this codebase already uses when it sequences
     * a dismissal into a push (app/modal.tsx), giving the tab swap time to
     * settle before the sheet is presented on top of it.
     */
    router.replace('/Home' as never);
    setTimeout(() => router.push('/modal' as never), 300);
    return;
  }
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
  /** COS-1000 — when a pending leave expires. Server-supplied; null when the
   *  sweeper is off, in which case we must not promise a date. */
  const [autoApproveAt, setAutoApproveAt] = useState<string | null>(null);
  /** COS-996 — which half of "who looks after me, and when". */
  const [detailTab, setDetailTab] = useState<'team' | 'scheduling'>('team');
  const [, setPatientAgencyId] = useState<string | null>(null);
  /*
   * COS-1002 — no longer a choice, still part of the contract.
   *
   * A request for a care manager is now always 'agency-managed'. Kept as a
   * named constant rather than inlined at the call site so the field stays
   * greppable from the payload, the dashboard's Service Tier column and
   * setPlanType() on approval, all of which still read it.
   */
  const requestedTier = 'agency-managed' as const;

  const agencyId = params.id as string | undefined;
  /** Who sent us here. Only the Supports sheet claims an origin. */
  const cameFrom = params.from as string | undefined;
  const agencyName = params.name as string || 'Care Management Agency';

  /*
   * COS-1000 — reload on FOCUS, not on mount.
   *
   * This was React.useEffect, which was correct while the screen was a
   * root-stack modal: every open was a fresh mount. Moving it into the Tabs
   * navigator (COS-999) made it a screen the navigator KEEPS MOUNTED, so
   * leaving and coming back never re-ran the effect.
   *
   * Vishal saw exactly that: he asked to leave, an admin approved it, the push
   * notification arrived — and the screen still said "Leaving…" even after he
   * closed it and opened it again. The server was right the whole time; the
   * membership, the join date and the care-team ring were already cleared. The
   * screen was showing a snapshot from before he asked.
   *
   * useFocusEffect runs on every focus, so returning to it is now a refresh.
   */
  /*
   * COS-1003 — clear the previous agency's answer before loading the next.
   *
   * Now that this lives in the Tabs navigator it is a screen the navigator
   * KEEPS MOUNTED, and navigating from one agency to another reuses that same
   * instance with new params. So the state from the agency you just left stays
   * on screen until the new load lands.
   *
   * Vishal opened BrightFuture straight after QA Test and watched it show
   * "Your team / Scheduling" — QA Test's answer — for two or three seconds
   * before flipping to "you're already with QA Test". Exactly the flicker
   * COS-996 removed, reintroduced by COS-999 through a different door: a
   * definitive answer displayed before it applies to what you are looking at.
   *
   * Keyed on agencyId alone: a name change is cosmetic and must not blank the
   * screen.
   */
  React.useEffect(() => {
    setRequestStatus('unknown');
    setAgency(null);
    setOtherAgency(null);
    setAutoApproveAt(null);
  }, [agencyId]);

  const reload = useCallback(async () => {
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
        if (pendingHere) {
          pendingType = pendingRequest.requestType === 'leave' ? 'leave' : 'join';
          setAutoApproveAt(
            typeof pendingRequest.autoApproveAt === 'string' ? pendingRequest.autoApproveAt : null,
          );
        }
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
  }, [agencyId, agencyName]);

  // Every focus is a refresh — see the note above.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /*
   * COS-1001 — and poll while the answer can change without us.
   *
   * Vishal approved his own join request from the dashboard, the push
   * notification arrived on the phone, and this screen — still open, never
   * blurred — went on saying "Request Pending". useFocusEffect cannot help
   * there: nothing re-focused.
   *
   * A pending or leaving request is the only state another party can resolve
   * while the patient is looking at it, so that is the only state worth
   * polling. Fifteen seconds is well under the time it takes to read the
   * screen and wonder, and it stops the moment the state settles.
   */
  React.useEffect(() => {
    if (requestStatus !== 'pending' && requestStatus !== 'leaving') return;

    /*
     * COS-1002 — five seconds, not fifteen.
     *
     * Vishal approved his own request and asked why the screen took a few
     * seconds to catch up: it was waiting for the next tick. The push arrives
     * instantly but cannot reach this screen — the notification handler
     * invalidates React Query caches (see hooks/use-notifications.ts) and this
     * screen's status is local state, so there is nothing for it to invalidate.
     *
     * The real fix is to move this status onto React Query so the existing push
     * handler invalidates it and the update is immediate. That is a bigger
     * change than this round should carry, so: a tighter interval, and a
     * foreground refresh below, which together cover the cases that actually
     * happen. The window is narrow — only while a request is unresolved AND the
     * screen is focused.
     */
    const timer = setInterval(() => {
      void reload();
    }, 5000);

    // Coming back to the APP while already on this screen: useFocusEffect does
    // not fire for that, because the screen never lost focus.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reload();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [requestStatus, reload]);

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
      `We'll let ${name} know, and they may get in touch to talk it over. ` +
        `You'll see the exact date on this screen once the request is in.`,
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
      <AppWrapper>
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: getScaledFontSize(24) }} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => closeModal(cameFrom)} style={styles.closeButton} accessibilityLabel="Close">
            <IconSymbol name="xmark" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>Loading agency information...</Text>
        </View>
      </SafeAreaView>
      </AppWrapper>
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
    {/*
      * COS-1004 — no backgroundColor here.
      *
      * AppWrapper paints the app's ground AND its decorative bubbles behind
      * this screen. An opaque panel on top clipped them, which is what Vishal
      * saw as the bubbles "cutting". doctor-detail — the screen this one was
      * modelled on — sets no background for exactly this reason.
      */}
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      {/* Pull-to-refresh stays off: it was omitted because the sheet's
          dismiss gesture owned the pull, and adding it now is a behaviour
          change this ticket did not ask for. */}
      {canView && (
      <ScrollView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: 'transparent' }]}>
          <View style={{ width: getScaledFontSize(24) }} />
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
            Agency Details
          </Text>
          <TouchableOpacity onPress={() => closeModal(cameFrom)} style={styles.closeButton} accessibilityLabel="Close">
            <IconSymbol name="xmark" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
        </View>

      {/* Agency Info Card */}
      {canViewAgency && (
      /* COS-1005 — transparent: this painted colors.background, the same colour as the page, so it added nothing except an opaque panel that clipped AppWrapper's bubbles. */
      <Card style={[styles.agencyCard, { backgroundColor: 'transparent' }]}>
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
        <Card style={[styles.sectionCard, { backgroundColor: 'transparent' }]}>
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
        <Card style={[styles.sectionCard, { backgroundColor: 'transparent' }]}>
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
              {/*
                * COS-1000 — name the date when there is one.
                *
                * "They have 5 days" left the patient counting from a day they
                * had to remember. The date comes from the server precisely so
                * that a stage with the sweeper switched off falls back to the
                * second sentence instead of promising an expiry nothing will
                * act on.
                */}
              {autoApproveAt
                ? `${agency?.name ?? 'The agency'} may get in touch to talk it over. If they don't respond, you'll be moved out automatically on ${new Date(autoApproveAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`
                : `${agency?.name ?? 'The agency'} may get in touch to talk it over. They'll confirm before anything changes.`}
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
                onPress={() =>
                  // Carry the origin across: if Supports sent you here, the X on
                  // the agency you hop to should still return you to Supports.
                  router.push({
                    pathname: '/Home/agency-detail',
                    params: { id: otherAgency.id, name: otherAgency.name, ...(cameFrom ? { from: cameFrom } : {}) },
                  } as never)
                }
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

                {/*
                  * COS-1002 — the "Level of service" picker is gone.
                  *
                  * Vishal: "why is the consent form asking me what kind of
                  * level of service I'm expecting, family support or agency
                  * support ... family support is not required at this point.
                  * When I'm going to raise a request for care manager, it will
                  * directly be agency always."
                  *
                  * The two options were 'agency-supported' — labelled "Family
                  * Support" under the v2 assessment flag — and 'agency-managed',
                  * labelled "Agency". Asking a patient to pick between them at
                  * the moment they ask for a care manager put a plan decision in
                  * front of someone who has not met the care team yet, in
                  * vocabulary only we understand.
                  *
                  * The tier is still SENT, as 'agency-managed', so the payload,
                  * the agency's queue column and the plan applied on approval
                  * are all unchanged in shape — only the question disappears.
                  */}

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
