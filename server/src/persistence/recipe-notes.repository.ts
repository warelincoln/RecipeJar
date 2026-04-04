import { eq, and, desc } from "drizzle-orm";
import { db } from "./db.js";
import { recipes, recipeNotes } from "./schema.js";

async function touchRecipeUpdatedAt(recipeId: string) {
  await db
    .update(recipes)
    .set({ updatedAt: new Date() })
    .where(eq(recipes.id, recipeId));
}

export const recipeNotesRepository = {
  async listByRecipeId(recipeId: string, userId: string) {
    return db.query.recipeNotes.findMany({
      where: and(
        eq(recipeNotes.recipeId, recipeId),
        eq(recipeNotes.userId, userId),
      ),
      orderBy: [desc(recipeNotes.createdAt)],
    });
  },

  async findById(noteId: string, userId: string) {
    return (
      (await db.query.recipeNotes.findFirst({
        where: and(
          eq(recipeNotes.id, noteId),
          eq(recipeNotes.userId, userId),
        ),
      })) ?? null
    );
  },

  async create(recipeId: string, text: string, userId: string) {
    const [note] = await db
      .insert(recipeNotes)
      .values({ recipeId, text, userId })
      .returning();
    await touchRecipeUpdatedAt(recipeId);
    return note;
  },

  async update(noteId: string, text: string, userId: string) {
    const [updated] = await db
      .update(recipeNotes)
      .set({ text, updatedAt: new Date() })
      .where(and(eq(recipeNotes.id, noteId), eq(recipeNotes.userId, userId)))
      .returning();
    if (updated) {
      await touchRecipeUpdatedAt(updated.recipeId);
    }
    return updated ?? null;
  },

  async delete(noteId: string, userId: string) {
    const note = await db.query.recipeNotes.findFirst({
      where: and(eq(recipeNotes.id, noteId), eq(recipeNotes.userId, userId)),
    });
    if (!note) return null;
    await db.delete(recipeNotes).where(eq(recipeNotes.id, noteId));
    await touchRecipeUpdatedAt(note.recipeId);
    return note;
  },
};
