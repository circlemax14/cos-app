/**
 * One support request, in full — COS-882.
 *
 * Vishal: "i can see my request in app but i am not able to click on it to see
 * replies or functionality to send new messages."
 *
 * The rows in "Your requests" on app/Home/support.tsx were plain <View>s. The
 * thread existed, staff notes were already landing in it (ticket.routes.ts
 * afterStatusChange → appendTicketMessage with authorKind 'staff'), and the
 * patient reply endpoint had shipped — there was simply nowhere to go. This is
 * where the rows go:
 *
 *   router.push({ pathname: '/Home/support-ticket-detail',
 *                 params: { ticketId: ticket.ticketId } } as never)
 *
 * WHAT IT SHOWS, in the order a patient asks for it:
 *   1. the reference they would read down the phone, and the status in words
 *   2. when they raised it and who has it
 *   3. what they originally wrote, and what they attached
 *   4. the thread, patient and support told apart
 *   5. a box to reply
 *
 * TERMINAL TICKETS ARE NOT A DEAD BOX. appendTicketMessage applies no status
 * guard, so the server stores a reply on a resolved / rejected / closed ticket
 * exactly like any other. Disabling the composer would be lying about the API;
 * hiding the state would be lying about the ticket. So the composer stays live
 * and the screen says plainly that the request is finished — which is the one
 * thing a patient typing into a closed ticket needs to know.
 *
 * iOS 26.5 envelope: View / Text / Pressable / ScrollView / TextInput /
 * KeyboardAvoidingView / MaterialIcons / StyleSheet. No ActivityIndicator, no
 * Animated, no wrapper components.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useCanRender } from '@/hooks/use-entitlement';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSupportTicket, useReplyToSupportTicket } from '@/hooks/use-support-tickets';
import {
  formatBytes,
  ticketStatusLabel,
  ticketStatusTone,
  type TicketStatusTone,
} from '@/lib/support-attachments';
import type { SupportTicketMessage } from '@/services/api/support';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** Same buckets as the list on app/Home/support.tsx, so one ticket does not
 *  change colour between the row and the screen it opens. */
const TONE_COLORS: Record<TicketStatusTone, { bg: string; text: string }> = {
  waiting: { bg: '#FEF3C7', text: '#92400E' },
  active: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
  stopped: { bg: '#FEE2E2', text: '#991B1B' },
};

/** The server caps a reply at 4000 characters (support-tickets.routes.ts).
 *  Enforced here too, so the patient learns before the round trip. */
const MAX_REPLY_LENGTH = 4000;

function formatWhen(iso?: string, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** Plain language for the two routing targets. The patient chose one of these
 *  words on the way in, so they read back the same way. */
function routedToLabel(routedTo?: string): string {
  return routedTo === 'AGENCY' ? 'Your care agency' : 'Circle Support Health';
}

export default function SupportTicketDetailScreen(): React.JSX.Element {
  // `id` is accepted too. It is what the caller sent for COS-886 and it is the
  // spelling any older deep link or dashboard-issued URL will carry; reading
  // both costs nothing and the alternative is this screen's blank "could not
  // open this request" a second time.
  const params = useLocalSearchParams<{ ticketId?: string; id?: string }>();
  const ticketId = String(params.ticketId ?? params.id ?? '');
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const fs = getScaledFontSize;
  const fw = getScaledFontWeight;

  // Same two keys the support screen uses. A NEW key would be denied for every
  // patient the moment a real entitlement array arrives (hooks/use-entitlement
  // — "every key not in it is DENIED"), which would hide this screen from the
  // people it was built for.
  const canViewScreen = useCanRender('support.view');
  const canReply = useCanRender('support.contact-support');

  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState('');

  const { data: ticket, isLoading, isError } = useSupportTicket(ticketId);
  const reply = useReplyToSupportTicket(ticketId);

  // Oldest first, so the newest reply is the last thing read. Do NOT trust the
  // stored order — the trends carousel learned that one the hard way.
  const messages: SupportTicketMessage[] = useMemo(
    () =>
      [...(ticket?.messages ?? [])].sort((a, b) =>
        (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      ),
    [ticket?.messages],
  );

  const statusLabel = ticketStatusLabel(ticket?.status);
  const tone = ticketStatusTone(ticket?.status);
  // Completed, Closed and Rejected. Derived from the tone rather than a second
  // list of status strings, so a status the dashboard adds later still lands
  // on the right side of this line.
  const isFinished = !!ticket && (tone === 'done' || tone === 'stopped');

  const handleSend = useCallback(async () => {
    const text = replyText.trim();
    if (!text) {
      setReplyError('Type a message before sending.');
      return;
    }
    if (text.length > MAX_REPLY_LENGTH) {
      setReplyError(`That message is too long. Please keep it under ${MAX_REPLY_LENGTH} characters.`);
      return;
    }
    setReplyError('');
    try {
      await reply.mutateAsync(text);
      setReplyText('');
    } catch {
      // Never log the caught error: an axios error carries the request body,
      // and the body is patient-authored ticket text.
      setReplyError('We could not send that message. Please try again.');
    }
  }, [replyText, reply]);

  const attachments = ticket?.attachments ?? [];
  const toneColors = TONE_COLORS[tone];

  const sectionLabel = (t: string) => (
    <Text
      style={{
        color: colors.subtext,
        fontSize: fs(11),
        fontWeight: fw(700) as never,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginTop: 22,
        marginBottom: 8,
      }}
    >
      {t}
    </Text>
  );

  return (
    <AppWrapper>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable
              /*
               * COS-886 — back goes to Help & Support, not Home.
               *
               * These screens live in a Tabs navigator, and TabRouter defaults
               * to `backBehavior: 'firstRoute'` (@react-navigation/routers).
               * GO_BACK there does not mean "the screen I came from" — it means
               * the navigator's FIRST route, which is `index`. So router.back()
               * landed on Home. Vishal: "when I click on the back icon on the
               * your request, it is taking me to home screen. Ideally, it
               * should take me to the help and support screen."
               *
               * navigate(), not push(): support.tsx is already mounted behind
               * this screen, so pushing it again would stack a second copy.
               */
              onPress={() => router.navigate('/Home/support' as never)}
              accessibilityRole="button"
              accessibilityLabel="Go back to your requests"
              hitSlop={12}
              style={styles.back}
            >
              <MaterialIcons name="arrow-back" size={fs(24)} color={colors.text as string} />
            </Pressable>
            <Text
              numberOfLines={2}
              accessibilityRole="header"
              style={{ flex: 1, color: colors.text, fontSize: fs(22), fontWeight: fw(700) as never }}
            >
              {ticket?.reference || 'Your request'}
            </Text>
          </View>

          {canViewScreen && isLoading && (
            <Text style={{ color: colors.subtext, fontSize: fs(13), marginTop: 20 }}>
              Loading your request…
            </Text>
          )}

          {canViewScreen && !isLoading && (isError || !ticket) && (
            <Text
              style={{ color: colors.subtext, fontSize: fs(13), marginTop: 20, lineHeight: 20 }}
              accessibilityRole="alert"
            >
              We could not open this request. Go back and try again — if it keeps happening, the
              request may have been removed.
            </Text>
          )}

          {canViewScreen && !isLoading && !!ticket && (
            <View>
              {/* Status, in words, with the reference already in the header. */}
              <View style={styles.statusRow}>
                <View style={[styles.statusPill, { backgroundColor: toneColors.bg }]}>
                  <Text
                    style={{
                      color: toneColors.text,
                      fontSize: fs(12),
                      fontWeight: fw(600) as never,
                    }}
                    accessibilityLabel={`Status: ${statusLabel}`}
                  >
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.card,
                  { borderColor: colors.border, backgroundColor: colors.card as string },
                ]}
              >
                <Text style={{ color: colors.subtext, fontSize: fs(12), marginBottom: 4 }}>
                  Raised {formatWhen(ticket.createdAt)}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: fs(12) }}>
                  Sent to {routedToLabel(ticket.routedTo)}
                </Text>
              </View>

              {sectionLabel('What you sent')}
              <View
                style={[
                  styles.card,
                  { borderColor: colors.border, backgroundColor: colors.card as string },
                ]}
              >
                {!!ticket.subject && (
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fs(15),
                      fontWeight: fw(700) as never,
                      marginBottom: 6,
                    }}
                  >
                    {ticket.subject}
                  </Text>
                )}
                <Text
                  style={{ color: colors.text, fontSize: fs(14), lineHeight: Math.round(fs(14) * 1.5) }}
                >
                  {ticket.description}
                </Text>
              </View>

              {/* Attachments are listed, not opened: there is no read endpoint
                  that hands back a viewable URL for a ticket attachment yet. A
                  tappable row that does nothing is the bug this whole screen
                  exists to fix, so nothing here is tappable. */}
              {attachments.length > 0 && (
                <View>
                  {sectionLabel('Attachments')}
                  <View
                    style={[
                      styles.card,
                      { borderColor: colors.border, backgroundColor: colors.card as string },
                    ]}
                  >
                    {attachments.map((file, i) => (
                      <View
                        key={file.key || file.url || `${file.name}-${i}`}
                        style={[
                          styles.attachmentRow,
                          i > 0
                            ? { borderTopWidth: 1, borderTopColor: colors.border as string }
                            : null,
                        ]}
                        accessibilityLabel={`${file.name}, ${formatBytes(file.size)}`}
                      >
                        <Text
                          numberOfLines={1}
                          style={{ flex: 1, color: colors.text, fontSize: fs(13) }}
                        >
                          {file.name}
                        </Text>
                        <Text
                          style={{ color: colors.subtext, fontSize: fs(12), marginLeft: 8 }}
                        >
                          {formatBytes(file.size)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {sectionLabel('Messages')}

              {messages.length === 0 && (
                <Text
                  style={{ color: colors.subtext, fontSize: fs(13), lineHeight: 20, marginBottom: 4 }}
                >
                  No replies yet. When our team responds, their message will appear here.
                </Text>
              )}

              {/* ponytail: no auto-scroll to the newest message. Threads run to
                  dozens of messages, not thousands; add a ScrollView ref and
                  scrollToEnd if a real thread ever outgrows one flick. */}
              {messages.map((message) => {
                const fromPatient = message.authorKind === 'patient';
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.message,
                      {
                        borderColor: colors.border,
                        backgroundColor: fromPatient
                          ? (colors.card as string)
                          : ((colors.tint as string) + '1A'),
                        alignSelf: fromPatient ? 'flex-end' : 'flex-start',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: fs(11),
                        fontWeight: fw(700) as never,
                        marginBottom: 4,
                      }}
                    >
                      {fromPatient ? 'You' : message.authorLabel || 'Support'} ·{' '}
                      {formatWhen(message.createdAt, true)}
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: fs(14),
                        lineHeight: Math.round(fs(14) * 1.5),
                      }}
                    >
                      {message.text}
                    </Text>
                  </View>
                );
              })}

              {/* The one thing a patient typing into a finished ticket needs to
                  know. The composer below stays live because the server really
                  does accept the reply — it just will not reopen anything. */}
              {isFinished && (
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: fs(12),
                    lineHeight: 18,
                    marginTop: 16,
                  }}
                >
                  This request is marked {statusLabel.toLowerCase()}. You can still add a message
                  and our team will see it on the request, but it will not reopen — if you need
                  help with something new, please raise a new request.
                </Text>
              )}

              {canReply && (
                <View>
                  {sectionLabel('Reply')}
                  <TextInput
                    style={{
                      color: colors.text,
                      fontSize: fs(15),
                      lineHeight: Math.round(fs(15) * 1.4),
                      borderWidth: 1.5,
                      borderRadius: 12,
                      padding: 14,
                      minHeight: Math.max(100, fs(15) * 6),
                      borderColor: replyError ? '#DC2626' : (colors.border as string),
                      backgroundColor: replyError
                        ? '#FEF2F2'
                        : settings.isDarkTheme
                          ? (colors.card as string)
                          : '#F9FAFB',
                    }}
                    placeholder="Add a message to this request…"
                    placeholderTextColor={colors.subtext as string}
                    value={replyText}
                    onChangeText={(text) => {
                      setReplyText(text);
                      if (replyError) setReplyError('');
                    }}
                    multiline
                    maxLength={MAX_REPLY_LENGTH}
                    editable={!reply.isPending}
                    textAlignVertical="top"
                    accessibilityLabel="Add a message to this request"
                  />

                  {/* COS-889 — the same counter the compose screen shows, for
                      the same reason: maxLength stops the typing, and on its
                      own the keyboard just goes dead with no explanation.
                      Error left, count right, one row. */}
                  <View style={styles.counterRow}>
                    <Text
                      style={{ color: '#DC2626', fontSize: fs(12), flex: 1, marginRight: 8 }}
                      accessibilityRole={replyError ? 'alert' : undefined}
                    >
                      {replyError}
                    </Text>
                    <Text
                      style={{
                        color:
                          replyText.length >= MAX_REPLY_LENGTH
                            ? '#DC2626'
                            : (colors.subtext as string),
                        fontSize: fs(12),
                      }}
                      accessibilityLabel={
                        replyText.length >= MAX_REPLY_LENGTH
                          ? 'Character limit reached'
                          : `${MAX_REPLY_LENGTH - replyText.length} characters remaining`
                      }
                    >
                      {replyText.length >= MAX_REPLY_LENGTH
                        ? 'Character limit reached'
                        : `${(MAX_REPLY_LENGTH - replyText.length).toLocaleString()} characters left`}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleSend}
                    disabled={reply.isPending || replyText.trim().length === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    accessibilityState={{
                      disabled: reply.isPending || replyText.trim().length === 0,
                    }}
                    style={{
                      backgroundColor:
                        reply.isPending || replyText.trim().length === 0
                          ? (colors.disabled as string)
                          : (colors.tint as string),
                      borderRadius: 24,
                      minHeight: Math.max(48, fs(15) + 28),
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      marginTop: 12,
                    }}
                  >
                    <Text
                      style={{ color: '#FFFFFF', fontSize: fs(15), fontWeight: fw(600) as never }}
                    >
                      {reply.isPending ? 'Sending…' : 'Send message'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  counterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 6,
    marginHorizontal: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  message: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    maxWidth: '92%',
  },
});
