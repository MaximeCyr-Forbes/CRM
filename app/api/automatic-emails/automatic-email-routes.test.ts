import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  denied: false,
  sameOrigin: true,
  rules: [] as unknown[],
  deliveries: [] as unknown[],
  create: vi.fn(),
  update: vi.fn(),
  mutate: vi.fn(),
  occurrences: vi.fn(),
}));

vi.mock("../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: state.denied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null })),
}));
vi.mock("../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));
vi.mock("../../lib/automatic-emails/persistence", () => ({
  listAutomaticEmailRules: vi.fn(async () => state.rules),
  listAutomaticEmailDeliveries: vi.fn(async () => state.deliveries),
  createAutomaticEmailRule: state.create,
  updateAutomaticEmailRule: state.update,
  mutateAutomaticEmailRule: state.mutate,
}));
vi.mock("../../lib/automatic-emails/server-service", () => ({ getAutomaticEmailOccurrences: state.occurrences }));

import { GET as getRules, POST as postRule } from "./rules/route";
import { PATCH as patchRule, DELETE as archiveRule } from "./rules/[ruleId]/route";
import { GET as getOccurrences } from "./occurrences/route";

const draft = {
  ruleType: "birthday",
  name: "Bonne fête",
  status: "draft",
  executionMode: "approval",
  defaultBroker: null,
  subjectTemplate: "Bonne fête {{firstName}}!",
  bodyTemplate: "Bonjour {{firstName}}",
  sendHour: 9,
  sendMinute: 0,
  timezone: "America/Toronto",
  triggerConfig: {},
};

function request(body: unknown) {
  return new Request("https://crm.example.com/api/automatic-emails/rules", {
    method: "POST",
    headers: { Origin: "https://crm.example.com", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API de préparation des courriels automatiques", () => {
  beforeEach(() => {
    state.denied = false;
    state.sameOrigin = true;
    state.rules = [];
    state.deliveries = [];
    state.create.mockReset().mockResolvedValue({ id: "rule" });
    state.update.mockReset().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    state.mutate.mockReset().mockResolvedValue({id:"11111111-1111-4111-8111-111111111111",version:2,archivedAt:"2026-11-27"});
    state.occurrences.mockReset().mockResolvedValue({ occurrences: [], summary: { today: 0, tomorrow: 0, nextSevenDays: 0 } });
  });

  it("protège toutes les lectures", async () => {
    state.denied = true;
    expect((await getRules()).status).toBe(401);
    expect((await getOccurrences(new Request("https://crm.example.com/api/automatic-emails/occurrences"))).status).toBe(401);
  });

  it("retourne toujours le module verrouillé et sans runner", async () => {
    const response = await getRules();
    const payload = await response.json();
    expect(payload.data).toMatchObject({ locked: true, runnerAvailable: false });
  });

  it("refuse les écritures cross-origin et READY incomplet", async () => {
    state.sameOrigin = false;
    expect((await postRule(request(draft))).status).toBe(403);
    state.sameOrigin = true;
    expect((await postRule(request({ ...draft, status: "ready" }))).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("crée une configuration brouillon sans envoyer", async () => {
    expect((await postRule(request(draft))).status).toBe(201);
    expect(state.create).toHaveBeenCalledOnce();
  });

  it("modifie une règle valide avec contrôle d’origine", async () => {
    const response = await patchRule(request({ ...draft, version: 1 }), { params: Promise.resolve({ ruleId: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledOnce();
  });

  it("retourne uniquement une simulation d’occurrences", async () => {
    const response = await getOccurrences(new Request("https://crm.example.com/api/automatic-emails/occurrences?from=2026-08-24&to=2026-09-24"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ simulationOnly: true });
  });
  it("requires authentication, origin, JSON, UUID and version for archive and restore",async()=>{
    const ctx={params:Promise.resolve({ruleId:"11111111-1111-4111-8111-111111111111"})};
    state.denied=true;expect((await archiveRule(request({version:1}),ctx)).status).toBe(401);
    state.denied=false;state.sameOrigin=false;expect((await archiveRule(request({version:1}),ctx)).status).toBe(403);
    state.sameOrigin=true;
    expect((await archiveRule(new Request("https://crm.example.com",{method:"DELETE"}),ctx)).status).toBe(415);
    expect((await archiveRule(request({}),ctx)).status).toBe(400);
    expect((await archiveRule(request({version:1,broker:"maxime"}),ctx)).status).toBe(400);
    expect((await archiveRule(request({version:1}),{params:Promise.resolve({ruleId:"bad"})})).status).toBe(400);
    expect(state.mutate).not.toHaveBeenCalled();
    expect((await archiveRule(request({version:1}),ctx)).status).toBe(200);
    expect(state.mutate).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111",1,"archive");
    expect((await patchRule(request({version:2,action:"restore"}),ctx)).status).toBe(200);
    expect(state.mutate).toHaveBeenLastCalledWith("11111111-1111-4111-8111-111111111111",2,"restore");
  });
  it.each(["RULE_VERSION_CONFLICT","RULE_ARCHIVED","RULE_SEND_IN_PROGRESS"])("returns conflict for %s",async message=>{
    state.mutate.mockRejectedValue({message});
    expect((await archiveRule(request({version:1}),{params:Promise.resolve({ruleId:"11111111-1111-4111-8111-111111111111"})})).status).toBe(409);
  });
  it("rejects type changes detected by database without masking them as server errors",async()=>{
    state.update.mockRejectedValue({message:"RULE_TYPE_IMMUTABLE"});
    expect((await patchRule(request({...draft,version:1}),{params:Promise.resolve({ruleId:"11111111-1111-4111-8111-111111111111"})})).status).toBe(400);
  });
});
