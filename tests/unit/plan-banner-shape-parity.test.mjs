/**
 * The four plan-screen banners must look like one system.
 *
 * Vishal 2026-08-11: "AI summary and routines card format is not matching
 * with nutrition and medication card".
 *
 * They had drifted three different ways:
 *   - MedicationsBanner + NutritionPlanSection: 1F/55 card wash, SOLID tint
 *     icon well, white glyph, 16/700 title
 *   - HabitsBanner ("Routines"): 14/33 card, 22/44 SOFT icon wash, tinted
 *     glyph — a deliberate 2026-08-06 choice that stopped making sense once
 *     there were four cards in the stack
 *   - BpsAiSummaryBanner: no icon well at all, an 11pt uppercase eyebrow
 *     instead of a title, and different padding/radius
 *
 * These assert the shared shape rather than describing it, because "make it
 * match" is exactly the kind of change that silently regresses the next time
 * one card is touched in isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, 'components/health-plan', f), 'utf8');

/**
 * Source with comments stripped.
 *
 * Every "must NOT contain X" assertion also matches the comment EXPLAINING
 * why X is absent — BpsAiSummaryBanner's CHUNK 57 note literally says
 * "dropped `marginHorizontal`". This trap has now fired five times across
 * these contract tests. Negative assertions go through here, always.
 */
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const BANNERS = {
  'HabitsBanner (Routines)': read('HabitsBanner.tsx'),
  'NutritionPlanSection': read('NutritionPlanSection.tsx'),
  'MedicationsBanner': read('MedicationsBanner.tsx'),
  'BpsAiSummaryBanner (AI summary)': read('BpsAiSummaryBanner.tsx'),
};

for (const [name, src] of Object.entries(BANNERS)) {
  test(`${name}: 48pt icon well`, () => {
    assert.match(src, /width: 48/, 'icon well must be 48pt');
    assert.match(src, /height: 48/);
    assert.match(src, /borderRadius: 24/, 'icon well must be a circle');
  });

  test(`${name}: SOLID tint well with a white glyph`, () => {
    // The soft-wash variant reads as a different class of card beside the
    // solid ones — which is precisely what was reported.
    assert.match(
      src,
      /backgroundColor: tint, borderColor: tint/,
      'icon well must be a solid tint fill',
    );
    assert.match(src, /size=\{24\} color="#FFFFFF"/, 'glyph must be white at 24pt');
  });

  test(`${name}: same card metrics`, () => {
    assert.match(src, /borderRadius: 16/);
    assert.match(src, /paddingHorizontal: 14/);
    assert.match(src, /marginBottom: 12/);
  });

  test(`${name}: same 1F/55 wash`, () => {
    assert.match(src, /\$\{tint\}1F|tint \+ '1F'/, 'card background must be tint at 1F');
    assert.match(src, /\$\{tint\}55|tint \+ '55'/, 'card border must be tint at 55');
  });

  test(`${name}: 16pt bold title, not an eyebrow`, () => {
    // BpsAiSummaryBanner used an 11pt uppercase "AI SUMMARY" eyebrow where
    // the others had a title.
    assert.match(src, /fontSize: (sz|getScaledFontSize)\(16\)/, 'title must be 16pt');
  });

  test(`${name}: no horizontal margin`, () => {
    // The parent ScrollView owns horizontal padding; a card adding its own
    // sits visibly farther in than its siblings.
    const code = codeOnly(src);
    const styles = code.slice(code.indexOf('StyleSheet.create('));
    assert.doesNotMatch(styles, /marginHorizontal/, 'breaks byte-width match');
  });
}
