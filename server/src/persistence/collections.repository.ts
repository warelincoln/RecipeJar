import { eq, and } from "drizzle-orm";
import { db } from "./db.js";
import { collections } from "./schema.js";

export const collectionsRepository = {
  async create(name: string, userId: string) {
    const [collection] = await db
      .insert(collections)
      .values({ name, userId })
      .returning();
    return collection;
  },

  async list(userId: string) {
    return db.query.collections.findMany({
      where: eq(collections.userId, userId),
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  },

  async findById(id: string, userId: string) {
    return db.query.collections.findFirst({
      where: and(eq(collections.id, id), eq(collections.userId, userId)),
    });
  },

  async update(id: string, name: string, userId: string) {
    const [row] = await db
      .update(collections)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();
    return row ?? null;
  },

  async delete(id: string, userId: string) {
    await db
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)));
  },
};
