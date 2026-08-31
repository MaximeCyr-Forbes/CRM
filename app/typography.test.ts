import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("typographie de marque du CRM", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const layout = readFileSync("app/layout.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  it("bundle Inter Variable depuis Fontsource et l’importe globalement", () => {
    expect(packageJson.dependencies?.["@fontsource-variable/inter"]).toBeTruthy();
    expect(layout).toContain('import "@fontsource-variable/inter";');
  });

  it("centralise les familles et applique Inter au body", () => {
    expect(css).toContain('--font-sans: "Inter Variable", "Inter", Arial, sans-serif;');
    expect(css).toContain('--font-serif: Georgia, "Times New Roman", serif;');
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-family:\s*inherit/);
  });

  it("n’utilise aucun service de police externe ni pile système prioritaire", () => {
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(css).not.toMatch(/font-family:\s*(?:Inter,\s*)?(?:ui-sans-serif|system-ui|-apple-system|BlinkMacSystemFont|"Segoe UI")/);
  });
});
