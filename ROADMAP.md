# RecipeJar — Product Roadmap

## Path to $20k MRR

**Last updated:** 2026-03-31
**Target:** First paying customer by Q3 2026. $20k MRR by Q1 2027.
**Dev capacity:** Solo + AI agents (Cursor / Claude Code)
**Pricing model:** Freemium subscription — Free tier (limited) + Pro ($4.99/mo or $39.99/yr) + Cookbook Bundle ($19.99 one-time add-on)

---

## How to Read This Roadmap

The roadmap is organized into **6 phases**. Each phase has a strategic goal — the reason it exists, not just a list of features. Phases are sequential because they have real dependencies: you can't charge money without auth, you can't build grocery lists without structured ingredients (already done), you can't do Instacart integration without grocery lists.

Each feature includes:

- **Effort** — T-shirt size (S/M/L/XL) calibrated for solo dev + AI agents at proven velocity (full MVP shipped in 10 days)
- **Revenue impact** — How directly this drives subscriptions or retention
- **Depends on** — What must exist first
- **Tier** — Which tier gets the feature (Free / Pro)

Estimates assume part-time alongside PayWhirl.

---

## Phase Overview

| Phase | Name | Timeline | Strategic Goal |
|---|---|---|---|
| 0 | Foundation | Weeks 1–3 | Make RecipeJar a real product that can accept money |
| 1 | Acquisition Engine | Weeks 4–5 | Give people reasons to download and import recipes |
| 2 | Daily-Use Retention | Weeks 6–9 | Make RecipeJar indispensable in the weekly cooking routine |
| 3 | Emotional Lock-In | Weeks 10–11 | Make leaving feel like losing a part of your life |
| 4 | Revenue Expansion | Weeks 12–14 | Add secondary revenue streams and premium upsells |
| 5 | Growth & Network Effects | Weeks 15–18 | Turn users into acquisition channels |

---

## Phase 0: Foundation (Weeks 1–3)

**Goal:** Make RecipeJar a real product that can accept money and support multiple users. Nothing here is exciting — it's all plumbing. But without it, everything else is built on sand.

### 0.1 — User Authentication & Accounts

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Prerequisite for ALL revenue |
| **Depends on** | Nothing — start here |

**What to build:**

- Supabase Auth integration (email/password + Apple Sign-In + Google Sign-In)
- `users` table: `id`, `email`, `display_name`, `created_at`, `subscription_tier` (free/pro), `subscription_expires_at`
- `user_id` foreign key added to `recipes`, `collections`, `drafts`, `recipe_notes`, `recipe_collections`
- Supabase Row Level Security (RLS) policies — users can only access their own data
- JWT session middleware on all Fastify routes
- Mobile auth screens: sign up, sign in, forgot password
- Lightweight onboarding: first-time user sees value prop, then lands on empty home with clear CTA to import first recipe

**Migration strategy for existing data:** Create a default "seed user" during migration. Assign all current recipes/collections/notes to that user. Document the one-time migration in changelog.

**Why this is first:** Every feature after this touches user identity. Subscriptions need a user to bill. Sync needs a user to sync. Sharing needs a user to share with. This is the foundation of the foundation.

---

### 0.2 — Subscription Infrastructure

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | This IS the revenue mechanism |
| **Depends on** | 0.1 (Auth) |

**What to build:**

- RevenueCat SDK integration (handles Apple IAP + Google Play Billing + receipt validation + subscription lifecycle)
- Two subscription products: `recipejar_pro_monthly` ($4.99/mo), `recipejar_pro_annual` ($39.99/yr)
- One non-consumable (unlocked in Phase 4): `recipejar_cookbook_bundle` ($19.99)
- Paywall screen — shown when free-tier user hits a gated feature
- `subscription_tier` synced from RevenueCat webhooks to `users` table
- Free tier limits enforced:
  - Max 15 saved recipes
  - No camera/photo AI import (URL import only)
  - No grocery list
  - No nutrition info
  - No cook mode
  - No family sharing
- Settings screen: manage subscription, restore purchases

**Why RevenueCat:** It abstracts the nightmare of Apple/Google receipt validation, handles grace periods, billing retries, and gives you a real-time MRR dashboard. Solo devs should never hand-roll subscription infrastructure.

---

### 0.3 — Cloud Sync & Offline Access

| | |
|---|---|
| **Effort** | L (1–1.5 weeks) |
| **Revenue impact** | High — #1 reason people pay for recipe apps |
| **Depends on** | 0.1 (Auth) |

**What to build:**

- **Recommended approach (MVP):** Server-authoritative sync. Recipes live in Supabase Postgres. Mobile caches locally via SQLite (`@op-engineering/op-sqlite` or `expo-sqlite`). On app launch + on save, sync with server. Conflict resolution: last-write-wins with `updated_at` timestamps.
- Offline recipe viewing — read from local cache when no network
- Sync status indicator — subtle cloud icon, non-intrusive
- Background sync on app foreground via `AppState` listener
- **Future (v2):** Full local-first with CRDT sync (PowerSync, ElectricSQL). More complex but more resilient. Save for later.

**Why this matters for revenue:** Offline access is non-negotiable for a cooking app. Kitchens have bad WiFi. Phones get greasy. People cook at cabins without signal. If the app can't show recipes offline, it fails the most basic use case. Every paid competitor offers this.

---

## Phase 1: Acquisition Engine (Weeks 4–5)

**Goal:** Dramatically expand *how* recipes get into RecipeJar. Right now you have camera, photo library, and URL. The modern recipe discovery loop starts on TikTok and Instagram, not in a cookbook. If you aren't where the recipes are being found, you're invisible to the largest segment of potential users.

Social media import is prioritized here — before daily-use retention features — because **you can't retain users you never acquired**. This is the top of the funnel.

### 1.1 — Social Media Recipe Import (TikTok, Instagram, YouTube)

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | Very high — #1 acquisition channel for recipe apps in 2026 |
| **Depends on** | 0.1 (Auth), existing URL import infrastructure |
| **Tier** | Free: 3 social imports/mo · Pro: unlimited |

**What to build:**

- **YouTube import:** Fetch video page, extract structured recipe from description or comments (many creators include full recipes). If no structured data, extract auto-generated transcript via YouTube API and pass to GPT for recipe extraction. Your existing AI fallback pipeline handles the heavy lifting.
- **Instagram import:** User shares Instagram post URL to RecipeJar (via iOS Share Sheet). Fetch the post page, extract caption text, parse with GPT. For reels/video posts, use the caption (Instagram doesn't expose transcripts to third parties).
- **TikTok import:** Same pattern — user shares TikTok URL, fetch page, extract description/caption, GPT parse. TikTok captions are often sparse, so accuracy will be lower. Consider a "fill in what's missing" prompt for the user after AI extraction.
- **iOS Share Sheet extension:** Register RecipeJar as a share target so users can share URLs from any app directly to RecipeJar. The user never leaves TikTok/Instagram/YouTube — they tap Share → RecipeJar → recipe lands in their library.
- **Import source tagging:** Tag each recipe with its source platform (camera, url, youtube, instagram, tiktok) for analytics and for showing a small source icon on recipe cards.

**Architecture notes:** Your 4-tier URL cascade (JSON-LD → Microdata → DOM → AI) is already built for this. Social media imports are essentially URL imports where the extraction leans heavier on the AI fallback tier. The main new work is the Share Sheet extension and transcript/caption fetching.

**Why this is Phase 1, not Phase 2:** ReciMe, Pestle, Honeydew, and Forkee all lead with social media import as their primary marketing message. The person who sees a recipe on TikTok and wants to save it is the highest-intent user you can find — they already want to cook, they just need a place to put the recipe. If RecipeJar doesn't catch that moment, someone else will.

---

### 1.2 — iOS Share Sheet Extension

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | High — reduces friction for ALL imports, not just social |
| **Depends on** | 0.1 (Auth), existing URL import |
| **Tier** | Free |

**What to build:**

- iOS Share Extension target that accepts URLs
- Extension sends URL to RecipeJar app and triggers existing URL import flow
- Minimal UI in the extension: "Saving to RecipeJar..." → "Saved!" or "Open to review"
- Works from Safari, Chrome, TikTok, Instagram, YouTube, any app with share functionality

**Why this is separate from 1.1:** The Share Sheet works for ALL URLs, not just social media. It's the "save for later" gesture that makes RecipeJar feel native to iOS. Paprika and Mela both have this and it's one of their most-used features.

---

### 1.3 — Rate-Limited Free Tier AI Imports

| | |
|---|---|
| **Effort** | S (half day) |
| **Revenue impact** | High — creates natural upgrade pressure |
| **Depends on** | 0.2 (Subscriptions) |
| **Tier** | Free: 3 camera/photo AI imports per month · Pro: unlimited |

**What to build:**

- `ai_import_count` field on users table, reset monthly via cron or on-check
- Server-side enforcement: `/drafts` creation for image-type drafts checks count
- Client-side: show remaining imports ("2 of 3 AI imports remaining this month")
- When limit hit: show paywall with messaging — "Upgrade to Pro for unlimited cookbook scanning"
- URL imports remain unlimited on free tier (low cost to you, keeps the app useful)

**Why rate-limit imports, not recipe storage:** Gating storage feels punitive ("pay or lose your recipes"). Gating AI imports feels fair ("the expensive AI processing costs us money, so unlimited access is a premium feature"). Users intuitively understand that AI costs money. This is the same model that ChatGPT, Midjourney, and every other AI product uses.

---

## Phase 2: Daily-Use Retention (Weeks 6–9)

**Goal:** Give users reasons to open RecipeJar multiple times per week. These are the features that transform RecipeJar from a digitization tool into a cooking companion — and that justify a recurring subscription.

### 2.1 — Grocery List

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

### 2.2 — Meal Planning (Weekly Calendar)

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

### 2.3 — "What Can I Cook?" — Pantry-Based Recipe Filter

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

**Key distinction from competitors:** ChefGPT and FoodiePrep *generate new AI recipes* from your ingredients. That's cool but gimmicky — different recipe every time, quality varies, no trust. RecipeJar filters *your own saved recipes* — recipes you've validated, maybe cooked before, and trust. Fundamentally different and better for someone who's invested time building a personal cookbook.

---

### 2.4 — Cook Mode

| | |
|---|---|
| **Effort** | S (3–4 days) |
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

### 2.5 — Unit Conversion

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

### 2.6 — Nutrition Estimates

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

---

## Phase 3: Emotional Lock-In (Weeks 10–11)

**Goal:** Make RecipeJar feel like a personal artifact — something that becomes more valuable over time, harder to leave, and emotionally meaningful. These features are cheap to build but disproportionately powerful for retention.

The best analogy: Instagram started as a photo filter app. People stayed because their memories were there. RecipeJar starts as a digitization tool. People stay because their cooking life is there.

### 3.1 — "Cooked It" Log & Cooking Journal

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

**Why this is so important:** This is the single cheapest feature with the highest emotional lock-in. Once someone has 6 months of cooking history in RecipeJar, switching to Paprika means losing that history. It's the same reason people don't leave Strava — their entire running history lives there. Build early so data accumulates from day one.

---

### 3.2 — Personal Cooking Stats & Year in Review

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
  - Every shared "Year in Review" card is a free ad for RecipeJar — a viral acquisition moment

---

### 3.3 — Recipe Memories & Story Annotations

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

**Why this is free-tier:** This is the feature that makes people fall in love with RecipeJar during the free trial. It's what separates "a recipe app" from "my family's digital cookbook." It costs you nothing to serve (text + optional image) and creates deep emotional investment that makes the paywall conversion feel natural.

---

### 3.4 — Recipe Tags & Smart Collections

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

---

## Phase 4: Revenue Expansion (Weeks 12–14)

**Goal:** Layer additional revenue streams on top of the core subscription. Each feature here either generates direct revenue or significantly increases willingness to pay for Pro.

### 4.1 — Instacart / Grocery Delivery Integration

| | |
|---|---|
| **Effort** | M (1 week dev + IDP approval wait) |
| **Revenue impact** | Very high — feature + affiliate revenue stream |
| **Depends on** | 2.1 (Grocery List) |
| **Tier** | Pro only |

**What to build:**

- Apply to Instacart Developer Platform (IDP) — they actively recruit recipe/meal planning apps. Your structured ingredient data and grocery list make you an ideal partner.
- "Order on Instacart" button on grocery list screen → opens Instacart with pre-populated cart
- IDP provides: item catalog matching, store selection, cart building, fulfillment, delivery tracking
- Affiliate commission on every order placed through RecipeJar (typically $1–3 per order)
- Future: add Walmart Grocery API, Amazon Fresh, or Kroger as additional delivery partners

**Revenue math:** If 500 Pro users order groceries through RecipeJar once per week at ~$2 commission, that's $4,000/mo in affiliate revenue — on top of subscription revenue.

**IDP application tips:** They want to see structured ingredient data, an active user base, and a clear recipe-to-cart flow. Emphasize your validation engine — "every ingredient in our app is structured and verified, not free-text." They vet partners but are actively expanding; recipe apps are their #1 target category.

---

### 4.2 — Cookbook Bundle (Batch Digitization Upsell)

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — burst revenue at high-intent moments |
| **Depends on** | 0.2 (Subscriptions), concurrent import queue (already built) |
| **Tier** | $19.99 one-time IAP add-on |

**What to build:**

- "Digitize a Cookbook" mode: batch import flow optimized for scanning many pages
  - Sequential camera capture with page counter ("Page 7 of ~30")
  - Queue all pages, parse in background (leverage existing concurrent import queue)
  - Review all results in Import Hub, save the good ones
- Priority AI processing for bundle purchasers (skip the semaphore queue)
- Marketing hook: surface this IAP when user imports their 3rd camera recipe
  - "Looks like you're scanning a cookbook! Unlock batch import for $19.99"
- No recipe limit — the bundle unlocks the *mode*, not a count

**Why one-time, not subscription:** This captures the high-intent "I just discovered this app and want to scan grandma's cookbook RIGHT NOW" moment. Subscription friction at that moment kills conversion. $19.99 impulse purchase doesn't.

---

### 4.3 — Recipe Adaptation & Substitution Suggestions

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | Medium — differentiator, reduces cooking friction |
| **Depends on** | Structured ingredients, GPT integration (already built) |
| **Tier** | Pro only |

**What to build:**

- "Substitute" button next to each ingredient on recipe detail
- Tap → AI generates 2–3 substitution options with usage notes:
  - "No heavy cream? → Try: coconut cream (same amount), Greek yogurt thinned with milk (3/4 amount), cashew cream (blend soaked cashews)"
- Diet-aware: if user has set dietary preferences, substitutions respect them
- Cache common substitutions to reduce API costs (most substitution pairs are stable)
- "Adapt Entire Recipe" (Pro): generate a full variant (e.g., "Make this vegan") — creates a new recipe in user's library linked to the original

**Cost management:** Substitution queries are short GPT calls (not Vision), so they're cheap. Cache aggressively — "substitute for heavy cream" will be asked thousands of times with the same answer.

---

### 4.4 — Printed Cookbook Generation

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — high-emotion purchase, gift potential |
| **Depends on** | Recipe hero images, collections |
| **Tier** | Pro only (+ print cost per book) |

**What to build:**

- "Create a Cookbook" flow: select recipes (from a collection or cherry-pick), choose a cover template, add title and dedication
- Generate a print-ready PDF:
  - Cover page with title, optional photo, author name
  - Table of contents
  - One recipe per page: hero image, title, description, ingredients, steps
  - Optional "Story" field content below the recipe
  - Page numbers, section dividers by collection
- **Print-on-demand integration:** Partner with Blurb, Lulu, or similar
  - User previews book in-app → taps "Order Printed Copy" → redirected to print partner
  - Typical price: $25–40 per book. You earn 15–25% margin.
- **Digital PDF export** as a lighter alternative (Pro only)

**Why this matters beyond revenue:** "Turn your RecipeJar collection into a real printed cookbook for Mom's birthday" is the single most compelling marketing message for the cookbook digitization audience. It completes the circle: physical cookbook → digital → physical again, but curated and personalized. Every gifted cookbook is a RecipeJar advertisement.

---

## Phase 5: Growth & Network Effects (Weeks 15–18)

**Goal:** Turn existing users into acquisition channels. Every feature here creates reasons for a RecipeJar user to bring in non-users.

### 5.1 — Recipe Sharing & Export

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | High — viral loop |
| **Depends on** | 0.1 (Auth) |
| **Tier** | Free: 3 shares/mo · Pro: unlimited |

**What to build:**

- Share a recipe via:
  - **Link:** Generate a public URL (`recipejar.app/r/abc123`) with a clean web view of the recipe. Non-users see the recipe + "Get RecipeJar" CTA. This is your #1 organic acquisition channel.
  - **Messages / email:** Share as formatted text (title, ingredients, steps)
  - **Image card:** Generate a beautiful recipe card image (hero photo + title + key stats) for Instagram Stories, iMessage, etc.
- "Import from link" — RecipeJar users who receive a shared link can one-tap import into their own library
- Share analytics (Pro): see how many times your shared recipes were viewed/imported

**Viral math:** If 1,000 users share 2 recipes/month and each shared recipe is seen by 5 people, that's 10,000 monthly impressions of "Get RecipeJar" CTAs. At even 2% conversion, that's 200 new users/month — for free.

---

### 5.2 — Family Sharing & Household Accounts

| | |
|---|---|
| **Effort** | M (1–1.5 weeks) |
| **Revenue impact** | High — higher ARPU, lower churn |
| **Depends on** | 0.1 (Auth), 0.3 (Sync) |
| **Tier** | Pro only (up to 6 family members on one subscription) |

**What to build:**

- "Family Kitchen" — a shared recipe collection visible to all family members
- Family owner invites members via email or link
- Shared grocery list that syncs in real-time (everyone can add/check items)
- Shared meal plan calendar
- Individual libraries remain private; Family Kitchen is additive
- Each family member gets their own cook log and stats

**Pricing:** Family sharing included with Pro — no extra cost. This is the Apple Music / Spotify Family model. Slightly reduces per-user revenue but dramatically reduces churn (cancellation requires a *family discussion*, not a solo decision).

**Why this drives retention:** The moment a second person in the household depends on RecipeJar for the shared grocery list, cancellation becomes a multi-person decision. Multi-user dependency is the strongest form of lock-in.

---

### 5.3 — Public Profiles & Community Cookbooks (Optional / Long-term)

| | |
|---|---|
| **Effort** | L (1.5–2 weeks) |
| **Revenue impact** | Speculative — depends on community traction |
| **Depends on** | 5.1 (Sharing), 0.1 (Auth) |
| **Tier** | Free to browse · Pro to publish |

**What to build:**

- Optional public profile: display name, bio, public recipe count
- "Publish" a recipe to make it discoverable by other RecipeJar users
- Community cookbooks: curated collections published by users ("My 20 Best Italian Recipes")
- Browse/search published recipes, one-tap import to your own library
- Follow other cooks, see their new published recipes

**Why this is optional/long-term:** Community features are expensive to moderate, slow to reach critical mass, and distract from the core "personal cookbook" value prop. Only build this if RecipeJar has 10,000+ active users and you see organic sharing behavior. Don't chase this until everything above is solid.

---

## Feature Gating Summary

| Feature | Free | Pro ($4.99/mo) |
|---|---|---|
| Saved recipes | 15 max | Unlimited |
| URL import | Unlimited | Unlimited |
| Social media import | 3/month | Unlimited |
| Camera/photo AI import | 3/month | Unlimited |
| Collections & manual tags | Yes | Yes |
| Ingredient scaling | Yes | Yes |
| Search | Yes | Yes |
| Recipe stories / memories | Yes | Yes |
| Cook log (no photos) | Yes | Yes |
| Pantry filter (basic) | Yes | Yes |
| Grocery list | No | Yes |
| Meal planning | No | Yes |
| Cook mode | No | Yes |
| Nutrition estimates | No | Yes |
| Unit conversion | No | Yes |
| Instacart integration | No | Yes |
| Recipe substitutions | No | Yes |
| Smart auto-tags | No | Yes |
| Cook log with photos + stats | No | Yes |
| Family sharing (up to 6) | No | Yes |
| Recipe sharing | 3/month | Unlimited |
| Printed cookbook | No | Yes (+ print cost) |
| Cookbook Bundle mode | — | $19.99 one-time add-on |

**Free tier philosophy:** Generous enough to hook users and let them build a small library (15 recipes, unlimited URL import). Gates the expensive features (AI imports, grocery list, meal planning) behind Pro. Never locks access to saved recipes — your data is always yours.

---

## Revenue Model & $20k MRR Path

### Target Economics

| Metric | Target |
|---|---|
| Pro monthly price | $4.99 |
| Pro annual price | $39.99 (~$3.33/mo effective) |
| Blended ARPU (70% annual / 30% monthly) | ~$3.83/mo |
| Subscribers needed for $20k MRR (subs alone) | ~5,200 |
| Free-to-paid conversion rate (target) | 4% |
| Total users needed | ~130,000 |

### Supplementary Revenue Streams

| Source | Est. Monthly Revenue |
|---|---|
| Instacart affiliate commissions | $2,000–4,000 |
| Cookbook Bundle one-time purchases | $1,000–2,000 |
| Printed cookbook margins | $500–1,000 |

With supplementary revenue, the subscriber target drops to ~3,500–4,000 for the same $20k MRR.

### Revenue Milestones

| When | Milestone | Est. MRR |
|---|---|---|
| Week 5 (Q3 2026) | App Store launch with Phase 0 + 1 complete, first paying customers | $500–1,500 |
| Week 11 (Q3 2026) | Phase 2 + 3 live, organic growth + ASO | $3,000–5,000 |
| Week 18 (Q4 2026) | Instacart live, family sharing, viral loops active | $8,000–12,000 |
| Months 6–9 (Q1 2027) | Steady organic + word-of-mouth compound growth | $15,000–20,000 |

---

## What NOT to Build

Things that seem tempting but are traps for a solo dev:

| Temptation | Why Not |
|---|---|
| **Android-first or simultaneous launch** | Ship iOS first. Your dev setup, testing, and daily driver are iOS. Android comes after model validation with revenue. React Native makes the port straightforward later. |
| **Web app** | Adds an entire frontend codebase and deployment surface. Mobile-first is right for a cooking app. Web can come in year 2. |
| **AI recipe generation** | "Give me a recipe using chicken and rice" — this is ChefGPT's territory and the output is generic AI slop. RecipeJar's value is *your* recipes, validated and trusted. Don't dilute that. |
| **Social feed / discovery** | Community features are expensive to moderate, slow to grow, and distract from the personal cookbook value prop. Only consider at 10k+ users. |
| **Barcode scanning for pantry** | Cool feature, massive engineering effort (UPC database, camera scanning, edge cases). Simple text-based pantry is 90% of the value at 10% of the cost. |
| **Apple Watch / widgets** | Nice-to-have, but only after the core app is monetizing. Retention features, not acquisition features. |
| **Multi-language support** | English-first. Localization is a tax on every future feature. Add it when revenue justifies the cost. |

---

## Key Dependencies (Build Order)

```
0.1 Auth ──────────────┬──→ 0.2 Subscriptions ──→ 1.3 Rate Limits
                       │
                       ├──→ 0.3 Sync / Offline
                       │
                       ├──→ 1.1 Social Media Import
                       │         │
                       │         └──→ 1.2 Share Sheet Extension
                       │
                       ├──→ 2.1 Grocery List ──────→ 2.2 Meal Planning
                       │         │                         │
                       │         └──→ 4.1 Instacart ───────┘
                       │
                       ├──→ 3.1 Cook Log ──→ 3.2 Stats / Year in Review
                       │
                       ├──→ 5.1 Sharing ──→ 5.2 Family ──→ 5.3 Community
                       │
Structured Ingredients ├──→ 2.3 What Can I Cook?
   (ALREADY BUILT)     ├──→ 2.5 Unit Conversion
                       ├──→ 2.6 Nutrition Estimates
                       └──→ 4.3 Substitution Suggestions

GPT Integration ───────→ 1.1 Social Media Import
   (ALREADY BUILT)     ├──→ 3.4 Smart Auto-Tags
                       └──→ 4.3 Substitution Suggestions

Existing Notes ────────→ 3.3 Recipe Memories / Stories

Existing Collections ──→ 3.4 Tags & Smart Collections

Existing Hero Images ──→ 4.4 Printed Cookbook Generation

Concurrent Queue ──────→ 4.2 Cookbook Bundle Mode
   (ALREADY BUILT)
```

---

## Changelog

| Date | Change |
|---|---|
| 2026-03-31 | Revised timelines: compressed from 36 weeks to 18 weeks based on proven 10-day MVP velocity. Updated all effort estimates, phase timelines, and revenue milestones. |
| 2026-03-31 | Initial roadmap created. 6 phases, 22 features, targeting $20k MRR by Q1 2027. |
