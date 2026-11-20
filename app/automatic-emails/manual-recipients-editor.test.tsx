// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ManualRecipientsEditor from "./manual-recipients-editor";
import type { CampaignManualRecipient } from "../lib/automatic-emails/manual-recipients";
import type { CustomEmailCampaignDraft } from "../data/custom-email-campaign-types";
const campaign = { senderStrategy: "fixed_broker", fixedBroker: "france" } as CustomEmailCampaignDraft;
const steps=[{subjectTemplate:"Information",bodyTemplate:"Bonjour {{email}}",delayDaysAfterPrevious:0}];
function Harness() {
  const [recipients,setRecipients]=useState<CampaignManualRecipient[]>([]);
  const [text,setText]=useState("");
  return <ManualRecipientsEditor text={text} onTextChange={setText} recipients={recipients} onChange={(r,t)=>{setRecipients(r);setText(t);}} contacts={[]} campaign={campaign} steps={steps} disabled={false}/>;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("counts live input, keeps invalid text intact, and validates optionally without network",()=>{
  const network=vi.fn(()=>{throw Error("Network forbidden");}); vi.stubGlobal("fetch",network);
  render(<Harness/>);
  const input=screen.getByLabelText("Liste complète des adresses courriel") as HTMLTextAreaElement;
  const text="one@example.test,two@example.test;ONE@example.test;invalid";
  fireEvent.change(input,{target:{value:text}});
  expect(screen.getByRole("alert").textContent).toContain("invalid");
  expect(input.value).toBe(text);
  expect(screen.getByText(/Adresses manuelles : 2/)).toBeTruthy();
  expect(screen.getByRole("button",{name:"VALIDER LA LISTE (FACULTATIF)"}).hasAttribute("disabled")).toBe(true);
  fireEvent.change(input,{target:{value:"one@example.test;two@example.test;ONE@example.test"}});
  fireEvent.click(screen.getByRole("button",{name:"VALIDER LA LISTE (FACULTATIF)"}));
  expect(input.value).toBe("one@example.test\ntwo@example.test");
  expect(network).not.toHaveBeenCalled();
});
it("keeps 100 addresses in one textarea and one compact metadata editor",()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("Liste complète des adresses courriel"),{target:{value:Array.from({length:100},(_,i)=>`qa${i}@example.test`).join("\n")}});
  expect(screen.getByText(/Adresses manuelles : 100/)).toBeTruthy();
  expect(screen.getAllByRole("group",{name:"Informations du destinataire"})).toHaveLength(1);
  expect(screen.getByText("Informations facultatives — prénom, nom et courtier").closest("details")?.open).toBe(false);
});
