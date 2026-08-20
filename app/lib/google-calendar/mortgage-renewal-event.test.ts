import { describe, expect, it } from "vitest";
import { buildMortgageRenewalEventPayload, type ServerContactRow } from "./service";

const contact: ServerContactRow = {
  id: "11111111-1111-4111-8111-111111111111",
  first_name: "Jean",
  last_name: "Tremblay",
  phone: "514-555-1234",
  email: "jean@example.ca",
  birth_date: null,
  mortgage_renewal_date: "2029-10-15",
  civic_number: "",
  address: "",
  apartment: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
  broker: "unassigned",
  client_type: null,
  priority: null,
  status: "active",
  source: "manual",
  last_contact_date: null,
  next_follow_up_date: null,
  google_calendar_event_id: null,
  google_calendar_event_broker: null,
  google_calendar_sync_status: "synced",
  google_calendar_last_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("événements de renouvellement hypothécaire Google", () => {
  it("crée un événement unique toute la journée dans chacun des trois agendas", () => {
    for (const broker of ["france", "maxime", "sandrine"] as const) {
      const payload = buildMortgageRenewalEventPayload(contact, broker);
      expect(payload.summary).toBe("🏠 Renouvellement hypothécaire — Jean Tremblay");
      expect(payload.start.date).toBe("2029-10-15");
      expect(payload.end.date).toBe("2029-10-16");
      expect(payload.recurrence).toBeUndefined();
      expect(payload.extendedProperties?.private.crmBroker).toBe(broker);
      expect(payload.transparency).toBe("transparent");
      expect(payload.visibility).toBe("private");
      expect(payload.reminders).toEqual({ useDefault: true });
    }
  });

  it("décrit la date, les coordonnées et le courtier CRM sans exiger une attribution", () => {
    const payload = buildMortgageRenewalEventPayload(contact, "france");
    expect(payload.description).toContain("Date : 15 octobre 2029");
    expect(payload.description).toContain("Téléphone : 514-555-1234");
    expect(payload.description).toContain("Email : jean@example.ca");
    expect(payload.description).toContain("Courtier CRM : Non attribué");
  });
});
