// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { AutomaticEmailRule } from "../data/automatic-email-types";
vi.mock("./custom-campaigns-section",()=>({default:()=>null}));
vi.mock("./email-tabs",()=>({useEmailTab:()=>["automations",()=>{}],EmailTabs:()=>null}));
vi.mock("./birthday-fallback",()=>({BirthdayFallback:()=>null}));
import Page from "./page";
let rules:AutomaticEmailRule[], writes:number, failed:boolean;
beforeEach(()=>{
 writes=0;failed=false;
 rules=[{id:"11111111-1111-4111-8111-111111111111",version:1,archivedAt:null,ruleType:"mortgage_renewal",name:"Hypothèque QA",status:"draft",executionMode:"approval",defaultBroker:"france",subjectTemplate:"Objet QA",bodyTemplate:"Bonjour {{firstName}}",sendHour:9,sendMinute:0,timezone:"America/Toronto",triggerConfig:{leadMonths:6},createdAt:"",updatedAt:""}];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==="/api/automatic-emails/rules") return Response.json({data:{rules:structuredClone(rules),deliveries:[],locked:true,runnerAvailable:false}});
  if(url==="/api/google-calendar/connections") return Response.json({connections:[]});
  if(url.startsWith("/api/automatic-emails/occurrences?"))return Response.json({data:{summary:{today:0,tomorrow:0,nextSevenDays:0},rules:[],occurrences:[]}});
  if(url===`/api/automatic-emails/rules/${rules[0].id}` && ["PATCH","DELETE"].includes(init?.method??"")){
   writes++; const body=JSON.parse(String(init?.body));
   if(failed || body.version!==rules[0].version)return Response.json({error:"Conflit QA"},{status:409});
   rules[0]=init?.method==="DELETE"?{...rules[0],archivedAt:"2026-11-27",status:"paused"}:body.action==="restore"?{...rules[0],archivedAt:null,status:"paused"}:{...rules[0],...body};
   rules[0].version!++;return Response.json({data:structuredClone(rules[0])});
  }
  throw Error(`Unexpected network or send forbidden: ${url}`);
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("saves name, subject, message, delay and sender; fresh mount keeps changes",async()=>{
 render(<Page/>);fireEvent.click(await screen.findByRole("button",{name:"MODIFIER"}));
 fireEvent.change(screen.getByLabelText("Nom"),{target:{value:"Suivi personnalisé QA"}});
 fireEvent.change(screen.getByLabelText("Objet"),{target:{value:"Nouvel objet"}});
 fireEvent.change(screen.getByLabelText("Message"),{target:{value:"Nouveau contenu"}});
 fireEvent.change(screen.getByLabelText("Nombre de mois avant"),{target:{value:"3"}});
 fireEvent.change(screen.getByLabelText(/Expéditeur — Contact non attribué/),{target:{value:"sandrine"}});
 const save=screen.getByRole("button",{name:"ENREGISTRER"});fireEvent.click(save);fireEvent.click(save);
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(writes).toBe(1);
 expect(screen.getByRole("heading",{name:"Suivi personnalisé QA"})).toBeTruthy();
 cleanup();render(<Page/>);fireEvent.click(await screen.findByRole("button",{name:"MODIFIER"}));
 expect((screen.getByLabelText("Objet") as HTMLInputElement).value).toBe("Nouvel objet");
 expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Nouveau contenu");
 expect(rules[0]).toMatchObject({defaultBroker:"sandrine",triggerConfig:{leadMonths:3}});
});
it("keeps draft after server conflict",async()=>{
 render(<Page/>);fireEvent.click(await screen.findByRole("button",{name:"MODIFIER"}));
 fireEvent.change(screen.getByLabelText("Nom"),{target:{value:"Brouillon local"}});failed=true;
 fireEvent.click(screen.getByRole("button",{name:"ENREGISTRER"}));
 await screen.findAllByText("Conflit QA");expect(screen.getByRole("dialog")).toBeTruthy();
 expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe("Brouillon local");
});
it("requires confirmation, cancels without write, archives and restores paused",async()=>{
 render(<Page/>);fireEvent.click(await screen.findByRole("button",{name:"SUPPRIMER"}));
 expect(writes).toBe(0);fireEvent.click(screen.getByRole("button",{name:"ANNULER"}));expect(writes).toBe(0);
 fireEvent.click(screen.getByRole("button",{name:"SUPPRIMER"}));
 const button=within(screen.getByRole("dialog")).getByRole("button",{name:"SUPPRIMER"});fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(writes).toBe(1);
 expect(screen.queryByRole("heading",{name:"Hypothèque QA"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/COMMUNICATIONS SUPPRIMÉES/}));fireEvent.click(screen.getByRole("button",{name:"RESTAURER"}));
 await screen.findByRole("button",{name:"MODIFIER"});expect(rules[0]).toMatchObject({archivedAt:null,status:"paused",triggerConfig:{leadMonths:6}});
});
