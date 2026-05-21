import { useAccessibility } from '@/stores/accessibility-store';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card, Switch, Text } from 'react-native-paper';
import { EntityIcon } from '@/components/icons';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface DoctorCardProps {
  id: string;
  name: string;
  qualifications: string;
  image: number | { uri: string } | null;
  specialty?: string | null;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  highlighted?: boolean;
  actionIconName?: string;
  actionDisabled?: boolean;
  onActionPress?: () => void;
  actionColor?: string;
  /**
   * SCRUM-265 #6: when true, render the card as grey + non-tappable.
   * Used for providers without clinical records and for indirect-care
   * specialties (pharmacy, lab, imaging) that don't make sense as
   * Circle-of-Support entries but should still be visible in the
   * list so users know they're recognized.
   */
  inactive?: boolean;
  inactiveReason?: string;
}

export function DoctorCard({
  id,
  name,
  qualifications,
  image,
  specialty,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  onPress,
  highlighted = false,
  actionIconName,
  actionDisabled = false,
  onActionPress,
  actionColor = '#008080',
  inactive = false,
  inactiveReason,
}: DoctorCardProps) {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();

  const dynamicPadding = getScaledFontSize(16);
  const avatarSize = getScaledFontSize(48);
  const cardMargin = getScaledFontSize(12);

  // SCRUM-265 #6: inactive providers swallow the press and the action,
  // and visually fade. We still render them so users can see the card —
  // they just can't drill in or add to circle.
  const effectiveOnPress = inactive ? undefined : onPress;
  const effectiveOnActionPress = inactive ? undefined : onActionPress;
  const effectiveActionDisabled = inactive || actionDisabled;

  return (
    <Card style={[styles.card, highlighted ? styles.cardHighlighted : null, { marginBottom: cardMargin, opacity: inactive ? 0.55 : 1 }]} onPress={effectiveOnPress}>
      <Card.Content style={[styles.cardContent, { padding: dynamicPadding }]}>
        <View style={styles.contentRow}>
          <EntityIcon
            type="provider"
            specialty={specialty ?? undefined}
            imageUrl={image && typeof image === 'object' && 'uri' in image ? image.uri : null}
            name={name ?? 'Provider'}
            size={avatarSize}
            style={{ ...styles.avatar, marginRight: dynamicPadding }}
          />
          <View style={styles.textContainer}>
            <Text
              style={[
                styles.title,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: getScaledFontSize(4),
                }
              ]}
              numberOfLines={3}
            >
              {name}
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(500) as any,
                }
              ]}
              numberOfLines={3}
            >
              {qualifications}
            </Text>
            {inactive && inactiveReason ? (
              <Text
                style={{
                  fontSize: getScaledFontSize(10),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: '#9CA3AF',
                  marginTop: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
                numberOfLines={1}
              >
                {inactiveReason}
              </Text>
            ) : null}
          </View>
          {actionIconName && (
            <TouchableOpacity
              style={[styles.actionButton, effectiveActionDisabled ? styles.actionButtonDisabled : null]}
              onPress={(event) => {
                event?.stopPropagation?.();
                if (!effectiveActionDisabled) {
                  effectiveOnActionPress?.();
                }
              }}
              disabled={effectiveActionDisabled}
            >
              <IconSymbol name={actionIconName as any} size={getScaledFontSize(18)} color={actionColor} />
            </TouchableOpacity>
          )}
          {showSwitch && (
            <View style={[styles.switchContainer, { paddingLeft: dynamicPadding }]}>
              <Switch
                value={switchValue}
                onValueChange={onSwitchChange}
                color="#4CAF50"
              />
            </View>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHighlighted: {
    backgroundColor: '#00808015',
  },
  cardContent: {
    padding: 16,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    backgroundColor: 'transparent',
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    // Styles will be applied via inline styles for accessibility
  },
  subtitle: {
    // Styles will be applied via inline styles for accessibility
  },
  switchContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionButton: {
    marginLeft: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#008080',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
});
