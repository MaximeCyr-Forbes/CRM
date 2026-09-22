import { afterEach, expect, it, vi } from "vitest";
const purchase=vi.hoisted(()=>vi.fn(async()=>({sent:0})));
vi.mock("../../../lib/purchase-anniversary/service",()=>({runPurchaseAnniversaryFallback:purchase}));
const run=vi.hoisted(()=>vi.fn(async()=>({sent:0})));
vi.mock("../../../lib/birthday-greetings/service",()=>({runBirthdayFallback:run}));
import { GET } from "./route";
afterEach(()=>{vi.unstubAllEnvs();run.mockReset().mockResolvedValue({sent:0});purchase.mockReset().mockResolvedValue({sent:0});});
it("refuses missing/incorrect scheduler credentials",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","secret");for(const authorization of ["","Bearer wrong"])expect((await GET(new Request("https://crm.example/api/cron/birthday-greetings",{headers:{authorization}}))).status).toBe(401);expect(run).not.toHaveBeenCalled();});
it("fails closed if no secret configured",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","");expect((await GET(new Request("https://crm.example"))).status).toBe(401);});
it("invokes both independent greeting runners with correct secret",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","secret");expect((await GET(new Request("https://crm.example",{headers:{authorization:"Bearer secret"}}))).status).toBe(200);expect(run).toHaveBeenCalledTimes(1);expect(purchase).toHaveBeenCalledTimes(1);});

it("continues purchase fallback when birthday fails",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","secret");run.mockRejectedValueOnce(new Error("birthday unavailable"));const response=await GET(new Request("https://crm.example",{headers:{authorization:"Bearer secret"}}));expect(purchase).toHaveBeenCalledTimes(1);expect(await response.json()).toMatchObject({purchaseAnniversary:{sent:0}});});
