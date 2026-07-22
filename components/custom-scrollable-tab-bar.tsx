import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccessibility } from '@/stores/accessibility-store';

/**
 * Short one-word label per tab route. Kept in-file (small map) so we
 * don't reach into descriptors.options.title for the display label —
 * some titles are multi-word ("Health Summary") and would wrap or
 * ellipsize awkwardly on small iPhones. Values chosen to fit ~5 tabs
 * within a 320pt iPhone SE row at 10pt scale without clashing.
 */
const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  appointments: 'Calendar',
  'health-plan': 'Care',
  'unified-plan': 'Care',
  plan: 'Summary',
  reports: 'Reports',
};

export function CustomScrollableTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { getScaledFontSize } = useAccessibility();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const handleContentLayout = (event: LayoutChangeEvent) => {
    setContentWidth(event.nativeEvent.layout.width);
  };

  const shouldDistributeEvenly = containerWidth > 0 && contentWidth > 0 && contentWidth <= containerWidth;

  // Filter out routes that should be hidden
  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];

    // Check local Expo href option
    const href = (options as any).href;
    if (href === null) {
      return false;
    }

    // Check standard tabBarItemStyle display none
    // Cast to any because tabBarItemStyle type might be generic
    const itemStyle = (options as any).tabBarItemStyle;
    if (itemStyle && itemStyle.display === 'none') {
      return false;
    }

    // Also hide specific routes explicitly as a fallback
    // ... existing blacklist ...
    if (route.name === 'today-schedule' || route.name === 'profile' || route.name === 'connected-ehrs' || route.name === 'emergency-contact' || route.name === 'health-details' || route.name === 'doctor-detail' || route.name === 'proxy-management' || route.name === 'services' || route.name === 'bps-progress') {
      return false;
    }
    return true;
  });

  const renderTab = (route: BottomTabBarProps['state']['routes'][number], index: number) => {
    const { options } = descriptors[route.key];
    // Display label: pull from TAB_LABELS first (short one-word forms that
    // fit 5 tabs on iPhone SE without clashing). Fall back to options.title
    // for any route not in the map. Kept separate from
    // accessibilityLabel — VoiceOver still reads the full route title.
    const displayLabel: string =
      TAB_LABELS[route.name] ??
      (typeof options.tabBarLabel === 'string'
        ? options.tabBarLabel
        : typeof options.title === 'string'
        ? options.title
        : route.name);

    // Check if this route is focused by comparing with the current route key
    const isFocused = state.routes[state.index]?.key === route.key;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }

      // Haptic feedback
      if (process.env.EXPO_OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };

    const onLongPress = () => {
      navigation.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    };

    // Get icon from options. The elevated 46pt round pill covers the
    // currently-visible Care Plan tab under either default (legacy
    // health-plan) or the future-flipped unified-plan variant, so the
    // slot stays visually distinct regardless of which one is active.
    const isHealthPlan = route.name === 'health-plan' || route.name === 'unified-plan';
    const iconColor = isHealthPlan
      ? (isFocused ? '#FFFFFF' : '#008080')
      : (isFocused ? '#008080' : '#000000');
    const icon = options.tabBarIcon
      ? options.tabBarIcon({
        focused: isFocused,
        color: iconColor,
        size: getScaledFontSize(isHealthPlan ? 26 : 24),
      })
      : null;

    return (
      <PlatformPressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        // CHUNK 54 a11y nit fix: fall back to the route's full options.title
        // (e.g. "Health Summary") so VoiceOver disambiguates between short
        // labels like "Care" vs "Summary" that sighted users see; the
        // consumer of options.tabBarAccessibilityLabel still takes
        // precedence if a specific screen sets one.
        accessibilityLabel={
          options.tabBarAccessibilityLabel ??
          (typeof options.title === 'string' ? options.title : route.name)
        }
        testID={(options as any).tabBarTestID}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[
          styles.tabButton,
          {
            // Icon + label tabs: tighter vertical padding so the label
            // row fits above the safe-area inset without pushing icons
            // toward the top of the bar. These values scale with the
            // accessibility text size so icons + labels grow together
            // with the patient's chosen scale. When the total content
            // exceeds the container, ScrollView kicks in and the row
            // becomes horizontally scrollable.
            // minWidth is 60px so the 46px elevated Health Plan pill
            // clears its 8px side-padding without clipping.
            paddingHorizontal: getScaledFontSize(6),
            paddingVertical: getScaledFontSize(6),
            minWidth: getScaledFontSize(60),
          },
          shouldDistributeEvenly && styles.tabButtonDistributed
        ]}>
        <View style={styles.tabContent}>
          {icon && (
            isHealthPlan ? (
              <View style={[
                styles.healthPlanHighlight,
                {
                  backgroundColor: isFocused ? '#008080' : 'rgba(0,128,128,0.10)',
                  borderColor: isFocused ? 'transparent' : 'rgba(0,128,128,0.25)',
                  shadowOpacity: isFocused ? 0.25 : 0,
                },
              ]}>
                {icon}
              </View>
            ) : (
              // CHUNK 54 adversarial-verify major fix: pin every non-Care
              // icon inside a 46pt-tall slot so all label baselines share a
              // row across the tab bar. Without this, non-Care columns
              // shrink to their ~24pt icon height and their labels land
              // ~11pt higher than Care's, which pushes label baselines out
              // of alignment ("labels clashing" per Ken's brief). Matches
              // the healthPlanHighlight's 46pt size to keep icons
              // vertically centered in each shared-height slot.
              <View style={[styles.iconContainer, styles.iconSlot]}>{icon}</View>
            )
          )}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling
            maxFontSizeMultiplier={1.4}
            style={[
              styles.tabLabel,
              {
                // 10pt base scales with accessibility multiplier but is capped
                // above (maxFontSizeMultiplier=1.4) so 5 tabs still fit an
                // iPhone SE row without ellipsizing.
                fontSize: getScaledFontSize(10),
                color: isFocused ? '#008080' : '#4B5563',
                fontWeight: isFocused ? '700' : '500',
              },
            ]}
          >
            {displayLabel}
          </Text>
        </View>
      </PlatformPressable>
    );
  };

  return (
    <View
      style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}
      onLayout={handleContainerLayout}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          shouldDistributeEvenly && styles.scrollContentDistributed
        ]}
        style={styles.scrollView}
        bounces={false}
        scrollEnabled={!shouldDistributeEvenly}>
        <View
          style={[
            styles.tabsContainer,
            shouldDistributeEvenly && styles.tabsContainerDistributed
          ]}
          onLayout={handleContentLayout}>
          {visibleRoutes.map((route, index) => renderTab(route, index))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    flexGrow: 0,
  },
  scrollContentDistributed: {
    flexGrow: 1,
    width: '100%',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsContainerDistributed: {
    width: '100%',
    justifyContent: 'space-around',
  },
  tabButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonDistributed: {
    paddingHorizontal: 4,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // CHUNK 54 adversarial-verify major fix (label baseline alignment).
  // Fixed 46pt height so every non-Care icon slot matches the Care Plan
  // elevated pill's dimensions; labels below now share one row across
  // the tab bar regardless of icon size. See renderTab comment.
  iconSlot: {
    height: 46,
    width: 46,
  },
  tabLabel: {
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  healthPlanHighlight: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#008080',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 4,
  },
});

