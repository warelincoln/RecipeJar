import type { FastifyInstance } from "fastify";
import { recipesRepository } from "../persistence/recipes.repository.js";

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
    const updated = await recipesRepository.update(request.params.id, request.body);
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
    const updated = await recipesRepository.assignCollection(
      request.params.id,
      request.body.collectionId,
    );
    return reply.send(updated);
  });
}
