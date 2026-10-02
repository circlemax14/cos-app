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
import { requestInviteSheet } from '@/lib/social-nav';
import { useCanShowScreen } from '@/hooks/use-feature-permissions';

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

  /*
   * COS-1237 — BOTH HEADER BUTTONS ARE GATED, with the gate SocialPanel uses.
   *
   * This screen imported no entitlement hook at all, so the `person-add` button
   * has pushed every patient at /Home/find-people since COS-1058 and COS-1236 put
   * an un-gated `group-add` beside it. SocialPanel reads `canShow('find-people')`
   * (components/social/SocialPanel.tsx) and hides the same two affordances when it
   * is absent; Inbox was the second door with no lock on it. Gating one and
   * leaving its twin would have been the larger diff and the stranger screen.
   *
   * ONE key for both, because it is one feature: find-people is what
   * /Home/find-people needs, and it is ALSO what the invite sheet needs — the
   * panel initialises to 'invite' only `&& canFind`, so without the key the
   * second button opens the modal onto the find mode it cannot use either.
   *
   * The pending banner below is deliberately NOT gated. It is a RECIPIENT surface
   * — somebody is already waiting on this patient — and client-gating those is
   * this codebase's most repeated failure (COS-1019 Health Plans, COS-856 tabs,
   * find-people.* itself). ReceivedInvitations.tsx is ungated for the same reason,
   * and a test pins that it stays so.
   */
  const canShow = useCanShowScreen();
  const canFind = canShow('find-people');

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
        {/*
          COS-1236 — two icons, and they must not read as one thing twice.

          Vishal: "rather than this big input box we should have some logical
          icon next to this plus icon where we show this Find people." The big
          bordered row that used to sit under the banner is gone; this is it.

          GLYPH. `group-add` rather than `person-search`: the button beside it is
          already a single silhouette with a plus, and at 18pt on the audience
          this app has — largely 60+, partly visually impaired — two
          one-person outlines side by side are the same picture twice.
          `group-add` is a different shape at a glance and says what the thing
          does, add someone to the circle. `person-search` is also already the
          Find people MODE glyph inside SocialPanel, so spending it here would
          name two different destinations with one icon. Neither is a pencil, a
          paper plane or a speech bubble, so neither can be mistaken for a
          second "send a message".
        */}
        <View style={styles.headerActions}>
          {canFind && (
            <>
              <Pressable
                onPress={() => router.push('/Home/find-people?returnTo=inbox' as never)}
                accessibilityRole="button"
                accessibilityLabel="Find people to message"
                style={[styles.newBtn, { borderColor: colors.border }]}
              >
                <MaterialIcons name="person-add" size={getScaledFontSize(18)} color={colors.tint} />
              </Pressable>
              <Pressable
                onPress={() => {
                  /*
                    COS-1236 — land IN the form, not merely on the tab.

                    Vishal: "it is opening the support modal and going to the
                    social tab, but it should also open that form where we are
                    entering this email invitation." The form is a mode of
                    SocialPanel, which takes no props and cannot read route
                    params, so the intent is left in lib/social-nav for the panel
                    to pick up as it mounts.
                  */
                  requestInviteSheet();
                  router.push('/modal?tab=social' as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="Invite someone by email"
                accessibilityHint="Opens a form to send one email invitation to someone who is not here yet"
                style={[styles.newBtn, { borderColor: colors.border }]}
              >
                <MaterialIcons name="group-add" size={getScaledFontSize(18)} color={colors.tint} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {pendingCount > 0 && (
        <Pressable
          onPress={() => router.push('/Home/connection-requests?returnTo=inbox' as never)}
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
                  : canFind
                    ? 'No conversations yet. Use the buttons above to find someone or invite them by email.'
                    // COS-1237 — both header buttons are gated on `find-people`. Naming
                    // an action the reader cannot see is worse than naming none.
                    : 'No conversations yet.'}
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
  // COS-1236 — a 44pt target, which neither of these had: 18pt of glyph in 8pt
  // of padding is 34. Vishal's audience is largely 60+ and this is the row they
  // tap to reach the whole feature.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  newBtn: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
