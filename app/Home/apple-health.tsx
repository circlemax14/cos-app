import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  healthSourceLabel,
  type HealthSourceId,
  type HealthSourceOffer,
} from '@/services/health-sources';
import { useHealthSource } from '@/hooks/use-health-source';
import { useCanRender } from '@/hooks/use-entitlement';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Health Sync — the one place a patient connects a device or app as their
 * health data source. Extends the single "Enable Apple Health" toggle
 * (COS-389 / SCRUM-530) into a list of connectable sources.
 *
 * Ken's original feedback still holds and is why this screen exists at all:
 * the HealthKit permission prompt must only ever fire from a deliberate,
 * easy-to-find control. It still does — that control is now one row in a list
 * instead of the only row on the screen.
 *
 * ─── THIS SCREEN DECIDES ALMOST NOTHING ──────────────────────────────
 *
 * Which sources exist, which may be offered on this platform and device, which
 * can actually connect in this build, and every user-facing sentence about
 * them all live in services/health-sources.ts. The screen renders `available`
 * in order and shows `offer.note` verbatim. It does NOT know that Apple Health
 * is iOS-only or that Samsung Health needs a Samsung handset — if it did,
 * those rules would have two homes and one of them would rot. A device with no
 * offerable source gets an honest empty state, not a blank card.
 *
 * The one rule that IS a UI concern lives here: connecting Apple Health opens
 * the iOS permission dialog, so that row — and only that row — is gated on
 * `apple-health.grant-healthkit-permissions`. `apple-health.view` still gates
 * the whole body.
 *
 * ─── ONE SOURCE AT A TIME ────────────────────────────────────────────
 *
 * Vishal's rule: "at a time, they can only connect one thing ... We will fetch
 * the data from only one device." The model enforces it structurally — ONE
 * stored value, and `connectHealthSource` disconnects the incumbent in the
 * same call — so this screen's only job is to never let it happen silently.
 * Turning on a second source does NOT connect it: the row expands into
 * `willReplace(id)`, a sentence naming both sources, and waits for an explicit
 * Replace. Cancel leaves the current source untouched, and the switch stays
 * visibly off throughout, because nothing has changed yet.
 *
 * ─── HONEST UNAVAILABILITY ───────────────────────────────────────────
 *
 * `react-native-health` (HealthKit) is the only health native module in this
 * binary. Samsung Health and Health Connect are native SDKs: they cannot
 * arrive over OTA, only in a new build. Those rows come back
 * `needs-native-build` and are rendered with their reason and NO CONTROL AT
 * ALL — never a switch that silently does nothing. When an SDK lands, the
 * model flips `bundled` and the row goes live with no change here.
 *
 * Connection state is local (AsyncStorage) — iOS does not reliably expose
 * prior read-permission status. The data path (daily summary /
 * useHealthKitTrends) is unchanged; we only changed WHERE it is chosen. The
 * hook invalidates that path's queries itself, so this screen holds no cache
 * concerns of its own.
 */
export default function AppleHealthScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Entitlement gates. Hooks, so declared at the top. `grant-healthkit-
  // permissions` gates the one control that triggers the iOS permission
  // dialog — the Apple Health switch. useCanRender fails open.
  const canView = useCanRender('apple-health.view');
  const canGrantHealthKit = useCanRender('apple-health.grant-healthkit-permissions');

  const { current, available, connect, disconnect, isConnecting, willReplace, isLoading } =
    useHealthSource();

  // The source waiting on an explicit "yes, replace what I have connected".
  const [pendingId, setPendingId] = useState<HealthSourceId | null>(null);
  // Which row the in-flight connect/disconnect belongs to, so the spinner
  // lands on that row instead of on all of them. Only ever read alongside
  // `isConnecting`, so a stale value cannot strand a row in a spinner.
  const [actingId, setActingId] = useState<HealthSourceId | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const runConnect = useCallback(
    async (id: HealthSourceId) => {
      setPendingId(null);
      setStatusMessage(null);
      setActingId(id);
      // The single, deliberate place a source's permission dialog fires.
      // `connect` never throws — it reports through `{ ok, message }`, and the
      // message already names what was replaced.
      const result = await connect(id);
      setActingId(null);
      setStatusMessage({ text: result.message, isError: !result.ok });
    },
    [connect],
  );

  const handleToggle = useCallback(
    async (offer: HealthSourceOffer, next: boolean) => {
      // Defensive: a `needs-native-build` row renders no control, so this is
      // unreachable — but it guarantees we never call into a missing module.
      if (offer.status !== 'connectable') return;
      const id = offer.source.id;

      if (!next) {
        // Opting out. For Apple Health, iOS won't let the app revoke its own
        // read access — the model's message says where the user has to go.
        setPendingId(null);
        setActingId(id);
        const result = await disconnect();
        setActingId(null);
        setStatusMessage({ text: result.message, isError: !result.ok });
        return;
      }

      // Only one source may be connected, so turning this one on switches the
      // data path away from another. Say which, in the model's words, and wait
      // for a yes. `willReplace` is null when nothing is being replaced.
      if (willReplace(id)) {
        setStatusMessage(null);
        setPendingId(id);
        return;
      }

      await runConnect(id);
    },
    [disconnect, runConnect, willReplace],
  );

  return (
    <AppWrapper>
      {canView && (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.emoji}>❤️</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Health Sync
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              textAlign: 'center',
            }}
          >
            Connect a device or app to enrich your daily summary and health
            trends with steps, heart rate, sleep, and more. One source can be
            connected at a time.
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 12,
              marginLeft: 4,
            }}
          >
            Connection
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isLoading && (
              <View style={[styles.row, styles.rowCentered]}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            )}

            {/* The model returns nothing at all for a device none of the
                sources belong to. Say so plainly rather than show a blank card. */}
            {!isLoading && available.length === 0 && (
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                    No sources for this device
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
                    There isn&apos;t a health app or device we can connect to on
                    this device yet.
                  </Text>
                </View>
              </View>
            )}

            {!isLoading && available.map((offer, index) => {
              const { id, label } = offer.source;
              const isConnected = current?.id === id;
              const isConnectable = offer.status === 'connectable';
              // Apple Health is the HealthKit-backed row, so it is the only one
              // whose control opens the iOS permission dialog — and the only
              // one carrying the grant gate. Typed as HealthSourceId, so
              // renaming the source breaks this build rather than the gate.
              const controlAllowed = id !== 'apple-health' || canGrantHealthKit;
              const isActing = isConnecting && actingId === id;
              const showConfirm = pendingId === id && isConnectable && controlAllowed;

              return (
                <View
                  key={id}
                  style={{
                    borderBottomWidth: index === available.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                        {label}
                      </Text>
                      <Text
                        style={{
                          color: isConnected ? '#059669' : colors.subtext,
                          fontSize: getScaledFontSize(13),
                          fontWeight: isConnected ? (getScaledFontWeight(600) as any) : undefined,
                          marginTop: 2,
                        }}
                      >
                        {isConnected ? 'Connected' : isConnectable ? 'Not connected' : 'Unavailable'}
                      </Text>
                      {/* Either what this source brings with it, or the honest
                          reason it can't be switched on. The model writes both
                          to be shown verbatim. */}
                      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 4, lineHeight: getScaledFontSize(17) }}>
                        {offer.note}
                      </Text>
                    </View>

                    {isActing && <ActivityIndicator size="small" color={colors.tint} />}

                    {/* A source whose native module isn't in this build gets NO
                        control — the reason above is the whole story, and a
                        switch here could only lie. */}
                    {!isActing && isConnectable && controlAllowed && (
                      <Switch
                        value={isConnected}
                        onValueChange={(next) => void handleToggle(offer, next)}
                        disabled={isConnecting}
                        trackColor={{ false: '#E0E0E0', true: colors.tint }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: isConnected, disabled: isConnecting }}
                        accessibilityLabel={`Connect ${label}`}
                      />
                    )}
                  </View>

                  {showConfirm && (
                    <View style={styles.confirm}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(13),
                          lineHeight: getScaledFontSize(19),
                        }}
                        accessibilityRole="alert"
                      >
                        {willReplace(id)}
                      </Text>
                      <View style={styles.confirmActions}>
                        <Text
                          onPress={() => void runConnect(id)}
                          style={{
                            color: colors.tint,
                            fontSize: getScaledFontSize(14),
                            fontWeight: getScaledFontWeight(600) as any,
                            paddingVertical: 12,
                            paddingRight: 24,
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Connect ${label} and disconnect ${current ? healthSourceLabel(current.id) : 'the current source'}`}
                        >
                          Replace
                        </Text>
                        <Text
                          onPress={() => setPendingId(null)}
                          style={{
                            color: colors.subtext,
                            fontSize: getScaledFontSize(14),
                            paddingVertical: 12,
                            paddingRight: 8,
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Keep ${current ? healthSourceLabel(current.id) : 'the current source'} connected`}
                        >
                          Cancel
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {statusMessage ? (
            <Text
              style={{
                color: statusMessage.isError ? '#DC2626' : '#059669',
                fontSize: getScaledFontSize(13),
                marginTop: 12,
                marginLeft: 4,
              }}
              accessibilityRole="alert"
            >
              {statusMessage.text}
            </Text>
          ) : null}

          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              marginTop: 16,
              marginLeft: 4,
              lineHeight: getScaledFontSize(18),
            }}
          >
            We only read health data — we never write to it. Connecting a source
            replaces the one before it, and we read from that one only. For
            Apple Health you can change or revoke access at any time in Settings
            &gt; Privacy &amp; Security &gt; Health.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      )}
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  rowCentered: {
    justifyContent: 'center',
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  confirm: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
