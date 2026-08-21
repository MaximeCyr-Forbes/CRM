import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("sécurité et activation visuelle des Listings", () => {
  it("protège toutes les routes et impose same-origin aux écritures", () => {
    const collectionRoute = source("app/api/listings/route.ts");
    const detailRoute = source("app/api/listings/[listingId]/route.ts");
    const completeSaleRoute = source("app/api/listings/[listingId]/complete-sale/route.ts");
    expect(collectionRoute).toContain("requireApiAccess()");
    expect(detailRoute).toContain("requireApiAccess()");
    expect(collectionRoute).toContain("isSameOriginRequest(request)");
    expect(detailRoute.match(/isSameOriginRequest\(request\)/g)).toHaveLength(2);
    expect(completeSaleRoute).toContain("requireApiAccess()");
    expect(completeSaleRoute).toContain("isSameOriginRequest(request)");
    expect(completeSaleRoute).toContain("parseListingSaleCompletion");
  });

  it("garde service_role dans la couche serveur et hors du contexte navigateur", () => {
    const context = source("app/listings-context.tsx");
    const persistence = source("app/lib/listings/persistence.ts");
    expect(context).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(context).not.toContain("getSupabaseAdmin");
    expect(persistence).toContain("getSupabaseAdmin");
  });

  it("monte ListingsProvider et conserve la fiche sous le layout privé", () => {
    expect(source("app/layout.tsx")).toContain("ListingsProvider");
    expect(existsSync(resolve(root, "app", "listings", "page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app", "listings", "[listingId]", "page.tsx"))).toBe(true);
  });

  it("active la navigation et le dashboard sans intégrer Listings aux Transactions", () => {
    expect(source("app/data/software-links.ts")).toContain('"Listings"');
    expect(source("app/components/app-header.tsx")).toContain('href: "/listings"');
    expect(source("app/dashboard/page.tsx")).toContain("Listings actifs");
    expect(source("app/transactions/page.tsx")).not.toContain("useListings");
  });
});
