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
  // `title` is the ACCESSIBILITY label (VoiceOver reads it). The VISIBLE
  // label — with phone/tablet adaptive short-form — is resolved by
  // CustomScrollableTabBar via its TAB_LABELS map. Keep title as the
  // full "Health Plan" here so VoiceOver stays clear.
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
      {/*
        SCRUM-642 (2026-08-04) — Health Age drilldown MUST NOT appear in
        the bottom tab bar. It's reachable only via the Home tile
        (HealthAgeCard onPress → router.push('/Home/health-age')).
        Without href:null, expo-router auto-mounts app/Home/health-age.tsx
        as a visible tab.
      */}
      <Tabs.Screen
        name="health-age"
        options={{
          title: 'Health Age',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        SCRUM-644 followup (2026-08-05) — Daily Read drilldown, same
        pattern as Health Age above. Reached from the Home tile via
        DailyReadCard onPress → router.push('/Home/daily-read'). Must
        be href:null to keep it out of the bottom tab bar.
      */}
      <Tabs.Screen
        name="daily-read"
        options={{
          title: 'Daily Read',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        SCRUM-659 Story 4 (2026-08-05) — Habits CRUD screen, reached
        from the HabitsBanner on the unified-plan surface. Same
        href:null discipline as the other drilldowns.
      */}
      <Tabs.Screen
        name="habits"
        options={{
          // #13 — display name only. The route segment, the `habits` query
          // key, and the /plan/habits transport all keep the old identifier.
          title: 'Routines',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        SCRUM-638 followup (Vishal 2026-08-05) — Readiness info/detail
        screen. Reached from the Readiness hero tile (compact) or the
        full-width ReadinessScoreCard (large variant). Same href:null
        discipline as the other drilldowns.
      */}
      <Tabs.Screen
        name="readiness"
        options={{
          title: 'Readiness',
          href: null,
          headerShown: false,
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
      {/* SCRUM-675. Reached from a self-assessment card, never from the tab
          bar — without this declaration expo-router auto-registers the file
          as a TAB, which is exactly what it did on first ship. */}
      <Tabs.Screen
        name="assessment-detail"
        options={{
          title: 'Assessment detail',
          href: null,
        }}
      />
      {/* SCRUM-686. Reached from the Supports modal, never the tab bar. Same
          declaration as assessment-detail above and for the same reason —
          expo-router registers every file in this directory as a TAB unless
          told otherwise, which is exactly how assessment-detail shipped as a
          stray tab on 2026-08-14. */}
      <Tabs.Screen
        name="connections"
        options={{
          title: 'People',
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
      {/* COS-784 — the plan shelf. `href: null` keeps it off the tab bar; it is
          reached from the Profile drawer and the Home tile, both flag-gated. */}
      <Tabs.Screen
        name="plans"
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
      {/*
        SCRUM-641 — Proactive Nudges opt-in screen. Registered as a
        hidden tab (href:null) so expo-router knows the route; entry
        point is a row in reminder-settings.tsx, gated on
        useProactiveNudgesFlag() so it stays dark while backend flag OFF.
      */}
      <Tabs.Screen
        name="nudges"
        options={{
          title: 'Proactive nudges',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        SCRUM-640 — Habit Journal screen. Registered as a hidden tab
        (href:null) so expo-router knows the route; entry point is a
        row in profile-content.tsx ("Daily habits"), gated on
        useHabitJournalFlag() so it stays dark while backend flag OFF.
      */}
      <Tabs.Screen
        name="habit-journal"
        options={{
          title: 'Daily habits',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        SCRUM-648 — Blood Glucose (TIR) detail screen. Registered as a
        hidden tab (href:null) so expo-router knows the route; entry
        point is the GlucoseTirTile in the Biological section of the
        BiopsychosocialPlanScreen, gated on useCgmGlucoseFlag() so it
        stays dark while backend flag OFF.
      */}
      <Tabs.Screen
        name="glucose"
        options={{
          title: 'Blood Glucose (TIR)',
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
      {/*
        COS-737 — the subscription screen. href:null (pushed, not a tab) for the
        same reason as plan-type-chooser: a hidden Tabs.Screen keeps the tab bar
        intact while the route is presented, which is the pattern this app
        settled on after the iOS 26.5 crashes.
      */}
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Your plan',
          href: null,
          headerShown: false,
        }}
      />
      {/*
        COS-740 — the checkout seam. Registered even though it is currently
        unreachable: the Upgrade button that pushes it is gated on
        subscription_upgrade_enabled, which is false everywhere. Without this
        registration the flag could not be flipped without crashing the app —
        the gate would look ready and would not be.
      */}
      <Tabs.Screen
        name="billing-checkout"
        options={{
          title: 'Checkout',
          href: null,
          headerShown: false,
        }}
      />
      {/*
       * COS-482 Phase 1 — "Not now" sheet for a retake request. Full-screen
       * pushed route (not a Modal / bottom-sheet library) so the iOS 26.5
       * SIGABRT-on-Modal class documented in components/unified-plan/v2/net.ts
       * cannot fire. Same hidden Tabs.Screen pattern as plan-type-chooser
       * above.
       */}
      <Tabs.Screen
        name="retake-snooze-sheet"
        options={{
          title: 'Not now',
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
      {/* Ken 2026-08-06 — Wellbeing V2 composite detail screen. Reached
          from WellbeingScoreTile on Home. Distinct from wellbeing-map
          (which is BPS-subdomain coverage); this one focuses on the
          composite trend + component breakdown. */}
      <Tabs.Screen
        name="wellbeing-score"
        options={{
          title: 'Wellbeing',
          href: null,
          headerShown: false,
        }}
      />
      {/* Ken 2026-08-07 (#19) — Personal Information moved here from the
          root-level (personal-info) Stack group so it renders WITH the
          bottom tab bar (a root sibling of Home structurally cannot).
          href:null keeps it out of the visible tab bar; it's reached
          from the profile drawer. */}
      <Tabs.Screen
        name="personal-info"
        options={{
          title: 'Personal Information',
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
      {/*
        CHUNK 67 (2026-07-23) — domain-scoped check-in picker.
        Reachable ONLY via the BpsWellbeingScoreCard empty-pill CTA
        (see WELLBEING_DOMAIN_PICKER_ENABLED in that file). Same hidden
        Tabs.Screen pattern used above so expo-router doesn't
        auto-surface it as a bottom tab. iOS 26.5 safe primitives only
        (see file header for the full discipline list).
      */}
      <Tabs.Screen
        name="wellbeing-domain-checkins"
        options={{
          title: 'Check-ins',
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
    </View>
  );
}
