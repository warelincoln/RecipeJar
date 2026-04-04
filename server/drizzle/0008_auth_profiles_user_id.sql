-- Migration 0008: Auth profiles table + user_id ownership columns
-- Depends on: Supabase Auth (auth.users must exist)
--
-- This migration is applied in two phases:
--   Phase 1 (this file):  DDL — table, trigger, nullable columns, indexes
--   Phase 2 (backfill):   server/scripts/migrate-0008-backfill.ts
--                          creates seed user, backfills, sets NOT NULL, adds FKs

-- ═══════════════════════════════════════════════════════════════════
-- Phase 1a: profiles table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "profiles" (
  "id"                      uuid PRIMARY KEY,
  "display_name"            text,
  "avatar_url"              text,
  "subscription_tier"       text NOT NULL DEFAULT 'free',
  "subscription_expires_at" timestamp with time zone,
  "deleted_at"              timestamp with time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 1b: trigger — auto-create profile on auth signup
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name'
    ),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════
-- Phase 1c: add nullable user_id columns (backfill makes them NOT NULL)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "recipes"       ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "collections"   ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "drafts"        ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "recipe_notes"  ADD COLUMN IF NOT EXISTS "user_id" uuid;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 1d: indexes on user_id (safe to create even while nullable)
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "idx_recipes_user_id"      ON "recipes"      ("user_id");
CREATE INDEX IF NOT EXISTS "idx_collections_user_id"  ON "collections"  ("user_id");
CREATE INDEX IF NOT EXISTS "idx_drafts_user_id"       ON "drafts"       ("user_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_notes_user_id" ON "recipe_notes" ("user_id");
