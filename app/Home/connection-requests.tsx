/**
 * COS-1058 — people waiting for you to accept.
 *
 * The other half of the request gate: the directory lets someone ask, this is
 * where the answer is given. Accepting opens a conversation; declining does
 * not, and cannot be undone by the requester asking again.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import {
  fetchConnections,
  acceptConnection,
  declineConnection,
  type Connection,
} from '@/services/api/conversations';
import { Colors } from '@/constants/theme';
import { incomingRequestLine, incomingRequestReason } from '@/lib/received-invite-copy';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { socialReturnHref } from '@/lib/social-nav';
import { messagingDisabledText } from '@/lib/social-safety';

/*
 * COS-1058 — required on every leaf route, and enforced by a test.
 *
 * Without it a throw in this screen takes the WHOLE app down rather than one
 * tab. That guard caught all four of these screens on their first run, which
 * is exactly what it is for.
 */
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function ConnectionRequestsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const qc = useQueryClient();
  /** COS-1236 — where Back goes. A token, resolved by the shared allowlist. */
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const backHref = socialReturnHref(typeof returnTo === 'string' ? returnTo : undefined);

  const pendingQ = useQuery({
    queryKey: ['connections', 'pending-in'],
    queryFn: () => fetchConnections('pending-in'),
    staleTime: 15_000,
  });

  /** Both actions refresh the same keys, so the banner on Inbox clears too. */
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['connections', 'pending-in'] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  // COS-1268 — set only when a reviewer turned messaging off for this account.
  const [notice, setNotice] = React.useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (peerId: string) => acceptConnection(peerId),
    onError: (err) => setNotice(messagingDisabledText(err)),
    onSuccess: (conn) => {
      setNotice(null);
      refresh();
      /*
       * Accepting opens the conversation server-side, so going straight there
       * is the natural next step — the alternative is bouncing back to a list
       * that now has one fewer row and making them find the new thread.
       */
      if (conn.conversationId) {
        router.push({ pathname: '/Home/conversation', params: { id: conn.conversationId } } as never);
      }
    },
  });

  const decline = useMutation({
    mutationFn: (peerId: string) => declineConnection(peerId),
    onSuccess: refresh,
  });

  const busy = accept.isPending || decline.isPending;

  const renderItem = ({ item }: { item: Connection }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.border }]}>
        <MaterialIcons name="person" size={getScaledFontSize(20)} color={colors.icon} />
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
        {/*
          COS-1235 — the SECOND screen that renders this list, and it had the same
          anonymous line as SocialPanel's. Accepting an emailed invitation creates
          the request with the RECIPIENT as requester, so the INVITER lands here and
          was asked to confirm "Someone would like to connect" — with no name — about
          a person they had invited by email minutes earlier.

          Through the same helper as the panel, not a second copy of the sentence: a
          stranger is still anonymous (the server populates neither field for a peer
          this caller did not invite) and the two screens cannot disagree.
        */}
        <Text style={{ color: colors.text, fontSize: getScaledFontSize(15) }} numberOfLines={1}>
          {incomingRequestLine(item)}
        </Text>
        {incomingRequestReason(item) ? (
          <Text
            style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}
            numberOfLines={1}
          >
            {incomingRequestReason(item)}
          </Text>
        ) : null}
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <Pressable
        onPress={() => decline.mutate(item.peerId)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Decline: ${incomingRequestLine(item)}`}
        style={[styles.btn, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>Decline</Text>
      </Pressable>
      <Pressable
        onPress={() => accept.mutate(item.peerId)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Accept: ${incomingRequestLine(item)}`}
        style={[styles.btn, { borderColor: colors.tint as string, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
          Accept
        </Text>
      </Pressable>
    </View>
  );

  return (
    <AppWrapper>
      <View style={[styles.header, { borderColor: colors.border }]}>
        {/*
          COS-1236 — Back goes where you CAME FROM.

          Vishal: "if I click on the back icon, it is taking me to the home
          screen. Ideally it should take me to the inbox screen." This screen is
          an app/Home/* route hidden with href:null, so a push from the Inbox tab
          is a push inside that tab's stack and `router.back()` pops to the tab's
          initial route — Home. `replace`, not `back`, and the destination is a
          TOKEN resolved by lib/social-nav rather than a pathname off the wire
          (COS-1186's rule: an honoured pathname is an open redirect wearing a
          Back button).
        */}
        <Pressable onPress={() => router.replace(backHref as never)} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <MaterialIcons name="arrow-back" size={getScaledFontSize(22)} color={colors.text} />
        </Pressable>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as never,
            marginLeft: Spacing.sm,
          }}
          accessibilityRole="header"
        >
          Requests
        </Text>
      </View>

      <FlatList
        data={pendingQ.data ?? []}
        keyExtractor={(c) => c.peerId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
        ListHeaderComponent={
          notice ? (
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(13) }} accessibilityRole="alert">
              {notice}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons
              name={pendingQ.isLoading ? 'hourglass-empty' : 'inbox'}
              size={getScaledFontSize(30)}
              color={colors.icon}
            />
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                textAlign: 'center',
                marginTop: Spacing.sm,
              }}
            >
              {pendingQ.isLoading ? 'Loading…' : 'No requests waiting.'}
            </Text>
          </View>
        }
      />
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm, gap: 6 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  btn: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 10, paddingVertical: 6 },
  empty: { alignItems: 'center', paddingVertical: 60 },
});
