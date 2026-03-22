import { eq } from "drizzle-orm";
import { db } from "./db.js";
import {
  recipes,
  recipeIngredients,
  recipeSteps,
  recipeSourcePages,
} from "./schema.js";
import type { SaveDecision } from "@recipejar/shared";

export interface SaveRecipeInput {
  title: string;
  description?: string | null;
  sourceType: "image" | "url";
  originalUrl?: string | null;
  saveDecision: SaveDecision;
  ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
  steps: { text: string; orderIndex: number; isHeader: boolean }[];
  sourcePages: {
    orderIndex: number;
    imageUri?: string | null;
    extractedText?: string | null;
  }[];
}

export const recipesRepository = {
  async save(input: SaveRecipeInput) {
    const [recipe] = await db
      .insert(recipes)
      .values({
        title: input.title,
        description: input.description ?? null,
        sourceType: input.sourceType,
        originalUrl: input.originalUrl ?? null,
        saveState: input.saveDecision.saveState,
        isUserVerified: input.saveDecision.isUserVerified,
        hasUnresolvedWarnings: input.saveDecision.hasUnresolvedWarnings,
      })
      .returning();

    if (input.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        input.ingredients.map((ing) => ({
          recipeId: recipe.id,
          orderIndex: ing.orderIndex,
          text: ing.text,
          isHeader: ing.isHeader,
        })),
      );
    }

    if (input.steps.length > 0) {
      await db.insert(recipeSteps).values(
        input.steps.map((step) => ({
          recipeId: recipe.id,
          orderIndex: step.orderIndex,
          text: step.text,
          isHeader: step.isHeader,
        })),
      );
    }

    if (input.sourcePages.length > 0) {
      await db.insert(recipeSourcePages).values(
        input.sourcePages.map((page) => ({
          recipeId: recipe.id,
          orderIndex: page.orderIndex,
          imageUri: page.imageUri ?? null,
          extractedText: page.extractedText ?? null,
        })),
      );
    }

    return recipe;
  },

  async findById(id: string) {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, id),
    });
    if (!recipe) return null;

    const ingredients = await db.query.recipeIngredients.findMany({
      where: eq(recipeIngredients.recipeId, id),
      orderBy: (ri, { asc }) => [asc(ri.orderIndex)],
    });

    const steps = await db.query.recipeSteps.findMany({
      where: eq(recipeSteps.recipeId, id),
      orderBy: (rs, { asc }) => [asc(rs.orderIndex)],
    });

    const pages = await db.query.recipeSourcePages.findMany({
      where: eq(recipeSourcePages.recipeId, id),
      orderBy: (rsp, { asc }) => [asc(rsp.orderIndex)],
    });

    return { ...recipe, ingredients, steps, sourcePages: pages };
  },

  async list() {
    return db.query.recipes.findMany({
      orderBy: (r, { desc: d }) => [d(r.createdAt)],
    });
  },

  async listByCollection(collectionId: string) {
    return db.query.recipes.findMany({
      where: eq(recipes.collectionId, collectionId),
      orderBy: (r, { desc: d }) => [d(r.createdAt)],
    });
  },

  async update(
    id: string,
    input: {
      title: string;
      description?: string | null;
      collectionId?: string | null;
      ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
      steps: { text: string; orderIndex: number; isHeader: boolean }[];
    },
  ) {
    const [recipe] = await db
      .update(recipes)
      .set({
        title: input.title,
        description: input.description ?? null,
        collectionId: input.collectionId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    if (!recipe) return null;

    await db
      .delete(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, id));
    if (input.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        input.ingredients.map((ing) => ({
          recipeId: id,
          orderIndex: ing.orderIndex,
          text: ing.text,
          isHeader: ing.isHeader,
        })),
      );
    }

    await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    if (input.steps.length > 0) {
      await db.insert(recipeSteps).values(
        input.steps.map((step) => ({
          recipeId: id,
          orderIndex: step.orderIndex,
          text: step.text,
          isHeader: step.isHeader,
        })),
      );
    }

    return this.findById(id);
  },

  async delete(id: string) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    await db.delete(recipeSourcePages).where(eq(recipeSourcePages.recipeId, id));
    const [deleted] = await db.delete(recipes).where(eq(recipes.id, id)).returning();
    return deleted ?? null;
  },

  async assignCollection(recipeId: string, collectionId: string | null) {
    const [recipe] = await db
      .update(recipes)
      .set({ collectionId, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .returning();
    return recipe ?? null;
  },
};
