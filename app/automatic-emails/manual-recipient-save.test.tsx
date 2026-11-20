// @vitest-environment jsdom
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import CustomCampaignsSection from "./custom-campaigns-section";
import type { CampaignManualRecipient } from "../lib/automatic-emails/manual-recipients";

// Real parent + child + real transactional SQL. All HTTP intercepted; no Gmail.
let db:PGlite, id:string, stepId:string, posts:number, failSave:boolean;
const campaign={name:"Isolated campaign",status:"draft",executionMode:"approval",senderStrategy:"fixed_broker",fixedBroker:"france",fallbackBroker:null,startDate:"2026-11-20",sendHour:9,sendMinute:0,timezone:"America/Toronto"};
const step=()=>({id:stepId,delayDaysAfterPrevious:0,subjectTemplate:"Information",bodyTemplate:"Bonjour {{email}}"});
async function version(){return (await db.query<{stamp:string}>("select updated_at::text stamp from custom_email_campaigns where id=$1",[id])).rows[0].stamp;}
async function persist(manual:CampaignManualRecipient[],expected:string|null){return db.query("select save_custom_campaign_editor($1,$2,$3,$4,$5,$6)",[id,expected,JSON.stringify(campaign),[],JSON.stringify(manual),JSON.stringify([step()])]);}
async function recipients(){return (await db.query<CampaignManualRecipient>('select id,email,first_name as "firstName",last_name as "lastName",broker from custom_email_campaign_manual_recipients where campaign_id=$1 and removed_at is null order by created_at,id',[id])).rows;}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create type broker_assignment as enum ('maxime','france','sandrine','unassigned');
 create table contacts(id uuid primary key); create schema crm_auth;
 create function crm_auth.has_functional_access() returns boolean language sql as $$ select true $$;
 create function crm_auth.audit_change() returns trigger language plpgsql as $$ begin return null; end $$;
 create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;`);
 for(const file of ["20260824170000_create_custom_email_campaigns.sql","20260915192658_custom_email_manual_sending.sql","20261120150000_campaign_manual_recipients.sql"])
  await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 id=randomUUID();stepId=randomUUID();posts=0;failSave=false;
 await persist([],null);
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  const base="/api/automatic-emails/custom-campaigns";
  if(url===`${base}/save` && init?.method==="POST"){
   posts++;
   if(failSave)return Response.json({error:"Erreur serveur QA"},{status:500});
   const body=JSON.parse(String(init.body));
   try{await persist(body.manualRecipients,body.expectedUpdatedAt);return Response.json({data:{id}});}
   catch{return Response.json({error:"Campagne modifiée dans une autre session."},{status:409});}
  }
  if(init?.method && init.method!=="GET")throw Error("Any other write or send is forbidden");
  if(url===`${base}/${id}/contacts`)return Response.json({data:[]});
  const manual=await recipients();
  const saved={...campaign,id,createdAt:"2026-11-20",updatedAt:await version(),contactCount:0,manualRecipientCount:manual.length,stepCount:1,durationDays:0};
  if(url===base)return Response.json({data:{campaigns:[saved]}});
  if(url===`${base}/${id}`)return Response.json({data:{campaign:saved,manualRecipients:manual,steps:[{...step(),campaignId:id,stepOrder:1,createdAt:"",updatedAt:""}]}});
  throw Error(`Unexpected network: ${url}`);
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function open(){fireEvent.click(await screen.findByRole("button",{name:"CONFIGURER"}));return await screen.findByLabelText("Liste complète des adresses courriel") as HTMLTextAreaElement;}
async function save(){fireEvent.click(screen.getByRole("button",{name:"ENREGISTRER"}));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());}
it.each([[1,";"],[30,";"],[50,";"],[50,"\n"],[100,"\n"]])("direct save and fresh session reload of %i addresses",async(count,separator)=>{
 render(<CustomCampaignsSection/>);const input=await open();
 const emails=Array.from({length:count as number},(_,i)=>`qa${i}@example.test`);
 fireEvent.change(input,{target:{value:emails.join(separator as string)}});await save();
 expect(posts).toBe(1);expect(await recipients()).toHaveLength(count as number);
 cleanup();render(<CustomCampaignsSection/>);const reopened=await open();
 expect(new Set(reopened.value.split("\n"))).toEqual(new Set(emails));
 expect(screen.getByText(new RegExp(`Adresses manuelles : ${count} ·`))).toBeTruthy();
},15000);
it("optional validation never duplicates; double click saves once",async()=>{
 render(<CustomCampaignsSection/>);fireEvent.change(await open(),{target:{value:"a@example.test; A@example.test; b@example.test"}});
 fireEvent.click(screen.getByRole("button",{name:"VALIDER LA LISTE (FACULTATIF)"}));
 const button=screen.getByRole("button",{name:"ENREGISTRER"});fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(posts).toBe(1);expect(await recipients()).toHaveLength(2);
});
it("invalid input blocks every write and preserves all text",async()=>{
 render(<CustomCampaignsSection/>);const input=await open(), text="a@example.test;INVALID; b@example.test";
 fireEvent.change(input,{target:{value:text}});fireEvent.click(screen.getByRole("button",{name:"ENREGISTRER"}));
 expect(screen.getByRole("dialog")).toBeTruthy();expect(input.value).toBe(text);expect(posts).toBe(0);expect(screen.getAllByRole("alert").some(e=>e.textContent?.includes("INVALID"))).toBe(true);
});
it("server failure keeps draft and retry persists it",async()=>{
 render(<CustomCampaignsSection/>);const input=await open();fireEvent.change(input,{target:{value:"a@example.test"}});failSave=true;
 fireEvent.click(screen.getByRole("button",{name:"ENREGISTRER"}));await screen.findByText("Erreur serveur QA");expect(input.value).toBe("a@example.test");
 failSave=false;await save();expect(await recipients()).toHaveLength(1);
});
it("stale session cannot overwrite another session and retains its own input",async()=>{
 render(<CustomCampaignsSection/>);const input=await open();fireEvent.change(input,{target:{value:"stale@example.test"}});
 await persist([{id:randomUUID(),email:"other@example.test",firstName:"Other",lastName:"",broker:null}],await version());
 fireEvent.click(screen.getByRole("button",{name:"ENREGISTRER"}));await screen.findByText("Campagne modifiée dans une autre session.");
 expect(input.value).toBe("stale@example.test");expect((await recipients())[0].email).toBe("other@example.test");
});
it("reorder, correction, metadata and removal preserve identity and old delivery history",async()=>{
 const r={id:randomUUID(),email:"a@example.test",firstName:"Alice",lastName:"Synthetic",broker:"france" as const};
 await persist([r,{...r,id:randomUUID(),email:"b@example.test",firstName:"Bob"}],await version());
 const batch=randomUUID();await db.query("insert into custom_email_manual_batches(id,campaign_id,step_id,campaign_name,step_order) values($1,$2,$3,'QA',1)",[batch,id,stepId]);
 await db.query("insert into custom_email_manual_deliveries(batch_id,campaign_id,step_id,manual_recipient_id,broker,recipient_email,status,attempt_key,gmail_message_id) values($1,$2,$3,$4,'france',$5,'sent',$6,'isolated-mock')",[batch,id,stepId,r.id,r.email,randomUUID()]);
 render(<CustomCampaignsSection/>);const input=await open();fireEvent.change(input,{target:{value:"b@example.test\na@example.test"}});
 fireEvent.change(screen.getByLabelText("Adresse à modifier"),{target:{value:r.email}});
 expect((screen.getByLabelText("Prénom (facultatif)") as HTMLInputElement).value).toBe("Alice");
 vi.spyOn(window,"prompt").mockReturnValue("corrected@example.test");fireEvent.click(screen.getByRole("button",{name:"CORRIGER CETTE ADRESSE",hidden:true}));await save();
 expect((await recipients()).find(x=>x.id===r.id)).toEqual({...r,email:"corrected@example.test"});
 cleanup();render(<CustomCampaignsSection/>);fireEvent.change(await open(),{target:{value:"b@example.test"}});await save();
 expect((await db.query<{removed_at:unknown}>("select removed_at from custom_email_campaign_manual_recipients where id=$1",[r.id])).rows[0].removed_at).not.toBeNull();
 expect((await db.query<{recipient_email:string}>("select recipient_email from custom_email_manual_deliveries where manual_recipient_id=$1",[r.id])).rows[0].recipient_email).toBe(r.email);
});
