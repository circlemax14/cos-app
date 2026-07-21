/**
 * PlanScreenV2 — CHUNK 1 (2026-07-20).
 *
 * Absolute minimum. No gesture-handler, no accordion, no data hooks,
 * no AsyncStorage, no toast, no offline banner, no Reanimated worklets,
 * no CareManagerToastHost, no MedsSignalContext.
 *
 * Purpose: prove the v2 mount PATH itself works on iOS 26.5 build 62.
 * If Ken lands on this screen without crashing, we know unified-plan.tsx
 * → PlanScreenV2 mount is safe and we can layer components one chunk
 * at a time. If it still crashes, the trigger is something in the
 * unified-plan route file or expo-router push itself — bigger fix.
 *
 * Later chunks will add (one commit + one OTA each):
 *   - Chunk 2: BpsAccordion shell (3 collapsed headers, no content)
 *   - Chunk 3: Plan bullets under each section (still no interactive)
 *   - Chunk 4: Goals list (read-only)
 *   - Chunk 5: Tasks list (read-only, no swipe)
 *   - Chunk 6: Swipe actions on tasks
 *   - Chunk 7: Routines
 *   - Chunk 8: AI suggestion strip
 *   - Chunk 9: Wellbeing map card
 *   - Chunk 10: Care-manager toast
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { BpsAccordion } from '@/components/unified-plan/v2/BpsAccordion';
import { WellbeingMapCard } from '@/components/unified-plan/v2/WellbeingMapCard';
import { AISuggestionStrip } from '@/components/unified-plan/v2/AISuggestionStrip';
import { CareManagerToast } from '@/components/unified-plan/v2/CareManagerToast';

export default function PlanScreenV2(): React.JSX.Element {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // COS-475b chunk 3 — first real data hook. useUnifiedPlan is a
  // react-query wrapper over GET /v1/plan (Phase 1). Same hook the
  // legacy path uses; not new bridge code, but the first time v2
  // pays for the fetch.
  const { data, refetch } = useUnifiedPlan();

  const onSwipeRefetch = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  const onBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  // DEBUG (chunk 12.1): increment to force-show the care-manager toast
  // so Ken can visually verify it without waiting for a real plan
  // update. Remove in a follow-up chunk once verified.
  const [debugToastTrigger, setDebugToastTrigger] = React.useState(0);
  const onDebugToast = React.useCallback(() => {
    setDebugToastTrigger((n) => n + 1);
  }, []);

  return (
    <AppWrapper>
      <CareManagerToast
        generatedAt={data?.meta?.generatedAt}
        debugTrigger={debugToastTrigger}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
          >
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(16) }}>‹ Back</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onDebugToast}
            accessibilityRole="button"
            accessibilityLabel="Test care-manager toast"
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13) }}>Test toast</Text>
          </Pressable>
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(28),
            fontWeight: '600',
            marginTop: 8,
          }}
        >
          Your plan
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(15),
            marginTop: 4,
          }}
        >
          Phase 6.4 v2 — Chunk 1 shell
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), lineHeight: 20 }}>
            Chunk 7 adds the wellbeing map card. Tap it to open your Bio · Psy · Soc map.
          </Text>
        </View>

        <WellbeingMapCard />
        <AISuggestionStrip view={data ?? null} />
        <BpsAccordion view={data ?? null} onRefetch={onSwipeRefetch} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
});
