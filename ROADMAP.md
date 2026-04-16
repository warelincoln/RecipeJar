# Orzo — Product Roadmap

## Path to $20k MRR

**Last updated:** 2026-04-16
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

This file is the **navigation layer** — high-level phase overview, gating, revenue model, and dependency graph. Per-phase deep dives, brand identity, and current-state inventory live in separate docs (see Documentation Index below).

---

## Documentation Index

| Topic | Doc | When to read it |
|---|---|---|
| **Brand identity & color palette** | [`docs/BRAND.md`](docs/BRAND.md) | Designing UI, building marketing surfaces, picking a color |
| **Current state assessment** — what's built today vs. what each roadmap phase promises | [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | Sanity-checking the roadmap against ground truth |
| **Phase 0 — Foundation** (Auth, Dev/Prod Isolation, TestFlight, Subscriptions, Sync) | [`docs/ROADMAP_PHASE_0.md`](docs/ROADMAP_PHASE_0.md) | Working on auth, ship prep, monetization, or offline access |
| **Phase 1 — Acquisition Engine** (Social import, Share Sheet, Free-tier rate limits) | [`docs/ROADMAP_PHASE_1.md`](docs/ROADMAP_PHASE_1.md) | Adding TikTok/Instagram/YouTube import or share-extension |
| **Phase 2 — Daily-Use Retention** (Grocery, Meal Planning, Pantry, Cook Mode, Unit Conversion, Nutrition) | [`docs/ROADMAP_PHASE_2.md`](docs/ROADMAP_PHASE_2.md) | Building the "cooking companion" features that justify Pro |
| **Phase 3 — Emotional Lock-In** (Cook Log, Stats, Memories, Tags) | [`docs/ROADMAP_PHASE_3.md`](docs/ROADMAP_PHASE_3.md) | Adding personal-history features that make leaving costly |
| **Phase 4 — Revenue Expansion** (Instacart, Cookbook Bundle, Substitutions, Printed Cookbook) | [`docs/ROADMAP_PHASE_4.md`](docs/ROADMAP_PHASE_4.md) | Layering secondary revenue on top of subscription |
| **Phase 5 — Growth & Network Effects** (Sharing, Family, Public Profiles) | [`docs/ROADMAP_PHASE_5.md`](docs/ROADMAP_PHASE_5.md) | Building viral loops and household accounts |
| **Status & known gaps** — proven-live evidence, test coverage | [`docs/STATUS.md`](docs/STATUS.md) | Before claiming a feature works in production |
| **Changelog** — dated release notes | [`CHANGELOG.md`](CHANGELOG.md) | Catching up after a long break |

---

## Phase Overview

| Phase | Name | Timeline | Strategic Goal | Detail |
|---|---|---|---|---|
| 0 | Foundation | Weeks 1–4 | Make Orzo a real product that can ship to testers and accept money | [`docs/ROADMAP_PHASE_0.md`](docs/ROADMAP_PHASE_0.md) |
| 1 | Acquisition Engine | Weeks 5–6 | Give people reasons to download and import recipes | [`docs/ROADMAP_PHASE_1.md`](docs/ROADMAP_PHASE_1.md) |
| 2 | Daily-Use Retention | Weeks 7–10 | Make Orzo indispensable in the weekly cooking routine | [`docs/ROADMAP_PHASE_2.md`](docs/ROADMAP_PHASE_2.md) |
| 3 | Emotional Lock-In | Weeks 11–12 | Make leaving feel like losing a part of your life | [`docs/ROADMAP_PHASE_3.md`](docs/ROADMAP_PHASE_3.md) |
| 4 | Revenue Expansion | Weeks 13–15 | Add secondary revenue streams and premium upsells | [`docs/ROADMAP_PHASE_4.md`](docs/ROADMAP_PHASE_4.md) |
| 5 | Growth & Network Effects | Weeks 16–19 | Turn users into acquisition channels | [`docs/ROADMAP_PHASE_5.md`](docs/ROADMAP_PHASE_5.md) |

### Phase status at a glance

- **Phase 0 — partially complete.** 0.1 Auth ✅ (all 8 work streams). 0.1b Dev/Prod Isolation ✅ (Pillars 2 + 4; 1 + 3 deferred). 0.2 Ship Prep partial (Apple Developer + Railway done, App Store Connect pending). 0.3 Subscriptions and 0.4 Sync not started.
- **Phases 1–5 — not started.** See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the full feature-by-feature audit against the codebase.

---

## Feature Gating Summary

| Feature | Free | Starter Pack ($1.99) | Pro ($4.99/mo) |
|---|---|---|---|
| Saved recipes | 50 max | 50 max | Unlimited |
| URL import | Unlimited | Unlimited | Unlimited |
| Social media import | 3/month | 30 total | Unlimited |
| Camera/photo AI import | 3/month | 30 total | Unlimited |
| Collections & manual tags | Yes | Yes | Yes |
| Ingredient scaling | Yes | Yes | Yes |
| Search | Yes | Yes | Yes |
| Recipe stories / memories | Yes | Yes | Yes |
| Cook log (no photos) | Yes | Yes | Yes |
| Pantry filter (basic) | Yes | Yes | Yes |
| Grocery list | No | No | Yes |
| Meal planning | No | No | Yes |
| Cook mode | No | No | Yes |
| Nutrition estimates | No | No | Yes |
| Unit conversion | No | No | Yes |
| Instacart integration | No | No | Yes |
| Recipe substitutions | No | No | Yes |
| Smart auto-tags | No | No | Yes |
| Cook log with photos + stats | No | No | Yes |
| Family sharing (up to 6) | No | No | Yes |
| Recipe sharing | 3/month | 3/month | Unlimited |
| Printed cookbook | No | No | Yes (+ print cost) |
| Cookbook Bundle mode | — | — | $19.99 one-time add-on |

**Tier philosophy:** Free is generous enough to hook users and let them build a real library (50 recipes, unlimited URL import). The $1.99 Starter Pack is a low-commitment bridge — it gives power users enough AI imports to see the value of Pro without a monthly commitment, then auto-converts to Pro after 15 days. Pro gates the expensive features (unlimited AI imports, grocery list, meal planning, cook mode) and removes the recipe cap entirely. Never locks access to saved recipes — your data is always yours, even if you downgrade.

---

## Revenue Model & $20k MRR Path

### Target Economics

| Metric | Target |
|---|---|
| Pro monthly price | $4.99 |
| Pro annual price | $39.99 (~$3.33/mo effective) |
| Starter Pack (trial ramp) | $1.99 one-time (30 AI imports, auto-converts to Pro monthly after 15 days) |
| Blended ARPU (70% annual / 30% monthly) | ~$3.83/mo |
| Subscribers needed for $20k MRR (subs alone) | ~5,200 |
| Free-to-paid conversion rate (target) | 5–6% (Starter Pack expected to lift conversion vs. hard paywall) |
| Total users needed | ~87,000–104,000 |

### Supplementary Revenue Streams

| Source | Est. Monthly Revenue |
|---|---|
| Starter Pack purchases (users who buy but don't convert) | $500–1,500 |
| Instacart affiliate commissions | $2,000–4,000 |
| Cookbook Bundle one-time purchases | $1,000–2,000 |
| Printed cookbook margins | $500–1,000 |

With supplementary revenue, the subscriber target drops to ~3,500–4,000 for the same $20k MRR.

### Revenue Milestones

| When | Milestone | Est. MRR |
|---|---|---|
| Week 4 (Q3 2026) | TestFlight live, internal testing, App Store submission in progress | $0 |
| Week 6 (Q3 2026) | App Store launch with Phase 0 + 1 complete, first paying customers | $500–1,500 |
| Week 12 (Q3 2026) | Phase 2 + 3 live, organic growth + ASO | $3,000–5,000 |
| Week 19 (Q4 2026) | Instacart live, family sharing, viral loops active | $8,000–12,000 |
| Months 6–9 (Q1 2027) | Steady organic + word-of-mouth compound growth | $15,000–20,000 |

---

## What NOT to Build

Things that seem tempting but are traps for a solo dev:

| Temptation | Why Not |
|---|---|
| **Android-first or simultaneous launch** | Ship iOS first. Your dev setup, testing, and daily driver are iOS. Android comes after model validation with revenue. React Native makes the port straightforward later. |
| **Web app** | Adds an entire frontend codebase and deployment surface. Mobile-first is right for a cooking app. Web can come in year 2. |
| **AI recipe generation** | "Give me a recipe using chicken and rice" — this is ChefGPT's territory and the output is generic AI slop. Orzo's value is *your* recipes, validated and trusted. Don't dilute that. |
| **Social feed / discovery** | Community features are expensive to moderate, slow to grow, and distract from the personal cookbook value prop. Only consider at 10k+ users. |
| **Barcode scanning for pantry** | Cool feature, massive engineering effort (UPC database, camera scanning, edge cases). Simple text-based pantry is 90% of the value at 10% of the cost. |
| **Apple Watch / widgets** | Nice-to-have, but only after the core app is monetizing. Retention features, not acquisition features. |
| **Multi-language support** | English-first. Localization is a tax on every future feature. Add it when revenue justifies the cost. |

---

## Key Dependencies (Build Order)

```
0.1 Auth ──────────────┬──→ 0.1b Dev/Prod Isolation
                       │         │
                       │         └──→ 0.2 Ship Prep / TestFlight
                       │                   │
                       │                   └──→ 0.3 Subscriptions ──→ 1.3 Rate Limits
                       │
                       ├──→ 0.4 Sync / Offline
                       │
                       ├──→ 1.2 Share Sheet Extension
                       │         │
                       │         └──→ 1.1 Social Media Import
                       │
                       ├──→ 2.1 Grocery List ──────→ 2.2 Meal Planning
                       │         │                         │
                       │         └──→ 4.1 Instacart ───────┘
                       │
                       ├──→ 3.1 Cook Log ──→ 3.2 Stats / Year in Review
                       │
                       ├──→ Deep Linking infra ──→ 5.1 Sharing ──→ 5.2 Family ──→ 5.3 Community
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
| 2026-04-16 | ROADMAP.md trimmed to a slim navigation layer (~3K tokens). Brand identity, current-state assessment, and per-phase feature breakdowns extracted to `docs/BRAND.md`, `docs/CURRENT_STATE.md`, and `docs/ROADMAP_PHASE_0.md` through `docs/ROADMAP_PHASE_5.md` so any agent can read the full roadmap entry point in one pass. No content lost. |
| 2026-04-16 | 0.1b Pillar 2 complete — dev Supabase wired up and verified end-to-end. New dev project (`nrdomcszbvqnfinrjvuz`) provisioned; all 13 Drizzle migrations replayed via new `server/scripts/apply-all-migrations.ts`; `migrate-0008-backfill.ts` + `verify-0008.ts` + `verify-0009-rls.ts` all pass. `server/.env` swapped to dev Session pooler URL; Railway env unchanged. `mobile/src/services/supabase.ts` updated to `__DEV__` ternary (matches `api.ts` / `authRedirect.ts`). On-device proof: dev sign-up lands in dev `auth.users`, not prod. README "DANGER: shared credentials" callout replaced with updated dev-only `.env` guidance. Email/password only on dev (Apple/Google deferred); email confirmation disabled on dev because free-tier shared SMTP throttled too aggressively during testing. Pillars 1 and 3 remain deferred. |
| 2026-04-15 | Updated 0.1b Dev/Prod Isolation plan. Kept the separate Debug/Release iOS app split, but changed the recommendation for solo development to require a separate dev Supabase project. Rationale: schema migrations, RLS/auth changes, storage changes, and migration rehearsal should no longer touch production. Separate Railway service remains optional for now. |
| 2026-04-14 | Mobile app terracotta palette migration complete. Created `mobile/src/theme/colors.ts` canonical palette module with raw tokens + semantic aliases. Added `MUTED_PLUM` and `DUSTY_ROSE` tokens. Migrated 37 files across screens/features/components (846+/569- lines). `collectionIconRules.ts` softened from Tailwind brights to muted palette variants; food-semantic warm tones preserved. Jar fan icons given four contrasting palette colors. Jar FAB background → PRIMARY. Updated "Brand Identity → Mobile app application" section status from pending to complete. See `CHANGELOG.md` 2026-04-14 for full hex-to-token mapping. |
| 2026-04-08 | Added 0.1b Dev/Prod Environment Isolation section: Git branching (`dev` branch), second Supabase project, second Railway service, separate Xcode scheme (`app.orzo.dev` bundle ID). Documents setup checklists, conditional file changes, and one-time vs ongoing tasks. |
| 2026-04-08 | Production deployment complete: Fastify API live on Railway at `https://api.getorzo.com`. Dockerfile fixed (skip root postinstall, install `@img/sharp-linux-x64`). Custom domain via Cloudflare CNAME (DNS-only). Apple Developer Portal setup (App ID, Services ID). Google Cloud OAuth client updated. Supabase providers configured. Release build verified on physical iPhone. `react-native+0.76.9.patch` extended with Hermes spaces-in-path fix. Updated 0.2 status to "Partially started." |
| 2026-04-04 | Auth complete: all 8 work streams (WS-1 through WS-8) finished. WS-6: private buckets, signed URLs, user-scoped paths. WS-7a: account deletion, sign-out-all, email change, MFA enrollment. WS-7b: step-up auth, MFA recovery codes, provider linking, session tracking. WS-8: rate limiting, auth header redaction, integration tests, security checklist. Production deployment Dockerfile and guide created. Updated 0.1 status to "Complete." Architecture notes updated. Feature table updated. |
| 2026-04-03 | Auth infrastructure: server-side auth complete. Updated 0.1 status from "Not started" to "In progress — server auth infrastructure complete." Architecture notes updated to reflect Supabase Auth configuration, JWT middleware, user-scoped repositories, and RLS policies. Feature table updated. Remaining work streams (WS-4 through WS-8) documented inline with explicit dependencies. |
| 2026-03-31 | Roadmap revision after full codebase cross-reference. Added 0.2 Ship Prep & TestFlight (analytics, crash reporting, privacy policy, App Store listing, TestFlight steps). Renumbered: Subscriptions→0.3, Sync→0.4. Added $1.99 Starter Pack trial ramp to 0.3 (auto-converts to Pro after 15 days, RevenueCat confirmation needed). Free tier cap raised from 15→50 recipes. Fixed dependency graph: 1.2 Share Sheet now precedes 1.1 Social Media Import. Added deep linking infrastructure as prerequisite for 5.1 Sharing. Added copyright considerations for recipe sharing (ingredients vs. instructions). Bumped Cook Mode (2.4) from S to M effort. Updated gating table with Starter Pack column. Adjusted revenue model: added Starter Pack revenue stream, updated conversion rate and user targets. |
| 2026-03-31 | Codebase cross-reference: added Current State Assessment section documenting all built MVP features vs. roadmap. Confirmed "already built" claims (structured ingredients, GPT integration, concurrent queue, notes, collections, hero images). Documented 12 shipped features not previously tracked in roadmap. Flagged Supabase architecture question for Phase 0. |
| 2026-03-31 | Revised timelines: compressed from 36 weeks to 18 weeks based on proven 10-day MVP velocity. Updated all effort estimates, phase timelines, and revenue milestones. |
| 2026-03-31 | Initial roadmap created. 6 phases, 22 features, targeting $20k MRR by Q1 2027. |
