/**
 * AISuggestionStrip — CHUNK 8 (2026-07-20).
 *
 * Horizontal scroll of "suggestion" chips, client-derived from the top
 * few planBullets across all three BPS domains. No matching heuristic
 * yet (chunk 8.5 subtracts already-matched goals/tasks). No dismiss,
 * no snooze, no AsyncStorage (also chunk 8.5).
 *
 * Purpose here: prove the strip mounts + horizontal ScrollView works
 * on iOS 26.5. Same primitives already proven safe in chunks 1–7:
 * ScrollView + Pressable + Text + a colored dot View.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUser } from '@/hooks/use-user';
import {
  UNIFIED_SECTION_META,
  UNIFIED_SECTION_ORDER,
} from '@/components/unified-plan/section-labels';
import type { UnifiedPlanView, UnifiedSectionKey } from '@/services/api/unified-plan';

// CHUNK 14 — per-user AsyncStorage namespacing. Key format:
//   planV2:{sub}:suggestion:dismissed
// Closes the shared-device leak from the Phase 6.4 design memo known
// issue #4: on a clinic iPad with 2+ users, previous device-wide
// dismisses would leak across account switches. Now each user's
// dismissed set is scoped to their Cognito sub.
//
// Migration: the previous global key (planV2:suggestion:dismissed) is
// silently orphaned on first load. Users who dismissed chips before
// this chunk will see them re-appear once; they can dismiss again to
// persist under the new per-user key.
function dismissedKeyFor(sub: string | undefined): string | null {
  return sub ? `planV2:${sub}:suggestion:dismissed` : null;
}

const MAX_SUGGESTIONS = 6;

interface Suggestion {
  key: string;
  text: string;
  sectionKey: UnifiedSectionKey;
  color: string;
}

function deriveSuggestions(view: UnifiedPlanView | null | undefined): Suggestion[] {
  if (!view?.sections) return [];
  const out: Suggestion[] = [];
  // Interleave one from each section round-robin so the strip stays
  // balanced across BPS domains rather than showing all Bio first.
  const cursors: Record<UnifiedSectionKey, number> = {
    biological: 0,
    psychological: 0,
    socialSpiritual: 0,
  };
  let added = true;
  while (out.length < MAX_SUGGESTIONS && added) {
    added = false;
    for (const key of UNIFIED_SECTION_ORDER) {
      const bullets = view.sections[key]?.planBullets ?? [];
      const idx = cursors[key];
      if (idx < bullets.length && out.length < MAX_SUGGESTIONS) {
        out.push({
          key: `${key}-${idx}`,
          text: bullets[idx],
          sectionKey: key,
          color: UNIFIED_SECTION_META[key].color,
        });
        cursors[key] = idx + 1;
        added = true;
      }
    }
  }
  return out;
}

// CHUNK 16 (2026-07-21) — canonical section key for a chip. The chip is
// derived directly from a planBullet.section (see deriveSuggestions), so
// the sectionKey it stores IS the same UNIFIED_SECTION_ORDER key
// ('biological' | 'psychological' | 'socialSpiritual') the accordion
// expects. This helper is a pure passthrough — deliberately NOT a
// keyword classifier, and NOT reading the display label ("Social & Faith"
// is a rename only). Keeping it as a named helper documents that
// contract at the call site.
function chipToSection(chip: Suggestion): UnifiedSectionKey {
  return chip.sectionKey;
}

export interface AISuggestionStripProps {
  view?: UnifiedPlanView | null;
  /** CHUNK 16: fired when the user taps a chip body (NOT the x). The
   *  parent (PlanScreenV2) uses this to force-open the matching BPS
   *  accordion section. Optional to keep chunk-8/8.5 callers compiling. */
  onSuggestionPress?: (section: UnifiedSectionKey) => void;
}

export function AISuggestionStrip({
  view,
  onSuggestionPress,
}: AISuggestionStripProps = {}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data: user } = useUser();
  const storageKey = React.useMemo(() => dismissedKeyFor(user?.sub), [user?.sub]);

  const rawSuggestions = React.useMemo(() => deriveSuggestions(view), [view]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = React.useState(false);

  // Mirror of dismissed state so onDismiss can read current value
  // without stale-closure risk while keeping its setState call pure.
  const dismissedRef = React.useRef(dismissed);
  React.useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  // Hydrate dismissed set from AsyncStorage every time the user sub
  // changes (covers account switches on shared devices — the previous
  // user's dismisses are dropped, the new user's are loaded).
  React.useEffect(() => {
    if (!storageKey) {
      // No user yet — treat as unhydrated so the strip still renders
      // during auth resolution.
      setDismissed(new Set());
      setHydrated(false);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) setDismissed(new Set(arr as string[]));
            else setDismissed(new Set());
          } catch {
            setDismissed(new Set());
          }
        } else {
          setDismissed(new Set());
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setDismissed(new Set());
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const onDismiss = React.useCallback(
    (text: string) => {
      if (!storageKey) return;
      // Keep the setState updater pure (React can double-invoke under
      // StrictMode / concurrent rendering — an AsyncStorage write inside
      // the updater would fire twice). Compute the next set from the
      // ref of the current value, set state, then persist.
      const prev = dismissedRef.current;
      if (prev.has(text)) return;
      const next = new Set(prev);
      next.add(text);
      setDismissed(next);
      AsyncStorage.setItem(storageKey, JSON.stringify([...next])).catch(() => {});
    },
    [storageKey],
  );

  const suggestions = React.useMemo(
    () => (hydrated ? rawSuggestions.filter((s) => !dismissed.has(s.text)) : rawSuggestions),
    [rawSuggestions, dismissed, hydrated],
  );

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.label,
          {
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
          },
        ]}
      >
        SUGGESTIONS FROM YOUR PLAN
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {suggestions.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => onSuggestionPress?.(chipToSection(s))}
            accessibilityRole="button"
            accessibilityLabel={`${s.text}, opens ${UNIFIED_SECTION_META[s.sectionKey].title} section`}
            android_ripple={{ color: colors.border }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={[styles.chipDot, { backgroundColor: s.color }]} />
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
                flexShrink: 1,
              }}
              numberOfLines={2}
            >
              {s.text}
            </Text>
            <Pressable
              // CHUNK 16: nested Pressable — stop propagation on BOTH
              // onPressIn and onPress so the outer chip Pressable never
              // sees the x tap. onPressIn guards platforms where onPress
              // stopPropagation is honored inconsistently; onPress guard
              // is the standard path. Never triggers the outer onPress.
              onPressIn={(e) => {
                e.stopPropagation?.();
              }}
              onPress={(e) => {
                e.stopPropagation?.();
                onDismiss(s.text);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss suggestion: ${s.text}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.85 })}
            >
              <MaterialIcons name="close" size={getScaledFontSize(16)} color={colors.subtext} />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.05 * 11,
    fontWeight: '500',
    marginBottom: 8,
  },
  strip: {
    gap: 10,
    paddingRight: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 260,
    gap: 8,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
