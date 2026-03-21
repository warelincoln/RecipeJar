CREATE TABLE IF NOT EXISTS "draft_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"image_uri" text NOT NULL,
	"retake_count" integer DEFAULT 0 NOT NULL,
	"ocr_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_warning_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"issue_id" text NOT NULL,
	"issue_code" text NOT NULL,
	"field_path" text,
	"dismissed" boolean DEFAULT false NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'CAPTURE_IN_PROGRESS' NOT NULL,
	"source_type" text NOT NULL,
	"original_url" text,
	"parsed_candidate_json" jsonb,
	"edited_candidate_json" jsonb,
	"validation_result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"text" text NOT NULL,
	"is_header" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_source_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"image_uri" text,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"original_url" text,
	"save_state" text NOT NULL,
	"is_user_verified" boolean DEFAULT false NOT NULL,
	"has_unresolved_warnings" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_pages" ADD CONSTRAINT "draft_pages_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_warning_states" ADD CONSTRAINT "draft_warning_states_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_source_pages" ADD CONSTRAINT "recipe_source_pages_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "draft_pages_draft_order_idx" ON "draft_pages" USING btree ("draft_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "draft_warnings_draft_issue_idx" ON "draft_warning_states" USING btree ("draft_id","issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_status_idx" ON "drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_updated_at_idx" ON "drafts" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_ingredients_recipe_order_idx" ON "recipe_ingredients" USING btree ("recipe_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_source_pages_recipe_order_idx" ON "recipe_source_pages" USING btree ("recipe_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_steps_recipe_order_idx" ON "recipe_steps" USING btree ("recipe_id","order_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_created_at_idx" ON "recipes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_save_state_idx" ON "recipes" USING btree ("save_state");