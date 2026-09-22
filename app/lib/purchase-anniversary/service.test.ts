import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomaticEmailRule } from "../../data/automatic-email-types";
import type { BirthdayContact } from "../birthday-greetings/model";
import type { PurchaseGreeting, PurchaseTransaction } from "./model";
const state = vi.hoisted(() => ({ contacts: [] as BirthdayContact[], transactions: [] as PurchaseTransaction[], links: [] as { transaction_id: string; contact_id: string }[], rules: [] as AutomaticEmailRule[], rows: [] as PurchaseGreeting[], send: vi.fn(), sender: vi.fn(), persistFails: false }));
vi.mock("../automatic-emails/persistence", () => ({ listAutomaticEmailRules: async () => structuredClone(state.rules) }));
vi.mock("../google-gmail/service", async original => ({ ...await original<typeof import("../google-gmail/service")>(), prepareGmailSender: state.sender, sendPreparedGmailMessage: state.send }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({
  rpc: async (_name: string, p: Record<string, string>) => {
    const old = state.rows.find(r => r.transaction_id === p.p_transaction_id && r.contact_id === p.p_contact_id && r.occurrence_date === p.p_occurrence);
    if (old && (old.status !== "failed" || (p.p_action === "auto" && old.automatic_attempted_at))) return { data: [] };
    const row = old ?? { id: `${p.p_transaction_id}:${p.p_contact_id}`, transaction_id: p.p_transaction_id, contact_id: p.p_contact_id, occurrence_date: p.p_occurrence, automatic_attempted_at: null } as PurchaseGreeting;
    Object.assign(row, { status: p.p_action === "done" ? "manual_done" : p.p_action === "auto" ? "auto_sending" : "manual_sending", attempt_token: crypto.randomUUID() });
    if (p.p_action === "auto") row.automatic_attempted_at = new Date().toISOString();
    if (!old) state.rows.push(row);
    return { data: [structuredClone(row)] };
  },
  from: (table: string) => {
    let filters: Array<[string, unknown]> = []; let update: Record<string, unknown> | null = null;
    const q: any = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q; }, not: () => q, order: () => q, range: () => q,
      update: (v: Record<string, unknown>) => { update = v; return q; },
      then: (resolve: (v: unknown) => unknown) => resolve(result(false)), single: async () => result(true), maybeSingle: async () => result(true),
    };
    function result(single: boolean) {
      const rows = (table === "contacts" ? state.contacts : table === "transactions" ? state.transactions : table === "transaction_contacts" ? state.links : state.rows).filter(r => filters.every(([k,v]) => (r as any)[k] === v));
      if (update && state.persistFails) return { data: null, error: new Error("DB failed") };
      if (update) rows.forEach(r => Object.assign(r, update));
      return { data: single ? structuredClone(rows[0]) : structuredClone(rows) };
    }
    return q;
  },
}) }));
import { actOnPurchase, runPurchaseAnniversaryFallback } from "./service";
import { birthdayClock, birthdaySender, renderBirthday } from "../birthday-greetings/model";
import { GmailSendError, GmailSendUncertainError } from "../google-gmail/service";
const contact: BirthdayContact = { id: "one", first_name: "Marie-Claude", last_name: "Exemple", email: "qa@example.com", broker: "france", birth_date: "1980-09-22" };
const rule = { id: "rule", ruleType: "purchase_anniversary", defaultBroker: "maxime", subjectTemplate: "Bonne fête {{firstName}}", bodyTemplate: "Bonjour {{firstName}},", triggerConfig: { purchaseAnniversaryFallbackEnabled: true } } as AutomaticEmailRule;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T21:00:00Z"));
  state.contacts = [{ ...contact }]; state.transactions = [{ id: "purchase", type: "purchase", address: "10 rue Exemple", notary_date: "2025-09-22", purchase_finalized_at: "2025-09-22T12:00:00Z" }]; state.links = [{ transaction_id: "purchase", contact_id: "one" }]; state.rules = [structuredClone(rule)]; state.rows = []; state.persistFails = false;
  state.sender.mockReset().mockImplementation(async broker => ({ connection: { broker }, identity: { signature: `<b>${broker}</b>` } }));
  state.send.mockReset().mockResolvedValue({ id: "gmail-one" });
});
afterEach(() => vi.useRealTimers());
describe("purchase anniversary workflow", () => {
  it.each(["france","maxime","sandrine"] as const)("uses assigned %s independently of default", broker => expect(birthdaySender({ ...contact, broker }, rule)).toBe(broker));
  it("uses default only for unassigned", () => expect(birthdaySender({ ...contact, broker: "unassigned" }, rule)).toBe("maxime"));
  it("renders the real first name", () => expect(renderBirthday(contact, rule).message).toBe("Bonjour Marie-Claude,"));
  it.each(["", "undefined", "null"])("rejects invalid first name %s", first_name => expect(() => renderBirthday({ ...contact, first_name }, rule)).toThrow());
  it.each(["{{unknown}}", "{{unknown-var}}", "{{constructor}}", "{{toString}}"])("rejects invalid variable %s", bodyTemplate => expect(() => renderBirthday(contact, { ...rule, bodyTemplate })).toThrow());
  it.each([["2026-09-22T20:59:00Z",false],["2026-09-22T21:00:00Z",true],["2026-12-22T21:59:00Z",false],["2026-12-22T22:00:00Z",true]])("Toronto clock including DST %s", (instant,expected) => expect(birthdayClock(new Date(instant as string)).afterFive).toBe(expected));
  it("Done sends nothing and suppresses cron globally", async () => { await actOnPurchase("purchase", "one","done","immoplus"); await runPurchaseAnniversaryFallback(); expect(state.rows[0].status).toBe("manual_done"); expect(state.send).not.toHaveBeenCalled(); });
  it("manual works with toggle off and preserves signature", async () => { state.rules[0].triggerConfig.purchaseAnniversaryFallbackEnabled=false; await actOnPurchase("purchase", "one","manual","immoplus"); expect(state.send).toHaveBeenCalledTimes(1); expect(state.send.mock.calls[0][0].identity.signature).toBe("<b>france</b>"); expect(state.rows[0]).toMatchObject({ status:"manual_email_sent",gmail_message_id:"gmail-one",sender_broker:"france" }); });
  it("OFF and before five send nothing", async () => { state.rules[0].triggerConfig.purchaseAnniversaryFallbackEnabled=false; await runPurchaseAnniversaryFallback(); state.rules[0].triggerConfig.purchaseAnniversaryFallbackEnabled=true; vi.setSystemTime(new Date("2026-09-22T20:59:00Z")); await runPurchaseAnniversaryFallback(); expect(state.send).not.toHaveBeenCalled(); });
  it("ON after five sends once across repeated cron", async () => { await runPurchaseAnniversaryFallback(); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); expect(state.rows[0].status).toBe("auto_email_sent"); });
  it("does not send a second after manual", async () => { await actOnPurchase("purchase", "one","manual","maxime"); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); });
  it("one winner manual versus cron and double click", async () => { await Promise.all([actOnPurchase("purchase", "one","manual","france"),runPurchaseAnniversaryFallback(),actOnPurchase("purchase", "one","manual","france")]); expect(state.send).toHaveBeenCalledTimes(1); });
  it("Done versus cron has one winner", async () => { await Promise.all([actOnPurchase("purchase", "one","done","france"),runPurchaseAnniversaryFallback()]); expect(state.rows).toHaveLength(1); expect(state.send.mock.calls.length).toBeLessThanOrEqual(1); });
  it("unassigned auto uses default", async () => { state.contacts[0].broker="unassigned"; await runPurchaseAnniversaryFallback(); expect(state.sender).toHaveBeenCalledWith("maxime"); });
  it("stops remaining sends when OFF changes during batch", async () => { state.contacts.push({ ...contact,id:"two" }); state.links.push({ transaction_id: "purchase", contact_id: "two" }); state.send.mockImplementation(async () => { state.rules[0].triggerConfig.purchaseAnniversaryFallbackEnabled=false; return { id:"gmail-one" }; }); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); });
  it("checks OFF again after preparing Gmail", async () => { state.sender.mockImplementation(async () => { state.rules[0].triggerConfig.purchaseAnniversaryFallbackEnabled=false; return {}; }); await runPurchaseAnniversaryFallback(); expect(state.send).not.toHaveBeenCalled(); });
  it("failed auto is never retried automatically", async () => { state.send.mockRejectedValue(new GmailSendError("Refus")); await runPurchaseAnniversaryFallback(); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); expect(state.rows[0].status).toBe("failed"); });
  it("definite failure can be retried manually", async () => { state.send.mockRejectedValueOnce(new GmailSendError("Refus")); await runPurchaseAnniversaryFallback(); await actOnPurchase("purchase", "one","manual","france"); expect(state.send).toHaveBeenCalledTimes(2); });
  it("uncertain response blocks both retries", async () => { state.send.mockRejectedValueOnce(new GmailSendUncertainError()); await runPurchaseAnniversaryFallback(); await actOnPurchase("purchase", "one","manual","france"); await runPurchaseAnniversaryFallback(); expect(state.rows[0].status).toBe("uncertain"); expect(state.send).toHaveBeenCalledTimes(1); });
  it("accepted Gmail plus DB failure retains sending claim", async () => { state.send.mockImplementation(async () => { state.persistFails=true; return { id:"accepted" }; }); await runPurchaseAnniversaryFallback(); state.persistFails=false; await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); expect(state.rows[0].status).toBe("auto_sending"); });
  it("missing email or disconnected Gmail does not send", async () => { state.contacts[0].email=""; await runPurchaseAnniversaryFallback(); expect(state.send).not.toHaveBeenCalled(); state.rows=[]; state.contacts[0].email=contact.email; state.sender.mockRejectedValue(new Error("Déconnecté")); await runPurchaseAnniversaryFallback(); expect(state.send).not.toHaveBeenCalled(); });
  it("never backfills yesterday", async () => { vi.setSystemTime(new Date("2026-09-23T21:00:00Z")); await runPurchaseAnniversaryFallback(); expect(state.send).not.toHaveBeenCalled(); });
  it("rejects a manual action outside the birthday", async () => { state.transactions[0].notary_date="2025-09-21"; await expect(actOnPurchase("purchase", "one","done","maxime")).rejects.toThrow(); expect(state.rows).toHaveLength(0); });
});

describe("purchase eligibility and independent occurrences", () => {
  it.each([{ type:"sale" }, { purchase_finalized_at:null }, { notary_date:null }, { notary_date:"2026-09-22" }])("rejects ineligible transaction %j", async patch => { Object.assign(state.transactions[0],patch); await expect(actOnPurchase("purchase","one","manual","maxime")).rejects.toThrow(); expect(state.send).not.toHaveBeenCalled(); });
  it("rejects an unlinked contact", async () => { state.links=[]; await expect(actOnPurchase("purchase","one","done","maxime")).rejects.toThrow(); });
  it("sends to each linked contact exactly once", async () => { state.contacts.push({ ...contact,id:"two" }); state.links.push({ transaction_id:"purchase",contact_id:"two" }); await runPurchaseAnniversaryFallback(); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(2); });
  it("keeps two purchases for the same contact distinct", async () => { state.transactions.push({ ...state.transactions[0],id:"second" }); state.links.push({ transaction_id:"second",contact_id:"one" }); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(2); });
  it("does not use birthday switch", async () => { state.rules.push({ ...rule,id:"birthday",ruleType:"birthday",triggerConfig:{ birthdayFallbackEnabled:false } }); await runPurchaseAnniversaryFallback(); expect(state.send).toHaveBeenCalledTimes(1); });
  it("uses notary date in the actual template", async () => { state.rules[0].bodyTemplate="Bonjour {{firstName}}, achat du {{purchaseDate}}"; await actOnPurchase("purchase","one","manual","maxime"); expect(state.send.mock.calls[0][1].message).toContain("22 septembre 2025"); });
  it("rechecks link after sender preparation", async () => { state.sender.mockImplementation(async () => { state.links=[]; return {}; }); await expect(actOnPurchase("purchase","one","manual","maxime")).rejects.toThrow(); expect(state.send).not.toHaveBeenCalled(); });
});
