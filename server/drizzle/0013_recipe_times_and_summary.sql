-- Migration 0013: Add prep/cook/total time and summary columns
--
-- Adds four columns to `recipes`:
--   - prep_time_minutes, cook_time_minutes, total_time_minutes
--     (populated from ParsedRecipeCandidate.metadata during save;
--      JSON-LD / Microdata already extract these, Vision prompt will be updated
--      to extract them from cookbook photos)
--   - description_summary (nullable; pre-baked for future AI summarization work)
--
-- Adds one column to `recipe_steps`:
--   - summary_text (nullable; pre-baked for future AI step summarization)
--
-- All columns are nullable — no backfill needed. Recipes predating this
-- migration simply have NULL time/summary fields and the UI hides chip rows
-- when all time fields are null.

ALTER TABLE "recipes"
  ADD COLUMN IF NOT EXISTS "prep_time_minutes" integer,
  ADD COLUMN IF NOT EXISTS "cook_time_minutes" integer,
  ADD COLUMN IF NOT EXISTS "total_time_minutes" integer,
  ADD COLUMN IF NOT EXISTS "description_summary" text;

ALTER TABLE "recipe_steps"
  ADD COLUMN IF NOT EXISTS "summary_text" text;
