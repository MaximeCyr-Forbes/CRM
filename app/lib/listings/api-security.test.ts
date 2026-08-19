import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("sécurité et activation différée des Listings", () => {
  it("protège toutes les routes et impose same-origin aux écritures", () => {
    const collectionRoute = source("app/api/listings/route.ts");
    const detailRoute = source("app/api/listings/[listingId]/route.ts");
    expect(collectionRoute).toContain("requireApiAccess()");
    expect(detailRoute).toContain("requireApiAccess()");
    expect(collectionRoute).toContain("isSameOriginRequest(request)");
    expect(detailRoute.match(/isSameOriginRequest\(request\)/g)).toHaveLength(2);
  });

  it("garde service_role dans la couche serveur et hors du contexte navigateur", () => {
    const context = source("app/listings-context.tsx");
    const persistence = source("app/lib/listings/persistence.ts");
    expect(context).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(context).not.toContain("getSupabaseAdmin");
    expect(persistence).toContain("getSupabaseAdmin");
  });

  it("ne monte pas encore ListingsProvider et ne crée aucune page visible", () => {
    expect(source("app/layout.tsx")).not.toContain("ListingsProvider");
    expect(existsSync(resolve(root, "app", "listings", "page.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "app", "listings", "[listingId]", "page.tsx"))).toBe(false);
  });

  it("ne modifie ni la navigation, ni le dashboard, ni les interfaces Transactions", () => {
    expect(source("app/data/software-links.ts")).not.toContain('"Listings"');
    expect(source("app/components/app-header.tsx")).not.toContain('href: "/listings"');
    expect(source("app/dashboard/page.tsx")).toContain("Vendeurs actifs");
  });
});
