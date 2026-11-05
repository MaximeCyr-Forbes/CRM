import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomEmailCampaign, CustomEmailCampaignContact, CustomEmailCampaignStep } from "../../data/custom-email-campaign-types";

const state = vi.hoisted(() => ({ bundle: null as unknown, history: [] as any[], send: vi.fn(), sender: vi.fn(), claims: new Set<string>() }));
vi.mock("./custom-campaign-persistence", () => ({ getCustomEmailCampaign: async () => state.bundle }));
vi.mock("./custom-manual-persistence", () => ({
  manualHistory: async () => state.history,
  ensureManualBatch: vi.fn(),
  claimManualRecipient: async (_batch: string, attempt: string, preview: any, recipient: any, retry: boolean) => {
    const key = `${preview.stepId}:${recipient.contactId}`;
    const existing = state.history.find((row) => row.contact_id === recipient.contactId);
    if (retry ? !existing || existing.status !== "failed" || existing.attempt === attempt : state.claims.has(key)) return undefined;
    state.claims.add(key);
    const row = existing ?? { id: recipient.contactId, contact_id: recipient.contactId, step_id: preview.stepId };
    Object.assign(row, { status: recipient.blockingReasons.length ? "blocked" : "pending", attempt });
    if (!existing) state.history.push(row);
    return row.id;
  },
  finishManualRecipient: async (id: string, _attempt: string, status: string, gmail_message_id: string | null) => {
    Object.assign(state.history.find((row) => row.id === id), { status, gmail_message_id });
  },
}));
vi.mock("../google-gmail/service", async (original) => ({ ...await original<typeof import("../google-gmail/service")>(), prepareGmailSender: state.sender, sendPreparedGmailMessage: state.send }));

import { GmailSendError, GmailSendUncertainError } from "../google-gmail/service";
import { prepareManualCampaign, sendManualCampaign, type ManualSendRequest } from "./custom-manual-service";
import { renderManualRecipient, manualSenderBroker } from "./custom-manual-render";

const campaign = { id: "campaign", name: "Test synthétique", status: "ready", executionMode: "automatic", startDate: "2026-09-15", sendHour: 0,
  senderStrategy: "assigned_broker", fixedBroker: null, fallbackBroker: "sandrine" } as CustomEmailCampaign;
const step = { id: "step", campaignId: "campaign", stepOrder: 1, subjectTemplate: "Test {{firstName}}", bodyTemplate: "Bonjour {{firstName}} {{lastName}},\n{{fullName}}" } as CustomEmailCampaignStep;
const contact = { id: "one", firstName: "  Marie-Claude  ", lastName: "  Roy  ", email: "test@example.com", phone: "", broker: "france", selected: true } as CustomEmailCampaignContact;

async function request(retry = false): Promise<ManualSendRequest> {
  const { preview } = await prepareManualCampaign("campaign", "step");
  return { confirmation: "ENVOYER", batchId: "batch", attemptKey: retry ? "retry" : "initial", stepId: "step", retry,
    contactIds: preview.recipients.map((item) => item.contactId), fingerprints: Object.fromEntries(preview.recipients.map((item) => [item.contactId, item.fingerprint])) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden in manual-send tests"); }));
  state.bundle = { campaign: { ...campaign }, steps: [{ ...step }], contacts: [{ ...contact }] };
  state.history = []; state.claims.clear(); state.send.mockReset(); state.sender.mockReset();
  state.sender.mockImplementation(async (broker: string) => ({ connection: { broker }, identity: { sendAsEmail: `${broker}@example.com`, displayName: broker, signature: `<b>${broker}</b>` } }));
  state.send.mockResolvedValue({ id: "gmail-id" });
});

afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("envois manuels personnalisés", () => {
  it.each([
    { startDate: "2099-12-31", sendHour: 23, sendMinute: 59, executionMode: "approval" },
    { startDate: "2000-01-01", sendHour: 0, sendMinute: 1, executionMode: "approval" },
    { startDate: "2099-12-31", sendHour: 23, sendMinute: 59, executionMode: "automatic" },
    { startDate: "2000-01-01", sendHour: 0, sendMinute: 1, executionMode: "automatic" },
  ])("sends immediately only on explicit action regardless of simulation %j", async simulation => {
    Object.assign((state.bundle as any).campaign, simulation);
    const input = await request();
    expect(state.send).not.toHaveBeenCalled();
    await sendManualCampaign("campaign", input);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.history[0].status).toBe("sent");
  });
  it.each(["Jean", "Marie-Claude", "Louis-Philippe", "Éloïse"])("conserve le prénom %s et personnalise nom complet et objet", (firstName) => {
    const rendered = renderManualRecipient(step, { ...contact, firstName: ` ${firstName} ` });
    expect(rendered.subject).toBe(`Test ${firstName}`);
    expect(rendered.message).toBe(`Bonjour ${firstName} Roy,\n${firstName} Roy`);
    expect(rendered.blockingReasons).toEqual([]);
  });
  it.each(["", "   "])("bloque le prénom absent %j", (firstName) => {
    expect(renderManualRecipient(step, { ...contact, firstName }).blockingReasons).toContain("Prénom manquant.");
  });
  it.each(["incorrect", "a@b", "a@example.com\r\nBcc: b@example.com"])("bloque l’adresse invalide %j", (email) => {
    expect(renderManualRecipient(step, { ...contact, email }).blockingReasons.length).toBeGreaterThan(0);
  });
  it("bloque les variables inconnues dans objet et message", () => {
    for (const change of [{ subjectTemplate: "{{unknown}}" }, { bodyTemplate: "{{ unknown-var }}" }, { subjectTemplate: "{{constructor}}" }, { bodyTemplate: "{{toString}}" }]) {
      expect(renderManualRecipient({ ...step, ...change }, contact).blockingReasons).toContain("Variable non résolue.");
    }
  });
  it("résout courtier attribué, fixe et secours sans substitution silencieuse", () => {
    expect(manualSenderBroker(campaign, contact)).toBe("france");
    expect(manualSenderBroker({ ...campaign, senderStrategy: "fixed_broker", fixedBroker: "maxime" }, contact)).toBe("maxime");
    expect(manualSenderBroker(campaign, { ...contact, broker: "unassigned" })).toBe("sandrine");
    expect(manualSenderBroker({ ...campaign, fallbackBroker: null }, { ...contact, broker: "unassigned" })).toBeNull();
  });
  it("une campagne automatic + ready ne produit aucun envoi lors des aperçus", async () => {
    for (let index = 0; index < 10; index++) await prepareManualCampaign("campaign", "step");
    expect(state.send).not.toHaveBeenCalled();
    expect(state.history).toEqual([]);
  });
  it("prépare l’identité et la signature réelles du courtier", async () => {
    const { preview } = await prepareManualCampaign("campaign", "step");
    expect(preview.recipients[0]).toMatchObject({ senderEmail: "france@example.com", senderName: "france" });
    expect(preview.recipients[0].html).toContain("<b>france</b>");
    await sendManualCampaign("campaign", await request());
    expect(state.send.mock.calls[0][0].identity.signature).toBe("<b>france</b>");
  });
  it("bloque un Gmail déconnecté sans choisir un autre courtier", async () => {
    state.sender.mockRejectedValue(new Error("Gmail non connecté."));
    await sendManualCampaign("campaign", await request());
    expect(state.send).not.toHaveBeenCalled();
    expect(state.history[0].status).toBe("blocked");
  });
  it("refuse un contact hors campagne, supprimé ou désélectionné après aperçu", async () => {
    const input = await request();
    (state.bundle as any).contacts = [];
    await expect(sendManualCampaign("campaign", input)).rejects.toThrow(/supprimé ou retiré/);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("refuse un modèle ou une identité modifiés après aperçu", async () => {
    const input = await request();
    (state.bundle as any).steps[0].bodyTemplate = "Modifié";
    await expect(sendManualCampaign("campaign", input)).rejects.toThrow(/changé/);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("protège deux requêtes concurrentes et un nouveau lot après refresh", async () => {
    const input = await request();
    await Promise.all([sendManualCampaign("campaign", input), sendManualCampaign("campaign", input)]);
    await sendManualCampaign("campaign", { ...input, batchId: "another", attemptKey: "another" });
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("conserve deux succès et un échec, puis réessaie seulement l’échec une fois", async () => {
    (state.bundle as any).contacts = [contact, { ...contact, id: "two" }, { ...contact, id: "three" }];
    state.send.mockResolvedValueOnce({ id: "one" }).mockRejectedValueOnce(new GmailSendError("Quota Gmail")).mockResolvedValueOnce({ id: "three" });
    await sendManualCampaign("campaign", await request());
    expect(state.history.map((row) => row.status)).toEqual(["sent", "failed", "sent"]);
    const input = await request(true);
    await sendManualCampaign("campaign", input);
    await sendManualCampaign("campaign", input);
    expect(state.send).toHaveBeenCalledTimes(4);
    expect(state.history.every((row) => row.status === "sent")).toBe(true);
  });
  it("ne réessaie jamais un envoi au résultat inconnu, même manuellement", async () => {
    state.send.mockRejectedValueOnce(new GmailSendUncertainError("Connexion interrompue"));
    await sendManualCampaign("campaign", await request());
    expect(state.history[0].status).toBe("pending");
    await sendManualCampaign("campaign", await request(true));
    expect(state.send).toHaveBeenCalledTimes(1);
  });
});


describe("scale safety — synthetic recipients only, Gmail mocked", () => {
  const names = [["Jean", "Tremblay", "jean"], ["Marie-Claude", "Roy", "marie"], ["François", "Gagnon", "francois"]];
  function setup(contacts: CustomEmailCampaignContact[]) {
    (state.bundle as any).contacts = contacts;
    Object.assign((state.bundle as any).steps[0], { subjectTemplate: "Bonjour {{firstName}}", bodyTemplate: "Bonjour {{firstName}},\n\nVotre nom complet est {{fullName}}." });
  }
  const three = () => names.map(([firstName, lastName, key]) => ({ ...contact, id: `qa-${key}`, firstName, lastName, email: `${key}@example.test` }));
  async function assertRecipients(contacts: CustomEmailCampaignContact[]) {
    setup(contacts);
    const { preview } = await prepareManualCampaign("campaign", "step");
    expect(preview.recipients).toHaveLength(contacts.length);
    expect(new Set(preview.recipients.map(r => r.contactId)).size).toBe(contacts.length);
    const input = await request();
    // Reverse IDs so assertions cannot accidentally depend on recipient array order.
    input.contactIds.reverse();
    await sendManualCampaign("campaign", input);
    expect(state.send).toHaveBeenCalledTimes(contacts.length);
    for (const c of contacts) {
      const expected = { to: c.email, subject: `Bonjour ${c.firstName}`, message: `Bonjour ${c.firstName},\n\nVotre nom complet est ${c.firstName} ${c.lastName}.` };
      const r = preview.recipients.find(r => r.contactId === c.id)!;
      expect(r).toMatchObject(expected); expect(r.blockingReasons).toEqual([]);
      expect(r.subject + r.message).not.toMatch(/\{\{|\}\}/);
      const sends = state.send.mock.calls.filter(call => call[1].to === c.email);
      expect(sends).toHaveLength(1); expect(sends[0][1]).toEqual(expected);
      for (const other of contacts.filter(other => other.firstName !== c.firstName)) {
        expect(r.message).not.toContain(`Bonjour ${other.firstName},`);
        expect(sends[0][1].message).not.toContain(`Bonjour ${other.firstName},`);
      }
    }
  }
  it("personalizes Jean, Marie-Claude and François independently through the real service", async () => { await assertRecipients(three()); });
  it.each([50, 100])("keeps all %i synthetic recipients isolated", async size => {
    await assertRecipients(Array.from({ length: size }, (_, i) => ({ ...contact, id: `qa-${i}`, firstName: `Prénom${String(i).padStart(3, "0")}`, lastName: `Nom${i}`, email: `qa${i}@example.test` })));
  });
  it("keeps identical first names tied to their own IDs, emails and full names", async () => {
    await assertRecipients(three().map(c => ({ ...c, firstName: "Jean" })));
  });
  it("blocks only the recipient missing a first name", async () => {
    const contacts = three(); contacts[1].firstName = ""; setup(contacts);
    const { preview } = await prepareManualCampaign("campaign", "step");
    expect(preview.recipients.map(r => r.blockingReasons.includes("Prénom manquant."))).toEqual([false, true, false]);
    await sendManualCampaign("campaign", await request());
    expect(state.send.mock.calls.map(call => call[1].to)).toEqual([contacts[0].email, contacts[2].email]);
    expect(state.history.find(r => r.contact_id === contacts[1].id).status).toBe("blocked");
  });
  it.each(["firstName", "email", "template", "signature"])("refuses stale preview after %s changes and requires a new one", async field => {
    setup(three()); const input = await request(); const bundle = state.bundle as any;
    if (field === "firstName") bundle.contacts[0].firstName = "Jean-François";
    if (field === "email") bundle.contacts[0].email = "changed@example.test";
    if (field === "template") bundle.steps[0].subjectTemplate = "Nouveau {{firstName}}";
    if (field === "signature") state.sender.mockImplementation(async (broker: string) => ({ connection: { broker }, identity: { sendAsEmail: `${broker}@example.test`, displayName: broker, signature: "Nouvelle signature QA" } }));
    await expect(sendManualCampaign("campaign", input)).rejects.toThrow(/changé/); expect(state.send).not.toHaveBeenCalled();
    await sendManualCampaign("campaign", await request()); expect(state.send).toHaveBeenCalledTimes(3);
  });
  it("never sends an unresolved variable", async () => {
    setup(three()); (state.bundle as any).steps[0].bodyTemplate += " {{unknown}}";
    await sendManualCampaign("campaign", await request());
    expect(state.send).not.toHaveBeenCalled(); expect(state.history.every(r => r.status === "blocked")).toBe(true);
  });
  it("preserves accents, hyphens and all supported contact variables", async () => {
    for (const firstName of ["Éloïse", "Marie-Claude", "Jean-François"]) {
      const c = { ...contact, firstName, lastName: "Roy", email: "qa@example.test", phone: "555-0100" };
      const r = renderManualRecipient({ ...step, subjectTemplate: "Bonjour {{firstName}}", bodyTemplate: "{{firstName}}|{{lastName}}|{{fullName}}|{{email}}|{{phone}}" }, c);
      expect(r.message).toBe(`${firstName}|Roy|${firstName} Roy|qa@example.test|555-0100`); expect(r.blockingReasons).toEqual([]);
    }
  });
});

it('preserves one Gmail signature and Reply-To through the real pipeline',async()=>{
 const broker='france';
 const identity={sendAsEmail:`${broker}@example.test`,replyToAddress:`reply-${broker}@example.test`,signature:`<p>Signature ${broker}</p>`};
 state.sender.mockResolvedValue({identity});
 state.send.mockImplementation(async(sender,message)=>{
  const {buildGmailRawMessage}=await import('../google-gmail/service');
  const mime=Buffer.from(buildGmailRawMessage(message,sender.identity),'base64url').toString();
  expect(mime).toContain(`From: ${broker}@example.test`);expect(mime).toContain(`Reply-To: reply-${broker}@example.test`);
  const html=Buffer.from(mime.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)![1].replace(/\s/g,''),'base64').toString();
  expect(html.split(identity.signature)).toHaveLength(2);expect(mime.match(/^To:/gm)).toHaveLength(1);expect(mime).not.toMatch(/^(Cc|Bcc):/mi);
  return {id:'mock-contract'};
 });
 await sendManualCampaign("campaign",await request());
 expect(state.send).toHaveBeenCalledTimes(1);
});
