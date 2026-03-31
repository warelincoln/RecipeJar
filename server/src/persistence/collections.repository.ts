import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { collections } from "./schema.js";

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

  async update(id: string, name: string) {
    const [row] = await db
      .update(collections)
      .set({ name, updatedAt: new Date() })
      .where(eq(collections.id, id))
      .returning();
    return row ?? null;
  },

  async delete(id: string) {
    await db.delete(collections).where(eq(collections.id, id));
  },
};
