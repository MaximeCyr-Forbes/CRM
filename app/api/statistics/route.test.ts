import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ denied: false, getStatistics: vi.fn() }));
vi.mock("../../lib/crm-access", () => ({ requireApiAccess: vi.fn(async () => ({ response: state.denied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null })) }));
vi.mock("../../lib/statistics/server-service", () => ({ getStatistics: state.getStatistics }));

import { GET } from "./route";

describe("GET /api/statistics", () => {
  beforeEach(() => {
    state.denied = false;
    state.getStatistics.mockReset().mockResolvedValue({ kpis: {} });
  });

  it("protège la route", async () => {
    state.denied = true;
    expect((await GET(new Request("https://crm.example.com/api/statistics"))).status).toBe(401);
  });

  it("valide période, courtier et année", async () => {
    expect((await GET(new Request("https://crm.example.com/api/statistics?period=forever"))).status).toBe(400);
    expect((await GET(new Request("https://crm.example.com/api/statistics?broker=unassigned"))).status).toBe(400);
    for (const year of ["2019", "2031", "2020.5", "abc"]) {
      const response = await GET(new Request(`https://crm.example.com/api/statistics?year=${year}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Année invalide." });
    }
    expect(state.getStatistics).not.toHaveBeenCalled();
  });

  it("transmet les filtres personnalisés validés au service", async () => {
    const response = await GET(new Request("https://crm.example.com/api/statistics?period=custom&from=2026-01-01&to=2026-08-23&broker=maxime&year=2026"));
    expect(response.status).toBe(200);
    expect(state.getStatistics).toHaveBeenCalledWith({ period: "custom", from: "2026-01-01", to: "2026-08-23", broker: "maxime", year: 2026 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
