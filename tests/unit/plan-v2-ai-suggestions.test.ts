/**
 * Pure-logic tests for AI-suggestion derivation (COS-475).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSuggestions,
  levenshtein,
} from '../../lib/plan-v2/ai-suggestions.ts';

const NOW = 2_000_000_000_000;

function makeView(overrides: any = {}) {
  return {
    meta: {
      generatedAt: new Date(NOW).toISOString(),
      hasLegacy: false,
      hasBps: true,
      refreshInFlight: false,
    },
    sections: {
      biological: {
        planBullets: [],
        interventions: [],
        goals: [],
        tasks: [],
        categoryStatusItems: [],
        ...(overrides.biological ?? {}),
      },
      psychological: {
        planBullets: [],
        interventions: [],
        goals: [],
        tasks: [],
        categoryStatusItems: [],
        ...(overrides.psychological ?? {}),
      },
      socialSpiritual: {
        planBullets: [],
        interventions: [],
        goals: [],
        tasks: [],
        categoryStatusItems: [],
        ...(overrides.socialSpiritual ?? {}),
      },
    },
  } as any;
}

test('levenshtein trivial equalities', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('includes bullets not matching any existing item', () => {
  const view = makeView({
    biological: {
      planBullets: ['Drink 8 glasses of water daily'],
      goals: [{ id: 'g1', title: 'Get 8h sleep', source: 'ai_generated' }],
    },
  });
  const items = deriveSuggestions(view, null, null, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].sectionKey, 'biological');
  assert.equal(items[0].title, 'Drink 8 glasses of water daily');
});

test('excludes bullets that substring-match an existing title', () => {
  const view = makeView({
    biological: {
      planBullets: ['Get 8 hours of sleep tonight'],
      goals: [{ id: 'g1', title: '8 hours of sleep', source: 'ai_generated' }],
    },
  });
  const items = deriveSuggestions(view, null, null, NOW);
  assert.equal(items.length, 0);
});

test('excludes bullets within levenshtein <= 3 of an existing title', () => {
  const view = makeView({
    biological: {
      planBullets: ['Walk 30 mins'], // dist 1 vs "Walk 30 min"
      goals: [{ id: 'g1', title: 'Walk 30 min', source: 'ai_generated' }],
    },
  });
  const items = deriveSuggestions(view, null, null, NOW);
  assert.equal(items.length, 0);
});

test('excludes dismissed ids within 7d', () => {
  const view = makeView({
    biological: { planBullets: ['New bullet A', 'New bullet B'] },
  });
  const first = deriveSuggestions(view, null, null, NOW);
  assert.equal(first.length, 2);
  const dismissed = { [first[0].id]: NOW - 1000 };
  const second = deriveSuggestions(view, dismissed, null, NOW);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[1].id);
});

test('excludes snoozed ids until snoozeUntil passes', () => {
  const view = makeView({
    biological: { planBullets: ['Only bullet'] },
  });
  const first = deriveSuggestions(view, null, null, NOW);
  assert.equal(first.length, 1);
  const snoozed = { [first[0].id]: NOW + 60_000 };
  assert.equal(deriveSuggestions(view, null, snoozed, NOW).length, 0);
  assert.equal(deriveSuggestions(view, null, snoozed, NOW + 61_000).length, 1);
});

test('routineTitles from ctx also suppress matches', () => {
  const view = makeView({
    psychological: {
      planBullets: ['Meditate 10 minutes'],
    },
  });
  const suppressed = deriveSuggestions(view, null, null, NOW, {
    routineTitles: ['Meditate 10 minutes daily'],
  });
  assert.equal(suppressed.length, 0);
  const kept = deriveSuggestions(view, null, null, NOW, { routineTitles: [] });
  assert.equal(kept.length, 1);
});

test('null view returns []', () => {
  assert.deepEqual(deriveSuggestions(null, null, null, NOW), []);
});
