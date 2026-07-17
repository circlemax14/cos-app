/**
 * Pure-logic tests for the ProvenanceChip variant resolver (COS-467).
 *
 * Follows the repo convention (`node --test tests/unit/*.test.ts`) rather
 * than jest/RTL, which this codebase does not use. Component-level tests
 * for `ProvenanceChip`/`TryUnifiedPlanBanner` land when the app adopts
 * @testing-library/react-native (separate follow-up).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveProvenanceVariant } from '../../lib/unified-plan-provenance.ts';

const colors: Record<string, string> = {
  tint: '#008080',
  success: '#059669',
  warning: '#D97706',
  subtext: '#6B7280',
  accent: '#8B5CF6',
  integrative: '#0EA5E9',
};

test('bps native item → null (no chip rendered)', () => {
  const v = resolveProvenanceVariant({ source: 'bps', colors });
  assert.equal(v, null);
});

test('care_manager → "From your care team", outline, tinted', () => {
  const v = resolveProvenanceVariant({ source: 'care_manager', colors });
  assert.ok(v);
  assert.equal(v!.label, 'From your care team');
  assert.equal(v!.style, 'outline');
  assert.equal(v!.tint, '#008080');
});

test('ai_generated → "AI suggestion", filled', () => {
  const v = resolveProvenanceVariant({ source: 'ai_generated', colors });
  assert.ok(v);
  assert.equal(v!.label, 'AI suggestion');
  assert.equal(v!.style, 'filled');
});

test('patient (self-added) → "You added", outline', () => {
  const v = resolveProvenanceVariant({ source: 'patient', colors });
  assert.ok(v);
  assert.equal(v!.label, 'You added');
  assert.equal(v!.style, 'outline');
});

test('med_overlay → "Integrative", filled', () => {
  const v = resolveProvenanceVariant({ source: 'med_overlay', colors });
  assert.ok(v);
  assert.equal(v!.label, 'Integrative');
  assert.equal(v!.style, 'filled');
});

test('ambiguous overrides source → warning "Integrative — needs review"', () => {
  const v = resolveProvenanceVariant({
    source: 'care_manager',
    ambiguous: true,
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'Integrative — needs review');
  assert.equal(v!.tint, '#D97706');
});

test('editedBy=patient overrides source → "You edited", success tint', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    editedBy: 'patient',
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'You edited');
  assert.equal(v!.tint, '#059669');
});

test('ambiguous wins over editedBy (review-nudge is top priority)', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    editedBy: 'patient',
    ambiguous: true,
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'Integrative — needs review');
});

test('bps + editedBy=patient still shows edited chip (source alone would suppress)', () => {
  const v = resolveProvenanceVariant({
    source: 'bps',
    editedBy: 'patient',
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'You edited');
});

test('missing color slots fall back to sensible hardcoded defaults', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    colors: {} as Record<string, string>,
  });
  assert.ok(v);
  assert.equal(v!.tint, '#8B5CF6');
});

test('sourceCategory=unclassified renders warning "Unclassified" chip', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    sourceCategory: 'unclassified',
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'Unclassified');
  assert.equal(v!.tint, '#D97706');
  assert.equal(v!.style, 'filled');
});

test('unclassified is distinct from other source-based chips', () => {
  const ai = resolveProvenanceVariant({ source: 'ai_generated', colors });
  const unclassified = resolveProvenanceVariant({
    source: 'ai_generated',
    sourceCategory: 'unclassified',
    colors,
  });
  assert.ok(ai && unclassified);
  assert.notEqual(ai!.label, unclassified!.label);
  assert.notEqual(ai!.tint, unclassified!.tint);
});

test('ambiguous still wins over unclassified (review-nudge is top priority)', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    sourceCategory: 'unclassified',
    ambiguous: true,
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'Integrative — needs review');
});

test('bps + sourceCategory=unclassified still surfaces the Unclassified chip', () => {
  const v = resolveProvenanceVariant({
    source: 'bps',
    sourceCategory: 'unclassified',
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'Unclassified');
});

test('non-unclassified sourceCategory does not alter source mapping', () => {
  const v = resolveProvenanceVariant({
    source: 'ai_generated',
    sourceCategory: 'sleep',
    colors,
  });
  assert.ok(v);
  assert.equal(v!.label, 'AI suggestion');
});
