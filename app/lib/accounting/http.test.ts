import {beforeEach,expect,it,vi} from "vitest";
const auth=vi.hoisted(()=>({allowed:true,actor:"immoplus" as string|null}));
vi.mock("../crm-access",()=>({requireApiAccess:async()=>({response:auth.allowed?null:Response.json({error:"Accès requis"},{status:401})}),birthdayWorkspaceActor:async()=>auth.actor}));
import { accountingRoute } from "./http";
beforeEach(()=>{auth.allowed=true;auth.actor="immoplus";});
it("rejects unauthenticated private invoice access before any action",async()=>{auth.allowed=false;const action=vi.fn();expect((await accountingRoute(new Request("https://crm.test/api/accounting/expenses/id/invoice"),action)).status).toBe(401);expect(action).not.toHaveBeenCalled();});
it("rejects cross-origin mutations",async()=>{const action=vi.fn();expect((await accountingRoute(new Request("https://crm.test/api/accounting/expenses",{method:"POST",headers:{Origin:"https://evil.test"}}),action)).status).toBe(403);expect(action).not.toHaveBeenCalled();});
it("requires signed workspace identity",async()=>{auth.actor=null;expect((await accountingRoute(new Request("https://crm.test/api/accounting/expenses",{method:"POST",headers:{Origin:"https://crm.test"}}),async()=>Response.json({ok:true}))).status).toBe(403);});
it("passes the signed Immoplus actor and disables caching",async()=>{const action=vi.fn(async()=>Response.json({ok:true}));const response=await accountingRoute(new Request("https://crm.test/api/accounting/expenses",{method:"POST",headers:{Origin:"https://crm.test"}}),action);expect(action).toHaveBeenCalledWith("immoplus");expect(response.headers.get("cache-control")).toBe("private, no-store");});
