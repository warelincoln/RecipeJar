-- Migration 0012: Add ON DELETE CASCADE to user_id FK constraints
--
-- Without CASCADE, deleting an auth.users row (which cascades to profiles)
-- is blocked by child rows in recipes, collections, drafts, and recipe_notes.
-- This caused account deletion to silently fail for users with saved data.

ALTER TABLE "recipes"
  DROP CONSTRAINT IF EXISTS "recipes_user_id_profiles_fk",
  ADD CONSTRAINT "recipes_user_id_profiles_fk"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "collections"
  DROP CONSTRAINT IF EXISTS "collections_user_id_profiles_fk",
  ADD CONSTRAINT "collections_user_id_profiles_fk"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "drafts"
  DROP CONSTRAINT IF EXISTS "drafts_user_id_profiles_fk",
  ADD CONSTRAINT "drafts_user_id_profiles_fk"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "recipe_notes"
  DROP CONSTRAINT IF EXISTS "recipe_notes_user_id_profiles_fk",
  ADD CONSTRAINT "recipe_notes_user_id_profiles_fk"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;
