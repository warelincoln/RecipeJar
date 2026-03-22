import { eq, desc } from "drizzle-orm";
import { db } from "./db.js";
import { recipes, recipeNotes } from "./schema.js";

async function touchRecipeUpdatedAt(recipeId: string) {
  await db
    .update(recipes)
    .set({ updatedAt: new Date() })
    .where(eq(recipes.id, recipeId));
}

export const recipeNotesRepository = {
  async listByRecipeId(recipeId: string) {
    return db.query.recipeNotes.findMany({
      where: eq(recipeNotes.recipeId, recipeId),
      orderBy: [desc(recipeNotes.createdAt)],
    });
  },

  async findById(noteId: string) {
    return (
      db.query.recipeNotes.findFirst({
        where: eq(recipeNotes.id, noteId),
      }) ?? null
    );
  },

  async create(recipeId: string, text: string) {
    const [note] = await db
      .insert(recipeNotes)
      .values({ recipeId, text })
      .returning();
    await touchRecipeUpdatedAt(recipeId);
    return note;
  },

  async update(noteId: string, text: string) {
    const [updated] = await db
      .update(recipeNotes)
      .set({ text, updatedAt: new Date() })
      .where(eq(recipeNotes.id, noteId))
      .returning();
    if (updated) {
      await touchRecipeUpdatedAt(updated.recipeId);
    }
    return updated ?? null;
  },

  async delete(noteId: string) {
    const note = await db.query.recipeNotes.findFirst({
      where: eq(recipeNotes.id, noteId),
    });
    if (!note) return null;
    await db.delete(recipeNotes).where(eq(recipeNotes.id, noteId));
    await touchRecipeUpdatedAt(note.recipeId);
    return note;
  },
};
