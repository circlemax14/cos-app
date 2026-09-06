/**
 * COS-809 — the badge that replaced four hardcoded tiers.
 *
 * It is the first thing on the card after the name, so a wrong one misdescribes
 * the plan before anything else is read. These cover the boundaries and the
 * cases where a plausible label would be a claim about something the plan does
 * not do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentBadge, ASSESSMENT_COLORS } from '../../lib/plan-assessment-badge.ts';

test('THE POINT: a plan that assesses nothing gets no badge', () => {
  // "LIGHT ASSESSMENT" on a plan with no assessment is a claim about a thing
  // that does not happen.
  assert.equal(assessmentBadge(0, false), null);
  assert.equal(assessmentBadge(null, false), null);
  assert.equal(assessmentBadge(undefined, undefined), null);
});

test('reading the record IS assessing, so it earns a badge on its own', () => {
  const b = assessmentBadge(0, true);
  assert.equal(b?.label, 'Light + EHR assessment');
});

test('the prod tiers still come out as themselves', () => {
  // Basic asked for 1-3 brief screeners and read as Light.
  assert.equal(assessmentBadge(3, false)?.label, 'Light assessment');
  // Advanced asked for 3-5 clinical screeners plus the record.
  assert.equal(assessmentBadge(5, true)?.label, 'Standard + EHR assessment');
});

test('the depth boundaries are exactly where they claim to be', () => {
  assert.equal(assessmentBadge(3, false)?.depth, 'light');
  assert.equal(assessmentBadge(4, false)?.depth, 'standard');
  assert.equal(assessmentBadge(6, false)?.depth, 'standard');
  assert.equal(assessmentBadge(7, false)?.depth, 'clinical');
});

test('the colours are the prod chooser\'s, unchanged', () => {
  // Same three, so a patient moving between the screens sees one language.
  assert.equal(ASSESSMENT_COLORS.light, '#6B7280');
  assert.equal(ASSESSMENT_COLORS.standard, '#5B47CC');
  assert.equal(ASSESSMENT_COLORS.clinical, '#0E7490');
  assert.equal(assessmentBadge(9, false)?.color, '#0E7490');
});

test('a negative or absurd count does not crash or mislabel', () => {
  assert.equal(assessmentBadge(-1, false), null);
  assert.equal(assessmentBadge(999, false)?.depth, 'clinical');
});
