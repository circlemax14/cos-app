import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { CustomScrollableTabBar } from '@/components/custom-scrollable-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AiClipboardIcon } from '@/components/ui/ai-clipboard-icon';
import { BeatingHeartIcon } from '@/components/ui/beating-heart-icon';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useInactivityTimeout } from '@/hooks/use-inactivity-timeout';
import { useUnifiedPlanDefaultEnabled } from '@/hooks/use-unified-plan-default-flag';

export default function TabLayout() {
  const { getScaledFontSize } = useAccessibility();
  const { data: permissions } = useFeaturePermissions();
  const { panHandlers } = useInactivityTimeout();
  /*
   * COS-469 / Phase 4 — when the default-flip flag is ON, the visible
   * Care Plan tab points at `unified-plan` and `health-plan` becomes
   * an internal-only deep link (still reachable via ClassicViewLink).
   * Defaults to `false` on load, so pre-flip users see zero change.
   */
  const unifiedDefault = useUnifiedPlanDefaultEnabled();
  const carePlanTabOptions = {
    title: 'Health Plan',
    tabBarIcon: ({ color }: { color: string }) => (
      <BeatingHeartIcon size={getScaledFontSize(26)} color={color} />
    ),
  };

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
            title: 'Calendar',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={getScaledFontSize(24)} name="calendar" color={color} />
            ),
          }}
        />
      )}
      {/*
        COS-469 / Phase 4 — Care Plan tab default swap.
        `unifiedDefault` OFF: legacy `health-plan` remains the visible
        default (baseline). `unifiedDefault` ON: `health-plan` becomes
        an internal-only deep link (`href: null`) reachable via the
        ClassicViewLink icon in the unified-plan header. Same
        Tabs.Screen entries — no navigator remount, no new file.
      */}
      <Tabs.Screen
        name="health-plan"
        options={
          unifiedDefault
            ? { title: 'Classic care plan', href: null, headerShown: false }
            : carePlanTabOptions
        }
      />
      {/*
        Chunk 29 (2026-07-21) — unified-plan Tabs.Screen moved from the
        end of the file (line ~362 previously) to sit RIGHT AFTER
        health-plan so both share the same Care Plan slot in the tab bar.
        When unifiedDefault flips, the visible tab now stays in slot 3
        instead of jumping to the end of the tab bar (past all the
        href:null hidden screens). This was the 2026-07-18 Phase 4
        rollback's "tab visual regression on Vishal's build 62" —
        expo-router renders tabs in file-order after filtering
        href:null; the old position pushed unified-plan visually to
        the far right when the flag flipped on.

        COS-467 — Unified BPS plan view (Phase 2/4). When unifiedDefault
        is OFF (baseline), this screen is a hidden deep-link peer to
        the Care Plan tab, reached only via the TryUnifiedPlanBanner
        CTA on health-plan and biopsychosocial-plan. When ON, it takes
        over the Care Plan tab slot (health-plan becomes hidden and
        deep-linkable via ClassicViewLink). Owns its own header, so
        headerShown is false in the hidden variant.
      */}
      <Tabs.Screen
        name="unified-plan"
        options={
          unifiedDefault
            ? carePlanTabOptions
            : { title: 'Unified plan', href: null, headerShown: false }
        }
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Health Summary',
          tabBarIcon: ({ color }) => (
            <AiClipboardIcon size={getScaledFontSize(26)} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="health-chat"
        options={{
          title: 'Chat',
          href: null,
          tabBarItemStyle: { display: 'none' },
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
        name="medications"
        options={{
          title: 'Medications',
          href: null,
        }}
      />
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
      <Tabs.Screen
        name="linked-accounts"
        options={{
          title: 'Linked Accounts',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="reminder-settings"
        options={{
          title: 'Reminders',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="calendar-settings"
        options={{
          title: 'Calendar Settings',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="apple-health"
        options={{
          title: 'Apple Health',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="assessment-intake"
        options={{
          title: 'Health check-in',
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="assessments-catalog"
        options={{
          title: 'Health check-ins',
          href: null,
          headerShown: false,
        }}
      />
      {/*
       * COS-430 — plan-type chooser as a stack-pushed route (not a Modal).
       * See app/Home/plan-type-chooser.tsx header for the iOS 26.5 crash
       * background. Same hidden-Tabs.Screen pattern used 30+ times above.
       */}
      <Tabs.Screen
        name="plan-type-chooser"
        options={{
          title: 'Plan type',
          href: null,
          headerShown: false,
        }}
      />
      {/* COS-430 — Wellbeing map (read-only Venn of the NovoPsych model). */}
      <Tabs.Screen
        name="wellbeing-map"
        options={{
          title: 'Wellbeing map',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        COS-438 — biopsychosocial plan as an EXTENSION of the legacy Care
        Plan, not a replacement. Reached from a link on the legacy Care
        Plan when a bio plan record exists; back button returns to the
        legacy plan.
      */}
      <Tabs.Screen
        name="biopsychosocial-plan"
        options={{
          title: 'Biopsychosocial',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        CHUNK 50 — BPS Progress screen, reached via the "View Progress"
        link in the BPS header. Explicitly registered as href: null so
        expo-router does NOT auto-surface it as a bottom tab. Ken
        2026-07-22 dogfood: unregistered files still get inferred as tabs;
        we saw the Progress route appearing in the bottom nav next to
        Home/Calendar/etc. This makes it internal-only.
      */}
      <Tabs.Screen
        name="bps-progress"
        options={{
          title: 'Progress',
          href: null,
          headerShown: false,
        }}
      />
      {/* HS-1 / SCRUM-590 — patient intake wizard as a stack-pushed route (not a Modal), same pattern as plan-type-chooser and biopsychosocial-plan (iOS 26.5 modal-crash background). */}
      <Tabs.Screen
        name="patient-intake"
        options={{ title: 'Health check-in', href: null, headerShown: false }}
      />
      {/* COS-452 — read-only intake report reachable from IntakeCtaCard. */}
      <Tabs.Screen
        name="patient-intake-report"
        options={{ title: 'Your intake', href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="assessment-stepper"
        options={{
          title: 'Check-in',
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
    </View>
  );
}
