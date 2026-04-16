# Phase 3 — Emotional Lock-In (Weeks 11–12)

> **What this doc covers:** Detailed feature breakdowns for Phase 3: "Cooked It" Log & Cooking Journal (3.1), Personal Cooking Stats & Year in Review (3.2), Recipe Memories & Story Annotations (3.3), Recipe Tags & Smart Collections (3.4). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Make Orzo feel like a personal artifact — something that becomes more valuable over time, harder to leave, and emotionally meaningful. These features are cheap to build but disproportionately powerful for retention.

The best analogy: Instagram started as a photo filter app. People stayed because their memories were there. Orzo starts as a digitization tool. People stay because their cooking life is there.

---

## 3.1 — "Cooked It" Log & Cooking Journal

| | |
|---|---|
| **Effort** | S (1 day) |
| **Revenue impact** | Medium — emotional lock-in, trivial to build |
| **Depends on** | 0.1 (Auth) |
| **Tier** | Free (basic) · Pro (photos + stats) |

**What to build:**

- `cook_log` table: `id`, `user_id`, `recipe_id`, `cooked_at`, `photo_url` (nullable), `notes` (nullable), `servings_made`
- "I Made This" button on recipe detail → optional photo + note → save
- Cook count badge on recipe cards ("Cooked 5×")
- "Cooking History" tab/section: chronological feed of what you've cooked, with dates and optional photos
- Sort recipes by "most cooked" and "recently cooked"
- Free tier: log without photos · Pro: photos + detailed stats

**Why this is so important:** This is the single cheapest feature with the highest emotional lock-in. Once someone has 6 months of cooking history in Orzo, switching to Paprika means losing that history. It's the same reason people don't leave Strava — their entire running history lives there. Build early so data accumulates from day one.

---

## 3.2 — Personal Cooking Stats & Year in Review

| | |
|---|---|
| **Effort** | S (1–2 days) |
| **Revenue impact** | Medium — shareable, drives word-of-mouth |
| **Depends on** | 3.1 (Cook Log) |
| **Tier** | Pro only |

**What to build:**

- Stats dashboard (computed client-side from `cook_log`):
  - Recipes cooked this month / this year
  - Most-cooked recipe (with count)
  - "Cooking streak" — consecutive weeks with at least one cook
  - New recipes tried vs. repeats ratio
  - Average rating of recipes cooked
  - Total recipes in library + growth over time
- **Year in Review** (December feature): Spotify Wrapped-style shareable summary
  - "In 2026, you cooked 89 meals from 42 recipes. Your most-made recipe was Grandma's Chicken Soup (12 times). You tried 23 new recipes."
  - Shareable card (generate as image) → social media, Messages
  - Every shared "Year in Review" card is a free ad for Orzo — a viral acquisition moment

---

## 3.3 — Recipe Memories & Story Annotations

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | Low direct, high emotional |
| **Depends on** | Existing recipe notes feature |
| **Tier** | Free |

**What to build:**

- Extend the existing notes feature with a "Story" field on recipes — a longer-form text area for the personal history behind a recipe
- "This is my grandmother's recipe from 1972. She made it every Thanksgiving..."
- Displayed prominently on recipe detail, above ingredients
- Optional: attach a photo to the story (the original handwritten card, a photo of grandma cooking)

**Why this is free-tier:** This is the feature that makes people fall in love with Orzo during the free trial. It's what separates "a recipe app" from "my family's digital cookbook." It costs you nothing to serve (text + optional image) and creates deep emotional investment that makes the paywall conversion feel natural.

---

## 3.4 — Recipe Tags & Smart Collections

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — organizational depth |
| **Depends on** | Existing collections feature |
| **Tier** | Free: manual tags · Pro: smart/auto tags |

**What to build:**

- User-defined tags on recipes (e.g., "weeknight", "comfort food", "date night", "kid-friendly", "under 30 min")
- Tag-based filtering and search
- **Smart auto-tags (Pro):** AI suggests tags based on recipe content at import time
  - "This recipe has chicken and takes ~20 minutes → suggesting: quick, poultry, weeknight"
  - Uses existing GPT integration — add tag suggestions to the parse prompt
- Pre-defined tag categories: Cuisine, Difficulty, Diet, Occasion, Time
