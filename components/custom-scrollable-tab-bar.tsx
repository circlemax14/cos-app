import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccessibility } from '@/stores/accessibility-store';

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
    if (route.name === 'today-schedule' || route.name === 'profile' || route.name === 'connected-ehrs' || route.name === 'emergency-contact' || route.name === 'health-details' || route.name === 'doctor-detail' || route.name === 'proxy-management' || route.name === 'services') {
      return false;
    }
    return true;
  });

  const renderTab = (route: BottomTabBarProps['state']['routes'][number], index: number) => {
    const { options } = descriptors[route.key];
    const label = options.tabBarLabel !== undefined
      ? options.tabBarLabel
      : options.title !== undefined
        ? options.title
        : route.name;

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

    // Get icon from options
    const iconColor = isFocused ? '#008080' : '#000000';
    const icon = options.tabBarIcon
      ? options.tabBarIcon({
        focused: isFocused,
        color: iconColor,
        size: getScaledFontSize(24),
      })
      : null;

    return (
      <PlatformPressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        testID={(options as any).tabBarTestID}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[
          styles.tabButton,
          {
            paddingHorizontal: getScaledFontSize(16),
            minWidth: getScaledFontSize(80),
          },
          shouldDistributeEvenly && styles.tabButtonDistributed
        ]}>
        <View style={styles.tabContent}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[
              styles.tabLabel,
              {
                fontSize: getScaledFontSize(12),
                color: isFocused ? '#008080' : '#000000',
              },
            ]}>
            {label as string}
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
    paddingHorizontal: 8,
  },
  tabsContainerDistributed: {
    width: '100%',
    justifyContent: 'space-around',
  },
  tabButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonDistributed: {
    paddingHorizontal: 8,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontWeight: '500',
    color: '#000000', // Sharp black color
  },
});

