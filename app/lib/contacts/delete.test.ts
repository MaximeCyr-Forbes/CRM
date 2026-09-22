import { beforeEach, expect, it, vi } from "vitest";
import { contactDeleteDiagnostic } from "./delete-error";
const state=vi.hoisted(()=>({order:[] as string[], fail:"", dbError:null as unknown}));
vi.mock("../supabase/server",()=>({getSupabaseAdmin:()=>({from:(table:string)=>{
  const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:"qa"}}),delete:()=>{state.order.push(`delete:${table}`);return q;},then:(resolve:any)=>resolve({error:state.dbError})};return q;
}})}));
vi.mock("../google-calendar/service",()=>({
  mapServerContact:(c:any)=>({...c,googleCalendarEventId:"event"}),
  deleteCalendarEventForContact:async()=>{state.order.push("followup");if(state.fail==="followup")throw Error("Google unavailable");},
  deleteBirthdayEventsForContact:async()=>{state.order.push("birthday");if(state.fail==="birthday")throw Error("Google unavailable");},
  deleteMortgageRenewalEventsForContact:async()=>{state.order.push("mortgage");if(state.fail==="mortgage")throw Error("Google unavailable");},
  syncContactFollowUp:async()=>state.order.push("recover"),
}));
import { deleteContactAndCalendar } from "./server-service";
beforeEach(()=>{state.order=[];state.fail="";state.dbError=null;});
it("cleans Google before the single atomic contact delete",async()=>{await deleteContactAndCalendar("qa");expect(state.order).toEqual(["followup","birthday","mortgage","delete:contacts"]);});
it.each(["followup","birthday","mortgage"])("keeps contact when %s cleanup fails",async phase=>{state.fail=phase;await expect(deleteContactAndCalendar("qa")).rejects.toThrow();expect(state.order).not.toContain("delete:contacts");});
it("propagates DB diagnostics after recovery",async()=>{state.dbError={code:"23503"};await expect(deleteContactAndCalendar("qa")).rejects.toEqual(state.dbError);expect(state.order.at(-1)).toBe("recover");});
it("logs safe constraint identifiers without row data or tokens",()=>{const d=contactDeleteDiagnostic("qa",{code:"23503",message:'update or delete on table "contacts" violates foreign key constraint "greeting_contact_fkey" on table "greetings"',details:"secret token private@email.test"});expect(d.code).toBe("23503");expect(d.constraint).toBe("greeting_contact_fkey");expect(JSON.stringify(d)).not.toContain("secret");});
