import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@orzo/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        inline: [/mobile/],
      },
    },
  },
});
