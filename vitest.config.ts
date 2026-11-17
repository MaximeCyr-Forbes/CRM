import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "next/navigation": fileURLToPath(new URL("./node_modules/vinext/dist/shims/navigation.js", import.meta.url)), "server-only": fileURLToPath(new URL("./node_modules/vinext/dist/shims/server-only.js", import.meta.url)), "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
