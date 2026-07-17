/**
 * Pure resolver for the ProvenanceChip variant (COS-467).
 *
 * Split out from `components/unified-plan/ProvenanceChip.tsx` so it can
 * be unit-tested from `tests/unit/*` via `node --test` without pulling
 * in React or React Native. The component in ProvenanceChip.tsx just
 * consumes this + wraps the returned variant in a <View> + <Text>.
 */

/**
 * Duplicated (not imported) so this file remains dependency-free and
 * runnable under `node --test` without transitively pulling in
 * `services/api/*` (which imports axios / RN client).
 */
export type PlanItemSource =
  | 'bps'
  | 'ai_generated'
  | 'care_manager'
  | 'patient'
  | 'med_overlay';

export interface ProvenanceVariant {
  label: string;
  /** MaterialIcons glyph name. String-typed here (no RN import). */
  icon: string;
  /** Hex color. */
  tint: string;
  /** Rendering style — outline (transparent bg) or filled (tinted bg). */
  style: 'outline' | 'filled';
}

export interface ResolveProvenanceInput {
  source: PlanItemSource;
  ambiguous?: boolean;
  editedBy?: 'patient' | 'care_manager';
  /**
   * Backend hint for cases the classifier could name but not confidently
   * bucket. `'unclassified'` is a distinct signal — the item exists but
   * BE couldn't assign it to a BPS section. Renders as a warning-tinted
   * "Unclassified" chip so the user knows to expect a review nudge.
   */
  sourceCategory?: string;
  colors: Record<string, string | undefined>;
}

/**
 * Precedence:
 *   1. `ambiguous === true` → warning "Integrative — needs review".
 *   2. `sourceCategory === 'unclassified'` → warning "Unclassified".
 *   3. `editedBy === 'patient'` → success "You edited".
 *   4. Otherwise map by `source`.
 *   5. `source === 'bps'` with no override → null (no chip rendered).
 */
export function resolveProvenanceVariant(
  input: ResolveProvenanceInput,
): ProvenanceVariant | null {
  const { source, ambiguous, editedBy, sourceCategory, colors } = input;
  const isUnclassified = sourceCategory === 'unclassified';
  if (source === 'bps' && !ambiguous && !isUnclassified && editedBy !== 'patient') {
    return null;
  }

  if (ambiguous) {
    return {
      label: 'Integrative — needs review',
      icon: 'info-outline',
      tint: colors.warning ?? '#F59E0B',
      style: 'filled',
    };
  }
  if (isUnclassified) {
    return {
      label: 'Unclassified',
      icon: 'help-outline',
      tint: colors.warning ?? '#F59E0B',
      style: 'filled',
    };
  }
  if (editedBy === 'patient') {
    return {
      label: 'You edited',
      icon: 'edit',
      tint: colors.success ?? '#10B981',
      style: 'filled',
    };
  }
  switch (source) {
    case 'care_manager':
      return {
        label: 'From your care team',
        icon: 'medical-services',
        tint: colors.tint ?? '#0D9488',
        style: 'outline',
      };
    case 'ai_generated':
      return {
        label: 'AI suggestion',
        icon: 'auto-awesome',
        tint: colors.accent ?? '#8B5CF6',
        style: 'filled',
      };
    case 'patient':
      return {
        label: 'You added',
        icon: 'person',
        tint: colors.subtext ?? '#6B7280',
        style: 'outline',
      };
    case 'med_overlay':
      return {
        label: 'Integrative',
        icon: 'spa',
        tint: colors.integrative ?? '#0EA5E9',
        style: 'filled',
      };
    case 'bps':
    default:
      return null;
  }
}
