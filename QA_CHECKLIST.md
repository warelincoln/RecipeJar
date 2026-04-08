# Orzo MVP — Manual QA Checklist

## How to use this document

Each scenario describes a **test input**, the **API sequence** to exercise it, the **expected validation issues**, the **expected save state**, and the **expected XState machine state** the mobile app should land in. Use `curl` / PowerShell or the mobile app to execute each scenario against the live server.

All issue codes reference `ValidationIssueCode` from `shared/src/types/validation.types.ts`.
All save states reference `RecipeSaveState` from `shared/src/types/save-decision.types.ts`.
Machine states reference `importMachine` in `mobile/src/features/import/machine.ts`.

---

## Scenario 1 — Clean single-page recipe (image)

**Input:** Clear, well-lit photo of a single page with title, ingredients list, and numbered steps. No blurriness, no cross-references.

**API sequence:**
1. `POST /drafts` → creates image draft
2. `POST /drafts/:id/pages` → upload the single page image
3. `POST /drafts/:id/parse` → GPT-4o Vision extracts content

**Expected validation issues:**

| Code | Severity | Likely? | Notes |
|------|----------|---------|-------|
| `DESCRIPTION_DETECTED` | `FLAG` | Maybe | Only if GPT-4o detects a blurb/description |
| `INGREDIENT_QTY_OR_UNIT_MISSING` | `FLAG` | Maybe | If any ingredient says "salt" without quantity |

**Expected save state:** `SAVE_CLEAN` (no BLOCK, no CORRECTION_REQUIRED, no RETAKE)

**Machine state after parse:** `previewEdit`

**Save flow:**
- If no FLAGs: `ATTEMPT_SAVE` → `saving` → `saved`
- If FLAGs present: `ATTEMPT_SAVE` → `finalWarningGate` → user chooses `SAVE_ANYWAY` → `saving` → `saved` (saveState becomes `SAVE_USER_VERIFIED`)

---

## Scenario 2 — Multi-page recipe (image)

**Input:** Two or three photos capturing a recipe that spans multiple cookbook pages. Page 1 has title + ingredients, page 2 has steps.

**API sequence:**
1. `POST /drafts` → creates image draft
2. `POST /drafts/:id/pages` → upload page 1
3. `POST /drafts/:id/pages` → upload page 2
4. `POST /drafts/:id/parse` → GPT-4o processes all pages

**Expected validation issues:**

| Code | Severity | Likely? | Notes |
|------|----------|---------|-------|
| `DESCRIPTION_DETECTED` | `FLAG` | Maybe | |
| `SUSPECTED_OMISSION` | `CORRECTION_REQUIRED` | Maybe | If GPT-4o senses a gap between pages |
| `LOW_CONFIDENCE_STRUCTURE` | `RETAKE` | Maybe | If page overlap confuses extraction |

**Expected save state:** `SAVE_CLEAN` if extraction is clean; `NO_SAVE` if `SUSPECTED_OMISSION` or `LOW_CONFIDENCE_STRUCTURE` fires

**Machine state after parse:**
- Clean extraction → `previewEdit`
- `RETAKE` issue → `retakeRequired`
- `CORRECTION_REQUIRED` (no RETAKE) → `previewEdit` (user can enter correction via `ENTER_CORRECTION`)

**Key behavior to verify:**
- Page ordering via `REORDER` event before parse
- Both pages contribute content to a single merged candidate
- Retake targets a specific page (`retakePageId`)

---

## Scenario 3 — Recipe with ingredient headers / sections

**Input:** Recipe where ingredients are grouped under section headers (e.g., "For the filling:", "For the crust:", "For the glaze:").

**API sequence:** Same as Scenario 1 (image or URL).

**Expected validation issues:**

| Code | Severity | Likely? | Notes |
|------|----------|---------|-------|
| `DESCRIPTION_DETECTED` | `FLAG` | Maybe | |
| `INGREDIENT_QTY_OR_UNIT_MISSING` | `FLAG` | Maybe | Headers like "For the crust:" have no qty |

**Expected save state:** `SAVE_CLEAN` — headers with `isHeader: true` are excluded from the "no ingredients" check

**Machine state after parse:** `previewEdit`

**Key behavior to verify:**
- `ParsedIngredientEntry.isHeader` is `true` for section headers
- Section headers are NOT counted as real ingredients (validation skips them)
- Headers still appear in the rendered list in correct `orderIndex` position
- Ingredient count in validation only counts entries where `isHeader === false`

---

## Scenario 4 — Weak / blurred image

**Input:** Deliberately blurry or poorly-lit photo of a recipe page where text is hard to read.

**API sequence:** Same as Scenario 1.

**Expected validation issues:**

| Code | Severity | Notes |
|------|----------|-------|
| `POOR_IMAGE_QUALITY` | `RETAKE` | GPT-4o signals poor quality |
| `LOW_CONFIDENCE_STRUCTURE` | `RETAKE` | Extraction unreliable |
| `SUSPECTED_OMISSION` | `CORRECTION_REQUIRED` | Content likely missing |
| `TITLE_MISSING` | `CORRECTION_REQUIRED` | Title may not be readable |
| `INGREDIENTS_MISSING` | `BLOCK` | Possibly zero extracted |
| `STEPS_MISSING` | `BLOCK` | Possibly zero extracted |

**Expected save state:** `NO_SAVE`

**Machine state after parse:** `retakeRequired` (RETAKE issues with retakeCount < 2 on all pages)

**Retake flow:**
1. Machine enters `retakeRequired`
2. User retakes photo → `RETAKE_SUBMITTED` → `parsing` (re-parse with new image)
3. If second retake still poor → still `retakeRequired` (retakeCount now 1)
4. After 3rd attempt (retakeCount = 2 on all pages) → `RETAKE_LIMIT_REACHED` replaces `RETAKE` with `BLOCK`, `canEnterCorrectionMode` becomes false; machine stays at `retakeRequired` but user can `ENTER_CORRECTION` → `guidedCorrection`

**Escalation path to guided correction:**
- `retakeRequired` → `ENTER_CORRECTION` → `guidedCorrection`
- User manually fixes fields → `CORRECTION_COMPLETE` → `previewEdit`
- Re-validation runs on edited candidate

---

## Scenario 5 — Non-recipe image

**Input:** Photo of something that is clearly not a recipe — a cat, a landscape, a blank wall.

**API sequence:** Same as Scenario 1.

**Expected validation issues:**

| Code | Severity | Notes |
|------|----------|-------|
| `STRUCTURE_NOT_SEPARABLE` | `BLOCK` | No ingredient/step structure found |
| `TITLE_MISSING` | `CORRECTION_REQUIRED` | |
| `INGREDIENTS_MISSING` | `BLOCK` | |
| `STEPS_MISSING` | `BLOCK` | |
| `POOR_IMAGE_QUALITY` | `RETAKE` | Model returns error signals |
| `LOW_CONFIDENCE_STRUCTURE` | `RETAKE` | |

**Expected save state:** `NO_SAVE`

**Machine state after parse:** `retakeRequired` (due to RETAKE issues)

**Key behavior to verify:**
- `STRUCTURE_NOT_SEPARABLE` (BLOCK) means `canEnterCorrectionMode = false` when there are also BLOCK issues
- The app should show "this doesn't appear to be a recipe" messaging
- User can go back to capture and try a different image

---

## Scenario 6 — Cross-reference text ("see page 28")

**Input:** Recipe image where the text contains a cross-reference like "For the sauce, see page 28" or "continued on next page". This signals the recipe extends beyond what's captured.

**API sequence:** Same as Scenario 1 or 2.

**Expected validation issues:**

| Code | Severity | Notes |
|------|----------|-------|
| `SUSPECTED_OMISSION` | `CORRECTION_REQUIRED` | GPT-4o detects reference to missing content |
| `LOW_CONFIDENCE_STRUCTURE` | `RETAKE` | Maybe, if it confuses extraction |
| `DESCRIPTION_DETECTED` | `FLAG` | Maybe |

**Expected save state:** `NO_SAVE` (due to `CORRECTION_REQUIRED`)

**Machine state after parse:** `previewEdit` (if no RETAKE issues) or `retakeRequired` (if RETAKE issues present)

**Correction flow:**
1. From `previewEdit`, user sees `SUSPECTED_OMISSION` warning
2. User taps `ATTEMPT_SAVE` → guard detects `hasCorrectionRequiredIssues` → redirects to `guidedCorrection`
3. Or user manually enters correction via `ENTER_CORRECTION` → `guidedCorrection`
4. In `guidedCorrection`, user adds the missing content or confirms it's not needed
5. `CORRECTION_COMPLETE` → `previewEdit` with new `editedCandidate`
6. Server re-validates via `PATCH /drafts/:id/candidate`
7. If all issues resolved → `SAVE_CLEAN` → can save

---

## Scenario 7 — Clean URL recipe (structured data / JSON-LD)

**Input:** URL to a recipe blog that serves JSON-LD structured data (e.g., BBC Good Food, many WordPress recipe blogs using WP Recipe Maker).

**API sequence:**
1. `POST /drafts/url` with `{"url": "https://..."}`
2. `POST /drafts/:id/parse`

**Expected validation issues:** None for well-structured sites.

**Expected save state:** `SAVE_CLEAN`

**Machine state after parse:** `previewEdit`

**Key behavior to verify:**
- JSON-LD extraction succeeds without AI fallback (fast response, <1 second)
- Quality gate passes (2+ ingredients, 1+ steps, title > 2 chars)
- Extraction method logged as `json-ld`
- `candidate.extractionMethod` is `"json-ld"`
- `parseSignals.structureSeparable` is `true`
- All signal booleans (`poorImageQuality`, `lowConfidenceStructure`, etc.) are `false`
- Ingredient `isHeader` correctly identifies section headers from structured data
- `HowToSection` names appear as step headers with `isHeader: true`
- Optional metadata (yield, times, image) captured if present in JSON-LD

---

## Scenario 8 — URL with no structured data (AI fallback)

**Input:** URL to a recipe page with no JSON-LD or Microdata — just plain HTML content.

**API sequence:** Same as Scenario 7.

**Expected validation issues:** Depends on AI extraction quality. Possible:

| Code | Severity | Notes |
|------|----------|-------|
| `SUSPECTED_OMISSION` | `FLAG` | If AI can't extract everything |
| `INGREDIENT_MERGED` | `FLAG` | If AI merges lines |

**Expected save state:** `SAVE_CLEAN` if extraction is clean

**Machine state:** `previewEdit`

**Key behavior to verify:**
- Cascade order: JSON-LD returns null → Microdata returns null → DOM boundary extracts text → AI parses it
- `candidate.extractionMethod` is `"dom-ai"`
- Extraction method logged as `dom-ai`
- Response takes longer (3-10 seconds for AI call)
- Smart truncation biases the AI input window toward recipe content (ingredients/steps sections)
- AI response is validated (must have title, 1+ ingredients, 1+ steps)

---

## Scenario 9 — URL that blocks server fetch (403 / bot protection)

**Input:** URL to a recipe site that blocks server-side fetching (e.g., AllRecipes, Simply Recipes).

**API sequence (browser-backed path):**
1. Open the page in `WebRecipeImportScreen`
2. Tap **Save to Orzo**
3. App attempts WebView HTML capture and calls `POST /drafts/:id/parse` with `{ html, acquisitionMethod: "webview-html" }`
4. If capture fails technically, app retries once with `POST /drafts/:id/parse` and `{ acquisitionMethod: "server-fetch-fallback", captureFailureReason }`

**Expected behavior:**
1. Browser-backed import should prefer captured WebView HTML over server fetch
2. If HTML capture succeeds, the normal extraction cascade runs on that HTML
3. If HTML capture fails technically, the app falls back once to server fetch
4. If server fetch also fails, `buildErrorCandidate()` is returned with error signals

**If browser HTML capture succeeds:** Normal extraction cascade runs on the captured HTML.

**If browser capture fails and server fetch also fails:**

| Code | Severity | Notes |
|------|----------|-------|
| `STRUCTURE_NOT_SEPARABLE` | `BLOCK` | |
| `TITLE_MISSING` | `FLAG` | |
| `INGREDIENTS_MISSING` | `BLOCK` | |
| `STEPS_MISSING` | `BLOCK` | |
| `SUSPECTED_OMISSION` | `FLAG` | |

**Expected save state:** `NO_SAVE`

**Machine state after parse:** `retakeRequired` (due to error-candidate signals)

**Key behavior to verify:**
- Acquisition method logged as `webview-html`, `server-fetch-fallback`, or `server-fetch`
- Extraction method logged as `json-ld`, `microdata`, `dom-ai`, or `error` with reason
- Successful HTML capture does not silently re-run server fetch when parsing returns a weak candidate
- Server doesn't crash on fetch failure
- Browser capture failure triggers at most one server-fetch fallback
- User should be informed the URL could not be accessed

---

## Scenario 12 — URL with Microdata but no JSON-LD

**Input:** URL to a recipe page that uses `itemprop` attributes on HTML elements but has no `<script type="application/ld+json">` tag. Common on older recipe sites and some CMS platforms.

**API sequence:** Same as Scenario 7.

**Expected behavior:**
1. JSON-LD extraction returns null (no script tags)
2. Microdata extraction reads `itemprop="name"`, `itemprop="recipeIngredient"`, `itemprop="recipeInstructions"` from HTML elements
3. Quality gate checks the Microdata result
4. If quality gate passes, returns structured candidate without AI

**Expected validation issues:** None for well-structured Microdata.

**Expected save state:** `SAVE_CLEAN`

**Machine state after parse:** `previewEdit`

**Key behavior to verify:**
- `candidate.extractionMethod` is `"microdata"`
- Extraction method logged as `microdata`
- No AI call made (fast response, <1 second)
- Ingredients and steps extracted as individual entries (one per `itemprop` element)

---

## Scenario 10 — Warning gate round-trip

**Input:** Any successfully parsed recipe that has at least one `FLAG`-severity issue (e.g., `DESCRIPTION_DETECTED` or `INGREDIENT_QTY_OR_UNIT_MISSING`).

**API sequence:**
1. Parse any clean recipe (Scenarios 1 or 7 typically produce FLAGs)
2. From `previewEdit`, send `ATTEMPT_SAVE`

**Expected machine behavior:**

```
previewEdit
  └─ ATTEMPT_SAVE (guard: hasWarnings && !blocking && !correctionRequired)
      └─ finalWarningGate
          ├─ REVIEW_REQUESTED → previewEdit (go back and edit)
          └─ SAVE_ANYWAY → saving → saved
```

**Warning gate sub-tests:**

| Action | Expected Result |
|--------|----------------|
| `ATTEMPT_SAVE` from previewEdit with FLAGs | Machine → `finalWarningGate` |
| `REVIEW_REQUESTED` from finalWarningGate | Machine → back to `previewEdit` |
| `SAVE_ANYWAY` from finalWarningGate | Machine → `saving` → `saved` |
| Saved recipe's `saveState` | `SAVE_USER_VERIFIED` (because FLAG was dismissed) |
| Saved recipe's `isUserVerified` | `true` |
| `ATTEMPT_SAVE` with no FLAGs at all | Machine → `saving` directly (no gate) |

**API-level verification:**
1. `POST /drafts/:id/save` after dismissing warnings
2. Response: `saveDecision.saveState === "SAVE_USER_VERIFIED"`, `saveDecision.allowed === true`
3. `GET /recipes/:id` → `saveState === "SAVE_USER_VERIFIED"`, `isUserVerified === true`

---

## Scenario 11 — Draft resume / bootstrap

**Input:** A previously created draft that was abandoned mid-flow.

**API sequence:**
1. Create a draft and parse it, but do NOT save
2. Close the app / session
3. `RESUME_DRAFT` event with the draft ID

**Expected machine behavior:** Machine enters `resuming`, fetches draft from API, and routes to the correct state based on `draft.status`:

| Draft status | Machine target state |
|---|---|
| `CAPTURE_IN_PROGRESS` | `capture` |
| `PARSED` | `previewEdit` |
| `READY_TO_SAVE` | `previewEdit` |
| `NEEDS_RETAKE` | `retakeRequired` |
| `IN_GUIDED_CORRECTION` | `guidedCorrection` |
| `SAVED` | `saved` |

**Key behavior to verify:**
- Context is fully hydrated from DB: `parsedCandidate`, `editedCandidate`, `validationResult`
- User can continue exactly where they left off
- No data loss between sessions

---

## Quick-reference: Validation rule evaluation order

```
1. rules.structure     → STRUCTURE_NOT_SEPARABLE (BLOCK)
2. rules.integrity     → CONFIRMED_OMISSION (BLOCK), SUSPECTED_OMISSION (CORRECTION_REQUIRED), MULTI_RECIPE_DETECTED (BLOCK)
3. rules.required-fields → TITLE_MISSING (CORRECTION_REQUIRED), INGREDIENTS_MISSING (BLOCK), STEPS_MISSING (BLOCK)
4. rules.ingredients   → INGREDIENT_MERGED, INGREDIENT_NAME_MISSING, INGREDIENT_QTY_OR_UNIT_MISSING, MAJOR_OCR_ARTIFACT, MINOR_OCR_ARTIFACT
5. rules.steps         → STEP_MERGED, MAJOR_OCR_ARTIFACT, MINOR_OCR_ARTIFACT
6. rules.description   → DESCRIPTION_DETECTED (FLAG)
7. rules.retake        → LOW_CONFIDENCE_STRUCTURE (RETAKE or BLOCK), POOR_IMAGE_QUALITY (RETAKE or BLOCK)
```

## Quick-reference: Save-decision logic

```
Has BLOCK or CORRECTION_REQUIRED or RETAKE?
  → NO_SAVE, allowed: false

Has FLAGs and some are dismissed?
  → SAVE_USER_VERIFIED, allowed: true

No FLAGs at all (or none dismissed)?
  → SAVE_CLEAN, allowed: true
```

## Quick-reference: Machine state transitions

```
idle → capture (NEW_IMAGE_IMPORT)
idle → parsing (NEW_URL_IMPORT)
idle → resuming (RESUME_DRAFT)

capture → reorder (DONE_CAPTURING)
reorder → parsing (CONFIRM_ORDER)

parsing → previewEdit (clean parse)
parsing → retakeRequired (RETAKE issues)
parsing → guidedCorrection (CORRECTION_REQUIRED, IN_GUIDED_CORRECTION status)

previewEdit → saving (ATTEMPT_SAVE, SAVE_CLEAN, no warnings)
previewEdit → finalWarningGate (ATTEMPT_SAVE, has FLAGs, no blockers)
previewEdit → guidedCorrection (ENTER_CORRECTION or ATTEMPT_SAVE with CORRECTION_REQUIRED)

retakeRequired → parsing (RETAKE_SUBMITTED)
retakeRequired → guidedCorrection (ENTER_CORRECTION)

guidedCorrection → previewEdit (CORRECTION_COMPLETE)

finalWarningGate → previewEdit (REVIEW_REQUESTED)
finalWarningGate → saving (SAVE_ANYWAY)

saving → saved (success)
saving → previewEdit (error)
```
