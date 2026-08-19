import { afterEach, describe, expect, it, vi } from "vitest";

const contactRows = Array.from({ length: 702 }, (_, index) => ({
  id: `contact-${index + 1}`,
  first_name: `Contact ${index + 1}`,
  civic_number: String(index + 1),
  address: "rue Principale",
  apartment: "",
  city: "Deux-Montagnes",
  province: "QC",
  postal_code: "J7R 1A1",
  country: "Canada",
}));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: null })),
}));

vi.mock("../../../lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === "contacts") {
        return {
          select: () => ({
            order: async () => ({ data: contactRows, error: null }),
          }),
        };
      }
      if (table === "contact_addresses") {
        return {
          select: () => ({
            in: async () => ({
              data: null,
              error: new Error("panne simulée de contact_addresses"),
            }),
          }),
        };
      }
      throw new Error(`Table inattendue dans le test: ${table}`);
    },
  })),
}));

import { GET } from "./route";

describe("GET resource=contacts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retourne 702 contacts avec statut 200 si l’historique des adresses échoue", async () => {
    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("http://localhost/api/crm/data?resource=contacts"));
    const payload = await response.json() as { data: typeof contactRows };

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(702);
    expect(payload.data[0]).toMatchObject({
      civic_number: "1",
      address: "rue Principale",
      city: "Deux-Montagnes",
    });
    expect(serverLog).toHaveBeenCalledWith(
      "Chargement de l'historique des adresses impossible:",
      "panne simulée de contact_addresses",
    );
  });
});
