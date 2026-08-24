import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  denied: false,
  sameOrigin: true,
  rules: [] as unknown[],
  deliveries: [] as unknown[],
  create: vi.fn(),
  update: vi.fn(),
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
}));
vi.mock("../../lib/automatic-emails/server-service", () => ({ getAutomaticEmailOccurrences: state.occurrences }));

import { GET as getRules, POST as postRule } from "./rules/route";
import { PATCH as patchRule } from "./rules/[ruleId]/route";
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
    const response = await patchRule(request(draft), { params: Promise.resolve({ ruleId: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledOnce();
  });

  it("retourne uniquement une simulation d’occurrences", async () => {
    const response = await getOccurrences(new Request("https://crm.example.com/api/automatic-emails/occurrences?from=2026-08-24&to=2026-09-24"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ simulationOnly: true });
  });
});
