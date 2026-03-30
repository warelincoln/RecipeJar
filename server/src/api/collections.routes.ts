import type { FastifyInstance } from "fastify";
import { collectionsRepository } from "../persistence/collections.repository.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { resolveImageUrls } from "../services/recipe-image.service.js";

function withImageUrls<T extends { imageUrl?: string | null }>(recipe: T) {
  return {
    ...recipe,
    ...resolveImageUrls(recipe.imageUrl ?? null),
  };
}

export async function collectionsRoutes(app: FastifyInstance) {
  app.post<{ Body: { name: string } }>("/collections", async (request, reply) => {
    const { name } = request.body;
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Collection name is required" });
    }
    const collection = await collectionsRepository.create(name.trim());
    return reply.status(201).send(collection);
  });

  app.get("/collections", async (_request, reply) => {
    const collections = await collectionsRepository.list();
    return reply.send(collections);
  });

  app.get<{ Params: { id: string } }>(
    "/collections/:id/recipes",
    async (request, reply) => {
      const collection = await collectionsRepository.findById(request.params.id);
      if (!collection) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      const recipes = await recipesRepository.listByCollection(request.params.id);
      return reply.send(recipes.map(withImageUrls));
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/collections/:id",
    async (request, reply) => {
      const collection = await collectionsRepository.findById(request.params.id);
      if (!collection) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      await collectionsRepository.delete(request.params.id);
      return reply.status(204).send();
    },
  );
}
