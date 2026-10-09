/**
 * COS-1058 — one conversation.
 *
 * Text only. No attachment button, no camera, no voice — "the person can
 * communicate but cannot send or share any files" (Vishal, 2026-09-19). The
 * absence is the feature: a file picker here is the first way a patient's
 * records leave the app by accident.
 *
 * ─── HOW A NEW MESSAGE ARRIVES ───────────────────────────────────────
 *
 * The WebSocket frame carries conversationId/messageId/senderId and NO body,
 * so this screen refetches when one lands rather than rendering from the
 * frame. One extra round trip buys a design where message text never rides a
 * channel whose recipient is decided by a connection id.
 *
 * ─── PRIMITIVES ONLY ─────────────────────────────────────────────────
 *
 * No SVG, no Animated. KeyboardAvoidingView is the one addition, and it is
 * required: without it the composer sits under the keyboard on iOS and the
 * screen is unusable.
 *
 * COS-1268 adds Alert (the Block / Remove confirms) and nothing else: the ⋮
 * menu is an inline View and Report is a mode of this screen, not an overlay.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import {
  fetchMessages,
  sendMessage,
  markConversationRead,
  fetchMembers,
  blockUser,
  cancelConnection,
  type ConversationMessage,
} from '@/services/api/conversations';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUser } from '@/hooks/use-user';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { isSocialSafetyOn, otherMemberId, safetyErrorText } from '@/lib/social-safety';
import { ReportSheet } from '@/components/social/ReportSheet';

/*
 * COS-1058 — required on every leaf route, and enforced by a test.
 *
 * Without it a throw in this screen takes the WHOLE app down rather than one
 * tab. That guard caught all four of these screens on their first run, which
 * is exactly what it is for.
 */
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** Mirrors MAX_MESSAGE_LENGTH on the server; a longer body is rejected there. */
const MAX_LENGTH = 4000;

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const qc = useQueryClient();
  /*
   * Whose bubbles sit on the right. If this is null the layout still renders —
   * everything shows as received — so a slow profile load degrades to a
   * readable thread rather than a broken one.
   */
  const { data: user } = useUser();
  const me = user?.sub ?? null;

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesQ = useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
    enabled: conversationId.length > 0,
    staleTime: 10_000,
  });

  /*
   * Mark read on open, fire-and-forget. A failure here must not surface: the
   * patient came to read, and an error toast about a read receipt is noise
   * about something they did not ask for.
   */
  useEffect(() => {
    if (!conversationId) return;
    void markConversationRead(conversationId).catch(() => undefined);
  }, [conversationId]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, body),
    onSuccess: () => {
      setDraft('');
      setSendError(null);
      void qc.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      /*
       * The draft is deliberately NOT cleared on failure. The patient believes
       * they have said something; losing their words because the network
       * blinked is the worst outcome this screen can produce.
       */
      setSendError('Not sent. Check your connection and try again.');
    },
  });

  const onSend = useCallback(() => {
    const body = draft.trim();
    if (body.length === 0 || send.isPending) return;
    send.mutate(body);
  }, [draft, send]);

  /*
   * ─── COS-1268: BLOCK & REPORT ────────────────────────────────────────
   *
   * Gated on `=== true` from the flags response, never useIsFeatureFlagEnabled,
   * which says true while loading. Flag off ⇒ no members fetch, no menu, no
   * long-press: the screen renders exactly as before.
   */
  const { data: flags } = useFeatureFlags();
  const safetyOn = isSocialSafetyOn(flags);
  const membersQ = useQuery({
    queryKey: ['conversation-members', conversationId],
    queryFn: () => fetchMembers(conversationId),
    enabled: safetyOn && conversationId.length > 0,
    staleTime: 60_000,
  });
  /** Null until we know exactly one other person — then every safety action hides. */
  const other = safetyOn ? otherMemberId(membersQ.data, me) : null;

  const [menuOpen, setMenuOpen] = useState(false);
  /** null = the thread; { message: null } = reporting the person; else one message. */
  const [reporting, setReporting] = useState<{ message: { messageId: string; body: string } | null } | null>(null);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  // Tab screens stay mounted, so a half-open menu or report must not follow
  // the patient into the next conversation they open.
  useEffect(() => {
    setMenuOpen(false);
    setReporting(null);
    setSafetyError(null);
  }, [conversationId]);

  /*
   * After a block or a removal this conversation no longer exists for me. The
   * inbox is NAMED: router.back() in a Tabs navigator goes to Home (firstRoute).
   */
  const leave = useCallback(() => {
    setMenuOpen(false);
    setReporting(null);
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    void qc.invalidateQueries({ queryKey: ['connections'] });
    router.navigate('/Home/inbox' as never);
  }, [qc]);

  const block = useMutation({
    mutationFn: (userId: string) => blockUser(userId),
    onSuccess: leave,
    onError: (err) => setSafetyError(safetyErrorText(err)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => cancelConnection(userId),
    onSuccess: leave,
    onError: (err) => setSafetyError(safetyErrorText(err)),
  });

  const openReport = useCallback((message: { messageId: string; body: string } | null) => {
    setMenuOpen(false);
    setSafetyError(null);
    setReporting({ message });
  }, []);

  const confirmBlock = () => {
    if (!other) return;
    setMenuOpen(false);
    Alert.alert(
      'Block this person?',
      "They won't be told. They won't be able to message you or find you. You can unblock them any time in Social settings (the eye icon on the Social tab).",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => block.mutate(other) },
      ],
    );
  };

  const confirmRemove = () => {
    if (!other) return;
    setMenuOpen(false);
    Alert.alert(
      'Remove this connection?',
      'This conversation will close for both of you. Either of you can ask to connect again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(other) },
      ],
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: ConversationMessage }) => {
      const mine = item.senderId === me;
      const bubbleStyle = [
        styles.bubble,
        {
          backgroundColor: mine ? (colors.tint as string) : (colors.card as string),
          borderColor: colors.border,
        },
      ];
      const content = (
        <>
          <Text
            style={{
              color: mine ? '#FFFFFF' : colors.text,
              fontSize: getScaledFontSize(15),
              lineHeight: getScaledFontSize(21),
            }}
          >
            {item.body}
          </Text>
          <Text
            style={{
              color: mine ? 'rgba(255,255,255,0.75)' : colors.subtext,
              fontSize: getScaledFontSize(10),
              marginTop: 3,
              textAlign: 'right',
            }}
          >
            {new Date(item.createdAt).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </>
      );
      // COS-1268 — only the other person's messages, and only with the flag on
      // (`other` is null otherwise). Off, the bubble is the same plain View.
      const reportable = other !== null && !mine;
      const report = () => openReport({ messageId: item.messageId, body: item.body });
      return (
        <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
          {reportable ? (
            <Pressable
              style={bubbleStyle}
              onLongPress={report}
              accessibilityHint="Long press to report this message"
              accessibilityActions={[{ name: 'report', label: 'Report message' }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'report') report();
              }}
            >
              {content}
            </Pressable>
          ) : (
            <View style={bubbleStyle}>{content}</View>
          )}
        </View>
      );
    },
    [me, colors, getScaledFontSize, other, openReport],
  );

  const messages = messagesQ.data?.messages ?? [];

  return (
    <AppWrapper>
      <View style={[styles.header, { borderColor: colors.border }]}>
        {/* COS-1268 — named, not router.back(): in the Home Tabs navigator
            GO_BACK lands on the first route (Home), never the inbox. */}
        <Pressable
          onPress={() => router.navigate('/Home/inbox' as never)}
          accessibilityRole="button"
          accessibilityLabel="Back to inbox"
          hitSlop={10}
        >
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
          Conversation
        </Text>
        {other && !reporting && (
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            disabled={block.isPending || remove.isPending}
            accessibilityRole="button"
            accessibilityLabel="More options"
            accessibilityState={{ expanded: menuOpen, busy: block.isPending || remove.isPending }}
            hitSlop={10}
            style={{ marginLeft: 'auto', padding: 4 }}
          >
            <MaterialIcons name="more-vert" size={getScaledFontSize(22)} color={colors.text} />
          </Pressable>
        )}
      </View>

      {/* COS-1268 — the ⋮ menu, inline under the header like SocialPanel's
          visibility dropdown: no Portal, no Modal, identical on both platforms. */}
      {menuOpen && other && !reporting && (
        <View style={[styles.menu, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {(
            [
              { icon: 'flag', label: 'Report', onPress: () => openReport(null) },
              { icon: 'block', label: 'Block', onPress: confirmBlock },
              { icon: 'person-remove', label: 'Remove connection', onPress: confirmRemove },
            ] as const
          ).map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="menuitem"
              accessibilityLabel={a.label}
              style={styles.menuItem}
            >
              <MaterialIcons name={a.icon} size={getScaledFontSize(20)} color={colors.icon} />
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(15) }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {safetyError && !reporting && (
        <Text
          style={{ color: '#B91C1C', fontSize: getScaledFontSize(12), padding: Spacing.sm }}
          accessibilityLiveRegion="polite"
        >
          {safetyError}
        </Text>
      )}

      {/* COS-1241 — 'height' on Android, as COS-1031b did for the other chat:
          with edgeToEdgeEnabled the window no longer resizes for the keyboard,
          so `undefined` left the composer under it. iOS unchanged. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* COS-1268 — Report is a MODE: it takes the thread's place inside this
            KeyboardAvoidingView, so its comment box is never under the keyboard. */}
        {reporting ? (
          <ReportSheet
            conversationId={conversationId}
            message={reporting.message}
            onClose={() => setReporting(null)}
            onBlocked={leave}
          />
        ) : (
        <>
        <FlatList
          data={messages}
          keyExtractor={(m) => m.messageId}
          renderItem={renderItem}
          // Newest first from the server; inverted so the latest sits at the
          // bottom without reversing the array on every render.
          inverted
          contentContainerStyle={{ padding: Spacing.md, gap: 6 }}
          onEndReached={() => {
            const next = messagesQ.data?.nextCursor;
            if (next) void messagesQ.refetch();
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
                {messagesQ.isLoading
                  ? 'Loading…'
                  : messagesQ.isError
                    ? 'We could not load this conversation.'
                    : 'No messages yet. Say hello.'}
              </Text>
            </View>
          }
        />

        {sendError && (
          <Text
            style={{
              color: '#B91C1C',
              fontSize: getScaledFontSize(12),
              paddingHorizontal: Spacing.md,
              paddingBottom: 4,
            }}
          >
            {sendError}
          </Text>
        )}

        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.subtext as string}
            multiline
            maxLength={MAX_LENGTH}
            accessibilityLabel="Message"
            style={{
              flex: 1,
              color: colors.text,
              fontSize: getScaledFontSize(15),
              maxHeight: 120,
              paddingVertical: 6,
            }}
          />
          {/* No attachment control, by design — text only. */}
          <Pressable
            onPress={onSend}
            disabled={draft.trim().length === 0 || send.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={{ opacity: draft.trim().length === 0 || send.isPending ? 0.4 : 1, padding: 6 }}
          >
            <MaterialIcons name="send" size={getScaledFontSize(22)} color={colors.tint} />
          </Pressable>
        </View>
        </>
        )}
      </KeyboardAvoidingView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '78%', borderRadius: Radii.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  empty: { alignItems: 'center', paddingVertical: 60, transform: [{ scaleY: -1 }] },
  menu: { borderBottomWidth: 1, paddingHorizontal: Spacing.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
});
