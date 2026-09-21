import { describe, expect, it, vi } from "vitest";
vi.mock("./crm-access", () => ({ requireApiAccess: vi.fn(async () => ({ response: null })) }));
vi.mock("./google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => true) }));
const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("./supabase/server", () => ({ getSupabaseAdmin: () => db }));
import { POST as contact } from "../api/crm/data/route";
import { POST as transaction } from "../api/transactions/route";
import { POST as listing } from "../api/listings/route";
function request(body: unknown) { return new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
describe("business APIs reject assistant identity", () => {
  it("rejects Immoplus on contact creation before persistence", async () => {
    const response = await contact(request({ action: "addManualContact", broker: "immoplus", creationKey: "00000000-0000-4000-8000-000000000001", draft: { firstName: "Synthetic" } }));
    expect(response.ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects Immoplus on transaction creation", async () => {
    const response = await transaction(request({ action: "create", draft: { address: "123 rue Synthétique", type: "purchase", status: "new", broker: "immoplus", contactIds: [], price: null, promiseDate: null, generalNotes: "" } }));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects Immoplus on listing creation", async () => {
    const response = await listing(request({ draft: { address: "123 rue Synthétique", broker: "immoplus", status: "preparation", purpose: "sale", propertyType: "residential", civicNumber: "", apartment: "", city: "", province: "", postalCode: "", country: "", centrisNumber: "", centrisUrl: "", publicUrl: "", primaryImageUrl: "", generalNotes: "", ownerContactIds: [], askingPrice: null, monthlyRent: null, listingDate: null, expirationDate: null } }));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
});
