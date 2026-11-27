import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: 0, load: vi.fn() }));
vi.mock("../../../lib/auth/route", () => ({ withCRMIdentity: (handler: (request: Request) => Promise<Response>) => handler }));
vi.mock("../../../lib/crm-access", () => ({ requireApiAccess: async () => ({ response: state.status ? Response.json({}, { status: state.status }) : null }) }));
vi.mock("../../../lib/statistics/drilldown-service", () => ({ getStatisticsDrilldown: state.load, StatisticsChangedError: class extends Error {} }));
import { GET } from "./route";
import { StatisticsChangedError } from "../../../lib/statistics/drilldown-service";
const url = "https://crm.example/api/statistics/drilldown?year=2026&period=custom&from=2026-11-03&to=2026-11-10&broker=france&month=2026-11&metric=sales";
describe("détail sécurisé", () => {
  beforeEach(() => { state.status = 0; state.load.mockReset().mockResolvedValue({ count: 1 }); });
  it.each([401, 403])("refuse l'accès %i sans lire les données", async (status) => { state.status = status; expect((await GET(new Request(url))).status).toBe(status); expect(state.load).not.toHaveBeenCalled(); });
  it.each(["&page=0", "&page=2", "&page=801", "&page=1.5", "&revision=bad", "&sql=select", "&broker=maxime", "&month=2026-12"])("refuse les paramètres invalides/dupliqués %s", async (suffix) => { expect((await GET(new Request(url + suffix))).status).toBe(400); expect(state.load).not.toHaveBeenCalled(); });
  it("transmet seulement les filtres validés, sans cache public", async () => { const response = await GET(new Request(url)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(state.load).toHaveBeenCalledWith({ year: 2026, period: "custom", from: "2026-11-03", to: "2026-11-10", broker: "france", month: "2026-11", metric: "sales", page: 1, revision: null }); });
  it.each([[new TypeError("Date invalide"), 400], [new StatisticsChangedError("Actualiser"), 409], [new Error("secret interne"), 500]])("ne transforme pas les erreurs en liste vide", async (error, status) => { state.load.mockRejectedValue(error); const response = await GET(new Request(url)); expect(response.status).toBe(status); expect(JSON.stringify(await response.json())).not.toContain("secret interne"); });
});
