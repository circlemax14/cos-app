// tests/unit/wellbeing-map-phase0-contract.test.mjs
//
// Phase 0 of the wellbeing-map audit (#5, docs/wellbeing-map-redesign.md §7).
// These are correctness and accessibility fixes on the CURRENT screen — they
// ship independently of any redesign and must survive it.
//
// Each wire below corresponds to a defect that was MEASURED, not guessed:
//   - 26 tappable dots with no accessibility label at all
//   - grief's hit circle 23.3 units from socioeconomic_status, hit diameter 24
//     → tapping Grief opened Socioeconomic Status
//   - the printed legend described the chips while sitting under the map,
//     where the same dashed treatment means something different
//   - gap labels at 2.99:1 contrast, social header at 3.1:1 (AA needs 4.5:1)
//   - the Home tile's accessibilityHint named a screen it does not open
//
// If one fails: re-read the audit section it cites before touching the regex.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const MAP = stripComments(
  readFileSync(join(REPO_ROOT, 'app', 'Home', 'wellbeing-map.tsx'), 'utf8'),
)
const TILE = stripComments(
  readFileSync(join(REPO_ROOT, 'components', 'home', 'WellbeingScoreTile.tsx'), 'utf8'),
)

test('(a) every map dot is an announced, labelled button', () => {
  // NB: the opening tag contains an arrow function, so a `[^>]*` walk stops
  // at the `=>` rather than the tag's own closing bracket. Anchor on the
  // key + onPress + role trio instead.
  assert.match(
    MAP,
    /<G\s+key=\{c\.key\}[\s\S]{0,200}?accessibilityRole="button"/,
    'The <G onPress> wrapping each subdomain dot must declare accessibilityRole="button". All 26 areas of the map are tappable; without a role VoiceOver announces nothing and the entire map is invisible to assistive tech.',
  )
  assert.match(
    MAP,
    /accessibilityLabel=\{a11yLabel\}/,
    'Each dot must carry an accessibilityLabel. A tappable target with no label is unusable by screen reader.',
  )
  assert.match(
    MAP,
    /const a11yLabel = `\$\{c\.label\}, \$\{c\.domain\}, \$\{a11yState\}\. Tap to learn more\.`/,
    'The dot label must name the area, its DOMAIN, and its state. The domain has to be spoken because position in the Venn is decorative — and per the audit it is wrong for 12 of the 26 areas, so it cannot be inferred from where the dot sits.',
  )
})

test('(b) no two dots have overlapping tap targets', () => {
  // Generalised deliberately. The reported defect was grief vs
  // socioeconomic_status, but the first attempted fix (move grief up) simply
  // traded that collision for grief vs trauma — a pair nobody had checked.
  // Pinning only the known pair would have let that ship. Every dot draws an
  // invisible r=12 hit circle, so any two centres closer than 24 units overlap
  // and the later-rendered one swallows the other's taps.
  const positions = new Map()
  const re = /^\s*([a-z_]+):\s*\{ dx:\s*(\d+), dy:\s*(\d+)/gm
  let m
  while ((m = re.exec(MAP)) !== null) {
    positions.set(m[1], [Number(m[2]), Number(m[3])])
  }
  assert.equal(
    positions.size,
    26,
    `expected 26 subdomain positions in SUBDOMAIN_POS, found ${positions.size}. If the taxonomy changed, update this count deliberately.`,
  )

  const entries = [...positions.entries()]
  const collisions = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ka, [ax, ay]] = entries[i]
      const [kb, [bx, by]] = entries[j]
      const d = Math.hypot(ax - bx, ay - by)
      if (d < 24) collisions.push(`${ka} <-> ${kb} (${d.toFixed(1)})`)
    }
  }
  assert.deepEqual(
    collisions,
    [],
    `Dots with overlapping hit circles — tapping one silently opens the other:\n  ${collisions.join('\n  ')}`,
  )
})

test('(c) the legend describes the map it sits under', () => {
  assert.doesNotMatch(
    MAP,
    /Dashed = untouched\s+gap/,
    'The legend must not say "Dashed = untouched gap". It sits directly beneath the Venn, where a dashed outline means the area spans two circles — so that sentence is actively wrong about the thing above it (audit §2.4).',
  )
  assert.match(
    MAP,
    /dashed outline means the area spans two/,
    'The legend must explain what dashed actually means ON THE MAP: the area spans two circles.',
  )
})

test('(d) contrast meets WCAG AA', () => {
  assert.doesNotMatch(
    MAP,
    /isDark \? '#8E8E93' : '#8E8E93'/,
    "Light-mode gap labels must not use #8E8E93 — measured 2.99:1 on #f5f5f5, under the 4.5:1 AA floor. Use #5A5A5F (5.4:1). The dark-mode value is fine and should stay.",
  )
  assert.match(
    MAP,
    /isDark \? '#8E8E93' : '#5A5A5F'/,
    'Light-mode gap labels must use #5A5A5F.',
  )
  assert.doesNotMatch(
    MAP,
    /social: '#C97600'/,
    "The social domain colour must not be #C97600 — 3.1:1 on white, under AA for the section header it colours. #A15E00 is 4.6:1 at the same hue.",
  )
  assert.match(MAP, /social: '#A15E00'/, 'Social domain colour must be #A15E00.')
})

test('(e) the three coverage cards read as one stat each, and not as buttons', () => {
  assert.match(
    MAP,
    /accessibilityRole="text"/,
    'The coverage cards are summary stats, not controls. They must declare accessibilityRole="text" so assistive tech does not offer an activation that does nothing.',
  )
  assert.match(
    MAP,
    /accessibilityLabel=\{`\$\{DOMAIN_LABEL\[d\]\}: \$\{s\.covered\} of \$\{s\.total\} areas covered`\}/,
    'Each coverage card must carry a single sentence label. Ungrouped they were two unrelated VoiceOver stops — the number, then the domain name — with nothing connecting them.',
  )
})

test('(f) the Home tile hint names the screen it actually opens', () => {
  assert.match(
    TILE,
    /router\.push\('\/Home\/wellbeing-score'\)/,
    'WellbeingScoreTile must still navigate to /Home/wellbeing-score — this test pins the hint against the real destination, so it has to read the destination too.',
  )
  assert.doesNotMatch(
    TILE,
    /accessibilityHint="Opens your wellbeing map"/,
    'The hint must not say "wellbeing map" — onPress goes to the wellbeing SCORE screen. A hint that names the wrong destination is worse than none: it is the only preview a VoiceOver user gets before committing to the tap.',
  )
  assert.match(
    TILE,
    /accessibilityHint="Opens your wellbeing score details"/,
    'The hint must name the score details screen.',
  )
})
