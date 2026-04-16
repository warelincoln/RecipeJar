# Phase 1 — Acquisition Engine (Weeks 5–6)

> **What this doc covers:** Detailed feature breakdowns for Phase 1: Social Media Recipe Import (1.1), iOS Share Sheet Extension (1.2), Rate-Limited Free Tier AI Imports (1.3). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Dramatically expand *how* recipes get into Orzo. Right now you have camera, photo library, and URL. The modern recipe discovery loop starts on TikTok and Instagram, not in a cookbook. If you aren't where the recipes are being found, you're invisible to the largest segment of potential users.

Social media import is prioritized here — before daily-use retention features — because **you can't retain users you never acquired**. This is the top of the funnel.

---

## 1.1 — Social Media Recipe Import (TikTok, Instagram, YouTube)

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | Very high — #1 acquisition channel for recipe apps in 2026 |
| **Depends on** | 0.1 (Auth), 1.2 (Share Sheet Extension), existing URL import infrastructure |
| **Tier** | Free: 3 social imports/mo · Pro: unlimited |

**What to build:**

- **YouTube import:** Fetch video page, extract structured recipe from description or comments (many creators include full recipes). If no structured data, extract auto-generated transcript via YouTube API and pass to GPT for recipe extraction. Your existing AI fallback pipeline handles the heavy lifting.
- **Instagram import:** User shares Instagram post URL to Orzo (via iOS Share Sheet, built in 1.2). Fetch the post page, extract caption text, parse with GPT. For reels/video posts, use the caption (Instagram doesn't expose transcripts to third parties).
- **TikTok import:** Same pattern — user shares TikTok URL, fetch page, extract description/caption, GPT parse. TikTok captions are often sparse, so accuracy will be lower. Consider a "fill in what's missing" prompt for the user after AI extraction.
- **Import source tagging:** Tag each recipe with its source platform (camera, url, youtube, instagram, tiktok) for analytics and for showing a small source icon on recipe cards.

**Architecture notes:** Your 4-tier URL cascade (JSON-LD → Microdata → DOM → AI) is already built for this. Social media imports are essentially URL imports where the extraction leans heavier on the AI fallback tier. The main new work is platform-specific transcript/caption fetching — the Share Sheet extension (1.2) handles the "share from any app" gesture.

**Why this is Phase 1, not Phase 2:** ReciMe, Pestle, Honeydew, and Forkee all lead with social media import as their primary marketing message. The person who sees a recipe on TikTok and wants to save it is the highest-intent user you can find — they already want to cook, they just need a place to put the recipe. If Orzo doesn't catch that moment, someone else will.

---

## 1.2 — iOS Share Sheet Extension

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | High — reduces friction for ALL imports, not just social |
| **Depends on** | 0.1 (Auth), existing URL import |
| **Tier** | Free |

**What to build:**

- iOS Share Extension target that accepts URLs
- Extension sends URL to Orzo app and triggers existing URL import flow
- Minimal UI in the extension: "Saving to Orzo..." → "Saved!" or "Open to review"
- Works from Safari, Chrome, TikTok, Instagram, YouTube, any app with share functionality

**Why this is separate from 1.1:** The Share Sheet works for ALL URLs, not just social media. It's the "save for later" gesture that makes Orzo feel native to iOS. Paprika and Mela both have this and it's one of their most-used features.

---

## 1.3 — Rate-Limited Free Tier AI Imports

| | |
|---|---|
| **Effort** | S (half day) |
| **Revenue impact** | High — creates natural upgrade pressure |
| **Depends on** | 0.3 (Subscriptions) |
| **Tier** | Free: 3 camera/photo AI imports per month · Pro: unlimited |

**What to build:**

- `ai_import_count` field on users table, reset monthly via cron or on-check
- Server-side enforcement: `/drafts` creation for image-type drafts checks count
- Client-side: show remaining imports ("2 of 3 AI imports remaining this month")
- When limit hit: show paywall with messaging — "Upgrade to Pro for unlimited cookbook scanning"
- URL imports remain unlimited on free tier (low cost to you, keeps the app useful)

**Why rate-limit imports, not recipe storage:** Gating storage feels punitive ("pay or lose your recipes"). Gating AI imports feels fair ("the expensive AI processing costs us money, so unlimited access is a premium feature"). Users intuitively understand that AI costs money. This is the same model that ChatGPT, Midjourney, and every other AI product uses.
