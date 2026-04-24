-- Migration 0015: Track the resolved URL when URL-fallback rescues a non-recipe page
--
-- Adds a nullable `resolved_url` column to `drafts`. Set by `parseUrlFromHtml`
-- when the user-pasted URL doesn't contain a recipe but a recipe link on the
-- page (Layer 1 canonical short-circuit, or Layer 2 scored link-fallback)
-- parses successfully. Stores the URL we actually parsed; `original_url`
-- continues to hold the user's input so mobile can render a disclosure
-- banner explaining the swap.
--
-- On retry of POST /drafts/:id/parse, the route should coalesce via
-- `resolved_url ?? original_url` so the second parse hits the resolved
-- URL directly without re-running link discovery.
--
-- Nullable, no backfill. Legacy rows + any draft where fallback didn't
-- fire stay NULL. Consumers must coalesce.

ALTER TABLE "drafts"
  ADD COLUMN IF NOT EXISTS "resolved_url" text;
