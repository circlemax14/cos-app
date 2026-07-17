/**
 * Pure-logic tests for `assessmentHrefForSection` (COS-467).
 * Verifies the empty-section deep-link maps to the correct BPS focus
 * slug (bio/psy/soc) and carries source attribution.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSESSMENT_ROUTE_FOR_SECTION,
  assessmentHrefForSection,
} from '../../lib/unified-plan-assessment-routing.ts';

test('biological → focus=bio', () => {
  assert.equal(ASSESSMENT_ROUTE_FOR_SECTION.biological, 'bio');
  const href = assessmentHrefForSection('biological');
  assert.match(href, /focus=bio(\b|$)/);
  assert.match(href, /source=unified-plan-empty/);
  assert.ok(href.startsWith('/Home/assessments-catalog?'));
});

test('psychological → focus=psy', () => {
  assert.equal(ASSESSMENT_ROUTE_FOR_SECTION.psychological, 'psy');
  const href = assessmentHrefForSection('psychological');
  assert.match(href, /focus=psy(\b|$)/);
});

test('socialSpiritual → focus=soc', () => {
  assert.equal(ASSESSMENT_ROUTE_FOR_SECTION.socialSpiritual, 'soc');
  const href = assessmentHrefForSection('socialSpiritual');
  assert.match(href, /focus=soc(\b|$)/);
});

test('all three keys are present', () => {
  const keys = Object.keys(ASSESSMENT_ROUTE_FOR_SECTION).sort();
  assert.deepEqual(keys, ['biological', 'psychological', 'socialSpiritual']);
});
