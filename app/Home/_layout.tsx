import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { CustomScrollableTabBar } from '@/components/custom-scrollable-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useSettings } from '@/stores/settings-store';
import { useInactivityTimeout } from '@/hooks/use-inactivity-timeout';

export default function TabLayout() {
  const { getScaledFontSize } = useAccessibility();
  const { data: permissions } = useFeaturePermissions();
  const { settings } = useSettings();
  const { panHandlers } = useInactivityTimeout();

  // Default to true (visible) while permissions are loading
  const canShow = (featureKey: string) => permissions?.[featureKey as keyof typeof permissions]?.enabled ?? true;

  return (
    <View style={{ flex: 1 }} {...panHandlers}>
    <Tabs
      tabBar={(props) => <CustomScrollableTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
            title: 'Appointments',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={getScaledFontSize(24)} name="calendar" color={color} />
            ),
          }}
        />
      )}
      <Tabs.Screen
        name="health-chat"
        options={{
          title: 'Health Chat',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="message.fill" color={color} />
          ),
          href: settings.isHealthChatEnabled ? undefined : null,
          tabBarItemStyle: !settings.isHealthChatEnabled ? { display: 'none' } : undefined
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Health Summary',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="sparkles" color={color} />
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
            tabBarIcon: ({ color }) => (
              <IconSymbol size={getScaledFontSize(24)} name="doc.text" color={color} />
            ),
          }}
        />
      )}
      <Tabs.Screen
        name="today-schedule"
        options={{
          title: "Today's Schedule",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={getScaledFontSize(24)} name="calendar" color={color} />
          ),
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: null,
        }}
      />
      <Tabs.Screen
        name="connected-ehrs"
        options={{
          title: 'Connected EHRs',
          href: null,
        }}
      />
      <Tabs.Screen
        name="emergency-contact"
        options={{
          title: 'Emergency Contact',
          href: null,
        }}
      />
      <Tabs.Screen
        name="health-details"
        options={{
          title: 'Health Details',
          href: null,
        }}
      />
      <Tabs.Screen
        name="doctor-detail"
        options={{
          title: 'Doctor Detail',
          href: null,
        }}
      />
      <Tabs.Screen
        name="proxy-management"
        options={{
          title: 'Proxy Management',
          href: null,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="non-ehr-provider-detail"
        options={{
          title: 'Provider Detail',
          href: null,
        }}
      />
      <Tabs.Screen
        name="integrative-screen"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: null,
        }}
      />
      <Tabs.Screen
        name="connect-clinics"
        options={{
          title: 'Connect Clinics',
          href: null,
        }}
      />
      <Tabs.Screen
        name="appointment-detail"
        options={{
          title: 'Appointment Detail',
          href: null,
        }}
      />
      <Tabs.Screen
        name="recommended-appointments"
        options={{
          title: 'Recommended Appointments',
          href: null,
        }}
      />
      <Tabs.Screen
        name="care-checklist"
        options={{
          title: 'Care Checklist',
          href: null,
        }}
      />
      <Tabs.Screen
        name="health-trends"
        options={{
          title: 'Health Trends',
          href: null,
        }}
      />
      <Tabs.Screen
        name="allergies"
        options={{
          title: 'Allergies',
          href: null,
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
      <Tabs.Screen
        name="security-settings"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
    </View>
  );
}
