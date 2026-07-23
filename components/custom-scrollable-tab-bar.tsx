import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccessibility } from '@/stores/accessibility-store';

/**
 * Display label per tab route. Ken 2026-07-22: prefers "Care Plan" and
 * "Health Summary" spelled out rather than the terser single-word forms
 * ("Care" / "Summary"). Multi-word labels wrap naturally to 2 lines
 * under the icon on small phones (see numberOfLines below) so they
 * stack cleanly instead of ellipsizing or pushing neighbors sideways.
 */
const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  appointments: 'Calendar',
  'health-plan': 'Care Plan',
  'unified-plan': 'Care Plan',
  plan: 'Health Summary',
  reports: 'Reports',
};

export function CustomScrollableTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { getScaledFontSize, settings } = useAccessibility();
  // CHUNK 73 — WCAG 1.4.4 (200% resize text) compliance.
  // When the user has NOT enabled the app-side accessibility toggle, honor
  // iOS Dynamic Type on the label (allowFontScaling=true) so low-vision
  // users get real system-level text scaling without having to discover
  // the in-app toggle first. When the app-side toggle IS on,
  // getScaledFontSize is already boosting via accessibilityMultiplier —
  // stacking iOS Dynamic Type on top would double-compound (potentially
  // ~2x on top of the 1.05×1.15 in-app cap), so we suppress OS scaling
  // in that branch. Either way, cap the effective OS multiplier at 1.4
  // so the tab bar can't overflow on iPhone SE at max Dynamic Type.
  const labelAllowFontScaling = !settings.isAccessibilityMode;
  const labelMaxFontSizeMultiplier = 1.4;
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
            numberOfLines={2}
            ellipsizeMode="tail"
            // CHUNK 73 — WCAG 1.4.4 compliance. When app-side accessibility
            // mode is OFF, defer to iOS Dynamic Type so low-vision users
            // get their OS-level scaling without needing to find the
            // in-app toggle. When it's ON, getScaledFontSize is already
            // applying the app's accessibilityMultiplier below — stacking
            // OS Dynamic Type on top would double-compound. Either branch
            // is capped by maxFontSizeMultiplier so the tab row can't
            // overflow on iPhone SE at max Dynamic Type.
            allowFontScaling={labelAllowFontScaling}
            maxFontSizeMultiplier={labelMaxFontSizeMultiplier}
            style={[
              styles.tabLabel,
              {
                // 10pt base scales with the app's accessibility multiplier
                // via getScaledFontSize. Two-word labels ("Care Plan",
                // "Health Summary") wrap at the space when the tab's
                // bounded width (flex:1 in distributed mode, see
                // tabButtonDistributed) forces the wrap. Single-word
                // labels ("Home", "Calendar", "Reports") stay on one line.
                fontSize: getScaledFontSize(10),
                // No lineHeight override — RN's natural leading gives the
                // font enough vertical room to avoid clipping ascenders,
                // and both single and two-line labels use the same
                // leading so baselines stay consistent.
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
    // Align tabs to the top so all icon slots (fixed 46pt) share the same
    // y-origin regardless of how many lines each label takes. Without
    // this, a tab whose label wraps to 2 lines grows taller than its
    // 1-line neighbors and 'alignItems: center' pushes the shorter tabs'
    // icons DOWN to re-center within the row — icons zig-zag across
    // the bar. Ken 2026-07-22 caught the equivalent regression when the
    // 46pt Care pill lifted its label baseline vs 24pt siblings.
    alignItems: 'flex-start',
  },
  tabsContainerDistributed: {
    width: '100%',
    justifyContent: 'space-around',
  },
  tabButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // In distributed mode (content fits container), each tab claims 1/N of
  // the available width so labels have a bounded column to wrap in. RN
  // Text won't wrap without a bounded ancestor width — minWidth alone
  // isn't enough because Text grows to natural width otherwise. flexBasis:0
  // + flexGrow:1 gives all 5 tabs an equal share of the container.
  tabButtonDistributed: {
    paddingHorizontal: 4,
    flexGrow: 1,
    flexBasis: 0,
  },
  tabContent: {
    // Take the tabButton's full width so Yoga propagates the flex:1
    // width constraint from tabButtonDistributed all the way down to the
    // Text. Without this the intermediate tabContent has no width bound
    // and RN Text keeps its natural single-line width, no-oping the
    // numberOfLines={2} wrap and pushing "Health Summary" wider than
    // neighboring tabs. Ken 2026-07-22 dogfood: the wrap must actually
    // fire on iPhone 14 (390pt) at default text scale for the row to
    // look coherent.
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
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

