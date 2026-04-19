# Recipe image fixtures for the LLM eval suite

Used by `server/tests/image-parse-eval.test.ts` (gated by `RUN_LLM_EVALS=1`).

## Purpose

Real LLM vision output is non-deterministic. Unit tests mock OpenAI so they can't
catch regressions in parse quality (fraction misreads, missing ingredients,
hallucinations). This suite exercises the live OpenAI API against hand-transcribed
ground truth and scores it.

**This is the hard quality gate for the split-call architecture.** Any
fraction regression (⅓ misread as ½, etc.) must block the PR.

## How to add a fixture

1. Create a new directory: `server/tests/fixtures/recipe-images/<slug>/`
2. Drop an image at `<slug>/image.<ext>` where `<ext>` is one of `jpg`, `jpeg`,
   `png`, `webp`, `heic`, or `HEIC`. Raw iPhone photos (HEIC) work directly —
   on macOS the loader shells out to `sips` to decode HEIC before handing to
   sharp, since sharp's npm prebuilds drop libheif on macOS. Running this
   eval on non-macOS would need a drop-in HEIC decoder (e.g. `heic-convert`)
   but evals are local-dev-only today, not a CI concern. Real cookbook
   pages or magazine clippings work best. Screenshots of recipe websites
   also OK.
3. Create `<slug>/expected.json` with the ground-truth shape below. Values are
   case-insensitive match where applicable.
4. Commit both. CI will skip evals unless `RUN_LLM_EVALS=1` is set, so committing
   fixtures is cheap.

## Expected JSON shape

```jsonc
{
  "title": "Classic Pancakes",             // exact match, case-insensitive
  "servings": 4,                           // or null if not on the page
  "ingredients": [
    {
      "amount": 2,                         // must match within 0.001, or null
      "unit": "cup",                       // case-insensitive; variants ok
      "name": "flour"                      // case-insensitive substring match
    },
    {
      "amount": 0.5,                       // ½ written as 0.5 (see fraction rules)
      "unit": "tsp",
      "name": "salt"
    }
  ],
  "stepCount": 7,                          // integer, must match exactly
  "requiredStepNumerics": [                // every value must appear in at least
    "350",                                 // one step's text, case-insensitive
    "20 minutes",
    "9x13"
  ],
  "requiredStepTools": [                   // tools that MUST survive Call B's
    "oven",                                // concision rewrite
    "skillet",
    "whisk"
  ]
}
```

### Fraction rules

- `½` → `0.5`
- `⅓` → `0.333` (tolerance 0.001)
- `⅔` → `0.667`
- `¼` → `0.25`
- `¾` → `0.75`
- `⅛` → `0.125`
- `1 ½` → `1.5` (mixed numbers to decimal)
- `1-2` → `amount: 1, amountMax: 2`

### What NOT to include in `expected.json`

- Verbatim step text. Call B rewrites prose ≤40 words per step — we check
  numeric/tool fidelity, not prose match.
- `description`. Descriptions are optional and don't affect quality scoring.
- Rich ingredient signals. Happy-path correctness is what matters here.

## Running the suite

```bash
# Run just the eval suite with real OpenAI calls:
RUN_LLM_EVALS=1 cd server && npm test -- image-parse-eval

# Regular test suite skips evals — they cost money + are slow:
cd server && npm test
```

Each fixture costs roughly 2x the per-parse OpenAI cost (both Call A and Call B
run against it). For a 10-fixture suite, expect ~$0.50 per full run at today's prices.

## Recommended seed fixtures

See the plan at `~/.claude/plans/the-current-parse-times-clever-church.md` for the
recommended 10-fixture mix:

1. `cookbook-01-fractions-mix/` — multiple ½/⅓/¼ in one recipe
2. `cookbook-02-multi-column-ingredients/` — two-column ingredient layout
3. `cookbook-03-handwritten-card/` — handwritten recipe card
4. `cookbook-04-stylized-typography/` — script font, drop caps
5. `cookbook-05-page-w-header-note/` — page header, sidebar note, running footer
6. `cookbook-06-long-prose-steps/` — verbose narrative steps (concision stress test)
7. `cookbook-07-cross-references/` — "see page 28" style refs
8. `cookbook-08-thirds-eighths-heavy/` — lots of ⅓/⅔/⅛
9. `cookbook-09-mixed-fractions/` — `1 ½`, `2 ¾`, etc
10. `cookbook-10-simple-baseline/` — clean, printed, easy case

Start with 3-5 real fixtures before merging PR 2, add the rest post-merge as you
encounter real failure modes.
