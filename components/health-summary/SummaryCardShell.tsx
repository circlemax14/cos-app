import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

// LayoutAnimation is opt-in on Android; enable once at module load so the
// expand/collapse transition works there too.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type SummaryCardShellProps = {
  /** Header title. Wraps to at most 2 lines. */
  title: string;
  /** MaterialIcons glyph name shown in the accent-tinted chip. */
  icon: keyof typeof MaterialIcons.glyphMap;
  /** 7-char hex (#RRGGBB). Non-7-char values render without alpha tint. */
  accentColor: string;
  /**
   * Optional at-a-glance summary shown next to the caret while collapsed
   * (e.g. "3 conditions", "2 flagged"). Keeps the collapsed grid scannable
   * without expanding every card.
   */
  preview?: string;
  /** Body content shown when expanded and `isEmpty` is false. */
  children?: React.ReactNode;
  /** When true, `emptyState` renders in place of `children`. */
  isEmpty?: boolean;
  /** Usually <EmptyStateHint text="…" />. */
  emptyState?: React.ReactNode;
  /** Whether the card is expanded on first render. Defaults to false. */
  initiallyExpanded?: boolean;
  /**
   * Optional at-a-glance badge/chip rendered in the header on the right side,
   * between the title and the caret. Always visible (regardless of expanded
   * state). Callers own their own show/hide gating.
   */
  titleBadge?: React.ReactNode;
  /**
   * Optional accessibility label appended to the header Pressable's own
   * accessibilityLabel so VoiceOver reads the badge contents. iOS VoiceOver
   * ignores nested accessibilityLabels under a focusable parent, so the
   * badge's own View label is otherwise swallowed.
   */
  badgeAccessibilityLabel?: string;
  testID?: string;
};

// Append a 2-char alpha suffix to a 7-char hex color (e.g. '#7B3FE4' + '1A').
// Guards against short/invalid values so a mis-typed accent doesn't crash.
const alpha = (hex: string, hh: string): string =>
  hex?.length === 7 ? `${hex}${hh}` : hex;

function elevation(level: number): ViewStyle {
  return (Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.06 * level,
      shadowRadius: 4 * level,
      shadowOffset: { width: 0, height: level },
    },
    android: { elevation: level },
    default: {},
  }) ?? {}) as ViewStyle;
}

function SummaryCardShell({
  title,
  icon,
  accentColor,
  preview,
  children,
  isEmpty,
  emptyState,
  initiallyExpanded = false,
  titleBadge,
  badgeAccessibilityLabel,
  testID,
}: SummaryCardShellProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [expanded, setExpanded] = useState<boolean>(initiallyExpanded);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  }, []);

  const a11yLabel = [title, preview, badgeAccessibilityLabel]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        elevation(1),
      ]}
    >
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={a11yLabel}
        accessibilityHint={expanded ? 'Double tap to collapse' : 'Double tap to expand'}
        hitSlop={8}
      >
        <View
          style={[
            styles.iconChip,
            { backgroundColor: alpha(accentColor, '1A') },
          ]}
        >
          <MaterialIcons
            name={icon}
            size={getScaledFontSize(20)}
            color={accentColor}
          />
        </View>

        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            },
          ]}
        >
          {title}
        </Text>

        {titleBadge ? <View style={styles.titleBadge}>{titleBadge}</View> : null}

        {!expanded && preview ? (
          <Text
            numberOfLines={1}
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
              marginRight: 4,
              maxWidth: 140,
            }}
          >
            {preview}
          </Text>
        ) : null}

        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(22)}
          color={colors.subtext}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>{isEmpty ? emptyState : children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
  body: {
    marginTop: Spacing.md,
  },
  titleBadge: {
    marginLeft: 4,
  },
});

export default SummaryCardShell;
