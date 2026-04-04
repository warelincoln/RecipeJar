import type { FastifyInstance } from "fastify";
import { collectionsRepository } from "../persistence/collections.repository.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { resolveImageUrls } from "../services/recipe-image.service.js";

async function withImageUrls<T extends { imageUrl?: string | null }>(recipe: T) {
  return {
    ...recipe,
    ...(await resolveImageUrls(recipe.imageUrl ?? null)),
  };
}

export async function collectionsRoutes(app: FastifyInstance) {
  app.post<{ Body: { name: string } }>("/collections", async (request, reply) => {
    const { name } = request.body;
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Collection name is required" });
    }
    const collection = await collectionsRepository.create(name.trim(), request.userId);
    return reply.status(201).send(collection);
  });

  app.get("/collections", async (request, reply) => {
    const collections = await collectionsRepository.list(request.userId);
    return reply.send(collections);
  });

  app.get<{ Params: { id: string } }>(
    "/collections/:id/recipes",
    async (request, reply) => {
      const collection = await collectionsRepository.findById(request.params.id, request.userId);
      if (!collection) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      const recipes = await recipesRepository.listByCollection(request.params.id, request.userId);
      return reply.send(await Promise.all(recipes.map(withImageUrls)));
    },
  );

  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/collections/:id",
    async (request, reply) => {
      const { name } = request.body ?? {};
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({ error: "Collection name is required" });
      }
      const updated = await collectionsRepository.update(
        request.params.id,
        name.trim(),
        request.userId,
      );
      if (!updated) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/collections/:id",
    async (request, reply) => {
      const collection = await collectionsRepository.findById(request.params.id, request.userId);
      if (!collection) {
        return reply.status(404).send({ error: "Collection not found" });
      }
      await collectionsRepository.delete(request.params.id, request.userId);
      return reply.status(204).send();
    },
  );
}
