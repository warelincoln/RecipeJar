import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { collections, recipes } from "./schema.js";

export const collectionsRepository = {
  async create(name: string) {
    const [collection] = await db
      .insert(collections)
      .values({ name })
      .returning();
    return collection;
  },

  async list() {
    return db.query.collections.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  },

  async findById(id: string) {
    return db.query.collections.findFirst({
      where: eq(collections.id, id),
    });
  },

  async delete(id: string) {
    await db
      .update(recipes)
      .set({ collectionId: null })
      .where(eq(recipes.collectionId, id));
    await db.delete(collections).where(eq(collections.id, id));
  },
};
