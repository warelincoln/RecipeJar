import type { FastifyInstance } from "fastify";
import { collectionsRepository } from "../persistence/collections.repository.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { recipeNotesRepository } from "../persistence/recipe-notes.repository.js";
import { NOTE_MAX_LENGTH } from "@orzo/shared";
import {
  deleteRecipeImage,
  resolveImageUrls,
  uploadRecipeImage,
} from "../services/recipe-image.service.js";

const VALID_RATINGS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

async function withImageUrls<T extends { imageUrl?: string | null }>(recipe: T) {
  return {
    ...recipe,
    ...(await resolveImageUrls(recipe.imageUrl ?? null)),
  };
}

export async function recipesRoutes(app: FastifyInstance) {
  app.get("/recipes", async (request, reply) => {
    const recipes = await recipesRepository.list(request.userId);
    return reply.send(await Promise.all(recipes.map(withImageUrls)));
  });

  app.get<{ Params: { id: string } }>(
    "/recipes/:id",
    async (request, reply) => {
      const recipe = await recipesRepository.findById(request.params.id, request.userId);
      if (!recipe) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      return reply.send(await withImageUrls(recipe));
    },
  );

  app.put<{
    Params: { id: string };
    Body: {
      title: string;
      description?: string | null;
      collectionId?: string | null;
      baselineServings?: number | null;
      ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
      steps: { text: string; orderIndex: number; isHeader: boolean }[];
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
    return reply.send(updated ? await withImageUrls(updated) : null);
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
      return reply.send(updated ? await withImageUrls(updated) : null);
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
      return reply.send(updated ? await withImageUrls(updated) : null);
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
    return reply.send(updated ? await withImageUrls(updated) : null);
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
    return reply.send(updated ? await withImageUrls(updated) : null);
  });
}
