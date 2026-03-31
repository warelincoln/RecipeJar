ALTER TABLE "recipes" ADD COLUMN "baseline_servings" numeric;

ALTER TABLE "recipe_ingredients" ADD COLUMN "amount" numeric;
ALTER TABLE "recipe_ingredients" ADD COLUMN "amount_max" numeric;
ALTER TABLE "recipe_ingredients" ADD COLUMN "unit" text;
ALTER TABLE "recipe_ingredients" ADD COLUMN "name" text;
ALTER TABLE "recipe_ingredients" ADD COLUMN "raw_text" text;
ALTER TABLE "recipe_ingredients" ADD COLUMN "is_scalable" boolean NOT NULL DEFAULT false;
