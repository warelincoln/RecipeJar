# Phase 2 — Daily-Use Retention (Weeks 7–10)

> **What this doc covers:** Detailed feature breakdowns for Phase 2: Grocery List (2.1), Meal Planning (2.2), "What Can I Cook?" (2.3), Cook Mode (2.4), Unit Conversion (2.5), Nutrition Estimates (2.6). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Give users reasons to open Orzo multiple times per week. These are the features that transform Orzo from a digitization tool into a cooking companion — and that justify a recurring subscription.

---

## 2.1 — Grocery List

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Very high — the single most important retention feature |
| **Depends on** | 0.1 (Auth), structured ingredients (already built) |
| **Tier** | Pro only |

**What to build:**

- `grocery_lists` table: `id`, `user_id`, `name`, `created_at`, `updated_at`
- `grocery_list_items` table: `id`, `list_id`, `name`, `amount`, `unit`, `recipe_id` (nullable), `is_checked`, `aisle` (nullable), `sort_order`
- "Add to Grocery List" button on recipe detail screen — uses structured ingredient data, respects current servings scale
- Grocery list screen: grouped by aisle (optional), check-off items, manual add, swipe-to-delete
- **Smart consolidation:** Two recipes that both need "2 cups flour" → list shows "4 cups flour" with both recipe names as source
- Persist checked state across app restart
- Clear completed items / clear all

**Why this is the #1 retention feature:** Your structured ingredient data (`amount`, `unit`, `name`, `isScalable`) is a massive head start. Most recipe apps parse free-text ingredients to build grocery lists. You already have structured data — the list practically builds itself. This is your biggest competitive advantage currently sitting unused.

---

## 2.2 — Meal Planning (Weekly Calendar)

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | High — the #2 retention feature, drives weekly engagement |
| **Depends on** | 2.1 (Grocery List) |
| **Tier** | Pro only |

**What to build:**

- `meal_plan_entries` table: `id`, `user_id`, `recipe_id`, `date`, `meal_slot` (breakfast/lunch/dinner/snack), `servings`
- Weekly calendar view: 7 columns, tap to assign a recipe to a slot
- "Plan This" button on recipe detail → date/slot picker
- "Add All to Grocery List" — generates a consolidated grocery list from an entire week's meal plan, with smart deduplication
- Simple week navigation (previous/next)
- Optional: "Surprise me" button to fill empty slots with random saved recipes

**Why meal planning depends on grocery list:** The killer flow is: browse recipes → plan the week → generate one grocery list → shop (or order via Instacart in Phase 4). Each step only works if the previous one exists. Meal planning without a grocery list output is just a pretty calendar.

---

## 2.3 — "What Can I Cook?" — Pantry-Based Recipe Filter

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | High — daily-use trigger |
| **Depends on** | Structured ingredients (already built) |
| **Tier** | Free: basic matching · Pro: smart scoring + grocery list integration |

**What to build:**

- Simple pantry: user maintains a list of ingredients they have on hand (just names, no quantities for v1)
- Quick-add via common ingredient chips (chicken, rice, pasta, eggs, onion, garlic, etc.)
- "What Can I Cook?" screen: filters user's saved recipes by ingredient match
- Match scoring: "You have 7/9 ingredients for Chicken Tikka Masala" — sorted by match percentage
- Missing ingredient callout: "You're missing: garam masala, coconut milk"
- "Add missing to grocery list" button (ties into 2.1)

**Key distinction from competitors:** ChefGPT and FoodiePrep *generate new AI recipes* from your ingredients. That's cool but gimmicky — different recipe every time, quality varies, no trust. Orzo filters *your own saved recipes* — recipes you've validated, maybe cooked before, and trust. Fundamentally different and better for someone who's invested time building a personal cookbook.

---

## 2.4 — Cook Mode

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — differentiator, natural Pro showcase |
| **Depends on** | Existing recipe detail screen |
| **Tier** | Pro only |

**What to build:**

- Full-screen step-by-step view: one step at a time, large text, swipe left/right to navigate
- Keep screen awake (`react-native-keep-awake`)
- Inline timers: detect time references in steps ("bake for 25 minutes") → tappable timer chip → countdown with notification
- Ingredient cross-off: tap ingredients as you use them
- Current step highlight with step counter ("Step 3 of 8")
- Quick-access ingredient list (swipe up or tab) without leaving cook mode
- Scaled ingredient amounts respected (uses current servings setting)

**Why this is Pro-only:** Cook mode is the feature people use *while actively cooking*. It's high-value, clearly premium, and easy to demonstrate in App Store screenshots. It creates a natural "moment of delight" that reinforces the subscription value.

---

## 2.5 — Unit Conversion

| | |
|---|---|
| **Effort** | S (half day) |
| **Revenue impact** | Low but high user satisfaction |
| **Depends on** | Structured ingredients (already built), `scaling.ts` |
| **Tier** | Pro only |

**What to build:**

- Extend `scaling.ts` with conversion rules: tbsp ↔ tsp ↔ cup ↔ fl oz ↔ ml ↔ l, oz ↔ lb ↔ g ↔ kg
- Smart conversion thresholds: `0.125 tbsp` → `⅜ tsp`, `16 tbsp` → `1 cup`
- Metric ↔ Imperial toggle on recipe detail screen (persistent per-user preference)
- Applied everywhere: recipe detail, cook mode, grocery list
- No conversion for count-based items ("3 eggs" stays "3 eggs")

**Why this is cheap and high-value:** Your ingredient parser already has `unit` and `amount` as structured fields. Conversion is pure client-side math on data you already have. One of the most requested features in recipe app reviews. Small effort, disproportionate user satisfaction.

---

## 2.6 — Nutrition Estimates

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | Medium — retention for health-focused segment |
| **Depends on** | Structured ingredients (already built) |
| **Tier** | Pro only |

**What to build:**

- Integrate USDA FoodData Central database (free, public, ~370k foods). Download SR Legacy or Foundation dataset as a local lookup.
- Fuzzy-match parsed ingredient `name` to USDA entries (e.g., "chicken breast" → USDA equivalent)
- Calculate per-serving estimates: calories, protein, carbs, fat, fiber, sodium
- Display as a compact nutrition card on recipe detail screen
- Disclaimer: "Estimates based on USDA data. Actual values may vary."
- Optional: daily/weekly nutrition summary from meal plan (if 2.2 is built)

**Why estimates, not exact values:** Exact nutrition requires knowing exact brands, preparation methods, and portions. That's impossible for cookbook-scanned recipes. Estimates are honest, still useful, and avoid the liability of pretending to be precise. Use a clear "~" prefix on all values.
