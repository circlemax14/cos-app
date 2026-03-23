import { useAccessibility } from '@/stores/accessibility-store';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Card, Switch, Text } from 'react-native-paper';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface DoctorCardProps {
  id: string;
  name: string;
  qualifications: string;
  image: number | { uri: string } | null;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  highlighted?: boolean;
  actionIconName?: string;
  actionDisabled?: boolean;
  onActionPress?: () => void;
  actionColor?: string;
}

export function DoctorCard({
  id,
  name,
  qualifications,
  image,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  onPress,
  highlighted = false,
  actionIconName,
  actionDisabled = false,
  onActionPress,
  actionColor = '#008080',
}: DoctorCardProps) {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();

  const dynamicPadding = getScaledFontSize(16);
  const avatarSize = getScaledFontSize(48);
  const cardMargin = getScaledFontSize(12);

  return (
    <Card style={[styles.card, highlighted ? styles.cardHighlighted : null, { marginBottom: cardMargin }]} onPress={onPress}>
      <Card.Content style={[styles.cardContent, { padding: dynamicPadding }]}>
        <View style={styles.contentRow}>
          {image ? (
            <Avatar.Image
              size={avatarSize}
              source={image}
              style={[styles.avatar, { marginRight: dynamicPadding }]}
            />
          ) : (
            <InitialsAvatar
              name={name}
              size={avatarSize}
              style={[styles.avatar, { marginRight: dynamicPadding }]}
            />
          )}
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
          </View>
          {actionIconName && (
            <TouchableOpacity
              style={[styles.actionButton, actionDisabled ? styles.actionButtonDisabled : null]}
              onPress={(event) => {
                event?.stopPropagation?.();
                if (!actionDisabled) {
                  onActionPress?.();
                }
              }}
              disabled={actionDisabled}
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
