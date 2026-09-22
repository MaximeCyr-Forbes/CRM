import { beforeEach, expect, it, vi } from "vitest";
import type { AutomaticEmailRule } from "../../data/automatic-email-types";
const state = vi.hoisted(() => ({ tables: [] as string[], filters: [] as unknown[], rules: [] as AutomaticEmailRule[] }));
vi.mock("./persistence", () => ({ listAutomaticEmailRules: async () => state.rules }));
vi.mock("../google-calendar/service", () => ({ listGoogleConnectionStatuses: async () => [] }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from(table: string) {
  state.tables.push(table);
  const q:any = { select:()=>q,order:()=>q,in:(...args:unknown[])=>{state.filters.push(args);return q;},range:async()=>({data:table==="contacts"?[{id:"c",first_name:"Marie",last_name:"Exemple",email:"qa@example.test",broker:"maxime",birth_date:"1980-09-22",mortgage_renewal_date:"2027-03-22"}]:table==="transactions"?[{id:"t",type:"purchase",address:"Exemple",status:"completed",notary_date:"2025-09-22",purchase_finalized_at:"2025-09-22",sale_finalized_at:null},{id:"irrelevant",type:"purchase",notary_date:null,purchase_finalized_at:null}]:[{transaction_id:"t",contact_id:"c"}]}) }; return q;
} }) }));
import { getAutomaticEmailOccurrences } from "./server-service";
const rule = {id:"r",ruleType:"birthday",name:"Bonne fête",defaultBroker:"maxime",subjectTemplate:"{{firstName}}",bodyTemplate:"Bonjour {{firstName}}",sendHour:17,sendMinute:0,timezone:"America/Toronto",triggerConfig:{}} as AutomaticEmailRule;
beforeEach(()=>{state.tables=[];state.filters=[];state.rules=[rule];});
const input={from:"2026-09-22",to:"2026-10-22",today:"2026-09-22",ruleId:"r"};
it.each(["birthday","mortgage_renewal"] as const)("does not query transactions for %s",async ruleType=>{state.rules=[{...rule,ruleType}];await getAutomaticEmailOccurrences(input);expect(state.tables).toEqual(["contacts"]);});
it("only fetches links for relevant transactions",async()=>{state.rules=[{...rule,ruleType:"purchase_anniversary"}];await getAutomaticEmailOccurrences(input);expect(state.filters).toEqual([["transaction_id",["t"]]]);});
it("summary matches full occurrences without returning bodies",async()=>{const full=await getAutomaticEmailOccurrences(input);const summary=await getAutomaticEmailOccurrences({...input,mode:"summary"});expect(summary?.summary).toEqual(full?.summary);expect(summary).not.toHaveProperty("occurrences");expect(summary?.rules?.[0]).toMatchObject({count30Days:1,nextDate:"2026-09-22"});});
it("preview returns one occurrence for the selected rule",async()=>{state.rules=[rule,{...rule,id:"other"}];const result=await getAutomaticEmailOccurrences({...input,mode:"preview"});expect(result?.occurrences).toHaveLength(1);expect(result?.occurrences?.[0].ruleId).toBe("r");});
