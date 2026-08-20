import { describe, expect, it } from "vitest";
import { buildBirthdayEventPayload, nextBirthdayOccurrence, type ServerContactRow } from "./service";

const contact: ServerContactRow = {
  id: "11111111-1111-4111-8111-111111111111", first_name: "Jay", last_name: "Jugbandhan",
  phone: "514-555-1234", email: "jay@example.ca", birth_date: "1975-10-06",
  mortgage_renewal_date: null,
  civic_number: "", address: "", apartment: "", city: "", province: "", postal_code: "", country: "",
  broker: "unassigned", client_type: null, priority: null, status: "active", source: "csv",
  last_contact_date: null, next_follow_up_date: null, google_calendar_event_id: null,
  google_calendar_event_broker: null, google_calendar_sync_status: "synced", google_calendar_last_error: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

describe("événements anniversaire Google", () => {
  it("crée une série annuelle toute la journée sans fin pour chaque courtier", () => {
    for (const broker of ["france", "maxime", "sandrine"] as const) {
      const payload = buildBirthdayEventPayload(contact, broker, undefined, "2026-08-19");
      expect(payload.start.date).toBe("2026-10-06");
      expect(payload.recurrence).toEqual(["RRULE:FREQ=YEARLY"]);
      expect(payload.extendedProperties?.private.crmBroker).toBe(broker);
      expect(payload.transparency).toBe("transparent");
      expect(payload.reminders).toEqual({ useDefault: true });
    }
  });

  it("inclut aujourd’hui et reporte une date passée à l’année suivante", () => {
    expect(nextBirthdayOccurrence("1975-10-06", "2026-10-06")).toBe("2026-10-06");
    expect(nextBirthdayOccurrence("1975-10-06", "2026-10-07")).toBe("2027-10-06");
  });

  it("applique le dernier jour de février aux personnes nées le 29", () => {
    const leapContact = { ...contact, birth_date: "1988-02-29" };
    expect(nextBirthdayOccurrence(leapContact.birth_date, "2026-01-01")).toBe("2026-02-28");
    expect(nextBirthdayOccurrence(leapContact.birth_date, "2028-01-01")).toBe("2028-02-29");
    expect(buildBirthdayEventPayload(leapContact, "france", undefined, "2026-01-01").recurrence)
      .toEqual(["RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"]);
  });
});
