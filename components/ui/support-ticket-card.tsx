import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AccessibleCard } from './accessible-card';
import { StatusBadge } from './status-badge';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';
import type { SupportTicket } from '@/services/api/support';

interface SupportTicketCardProps {
  ticket: SupportTicket;
  onPress?: () => void;
}

export function SupportTicketCard({ ticket, onPress }: SupportTicketCardProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const formattedDate = new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <AccessibleCard
      accessibilityLabel={`Ticket ${ticket.ticketId}, ${ticket.subject}, status ${ticket.status}, created ${formattedDate}`}
      onPress={onPress}
      showChevron={!!onPress}
    >
      <View style={styles.header}>
        <Text style={[styles.ticketId, { color: colors.secondary, fontSize: getScaledFontSize(Typography.footnote.fontSize), fontWeight: getScaledFontWeight(600) as never }]}>
          {ticket.ticketId}
        </Text>
        <StatusBadge status={ticket.status} type="support" />
      </View>
      <Text style={[styles.subject, { color: colors.text, fontSize: getScaledFontSize(Typography.headline.fontSize), fontWeight: getScaledFontWeight(600) as never }]}>
        {ticket.subject}
      </Text>
      <Text style={[styles.date, { color: colors.secondary, fontSize: getScaledFontSize(Typography.footnote.fontSize) }]}>
        {formattedDate}
      </Text>
    </AccessibleCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  ticketId: {},
  subject: { marginBottom: Spacing.xs },
  date: {},
});
