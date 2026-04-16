# Phase 5 — Growth & Network Effects (Weeks 16–19)

> **What this doc covers:** Detailed feature breakdowns for Phase 5: Recipe Sharing & Export (5.1), Family Sharing & Household Accounts (5.2), Public Profiles & Community Cookbooks (5.3 — optional/long-term). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Turn existing users into acquisition channels. Every feature here creates reasons for a Orzo user to bring in non-users.

---

## 5.1 — Recipe Sharing & Export

| | |
|---|---|
| **Effort** | M (1 week — includes deep linking infrastructure) |
| **Revenue impact** | High — viral loop |
| **Depends on** | 0.1 (Auth), deep linking infrastructure (see below) |
| **Tier** | Free: 3 shares/mo · Pro: unlimited |

**What to build:**

- Share a recipe via:
  - **Link:** Generate a public URL (`getorzo.com/r/abc123`) with a clean web view of the recipe. Non-users see the recipe + "Get Orzo" CTA. This is your #1 organic acquisition channel.
  - **Messages / email:** Share as formatted text (title, ingredients, steps)
  - **Image card:** Generate a beautiful recipe card image (hero photo + title + key stats) for Instagram Stories, iMessage, etc.
- "Import from link" — Orzo users who receive a shared link can one-tap import into their own library
- Share analytics (Pro): see how many times your shared recipes were viewed/imported

**Deep linking prerequisite:** For shared links (`getorzo.com/r/abc123`) to open the app on iOS (or redirect to the App Store if not installed), you need:

- Apple Universal Links: an `apple-app-site-association` file hosted at `getorzo.com/.well-known/apple-app-site-association`, registered in Xcode's Associated Domains capability
- A lightweight web service (or static page) at `getorzo.com/r/:id` that renders a clean recipe view for non-app visitors (title, ingredients, hero image, "Get Orzo" CTA)
- App-side URL handling: when the app opens via a universal link, route to the recipe detail screen or trigger an import flow
- This infrastructure is also reusable for family invites (5.2) and public profiles (5.3)

**Copyright considerations for shared recipes:** The primary use case is "send my friend this recipe I found" — which means sharing content originally imported from third-party sources (cookbooks, food blogs, etc.). The legal landscape:

- **Ingredient lists** are generally not copyrightable — courts have consistently held that a factual list of ingredients and quantities is not creative expression (see *Publications Int'l v. Meredith Corp.*, 1996).
- **Recipe instructions**, however, *can be* copyrightable when they contain substantial literary expression (descriptive language, personal commentary, tips). The more a step reads like "stir until golden" vs. "lovingly stir until the butter dances into a golden haze," the more protection it has.
- **Photos** imported from third-party sites are copyrighted by the photographer/publisher.

**Recommended approach for v1:** When sharing a recipe that was imported from an external source (`sourceType: "url"`), share only the title, ingredient list, and a link back to the original URL (already stored in `originalUrl`). Omit the full step text and any imported hero image from the public share page. For user-created recipes (`sourceType: "image"` from their own cookbook) or recipes where the user has substantially edited the steps, full sharing is lower risk. This can be enforced server-side when generating the public share page.

**Viral math:** If 1,000 users share 2 recipes/month and each shared recipe is seen by 5 people, that's 10,000 monthly impressions of "Get Orzo" CTAs. At even 2% conversion, that's 200 new users/month — for free.

---

## 5.2 — Family Sharing & Household Accounts

| | |
|---|---|
| **Effort** | M (1–1.5 weeks) |
| **Revenue impact** | High — higher ARPU, lower churn |
| **Depends on** | 0.1 (Auth), 0.4 (Sync) |
| **Tier** | Pro only (up to 6 family members on one subscription) |

**What to build:**

- "Family Kitchen" — a shared recipe collection visible to all family members
- Family owner invites members via email or link
- Shared grocery list that syncs in real-time (everyone can add/check items)
- Shared meal plan calendar
- Individual libraries remain private; Family Kitchen is additive
- Each family member gets their own cook log and stats

**Pricing:** Family sharing included with Pro — no extra cost. This is the Apple Music / Spotify Family model. Slightly reduces per-user revenue but dramatically reduces churn (cancellation requires a *family discussion*, not a solo decision).

**Why this drives retention:** The moment a second person in the household depends on Orzo for the shared grocery list, cancellation becomes a multi-person decision. Multi-user dependency is the strongest form of lock-in.

---

## 5.3 — Public Profiles & Community Cookbooks (Optional / Long-term)

| | |
|---|---|
| **Effort** | L (1.5–2 weeks) |
| **Revenue impact** | Speculative — depends on community traction |
| **Depends on** | 5.1 (Sharing), 0.1 (Auth) |
| **Tier** | Free to browse · Pro to publish |

**What to build:**

- Optional public profile: display name, bio, public recipe count
- "Publish" a recipe to make it discoverable by other Orzo users
- Community cookbooks: curated collections published by users ("My 20 Best Italian Recipes")
- Browse/search published recipes, one-tap import to your own library
- Follow other cooks, see their new published recipes

**Why this is optional/long-term:** Community features are expensive to moderate, slow to reach critical mass, and distract from the core "personal cookbook" value prop. Only build this if Orzo has 10,000+ active users and you see organic sharing behavior. Don't chase this until everything above is solid.
