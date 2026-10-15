import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), actor: vi.fn(), origin: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn(), batch: vi.fn() }));
vi.mock("../../../../lib/crm-access", () => ({ requireApiAccess: mocks.access, birthdayWorkspaceActor: mocks.actor }));
vi.mock("../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: mocks.origin }));
vi.mock("../../../../lib/transactions/direct-clients-server", () => ({ listDirectClients: mocks.list, saveDirectClient: mocks.save, deleteDirectClient: mocks.remove, importDirectClients:mocks.batch }));
import { GET, POST, PATCH, DELETE } from "./route";
const context = { params: Promise.resolve({ transactionId: "transaction-a" }) };
const request = (body: unknown = { name: "Example" }) => new Request("https://crm.example/api/transactions/transaction-a/direct-clients", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ response: null }); mocks.actor.mockResolvedValue("immoplus"); mocks.origin.mockReturnValue(true); mocks.list.mockResolvedValue([]); mocks.save.mockResolvedValue({ id: "example" }); });
it.each([GET, POST, PATCH, DELETE])("rejects unauthenticated access", async handler => { mocks.access.mockResolvedValue({ response: Response.json({}, { status: 401 }) }); expect((await handler(request(), context)).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); });
it("rejects cross-origin writes", async () => { mocks.origin.mockReturnValue(false); expect((await POST(request(), context)).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled(); });
it("requires verified audit identity", async () => { mocks.actor.mockResolvedValue(null); expect((await POST(request(), context)).status).toBe(403); });
it("loads only the requested transaction without cache", async () => { const response = await GET(request(), context); expect(mocks.list).toHaveBeenCalledWith("transaction-a"); expect(response.headers.get("Cache-Control")).toContain("no-store"); });
it("passes the server actor and URL scope on creation", async () => { expect((await POST(request(), context)).status).toBe(201); expect(mocks.save).toHaveBeenCalledWith("transaction-a", { name: "Example" }, "immoplus", false); });
it("requires explicit deletion confirmation", async () => { expect((await DELETE(request({ id: "example" }), context)).status).toBe(400); expect(mocks.remove).not.toHaveBeenCalled(); });
it("deletes only a scoped entry", async () => { expect((await DELETE(request({ id: "example", confirm: true }), context)).status).toBe(200); expect(mocks.remove).toHaveBeenCalledWith("transaction-a", "example"); });

it('routes batch import through the same authenticated transaction scope',async()=>{mocks.batch.mockResolvedValue([]);const body={action:'import',clients:[]};expect((await POST(request(body),context)).status).toBe(201);expect(mocks.batch).toHaveBeenCalledWith('transaction-a',body,'immoplus');});
