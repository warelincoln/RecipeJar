import { eq, desc, inArray } from "drizzle-orm";
import { db } from "./db.js";
import {
  recipes,
  recipeIngredients,
  recipeSteps,
  recipeSourcePages,
  recipeCollections,
  recipeNotes,
  collections,
} from "./schema.js";
import type { SaveDecision } from "@recipejar/shared";

function mapRating(halfSteps: number | null): number | null {
  return halfSteps != null ? halfSteps / 2 : null;
}

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

async function attachCollections(
  recipeRows: (typeof recipes.$inferSelect)[],
) {
  if (recipeRows.length === 0) return [];

  const recipeIds = recipeRows.map((r) => r.id);
  const joinRows = await db
    .select({
      recipeId: recipeCollections.recipeId,
      collectionId: collections.id,
      collectionName: collections.name,
    })
    .from(recipeCollections)
    .innerJoin(collections, eq(recipeCollections.collectionId, collections.id))
    .where(inArray(recipeCollections.recipeId, recipeIds));

  const map = new Map<string, { id: string; name: string }[]>();
  for (const row of joinRows) {
    const arr = map.get(row.recipeId) ?? [];
    arr.push({ id: row.collectionId, name: row.collectionName });
    map.set(row.recipeId, arr);
  }

  return recipeRows.map((r) => ({
    ...r,
    rating: mapRating(r.ratingHalfSteps),
    notes: [],
    collections: map.get(r.id) ?? [],
  }));
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

    return { ...recipe, rating: mapRating(recipe.ratingHalfSteps), notes: [], collections: [] };
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

    const joinRows = await db
      .select({
        collectionId: collections.id,
        collectionName: collections.name,
      })
      .from(recipeCollections)
      .innerJoin(
        collections,
        eq(recipeCollections.collectionId, collections.id),
      )
      .where(eq(recipeCollections.recipeId, id));

    const recipeCollectionsList = joinRows.map((r) => ({
      id: r.collectionId,
      name: r.collectionName,
    }));

    const notes = await db.query.recipeNotes.findMany({
      where: eq(recipeNotes.recipeId, id),
      orderBy: (rn, { desc: d }) => [d(rn.createdAt)],
    });

    return {
      ...recipe,
      rating: mapRating(recipe.ratingHalfSteps),
      notes,
      ingredients,
      steps,
      sourcePages: pages,
      collections: recipeCollectionsList,
    };
  },

  async list() {
    const allRecipes = await db.query.recipes.findMany({
      orderBy: (r, { desc: d }) => [d(r.createdAt)],
    });
    return attachCollections(allRecipes);
  },

  async listByCollection(collectionId: string) {
    const joinRows = await db
      .select({ recipeId: recipeCollections.recipeId })
      .from(recipeCollections)
      .where(eq(recipeCollections.collectionId, collectionId));

    if (joinRows.length === 0) return [];

    const recipeIds = joinRows.map((r) => r.recipeId);
    const recipeRows = await db
      .select()
      .from(recipes)
      .where(inArray(recipes.id, recipeIds))
      .orderBy(desc(recipes.createdAt));

    return attachCollections(recipeRows);
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
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    if (!recipe) return null;

    if (input.collectionId !== undefined) {
      await db
        .delete(recipeCollections)
        .where(eq(recipeCollections.recipeId, id));
      if (input.collectionId !== null) {
        await db.insert(recipeCollections).values({
          recipeId: id,
          collectionId: input.collectionId,
        });
      }
    }

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
    await db
      .delete(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, id));
    await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    await db
      .delete(recipeSourcePages)
      .where(eq(recipeSourcePages.recipeId, id));
    await db
      .delete(recipeCollections)
      .where(eq(recipeCollections.recipeId, id));
    const [deleted] = await db
      .delete(recipes)
      .where(eq(recipes.id, id))
      .returning();
    return deleted ?? null;
  },

  async assignToCollection(recipeId: string, collectionId: string) {
    await db
      .delete(recipeCollections)
      .where(eq(recipeCollections.recipeId, recipeId));
    await db.insert(recipeCollections).values({ recipeId, collectionId });
    const [recipe] = await db
      .update(recipes)
      .set({ updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .returning();
    return recipe ?? null;
  },

  async removeFromCollection(recipeId: string) {
    await db
      .delete(recipeCollections)
      .where(eq(recipeCollections.recipeId, recipeId));
    const [recipe] = await db
      .update(recipes)
      .set({ updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .returning();
    return recipe ?? null;
  },

  async setRating(recipeId: string, ratingHalfSteps: number | null) {
    const [recipe] = await db
      .update(recipes)
      .set({ ratingHalfSteps, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .returning();
    return recipe ?? null;
  },
};
