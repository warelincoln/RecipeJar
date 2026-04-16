# Phase 4 — Revenue Expansion (Weeks 13–15)

> **What this doc covers:** Detailed feature breakdowns for Phase 4: Instacart / Grocery Delivery Integration (4.1), Cookbook Bundle / Batch Digitization Upsell (4.2), Recipe Adaptation & Substitution Suggestions (4.3), Printed Cookbook Generation (4.4). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Layer additional revenue streams on top of the core subscription. Each feature here either generates direct revenue or significantly increases willingness to pay for Pro.

---

## 4.1 — Instacart / Grocery Delivery Integration

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
- Affiliate commission on every order placed through Orzo (typically $1–3 per order)
- Future: add Walmart Grocery API, Amazon Fresh, or Kroger as additional delivery partners

**Revenue math:** If 500 Pro users order groceries through Orzo once per week at ~$2 commission, that's $4,000/mo in affiliate revenue — on top of subscription revenue.

**IDP application tips:** They want to see structured ingredient data, an active user base, and a clear recipe-to-cart flow. Emphasize your validation engine — "every ingredient in our app is structured and verified, not free-text." They vet partners but are actively expanding; recipe apps are their #1 target category.

---

## 4.2 — Cookbook Bundle (Batch Digitization Upsell)

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — burst revenue at high-intent moments |
| **Depends on** | 0.3 (Subscriptions), concurrent import queue (already built) |
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

## 4.3 — Recipe Adaptation & Substitution Suggestions

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

## 4.4 — Printed Cookbook Generation

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

**Why this matters beyond revenue:** "Turn your Orzo collection into a real printed cookbook for Mom's birthday" is the single most compelling marketing message for the cookbook digitization audience. It completes the circle: physical cookbook → digital → physical again, but curated and personalized. Every gifted cookbook is a Orzo advertisement.
