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
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import {
  fetchConnections,
  acceptConnection,
  declineConnection,
  type Connection,
} from '@/services/api/conversations';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

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

  const accept = useMutation({
    mutationFn: (peerId: string) => acceptConnection(peerId),
    onSuccess: (conn) => {
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
        <Text style={{ color: colors.text, fontSize: getScaledFontSize(15) }} numberOfLines={1}>
          Someone would like to connect
        </Text>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <Pressable
        onPress={() => decline.mutate(item.peerId)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Decline this request"
        style={[styles.btn, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>Decline</Text>
      </Pressable>
      <Pressable
        onPress={() => accept.mutate(item.peerId)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Accept this request"
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
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
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
