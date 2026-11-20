import { describe, expect, it } from "vitest";
import { effectiveCampaignRecipients, parseCampaignEmails, parseManualRecipients, validCampaignEmail } from "./manual-recipients";
import { renderEmailRecipient } from "../email/template";
const manual = { id: "11111111-1111-4111-8111-111111111111", email: "Test+tag@example.test", firstName: "", lastName: "", broker: null };
describe("manual recipients — no network", () => {
  it.each([",", ";", "\n", "\r\n"])("parses %j separators and preserves mailbox spelling", separator => {
    expect(parseCampaignEmails(` Test+tag@example.test ${separator} b@example.test `).accepted).toEqual(["Test+tag@example.test", "b@example.test"]);
  });
  it("reports duplicates and invalid entries separately", () => {
    expect(parseCampaignEmails("A@example.test;a@EXAMPLE.test;invalid; b@example.test", ["b@example.test"]))
      .toEqual({ accepted: ["A@example.test"], invalid: ["invalid"], duplicates: 2 });
  });
  it("accepts empty bulk input without inventing a recipient", () => expect(parseCampaignEmails(" ;\n").accepted).toEqual([]));
  it.each(["incomplete@", "a@b", "a b@example.test", "a@example.test\r\nBcc:x@example.test"])("rejects %s", email => expect(validCampaignEmail(email)).toBe(false));
  it("allows optional names but validates identity and duplicate addresses on server", () => {
    expect(parseManualRecipients([manual])).toEqual([manual]);
    expect(parseManualRecipients([manual, manual])).toBeNull();
    expect(parseManualRecipients([{ ...manual, id: "invalid" }])).toBeNull();
    expect(parseManualRecipients([{ ...manual, broker: "unassigned" }])).toBeNull();
  });
  it("prefers CRM contact without merging manual names", () => {
    const contact = { id: "contact", firstName: "CRM", lastName: "", email: "TEST+TAG@EXAMPLE.TEST", phone: "", broker: "france" as const, selected: true };
    expect(effectiveCampaignRecipients([contact], [{ ...manual, firstName: "Manual" }])).toEqual([contact]);
    expect(effectiveCampaignRecipients([], [manual])[0]).toMatchObject({ manualRecipientId: manual.id, phone: "", broker: "unassigned" });
  });
  it.each(["firstName", "lastName", "fullName", "phone"])("blocks missing %s", variable => {
    expect(renderEmailRecipient("Message", `Bonjour {{${variable}}}`, manual).blockingReasons.length).toBeGreaterThan(0);
  });
  it("renders email and supplied names", () => {
    const r = renderEmailRecipient("{{email}}", "Bonjour {{fullName}}", { ...manual, firstName: "Marie", lastName: "Test" });
    expect(r.blockingReasons).toEqual([]); expect(r.message).toBe("Bonjour Marie Test");
  });
});
