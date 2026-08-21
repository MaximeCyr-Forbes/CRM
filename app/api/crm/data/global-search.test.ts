import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({
  contacts: [{
    id: "contact-1", first_name: "Laurier", last_name: "Tremblay", phone: "", email: "",
    civic_number: "", address: "", apartment: "", city: "", province: "", postal_code: "", country: "", broker: "maxime",
  }],
  transactions: [{ id: "transaction-1", address: "12 avenue Laurier", broker: "france", status: "active" }],
  listings: [{
    id: "listing-1", civic_number: "1010", address: "avenue Laurier", apartment: "", city: "Montréal",
    province: "QC", postal_code: "H2J 1G8", country: "Canada", centris_number: "12345678",
    broker: "sandrine", status: "active", purpose: "sale", asking_price: 650000, monthly_rent: null,
    sold_price: null, notary_date: null, collaborating_broker_name: "", property_type: "residential",
    listing_date: null, expiration_date: null, centris_url: "", public_url: "", primary_image_url: "",
    general_notes: "", created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-21T00:00:00.000Z",
  }],
}));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: null })),
}));

function queryResult(data: unknown[]) {
  const query = {
    limit: () => query,
    or: () => query,
    ilike: () => query,
    in: () => query,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

vi.mock("../../../lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => ({
      select: () => queryResult(
        table === "contacts" ? rows.contacts
          : table === "transactions" ? rows.transactions
            : table === "listings" ? rows.listings
              : [],
      ),
    }),
  })),
}));

import { GET } from "./route";

describe("recherche globale des Listings", () => {
  it("retourne Contacts, Listings et Transactions avec un deep link Listing", async () => {
    const response = await GET(new Request("http://localhost/api/crm/data?resource=globalSearch&q=Laurier"));
    const payload = await response.json() as { data: Array<{ id: string; kind: string; title: string; detail: string; href: string }> };

    expect(response.status).toBe(200);
    expect(payload.data.map((result) => result.kind)).toEqual(["contact", "listing", "transaction"]);
    expect(payload.data.find((result) => result.kind === "listing")).toMatchObject({
      id: "listing-1",
      title: "1010 avenue Laurier",
      href: "/listings/listing-1",
    });
    expect(payload.data.find((result) => result.kind === "listing")?.detail).toContain("Centris 12345678");
  });
});
