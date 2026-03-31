import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getColors } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useSettings } from '@/stores/settings-store';
import { useInactivityTimeout } from '@/hooks/use-inactivity-timeout';

export default function TabLayout() {
  const { settings: accessibilitySettings, getScaledFontSize } = useAccessibility();
  const { data: permissions } = useFeaturePermissions();
  const { settings } = useSettings();
  const { panHandlers } = useInactivityTimeout();
  const colors = getColors(accessibilitySettings.isDarkTheme);

  // Default to true (visible) while permissions are loading
  const canShow = (featureKey: string) => permissions?.[featureKey as keyof typeof permissions]?.enabled ?? true;

  return (
    <View style={{ flex: 1 }} {...panHandlers}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
      }}>
      {canShow('home') && (
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={getScaledFontSize(24)} name="house.fill" color={color} />
            ),
          }}
        />
      )}
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          href: null,
        }}
      />
      {canShow('appointments') && (
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Visits',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={getScaledFontSize(24)} name="calendar" color={color} />
            ),
          }}
        />
      )}
      <Tabs.Screen
        name="health-chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
          href: settings.isHealthChatEnabled ? undefined : null,
          tabBarItemStyle: !settings.isHealthChatEnabled ? { display: 'none' } : undefined
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
          href: !settings.isHealthChatEnabled ? undefined : null,
          tabBarItemStyle: settings.isHealthChatEnabled ? { display: 'none' } : undefined
        }}
      />
      {canShow('reports') && (
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            href: null,
            headerShown: false,
          }}
        />
      )}
      <Tabs.Screen
        name="today-schedule"
        options={{
          title: "Today's Schedule",
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="person.crop.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="connected-ehrs"
        options={{
          title: 'Connected EHRs',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="emergency-contact"
        options={{
          title: 'Emergency Contact',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="health-details"
        options={{
          title: 'Health Details',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="doctor-detail"
        options={{
          title: 'Doctor Detail',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="proxy-management"
        options={{
          title: 'Proxy Management',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="non-ehr-provider-detail"
        options={{
          title: 'Provider Detail',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="integrative-screen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="connect-clinics"
        options={{
          title: 'Connect Clinics',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="appointment-detail"
        options={{
          title: 'Appointment Detail',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="allergies"
        options={{
          title: 'Allergies',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="agency-detail"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
    </View>
  );
}
