import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appNavigationOrder } from "../data/software-links";

const source = (path: string) => readFileSync(path, "utf8");

describe("onglet Google Drive", () => {
  it("apparaît dans la navigation à l’emplacement demandé", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions",
      "Calendrier",
      "Drive",
      "Statistiques",
      "Courriels Auto",
      "Logiciels",
      "Paramètres",
    ]);
    expect(source("app/components/app-header.tsx")).toContain('{ label: "Drive", href: "/drive", match: "/drive" }');
  });

  it("offre Picker, racines, navigation interne, recherche et retrait CRM", () => {
    const page = source("app/drive/page.tsx");
    expect(page).toContain("+ AJOUTER UN DOSSIER");
    expect(page).toContain("RECHERCHER DANS DRIVE");
    expect(page).toContain("Fil d’Ariane Google Drive");
    expect(page).toContain("OUVRIR DANS GOOGLE DRIVE");
    expect(page).toContain("EFFACER LA RECHERCHE");
    expect(page).toContain("AbortController");
    expect(page).toContain("Le dossier et ses fichiers resteront intacts dans Google Drive.");
  });

  it("utilise une recherche Google native bornée plutôt qu’un balayage BFS", () => {
    const service = source("app/lib/google-drive/service.ts");
    expect(service).toContain("name contains");
    expect(service).toContain("searchTimeoutMs");
    expect(service).not.toContain("searchScanLimit");
  });

  it("ne contient aucune opération Google Drive destructive", () => {
    const service = source("app/lib/google-drive/service.ts");
    const apiFiles = [
      source("app/api/google-drive/browse/route.ts"),
      source("app/api/google-drive/search/route.ts"),
    ].join("\n");
    expect(service).not.toMatch(/files\.(create|update|delete)/);
    expect(service).not.toMatch(/drive\/v3\/files[^\n]+method:\s*"(?:POST|PATCH|DELETE)"/);
    expect(apiFiles).not.toMatch(/method:\s*"(?:POST|PATCH|DELETE)"/);
  });

  it("bloque côté serveur les dossiers qui ne descendent pas de la racine", () => {
    const service = source("app/lib/google-drive/service.ts");
    const route = source("app/api/google-drive/browse/route.ts");
    expect(service).toContain("resolveAuthorizedFolder");
    expect(service).toContain("GoogleDriveAccessDeniedError");
    expect(route).toContain("instanceof GoogleDriveAccessDeniedError");
    expect(route).toContain("403");
  });
});
