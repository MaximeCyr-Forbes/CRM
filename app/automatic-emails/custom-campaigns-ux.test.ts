import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
// All HTTP intercepted: no OAuth, database or Gmail access in this UI harness.
const h = vi.hoisted(() => ({ index: 0, slots: [] as any[], effects: [] as (() => void)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (v: any) => { h.slots[i] = typeof v === "function" ? v(h.slots[i]) : v; }]; },
  useRef(initial: unknown) { const i = h.index++; return h.slots[i] ??= { current: initial }; },
  useMemo: (fn: () => unknown) => fn(),
  useEffect(fn: () => void) { const i = h.index++; if (!(i in h.slots)) { h.slots[i] = true; h.effects.push(fn); } },
}));
import CustomCampaignsSection from "./custom-campaigns-section";
import CustomCampaignManualSend from "./custom-campaign-manual-send";
type Node = ReactElement<any>;
let tree: Node;
let component: () => Node;
const campaign = { id: "local-campaign", name: "Fixture locale", status: "ready", executionMode: "automatic", startDate: "2035-12-17", sendHour: 22, sendMinute: 37, timezone: "America/Toronto", senderStrategy: "fixed_broker", fixedBroker: "maxime", fallbackBroker: null, contactCount: 1, stepCount: 1, durationDays: 0 };
const contact = { id: "local-contact", firstName: "QA", lastName: "Local", email: "qa@example.test", phone: "", broker: "maxime", selected: true };
const step = { id: "local-step", campaignId: campaign.id, stepOrder: 1, delayDaysAfterPrevious: 0, subjectTemplate: "Objet QA", bodyTemplate: "Bonjour {{firstName}}" };
const preview = { campaignId: campaign.id, campaignName: campaign.name, stepId: step.id, stepOrder: 1, recipients: [{ contactId: contact.id, name: "QA Local", to: contact.email, broker: "maxime", senderEmail: "sender@example.test", subject: "Objet QA", html: "<p>Signature QA</p>", blockingReasons: [], deliveryStatus: null, fingerprint: "local-fingerprint" }] };
let manualSent = false;
let deliveryStatus: string | null = null;
let blockingReasons: string[] = [];
let calls: { url: string; method: string; body: any }[];
function render() { h.index = 0; tree = component(); h.effects.splice(0).forEach(fn => fn()); return tree; }
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); render(); }
function nodes(root: any = tree): Node[] { if (Array.isArray(root)) return root.flatMap((child: any) => child == null ? [] : nodes(child)); if (!root || typeof root !== "object" || !root.props) return []; return [root, ...nodes(root.props.children ?? null)]; }
function text(node: any): string { if (Array.isArray(node)) return node.map(text).join(""); if (node == null || typeof node === "boolean") return ""; return typeof node === "object" ? text(node.props?.children) : String(node); }
function button(label: string) { return nodes().find(n => n.type === "button" && text(n) === label)!; }
function input(label: string) { const node = nodes().find(n => n.type === "label" && text(n).startsWith(label)); expect(node).toBeDefined(); return nodes(node).find(n => n.type === "input" || n.type === "select")!; }
async function click(label: string) { const node = button(label); expect(node).toBeDefined(); expect(node.props.disabled).not.toBe(true); node.props.onClick(); await settle(); }
async function edit() { await settle(); await click("CONFIGURER"); }
beforeEach(() => {
  manualSent = false; deliveryStatus = null; blockingReasons = [];
  h.index = 0; h.slots = []; h.effects = []; calls = []; component = CustomCampaignsSection;
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (!url.startsWith("/api/automatic-emails/custom-campaigns")) throw new Error("External network forbidden in QA");
    const history = [{ id: "qa-delivery", recipient_email: contact.email, broker: "maxime", status: "sent", error: null, gmail_message_id: "mock-id" }];
    if (url.includes("/manual-send") && method === "POST") { manualSent = true; return Response.json({ data: history }); }
    const manualPreview = { ...preview, recipients: preview.recipients.map(r => ({ ...r, deliveryStatus: manualSent ? "sent" : deliveryStatus, blockingReasons })) };
    const data = url.includes("/manual-send") ? (url.includes("?stepId=") ? manualPreview : manualSent ? history : []) : url.endsWith("/contacts") ? [contact] : url.includes("/steps") ? step : url.endsWith(campaign.id) ? { campaign, steps: [step] } : method === "POST" ? campaign : { campaigns: [campaign] };
    return Response.json({ data });
  })); render();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("simplifies the card and identifies immediate manual sending", async () => {
  await settle(); const card = nodes().find(n => n.type === "article")!;
  expect(nodes(card).filter(n => n.type === "dt").map(text)).toEqual(["Contacts", "Courriels", "Durée", "Expéditeur"]);
  expect(text(card)).toContain("PRÊTE POUR ENVOI MANUEL"); expect(text(card)).toContain("AUCUN ENVOI AUTOMATIQUE");
  expect(button("ENVOYER MAINTENANT").props.title).toBe("Envoi immédiat après confirmation");
});
it("keeps simulation fields inside a closed native disclosure", async () => {
  await edit(); const details = nodes().find(n => n.type === "details")!;
  expect(details.props.open).toBeUndefined(); expect(text(details)).toContain("Simulation du futur mode automatique");
  expect(text(details)).toContain("n’ont aucun effet sur « Envoyer maintenant »");
  expect(nodes(details).filter(n => n.type === "label").map(text)).toEqual(expect.arrayContaining(["Date simulée", "Heure simulée", expect.stringContaining("Mode futur")]));
  expect(input("Date simulée").props.value).toBe(campaign.startDate); expect(input("Heure simulée").props.value).toBe("22:37"); expect(input("Mode futur").props.value).toBe("automatic");
});
it("saves existing simulation values without opening the disclosure", async () => {
  await edit(); await click("ENREGISTRER"); const patches = calls.filter(c => c.method === "PATCH" && c.url.endsWith(campaign.id));
  expect(patches).toHaveLength(2); for (const patch of patches) expect(patch.body).toMatchObject({ startDate: "2035-12-17", sendHour: 22, sendMinute: 37, executionMode: "automatic" });
  expect(calls.some(c => c.url.includes("manual-send"))).toBe(false);
});
it("retains edited simulation values through other edits and save", async () => {
  await edit(); input("Heure simulée").props.onChange({ target: { value: "07:43" } }); render();
  input("Nom de la campagne").props.onChange({ target: { value: "Nom modifié" } }); render();
  expect(input("Heure simulée").props.value).toBe("07:43"); await click("ENREGISTRER");
  expect(calls.find(c => c.method === "PATCH")?.body).toMatchObject({ sendHour: 7, sendMinute: 43, startDate: campaign.startDate, executionMode: "automatic" });
});
it("preserves defaults when creating a local draft", async () => {
  await settle(); await click("+ NOUVELLE CAMPAGNE"); input("Nom de la campagne").props.onChange({ target: { value: "Nouveau brouillon QA" } }); render(); await click("ENREGISTRER");
  expect(calls.find(c => c.method === "POST")?.body).toMatchObject({ sendHour: 9, sendMinute: 0, executionMode: "approval", startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
});
it("requires checked confirmation before the mocked manual send POST", async () => {
  h.slots = []; h.effects = []; component = () => CustomCampaignManualSend({ campaignId: campaign.id, onClose: vi.fn() }); render(); await settle();
  expect(text(tree)).toContain("Envoi immédiat après confirmation, sans attendre la date ou l’heure simulée");
  expect(calls.filter(c => c.method === "POST")).toHaveLength(0); await click("ENVOYER MAINTENANT");
  expect(button("CONFIRMER ET ENVOYER 1 COURRIEL MAINTENANT").props.disabled).toBe(true); expect(calls.filter(c => c.method === "POST")).toHaveLength(0);
  input("Je confirme l’envoi manuel immédiat").props.onChange({ target: { checked: true } }); render();
  const final = button("CONFIRMER ET ENVOYER 1 COURRIEL MAINTENANT");
  expect(final.props.disabled).toBe(false); expect(final.props.className).toBe("custom-campaign-send");
  final.props.onClick(); final.props.onClick(); await settle();
  expect(text(tree)).toContain("1 envoyé(s)");
  expect(button("ENVOYER MAINTENANT").props.disabled).toBe(true);
  expect(calls.filter(c => c.method === "POST")).toEqual([{ url: `/api/automatic-emails/custom-campaigns/${campaign.id}/manual-send`, method: "POST", body: expect.objectContaining({ confirmation: "ENVOYER", stepId: step.id, contactIds: [contact.id], fingerprints: { [contact.id]: "local-fingerprint" } }) }]);
});


it.each(["sent", "blocked", "none"])("explains no eligible recipients (%s) without sending", async state => {
  deliveryStatus = state === "sent" ? "sent" : null;
  blockingReasons = state === "blocked" ? ["Signature indisponible"] : [];
  h.slots = []; h.effects = []; component = () => CustomCampaignManualSend({ campaignId: campaign.id, onClose: vi.fn() }); render(); await settle();
  if (state === "none") { const checkbox = nodes().find(n => n.type === "input" && n.props.type === "checkbox")!; checkbox.props.onChange({ target: { checked: false } }); render(); }
  expect(button("ENVOYER MAINTENANT").props.disabled).toBe(true);
  expect(text(tree)).toContain("Aucun destinataire prêt pour cet envoi.");
  if (state === "blocked") expect(text(tree)).toContain("Signature indisponible");
  expect(calls.filter(c => c.method === "POST")).toHaveLength(0);
});
