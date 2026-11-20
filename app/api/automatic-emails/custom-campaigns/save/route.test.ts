import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({denied:false,origin:true,rpc:vi.fn()}));
vi.mock("../../../../lib/crm-access",()=>({requireApiAccess:async()=>({response:state.denied?Response.json({},{status:401}):null})}));
vi.mock("../../../../lib/google-calendar/config",()=>({isSameOriginRequest:()=>state.origin}));
vi.mock("../../../../lib/supabase/server",()=>({getSupabaseAdmin:()=>({rpc:state.rpc})}));
import { POST } from "./route";
const id="11111111-1111-4111-8111-111111111111";
const body={id,expectedUpdatedAt:null,campaign:{name:"Synthetic",status:"draft",executionMode:"approval",senderStrategy:"fixed_broker",fixedBroker:"france",fallbackBroker:null,startDate:"2026-11-20",sendHour:9,sendMinute:0,timezone:"America/Toronto"},contactIds:[],manualRecipients:[{id,email:"qa@example.test",firstName:"",lastName:"",broker:null}],steps:[]};
const request=(value:unknown)=>new Request("https://crm.example/api/automatic-emails/custom-campaigns/save",{method:"POST",body:JSON.stringify(value)});
beforeEach(()=>{state.denied=false;state.origin=true;state.rpc.mockReset().mockResolvedValue({error:null});});
it("authenticates writes and refuses cross-origin",async()=>{
  state.denied=true;expect((await POST(request(body))).status).toBe(401);
  state.denied=false;state.origin=false;expect((await POST(request(body))).status).toBe(403);expect(state.rpc).not.toHaveBeenCalled();
});
it("saves manual-only once through the atomic RPC",async()=>{
  expect((await POST(request(body))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("save_custom_campaign_editor",expect.objectContaining({p_manual:body.manualRecipients,p_contacts:[]}));
});
it("returns explicit conflicts without retry",async()=>{
  state.rpc.mockResolvedValue({error:{code:"40001"}});expect((await POST(request(body))).status).toBe(409);expect(state.rpc).toHaveBeenCalledTimes(1);
});
it.each([null,{...body,manualRecipients:[{...body.manualRecipients[0],email:"bad"}]},{...body,manualRecipients:[body.manualRecipients[0],body.manualRecipients[0]]},{...body,expectedUpdatedAt:"bad"}])("rejects invalid payload",async value=>{
  expect((await POST(request(value))).status).toBe(400);expect(state.rpc).not.toHaveBeenCalled();
});
