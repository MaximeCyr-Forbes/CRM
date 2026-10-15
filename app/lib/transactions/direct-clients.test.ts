import { describe, expect, it } from "vitest";
import { directClientDuplicates, directClientToday, parseDirectClient, type DirectClient } from "./direct-clients";
const row = { ...parseDirectClient({ name: "Personne exemple", email: "Test@example.invalid", phone: "514-555-0101" }), id: "client-a" } as DirectClient;
describe("direct client validation and duplicates", () => {
  it("accepts name only and nullable optional fields", () => expect(parseDirectClient({ name: " Exemple " })).toEqual({ name: "Exemple", phone: null, email: null, source: null, request_date: null, request_note: null }));
  it.each([null, [], {}, { name: " " }, { name: "a", email: "bad" }, { name: "a", request_date: "2026-02-30" }, { name: "a", phone: 123 }, { name: "a", request_note: "x".repeat(4001) }])("rejects invalid draft %j", value => expect(() => parseDirectClient(value)).toThrow());
  it("preserves display phone and email while trimming", () => expect(parseDirectClient({ name: "Example", phone: " (514) 555-0101 ", email: " Test@example.invalid " })).toMatchObject({ phone: "(514) 555-0101", email: "Test@example.invalid" }));
  it("compares email case insensitively", () => expect(directClientDuplicates([row], parseDirectClient({ name: "Other", email: " TEST@EXAMPLE.INVALID " }))).toHaveLength(1));
  it.each(["(514) 555-0101", "+1 514 555 0101"])("normalizes phone %s", phone => expect(directClientDuplicates([row], parseDirectClient({ name: "Other", phone }))).toHaveLength(1));
  it("does not match empty coordinates or the edited record", () => { expect(directClientDuplicates([row], parseDirectClient({ name: "Other" }))).toEqual([]); expect(directClientDuplicates([row], row, row.id)).toEqual([]); });
  it("uses browser calendar date", () => expect(directClientToday(new Date(2026, 9, 15, 0, 1))).toBe("2026-10-15"));
  it("ignores client-supplied audit and transaction fields", () => expect(parseDirectClient({ name: "Example", created_by: "intruder", transaction_id: "other" })).not.toHaveProperty("created_by"));
});
