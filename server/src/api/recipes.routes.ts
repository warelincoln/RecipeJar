import type { FastifyInstance } from "fastify";
import { collectionsRepository } from "../persistence/collections.repository.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { recipeNotesRepository } from "../persistence/recipe-notes.repository.js";
import { NOTE_MAX_LENGTH } from "@orzo/shared";
import {
  deleteRecipeImage,
  resolveImageUrls,
  resolveSourcePageUrl,
  uploadRecipeImage,
} from "../services/recipe-image.service.js";

const VALID_RATINGS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

async function withImageUrls<T extends { imageUrl?: string | null }>(recipe: T) {
  return {
    ...recipe,
    ...(await resolveImageUrls(recipe.imageUrl ?? null)),
  };
}

type SourcePageRow = {
  id: string;
  orderIndex: number;
  imageUri: string | null;
  extractedText: string | null;
};

/**
 * Full response transform: resolves image + thumbnail signed URLs, builds
 * the `sourceContext` wrapper the mobile client expects (with signed URLs
 * for source page images), and strips the flat `sourcePages` field now
 * that it lives inside sourceContext. The result matches the shared Recipe
 * type.
 */
async function enrichRecipeResponse<
  T extends {
    imageUrl?: string | null;
    sourceType: string;
    originalUrl: string | null;
    sourcePages?: SourcePageRow[] | null;
  },
>(recipe: T) {
  const resolvedImage = await resolveImageUrls(recipe.imageUrl ?? null);
  const pages = recipe.sourcePages ?? [];
  const resolvedPages = await Promise.all(
    pages.map(async (page) => ({
      id: page.id,
      orderIndex: page.orderIndex,
      imageUri: await resolveSourcePageUrl(page.imageUri),
      extractedText: page.extractedText,
    })),
  );
  const { sourcePages: _drop, ...rest } = recipe;
  return {
    ...rest,
    ...resolvedImage,
    sourceContext: {
      sourceType: recipe.sourceType as "image" | "url",
      originalUrl: recipe.originalUrl,
      pages: resolvedPages,
    },
  };
}

export async function recipesRoutes(app: FastifyInstance) {
  app.get("/recipes", async (request, reply) => {
    const recipes = await recipesRepository.list(request.userId);
    return reply.send(await Promise.all(recipes.map(enrichRecipeResponse)));
  });

  app.get<{ Params: { id: string } }>(
    "/recipes/:id",
    async (request, reply) => {
      const recipe = await recipesRepository.findById(request.params.id, request.userId);
      if (!recipe) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      return reply.send(await enrichRecipeResponse(recipe));
    },
  );

  app.put<{
    Params: { id: string };
    Body: {
      title: string;
      description?: string | null;
      descriptionSummary?: string | null;
      collectionId?: string | null;
      baselineServings?: number | null;
      prepTimeMinutes?: number | null;
      cookTimeMinutes?: number | null;
      totalTimeMinutes?: number | null;
      ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
      steps: {
        text: string;
        summaryText?: string | null;
        orderIndex: number;
        isHeader: boolean;
      }[];
    };
  }>("/recipes/:id", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id, request.userId);
    if (!existing) {
      return reply.status(404).send({ error: "Recipe not found" });
    }
    const updated = await recipesRepository.update(
      request.params.id,
      request.body,
      request.userId,
    );
    return reply.send(updated ? await enrichRecipeResponse(updated) : null);
  });

  app.delete<{ Params: { id: string } }>(
    "/recipes/:id",
    async (request, reply) => {
      const existing = await recipesRepository.findById(request.params.id, request.userId);
      if (!existing) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      try {
        await deleteRecipeImage(request.userId, request.params.id);
      } catch (err) {
        request.log.warn(
          { err, recipeId: request.params.id },
          "Failed to delete recipe image from storage",
        );
      }
      await recipesRepository.delete(request.params.id);
      return reply.send({ success: true });
    },
  );

  // --- Bulk operations ---
  //
  // Both bulk endpoints:
  //   - Return JSON bodies (NOT 204 No Content). The mobile client's
  //     request() helper calls .json() on every response; a 204 would
  //     throw on the client.
  //   - Scope by request.userId. Non-owned ids are silently excluded from
  //     the count (same as bulk delete semantics elsewhere).
  //   - Inherit the global 100 req/min rate limit; bulk operations are
  //     one request regardless of selection size.

  app.post<{ Body: { ids: string[] } }>(
    "/recipes/bulk-delete",
    async (request, reply) => {
      const { ids } = request.body;
      if (!Array.isArray(ids)) {
        return reply.status(400).send({ error: "ids must be an array" });
      }
      const deletedIds = await recipesRepository.bulkDelete(
        request.userId,
        ids,
      );
      // Fire-and-forget image cleanup: log but don't fail the response
      // if Storage has transient issues (same pattern as single-delete).
      await Promise.all(
        deletedIds.map((id) =>
          deleteRecipeImage(request.userId, id).catch((err) => {
            request.log.warn(
              { err, recipeId: id },
              "Failed to delete recipe image from storage during bulk delete",
            );
          }),
        ),
      );
      return reply.send({ deletedCount: deletedIds.length });
    },
  );

  app.patch<{ Body: { ids: string[]; collectionId: string | null } }>(
    "/recipes/bulk-collection",
    async (request, reply) => {
      const { ids, collectionId } = request.body;
      if (!Array.isArray(ids)) {
        return reply.status(400).send({ error: "ids must be an array" });
      }
      if (collectionId !== null && typeof collectionId !== "string") {
        return reply
          .status(400)
          .send({ error: "collectionId must be a string or null" });
      }
      // Validate collection ownership before touching any rows.
      if (collectionId !== null) {
        const collection = await collectionsRepository.findById(
          collectionId,
          request.userId,
        );
        if (!collection) {
          return reply.status(404).send({ error: "Collection not found" });
        }
      }
      const updatedCount = await recipesRepository.bulkAssignCollection(
        request.userId,
        ids,
        collectionId,
      );
      return reply.send({ updatedCount });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/recipes/:id/image",
    async (request, reply) => {
      const existing = await recipesRepository.findById(request.params.id, request.userId);
      if (!existing) {
        return reply.status(404).send({ error: "Recipe not found" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Image file is required" });
      }

      const buffer = await file.toBuffer();
      await deleteRecipeImage(request.userId, request.params.id);
      const imagePath = await uploadRecipeImage(request.userId, request.params.id, buffer);
      if (!imagePath) {
        return reply.status(500).send({ error: "Failed to upload recipe image" });
      }

      await recipesRepository.setImage(request.params.id, imagePath);
      const updated = await recipesRepository.findById(request.params.id, request.userId);
      return reply.send(updated ? await enrichRecipeResponse(updated) : null);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/recipes/:id/image",
    async (request, reply) => {
      const existing = await recipesRepository.findById(request.params.id, request.userId);
      if (!existing) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      await deleteRecipeImage(request.userId, request.params.id);
      await recipesRepository.setImage(request.params.id, null);
      const updated = await recipesRepository.findById(request.params.id, request.userId);
      return reply.send(updated ? await enrichRecipeResponse(updated) : null);
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { collectionId: string | null };
  }>("/recipes/:id/collection", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id, request.userId);
    if (!existing) {
      return reply.status(404).send({ error: "Recipe not found" });
    }

    const { collectionId } = request.body;
    if (collectionId) {
      const collection = await collectionsRepository.findById(collectionId, request.userId);
      if (!collection) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      await recipesRepository.assignToCollection(
        request.params.id,
        collectionId,
      );
    } else {
      await recipesRepository.removeFromCollection(request.params.id);
    }

    const updated = await recipesRepository.findById(request.params.id, request.userId);
    return reply.send(updated ? await enrichRecipeResponse(updated) : null);
  });

  // --- Notes CRUD ---

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/recipes/:id/notes",
    async (request, reply) => {
      const recipe = await recipesRepository.findById(request.params.id, request.userId);
      if (!recipe) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      const trimmed = (request.body.text ?? "").trim();
      if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) {
        return reply
          .status(400)
          .send({ error: `Note text is required and must be ${NOTE_MAX_LENGTH} characters or fewer` });
      }
      const note = await recipeNotesRepository.create(request.params.id, trimmed, request.userId);
      return reply.status(201).send(note);
    },
  );

  app.patch<{
    Params: { id: string; noteId: string };
    Body: { text: string };
  }>("/recipes/:id/notes/:noteId", async (request, reply) => {
    const note = await recipeNotesRepository.findById(request.params.noteId, request.userId);
    if (!note || note.recipeId !== request.params.id) {
      return reply.status(404).send({ error: "Note not found" });
    }
    const trimmed = (request.body.text ?? "").trim();
    if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) {
      return reply
        .status(400)
        .send({ error: `Note text is required and must be ${NOTE_MAX_LENGTH} characters or fewer` });
    }
    const updated = await recipeNotesRepository.update(request.params.noteId, trimmed, request.userId);
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string; noteId: string } }>(
    "/recipes/:id/notes/:noteId",
    async (request, reply) => {
      const note = await recipeNotesRepository.findById(request.params.noteId, request.userId);
      if (!note || note.recipeId !== request.params.id) {
        return reply.status(404).send({ error: "Note not found" });
      }
      await recipeNotesRepository.delete(request.params.noteId, request.userId);
      return reply.send({ success: true });
    },
  );

  // --- Rating ---

  app.patch<{
    Params: { id: string };
    Body: { rating: number | null };
  }>("/recipes/:id/rating", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id, request.userId);
    if (!existing) {
      return reply.status(404).send({ error: "Recipe not found" });
    }
    const { rating } = request.body;
    if (rating !== null && !VALID_RATINGS.has(rating)) {
      return reply
        .status(400)
        .send({ error: "Rating must be null or a value from 0.5 to 5 in 0.5 steps" });
    }
    const halfSteps = rating !== null ? Math.round(rating * 2) : null;
    await recipesRepository.setRating(request.params.id, halfSteps);
    const updated = await recipesRepository.findById(request.params.id, request.userId);
    return reply.send(updated ? await enrichRecipeResponse(updated) : null);
  });
}
