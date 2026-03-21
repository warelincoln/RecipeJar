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
}
