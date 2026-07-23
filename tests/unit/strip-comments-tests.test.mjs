// tests/unit/strip-comments-tests.test.mjs — CHUNK 119 (2026-07-23)
//
// Unit tests for the shared stripComments() helper in ./strip-comments.mjs
// (chunk 103, extended from chunk 98 v2). The helper is a line-oriented
// comment-stripping state machine used by multiple contract / trip-wire
// tests (chunks 98, 103, 106, 107, 109, 110, 112, 113, 114, 116 and any
// future contract test). A silent bug here would weaken ALL those tests,
// e.g. a URL misparsed inside a comment or a mishandled block boundary
// could let contract regexes pass on code that should NOT satisfy them.
//
// These are true UNIT tests — the helper IS the source, so there is no
// source-drift trip wire to build; we exercise the state machine directly
// against fixture strings and assert the resulting stripped text.
//
// Assertions reflect the helper's DESIGNED behavior (see strip-comments.mjs
// docstring), not an idealized JS comment stripper:
//   - Line whose FIRST non-whitespace chars are `//`  → line blanked.
//   - Line whose FIRST non-whitespace chars are `/*`  → line blanked, and
//     block-mode entered until we see a line containing `*/`.
//   - Trailing inline `// ...` on a CODE line is intentionally UNTOUCHED
//     (killing the tail would bite into string literals like 'https://…').
//   - Mid-line `/* ... */` on a CODE line is likewise untouched.
//   - Nested block comments: JS itself does not support them; first `*/`
//     closes, trailing `*/` becomes stray text.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripComments } from './strip-comments.mjs'

// (a) Bare code with no comments → identical string.
test('bare code with no comments returns the input unchanged', () => {
  const src = "const x = 1\nconst y = x + 2\nexport { x, y }"
  assert.equal(stripComments(src), src)
})

// (b) Trailing "code // comment" — the helper INTENTIONALLY does not strip
// trailing inline line comments (see docstring), so the whole line is kept.
// This test pins that designed behavior so a future "helpful" rewrite that
// starts eating tails is caught before it corrupts URL-bearing string
// literals in the contract-test corpus.
test('trailing inline // comment on a code line is preserved verbatim (by design)', () => {
  const src = "const x = 1 // trailing comment"
  assert.equal(stripComments(src), src)
})

// (c) Line-only "// pure comment" → whole line blanked.
test('a line whose first non-whitespace chars are // is blanked', () => {
  const src = "// pure comment\nconst x = 1"
  const out = stripComments(src)
  assert.equal(out, "\nconst x = 1")
})

// (c2) Indented line-only comment — leading whitespace still counts as
// "first non-whitespace is //", so the whole line blanks.
test('an indented line-only // comment is blanked', () => {
  const src = "    // indented pure comment\nconst x = 1"
  const out = stripComments(src)
  assert.equal(out, "\nconst x = 1")
})

// (d) Single-line block comment /* ... */ where the whole line is the
// comment → the /* ... */ span is stripped from the line.
test('a single-line /* ... */ line strips the comment span', () => {
  const src = "/* single-line block */\nconst x = 1"
  const out = stripComments(src)
  const lines = out.split('\n')
  // First line's comment span is removed; second line untouched.
  assert.equal(lines.length, 2)
  assert.ok(!lines[0].includes('/*'), 'first line must not still contain /*')
  assert.ok(!lines[0].includes('*/'), 'first line must not still contain */')
  assert.equal(lines[1], 'const x = 1')
})

// (e) Multi-line block comment: opening line, interior lines, closing
// line all blank; code before/after is preserved.
test('multi-line /* ... */ block blanks every line it covers', () => {
  const src = [
    "before",
    "/* line1",
    "line2",
    "line3 */",
    "after",
  ].join('\n')
  const out = stripComments(src)
  assert.equal(out, "before\n\n\n\nafter")
})

// (f) Nested block comments — JS DOES NOT support nesting. The helper
// mirrors JS: the first `*/` closes the block; whatever comes after is
// treated as post-block text. We pin the CURRENT behavior so a future
// change is deliberate. Layout below is the multi-line variant of
// `/* outer /* inner */ still-in-outer */`.
test('nested-looking block comments close on the FIRST */ (documents current behavior)', () => {
  const src = [
    "/* outer start",
    "  /* inner-looking */",
    "still-treated-as-code */",
    "after",
  ].join('\n')
  const out = stripComments(src)
  const lines = out.split('\n')
  // Lines 0 and 1 are inside the block (line 1 contains the first */
  // and closes it).
  assert.equal(lines[0], '')
  assert.equal(lines[1], '')
  // Line 2 is OUTSIDE the block now — its raw text is preserved, stray
  // `*/` and all. This is the documented "not-nested" behavior.
  assert.equal(lines[2], 'still-treated-as-code */')
  assert.equal(lines[3], 'after')
})

// (g) URL sitting inside a line-only // comment → whole line blanked;
// the URL's `//` is NOT re-parsed as anything (line comment wins first).
test('a line-only // comment containing a URL blanks the whole line without misparse', () => {
  const src = "// see https://example.com/x for details\nconst x = 1"
  const out = stripComments(src)
  assert.equal(out, "\nconst x = 1")
})

// (g2) URL in a TRAILING inline comment — again, per design the tail is
// preserved, and the URL is not misparsed. Guards against a future
// "helpful" rewrite that tries to strip tails using naive `//` matching
// and clips the URL scheme.
test('URL in a trailing inline comment is preserved verbatim, not misparsed', () => {
  const src = "const url = getUrl() // see https://example.com/x"
  assert.equal(stripComments(src), src)
})

// (h) String literal containing "//" or "/*" → NOT treated as comment.
// The helper's rule is "FIRST non-whitespace chars"; a `const` line
// never enters comment mode, so the whole line is kept intact.
test('string literal containing // is not treated as a comment', () => {
  const src = 'const x = "//not a comment"\nconst y = 2'
  assert.equal(stripComments(src), src)
})

test('string literal containing /* is not treated as a block-comment open', () => {
  const src = 'const x = "/* not a comment */"\nconst y = 2'
  assert.equal(stripComments(src), src)
})

// (i) Template literal containing "//" → preserved.
test('template literal containing // is preserved', () => {
  const src = 'const t = `prefix //still not a comment suffix`\nconst y = 2'
  assert.equal(stripComments(src), src)
})

// (j) Regex literal with escaped forward slash → preserved. The line's
// first non-whitespace chars are `const`, so the state machine never
// enters comment mode and the regex round-trips intact.
test('regex literal with escaped forward slash is preserved', () => {
  const src = "const re = /a\\/b/\nconst y = 2"
  assert.equal(stripComments(src), src)
})

// (k) Empty string input → empty string output.
test('empty string input returns empty string', () => {
  assert.equal(stripComments(''), '')
})

// (l) Whitespace-only input → identical.
test('whitespace-only input is returned unchanged', () => {
  const src = "   \n\t\n  "
  assert.equal(stripComments(src), src)
})

// (extra) Mid-line inline /* ... */ on a CODE line is NOT stripped by
// design — the helper only reacts when `/*` is the FIRST non-whitespace
// on the line. Pin this so a future refactor that quietly starts
// stripping mid-line block comments (and could clip string literals like
// 'a/*b*/c') is caught here first.
test('mid-line inline /* ... */ on a code line is preserved (by design)', () => {
  const src = "const x = 1 /* inline */ + 2"
  assert.equal(stripComments(src), src)
})

// (extra) Line comment appearing AFTER a block comment closes on the
// same line — the closing line is still in-block, so it blanks entirely
// regardless of the trailing `//`. Guards against a regression that
// tries to "resume" mid-line after `*/`.
test('trailing // after a block close on the same closing line still blanks the line', () => {
  const src = [
    "/* open",
    "body */ // trailing after close",
    "after",
  ].join('\n')
  const out = stripComments(src)
  assert.equal(out, "\n\nafter")
})
