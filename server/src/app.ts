import "dotenv/config";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { draftsRoutes } from "./api/drafts.routes.js";
import { recipesRoutes } from "./api/recipes.routes.js";

const app = Fastify({ logger: true });

app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
app.register(draftsRoutes);
app.register(recipesRoutes);

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
