// tests/unit/picker-empty-state-contract.test.mjs — CHUNK 124 (2026-07-23)
//
// Source-drift trip wires for the chunk-76 friendly-hourglass empty
// state + chunk-76 RAF-deferred VoiceOver focus polish that landed on
// the wellbeing-domain check-in picker in
// app/Home/wellbeing-domain-checkins.tsx.
//
// BACKGROUND
// ----------
// Chunk 76 replaced a stark blank-ScrollView failure mode with a warm
// centered fallback for the extreme edge where every DOMAIN_MEMBERS
// entry for a domain is coming-soon OR unknown to the instrument
// catalog. Instead of returning `null`, the picker now renders a
// hourglass icon plus a two-line copy block ("Nothing to take here
// yet" + "Come back soon — we're still building out check-ins for this
// area."), inside a single accessible group so VoiceOver reads the
// fallback as one intentional utterance instead of icon-then-line-
// then-line as three separate reads. The same chunk also lands
// VoiceOver focus on the header title after the screen has laid out —
// deferred via requestAnimationFrame so RN has actually committed the
// header View before AccessibilityInfo.setAccessibilityFocus fires,
// wrapped in try/catch because findNodeHandle can return null on a
// torn-down ref during a fast back-swipe and setAccessibilityFocus is
// a no-op on Android — a best-effort polish must never crash the
// picker.
//
// The trap this suite exists to catch: someone "simplifies" the empty
// state by returning `null` when DOMAIN_MEMBERS is empty, users get a
// blank screen AND VoiceOver users see nothing to focus. Or someone
// drops the requestAnimationFrame wrap around setAccessibilityFocus
// because "it works fine locally on iOS 18", and screen-reader focus
// lands on the RN default (usually the header back chevron reading
// "Back", not useful context for the picker). Or someone strips the
// findNodeHandle import when tree-shaking imports, and the RAF-inside
// try/catch swallows a ReferenceError that would otherwise crash
// loudly. All three regress silently for sighted developers.
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / chunk 103 /
// chunk 106 / chunk 112 pattern). Mirroring the runtime tree would
// require jsdom + react-native + expo shims + a react-query stub +
// @expo/vector-icons — dozens of MB of devDeps to observe a JSX branch
// on a rendered tree. Instead we read wellbeing-domain-checkins.tsx as
// text, strip comments through the shared ./strip-comments.mjs helper
// (chunk 103), and grep for the load-bearing shapes that guarantee the
// chunk-76 polish CANNOT silently regress.
//
// If any of these fail: DO NOT tweak the regex to make it pass. Read
// the diff on wellbeing-domain-checkins.tsx, confirm the change is
// deliberate (Ken-signed OR chunk-labeled with a re-derived spec),
// then update the wire in lockstep with the source.
//
// npm test glob: `node --test tests/unit/*.test.ts tests/unit/*.test.mjs …`
// picks this file up via the `.test.mjs` extension. No config change.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const PICKER_PATH = join(
  REPO_ROOT,
  'app',
  'Home',
  'wellbeing-domain-checkins.tsx',
)
const PICKER_SRC_RAW = readFileSync(PICKER_PATH, 'utf8')
const PICKER_SRC = stripComments(PICKER_SRC_RAW)

// =========================================================================
// Pure-function wire helpers. Each takes an arbitrary source string (real
// production source OR a mutated synthetic fixture from the self-
// verification section below) and returns a boolean for whether the paired
// trip wire's contract is currently satisfied. The production wires assert
// `helper(PICKER_SRC) === true`; the self-verification mutations assert
// `helper(mutated) === false`. Sharing one helper per wire between the two
// call sites is the point of the chunk-98-v2 discipline — if a self-check
// passes when the drift is present, the wire is toothless against the same
// drift in the real file.
// =========================================================================

/**
 * (a) Empty-state JSX branch: a MaterialIcons OR MaterialCommunityIcons
 * element whose `name` prop is one of the accepted hourglass variants
 * ("hourglass" / "hourglass-empty" / "hourglass-top"), AND at least one
 * warm copy string within ~800 characters of it. The proximity guard
 * makes "warm copy exists SOMEWHERE in the file + a hourglass icon
 * exists SOMEWHERE else" insufficient — the two must live together in
 * the same JSX branch.
 */
function hasEmptyStateHourglassBranch(src) {
  const iconRe =
    /<(?:MaterialIcons|MaterialCommunityIcons)\b[^>]*\bname=(?:"|')(?:hourglass|hourglass-empty|hourglass-top)(?:"|')[^>]*>/g
  const copyRe = getWarmCopyRegex()
  let m
  while ((m = iconRe.exec(src)) !== null) {
    const start = Math.max(0, m.index - 800)
    const end = Math.min(src.length, m.index + m[0].length + 800)
    const window = src.slice(start, end)
    if (copyRe.test(window)) return true
    copyRe.lastIndex = 0 // paranoia in case future refactor makes it /g
  }
  return false
}

/**
 * (b) At least one warm empty-state phrasing appears in the source.
 * Fuzzy-tolerant — accepts any of a set of plausible copy variants so a
 * minor reword ("come back soon" -> "check back later") doesn't
 * false-alarm, but a total drop of the friendly framing does. Case-
 * insensitive so "No check-ins" and "no check-ins" both count.
 */
function getWarmCopyRegex() {
  // Any of:
  //   "no check-ins" / "no check ins"
  //   "nothing here yet" / "nothing to take here yet"
  //   "check back" / "come back"
  //   "coming soon"
  //   "still building"
  return /(no\s+check[-\s]?ins?|nothing\s+(?:to\s+take\s+)?(?:here\s+)?yet|(?:check|come)\s+back|coming\s+soon|still\s+building)/i
}

function hasWarmEmptyStateCopy(src) {
  return getWarmCopyRegex().test(src)
}

/**
 * (c) A setAccessibilityFocus call site exists AND is deferred via
 * requestAnimationFrame OR setTimeout. The deferral matters: without
 * it, RN has not necessarily committed the header View when we ask
 * VoiceOver to focus it, and the focus request no-ops silently. Wire
 * (c) requires the deferral to sit within ~500 characters of the
 * setAccessibilityFocus reference — same file, same effect body — so a
 * stray RAF elsewhere in the file (a scroll animation, a debounce)
 * cannot satisfy the wire.
 */
function hasRafDeferredAccessibilityFocus(src) {
  const focusRe = /setAccessibilityFocus\b/g
  let m
  while ((m = focusRe.exec(src)) !== null) {
    const start = Math.max(0, m.index - 500)
    const end = Math.min(src.length, m.index + m[0].length + 500)
    const window = src.slice(start, end)
    if (/(?:requestAnimationFrame|setTimeout)\s*\(/.test(window)) return true
  }
  return false
}

/**
 * (d) findNodeHandle is imported from 'react-native'. Without the
 * import, calling findNodeHandle(headerRef.current) throws at runtime;
 * the try/catch around the RAF body would swallow the error and
 * VoiceOver focus would silently regress to the default (usually the
 * back chevron). This wire pins the specific import so a "clean up
 * unused imports" refactor cannot silently break the polish.
 */
function hasFindNodeHandleImportFromReactNative(src) {
  // Look for the multi-line named import block from 'react-native' and
  // require `findNodeHandle` inside it. Robust to whitespace / ordering
  // by walking each import block.
  const importRe = /import\s*\{([^}]+)\}\s*from\s*(?:'|")react-native(?:'|")/g
  let m
  while ((m = importRe.exec(src)) !== null) {
    const names = m[1]
    if (/\bfindNodeHandle\b/.test(names)) return true
  }
  return false
}

/**
 * (e) The empty-state container is NOT an unlabelled `accessible={true}`
 * wrapper swallowing everything. Chunk 76 shipped it accessible with a
 * composed accessibilityLabel so VoiceOver reads the fallback as ONE
 * intentional utterance. Chunk 99 v1 accidentally shipped an accessible
 * container WITHOUT an accessibilityLabel elsewhere, and VoiceOver
 * announced nothing — dead silence to the user. This wire assert:
 *   - the empty-state block (identified by the "Nothing to take here
 *     yet" copy anchor) sits within a View that DOES carry an
 *     accessibilityLabel attribute
 *   - i.e. there is NO accessible container swallowing the icon + text
 *     children without providing a label.
 * A drop of the accessibilityLabel from that View (chunk-99-v1 drift)
 * flips the wire OFF.
 */
function hasLabelledEmptyStateGroup(src) {
  // Anchor on the hourglass icon element (the load-bearing marker of the
  // empty-state JSX branch). Walk backward from the icon to the nearest
  // opening `<View` — that is the wrapping empty-state container. Then
  // extract the container's attribute section by walking forward from
  // `<View` until the balancing `>` that closes the opening tag (skipping
  // any `>` chars that sit inside JSX expression braces or quoted attr
  // values, so `style={{ ... }}` and `accessibilityLabel="a > b"` do not
  // fool the walker). Wire (e) then asserts the attribute chunk carries
  // an accessibilityLabel attribute.
  const iconRe =
    /<(?:MaterialIcons|MaterialCommunityIcons)\b[^>]*\bname=(?:"|')(?:hourglass|hourglass-empty|hourglass-top)(?:"|')[^>]*>/
  const m = iconRe.exec(src)
  if (!m) return false
  const head = src.slice(0, m.index)
  const openIdx = head.lastIndexOf('<View')
  if (openIdx < 0) return false
  const attrChunk = extractJsxOpenTagAttrs(src, openIdx)
  if (attrChunk == null) return false
  // The empty-state container MUST carry an accessibilityLabel="..." —
  // that's the chunk-76 spec and the chunk-99-v1 regression guard. If it
  // is accessible but unlabeled, wire (e) fails.
  return /accessibilityLabel\s*=\s*(?:"[^"]+"|'[^']+'|\{[^}]+\})/.test(attrChunk)
}

/**
 * Given the index of `<View` in `src`, return the substring from that
 * `<View` up to (but not including) the balancing `>` that closes the
 * opening tag. Tracks JSX expression-brace depth and single/double
 * quotes so `>` inside `{{ ... }}` or `"a > b"` does not terminate
 * early. Returns null if no closing `>` is found.
 */
function extractJsxOpenTagAttrs(src, openIdx) {
  let i = openIdx + '<View'.length
  let braceDepth = 0
  let quote = null
  while (i < src.length) {
    const ch = src[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '{') {
      braceDepth++
    } else if (ch === '}') {
      if (braceDepth > 0) braceDepth--
    } else if (ch === '>' && braceDepth === 0) {
      return src.slice(openIdx, i)
    }
    i++
  }
  return null
}

// =========================================================================
// (a) Empty-state JSX branch renders when the visible-rows list is empty.
//
// The extreme-edge fallback (every DOMAIN_MEMBERS entry coming-soon OR
// unknown) MUST render an intentional icon + copy block, not `null` and
// not a blank ScrollView. Wire (a) requires a hourglass MaterialIcons
// / MaterialCommunityIcons element to sit within ~800 characters of a
// warm empty-state copy string — proximity guarantees the icon and the
// copy live in the SAME branch, not in unrelated regions of the file.
// =========================================================================

test('(a) empty-state JSX branch renders a hourglass icon adjacent to warm copy', () => {
  assert.equal(
    hasEmptyStateHourglassBranch(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain the chunk-76 empty-state JSX branch: a MaterialIcons / MaterialCommunityIcons element whose name is "hourglass", "hourglass-empty", or "hourglass-top", rendered adjacent to warm empty-state copy. If this fails, the picker likely reverted to returning null (or an empty ScrollView) on zero visible rows — users see a blank screen and VoiceOver users see nothing to focus.',
  )
})

// =========================================================================
// (b) A warm empty-state copy string appears in the source.
//
// Fuzzy-tolerant — accepts any of "no check-ins", "nothing here yet",
// "nothing to take here yet", "check back", "come back", "coming
// soon", "still building". A minor reword is fine; a complete drop of
// friendly framing (e.g. "No data.") is not.
// =========================================================================

test('(b) at least one warm empty-state copy phrase is present', () => {
  assert.equal(
    hasWarmEmptyStateCopy(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain at least one warm empty-state phrasing: "no check-ins", "nothing (to take) here yet", "check back" / "come back", "coming soon", or "still building". Dropping the warm framing for a curt "No data." reads as an error, not a "check back later" invitation — the exact regression chunk 76 fixed.',
  )
})

// =========================================================================
// (c) setAccessibilityFocus is deferred via requestAnimationFrame or
// setTimeout.
//
// Without the deferral, RN has not necessarily committed the header
// View when AccessibilityInfo.setAccessibilityFocus fires — the focus
// request no-ops silently and VoiceOver lands on the header back
// chevron (announcing "Back", useless context). Wire (c) requires a
// requestAnimationFrame or setTimeout call to sit within ~500 chars of
// setAccessibilityFocus, i.e. inside the same effect body.
// =========================================================================

test('(c) setAccessibilityFocus is RAF- or timeout-deferred', () => {
  assert.equal(
    hasRafDeferredAccessibilityFocus(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain the chunk-76 RAF (or setTimeout) deferral around AccessibilityInfo.setAccessibilityFocus(findNodeHandle(headerRef)). Without it RN has not committed the header View when the focus request fires — VoiceOver falls back to the header back chevron announcing "Back", not the screen title.',
  )
})

// =========================================================================
// (d) findNodeHandle is imported from 'react-native'.
//
// Without the import, findNodeHandle(headerRef.current) throws at
// runtime and the try/catch around the RAF body silently swallows it
// — VoiceOver focus regresses to the default with no signal to the
// developer.
// =========================================================================

test('(d) findNodeHandle is imported from react-native', () => {
  assert.equal(
    hasFindNodeHandleImportFromReactNative(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain `findNodeHandle` in the named import from "react-native". A "clean up unused imports" refactor that drops this identifier silently breaks the chunk-76 setAccessibilityFocus polish: the try/catch swallows the ReferenceError and VoiceOver focus regresses to the header back chevron.',
  )
})

// =========================================================================
// (e) Empty-state container is a LABELED accessible group, not a
// silent-swallowing wrapper.
//
// The empty-state View carries `accessible` + `accessibilityLabel="…"`
// so VoiceOver reads the fallback as ONE composed utterance. Chunk 99
// v1 accidentally shipped an accessible container WITHOUT a label
// elsewhere in the app; VoiceOver announced dead silence. Wire (e)
// pins the label on this container so that re-recurrence cannot land
// silently.
// =========================================================================

test('(e) empty-state container is a LABELED accessible group (chunk-99-v1 guard)', () => {
  assert.equal(
    hasLabelledEmptyStateGroup(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx empty-state <View> must carry an explicit accessibilityLabel so VoiceOver reads the fallback as one composed utterance. If accessible={true} is set on the container without a label, VoiceOver hides the icon + Text children and announces nothing — the chunk-99-v1 silent-swallow regression.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 discipline — prove the traps snap shut)
//
// These tests do NOT read wellbeing-domain-checkins.tsx directly for
// their assertions — they mutate the real source in the exact drift
// shape each wire must catch and assert the wire helper flips to FALSE
// on the mutation. If any of these self-checks flip to TRUE while the
// drift is present, the paired production wire above is toothless.
//
// The task spec calls out two required mutations:
//   (1) return null instead of empty-state JSX — wire (a) must fail
//   (2) drop RAF wrap around setAccessibilityFocus — wire (c) must fail
// Wires (b), (d), (e) also get self-checks so future drift shapes on
// those wires stay caught.
// =========================================================================

test('self-check (1): replacing empty-state JSX with `return null` flips wire (a) OFF', () => {
  // Mutate: strip every hourglass icon element from the source. The
  // "return null instead of empty-state JSX" drift shape reduces to
  // "the hourglass icon element no longer appears in the file" — wire
  // (a) requires that element to exist adjacent to warm copy, so
  // removing all of them must break the assertion.
  const iconRe =
    /<(?:MaterialIcons|MaterialCommunityIcons)\b[^>]*\bname=(?:"|')(?:hourglass|hourglass-empty|hourglass-top)(?:"|')[^>]*>/g
  const mutated = PICKER_SRC.replace(iconRe, '')
  assert.equal(
    hasEmptyStateHourglassBranch(mutated),
    false,
    'self-check: wire (a) MUST reject a source that dropped the hourglass icon element from the empty-state JSX (equivalent to a `return null` simplification). If this flips true, wire (a) cannot detect the exact drift the task spec calls out — a "simplify by returning null" refactor that leaves users staring at a blank screen.',
  )
})

test('self-check (2): dropping the RAF wrap around setAccessibilityFocus flips wire (c) OFF', () => {
  // Mutate: strip requestAnimationFrame and setTimeout everywhere in
  // the source. Wire (c) requires one of the two to sit within ~500
  // chars of setAccessibilityFocus; dropping both must break the
  // assertion. (Stripping both is heavier than the minimal drift, but
  // is the tightest self-check that guarantees the helper cannot pass
  // via an unrelated RAF elsewhere in the file.)
  const mutated = PICKER_SRC
    .replace(/requestAnimationFrame/g, '')
    .replace(/setTimeout/g, '')
  assert.equal(
    hasRafDeferredAccessibilityFocus(mutated),
    false,
    'self-check: wire (c) MUST reject a source that dropped the RAF (and setTimeout) deferral around setAccessibilityFocus. If this flips true, wire (c) cannot detect the "focus fires before RN commits the header View" regression the task spec calls out.',
  )
})

test('self-check (3): dropping warm copy phrases flips wire (b) OFF', () => {
  // Mutate: strip every warm-copy phrase from the source. Wire (b)
  // requires at least one to survive; the mutation must break the
  // assertion.
  const mutated = PICKER_SRC.replace(getWarmCopyRegex(), '')
  // NOTE: getWarmCopyRegex is non-global so a single replace only nukes
  // the first hit. Loop until saturated to prove wire (b) needs at
  // least one hit to fire.
  let scrubbed = mutated
  while (getWarmCopyRegex().test(scrubbed)) {
    scrubbed = scrubbed.replace(getWarmCopyRegex(), '')
  }
  assert.equal(
    hasWarmEmptyStateCopy(scrubbed),
    false,
    'self-check: wire (b) MUST reject a source stripped of every warm empty-state phrase. If this flips true, wire (b) cannot detect a total drop of friendly framing.',
  )
})

test('self-check (4): dropping findNodeHandle from the react-native import flips wire (d) OFF', () => {
  // Mutate: remove the `findNodeHandle,` line (with optional whitespace
  // and trailing comma) from every import block. The named-import
  // shape survives; only the identifier we care about goes away.
  const mutated = PICKER_SRC.replace(/\bfindNodeHandle\s*,?\s*/g, '')
  assert.equal(
    hasFindNodeHandleImportFromReactNative(mutated),
    false,
    'self-check: wire (d) MUST reject a source that dropped findNodeHandle from the "react-native" named import. If this flips true, wire (d) cannot detect the "clean up unused imports" refactor that would silently break setAccessibilityFocus at runtime.',
  )
})

test('self-check (5): stripping accessibilityLabel from the empty-state <View> flips wire (e) OFF', () => {
  // Mutate: remove any accessibilityLabel attribute whose value
  // references empty-state copy. This simulates the chunk-99-v1
  // regression where `accessible={true}` was left on but the label was
  // dropped — VoiceOver would swallow the children and announce dead
  // silence.
  const mutated = PICKER_SRC.replace(
    /accessibilityLabel\s*=\s*"[^"]*(?:Nothing|Come back|Check back|come back|coming soon|no check[-\s]?ins?)[^"]*"/gi,
    '',
  )
  assert.equal(
    hasLabelledEmptyStateGroup(mutated),
    false,
    'self-check: wire (e) MUST reject a source where the empty-state <View> lost its accessibilityLabel. If this flips true, wire (e) cannot detect the chunk-99-v1 silent-swallow regression — accessible container with no label swallowing icon + text children.',
  )
})

// -------------------------------------------------------------------------
// Belt-and-suspenders: stripComments must not eat a trailing inline
// comment appended to the load-bearing setAccessibilityFocus call.
// Mirrors the safety self-check in picker-row-a11y-contract.test.mjs
// (chunk 112) so future contributors adding "// chunk 124" trailers
// don't accidentally blank the reference out of scope for wire (c).
// -------------------------------------------------------------------------

test('self-check: stripComments preserves load-bearing calls when a trailing `// comment` shares the line', () => {
  const src =
    'AccessibilityInfo.setAccessibilityFocus(node) // chunk 124 wire'
  const stripped = stripComments(src)
  assert.match(
    stripped,
    /AccessibilityInfo\.setAccessibilityFocus\(node\)/,
    'self-check: stripComments must leave the setAccessibilityFocus call intact on a code line with a trailing `//` comment. If this fails, wire (c) becomes fragile to future comment additions on the same line as the focus call.',
  )
})
