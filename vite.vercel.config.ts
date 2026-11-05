import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext(), tailwindcss(), nitro({
    hooks: {
      async compiled(server) {
        // The brochure is a server asset, never part of the browser bundle.
        const relative = "app/lib/tools/acm/features/reports/assets/equipe-forbes-presentation.pdf";
        const destination = path.join(server.options.output.serverDir, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.resolve(relative), destination);
      },
    },
  })],
});
