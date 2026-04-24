import { eq, and, sql } from "drizzle-orm";
import { db } from "./db.js";
import { drafts, draftPages, draftWarningStates } from "./schema.js";
import type {
  ParsedRecipeCandidate,
  EditedRecipeCandidate,
  ValidationResult,
} from "@orzo/shared";

export interface CreateDraftInput {
  userId: string;
  sourceType: "image" | "url";
  originalUrl?: string | null;
}

export interface AddPageInput {
  draftId: string;
  orderIndex: number;
  imageUri: string;
}

export const draftsRepository = {
  async create(input: CreateDraftInput) {
    const [draft] = await db
      .insert(drafts)
      .values({
        userId: input.userId,
        sourceType: input.sourceType,
        originalUrl: input.originalUrl ?? null,
        status: input.sourceType === "url" ? "READY_FOR_PARSE" : "CAPTURE_IN_PROGRESS",
      })
      .returning();
    return draft;
  },

  async findById(id: string, userId: string) {
    const draft = await db.query.drafts.findFirst({
      where: and(eq(drafts.id, id), eq(drafts.userId, userId)),
    });
    return draft ?? null;
  },

  /** For background tasks and system operations — no user scoping. */
  async findByIdInternal(id: string) {
    const draft = await db.query.drafts.findFirst({
      where: eq(drafts.id, id),
    });
    return draft ?? null;
  },

  async updateStatus(id: string, status: string) {
    const [updated] = await db
      .update(drafts)
      .set({ status, updatedAt: new Date() })
      .where(eq(drafts.id, id))
      .returning();
    return updated;
  },

  async setParsedCandidate(
    id: string,
    candidate: ParsedRecipeCandidate,
    validationResult: ValidationResult,
    status: string,
    guardStatus?: string,
  ) {
    // Pick up the URL-fallback cascade's resolved URL (set by
    // `tryUrlFallback` in url-parse.adapter.ts) so later retries of
    // POST /drafts/:id/parse can skip link discovery entirely. When
    // the fallback didn't fire, candidate.fallbackResolvedUrl is
    // undefined and we leave resolved_url alone (NULL on first parse,
    // preserved on re-parses).
    const setFields: Record<string, unknown> = {
      parsedCandidateJson: candidate as unknown as Record<string, unknown>,
      validationResultJson: validationResult as unknown as Record<string, unknown>,
      editedCandidateJson: {
        title: candidate.title ?? "",
        ingredients: candidate.ingredients,
        steps: candidate.steps,
        description: candidate.description ?? null,
        servings: candidate.servings ?? null,
      } as unknown as Record<string, unknown>,
      status,
      updatedAt: new Date(),
    };
    if (typeof candidate.fallbackResolvedUrl === "string") {
      setFields.resolvedUrl = candidate.fallbackResolvedUrl;
    }

    const [updated] = await db
      .update(drafts)
      .set(setFields)
      .where(
        guardStatus
          ? sql`${drafts.id} = ${id} AND ${drafts.status} = ${guardStatus}`
          : eq(drafts.id, id),
      )
      .returning();
    return updated ?? null;
  },

  async updateEditedCandidate(
    id: string,
    candidate: EditedRecipeCandidate,
    validationResult: ValidationResult,
  ) {
    const [updated] = await db
      .update(drafts)
      .set({
        editedCandidateJson: candidate as unknown as Record<string, unknown>,
        validationResultJson: validationResult as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id))
      .returning();
    return updated;
  },

  async markSaved(id: string) {
    const [updated] = await db
      .update(drafts)
      .set({ status: "SAVED", updatedAt: new Date() })
      .where(eq(drafts.id, id))
      .returning();
    return updated;
  },

  async setParseError(id: string, errorMessage: string, guardStatus?: string) {
    const [updated] = await db
      .update(drafts)
      .set({
        status: "PARSE_FAILED",
        parseErrorMessage: errorMessage,
        updatedAt: new Date(),
      })
      .where(
        guardStatus
          ? sql`${drafts.id} = ${id} AND ${drafts.status} = ${guardStatus}`
          : eq(drafts.id, id),
      )
      .returning();
    return updated ?? null;
  },

  async resetStuckParsingDrafts() {
    const result = await db
      .update(drafts)
      .set({
        status: "PARSE_FAILED",
        parseErrorMessage: "Parse timed out.",
        updatedAt: new Date(),
      })
      .where(
        sql`${drafts.status} = 'PARSING' AND ${drafts.updatedAt} < NOW() - INTERVAL '5 minutes'`,
      )
      .returning();
    return result.length;
  },

  async deleteOldCancelledDrafts() {
    const stale = await db.query.drafts.findMany({
      where: sql`${drafts.status} = 'CANCELLED' AND ${drafts.updatedAt} < NOW() - INTERVAL '24 hours'`,
    });
    for (const d of stale) {
      await db.delete(drafts).where(eq(drafts.id, d.id));
    }
    return stale.length;
  },

  // --- Pages ---

  async addPage(input: AddPageInput) {
    const [page] = await db
      .insert(draftPages)
      .values({
        draftId: input.draftId,
        orderIndex: input.orderIndex,
        imageUri: input.imageUri,
      })
      .returning();
    return page;
  },

  async getPages(draftId: string) {
    return db.query.draftPages.findMany({
      where: eq(draftPages.draftId, draftId),
      orderBy: (pages, { asc }) => [asc(pages.orderIndex)],
    });
  },

  async reorderPages(draftId: string, pageOrder: { pageId: string; orderIndex: number }[]) {
    for (const item of pageOrder) {
      await db
        .update(draftPages)
        .set({ orderIndex: item.orderIndex, updatedAt: new Date() })
        .where(eq(draftPages.id, item.pageId));
    }
  },

  async retakePage(pageId: string, newImageUri: string) {
    const [updated] = await db
      .update(draftPages)
      .set({
        imageUri: newImageUri,
        retakeCount: sql`${draftPages.retakeCount} + 1`,
        ocrText: null,
        updatedAt: new Date(),
      })
      .where(eq(draftPages.id, pageId))
      .returning();
    return updated;
  },

  async findPageById(pageId: string) {
    const page = await db.query.draftPages.findFirst({
      where: eq(draftPages.id, pageId),
    });
    return page ?? null;
  },

  // --- Warning States ---

  async getWarningStates(draftId: string) {
    return db.query.draftWarningStates.findMany({
      where: eq(draftWarningStates.draftId, draftId),
    });
  },

  async upsertWarningStates(
    draftId: string,
    issues: { issueId: string; code: string; fieldPath?: string }[],
  ) {
    if (issues.length === 0) return;
    await db
      .insert(draftWarningStates)
      .values(
        issues.map((i) => ({
          draftId,
          issueId: i.issueId,
          issueCode: i.code,
          fieldPath: i.fieldPath ?? null,
        })),
      )
      .onConflictDoNothing();
  },

  async dismissWarning(draftId: string, issueId: string) {
    const [updated] = await db
      .update(draftWarningStates)
      .set({ dismissed: true, dismissedAt: new Date(), updatedAt: new Date() })
      .where(
        sql`${draftWarningStates.draftId} = ${draftId} AND ${draftWarningStates.issueId} = ${issueId}`,
      )
      .returning();
    return updated ?? null;
  },

  async undismissWarning(draftId: string, issueId: string) {
    const [updated] = await db
      .update(draftWarningStates)
      .set({ dismissed: false, dismissedAt: null, updatedAt: new Date() })
      .where(
        sql`${draftWarningStates.draftId} = ${draftId} AND ${draftWarningStates.issueId} = ${issueId}`,
      )
      .returning();
    return updated ?? null;
  },
};
