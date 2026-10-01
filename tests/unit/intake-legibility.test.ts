/**
 * COS-1216 / COS-1221 — the Health Status intake has to be readable on a ~10"
 * iPad by a 60+, partly sighted audience.
 *
 * Stakeholders reviewed the intake on iPad and reported "the font size is very
 * small" and "a light gray font makes it very difficult to read". Both were
 * literal:
 *
 *   SIZE   — every size in components/health-plan/patient-intake/ is a phone
 *            size passed to getScaledFontSize, and on a tablet with default
 *            settings that helper is the IDENTITY (rawFontScale 1,
 *            accessibilityMultiplier 1). Its internal isTablet() only lifts the
 *            phone dampening; it never enlarges. So a 13pt hint rendered at
 *            13pt on the iPad, at arm's length.
 *   CONTRAST — the hint/note grey was 4.62:1 on the card, the validation red was
 *            4.43:1 light / 3.38:1 dark, and the SELECTED option row printed
 *            white on the section accent at 3.46:1 (life) / 3.55:1 (body) — all
 *            below AA, the last of them on the exact question that was reported.
 *
 * These assertions test the functions, not a rendered snapshot. The pure module
 * is deliberately free of react-native in its import graph so `node --test` can
 * load it; the hook that reads the window width cannot be (and the components
 * are JSX behind the `@/` alias), so those contracts are pinned against the
 * source text in the style of tests/unit/intake-scale-labels.test.mjs.
 *
 * EVERY SOURCE-TEXT ASSERTION HERE CHECKS EVERY OCCURRENCE. A `.exec()` or a
 * `.find()` that stops at the first hit is how the previous round's tap-target
 * test came to pass with the floor it was guarding deleted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INTAKE_TYPE_STEP,
  intakeFontSize,
  readableOn,
} from '../../components/health-plan/patient-intake/intake-legibility.ts';

const read = (p: string) => readFileSync(p, 'utf8');
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DIR = 'components/health-plan/patient-intake';
const HOOK = strip(read(`${DIR}/use-intake-legibility.ts`));
const PURE = strip(read(`${DIR}/intake-legibility.ts`));

/**
 * Every component in the folder, not the five that were converted first.
 * The product owner's complaint was about a SCREEN: a question card stepping to
 * 1.35x inside chrome still at 1.0x is the same bug with a smaller blast radius.
 */
const COMPONENTS = [
  'IntakeCompleteView.tsx',
  'IntakeCtaCard.tsx',
  'IntakeProgressHeader.tsx',
  'IntakeQuestionRenderer.tsx',
  'IntakeReportScreen.tsx',
  'IntakeWizardScreen.tsx',
  'RetakeSectionSheet.tsx',
  'ShareIntakeReportSection.tsx',
  'questions/AddListQuestion.tsx',
  'questions/HeightQuestion.tsx',
  'questions/MultiChoiceQuestion.tsx',
  'questions/NumberQuestion.tsx',
  'questions/ScaleQuestion.tsx',
  'questions/SingleChoiceQuestion.tsx',
  'questions/TextQuestion.tsx',
];

const SRC: Record<string, string> = {};
for (const f of COMPONENTS) SRC[f] = strip(read(`${DIR}/${f}`));

/** The identity scaler: a patient who has changed nothing. */
const plain = (n: number) => n;

// ── 1. Type scales with the screen ──────────────────────────────────────────

test('THE POINT: a tablet renders a larger size than a phone for the same base', () => {
  /*
   * This is the whole defect. With getScaledFontSize as the identity — which
   * is exactly what a default iPad gets — the old code returned the phone size
   * on every screen. Revert INTAKE_TYPE_STEP's tablet entries to 1 and this
   * fails.
   */
  const phone = intakeFontSize(16, 'phone', plain);
  const portrait = intakeFontSize(16, 'tabletPortrait', plain);
  const landscape = intakeFontSize(16, 'tabletLandscape', plain);

  assert.ok(portrait > phone, `tabletPortrait ${portrait} must exceed phone ${phone}`);
  assert.ok(landscape > portrait, `tabletLandscape ${landscape} must exceed portrait ${portrait}`);
});

test('the ladder is monotonic and phone is untouched', () => {
  // "Phone sizing is confirmed good — do not regress it."
  assert.equal(INTAKE_TYPE_STEP.phone, 1);
  assert.ok(INTAKE_TYPE_STEP.tabletPortrait > 1);
  assert.ok(INTAKE_TYPE_STEP.tabletLandscape > INTAKE_TYPE_STEP.tabletPortrait);
  // Legibility, not a redesign: a step that doubles the type is a redesign.
  assert.ok(INTAKE_TYPE_STEP.tabletLandscape <= 1.5);

  for (const base of [12, 13, 14, 15, 16, 20, 22]) {
    assert.equal(intakeFontSize(base, 'phone', plain), base, `phone base ${base} moved`);
  }
});

test("the patient's own font scale still multiplies ON TOP of the tablet step", () => {
  /*
   * The failure mode if the two were not composed: a patient who has raised
   * their system font gets the tablet step INSTEAD of their multiplier, so
   * turning on Larger Text on an iPad would change nothing.
   */
  const raised = (n: number) => Math.round(n * 1.5);

  const phonePlain = intakeFontSize(16, 'phone', plain);
  const phoneRaised = intakeFontSize(16, 'phone', raised);
  const tabletPlain = intakeFontSize(16, 'tabletPortrait', plain);
  const tabletRaised = intakeFontSize(16, 'tabletPortrait', raised);

  assert.ok(phoneRaised > phonePlain, 'system scale ignored on phone');
  assert.ok(tabletRaised > tabletPlain, 'system scale ignored on tablet');
  assert.ok(tabletRaised > phoneRaised, 'tablet step lost once the patient raises their font');
  // Composed, not merely both-applied-somewhere: step first, then the scaler.
  assert.equal(tabletRaised, raised(Math.round(16 * INTAKE_TYPE_STEP.tabletPortrait)));
});

test('the step is handed to getScaledFontSize, never applied after it', () => {
  /*
   * Ordering matters because getScaledFontSize caps its result at base * 2.
   * Multiplying AFTER it would blow straight through that cap; multiplying the
   * base before means the cap scales with the step.
   */
  const capped = (n: number) => Math.min(Math.round(n * 9), n * 2);
  for (const bp of ['phone', 'tabletPortrait', 'tabletLandscape'] as const) {
    const stepped = Math.round(16 * INTAKE_TYPE_STEP[bp]);
    assert.equal(intakeFontSize(16, bp, capped), stepped * 2);
  }
});

test('worst case — largest tablet step x max accessibility scale still fits a card', () => {
  /*
   * "More than half the days" at maximum scale on a tablet is the stated worst
   * case. getScaledFontSize's hard ceiling is base * 2, where base is what we
   * hand it, so:
   */
  const maxed = (n: number) => n * 2;
  const label = intakeFontSize(16, 'tabletLandscape', maxed);
  const icon = intakeFontSize(22, 'tabletLandscape', maxed);

  // 1024pt landscape iPad, minus screenPadding 20x2, card padding 16x2,
  // row padding 14x2, the radio, and its 10pt margin.
  const textWidth = 1024 - 40 - 32 - 28 - icon - 10;
  // ~0.55em per character is generous for the system font.
  const oneLine = 'More than half the days'.length * label * 0.55;
  assert.ok(
    textWidth > 0 && oneLine < textWidth,
    `worst-case label needs ~${Math.round(oneLine)}pt, only ${textWidth}pt available`,
  );
  // And nothing truncates, anywhere in the folder, even if that estimate is
  // wrong. A 1.35x step that ends in an ellipsis has achieved nothing.
  for (const f of COMPONENTS) {
    assert.doesNotMatch(
      SRC[f],
      /numberOfLines|ellipsizeMode/,
      `${f} truncates text — long labels and hints must wrap for this audience`,
    );
  }
});

// ── 2. Contrast ─────────────────────────────────────────────────────────────

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** Independent of the implementation under test, and 3-digit-hex aware. */
const luminance = (hex: string) => {
  let h = hex.replace('#', '').trim();
  assert.ok(/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h), `unparseable hex ${hex}`);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
const ratio = (fg: string, bg: string) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const AA = 4.5;

/**
 * Exactly one `key: '#hex'` in `src`, or fail loudly.
 *
 * Not `.exec()`: a first-match read is what let a duplicate key (design-system
 * has a nested `highContrast.secondary`) silently answer for the token the app
 * actually renders.
 */
function hex(src: string, key: string, where: string): string {
  const hits = [...src.matchAll(new RegExp(`\\b${key}:\\s*'(#[0-9a-fA-F]{3,6})'`, 'g'))];
  assert.equal(hits.length, 1, `expected exactly one ${key} in ${where}, found ${hits.length}`);
  return hits[0][1];
}

/**
 * Exactly one `const KEY = '#hex'` in `src`, or fail loudly.
 *
 * The sibling of `hex()` above, for module constants rather than object keys —
 * the pill palette and the two accents are declared as consts.
 */
function constHex(src: string, key: string, where: string): string {
  const hits = [...src.matchAll(new RegExp(`\\bconst ${key} = '(#[0-9a-fA-F]{3,6})'`, 'g'))];
  assert.equal(hits.length, 1, `expected exactly one const ${key} in ${where}, found ${hits.length}`);
  return hits[0][1];
}

/** Named block of an object literal, brace-balanced enough for these two files. */
function block(src: string, open: RegExp, where: string): string {
  const m = open.exec(src);
  assert.ok(m, `could not find ${where}`);
  const start = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start + 1, i);
  }
  assert.fail(`unterminated block for ${where}`);
}

/*
 * Backgrounds are DERIVED from the theme, not retyped here. The previous round
 * hardcoded '#f5f5f5'/'#ffffff'/'#1e2022'/'#151718', so a theme change could
 * have invalidated every ratio below while this file stayed green — and the
 * real Colors.light.background is the 3-digit '#fff', which the old parser
 * would have read as a 3-byte integer and mis-scored.
 */
const THEME = read('constants/theme.ts');
const DESIGN = read('constants/design-system.ts');

/*
 * COS-1223 — `border` IS a text surface, and leaving it out is why the headline
 * fix of this whole epic was pinned by nothing. The loop below only ever looked
 * at card and background, where the grey the product owner complained about
 * reads 4.62:1 and 5.04:1 — over the bar. So the reviewer reverted
 * LightColors.secondary to '#687076' and all 2541 tests stayed green.
 *
 * Two sites in this folder paint secondary text directly on Colors.*.border,
 * and both are asserted from source in 'the surface list is the one the folder
 * really paints on' below:
 *   RetakeSectionSheet  a pressed group row fills with colors.border
 *   IntakeReportScreen  the neutral score pill IS muted on colors.border
 * On that surface #687076 is 3.82:1 — under AA — and #4B5563 is 5.73:1.
 */
const SURFACE = {
  light: {
    card: hex(block(THEME, /\blight:\s*\{/, 'Colors.light'), 'card', 'Colors.light'),
    background: hex(block(THEME, /\blight:\s*\{/, 'Colors.light'), 'background', 'Colors.light'),
    border: hex(block(THEME, /\blight:\s*\{/, 'Colors.light'), 'border', 'Colors.light'),
  },
  dark: {
    card: hex(block(THEME, /\bdark:\s*\{/, 'Colors.dark'), 'card', 'Colors.dark'),
    background: hex(block(THEME, /\bdark:\s*\{/, 'Colors.dark'), 'background', 'Colors.dark'),
    border: hex(block(THEME, /\bdark:\s*\{/, 'Colors.dark'), 'border', 'Colors.dark'),
  },
};

/** design-system's own tokens, minus the nested highContrast overrides. */
const flat = (name: string) =>
  block(DESIGN, new RegExp(`export const ${name} = \\{`), name).replace(
    /highContrast:\s*\{[\s\S]*?\},/,
    '',
  );
const TOKENS = {
  light: { muted: hex(flat('LightColors'), 'secondary', 'LightColors'), error: hex(flat('LightColors'), 'error', 'LightColors') },
  dark: { muted: hex(flat('DarkColors'), 'secondary', 'DarkColors'), error: hex(flat('DarkColors'), 'error', 'DarkColors') },
};

test('the contrast maths agrees with the WCAG reference pairs, 3-digit hex included', () => {
  // Sanity-check the formula before trusting it to police the palette.
  assert.equal(Math.round(ratio('#000000', '#ffffff') * 100) / 100, 21);
  assert.equal(Math.round(ratio('#000', '#fff') * 100) / 100, 21);
  assert.equal(ratio('#777777', '#777777'), 1);
  // And the theme really does ship a 3-digit value, so the parser is exercised.
  assert.equal(SURFACE.light.background.length, 4, 'Colors.light.background is no longer #fff');
});

test('THE POINT: every secondary and validation colour clears AA on its real surface', () => {
  /*
   * The pairs that used to fail or scrape by, for the record:
   *   light muted  #687076 on #f5f5f5  4.62  (12-13pt — the "light gray font")
   *   dark  muted  #9BA1A6 on #1e2022  6.26
   *   error        #DC2626 on #f5f5f5  4.43  BELOW AA
   *   error        #DC2626 on #1e2022  3.38  BELOW AA
   */
  for (const theme of ['light', 'dark'] as const) {
    for (const role of ['muted', 'error'] as const) {
      for (const [name, bg] of Object.entries(SURFACE[theme])) {
        const fg = TOKENS[theme][role];
        const r = ratio(fg, bg);
        assert.ok(r >= AA, `${theme}.${role} ${fg} on ${name} ${bg} is ${r.toFixed(2)}:1`);
      }
    }
  }
});

test('the sub-AA red was fixed AT SOURCE, not shadowed next to the screen that used it', () => {
  /*
   * MAJOR 3 of the COS-1221 review: the previous round answered a bad token by
   * declaring a local copy of it. LightColors.error was genuinely inadequate
   * (4.43:1 on the card) and now reads 5.93:1 for the whole app; DarkColors.error
   * was already compliant and is untouched.
   */
  assert.ok(ratio('#DC2626', SURFACE.light.card) < AA, 'the old red was supposedly failing');
  assert.notEqual(TOKENS.light.error, '#DC2626', 'LightColors.error is back to the sub-AA red');
  assert.ok(ratio(TOKENS.light.error, SURFACE.light.card) > ratio('#DC2626', SURFACE.light.card));

  // No local palette anywhere in the folder, and the hook takes the app's.
  assert.match(HOOK, /getColors\(/, 'the hook must read the design-system tokens');
  for (const [f, src] of [['use-intake-legibility.ts', HOOK], ['intake-legibility.ts', PURE], ...COMPONENTS.map((f) => [f, SRC[f]] as const)]) {
    assert.doesNotMatch(src as string, /IntakeTextColors/, `${f} still references the deleted local palette`);
  }
  // The hook defines no colour of its own: every hex it serves comes from a token.
  assert.deepEqual(
    [...HOOK.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]),
    [],
    'the hook has grown a colour literal — that is a second palette starting again',
  );
});

// ── 3. The selected option row (MAJOR 1) ────────────────────────────────────

const SECTION_COLOR = Object.fromEntries(
  [...block(read(`${DIR}/IntakeProgressHeader.tsx`), /export const SECTION_COLOR[^=]*=\s*\{/, 'SECTION_COLOR')
    .matchAll(/(\w+):\s*'(#[0-9a-fA-F]{3,6})'/g)].map((m) => [m[1], m[2]]),
);
/**
 * The fallback when a question carries no section accent.
 *
 * `Colors.light.tint` is a variable reference, not a literal, so the value is
 * followed to its declaration rather than retyped — same reason as the surfaces.
 */
const TINT = (() => {
  const ref = /\btint:\s*(\w+)/.exec(block(THEME, /\blight:\s*\{/, 'Colors.light'));
  assert.ok(ref, 'Colors.light.tint not found');
  const decl = [...THEME.matchAll(new RegExp(`const ${ref[1]} = '(#[0-9a-fA-F]{3,6})'`, 'g'))];
  assert.equal(decl.length, 1, `expected one declaration of ${ref[1]}, found ${decl.length}`);
  return decl[0][1];
})();

test('the three BPS section accents were read out of the header, not retyped', () => {
  assert.deepEqual(Object.keys(SECTION_COLOR).sort(), ['body', 'life', 'mind']);
  assert.ok(TINT, 'could not derive the tint fallback from constants/theme.ts');
});

test('THE POINT: the selected row label clears AA on every section accent', () => {
  /*
   * It rendered a hardcoded '#fff':
   *   life #C97600 -> 3.46:1   <- the section the LSNS questions live in
   *   body #199C4F -> 3.55:1
   * Both under the 4.5:1 bar for normal text, on the exact question the
   * stakeholder reported. No single label colour fixes all three accents (a
   * light one needs the accent at or below 0.183 relative luminance, a dark one
   * at or above 0.372, and these straddle that gap), so it is derived per
   * accent. Make readableOn return '#fff' unconditionally and this fails twice.
   */
  for (const [name, accent] of [...Object.entries(SECTION_COLOR), ['tint', TINT as string]]) {
    const r = ratio(readableOn(accent), accent);
    assert.ok(r >= AA, `${name} accent ${accent}: label ${readableOn(accent)} is ${r.toFixed(2)}:1`);
  }
});

test('readableOn picks the BETTER of the two candidates, not a fixed threshold', () => {
  // White on black and black on white are the unambiguous ends.
  assert.equal(ratio(readableOn('#000000'), '#000000') > 15, true);
  assert.equal(ratio(readableOn('#ffffff'), '#ffffff') > 15, true);
  // And it beats either candidate used blindly, on every accent.
  for (const accent of Object.values(SECTION_COLOR)) {
    const picked = ratio(readableOn(accent), accent);
    assert.ok(picked >= ratio('#FFFFFF', accent), `a fixed white would beat the pick on ${accent}`);
    assert.ok(picked >= ratio('#11181C', accent), `a fixed dark would beat the pick on ${accent}`);
  }
});

test('the dark label candidate has not drifted from the theme text token', () => {
  // It is a literal in the pure module because constants/theme imports
  // react-native. This is the guard that pays for that duplication.
  const themeText = hex(block(THEME, /\blight:\s*\{/, 'Colors.light'), 'text', 'Colors.light');
  assert.match(PURE, new RegExp(`ACCENT_LABEL_DARK = '${themeText}'`), 'drifted from Colors.light.text');
});

test('the selected row and the active section chip both derive their label', () => {
  // The two places in this folder that put text on a section accent.
  assert.match(SRC['questions/ScaleQuestion.tsx'], /readableOn\(accent\)/);
  assert.match(SRC['questions/ScaleQuestion.tsx'], /sectionColor \?\? colors\.tint/);
  assert.match(SRC['IntakeProgressHeader.tsx'], /readableOn\(chipColor\)/);
  // And neither of them is still painting white on it.
  for (const f of ['questions/ScaleQuestion.tsx', 'IntakeProgressHeader.tsx']) {
    assert.doesNotMatch(SRC[f], /#fff\b|#ffffff\b|#FFFFFF\b/i, `${f} still hardcodes a white label`);
  }
});

test('selection stays loud: the selected row is a filled accent, not a hairline', () => {
  /*
   * Contrast must not be bought by making selection subtle for a low-vision
   * user. The row's background is still the accent itself; only the glyph and
   * label colour changed.
   */
  const src = SRC['questions/ScaleQuestion.tsx'];
  assert.match(src, /backgroundColor: selected \? accent : colors\.card/);
  assert.match(src, /fontWeight: fw\(selected \? 600 : 500\)/);
  assert.match(src, /radio-button-checked/);
});

// ── 4. No second breakpoint system, no bypassed scaler ──────────────────────

test('the breakpoint ladder is HomeResponsiveProvider’s, not a copy', () => {
  /*
   * The stated failure mode: "a second set of breakpoints that drifts from the
   * first". layoutForWidth is pure and already exported, so it is reused
   * outright. The intake wizard is not inside HomeResponsiveProvider, which is
   * why the derive is called directly instead of via useHomeLayout().
   */
  assert.match(HOOK, /layoutForWidth/, 'the hook must delegate width -> breakpoint');
  assert.match(HOOK, /from '@\/components\/home\/HomeResponsiveProvider'/);
  for (const src of [HOOK, PURE]) {
    assert.doesNotMatch(src, /\b(768|1024)\b/, 'a breakpoint threshold has been copied');
    assert.doesNotMatch(src, /Breakpoints\s*\./, 'derive the bucket, do not re-compare thresholds');
  }
});

test('NO component bypasses the stepped scaler or reaches for the weak grey', () => {
  /*
   * MAJOR 2 of the review: five of fifteen were converted, so on the iPad the
   * question card stepped to 1.25-1.35x while the header, the wizard buttons,
   * the retake sheet and the report around it stayed at 1.0x — and the step
   * counter sitting directly above the question kept the 4.62:1 grey the
   * product owner named.
   */
  for (const f of COMPONENTS) {
    const src = SRC[f];
    assert.match(src, /useIntakeLegibility\(\)/, `${f} does not use the shared hook`);
    assert.doesNotMatch(src, /getScaledFontSize|getScaledFontWeight/, `${f} bypasses the tablet step`);
    assert.doesNotMatch(src, /useAccessibility\(/, `${f} re-reads the store behind the hook`);
    assert.doesNotMatch(src, /colors\.subtext/, `${f} still uses the 4.62:1 grey`);
    assert.doesNotMatch(src, /#DC2626/i, `${f} still uses the sub-AA red`);
    assert.doesNotMatch(src, /fontSize: \d/, `${f} has a size no scaler can reach`);
  }
});

// ── 5. Tap targets (MAJOR 4) ────────────────────────────────────────────────

test('EVERY minHeight in the folder is at least 44pt, not just the first one', () => {
  /*
   * The previous round asserted `/minHeight:\s*(\d+)/.exec(src)` — first match
   * only. SingleChoiceQuestion.tsx has two (the option row and the "Please
   * specify…" input), and the reviewer PROVED the row's floor was unpinned by
   * deleting it and watching the test stay green. Everything scaled by fs() can
   * shrink at the smallest system font scale, so every floor matters for a
   * patient with a tremor.
   */
  let checked = 0;
  for (const f of COMPONENTS) {
    const hits = [...SRC[f].matchAll(/minHeight:\s*(\d+)/g)];
    for (const m of hits) {
      assert.ok(Number(m[1]) >= 44, `${f} has minHeight ${m[1]}, under Apple's 44pt`);
      checked++;
    }
  }
  // A refactor that deletes the floors must not read as "all floors pass".
  assert.ok(checked >= 8, `expected the folder's tap-target floors, found ${checked}`);
  for (const f of ['questions/ScaleQuestion.tsx', 'questions/SingleChoiceQuestion.tsx', 'questions/MultiChoiceQuestion.tsx']) {
    assert.equal(
      [...SRC[f].matchAll(/minHeight:/g)].length >= 1,
      true,
      `${f} has no minHeight — padding alone drops under 44pt once the glyph scales`,
    );
  }
  // SingleChoiceQuestion is the specific file the first-match read hid.
  assert.equal(
    [...SRC['questions/SingleChoiceQuestion.tsx'].matchAll(/minHeight:\s*44\b/g)].length,
    2,
    'SingleChoiceQuestion must floor BOTH the option row and the specify input',
  );
});

test("the specify input's indent follows the scaled glyph it sits under", () => {
  /*
   * It was a hardcoded marginLeft: 32, derived by hand from icon(22) +
   * marginLeft(10) back when the icon was a hardcoded 22. The icon now reaches
   * 60pt at max accessibility scale, so the input drifted out from under its
   * own label.
   */
  const src = SRC['questions/SingleChoiceQuestion.tsx'];
  assert.match(src, /marginLeft: fs\(ICON\) \+ LABEL_GAP/);
  assert.match(src, /size=\{fs\(ICON\)\}/, 'the glyph must use the same base');
  assert.match(src, /marginLeft: LABEL_GAP/, 'the label must use the same gap');
  assert.doesNotMatch(src, /marginLeft: 32/, 'the hand-derived offset is back');
});

// ── 6. Placeholders read as prompts, not as answers ─────────────────────────

test('no placeholder is a plausible answer', () => {
  /*
   * NumberQuestion's was "0" and HeightQuestion's were "5", "11" and "180", all
   * rendered in AA secondary text — so an untouched height question read as
   * pre-filled with 5 ft 11 in and the patient tapped a dead Next with nothing
   * on screen to explain it.
   */
  for (const f of COMPONENTS) {
    for (const m of SRC[f].matchAll(/placeholder=(?:"([^"]*)"|\{'([^']*)'\})/g)) {
      const text = m[1] ?? m[2];
      assert.doesNotMatch(
        text,
        /^[\d.\s]+$/,
        `${f} placeholder "${text}" reads as an entered value`,
      );
    }
  }
  assert.match(SRC['questions/HeightQuestion.tsx'], /placeholder="e\.g\. 5"/);
  assert.match(SRC['questions/HeightQuestion.tsx'], /placeholder="e\.g\. 11"/);
  assert.match(SRC['questions/HeightQuestion.tsx'], /placeholder="e\.g\. 180"/);
});

// ── 7. COS-1223 — the claims round 2 made but did not pin ───────────────────

const REPORT = strip(read(`${DIR}/IntakeReportScreen.tsx`));
const RETAKE = strip(read(`${DIR}/RetakeSectionSheet.tsx`));

test('the surface list is the one the folder really paints secondary text on', () => {
  /*
   * The surfaces above are only honest if they are the surfaces in use. card and
   * background are obvious; `border` is the one the previous round's audit
   * missed, so its two sites are asserted here. If either moves, this fails and
   * whoever moved it re-derives the list instead of inheriting a stale one.
   */
  // A pressed retake row fills with colors.border, and its rows print `muted`.
  assert.match(RETAKE, /backgroundColor: pressed \? colors\.border : 'transparent'/);
  assert.match(RETAKE, /color: muted,/);
  // The neutral score pill is literally `muted` text on a `colors.border` fill.
  assert.match(REPORT, /pillPalette\(block\.interpretation, muted, colors\.border\)/);
  assert.match(REPORT, /return \{ fg: neutralFg, bg: neutralBg \};/);
  assert.match(REPORT, /color: palette\.fg,/);
  // Three surfaces, both themes — so the loop above cannot shrink silently.
  for (const theme of ['light', 'dark'] as const) {
    assert.deepEqual(Object.keys(SURFACE[theme]).sort(), ['background', 'border', 'card']);
  }
});

test('THE POINT: the headline grey of this epic is pinned, token as it ships', () => {
  /*
   * The single most user-visible change in COS-1216/1221 — "a light gray font
   * makes it very difficult to read" — had no test. The reviewer reverted
   * LightColors.secondary from '#4B5563' back to '#687076' and the suite
   * reported 2541 passed / 0 failed, because the only surfaces being checked
   * were the two the old grey happened to clear.
   *
   * Nothing here hardcodes the new value: the token is read out of
   * design-system.ts as it ships and measured. Put '#687076' back and this
   * fails on light.border, as does the AA loop in section 2.
   */
  const COMPLAINED_ABOUT = '#687076';
  assert.ok(
    ratio(COMPLAINED_ABOUT, SURFACE.light.border) < AA,
    'premise gone: the old grey now clears AA on colors.border',
  );
  assert.notEqual(
    TOKENS.light.muted,
    COMPLAINED_ABOUT,
    'LightColors.secondary is back to the grey the product owner reported',
  );
  for (const [name, bg] of Object.entries(SURFACE.light)) {
    const r = ratio(TOKENS.light.muted, bg);
    assert.ok(r >= AA, `light secondary ${TOKENS.light.muted} on ${name} ${bg} is ${r.toFixed(2)}:1`);
  }
});

/** design-system's AA-verified fg/bg pairs, read from source like everything else. */
const BANDS = Object.fromEntries(
  [...block(DESIGN, /export const ScoreBands = \{/, 'ScoreBands').matchAll(
    /(\w+):\s*\{\s*fg:\s*'(#[0-9a-fA-F]{3,6})',\s*bg:\s*'(#[0-9a-fA-F]{3,6})'/g,
  )].map((m) => [m[1], { fg: m[2], bg: m[3] }]),
);

test('THE POINT: every screener interpretation pill clears AA, and none is hand-picked', () => {
  /*
   * MAJOR 2 of the COS-1223 review. Round 2 edited this six-constant block and
   * fixed one pair of the three, leaving a patient's own screener reading at:
   *   moderate #D97706 on #FEF3C7  2.86:1
   *   strong   #199C4F on #DCFCE7  3.24:1
   * both normal text at 11pt bold. There was no test over this palette at all,
   * so reverting POSITIVE_FG to #DC2626 (3.95:1) would also have stayed green.
   */
  assert.ok(Object.keys(BANDS).length >= 4, 'could not read ScoreBands out of design-system');

  const bandRefs = [...REPORT.matchAll(/ScoreBands\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(bandRefs)].sort(),
    ['foundational', 'optimal'],
    'the moderate/strong pills must come from ScoreBands, not from new hexes',
  );

  const pairs: [string, string, string][] = [
    ['positive', constHex(REPORT, 'POSITIVE_FG', 'IntakeReportScreen'), constHex(REPORT, 'POSITIVE_BG', 'IntakeReportScreen')],
    ...bandRefs.map((n) => [`ScoreBands.${n}`, BANDS[n].fg, BANDS[n].bg] as [string, string, string]),
    // The neutral pill: `muted` on `colors.border`, in both themes.
    ...(['light', 'dark'] as const).map(
      (t) => [`neutral.${t}`, TOKENS[t].muted, SURFACE[t].border] as [string, string, string],
    ),
  ];
  for (const [name, fg, bg] of pairs) {
    const r = ratio(fg, bg);
    assert.ok(r >= AA, `pill ${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
  }
  // Four pairs is the whole switch — a fifth bucket must be audited, not added.
  assert.equal(pairs.length, 5, 'pillPalette grew a branch that nothing measured');

  // And the sub-AA hexes cannot come back into this screen.
  for (const dead of ['#D97706', '#FEF3C7', '#DCFCE7', '#DC2626']) {
    assert.doesNotMatch(REPORT, new RegExp(dead, 'i'), `${dead} is back in the pill palette`);
  }
});

/**
 * Every colour this folder hands to a Text, as written in the source.
 *
 * `color:` only ever appears in a React Native style object here — icons take a
 * `color=` JSX prop, and the PDF's CSS is a template literal, so values holding
 * `;` or `${` are skipped. For a ternary only the branches are colours, so the
 * condition before the first `?` is dropped.
 */
function textColorOperands(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?<![A-Za-z])color:\s*([^,\n}]+)/g)) {
    let v = m[1].trim();
    if (v.includes(';') || v.startsWith('${')) continue;
    if (v.includes('?')) v = v.slice(v.indexOf('?') + 1);
    for (const op of v.split(':').map((x) => x.trim()).filter(Boolean)) out.push(op);
  }
  return out;
}

test('THE POINT: no accent is painted AS text except the one leftover we audited', () => {
  /*
   * MAJOR 3. Round 2's claim was that "the accent used AS text" had been found
   * and derived so it could not recur. Two sites in IntakeCtaCard said otherwise
   * and neither was in its 33-row table:
   *
   *   'COMPLETED'      COMPLETED_ACCENT on colors.card   3.26:1 light / 4.60:1 dark
   *   'View my intake' a hardcoded white on the accent   3.55:1 both themes
   *
   * So the sweep is mechanical now: every text colour in the folder must be a
   * theme token, an AA token from the hook, or derived through readableOn. The
   * exceptions are listed, with the fill each one sits on, and nothing may join
   * the list without a measured pair.
   */
  // `actionTint` is the hook's AA-safe accent FOR TEXT (COS-1223): light
  // primaryDark #0F766E 5.02:1 on card, dark primary #2DD4BF 8.78:1 on dark
  // card. It exists because `colors.tint` is an AA fill but NOT AA text
  // (4.38:1 on card, 3.42:1 dark) — measured below, so it is derived, not an
  // unaudited literal.
  const DERIVED = /^(colors\.\w+|muted|error|actionTint|readableOn\(.+\)|onAccent|ON_COMPLETED_ACCENT|palette\.fg)$/;

  /** operand -> the fill it is painted on, resolved below. */
  const AUDITED: Record<string, { on: string; why: string }> = {
    // Three spellings of white, every one of them on a solid button fill.
    "'#fff'": { on: TINT as string, why: 'primary button on colors.tint' },
    "'#ffffff'": { on: TINT as string, why: 'complete-view CTA on colors.tint' },
    "'#FFFFFF'": { on: TINT as string, why: 'height unit toggle, active, on colors.tint' },
    // The one genuine accent-as-text left in the folder: the report's group
    // header title. Out of scope for COS-1223 (reported, not changed) — but it
    // is named here so it cannot be mistaken for "all clear".
    'group.color': { on: '', why: 'IntakeReportScreen group header — OPEN, see notes' },
  };

  const found = new Set<string>();
  for (const f of COMPONENTS) {
    for (const op of textColorOperands(SRC[f])) {
      if (!DERIVED.test(op)) found.add(op);
    }
  }
  assert.deepEqual(
    [...found].sort(),
    Object.keys(AUDITED).sort(),
    'an unaudited text colour appeared — measure it against its fill and list it',
  );

  // The whites are only acceptable because their fill is dark enough. Measured,
  // not assumed: ShareIntakeReportSection's own ACCENT is checked too.
  const SHARE_ACCENT = constHex(strip(read(`${DIR}/ShareIntakeReportSection.tsx`)), 'ACCENT', 'ShareIntakeReportSection');
  for (const fill of [AUDITED["'#fff'"].on, SHARE_ACCENT]) {
    const r = ratio('#FFFFFF', fill);
    assert.ok(r >= AA, `a white label sits on ${fill} at ${r.toFixed(2)}:1`);
  }

  // IntakeCtaCard's two sites specifically: derived, and the accent is a fill.
  const CTA = SRC['IntakeCtaCard.tsx'];
  assert.match(CTA, /const ON_COMPLETED_ACCENT = readableOn\(COMPLETED_ACCENT\)/);
  assert.match(CTA, /color: readableOn\(colors\.card\)/, 'the COMPLETED label must derive from its surface');
  assert.match(CTA, /color: ON_COMPLETED_ACCENT,/, 'the button label must derive from the accent');
  assert.match(CTA, /color=\{ON_COMPLETED_ACCENT\}/, 'the button glyph must derive from the accent too');
  const CTA_ACCENT = constHex(CTA, 'COMPLETED_ACCENT', 'IntakeCtaCard');
  assert.ok(ratio('#FFFFFF', CTA_ACCENT) < AA, 'premise gone: white now clears AA on the completed accent');
  assert.ok(
    ratio(readableOn(CTA_ACCENT), CTA_ACCENT) >= AA,
    `derived label on ${CTA_ACCENT} is ${ratio(readableOn(CTA_ACCENT), CTA_ACCENT).toFixed(2)}:1`,
  );
  // Both themes for the status label, since it is the surface that varies.
  for (const theme of ['light', 'dark'] as const) {
    const r = ratio(readableOn(SURFACE[theme].card), SURFACE[theme].card);
    assert.ok(r >= AA, `${theme} COMPLETED label is ${r.toFixed(2)}:1 on its card`);
    assert.ok(ratio(CTA_ACCENT, SURFACE[theme].card) < 21, 'sanity');
  }
  // And the inactive section chip, the other accent-as-text round 2 fixed, is
  // still not painting the accent — this is what pins THAT claim.
  assert.match(SRC['IntakeProgressHeader.tsx'], /color: isActive \? readableOn\(chipColor\) : colors\.text/);
});

// ── 8. COS-1223 — phone geometry did not move ──────────────────────────────

/**
 * The folder's six glyph boxes, with the fixed phone size each one had before
 * COS-1216 (git HEAD's StyleSheet blocks) and the glyph it wraps.
 *
 * Round 2 derived all six as `glyph * 2`, asserting each was "already ~2x its
 * glyph at scale 1". Three were not, which moved four phone measurements at
 * default scale. Each box is scaled through the same `fs()` pipeline as its
 * glyph instead, so phone at default scale is the pre-epic number exactly.
 */
const BOXES: { file: string; name: string; box: number; glyph: number; wasDerivedAs: number }[] = [
  { file: 'IntakeCtaCard.tsx', name: 'bannerBox', box: 40, glyph: 22, wasDerivedAs: 44 },
  { file: 'IntakeCtaCard.tsx', name: 'chipBox', box: 44, glyph: 22, wasDerivedAs: 44 },
  { file: 'IntakeReportScreen.tsx', name: 'backBtn', box: 44, glyph: 24, wasDerivedAs: 48 },
  { file: 'IntakeReportScreen.tsx', name: 'groupBadge', box: 36, glyph: 18, wasDerivedAs: 36 },
  { file: 'RetakeSectionSheet.tsx', name: 'badge', box: 36, glyph: 20, wasDerivedAs: 40 },
  { file: 'ShareIntakeReportSection.tsx', name: 'badge', box: 40, glyph: 20, wasDerivedAs: 40 },
];

test('THE POINT: phone at default scale renders the pre-epic box sizes exactly', () => {
  /*
   * "Phone sizing is currently good" + this folder's own comment that phone must
   * not move. Three of the six boxes were not 2x their glyph, so `glyph * 2`
   * grew bannerIcon 40->44, rowIcon 36->40 (and its radius 18->20) and the
   * report's back button 44->48 on every phone at default settings.
   */
  for (const b of BOXES) {
    assert.equal(
      intakeFontSize(b.box, 'phone', plain),
      b.box,
      `${b.file} ${b.name} moved on the phone`,
    );
  }
  const moved = BOXES.filter((b) => b.box !== b.wasDerivedAs);
  assert.equal(moved.length, 3, 'the three mis-derived boxes are the record of what this fixed');
});

test('each box is declared as its own pre-epic size, not as glyph x 2', () => {
  for (const b of BOXES) {
    const src = SRC[b.file];
    assert.match(
      src,
      new RegExp(`const ${b.name} = (?:fs|scale)\\(${b.box}\\);`),
      `${b.file} ${b.name} must be (fs|scale)(${b.box})`,
    );
    assert.match(src, new RegExp(`(?:fs|scale)\\(${b.glyph}\\)`), `${b.file} lost its ${b.glyph}pt glyph`);
  }
  // No box anywhere in the folder is a multiple of its glyph any more.
  for (const f of COMPONENTS) {
    assert.doesNotMatch(SRC[f], /(?:fs|scale)\(\d+\) \* \d/, `${f} still derives a box as glyph x N`);
  }
});

test('the boxes still outgrow their glyphs, which is why they are derived at all', () => {
  /*
   * The point of deriving them was that a fixed 40pt circle cannot hold a 22pt
   * glyph once that glyph reaches the tablet step x the patient's own scale.
   * Scaling the box through the same pipeline keeps the ORIGINAL proportion at
   * every scale, so it never clips any worse than it did on the phone at 1x.
   */
  const maxed = (n: number) => n * 2;
  for (const b of BOXES) {
    for (const bp of ['phone', 'tabletPortrait', 'tabletLandscape'] as const) {
      for (const scaler of [plain, maxed]) {
        const boxPt = intakeFontSize(b.box, bp, scaler);
        const glyphPt = intakeFontSize(b.glyph, bp, scaler);
        assert.ok(
          boxPt >= glyphPt,
          `${b.file} ${b.name} ${boxPt}pt cannot hold a ${glyphPt}pt glyph (${bp})`,
        );
        assert.ok(
          boxPt / glyphPt >= b.box / b.glyph - 0.05,
          `${b.file} ${b.name} lost padding around its glyph at ${bp}`,
        );
      }
    }
  }
});

// ── 9. COS-1223 — citations that cannot rot ────────────────────────────────

test('no comment in this folder cites a line number, and the cited symbol exists', () => {
  /*
   * ScaleQuestion.tsx cited "IntakeQuestionRenderer.tsx:89" for the screener
   * check. Round 2 added three comment lines to that file and did not re-check
   * its own citation, so it pointed three lines short of `if (q.screener)`
   * within the same round. Symbols survive edits; line numbers do not.
   *
   * Read RAW, not stripped — the citation lives in a comment.
   */
  for (const f of [...COMPONENTS, 'intake-legibility.ts', 'use-intake-legibility.ts']) {
    assert.doesNotMatch(
      read(`${DIR}/${f}`),
      /\.tsx?:\d+/,
      `${f} cites a line number — name the symbol instead`,
    );
  }

  const renderer = read(`${DIR}/IntakeQuestionRenderer.tsx`);
  assert.match(read(`${DIR}/questions/ScaleQuestion.tsx`), /IntakeQuestionRenderer's `renderLeaf`/);
  assert.match(renderer, /function renderLeaf\(/, 'ScaleQuestion cites a symbol that no longer exists');
  // And the behaviour the citation describes is still true.
  const screener = renderer.indexOf('if (q.screener)');
  const typeSwitch = renderer.indexOf('switch (q.type)');
  assert.ok(screener > 0 && typeSwitch > screener, 'q.screener no longer wins over q.type');
});
