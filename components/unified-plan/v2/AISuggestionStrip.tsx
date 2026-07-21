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
import {
  UNIFIED_SECTION_META,
  UNIFIED_SECTION_ORDER,
} from '@/components/unified-plan/section-labels';
import type { UnifiedPlanView, UnifiedSectionKey } from '@/services/api/unified-plan';

// CHUNK 8.5 — permanent dismiss for suggestion chips, AsyncStorage-backed.
// Namespacing per-user is a future improvement; for now this is a global
// device-wide key. Single-user Ken doesn't hit the cross-account issue.
const DISMISSED_STORAGE_KEY = 'planV2:suggestion:dismissed';

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

export interface AISuggestionStripProps {
  view?: UnifiedPlanView | null;
}

export function AISuggestionStrip({ view }: AISuggestionStripProps = {}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const rawSuggestions = React.useMemo(() => deriveSuggestions(view), [view]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate dismissed set from AsyncStorage on mount (fire-and-forget —
  // strip shows all suggestions until this settles, one-frame flash is
  // acceptable and matches the design memo's "avoid flash" note).
  React.useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISSED_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) setDismissed(new Set(arr as string[]));
          } catch {
            // Corrupt JSON — start fresh
          }
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onDismiss = React.useCallback((text: string) => {
    setDismissed((prev) => {
      if (prev.has(text)) return prev;
      const next = new Set(prev);
      next.add(text);
      // Persist fire-and-forget. AsyncStorage writes are safe from the
      // iOS 26 crash pattern (that was fetch-response processing, not
      // native module writes).
      AsyncStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

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
          <View
            key={s.key}
            style={[
              styles.chip,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
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
              onPress={() => onDismiss(s.text)}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss suggestion: ${s.text}`}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.85 })}
            >
              <MaterialIcons name="close" size={getScaledFontSize(16)} color={colors.subtext} />
            </Pressable>
          </View>
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
