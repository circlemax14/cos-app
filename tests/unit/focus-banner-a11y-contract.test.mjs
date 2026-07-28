// tests/unit/focus-banner-a11y-contract.test.mjs — CHUNK 110 (2026-07-23)
//
// Source-drift trip wires for the BpsPlanFocusBanner accessibility +
// tap-target contract landed in chunk 88 on
// components/health-plan/BpsPlanFocusBanner.tsx.
//
// BACKGROUND
// ----------
// Chunk 88 hardened the focus banner (chunk 60) so it complies with:
//   - Apple HIG / WCAG 4.1.2: an interactive control must expose a role
//     ("button") plus a human-readable name.
//   - Apple HIG: labels describe the control, hints describe what
//     happens after activation.
//   - Apple HIG + WCAG 2.5.5 (target size, Level AAA): tap targets are
//     at least 44 x 44 points — the banner is a single row, so we pin
//     its minHeight to 44 (hitSlop:8 is belt-and-suspenders on top).
//   - Nielsen / iOS press feedback: sighted users need a visible
//     press affordance (opacity dip or android_ripple) so a tap that
//     will scroll the surface doesn't feel dead.
//
// The banner is a single Pressable, so a benign-looking refactor
// ("clean up the style array", "extract the label into a helper",
// "drop the role since Pressable already announces as button on iOS")
// silently regresses one or more of these axes. VoiceOver / TalkBack
// still fire, so the runtime looks fine — the a11y contract just gets
// quietly worse.
//
// This test — like meds-card-a11y-contract (chunk 106), tab-bar-a11y-
// contract, trends-band-pill-a11y-contract, wellbeing-card-a11y-labels
// — is a source-drift trip wire: it reads BpsPlanFocusBanner.tsx as
// text, strips comments through the shared helper
// (./strip-comments.mjs — chunk 103), and asserts the load-bearing
// literals + style values are still present.
//
// If any wire fails: DO NOT tweak the regex to make it pass. Read the
// diff on BpsPlanFocusBanner.tsx, confirm the drift is deliberate
// (Ken-signed OR chunk-labeled with a re-derived a11y spec), and only
// then update the wire in lockstep.
//
// npm test glob: `node --test tests/unit/*.test.ts tests/unit/*.test.mjs
// lib/*.test.mjs` picks this file up via the `.test.mjs` extension. No
// config change needed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const BANNER_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BpsPlanFocusBanner.tsx',
)
const BANNER_SRC_RAW = readFileSync(BANNER_PATH, 'utf8')
const BANNER_SRC = stripComments(BANNER_SRC_RAW)

// -------------------------------------------------------------------------
// Shared helper — reused shape from meds-card-a11y-contract (chunk 106).
// Given a JSX opening-tag anchor regex, return the substring from the
// enclosing `<Tag` up to and including the tag's opening `>`. We use
// this to isolate the <Pressable ...> opening tag so we can inspect its
// attributes without accidentally matching attributes on adjacent nodes
// (MaterialIcons, Text).
//
// The banner's JSX has no `>` characters embedded inside its attribute
// expressions (the style prop uses `({ pressed }) => [...]` which
// contains `=>`, not `>` — arrow tokens contain `>` but always paired
// with `=` as `=>`, never as a bare `>` that would close a tag). The
// walk-forward-to-next-`>` shortcut still works, but we defend against
// `=>` by rejecting a match when the `>` is immediately preceded by
// `=` (i.e. an arrow token, not a tag terminator).
// -------------------------------------------------------------------------
function openingTagContaining(src, tagName, anchorRegex) {
  const anchorMatch = anchorRegex.exec(src)
  if (!anchorMatch) return null
  const anchorIdx = anchorMatch.index
  const prefix = src.slice(0, anchorIdx)
  const startIdx = prefix.lastIndexOf(`<${tagName}`)
  if (startIdx < 0) return null
  // Walk forward from the anchor to the next `>` that is NOT part of
  // an arrow token `=>`. Loop instead of a single indexOf so a style
  // callback like `({ pressed }) => [...]` doesn't short-circuit us.
  let scan = anchorIdx
  while (scan < src.length) {
    const rel = src.indexOf('>', scan)
    if (rel < 0) return null
    if (src[rel - 1] === '=') {
      scan = rel + 1
      continue
    }
    return src.slice(startIdx, rel + 1)
  }
  return null
}

// The single <Pressable ...> in this file is unambiguous — the banner
// renders exactly one interactive node. Anchor by the load-bearing
// `onPress={` attribute, which sits inside the Pressable's opening tag.
const PRESSABLE_TAG = openingTagContaining(
  BANNER_SRC,
  'Pressable',
  /onPress=\{/,
)

// =========================================================================
// (a) Pressable has accessibilityRole="button".
//
// Chunk 88 wire. On iOS, Pressable is announced as a generic "button"
// by VoiceOver even without an explicit role — but on Android TalkBack
// (and on iOS when the element gets wrapped by a future refactor into
// a plain View), the role must be explicit to be announced. Dropping
// `accessibilityRole="button"` silently regresses TalkBack semantics
// AND breaks the "if we later wrap this in something else" future.
// =========================================================================

test('(a) BpsPlanFocusBanner Pressable declares accessibilityRole="button"', () => {
  assert.ok(
    PRESSABLE_TAG !== null,
    'BpsPlanFocusBanner.tsx must retain a single <Pressable onPress={…}> as the interactive banner root. If this is null the file no longer renders a Pressable at all — the whole a11y contract is gone.',
  )
  assert.match(
    PRESSABLE_TAG,
    /accessibilityRole\s*=\s*["']button["']/,
    `BpsPlanFocusBanner.tsx must declare accessibilityRole="button" on the Pressable. Chunk 88 pinned this because TalkBack does NOT auto-derive the role from Pressable — dropping it makes Android AT users hear an unlabeled control. Found opening tag:\n${PRESSABLE_TAG}`,
  )
})

// =========================================================================
// (b) accessibilityLabel template contains "Focus this week" AND
//     "Tap to jump" AND interpolates the domain name (expression, not
//     a static string).
//
// Chunk 88 spec:
//   const a11yLabel = `Focus this week: your ${domainNoun}. Tap to jump there.`
//
// Three sub-wires:
//   b.1 — literal "Focus this week" survives (identifies the surface).
//   b.2 — literal "Tap to jump" survives (identifies the action).
//   b.3 — the label body is a template literal OR string+expression
//         that interpolates a domain-derived variable, NOT a static
//         string. This is the load-bearing anti-drift: a well-meaning
//         refactor "Focus this week. Tap to jump there." (dropping
//         `${domainNoun}`) still passes b.1+b.2 but strips the domain
//         name from every VoiceOver utterance — the whole point of
//         the banner (surface WHICH domain to focus on) is lost.
//
// Detection strategy for b.3:
//   - Grab the RHS of `const a11yLabel = …` up to the terminating
//     backtick/quote. That expression must contain a `${...}`
//     interpolation (template literal) OR a `+ variable` concat.
//     Assert on `${` — the only interpolation shape in this file.
// =========================================================================

test('(b) accessibilityLabel carries "Focus this week" + "Tap to jump" + a domain interpolation', () => {
  // b.1 — chunk 88 wording anchor: surface identifier.
  assert.match(
    BANNER_SRC,
    /Focus this week/,
    'BpsPlanFocusBanner.tsx must retain the literal "Focus this week" in its accessibilityLabel copy. Chunk 88 pinned this phrase because it names the surface for VoiceOver users; rewording to "This week\'s focus" or "Your priority" drifts the contract without a compile signal.',
  )
  // b.2 — chunk 88 wording anchor: action identifier.
  assert.match(
    BANNER_SRC,
    /Tap to jump/,
    'BpsPlanFocusBanner.tsx must retain the literal "Tap to jump" in its accessibilityLabel copy. Chunk 88 pinned this phrase because it tells VoiceOver users the banner is navigational (contract mirrors accessibilityHint "Scrolls to your focus domain section"). Rewording to "Tap to open" or "Tap for details" drifts the spec.',
  )
  // b.3 — the label RHS must interpolate a domain-derived variable.
  // Grab the RHS of `const a11yLabel = …` up to end of line (banner
  // uses a single-line template literal).
  const labelDeclMatch =
    /const\s+a11yLabel\s*=\s*([^\n]+)/.exec(BANNER_SRC)
  assert.ok(
    labelDeclMatch !== null,
    'BpsPlanFocusBanner.tsx must retain a `const a11yLabel = …` declaration. Chunk 88 named this identifier explicitly; inlining the label back into the JSX prop hides it from this wire and from grep-based reviews.',
  )
  const labelRhs = labelDeclMatch[1]
  assert.match(
    labelRhs,
    /\$\{[^}]+\}/,
    `BpsPlanFocusBanner.tsx accessibilityLabel must interpolate a domain-derived variable (e.g. \`\${domainNoun}\`) — NOT be a static string. The whole point of the banner is to surface WHICH BPS domain to focus on; a static label ("Focus this week. Tap to jump there.") passes VoiceOver but hides the domain name and defeats the chunk 60 focus signal. Found RHS: ${labelRhs}`,
  )
})

// =========================================================================
// (c) accessibilityHint contains "Scrolls to your focus domain section".
//
// Chunk 88 verbatim:
//   const a11yHint = 'Scrolls to your focus domain section'
//
// Apple HIG splits label (what the control is) from hint (what happens
// after activation). Dropping the hint drops the after-activation
// signal — VoiceOver users can hear the composed label but don't know
// tapping will scroll the surface. Rewording ("Jumps to the section",
// "Opens the domain") loses the "focus domain" anchor phrase that
// mirrors the banner copy.
// =========================================================================

test('(c) accessibilityHint carries the chunk-88 verbatim "Scrolls to your focus domain section"', () => {
  assert.match(
    BANNER_SRC,
    /Scrolls to your focus domain section/,
    'BpsPlanFocusBanner.tsx must retain the literal accessibilityHint "Scrolls to your focus domain section" (chunk 88 verbatim). This is the after-activation description VoiceOver users hear on focus; rewording or removing it breaks the Apple HIG label-vs-hint contract chunk 88 landed.',
  )
})

// =========================================================================
// (d) minHeight in a StyleSheet block is >= 44 (WCAG 2.5.5 target size).
//
// Chunk 88 pinned minHeight: 44 on styles.banner. The banner is a
// single row so its intrinsic height is Text-driven and shrinks under
// smaller Dynamic Type — minHeight is what guarantees the tap target
// stays at Apple HIG's 44pt floor even when the OS shrinks the font.
//
// Detection: /minHeight\s*:\s*(\d+)/ against the stripped source,
// captured number >= 44. If the value drops (48 → 32) the WCAG
// target-size AAA promise regresses. If the property vanishes
// entirely (someone "cleans up" the StyleSheet), the regex fails
// with a clear message instead of a silent NaN pass.
// =========================================================================

test('(d) StyleSheet block declares minHeight >= 44 (WCAG 2.5.5 tap target)', () => {
  const minHeightMatch = /minHeight\s*:\s*(\d+)/.exec(BANNER_SRC)
  assert.ok(
    minHeightMatch !== null,
    'BpsPlanFocusBanner.tsx StyleSheet must declare a numeric minHeight on the banner style. Chunk 88 landed minHeight: 44 to guarantee Apple HIG / WCAG 2.5.5 AAA 44pt target size even under shrunken Dynamic Type. Dropping the property silently regresses the tap target when the OS shrinks the font.',
  )
  const captured = Number(minHeightMatch[1])
  assert.ok(
    Number.isFinite(captured) && captured >= 44,
    `BpsPlanFocusBanner.tsx StyleSheet minHeight must be >= 44 (WCAG 2.5.5 AAA + Apple HIG). Chunk 88 pinned 44; found ${captured}. Shrinking below 44 regresses the tap-target contract on low-motor-precision / large-fingered users — do not tweak the wire, restore the value.`,
  )
})

// =========================================================================
// (e) Pressable renders visible press feedback (opacity dip or ripple)
//     so sighted users see the tap register.
//
// Chunk 88 keeps two press affordances on the Pressable:
//   - iOS: `style={({ pressed }) => [..., { opacity: pressed ? 0.7 : 1 }]}`
//   - Android: `android_ripple={{ color: palette.border }}`
//
// The task-supplied matcher is /pressed\s*[?:&|]|opacity\s*:/ — it
// catches EITHER the `pressed ? … : …` ternary in the style callback
// OR any `opacity: …` declaration (covers both the ternary shorthand
// and a style-array split that names `opacity` in the array element).
// android_ripple is a separate belt-and-suspenders — we could pin it
// too, but the task specifies the opacity/ripple matcher, so we hold
// to that surface and let the ripple be an implicit bonus.
// =========================================================================

test('(e) Pressable renders visible press feedback (opacity dip or ripple)', () => {
  assert.match(
    BANNER_SRC,
    /pressed\s*[?:&|]|opacity\s*:/,
    'BpsPlanFocusBanner.tsx Pressable must render visible press feedback — either a `pressed ? 0.7 : 1` opacity ternary in the style callback OR an explicit `opacity: …` declaration. Sighted users need this affordance to know their tap registered before the surface scrolls; dropping it leaves the banner feeling dead even when the tap works.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / chunk 106 discipline — prove the
// traps snap shut on the exact drift shapes they exist to catch)
//
// These tests do NOT read BpsPlanFocusBanner.tsx. They synthesise a
// minimal "known good" banner-shaped source that passes wires (a),
// (b), (d), then mutate it in the drift shapes the task named:
//   1. Drop accessibilityRole="button"       → wire (a) fails
//   2. Make accessibilityLabel a static string → wire (b.3) fails
//   3. Shrink minHeight to 32                → wire (d) fails
//
// If any of these self-checks flip green on the tightened wire, the
// paired production wire above is toothless against the exact drift
// it exists to catch.
// =========================================================================

const SYNTHETIC_GOOD_BANNER = [
  'function BpsPlanFocusBanner({ enabled, focus, onPress }) {',
  '  const domainNoun = "Sleep";',
  '  const a11yLabel = `Focus this week: your ${domainNoun}. Tap to jump there.`',
  '  const a11yHint = "Scrolls to your focus domain section"',
  '  return (',
  '    <Pressable',
  '      onPress={() => onPress("bio")}',
  '      accessibilityRole="button"',
  '      accessibilityLabel={a11yLabel}',
  '      accessibilityHint={a11yHint}',
  '      android_ripple={{ color: "#0D948833" }}',
  '      style={({ pressed }) => [styles.banner, { opacity: pressed ? 0.7 : 1 }]}',
  '    >',
  '      <Text>{a11yLabel}</Text>',
  '    </Pressable>',
  '  );',
  '}',
  'const styles = StyleSheet.create({',
  '  banner: {',
  '    flexDirection: "row",',
  '    minHeight: 44,',
  '  },',
  '});',
].join('\n')

test('self-check: synthetic good source PASSES all wires — sanity that the fixture matches production shape', () => {
  const src = stripComments(SYNTHETIC_GOOD_BANNER)
  const tag = openingTagContaining(src, 'Pressable', /onPress=\{/)
  assert.ok(
    tag !== null,
    'self-check setup: the synthetic fixture must expose a <Pressable onPress={…}> so the wire (a) helper can find it.',
  )
  assert.match(
    tag,
    /accessibilityRole\s*=\s*["']button["']/,
    'self-check setup: the synthetic fixture must retain accessibilityRole="button" — otherwise the (a) mutation self-check is meaningless.',
  )
  const labelRhs = /const\s+a11yLabel\s*=\s*([^\n]+)/.exec(src)?.[1]
  assert.ok(
    labelRhs && /\$\{[^}]+\}/.test(labelRhs),
    'self-check setup: the synthetic fixture must interpolate ${domainNoun} in a11yLabel — otherwise the (b) mutation self-check is meaningless.',
  )
  const mh = /minHeight\s*:\s*(\d+)/.exec(src)
  assert.ok(
    mh !== null && Number(mh[1]) >= 44,
    'self-check setup: the synthetic fixture must declare minHeight >= 44 — otherwise the (d) mutation self-check is meaningless.',
  )
  assert.match(
    src,
    /pressed\s*[?:&|]|opacity\s*:/,
    'self-check setup: the synthetic fixture must retain a press-feedback expression — otherwise wire (e) is not exercised.',
  )
  assert.match(
    src,
    /Scrolls to your focus domain section/,
    'self-check setup: the synthetic fixture must retain the chunk-88 hint verbatim — otherwise wire (c) is not exercised.',
  )
})

test('self-check: wire (a) FAILS when accessibilityRole="button" is dropped', () => {
  const mutated = SYNTHETIC_GOOD_BANNER.replace(
    '      accessibilityRole="button"\n',
    '',
  )
  const src = stripComments(mutated)
  const tag = openingTagContaining(src, 'Pressable', /onPress=\{/)
  assert.ok(
    tag !== null,
    'self-check: mutated fixture must still expose the Pressable so the wire can inspect it.',
  )
  const hasRole = /accessibilityRole\s*=\s*["']button["']/.test(tag)
  assert.equal(
    hasRole,
    false,
    'self-check: mutated fixture must NOT expose accessibilityRole="button" — otherwise this self-check does not exercise the drop-role regression shape.',
  )
  // Wire (a)'s core assertion is that hasRole is TRUE. Prove that on
  // this mutated source the wire's contract would fail:
  assert.notEqual(
    hasRole,
    true,
    'self-check: wire (a) MUST reject a source that dropped accessibilityRole="button". If this flips (hasRole somehow reads true on the mutation), wire (a) is toothless against the chunk-88 role-drop regression it exists to catch.',
  )
})

test('self-check: wire (b) FAILS when accessibilityLabel is made a static string (no interpolation)', () => {
  // Mutate: replace the template-literal RHS with a static string that
  // still contains the "Focus this week" + "Tap to jump" anchor phrases
  // (so b.1 and b.2 still pass) but drops the ${domainNoun} interpolation.
  // The whole banner value proposition (surface the domain name) is
  // gone even though the phrases survive.
  const mutated = SYNTHETIC_GOOD_BANNER.replace(
    'const a11yLabel = `Focus this week: your ${domainNoun}. Tap to jump there.`',
    'const a11yLabel = "Focus this week. Tap to jump there."',
  )
  const src = stripComments(mutated)
  const labelDeclMatch =
    /const\s+a11yLabel\s*=\s*([^\n]+)/.exec(src)
  assert.ok(
    labelDeclMatch !== null,
    'self-check: mutated fixture must still declare const a11yLabel so the wire finds it.',
  )
  const labelRhs = labelDeclMatch[1]
  const hasInterp = /\$\{[^}]+\}/.test(labelRhs)
  assert.equal(
    hasInterp,
    false,
    'self-check: mutated fixture must NOT interpolate — otherwise this self-check does not exercise the static-string regression shape.',
  )
  // The phrase-anchor sub-wires (b.1, b.2) SHOULD still pass on this
  // mutation — that's the whole point of separating them from (b.3):
  assert.match(
    src,
    /Focus this week/,
    'self-check sanity: static-string mutation must preserve "Focus this week" — proving that (b.1) is NOT what catches this drift.',
  )
  assert.match(
    src,
    /Tap to jump/,
    'self-check sanity: static-string mutation must preserve "Tap to jump" — proving that (b.2) is NOT what catches this drift.',
  )
  // Wire (b.3)'s core assertion is that hasInterp is TRUE. Prove that
  // on this mutated source the wire's contract would fail:
  assert.notEqual(
    hasInterp,
    true,
    'self-check: wire (b.3) MUST reject a source whose a11yLabel is a static string. If this flips (hasInterp somehow reads true on the mutation), wire (b) is toothless against a well-meaning "simplify the label" refactor that strips the domain interpolation while preserving the anchor phrases.',
  )
})

test('self-check: wire (d) FAILS when minHeight is shrunk to 32', () => {
  const mutated = SYNTHETIC_GOOD_BANNER.replace(
    'minHeight: 44,',
    'minHeight: 32,',
  )
  const src = stripComments(mutated)
  const minHeightMatch = /minHeight\s*:\s*(\d+)/.exec(src)
  assert.ok(
    minHeightMatch !== null,
    'self-check: mutated fixture must still declare a numeric minHeight so the wire finds it.',
  )
  const captured = Number(minHeightMatch[1])
  assert.equal(
    captured,
    32,
    'self-check: mutated fixture must report minHeight 32 — otherwise this self-check does not exercise the shrunken-target regression shape.',
  )
  const wirePasses = Number.isFinite(captured) && captured >= 44
  assert.equal(
    wirePasses,
    false,
    'self-check: wire (d) MUST reject a source whose minHeight is 32. If this flips (wirePasses somehow reads true on the mutation), wire (d) is toothless against a WCAG 2.5.5 regression — the exact reason chunk 88 pinned 44.',
  )
})

test('self-check: stripComments does NOT eat live code that shares a line with a trailing `// comment`', () => {
  // Belt-and-suspenders shared with meds-card-a11y-contract (chunk 106):
  // the stripper deliberately leaves trailing inline comments on code
  // lines UNTOUCHED. Prove that a real minHeight declaration with a
  // trailing comment on the SAME LINE is still visible to wire (d) —
  // so future contributors adding "// chunk 110 pin" trailers don't
  // accidentally blank the value out of scope.
  const src = '    minHeight: 44, // chunk 88 WCAG 2.5.5 pin'
  const stripped = stripComments(src)
  const match = /minHeight\s*:\s*(\d+)/.exec(stripped)
  assert.ok(
    match !== null && Number(match[1]) === 44,
    'self-check: stripComments must leave `minHeight: 44` intact on a code line with a trailing `//` comment. If this fails, wire (d) becomes fragile to future comment additions.',
  )
})
