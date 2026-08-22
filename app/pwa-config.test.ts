import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function pngSize(path: string) {
  const data = readFileSync(resolve(root, path));
  expect(data.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe("configuration PWA Forbes CRM", () => {
  it("expose un manifest installable commun à iPhone, Android et desktop", () => {
    expect(manifest()).toEqual(expect.objectContaining({
      name: "Forbes CRM",
      short_name: "Forbes CRM",
      description: "CRM immobilier de l’Équipe Forbes",
      start_url: "/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#f6f3eb",
      theme_color: "#13233b",
    }));
    expect(manifest().icons).toEqual([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
    ]);
  });

  it("fournit les trois images aux dimensions exactes", () => {
    expect(pngSize("public/icons/icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/icons/icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });

  it("déclare les métadonnées iOS et le viewport sans changer le titre existant", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toContain('title: "Équipe Forbes | CRM"');
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain('url: "/apple-touch-icon.png"');
    expect(layout).toContain("appleWebApp:");
    expect(layout).toContain('title: "Forbes CRM"');
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('themeColor: "#13233b"');
    expect(layout).toContain('name="apple-mobile-web-app-capable"');
    expect(layout).toContain("viewport-fit=cover");
    expect(source("proxy.ts")).toContain('"/manifest.webmanifest"');
  });

  it("n’ajoute aucun service worker ni cache hors ligne", () => {
    expect(existsSync(resolve(root, "public/sw.js"))).toBe(false);
    expect(existsSync(resolve(root, "public/service-worker.js"))).toBe(false);
    expect(source("app/layout.tsx")).not.toContain("serviceWorker");
  });
});
