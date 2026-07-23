// tests/unit/strip-comments.mjs — shared helper (CHUNK 103, 2026-07-23)
//
// Line-oriented comment-stripping helper for source-drift trip-wire tests
// that read a .ts/.tsx file as text and grep it for literals. Extracted
// verbatim from tests/unit/notification-tap-handoff.test.mjs (chunk 98 v2)
// so every future trip-wire suite can import ONE canonical stripper
// instead of copy-pasting the state machine and drifting on it.
//
// Naming: no `.test.mjs` suffix so `node --test tests/unit/*.test.mjs`
// does NOT execute this as a test file. Callers import from
// './strip-comments.mjs' relative to their own tests/unit/ location.
//
// Why not the naive /\/\/[^\n]*/g strip?
//   1. A `//` sitting inside a `/* ... */` block can split the block
//      early and unblank code that should have been dropped.
//   2. `//` inside a string literal (e.g. `'https://example.com'`) gets
//      eaten, corrupting real code the wires need to match.
//
// This line-oriented state machine:
//   - blanks any line whose first non-whitespace chars are `//`
//   - tracks whether we're currently inside a `/* ... */` block and
//     blanks every line that opens, sits fully inside, or closes such
//     a block (code before an opening `/*` on the same line is kept)
//   - leaves trailing inline `// ...` on a code line UNTOUCHED, because
//     killing the tail could bite into string literals like `'https://…'`
//
// Behavioral parity with chunk 98 v2 self-checks in
// notification-tap-handoff.test.mjs is the acceptance bar — those
// self-checks exercise the exact drift shapes this helper must catch
// (commented-out router.push, commented-out null-guard, block comment
// containing `//`, URL in a string literal).

export function stripComments(src) {
  const out = []
  let inBlock = false
  for (const rawLine of src.split('\n')) {
    if (inBlock) {
      if (rawLine.includes('*/')) inBlock = false
      out.push('')
      continue
    }
    const trimmed = rawLine.trimStart()
    if (trimmed.startsWith('//')) {
      out.push('')
      continue
    }
    if (trimmed.startsWith('/*')) {
      if (trimmed.slice(2).includes('*/')) {
        out.push(rawLine.replace(/\/\*[\s\S]*?\*\//g, ''))
      } else {
        out.push('')
        inBlock = true
      }
      continue
    }
    out.push(rawLine)
  }
  return out.join('\n')
}
