# Wellbeing Map — redesign proposal

**Status:** proposal, no code changed
**Author:** research pass, 2026-08-06
**Trigger:** stakeholder feedback to Ken + Vishal — the wellbeing map is *"very complicated
for any age group"*
**Scope of investigation:** `app/Home/wellbeing-map.tsx` (978 lines),
`components/home/WellbeingMapPreview.tsx`, `components/health-plan/WellbeingSubdomainSheet.tsx`,
`lib/bps-subdomains.ts`, `lib/wellbeing-score.ts`, `lib/assessment-bands.ts`,
`cos-backend/src/data/system-instruments.ts`, `cos-backend/src/services/wellbeing-score.service.ts`,
`cos-backend/src/data/wellbeing-assessment-bands.ts`.

Every number in section 1 and section 2 was recomputed from source, not quoted from an
earlier scout. Where the earlier scout was wrong I say so explicitly.

---

## 1. What is on screen today, measured

### 1.1 Element inventory

The route is a single `ScrollView` with six stacked blocks.

| # | Block | Elements | Tappable |
|---|---|---|---|
| 1 | Back row | 1 `Pressable` + 1 `MaterialIcons` | 1 |
| 2 | Header | 2 `Text` (title 22pt, subtitle 13pt, ~60 words) | 0 |
| 3 | Coverage summary | 3 cards × 2 `Text` = 6 `Text` | **0** — see §2.1 |
| 4 | SVG Venn | 87–113 SVG nodes (breakdown below) | 26 |
| 5 | "Your next move" | 2 `Text` + 0–1 `TouchableOpacity` | 0–1 |
| 6 | "Coverage by subdomain" | 2 `Text` + up to 6 group headers + 26 chips | 26 |
| 7 | Attribution | 1 `Text` (10pt italic) | 0 |

**SVG node breakdown** (`app/Home/wellbeing-map.tsx:466-607`):

```
3   domain <Circle>            (r=95, viewBox 350×350)
3   domain <SvgText> headers   fontSize 11
1   centre puck <Circle>       (r=14)
2   centre <SvgText>           fontSize 6 ("WELLBEING"), fontSize 7 ("♥")
0-26 <ClipPath>                one per half-filled subdomain
26  invisible hit <Circle>     r=12, fill="transparent"
26-52 visible dot <Circle>     r = 4 / 3.5 / 3 (full / half / none); half-fill draws two
26  label <SvgText>            fontSize 7.5
───
87 minimum, 113 maximum
```

### 1.2 Counts that matter

- **26 distinct health concepts** (`BPS_SUBDOMAINS`, `lib/bps-subdomains.ts:56-89`).
- **54 tap targets** for those 26 concepts: 26 SVG groups + 26 chips + 1 back + 1 next-move
  button. (Earlier scout said ~52; the exact figure is 54, and the next-move button is a
  *third* route to a subdomain that already has two.)
- **76 discrete text strings** rendered on one screen.
- **Every one of the 26 concepts is rendered twice** — once as an SVG dot+label, once as a
  chip 400–900px further down the same scroll. Same data, two different visual grammars
  (§2.4).

### 1.3 Measured font sizes

SVG `fontSize` is in **viewBox user units**, so the on-device point size is
`fontSize × (renderedWidth / 350)`. The `<Svg>` is `width="100%" height={340}` inside a card
with `marginHorizontal: 16` and `padding: 14`, so rendered width = `screenWidth − 60`, and
`preserveAspectRatio` (default `xMidYMid meet`) picks `min(width/350, 340/350)`.

| Device width | Scale | Subdomain label (7.5) | Centre puck (6) | Domain header (11) | Hit-target Ø (24) |
|---|---|---|---|---|---|
| 320 (SE 1st gen) | 0.743 | **5.6pt** | 4.5pt | 8.2pt | **17.8pt** |
| 360 (common Android) | 0.857 | **6.4pt** | 5.1pt | 9.4pt | **20.6pt** |
| 375 (SE 2/3, 13 mini) | 0.900 | **6.8pt** | 5.4pt | 9.9pt | **21.6pt** |
| 390 (14/15/16) | 0.943 | **7.1pt** | 5.7pt | 10.4pt | **22.6pt** |
| 402+ (Pro Max) | 0.971 | **7.3pt** | 5.8pt | 10.7pt | **23.3pt** |

The scout's "≈6.4pt" is correct for a 360pt-wide device. Confirmed range: **5.6–7.3pt**.

**None of these respond to the text-size setting.** `getScaledFontSize` is imported and used
correctly for the title, subtitle, coverage cards, next-move card, chips and attribution —
but every `fontSize` inside `<Svg>` is a bare numeric literal (lines 494, 497, 500, 510, 517,
596). A patient who sets iOS Dynamic Type to AX5 sees the chips grow and the map stay
frozen.

### 1.4 Measured contrast (WCAG 2.1 AA needs 4.5:1 at these sizes)

Card background is `#f5f5f5` light / `#1e2022` dark (`constants/theme.ts:22,36`).

| Foreground | On light card | On dark card | Verdict |
|---|---|---|---|
| Gap-state label `#8E8E93` | **2.99:1** | 5.01:1 | fails light |
| `BIOLOGICAL` header `#199C4F` | **3.26:1** | 4.60:1 | fails light |
| `SOCIAL & SPIRITUAL` header `#C97600` | **3.17:1** | 4.73:1 | fails light |
| `PSYCHOLOGICAL` header `#7B3FE4` | 5.24:1 | **2.86:1** | fails dark |
| Covered label `#1C1C1E` | 17.01:1 | — | passes |

Both themes fail, on different elements. For a patient with zero completed assessments,
**all 26 labels** render in the 2.99:1 gap colour at ~6.8pt.

### 1.5 Measured colour separation between domains

The only thing distinguishing a biological dot from a social dot is hue.

| Pair | Luminance contrast |
|---|---|
| bio `#199C4F` vs social `#C97600` | **1.03:1** |
| bio `#199C4F` vs psych `#7B3FE4` | 1.61:1 |
| psych `#7B3FE4` vs social `#C97600` | 1.65:1 |

Green vs orange at 1.03:1 is the textbook red-green confusion pair at effectively identical
luminance. A deuteranopic or protanopic patient (~8% of men; our population skews older and
male-heavy) cannot separate biological from social dots **at all**. There is no shape, no
pattern and no text fallback — the dot's only other channel, dashed stroke, is already spent
encoding something else (§2.4).

---

## 2. Why it is hard

I separate this deliberately. Section 2.1–2.3 are bugs and can be fixed inside the current
design. Section 2.4–2.8 are structural and cannot.

### ACCESSIBILITY DEFECTS — fixable inside today's design

#### 2.1 Tap targets are half the required size

Apple HIG and WCAG 2.5.5 both require 44pt. The invisible hit circle is `r={12}` in viewBox
units → **17.8–23.3pt diameter** on device (§1.3). That is 40–53% of the minimum.

Two aggravating factors found by computation, not inspection:

- `grief` (260,253) and `socioeconomic_status` (280,265) are 23.3 units apart — **closer
  than one hit-circle diameter (24)**. Their hit regions overlap. SVG paints later elements
  on top, and `socioeconomic_status` is index 23 vs `grief` index 17, so in the overlap
  region **taps intended for Grief silently open Socioeconomic Status.**
- The three coverage cards at the top (`styles.coverageCard`, rounded, bordered, tinted,
  showing "3/8") are plain `View`s with **no `onPress`**. They have every affordance of a
  button and do nothing. A patient's first instinct — tap the "Biological 3/8" card — is a
  dead tap.

#### 2.2 SVG text bypasses the text-size setting

Per §1.3. Worth stating precisely, because the obvious patch does **not** work:
`getScaledFontSize` caps at `PHONE_MAX_SCALE = 1.05` on phones
(`stores/accessibility-store.tsx:178`). `getScaledFontSize(7.5)` returns 8. At the 0.9
viewBox scale that is **7.2pt instead of 6.8pt** — a 0.4pt improvement for a patient who
asked the OS for 200% text. Wiring the hook into the SVG is worth doing for correctness but
it does not make the map readable. See §2.5 for why.

#### 2.3 VoiceOver hears a different app than the screen shows

- Every SVG `<G onPress>` has **no `accessibilityRole` and no `accessibilityLabel`**. The
  chips below have both (line 852-853). So the 26 map targets are unlabelled to VoiceOver
  while their 26 duplicates 600px down are labelled — VO users navigate a screen with 26
  anonymous buttons followed by 26 named ones.
- `components/home/WellbeingMapPreview.tsx:73` announces *"Your wellbeing map. Explore all 8
  areas: Body, Mind, Life, Sleep, Movement, Nutrition, Connection, Purpose."* The
  destination has 26 areas, and 7 of those 8 names do not exist anywhere in the taxonomy
  (§3).
- `components/home/WellbeingScoreTile.tsx` sets `accessibilityHint="Opens your wellbeing
  map"` but `onPress` pushes `/Home/wellbeing-score` (line 115-120). The hint is factually
  wrong.

### CONCEPTUAL OVERLOAD — not fixable inside today's design

#### 2.4 The same visual token means two different things on one screen

`strokeDasharray` on a **map dot** means *cross-domain*:

```ts
const dashed = c.crossDomain ? '2,2' : undefined       // line 553
```

`borderStyle: 'dashed'` on a **chip** means *not covered*:

```ts
borderStyle: isFull ? 'solid' : 'dashed'               // line 859
```

And the legend printed directly above the chips, which sits on the same scroll as the map,
says:

> "Solid = a goal targets this subdomain. Half-filled = you've completed a check-in here but
> no goal yet. **Dashed = untouched gap.**" (lines 683-686)

That legend is correct for the chips and **wrong for the map it describes**. A user who
learns "dashed = gap" from the legend will read the eight cross-domain dots — Emotions,
Response to Reward, Diet/Lifestyle, Substance Use, Interpersonal Relationships, Trauma,
Grief — as gaps even when they are fully covered.

Beyond that collision, the map encodes state across **five simultaneous channels** (dot
fill, dot radius 4/3.5/3, stroke dash, label weight 700/600/500, label italic + label
colour) and the chips encode the *same three states* across **six different** channels
(background fill, border style, text colour, weight, italic, trailing badge text). Two
grammars, one screen, no shared legend.

#### 2.5 A 26-item labelled map cannot be made accessible — this is geometry, not taste

Take the requirement seriously: 44pt tap targets and ~17pt labels (iOS body text).

- 26 targets at 44pt fit fine as bare dots: the 330×340pt canvas holds a 7×7 grid.
- But each target needs a **legible label**, and the longest is "Interpersonal
  Relationships" (27 characters ≈ 230pt at 17pt type). Labels of that length cannot sit
  beside dots in a 330pt-wide box; they have to stack.
- 26 stacked labels at 17pt with 44pt row height need **≥ 1,144pt of vertical space.**

The canvas is 340pt. **The required layout is 3.4× taller than the container.** There is no
arrangement of 26 labelled, tappable, legible items inside a fixed 340pt square. This is why
the current file contains `SVG_LABEL_OVERRIDES` (line 89-97) abbreviating seven labels to
"Interp. Rel.", "Socio-econ.", "Immune/Stress" — the abbreviations exist because the
geometry does not close, and they are still rendered at 6.8pt.

**Conclusion: the accessibility defects in §2.1–2.2 are symptoms, not causes.** Any fix that
keeps 26 labelled items on a fixed canvas re-creates them.

#### 2.6 The Venn's central claim — position encodes domain — is false 12 times out of 26

The whole point of a Venn is that *where a thing sits tells you what it is*. I tested every
dot position in `SUBDOMAIN_POS` against the three circles (`BIO_C(125,130)`,
`PSY_C(225,130)`, `SOC_C(175,215)`, `r=95`) and compared to its declared `domain` /
`overlap` in `lib/bps-subdomains.ts`.

**8 dots sit outside all three circles entirely:**
`genes`, `attitudes_beliefs`, `family_circumstances`, `peer_group`, `culture`,
`socioeconomic_status`, `life_events`, `faith_spiritual`.

**4 dots sit in the wrong region:**

| Subdomain | Declared | Actually drawn in |
|---|---|---|
| `immune_stress_response` | Biological only | Bio ∩ Social |
| `substance_use` | Bio ∩ Social | Social only |
| `trauma` | Psych ∩ Social | Social only |
| `grief` | Psych ∩ Social | Social only |

So `Faith / Spiritual` — the item the Social & Spiritual circle is *named for* — is drawn
outside that circle. `Trauma` and `Grief`, both typed `domain: 'psychological'`, are drawn
entirely inside the Social circle.

A patient who tries to read meaning out of position is reading noise **46% of the time**. A
patient who does not try is looking at 26 dots scattered on three tinted blobs.

#### 2.7 The header counts and the picture disagree

The three coverage cards count by `c.domain`, which for overlap items is arbitrarily
assigned to one side. Totals are **Biological 8 / Psychological 9 / Social 9**. But the
picture shows six dots in the pure-bio lobe. `diet_lifestyle` and `substance_use` are typed
`biological` and counted in the "Biological 8", while being drawn (per §2.6) inside the
Social circle. The number above the picture and the picture cannot be reconciled by looking
at them.

#### 2.8 The primary CTA can point at a dead end

`pickNextMove` (line 883-918) ranks domains by gap count and picks `gaps[0]` in
`BPS_SUBDOMAINS` order. The psychological list is
`emotions → response_to_reward → attitudes_beliefs → …`.

`emotions` is fed by PHQ-2, which is on `ALL_TIERS` and is the most commonly completed
instrument in the product. **The moment a patient completes PHQ-2, the screen's single
loudest call to action becomes "Open Response to Reward"** — a subdomain with:

- zero instruments feeding it (§6),
- no explanatory content beyond its two-word label,
- an "Add a goal" button that dumps the user on the BPS plan screen with no pre-selection
  (line 285-291),
- an "AI suggest a goal" button that fires `Alert.alert("Coming soon")` (line 293-301).

The most prominent action on the screen is a four-tap loop that ends in a "coming soon"
dialog. For a 70-year-old this does not read as "feature not ready" — it reads as *"I did
something wrong."*

#### 2.9 The one journey that matters is severed

The sheet's CTA reads *"Take a check-in about Sleep"* and calls:

```ts
router.push('/Home/assessments-catalog' as never)   // line 307-310
```

No parameter. `grep -n "subdomain" app/Home/assessments-catalog.tsx` returns **nothing** —
the catalog has no subdomain filter and no instrument deep-link. The patient is dropped into
an unfiltered list of ~22 instruments and must work out for themselves that "Sleep" means
"Sleep Quality (4-item)".

**This is the single most consequential defect in the whole feature.** The map's entire
justification is "see a weak area → measure it". That link does not exist in code.

---

## 3. The taxonomy drift problem

Four different vocabularies ship simultaneously, and two of them contradict each other
*within the same screen*.

| Surface | File | Model | Names |
|---|---|---|---|
| Home tile | `components/home/WellbeingMapPreview.tsx:62-71` | **8 "dimensions"** | Body, Mind, Life, Sleep, Movement, Nutrition, Connection, Purpose |
| Map — SVG headers | `wellbeing-map.tsx:494-502` | **3 domains** | BIOLOGICAL / PSYCHOLOGICAL / **SOCIAL & SPIRITUAL** |
| Map — coverage cards | `wellbeing-map.tsx:61-65` | **3 domains** | Biological / Psychological / **Social & Faith** |
| Map — dots + chips | `lib/bps-subdomains.ts` | **26 subdomains** | genes … faith_spiritual |
| Score | `lib/wellbeing-score.ts:52,117` | **3 domains** | BIO / MIND / SOCIAL & FAITH |
| Instrument catalog | `cos-backend/.../system-instruments.ts` | **4 domains** | biological / psychological / social / **spiritual** |

Verified specifics:

1. **The third domain has two names on one screen.** The SVG header says "SOCIAL &
   SPIRITUAL"; the coverage card 40px above it says "Social & Faith". Both are rendered
   simultaneously.
2. **7 of the 8 Home-tile names are not keys in the taxonomy.** Only `Sleep` exists. Body,
   Mind, Life, Movement, Nutrition, Connection and Purpose have no corresponding key. The
   scout flagged 3; it is 7. The tile also promises "all 8 areas" and opens a screen with 26.
3. **The catalog has a fourth domain, `spiritual`,** used by `fica` and `hope`
   (`system-instruments.ts:1002,1038`). `BpsDomain` has no such member, so those instruments
   cannot be placed by the score at all.
4. **Four instruments are filed under different domains by the catalog and the score:**

   | Instrument | Catalog `domain` | Score `DOMAIN_MEMBERS` |
   |---|---|---|
   | `alcohol-3` | psychological | **social** |
   | `cognition-8` | biological | **mind** |
   | `mini-cog` | biological | **mind** |
   | `moca` | biological | **mind** |

   `alcohol-3` is worse still: it is `psychological` in the catalog, `social` in the score,
   and its two subdomains (`substance_use`, `diet_lifestyle`) are both typed `biological` in
   `bps-subdomains.ts`. **One instrument, three different domains, depending on which file
   you ask.**

### Recommendation: one canonical model, three layers

Do **not** try to reconcile 8 / 26 / 3 into a single list. They are answering different
questions. Make the layering explicit and delete everything that is not one of these three:

| Layer | Audience | Size | Where it lives | Rendered? |
|---|---|---|---|---|
| **L1 — Domains** | patient | 3 | `Body` / `Mind` / `Life` | Section headers only. Never a navigation target. |
| **L2 — Areas** | patient | **12** | new `lib/wellbeing-areas.ts` | **This is the entire patient-facing surface.** |
| **L3 — Subdomains** | clinician / LLM | 26 | `lib/bps-subdomains.ts` (unchanged) | **Never rendered to patients.** Goal tagging, clinician view, Bedrock prompt vocabulary. |

Hard rules that follow:

- **Delete the 8-item list** in `WellbeingMapPreview.tsx`. Replace the tile subtitle with the
  L2 count: `"You've told us about 8 of 12 areas"`.
- **One name per domain, everywhere.** Pick `Body / Mind / Life` for patients (short, plain,
  already used by the Home tile and `WellbeingMapGlimpse`), keep
  `biological/psychological/social` as the wire enum. Retire "Social & Spiritual" **and**
  "Social & Faith" from patient-visible copy; "Faith & meaning" becomes an L2 *area* inside
  `Life`, which is where it belongs.
- **Make the catalog's `spiritual` domain legal or delete it.** Recommend mapping
  `spiritual → social` at the seed level so `fica` and `hope` can enter the score.
- **`DOMAIN_MEMBERS` becomes derived, not hand-written.** It is currently duplicated
  byte-for-byte in `lib/wellbeing-score.ts:105` and
  `cos-backend/src/services/wellbeing-score.service.ts:143`. Derive both from each
  instrument's own `domain` field, and fix the four disagreements above at the seed. Two
  hand-maintained copies of the same table is how the four-way drift happened.

### The proposed 12 L2 areas

Every one is backed by at least one shipped instrument, and together they cover all 22
instruments and all 26 subdomains.

| # | Domain | Area (patient language) | L3 subdomains folded in | Instruments |
|---|---|---|---|---|
| 1 | Body | Sleep | sleep | `sleep-4` |
| 2 | Body | Getting around & daily tasks | physical_health | `adl`, `iadl`, `physical-function-4`, `falls-12` |
| 3 | Body | Pain | physical_health, immune_stress_response | `pain-4` |
| 4 | Body | Eating & nutrition | diet_lifestyle, metabolic_disorders | `nutrition-5` |
| 5 | Body | Memory & thinking | neurobiology, perceptions, genes | `cognition-8`, `mini-cog`, `moca` |
| 6 | Mind | Mood | emotions, self_esteem, response_to_reward | `phq-2`, `phq-9`, `wellbeing-5` |
| 7 | Mind | Worry & stress | immune_stress_response | `gad-7`, `pss-4` |
| 8 | Mind | Coping & resilience | coping_skills, temperament, attitudes_beliefs | `du-resilience-13`, `hope` |
| 9 | Mind | Difficult experiences | trauma, grief | **none today — see §6** |
| 10 | Life | Connection & loneliness | social_support, interpersonal_relationships, peer_group | `loneliness-3` |
| 11 | Life | Alcohol & other substances | substance_use | `alcohol-3` |
| 12 | Life | Faith & meaning | faith_spiritual | `fica`, `hope` |

(`work_school`, `culture`, `life_events`, `family_circumstances`, `socioeconomic_status`
are collected by `ohio-leisure-interest` and `full-intake`; they attach to areas 10 and 12
as context rather than becoming their own rows. They are circumstances, not things a patient
can be "weak" in, and putting them on a checklist as gaps is the kind of judgement that
makes a patient feel graded.)

---

## 4. Three alternative designs

All three assume the same two prerequisites, which are the actual unlock and are **not**
design work:

- **P1 — reverse index.** Ship `AREA → InstrumentId[]` as data (derived from the existing
  `subdomains[]` on each instrument seed, inverted at build time). Today the arrow only
  points instrument → subdomain; every design below needs it pointed the other way.
- **P2 — deep-linkable catalog.** `/Home/assessments-catalog?instrument=sleep-4` opens that
  instrument, or `?area=sleep` filters to its instruments. Without P2 every "measure this"
  CTA below dead-ends exactly as §2.9 does today.

---

### Design A — Three doors (3 BPS domains, drill down to areas)

Top level is three full-width rows. No canvas, no Venn, no positions to misread.

```
┌──────────────────────────────────────────────────┐
│  ‹ Back            Your wellbeing                │
│                                                  │
│  You've told us about 8 of 12 areas.             │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ●  BODY                     4 of 5   ›     │  │  ← 64pt row
│  │    Sleep · Pain · Eating · Memory          │  │
│  │    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░          │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ ●  MIND                     3 of 4   ›     │  │
│  │    Mood · Worry · Coping                   │  │
│  │    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░          │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ ●  LIFE                     1 of 3   ›     │  │
│  │    Connection · Alcohol · Faith            │  │
│  │    ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░          │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘

              tap "LIFE" ──────────────▼

┌──────────────────────────────────────────────────┐
│  ‹ Your wellbeing        LIFE                    │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ✓  Connection & loneliness                 │  │
│  │    Last checked 12 days ago  ·  Doing well │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ ○  Alcohol & other substances              │  │
│  │    Not checked yet                         │  │
│  │    ┌──────────────────────────────────┐    │  │
│  │    │  Answer 3 questions  (2 min)   › │    │  │  ← 44pt, → catalog
│  │    └──────────────────────────────────┘    │  │     ?instrument=alcohol-3
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ ○  Faith & meaning                         │  │
│  │    Not checked yet                         │  │
│  │    ┌──────────────────────────────────┐    │  │
│  │    │  Answer 5 questions  (4 min)   › │    │  │  → ?instrument=fica
│  │    └──────────────────────────────────┘    │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Weak area → assessment:** the CTA *is* the instrument. One tap from the area row into the
questionnaire itself. Every row carries its own instrument name, question count and time
estimate, so the patient knows the cost before committing.

**Tap targets:** 3 at top level, 3–5 per drill-down. Max 8 on any screen.

---

### Design B — Your focus this week (ranked list, no map)

No model at all. Three ranked cards, then everything else collapsed.

```
┌──────────────────────────────────────────────────┐
│  ‹ Back        Your focus this week               │
│                                                  │
│  Based on your last check-ins.                   │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  1                                          │  │
│  │  Sleep                                      │  │
│  │  You scored in the "needs attention"        │  │
│  │  range on 3 Aug.                            │  │
│  │  Body · Sleep Quality check-in              │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  Re-check my sleep  (4 q · 2 min)  › │  │  │  → ?instrument=sleep-4
│  │  └──────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  Add a sleep goal                  › │  │  │  → BPS plan, sleep preselected
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  2   Connection & loneliness                │  │
│  │      Last checked 41 days ago — out of date │  │
│  │      ┌──────────────────────────────────┐  │  │
│  │      │  Check in again  (3 q · 1 min) › │  │  │
│  │      └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  3   Alcohol & other substances             │  │
│  │      We haven't asked you about this yet    │  │
│  │      ┌──────────────────────────────────┐  │  │
│  │      │  Answer 3 questions  (1 min)   › │  │  │
│  │      └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ▸  See all 12 areas                             │  ← collapsed, 1 tap
└──────────────────────────────────────────────────┘
```

**Weak area → assessment:** the primary button on each card. Zero navigation between
"this is weak" and "measure it".

**Tap targets:** 4–7. Fewest of the three.

**Risk:** the ranking is a *claim about severity*, and §6 shows the data cannot support it —
13 of 26 subdomains produce no score at all, so any ranking is really "recency of check-in"
wearing a severity costume. At cold start the ranking is arbitrary.

---

### Design C — What we've heard from you (coverage checklist) — **RECOMMENDED**

A single linear checklist. Grouped by the three domains as *headers only*, never as
navigation. One row per L2 area, 12 rows total.

```
┌──────────────────────────────────────────────────┐
│  ‹ Back        What we've heard from you          │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  You've told us about                       │  │
│  │                                             │  │
│  │        8  of  12  areas                     │  │  ← 34pt numeral
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░       │  │
│  │                                             │  │
│  │  ┌───────────────────────────────────────┐ │  │
│  │  │  Start here: Sleep   (4 q · 2 min)  › │ │  │  ← the one CTA
│  │  └───────────────────────────────────────┘ │  │     → ?instrument=sleep-4
│  └────────────────────────────────────────────┘  │
│                                                  │
│  BODY                                    4 of 5  │
│  ┌────────────────────────────────────────────┐  │
│  │ ○  Sleep                        Not yet  › │  │  ← 56pt row, whole row taps
│  │ ✓  Getting around & daily tasks   Good   › │  │
│  │ ✓  Pain                           Mild   › │  │
│  │ ✓  Eating & nutrition             Good   › │  │
│  │ ✓  Memory & thinking              Good   › │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  MIND                                    3 of 4  │
│  ┌────────────────────────────────────────────┐  │
│  │ ✓  Mood                           Good   › │  │
│  │ ✓  Worry & stress          Needs care    › │  │
│  │ ✓  Coping & resilience            Good   › │  │
│  │ ○  Difficult experiences        Not yet  › │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  LIFE                                    1 of 3  │
│  ┌────────────────────────────────────────────┐  │
│  │ ✓  Connection & loneliness        Good   › │  │
│  │ ○  Alcohol & other substances   Not yet  › │  │
│  │ ○  Faith & meaning              Not yet  › │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘

           tap any row ─────────────▼

┌──────────────────────────────────────────────────┐
│  ‹ What we've heard          Sleep                │
│                                                  │
│  Why we ask                                      │
│  Poor sleep makes pain, mood and memory harder    │
│  to manage. It's one of the few things that       │
│  improves all three at once.                      │
│                                                  │
│  What you've told us                             │
│  Nothing yet.                                     │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Answer 4 questions about sleep   (2 min)› │  │  ← 52pt primary
│  └────────────────────────────────────────────┘  │     → ?instrument=sleep-4
│  ┌────────────────────────────────────────────┐  │
│  │  Add a sleep goal to my plan             › │  │  ← 52pt secondary
│  └────────────────────────────────────────────┘  │     → BPS, area preselected
│                                                  │
│  Your care team can see this.                    │
└──────────────────────────────────────────────────┘
```

**Weak area → assessment:** two paths, both one tap. `Start here` at the top jumps straight
to the highest-value unanswered instrument. Any `○ Not yet` row opens a detail sheet whose
primary button is that area's instrument.

**Tap targets:** 12 rows + 1 `Start here` + 1 back = 14, all ≥ 52pt, all in a single
vertical column with no positional meaning.

---

## 5. Recommendation: Design C, with B's "start here" row on top

### 5.1 Why C over A

A is a real improvement and I would ship it over what exists. But it puts **navigation**
between the patient and the thing they came for. To answer "should I do anything about my
sleep?" a patient must know that Sleep lives under Body. That is a taxonomy question, and
the fact that we have four contradictory taxonomies (§3) is direct evidence that *we* do not
reliably know the answer either. C flattens the hierarchy to headers, which carry orientation
without demanding a decision.

A also re-creates the density problem one level down: Body has 5 areas, and every future
instrument lands in an existing domain, so the drill-downs only grow. C grows by one row.

### 5.2 Why C over B

B is the best *engagement* design and the worst *honest* design, and §6 is why.

- 4 subdomains have no instrument at all.
- 9 more have an instrument that contributes nothing to the score.
- **13 of 26 subdomains — exactly half — can be fully "covered" and still contribute
  literally zero to the wellbeing number.**

A ranked severity list built on that substrate is a fabrication. It would confidently tell a
patient "your #1 issue this week is X" when the ranking is driven by which instruments happen
to have a band table. Worse, it fails hardest in the modal state: a new patient with no
completed assessments would see a ranked list of "weak" areas derived from nothing.

C makes exactly one claim: **"you have told us about this / you have not."** That claim is
always true, is true on day one, and is true for the 13 unscoreable subdomains. It is the
only encoding on offer that the data can actually back.

B's best idea — one unmissable "do this next" — survives as C's `Start here` row.

### 5.3 Why it works for a 70-year-old on a phone

Not "because it is simpler". Specifically:

1. **It is a list, and a list is the pattern this cohort already owns.** A checklist of
   health topics with ticks is the clipboard form in every waiting room they have ever sat
   in. There is nothing to learn. A three-circle Venn with overlap semantics is a technique
   from a stats textbook; the earlier scout's framing that this is hard "for any age group"
   is right, and §2.6 shows it does not even work as a Venn.
2. **Type size stops being a trade-off.** Every constraint in §1.3 and §2.5 exists because
   text lives inside a fixed 350-unit viewBox. In a list, `getScaledFontSize` works the way
   it does everywhere else in the app: text grows, rows grow, the page scrolls. A patient at
   iOS AX5 gets a longer page, not a smaller map. **This alone resolves §2.2 and §2.5
   permanently rather than mitigating them.**
3. **Tap targets become free.** A 56pt full-width row exceeds 44pt by design and cannot
   overlap its neighbour — which kills the Grief/Socioeconomic collision (§2.1) as a class of
   bug, not as an instance.
4. **Colour stops carrying meaning.** Today, domain identity is hue-only at 1.03:1 luminance
   separation (§1.5) — invisible to ~8% of men. In C, `✓ Good` and `○ Not yet` are *words*
   next to a *shape*; colour is decoration. This satisfies the "never colour-only
   signalling" rule structurally rather than by remembering to.
5. **VoiceOver order equals visual order.** A linear column has one unambiguous reading
   order. There is no correct order in which to read 26 dots scattered on a canvas, which is
   why the current SVG groups have no labels at all (§2.3).
6. **It answers the question older patients actually ask about a health app.** In dogfood,
   the recurring anxiety is not "how am I scoring" — it is *"what do you people know about
   me, and what are you going to ask next?"* "You've told us about 8 of 12 areas" answers
   that in one sentence. "Biological 3/8" does not.
7. **The cold start is a feature instead of a failure.** A new patient sees `0 of 12` and one
   button. Today a new patient sees 26 dashed dots, 26 dashed chips, three `0/8`-style
   fractions and a suggestion to "add a goal that includes Emotions". The empty state of C is
   its best state; the empty state of the map is its worst.

### 5.4 What we lose, honestly

- **The Venn goes away.** Ken commissioned it (COS-430 → COS-444 → COS-445) and it is his
  clinical mental model. Mitigation: keep the small decorative three-circle glimpse on the
  *Home tile* (`WellbeingMapPreview`, already primitive-only, no SVG) as an icon for the
  destination. It communicates "biopsychosocial" as branding, where it works, and stops
  pretending to be a data display, where it does not.
- **Overlap semantics are not expressible in a list.** Assess honestly: §2.6 proves the map
  is not currently expressing them either — 12 of 26 items are drawn in the wrong region. We
  are giving up a capability we do not have. If overlap must be shown, it belongs on the
  clinician view against L3, not on the patient phone.
- **26 → 12 loses granularity for goal tagging.** It does not: L3 stays exactly as it is
  (§3). Only the *rendering* collapses.

---

## 6. Instrument coverage gap

Built by inverting `subdomains[]` across all 22 seeds in `system-instruments.ts` and
intersecting with `DOMAIN_MEMBERS` (`wellbeing-score.service.ts:143`) and `ASSESSMENT_BANDS`
(`wellbeing-assessment-bands.ts` — 14 entries).

| Subdomain | Instruments that feed it | Contributes to the score? |
|---|---|---|
| genes | `full-intake` | **no** |
| neurobiology | `falls-12`, `cognition-8`, `mini-cog`, `moca`, `full-intake` | yes (4) |
| **sleep** | `sleep-4` | **no — no band table** |
| physical_health | `adl`, `iadl`, `pain-4`, `physical-function-4`, `falls-12`, `full-intake` | yes (3) |
| metabolic_disorders | `nutrition-5` | yes |
| immune_stress_response | `gad-7`, `pain-4`, `pss-4` | yes (2) |
| emotions | `phq-2`, `phq-9`, `gad-7`, `wellbeing-5`, `du-resilience-13` | yes (4) |
| **response_to_reward** | **— none —** | no |
| attitudes_beliefs | `hope` | **no** |
| perceptions | `gad-7`, `cognition-8`, `moca` | yes (3) |
| coping_skills | `phq-9`, `iadl`, `physical-function-4`, `pss-4`, `hope`, `du-resilience-13` | yes (3) |
| self_esteem | `phq-9`, `wellbeing-5`, `du-resilience-13` | yes (2) |
| **temperament** | **— none —** | no |
| diet_lifestyle | `alcohol-3`, `nutrition-5` | yes (2) |
| substance_use | `alcohol-3` | yes |
| interpersonal_relationships | `loneliness-3`, `ohio-leisure-interest` | yes (1) |
| **trauma** | **— none —** | no |
| **grief** | **— none —** | no |
| social_support | `loneliness-3`, `hope` | yes (1) |
| family_circumstances | `full-intake` | **no** |
| peer_group | `loneliness-3`, `ohio-leisure-interest` | yes (1) |
| work_school | `ohio-leisure-interest` | **no** |
| culture | `ohio-leisure-interest` | **no** |
| socioeconomic_status | `full-intake` | **no** |
| life_events | `ohio-leisure-interest` | **no** |
| **faith_spiritual** | `fica`, `hope` | **no** |

### Corrections to the earlier scout

- **"5 instruments feed the map but not the score" — confirmed.** `full-intake`, `fica`,
  `hope`, `du-resilience-13`, `ohio-leisure-interest`. 22 instruments carry `subdomains[]`;
  17 are in `DOMAIN_MEMBERS`.
- **"4 score instruments have no band table" — wrong, it is 3.** `pain-4`, `sleep-4`,
  `physical-function-4`. The fourth (`du-resilience-13`) also lacks bands but is not in
  `DOMAIN_MEMBERS` at all, so it never had a place in the number to vanish from. 17 members,
  14 banded.
- **"4 orphan subdomains" — confirmed**, and it understates the problem. A further **9
  subdomains have an instrument whose result contributes nothing to the score**: genes,
  sleep, attitudes_beliefs, family_circumstances, work_school, culture, socioeconomic_status,
  life_events, faith_spiritual. **13 of 26 (50%) can show as "covered" while contributing
  zero.**

### The two findings that should go to Ken today, independent of any redesign

1. **`sleep-4` has no band table, so sleep contributes 0 to the wellbeing score.** Sleep is
   one of the eight names on the Home tile, one of five Body areas, has a shipped 4-item
   instrument, and is listed in `DOMAIN_MEMBERS.bio`. It is silently dropped by
   `getBandDef()` returning `undefined`. Same for `pain-4` and `physical-function-4`. The
   `bio` domain nominally has 7 members and can currently be driven by at most 4.
2. **`fica` and `hope` contribute 0 to the score.** They are typed `domain: 'spiritual'`, a
   value `BpsDomain` does not have. Faith is a differentiating pillar of this product and is
   arithmetically invisible in its headline number.

### What to do about the 4 orphans

Governing rule, which the current screen violates: **never render a gap the patient cannot
close.** All four orphans are permanently dashed today, and §2.8 shows `pickNextMove` can
select one as the screen's loudest CTA.

| Orphan | Decision | Rationale |
|---|---|---|
| `response_to_reward` | **Retire from the patient surface.** Keep as an L3 tag the LLM may attach to goals. | A neuroscience construct with no plain-English patient meaning and no plausible short self-report. It has never been fillable and is the concrete dead end in §2.8. |
| `temperament` | **Fold into "Coping & resilience" (L2 #8).** One-line change: add `'temperament'` to `du-resilience-13`'s `subdomains[]`. | Trait-level disposition is what a resilience scale already samples. No new instrument, no new content, no clinical review. |
| `trauma` | **Adopt an instrument — PC-PTSD-5** (VA, public domain, 5 items). Ship as L2 #9 "Difficult experiences". | The one orphan that genuinely needs measurement. **Blocked on clinical + legal sign-off**: a positive trauma screen needs a care-team escalation path, exactly as PHQ-9 q9 does. Until that path exists, do **not** show it as an unfilled gap. |
| `grief` | **Fold into L2 #9 "Difficult experiences"** alongside trauma; optionally adopt the 5-item Brief Grief Questionnaire later. | Clinically real, lower acuity than trauma. Folding avoids a 13th row that is empty for most patients. |

Net: 26 L3 subdomains, 25 reachable through an L2 area, 1 (`response_to_reward`) internal
only, and **zero patient-visible gaps that cannot be closed.**

---

## 7. Migration plan — the route must not be stranded

`/Home/wellbeing-map` has **nine** inbound references. Any plan that renames or removes the
path breaks OTA'd bundles already in the field, which hold the string literal.

```
app/Home/index.tsx:2850                                  router.push('/Home/wellbeing-map')
components/home/WellbeingMapPreview.tsx:81               router.push('/Home/wellbeing-map')
components/health-plan/senior/WellbeingMapGlimpse.tsx:80 router.push('/Home/wellbeing-map')
components/health-plan/BiopsychosocialPlanScreen.tsx:1811 router.push('/Home/wellbeing-map')
components/unified-plan/v2/BpsAccordion.tsx:337,342,347  pathname + ?section=<UnifiedSectionKey>
components/unified-plan/v2/WellbeingMapCard.tsx:20       WELLBEING_MAP_ROUTE
hooks/use-score-catalog.ts:194                           links.map
app/Home/_layout.tsx:481                                 <Tabs.Screen name="wellbeing-map" href={null}>
```

**Rule 0: the path never changes.** Swap the screen's *implementation* behind a flag; leave
`app/Home/wellbeing-map.tsx`'s default export in place permanently.

**Rule 1: `?section=` keeps working.** `BpsAccordion` deep-links from three sites with
`?section=<UnifiedSectionKey>`. v2 must accept the same param and scroll to / expand the
matching domain group, reusing `unifiedSectionToWellbeingMapDomain` from
`components/unified-plan/section-labels.ts` unchanged.

### Phase 0 — accessibility fixes on the CURRENT screen (ship this week, no design sign-off)

Independently valuable, and they hold if the redesign slips. All in
`app/Home/wellbeing-map.tsx` unless noted.

1. Add `accessibilityRole="button"` + `accessibilityLabel` to each of the 26 `<G onPress>`,
   reusing the chip label string already built at line 852-853.
2. Fix the legend at lines 683-686 — it is wrong about the map (§2.4). Either say "dashed
   outline on a dot means the area spans two circles" or drop dashed from the dots.
3. Nudge `grief` to `dy: 258` so its hit circle stops eating Socioeconomic Status's taps
   (§2.1). One-line, zero-risk.
4. Make the three coverage cards either tappable (scroll to that group) or visually
   non-interactive (§2.1).
5. Darken `#8E8E93` gap labels to `#5A5A5F` (2.99:1 → 5.4:1 on `#f5f5f5`), and
   `#C97600` → `#A15E00` for the social header (§1.4).
6. `components/home/WellbeingScoreTile.tsx`: `accessibilityHint` says "wellbeing map",
   `onPress` goes to `/Home/wellbeing-score`. Fix the hint (§2.3).

*Deliberately excluded:* wiring `getScaledFontSize` into the SVG. It buys 0.4pt (§2.2) and
would create the impression the issue is handled.

### Phase 1 — data, no UI (backend + lib only)

7. `lib/wellbeing-areas.ts`: the 12 L2 areas, each with `{ id, label, domain, subdomains[],
   instruments[], whyItMatters }`. Derive `instruments[]` by inverting the seeds — never
   hand-maintain a second copy (§3).
8. `/Home/assessments-catalog` accepts `?instrument=` and `?area=` (prerequisite P2). This
   alone repairs §2.9 for the *existing* screen: change the sheet's `handleTakeAssessment`
   (line 307) to pass the subdomain's first instrument.
9. Fix the four catalog/score domain disagreements at the seed, map `spiritual → social`,
   and derive `DOMAIN_MEMBERS` instead of hand-writing it in two repos (§3).
10. Add band tables for `sleep-4`, `pain-4`, `physical-function-4` (§6). **Ken clinical
    review required** — this changes real scores for real patients, so it needs its own soak.

### Phase 2 — v2 screen behind a flag

11. New `components/wellbeing/WellbeingAreasScreen.tsx` implementing Design C. Primitive
    envelope only — `View / Text / Pressable / ScrollView / Modal / MaterialIcons /
    StyleSheet`. No SVG anywhere, which is the point.
12. `app/Home/wellbeing-map.tsx` becomes a thin switch:

    ```
    wellbeing_map_v2_enabled ? <WellbeingAreasScreen/> : <LegacyWellbeingMap/>
    ```

    Legacy renderer moves to `components/wellbeing/LegacyWellbeingMap.tsx` **byte-identical**,
    so the OFF path is provably unchanged.
13. Flag is backend-driven — SSM → `/v1/feature-flags` → `useFeatureFlags`, per
    `feedback_fe_flags_backend_driven`. Default **OFF**. Never `EXPO_PUBLIC_*`.

### Phase 3 — roll out

14. Flip dev. Ken + Vishal dogfood. Then staging. Then production, per the no-prod-until-
    dev-and-staging rule.
15. Use the per-user override (`beta_testers` group + `_beta` SSM key, see
    `reference_beta_flag_overrides`) so Ken sees v2 in production before anyone else.
16. Rollback is a 30-second SSM flip, no OTA. This is why the switch lives in the screen and
    not in the router.

### Phase 4 — cleanup, ≥2 weeks after 100%

17. Delete `LegacyWellbeingMap.tsx` and the flag branch.
18. **Do not delete `app/Home/wellbeing-map.tsx` and do not remove the `<Tabs.Screen>`
    registration.** The path is load-bearing for nine call sites and for bundles in the
    field.
19. Only then update `WellbeingMapPreview`'s copy from "Explore all 8 areas" to
    "You've told us about N of 12" and delete the `MAP_DIMENSIONS` array (§3).

### Open questions for Ken

- Is `Body / Mind / Life` acceptable patient-facing naming for the three domains, retiring
  both "Social & Spiritual" and "Social & Faith"?
- Do the 12 L2 areas match his clinical model, and is "Difficult experiences" the right
  container for trauma + grief?
- Does adopting PC-PTSD-5 clear clinical and legal, and what is the escalation path on a
  positive screen?
- Are the missing band tables for `sleep-4` / `pain-4` / `physical-function-4` a scoring
  decision he wants to make now, or should those three areas render as "we track this but
  don't score it yet"?
