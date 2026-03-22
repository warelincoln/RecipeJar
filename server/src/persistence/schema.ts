import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull().default("CAPTURE_IN_PROGRESS"),
    sourceType: text("source_type").notNull(),
    originalUrl: text("original_url"),
    parsedCandidateJson: jsonb("parsed_candidate_json"),
    editedCandidateJson: jsonb("edited_candidate_json"),
    validationResultJson: jsonb("validation_result_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("drafts_status_idx").on(table.status),
    index("drafts_updated_at_idx").on(table.updatedAt),
  ],
);

export const draftPages = pgTable(
  "draft_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    imageUri: text("image_uri").notNull(),
    retakeCount: integer("retake_count").notNull().default(0),
    ocrText: text("ocr_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("draft_pages_draft_order_idx").on(
      table.draftId,
      table.orderIndex,
    ),
  ],
);

export const draftWarningStates = pgTable(
  "draft_warning_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    issueCode: text("issue_code").notNull(),
    fieldPath: text("field_path"),
    dismissed: boolean("dismissed").notNull().default(false),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("draft_warnings_draft_issue_idx").on(
      table.draftId,
      table.issueId,
    ),
  ],
);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: text("source_type").notNull(),
    originalUrl: text("original_url"),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    saveState: text("save_state").notNull(),
    isUserVerified: boolean("is_user_verified").notNull().default(false),
    hasUnresolvedWarnings: boolean("has_unresolved_warnings")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recipes_created_at_idx").on(table.createdAt),
    index("recipes_save_state_idx").on(table.saveState),
    index("recipes_collection_id_idx").on(table.collectionId),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    text: text("text").notNull(),
    isHeader: boolean("is_header").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recipe_ingredients_recipe_order_idx").on(
      table.recipeId,
      table.orderIndex,
    ),
  ],
);

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    text: text("text").notNull(),
    isHeader: boolean("is_header").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recipe_steps_recipe_order_idx").on(
      table.recipeId,
      table.orderIndex,
    ),
  ],
);

export const recipeSourcePages = pgTable(
  "recipe_source_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    imageUri: text("image_uri"),
    extractedText: text("extracted_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recipe_source_pages_recipe_order_idx").on(
      table.recipeId,
      table.orderIndex,
    ),
  ],
);
