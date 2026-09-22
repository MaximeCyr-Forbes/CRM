import { afterEach, expect, it, vi } from "vitest";
const run=vi.hoisted(()=>vi.fn(async()=>({sent:0})));
vi.mock("../../../lib/birthday-greetings/service",()=>({runBirthdayFallback:run}));
import { GET } from "./route";
afterEach(()=>{vi.unstubAllEnvs();run.mockClear();});
it("refuses missing/incorrect scheduler credentials",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","secret");for(const authorization of ["","Bearer wrong"])expect((await GET(new Request("https://crm.example/api/cron/birthday-greetings",{headers:{authorization}}))).status).toBe(401);expect(run).not.toHaveBeenCalled();});
it("fails closed if no secret configured",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","");expect((await GET(new Request("https://crm.example"))).status).toBe(401);});
it("invokes only the birthday runner with correct secret",async()=>{vi.stubEnv("BIRTHDAY_CRON_SECRET","secret");expect((await GET(new Request("https://crm.example",{headers:{authorization:"Bearer secret"}}))).status).toBe(200);expect(run).toHaveBeenCalledTimes(1);});
