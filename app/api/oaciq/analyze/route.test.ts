import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), origin: vi.fn(), analyze: vi.fn() }));
vi.mock("../../../lib/crm-access", () => ({ requireApiAccess: mocks.access }));
vi.mock("../../../lib/google-calendar/config", () => ({ isSameOriginRequest: mocks.origin }));
vi.mock("../../../lib/transactions/oaciq-analysis", () => ({ analyzeOaciqTransaction: mocks.analyze }));
import { POST } from "./route";

function request(names = ["PA.pdf", "R.pdf"]) {
  const form = new FormData();
  names.forEach((name) => form.append("files", new File(["%PDF-synthetic"], name, { type: "application/pdf" })));
  return new Request("https://crm.example/api/oaciq/analyze", { method: "POST", body: form });
}
describe("preview OACIQ protégée et sans écriture", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ response: null }); mocks.origin.mockReturnValue(true); });
  it("refuse la session absente avant extraction", async () => {
    mocks.access.mockResolvedValue({ response: Response.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("refuse une origine étrangère", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("analyse tous les PDF en un seul dossier et empêche le cache", async () => {
    mocks.analyze.mockResolvedValue({ deadlines: [], warnings: [] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.analyze.mock.calls[0][0].map((f: { name: string }) => f.name)).toEqual(["PA.pdf", "R.pdf"]);
  });
  it.each([[], ["invalid.txt"], ["PA.pdf", "PA.pdf"]])("refuse les fichiers invalides %j", async (...names) => {
    // Each table entry is a list; Vitest spreads its elements.
    expect((await POST(request(names as string[]))).status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("masque tout contenu privé en cas d’erreur PDF et permet un retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.analyze.mockRejectedValueOnce(new Error("PRIVATE CLAUSE AND SIGNATURE"));
    const response = await POST(request());
    expect(response.status).toBe(422); expect(await response.text()).not.toContain("PRIVATE");
    expect(log).not.toHaveBeenCalled();
    mocks.analyze.mockResolvedValueOnce({ deadlines: [] });
    expect((await POST(request())).status).toBe(200); log.mockRestore();
  });
});
