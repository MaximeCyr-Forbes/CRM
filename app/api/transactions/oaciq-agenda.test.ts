import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), get: vi.fn(), row: vi.fn(), update: vi.fn(), sync: vi.fn() }));
vi.mock("../../lib/crm-access", () => ({ requireApiAccess: mocks.access }));
vi.mock("../../lib/google-calendar/config", () => ({ isSameOriginRequest: () => true }));
vi.mock("../../lib/google-calendar/service", () => ({ syncTransactionDeadline: mocks.sync, deleteCalendarEventForTransactionDeadline: vi.fn() }));
vi.mock("../../lib/transactions/server-service", async (original) => ({ ...await original<object>(), createTransaction: mocks.create, getTransaction: mocks.get, getDeadlineRow: mocks.row, updateDeadline: mocks.update }));
import { POST } from "./route";
import { MANUAL_DEADLINE_SOURCE } from "../../lib/transactions/oaciq-agenda";
const draft = { address: "TEST OACIQ SYNTHETIQUE", type: "purchase", broker: "maxime", contactIds: [], price: null, promiseDate: null, status: "new", generalNotes: "", deadlines: [{ title: "Inspection", dueDate: "2026-08-27", dueTime: null, source: MANUAL_DEADLINE_SOURCE }] };
function request(body: object) { return new Request("https://crm.example/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
describe("transaction agenda: confirmation et Google individuel uniquement", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ response: null }); mocks.create.mockResolvedValue({ id: "test" }); mocks.get.mockResolvedValue({ id: "test" }); mocks.row.mockResolvedValue({ transaction_id: "test", google_calendar_event_id: null }); });
  it("crée uniquement après confirmation, conserve le payload et n’appelle jamais Google", async () => {
    const key = crypto.randomUUID();
    expect((await POST(request({ action: "create", draft, creationKey: key }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ deadlines: draft.deadlines }), key);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rejette l’agenda invalide avant toute création", async () => {
    expect((await POST(request({ action: "create", draft: { ...draft, deadlines: [{ ...draft.deadlines[0], dueDate: "2026-02-30" }] } }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("ne renvoie ni ne logge les clauses présentes dans une erreur SQL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValue({ code: "23514", details: "PRIVATE OACIQ CLAUSE", message: "PRIVATE SIGNATURE" });
    const result = await POST(request({ action: "create", draft }));
    expect(result.status).toBe(502); expect(await result.text()).not.toContain("PRIVATE");
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE"); log.mockRestore();
  });
  it("marquer Fait ne déclenche pas Google pour une échéance interne", async () => {
    expect((await POST(request({ action: "updateDeadline", transactionId: "test", deadlineId: "d1", completed: true }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("test", "d1", { completed: true });
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("une erreur de modification ne logge pas la source OACIQ de la ligne", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.update.mockRejectedValue({ code: "23514", details: "PRIVATE OACIQ ROW" });
    expect((await POST(request({ action: "updateDeadline", transactionId: "test", deadlineId: "d1", completed: true }))).status).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE"); log.mockRestore();
  });
  it("l’option explicite synchronise uniquement l’échéance choisie", async () => {
    expect((await POST(request({ action: "updateDeadline", transactionId: "test", deadlineId: "d1", syncToGoogle: true }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith("d1");
  });
});
