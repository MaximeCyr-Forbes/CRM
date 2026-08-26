import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appNavigationOrder } from "../data/software-links";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("header responsive du CRM", () => {
  it("conserve tous les onglets dans leur ordre métier", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions",
      "Calendrier",
      "Statistiques",
      "Courriels Auto",
      "Logiciels",
      "Paramètres",
    ]);
  });

  it("garde le menu Logiciels accessible et positionné depuis son bouton", () => {
    const header = source("app/components/app-header.tsx");
    expect(header).toContain('aria-haspopup="menu"');
    expect(header).toContain("softwareButtonRef");
    expect(header).toContain("navigationRef");
    expect(header).toContain('addEventListener("scroll", positionSoftwareMenu');
    expect(header).toContain("positionSoftwareMenu");
    expect(header).toContain('role="menu"');
    expect(header).toContain('role="menuitem"');
  });

  it("passe à deux rangées sur laptop et limite le défilement à la navigation", () => {
    const css = source("app/globals.css");
    const twoRowMaximumWidth = 1749;
    const twoRowViewports = [1749, 1680, 1600, 1536, 1440, 1366, 1280, 1180, 1024, 900];
    expect(css).toContain(`@media (max-width: ${twoRowMaximumWidth}px)`);
    expect(twoRowViewports.every((width) => width <= twoRowMaximumWidth)).toBe(true);
    expect([1920, 2560].every((width) => width > twoRowMaximumWidth)).toBe(true);
    expect(css).toContain("grid-template-rows: auto auto");
    expect(css).toContain(".app-header-links button {\n    flex: 0 0 auto;");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scrollbar-width: none");
  });

  it("intègre Accès équipe aux outils sans position fixe", () => {
    const header = source("app/components/app-header.tsx");
    const layout = source("app/components/private-route-layout.tsx");
    const css = source("app/globals.css");
    expect(header).toContain("<AccountMenu />");
    expect(layout).not.toContain("<AccountMenu />");
    expect(css).toContain(".account-menu {\n  position: relative;");
    expect(css).not.toContain(".account-menu {\n  position: fixed;");
  });
});
