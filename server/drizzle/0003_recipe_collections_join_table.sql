-- Step 1: Create the join table
CREATE TABLE IF NOT EXISTS "recipe_collections" (
	"recipe_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_collections_recipe_id_collection_id_pk" PRIMARY KEY("recipe_id","collection_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_collections" ADD CONSTRAINT "recipe_collections_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_collections" ADD CONSTRAINT "recipe_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Step 2: Migrate existing data from recipes.collection_id into the join table
INSERT INTO "recipe_collections" ("recipe_id", "collection_id")
SELECT "id", "collection_id" FROM "recipes" WHERE "collection_id" IS NOT NULL;
--> statement-breakpoint
-- Step 3: Drop the old FK constraint, index, and column
ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "recipes_collection_id_collections_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_collection_id_idx";
--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "collection_id";
