import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/vinext/dist/shims/server-only.js", import.meta.url)), "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
