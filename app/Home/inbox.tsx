/**
 * COS-1058 — Inbox: the conversations you are in.
 *
 * Vishal, 2026-09-19: "next to calendar I want one more screen, that is the
 * inbox screen where I want a WhatsApp-like functionality but a simple chat,
 * where the person can communicate but cannot send or share any files."
 *
 * Text only, deliberately. No attachments, no voice notes, no images — a file
 * picker here would be the first way a patient's records leave the app by
 * accident, and it is not what was asked for.
 *
 * ─── PRIMITIVES ONLY ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / FlatList / MaterialIcons / StyleSheet. No SVG, no
 * Animated, no new react-native imports. This app has crashed in production
 * from cold-mount rendering (ADR-0003), and a new screen is exactly where an
 * unfamiliar primitive gets introduced without anyone noticing.
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import {
  fetchConversations,
  fetchConnections,
  type ConversationSummary,
} from '@/services/api/conversations';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

/*
 * COS-1058 — required on every leaf route, and enforced by a test.
 *
 * Without it a throw in this screen takes the WHOLE app down rather than one
 * tab. That guard caught all four of these screens on their first run, which
 * is exactly what it is for.
 */
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** Relative time a person reads, without pulling in a date library. */
function whenLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function InboxScreenInner() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const conversationsQ = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    staleTime: 30_000,
  });

  /*
   * Pending requests are shown as a banner rather than a separate tab. Someone
   * waiting on you is the one thing in this screen that needs an action, and a
   * second tab is a place people do not look.
   */
  const pendingQ = useQuery({
    queryKey: ['connections', 'pending-in'],
    queryFn: () => fetchConnections('pending-in'),
    staleTime: 30_000,
  });

  const pendingCount = pendingQ.data?.length ?? 0;
  const conversations = useMemo(() => conversationsQ.data ?? [], [conversationsQ.data]);

  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <Pressable
        onPress={() =>
          router.push({ pathname: '/Home/conversation', params: { id: item.conversationId } } as never)
        }
        accessibilityRole="button"
        accessibilityLabel={`Open conversation, last activity ${whenLabel(item.lastMessageAt)}`}
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.border }]}>
          <MaterialIcons
            name={item.kind === 'group' ? 'groups' : 'person'}
            size={getScaledFontSize(20)}
            color={colors.icon}
          />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(600) as never,
            }}
            numberOfLines={1}
          >
            {item.kind === 'group' ? 'Group' : 'Conversation'}
          </Text>
          {/*
            COS-1058 — no message preview here, and that is deliberate rather
            than unfinished. The inbox list would be the natural place for one,
            but the list is fetched from a summary that carries no body, and
            adding one would mean the server returning message text for every
            conversation on every inbox load.
          */}
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 1 }}>
            Tap to read
          </Text>
        </View>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
          {whenLabel(item.lastMessageAt)}
        </Text>
      </Pressable>
    ),
    [colors, getScaledFontSize, getScaledFontWeight],
  );

  return (
    <AppWrapper>
      <View style={styles.header}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as never,
          }}
          accessibilityRole="header"
        >
          Inbox
        </Text>
        <Pressable
          onPress={() => router.push('/Home/find-people' as never)}
          accessibilityRole="button"
          accessibilityLabel="Find people to message"
          style={[styles.newBtn, { borderColor: colors.border }]}
        >
          <MaterialIcons name="person-add" size={getScaledFontSize(18)} color={colors.tint} />
        </Pressable>
      </View>

      {pendingCount > 0 && (
        <Pressable
          onPress={() => router.push('/Home/connection-requests' as never)}
          accessibilityRole="button"
          accessibilityLabel={`${pendingCount} connection requests waiting`}
          style={[styles.banner, { borderColor: colors.border }]}
        >
          <MaterialIcons name="how-to-reg" size={getScaledFontSize(18)} color={colors.tint} />
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), flex: 1, marginLeft: 8 }}>
            {pendingCount} request{pendingCount === 1 ? '' : 's'} waiting for you
          </Text>
          <MaterialIcons name="chevron-right" size={getScaledFontSize(20)} color={colors.icon} />
        </Pressable>
      )}

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.conversationId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={conversationsQ.isFetching}
            onRefresh={() => void conversationsQ.refetch()}
            tintColor={colors.icon}
          />
        }
        ListEmptyComponent={
          /*
            COS-1020's rule: never render a terminal empty state while the
            request is in flight. "No conversations" and "still loading" are
            different answers and only one is a claim about the patient.
          */
          <View style={styles.empty}>
            <MaterialIcons
              name={conversationsQ.isLoading ? 'hourglass-empty' : 'forum'}
              size={getScaledFontSize(34)}
              color={colors.icon}
            />
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                marginTop: Spacing.sm,
              }}
            >
              {conversationsQ.isLoading
                ? 'Loading your conversations…'
                : conversationsQ.isError
                  ? 'We could not load your conversations. Pull to try again.'
                  : 'No conversations yet. Find someone to message.'}
            </Text>
          </View>
        }
      />
    </AppWrapper>
  );
}

/**
 * COS-1058 — the boundary is the DEFAULT export, and the inner component is
 * not.
 *
 * Caught by lib/screen-error-boundary.test.mjs on the first run of this
 * screen. The 2026-08-15 production crash was one screen's error taking the
 * whole process down; wrapping only the screen that already broke would
 * protect against the bug already fixed and nothing else, so the guard reads
 * the tab list from _layout.tsx and fails here instead of in production.
 *
 * Renaming the inner component matters as much as the wrapper: leaving it as
 * the default export puts the boundary in the tree while the route still
 * points at the unwrapped original.
 */
export default function InboxScreen() {
  return (
    <ScreenErrorBoundary screen="inbox">
      <InboxScreenInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  newBtn: { borderWidth: 1, borderRadius: Radii.md, padding: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
});
