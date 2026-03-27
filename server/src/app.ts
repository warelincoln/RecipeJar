import "dotenv/config";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { URL_IMPORT_HTML_MAX_BYTES } from "@recipejar/shared";
import { draftsRoutes } from "./api/drafts.routes.js";
import { recipesRoutes } from "./api/recipes.routes.js";
import { collectionsRoutes } from "./api/collections.routes.js";

const app = Fastify({
  logger: true,
  bodyLimit: URL_IMPORT_HTML_MAX_BYTES + 64 * 1024,
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
app.register(draftsRoutes);
app.register(recipesRoutes);
app.register(collectionsRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = parseInt(process.env.PORT ?? "3000", 10);

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);
});

export default app;
