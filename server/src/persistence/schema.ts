import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ── profiles ─────────────────────────────────────────────────────────
 * Maps 1-to-1 with auth.users (id is the Supabase auth UID).
 * FK to auth.users is enforced in the migration SQL, not here,
 * because Drizzle cannot reference cross-schema tables.
 * A Postgres trigger auto-inserts a row on every auth.users INSERT.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", {
    withTimezone: true,
  }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status").notNull().default("CAPTURE_IN_PROGRESS"),
    sourceType: text("source_type").notNull(),
    originalUrl: text("original_url"),
    parsedCandidateJson: jsonb("parsed_candidate_json"),
    editedCandidateJson: jsonb("edited_candidate_json"),
    validationResultJson: jsonb("validation_result_json"),
    parseErrorMessage: text("parse_error_message"),
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
    index("idx_drafts_user_id").on(table.userId),
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

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_collections_user_id").on(table.userId)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: text("source_type").notNull(),
    originalUrl: text("original_url"),
    imageUrl: text("image_url"),
    ratingHalfSteps: integer("rating_half_steps"),
    baselineServings: numeric("baseline_servings"),
    prepTimeMinutes: integer("prep_time_minutes"),
    prepTimeSource: text("prep_time_source"),
    cookTimeMinutes: integer("cook_time_minutes"),
    cookTimeSource: text("cook_time_source"),
    totalTimeMinutes: integer("total_time_minutes"),
    totalTimeSource: text("total_time_source"),
    descriptionSummary: text("description_summary"),
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
    index("idx_recipes_user_id").on(table.userId),
  ],
);

export const recipeCollections = pgTable(
  "recipe_collections",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.collectionId] }),
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
    amount: numeric("amount"),
    amountMax: numeric("amount_max"),
    unit: text("unit"),
    name: text("name"),
    rawText: text("raw_text"),
    isScalable: boolean("is_scalable").notNull().default(false),
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
    summaryText: text("summary_text"),
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

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    deviceInfo: text("device_info"),
    ipAddress: text("ip_address"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_user_sessions_user_id").on(table.userId),
    index("idx_user_sessions_last_seen").on(table.lastSeenAt),
  ],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_mfa_recovery_codes_user_id").on(table.userId)],
);

export const recipeNotes = pgTable(
  "recipe_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recipe_notes_recipe_id_idx").on(table.recipeId),
    index("idx_recipe_notes_user_id").on(table.userId),
  ],
);
