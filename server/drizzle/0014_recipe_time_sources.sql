-- Migration 0014: Track the source of each recipe time
--
-- Adds three nullable text columns to `recipes` capturing where prep/cook/
-- total time came from:
--   - "explicit"       — literally stated on the source (JSON-LD, Microdata,
--                        or a photo page that spells it out)
--   - "inferred"       — estimated by the AI Vision / URL parser when the
--                        source didn't state a time
--   - "user_confirmed" — user accepted or edited the value in the app
--   - NULL             — no value / source unknown
--
-- These drive two UX affordances:
--   (a) A review banner on the import preview for any "inferred" times
--   (b) A muted "~" prefix on the recipe detail chip for unconfirmed
--       inferred values, so customers can tell at a glance which times
--       were stated vs. estimated.
--
-- All columns are nullable; no backfill. Pre-0014 recipes have NULL source
-- for any existing time values (effectively "unknown, treat as non-inferred"
-- so they render without the ~ prefix).

ALTER TABLE "recipes"
  ADD COLUMN IF NOT EXISTS "prep_time_source" text,
  ADD COLUMN IF NOT EXISTS "cook_time_source" text,
  ADD COLUMN IF NOT EXISTS "total_time_source" text;
