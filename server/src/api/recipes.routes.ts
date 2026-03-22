import type { FastifyInstance } from "fastify";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { recipeNotesRepository } from "../persistence/recipe-notes.repository.js";
import { NOTE_MAX_LENGTH } from "@recipejar/shared";

const VALID_RATINGS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

export async function recipesRoutes(app: FastifyInstance) {
  app.get("/recipes", async (_request, reply) => {
    const recipes = await recipesRepository.list();
    return reply.send(recipes);
  });

  app.get<{ Params: { id: string } }>(
    "/recipes/:id",
    async (request, reply) => {
      const recipe = await recipesRepository.findById(request.params.id);
      if (!recipe) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      return reply.send(recipe);
    },
  );

  app.put<{
    Params: { id: string };
    Body: {
      title: string;
      description?: string | null;
      collectionId?: string | null;
      ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
      steps: { text: string; orderIndex: number; isHeader: boolean }[];
    };
  }>("/recipes/:id", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Recipe not found" });
    }
    const updated = await recipesRepository.update(
      request.params.id,
      request.body,
    );
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>(
    "/recipes/:id",
    async (request, reply) => {
      const existing = await recipesRepository.findById(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      await recipesRepository.delete(request.params.id);
      return reply.send({ success: true });
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { collectionId: string | null };
  }>("/recipes/:id/collection", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Recipe not found" });
    }

    const { collectionId } = request.body;
    if (collectionId) {
      await recipesRepository.assignToCollection(
        request.params.id,
        collectionId,
      );
    } else {
      await recipesRepository.removeFromCollection(request.params.id);
    }

    const updated = await recipesRepository.findById(request.params.id);
    return reply.send(updated);
  });

  // --- Notes CRUD ---

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/recipes/:id/notes",
    async (request, reply) => {
      const recipe = await recipesRepository.findById(request.params.id);
      if (!recipe) {
        return reply.status(404).send({ error: "Recipe not found" });
      }
      const trimmed = (request.body.text ?? "").trim();
      if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) {
        return reply
          .status(400)
          .send({ error: `Note text is required and must be ${NOTE_MAX_LENGTH} characters or fewer` });
      }
      const note = await recipeNotesRepository.create(request.params.id, trimmed);
      return reply.status(201).send(note);
    },
  );

  app.patch<{
    Params: { id: string; noteId: string };
    Body: { text: string };
  }>("/recipes/:id/notes/:noteId", async (request, reply) => {
    const note = await recipeNotesRepository.findById(request.params.noteId);
    if (!note || note.recipeId !== request.params.id) {
      return reply.status(404).send({ error: "Note not found" });
    }
    const trimmed = (request.body.text ?? "").trim();
    if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) {
      return reply
        .status(400)
        .send({ error: `Note text is required and must be ${NOTE_MAX_LENGTH} characters or fewer` });
    }
    const updated = await recipeNotesRepository.update(request.params.noteId, trimmed);
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string; noteId: string } }>(
    "/recipes/:id/notes/:noteId",
    async (request, reply) => {
      const note = await recipeNotesRepository.findById(request.params.noteId);
      if (!note || note.recipeId !== request.params.id) {
        return reply.status(404).send({ error: "Note not found" });
      }
      await recipeNotesRepository.delete(request.params.noteId);
      return reply.send({ success: true });
    },
  );

  // --- Rating ---

  app.patch<{
    Params: { id: string };
    Body: { rating: number | null };
  }>("/recipes/:id/rating", async (request, reply) => {
    const existing = await recipesRepository.findById(request.params.id);
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
    const updated = await recipesRepository.findById(request.params.id);
    return reply.send(updated);
  });
}
