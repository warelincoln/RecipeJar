-- Migration 0009: Enable Row Level Security + user-scoping policies
--
-- RLS applies to the `authenticated` and `anon` Supabase roles (PostgREST).
-- The `postgres` / service_role connection used by Fastify bypasses RLS,
-- so app-level scoping in repositories is the primary defense; RLS is
-- the defense-in-depth layer.
--
-- Default RLS behavior: once enabled, ALL access is denied unless a
-- policy explicitly grants it. We only create policies for `authenticated`,
-- so the `anon` role gets zero access to user data.

-- ═══════════════════════════════════════════════════════════════════
-- 1. profiles (id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON "profiles" FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON "profiles" FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT handled by trigger (on_auth_user_created)
-- DELETE handled by cascade from auth.users

-- ═══════════════════════════════════════════════════════════════════
-- 2. recipes (user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select_own"
  ON "recipes" FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "recipes_insert_own"
  ON "recipes" FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipes_update_own"
  ON "recipes" FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipes_delete_own"
  ON "recipes" FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 3. collections (user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections_select_own"
  ON "collections" FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "collections_insert_own"
  ON "collections" FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "collections_update_own"
  ON "collections" FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "collections_delete_own"
  ON "collections" FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 4. drafts (user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drafts_select_own"
  ON "drafts" FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "drafts_insert_own"
  ON "drafts" FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "drafts_update_own"
  ON "drafts" FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "drafts_delete_own"
  ON "drafts" FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 5. recipe_notes (user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipe_notes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_notes_select_own"
  ON "recipe_notes" FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "recipe_notes_insert_own"
  ON "recipe_notes" FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipe_notes_update_own"
  ON "recipe_notes" FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipe_notes_delete_own"
  ON "recipe_notes" FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 6. draft_pages (parent: drafts.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "draft_pages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_pages_select_own"
  ON "draft_pages" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_pages.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_pages_insert_own"
  ON "draft_pages" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_pages.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_pages_update_own"
  ON "draft_pages" FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_pages.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_pages_delete_own"
  ON "draft_pages" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_pages.draft_id
      AND drafts.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 7. draft_warning_states (parent: drafts.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "draft_warning_states" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_warning_states_select_own"
  ON "draft_warning_states" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_warning_states.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_warning_states_insert_own"
  ON "draft_warning_states" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_warning_states.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_warning_states_update_own"
  ON "draft_warning_states" FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_warning_states.draft_id
      AND drafts.user_id = auth.uid()
  ));

CREATE POLICY "draft_warning_states_delete_own"
  ON "draft_warning_states" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drafts
    WHERE drafts.id = draft_warning_states.draft_id
      AND drafts.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 8. recipe_collections (parent: recipes.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipe_collections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_collections_select_own"
  ON "recipe_collections" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_collections.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_collections_insert_own"
  ON "recipe_collections" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_collections.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_collections_delete_own"
  ON "recipe_collections" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_collections.recipe_id
      AND recipes.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 9. recipe_ingredients (parent: recipes.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_ingredients_select_own"
  ON "recipe_ingredients" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_ingredients_insert_own"
  ON "recipe_ingredients" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_ingredients_update_own"
  ON "recipe_ingredients" FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_ingredients_delete_own"
  ON "recipe_ingredients" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 10. recipe_steps (parent: recipes.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipe_steps" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_steps_select_own"
  ON "recipe_steps" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_steps.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_steps_insert_own"
  ON "recipe_steps" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_steps.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_steps_update_own"
  ON "recipe_steps" FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_steps.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_steps_delete_own"
  ON "recipe_steps" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_steps.recipe_id
      AND recipes.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 11. recipe_source_pages (parent: recipes.user_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipe_source_pages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_source_pages_select_own"
  ON "recipe_source_pages" FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_source_pages.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_source_pages_insert_own"
  ON "recipe_source_pages" FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_source_pages.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_source_pages_update_own"
  ON "recipe_source_pages" FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_source_pages.recipe_id
      AND recipes.user_id = auth.uid()
  ));

CREATE POLICY "recipe_source_pages_delete_own"
  ON "recipe_source_pages" FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_source_pages.recipe_id
      AND recipes.user_id = auth.uid()
  ));
