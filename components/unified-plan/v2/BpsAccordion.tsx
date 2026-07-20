/**
 * BpsAccordion (COS-475, Phase 6.4).
 *
 * Renders three BpsSectionPanel children in canonical BPS order. Owns
 * "which panel is expanded" — single-open by default with 'biological'
 * pre-expanded (uncontrolled with local useState so parent doesn't need
 * to plumb the toggle callback).
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/design-system';
import { BPS_SECTION_ORDER, sectionKeyToPrimaryDomain } from '@/lib/plan-v2/section-config';
import type { RoutineRow } from '@/services/api/types';
import type { UnifiedPlanView, UnifiedSectionKey } from '@/services/api/unified-plan';

import { BpsSectionPanel } from './BpsSectionPanel';

type ColorMap = Record<string, string | undefined>;

export interface BpsAccordionProps {
  view: UnifiedPlanView;
  routines: RoutineRow[];
  scheduledFor: string;
  offline: boolean;
  hideReadingsMap: Record<UnifiedSectionKey, boolean>;
  onToggleHideReadings: (sectionKey: UnifiedSectionKey, next: boolean) => void;
  highlightedSection?: string | null;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

export function BpsAccordion(props: BpsAccordionProps): React.JSX.Element {
  const {
    view,
    routines,
    scheduledFor,
    offline,
    hideReadingsMap,
    onToggleHideReadings,
    highlightedSection,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onToast,
    onRefetch,
  } = props;

  // COS-475 hotfix 2026-07-20 — collapse all sections on first paint to
  // avoid iOS 26.5 TurboModule SIGABRT triggered by mounting 6-12
  // <Swipeable/> instances synchronously on first commit. Matches v1
  // profile that Phase 2 users banner-pushed cleanly. User taps a section
  // header to expand.
  const [openKey, setOpenKey] = useState<UnifiedSectionKey | null>(null);

  const routinesBySection = useMemo(() => {
    const out: Record<UnifiedSectionKey, RoutineRow[]> = {
      biological: [],
      psychological: [],
      socialSpiritual: [],
    };
    for (const r of routines) {
      switch (r.bpsDomain) {
        case 'bio':
          out.biological.push(r);
          break;
        case 'psy':
          out.psychological.push(r);
          break;
        case 'soc':
        case 'spi':
          out.socialSpiritual.push(r);
          break;
        default:
          break;
      }
    }
    return out;
  }, [routines]);

  return (
    <View style={{ paddingHorizontal: Spacing.md, marginTop: Spacing.sm }}>
      {BPS_SECTION_ORDER.map((key) => {
        const section = view.sections[key];
        if (!section) return null;
        const expanded = openKey === key;
        void sectionKeyToPrimaryDomain; // referenced from panel; keep tree-shakable
        return (
          <BpsSectionPanel
            key={key}
            sectionKey={key}
            section={section}
            routines={routinesBySection[key]}
            expanded={expanded}
            onToggle={() => setOpenKey((cur) => (cur === key ? null : key))}
            scheduledFor={scheduledFor}
            offline={offline}
            hideReadings={hideReadingsMap[key]}
            onToggleHideReadings={(next) => onToggleHideReadings(key, next)}
            highlighted={highlightedSection === key}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onToast={onToast}
            onRefetch={onRefetch}
          />
        );
      })}
    </View>
  );
}
